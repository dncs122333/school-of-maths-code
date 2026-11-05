"""Print how many class-test attempts still have time left. deploy.sh checks this so a restart never cuts
a student off mid-test. A failed lookup exits non-zero, and deploy.sh stops rather than guessing."""
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from backup_db import connect  # noqa: E402


def count_open_attempts(db, now: datetime) -> int:
    """Finished attempts are removed from test_starts, so what's left and still inside its time limit is either
    in progress or a closed tab. A closed tab also counts: this errs towards waiting."""
    starts = list(db.test_starts.find({"started_at": {"$gt": (now - timedelta(hours=6)).isoformat()}}, {"test_id": 1, "started_at": 1}))
    tests = {t["id"]: t for t in db.tests.find({"id": {"$in": list({s["test_id"] for s in starts})}, "kind": "test"},
                                               {"id": 1, "duration_minutes": 1})}
    open_count = 0
    for s in starts:
        test = tests.get(s["test_id"])
        if test and datetime.fromisoformat(s["started_at"]) + timedelta(minutes=test.get("duration_minutes") or 0) > now:
            open_count += 1
    return open_count


if __name__ == "__main__":
    print(count_open_attempts(connect()[os.environ["DB_NAME"]], datetime.now(timezone.utc)))
