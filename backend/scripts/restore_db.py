"""Restore a backup made by backup_db.py into a database.

Refuses to write into a database that already has data, unless --replace is given. To check a backup, restore
it into a scratch database. To use a restored database, point DB_NAME at it and restart: the app rebuilds indexes.

    python scripts/restore_db.py backup.tar --target-db som_restore_check
    python scripts/restore_db.py --from-bucket som_prod-2026-11-05-0200.tar --target-db som_restore_check
    python scripts/restore_db.py backup.tar --target-url mongodb+srv://... --target-db som_staging --replace
"""
import argparse
import gzip
import os
import sys
import tarfile
import tempfile
from pathlib import Path

import bson

sys.path.insert(0, str(Path(__file__).resolve().parent))
from backup_db import connect  # noqa: E402


def read_documents(stream):
    """Documents from a .bson.gz stream. decode_file_iter reads one at a time, so large collections fit in memory."""
    with gzip.open(stream, "rb") as raw:
        yield from bson.decode_file_iter(raw)


def restore_backup(archive_path: Path, db, replace: bool = False) -> dict:
    existing = db.list_collection_names()
    if existing and not replace:
        raise ValueError(f"{db.name} already has {len(existing)} collections. Use an empty database, or --replace.")
    counts = {}
    with tarfile.open(archive_path, "r") as tar:
        for member in tar.getmembers():
            if not member.name.endswith(".bson.gz"):
                continue
            name = member.name[: -len(".bson.gz")]
            if replace:
                db[name].drop()
            batch, n = [], 0
            for doc in read_documents(tar.extractfile(member)):
                batch.append(doc)
                if len(batch) == 500:
                    db[name].insert_many(batch, ordered=False)
                    n += len(batch)
                    batch = []
            if batch:
                db[name].insert_many(batch, ordered=False)
                n += len(batch)
            counts[name] = n
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("archive", nargs="?", help="path to a backup .tar")
    parser.add_argument("--from-bucket", help="name of a backup in S3_BACKUP_BUCKET, instead of a local file")
    parser.add_argument("--target-db", required=True)
    parser.add_argument("--target-url", help="connection string, if not the cluster in MONGO_URL")
    parser.add_argument("--replace", action="store_true", help="overwrite the collections in the backup")
    args = parser.parse_args()
    if bool(args.archive) == bool(args.from_bucket):
        sys.exit("Give either a local file or --from-bucket.")
    if args.replace and args.target_db == os.environ.get("DB_NAME") and not args.target_url:
        answer = input(f"This overwrites the live database {args.target_db}. Type its name to continue: ")
        if answer != args.target_db:
            sys.exit("Stopped; nothing changed.")

    db = connect(args.target_url)[args.target_db]
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(args.archive) if args.archive else Path(tmp) / args.from_bucket
        if args.from_bucket:
            import boto3
            s3 = boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT_URL"], aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
                              aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"], region_name=os.environ.get("S3_REGION", "auto"))
            s3.download_file(os.environ["S3_BACKUP_BUCKET"], args.from_bucket, str(path))
        try:
            counts = restore_backup(path, db, replace=args.replace)
        except ValueError as e:
            sys.exit(str(e))
    for name, n in sorted(counts.items()):
        print(f"{name}: {n}")
    print(f"Restored {sum(counts.values())} documents into {args.target_db}.")


if __name__ == "__main__":
    main()
