"""Copy uploads from backend/local_storage/ into the S3/R2 bucket, under the same keys the database refers to.

Safe to run again: files already in the bucket are skipped. Nothing is deleted from disk.

    cd backend && .venv/bin/python scripts/migrate_to_r2.py --dry-run
    cd backend && .venv/bin/python scripts/migrate_to_r2.py
"""
import argparse
import mimetypes
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def local_files(root: Path):
    """(key, path, content type) for each upload. A `.ct` file beside an upload holds its content type."""
    for path in sorted(p for p in root.rglob("*") if p.is_file() and p.suffix != ".ct"):
        ct_file = path.parent / (path.name + ".ct")
        content_type = ct_file.read_text().strip() if ct_file.exists() else mimetypes.guess_type(path.name)[0]
        yield path.relative_to(root).as_posix(), path, content_type or "application/octet-stream"


def migrate(root: Path, s3, bucket: str, dry_run: bool = False) -> dict:
    from botocore.exceptions import ClientError
    counts = {"uploaded": 0, "already_there": 0}
    for key, path, content_type in local_files(root):
        try:
            s3.head_object(Bucket=bucket, Key=key)
            counts["already_there"] += 1
            continue
        except ClientError as e:
            if str(e.response.get("Error", {}).get("Code")) not in ("404", "NoSuchKey", "NotFound"):
                raise
        if not dry_run:
            s3.put_object(Bucket=bucket, Key=key, Body=path.read_bytes(), ContentType=content_type)
        counts["uploaded"] += 1
        print(f"{'would upload' if dry_run else 'uploaded'} {key}")
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="list what would be uploaded, change nothing")
    args = parser.parse_args()

    import storage
    if not storage._USE_S3:
        sys.exit("Set S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_BUCKET first.")
    counts = migrate(storage._LOCAL_STORE, storage._s3(), storage.S3_BUCKET, dry_run=args.dry_run)
    print(f"Done: {counts['uploaded']} {'to upload' if args.dry_run else 'uploaded'}, {counts['already_there']} already there.")


if __name__ == "__main__":
    main()
