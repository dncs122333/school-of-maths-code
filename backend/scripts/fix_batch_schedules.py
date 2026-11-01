"""Find (and optionally fix) batches whose monthly schedule doesn't add up to the annual fee.

These were created by an old Create/Edit Batch form bug that froze the monthly fee after the first
keystroke. Which number the teacher meant can't be known, so nothing changes without --apply and --keep.

Usage (from backend/):
  .venv/bin/python scripts/fix_batch_schedules.py                          # report only
  .venv/bin/python scripts/fix_batch_schedules.py --apply --keep annual     # spread the annual fee over the months
  .venv/bin/python scripts/fix_batch_schedules.py --apply --keep schedule   # make the annual fee = sum of months
  add --batch-id <id> to limit to one batch

Students on the batch fee are recomputed from the batch on every roster load, so only the batch document
is changed. Students with a custom fee keep their own schedule.
"""
import argparse
import os
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import certifi
from dotenv import load_dotenv
from pymongo import MongoClient


def to_paise(amount) -> int:
    return int((Decimal(str(amount or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) * 100)


def from_paise(paise: int) -> float:
    return float(Decimal(paise) / Decimal(100))


def spread(total_paise: int, schedule: list) -> list:
    """Even split across the batch's existing months, remainder on the last (same rule as the server)."""
    n = len(schedule)
    base, rem = divmod(total_paise, n)
    return [{**item, "amount": from_paise(base + (rem if i == n - 1 else 0))} for i, item in enumerate(schedule)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write changes (default: report only)")
    parser.add_argument("--keep", choices=["annual", "schedule"], help="which number is correct; required with --apply")
    parser.add_argument("--batch-id", help="only this batch")
    args = parser.parse_args()
    if args.apply and not args.keep:
        parser.error("--apply needs --keep annual or --keep schedule")

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    db = MongoClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())[os.environ["DB_NAME"]]

    query = {"archived_at": {"$exists": False}}
    if args.batch_id:
        query["id"] = args.batch_id
    mismatched = []
    for b in db.batches.find(query, {"_id": 0, "id": 1, "name": 1, "teacher_name": 1, "fee_amount": 1, "fee_schedule": 1}):
        schedule = b.get("fee_schedule") or []
        if schedule and sum(to_paise(it.get("amount")) for it in schedule) != to_paise(b.get("fee_amount")):
            mismatched.append(b)

    if not mismatched:
        print("No batches with a schedule that differs from the annual fee.")
        return 0

    for b in mismatched:
        schedule = b["fee_schedule"]
        sched_paise = sum(to_paise(it.get("amount")) for it in schedule)
        annual_paise = to_paise(b.get("fee_amount"))
        print(f"- {b['name']} (teacher: {b.get('teacher_name')}, id: {b['id']}): "
              f"annual ₹{from_paise(annual_paise):,.2f} vs months total ₹{from_paise(sched_paise):,.2f} "
              f"({len(schedule)} months)")
        if not args.apply:
            continue
        if args.keep == "annual":
            new_schedule, new_total = spread(annual_paise, schedule), annual_paise
        else:
            new_schedule, new_total = schedule, sched_paise
        db.batches.update_one({"id": b["id"]}, {"$set": {
            "fee_schedule": new_schedule,
            "fee_amount": from_paise(new_total),
            "monthly_fee": from_paise(int(round(new_total / len(new_schedule)))),
        }})
        print(f"  fixed: annual ₹{from_paise(new_total):,.2f}, {len(new_schedule)} months")

    if not args.apply:
        print(f"\n{len(mismatched)} batch(es) found. Re-run with --apply --keep annual|schedule to fix.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
