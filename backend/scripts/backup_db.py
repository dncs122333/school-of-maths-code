"""Nightly database backup: every collection, gzipped into one .tar file, sent to the R2 backup bucket.

The free Atlas tier keeps no backups, so this is the only copy. Each collection is stored as
<name>.bson.gz, the same layout `mongodump --gzip` writes. Indexes aren't saved; the app rebuilds them at startup.

    python scripts/backup_db.py                  # upload to S3_BACKUP_BUCKET, drop backups older than 30 days
    python scripts/backup_db.py --to-dir /tmp/x  # write to a folder instead of uploading
"""
import argparse
import gzip
import os
import sys
import tarfile
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bson
import certifi
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
KEEP_DAYS = 30


def connect(url: str = None) -> MongoClient:
    return MongoClient(url or os.environ["MONGO_URL"], tlsCAFile=certifi.where())


def write_backup(db, archive_path: Path) -> dict:
    """Write the whole database to archive_path. Returns documents written per collection."""
    counts = {}
    with tempfile.TemporaryDirectory() as tmp, tarfile.open(archive_path, "w") as tar:
        for name in sorted(db.list_collection_names()):
            part = Path(tmp) / f"{name}.bson.gz"
            n = 0
            with gzip.open(part, "wb") as out:
                for doc in db[name].find({}, batch_size=500):
                    out.write(bson.encode(doc))
                    n += 1
            tar.add(part, arcname=part.name)
            part.unlink()
            counts[name] = n
    return counts


def prune_old(s3, bucket: str, now: datetime) -> list:
    """Delete backups older than KEEP_DAYS. Keeps the newest few regardless, in case the job
    has been failing for a month and old copies are all that's left."""
    objects = sorted(s3.list_objects_v2(Bucket=bucket).get("Contents", []), key=lambda o: o["LastModified"], reverse=True)
    removed = []
    for obj in objects[7:]:
        if obj["LastModified"] < now - timedelta(days=KEEP_DAYS):
            s3.delete_object(Bucket=bucket, Key=obj["Key"])
            removed.append(obj["Key"])
    return removed


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--to-dir", help="write the backup to this folder instead of uploading it")
    args = parser.parse_args()

    db = connect()[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)
    filename = f"{os.environ['DB_NAME']}-{now:%Y-%m-%d-%H%M}.tar"
    if args.to_dir:
        path = Path(args.to_dir) / filename
        counts = write_backup(db, path)
        print(f"Wrote {path}: {sum(counts.values())} documents in {len(counts)} collections.")
        return

    bucket = os.environ.get("S3_BACKUP_BUCKET")
    if not bucket:
        sys.exit("Set S3_BACKUP_BUCKET (and the S3_* variables), or use --to-dir.")
    import boto3
    s3 = boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT_URL"], aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
                      aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"], region_name=os.environ.get("S3_REGION", "auto"))
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / filename
        counts = write_backup(db, path)
        s3.upload_file(str(path), bucket, filename)
    removed = prune_old(s3, bucket, now)
    print(f"Uploaded {filename}: {sum(counts.values())} documents in {len(counts)} collections. Removed {len(removed)} old backups.")


if __name__ == "__main__":
    main()
