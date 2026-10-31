"""Object storage for uploaded files: S3-compatible bucket (Cloudflare R2) or local disk.

The S3 backend is used when S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_BUCKET
are all set; otherwise files live under backend/local_storage/ with a `.ct` sidecar holding the
content type. Both backends raise FileNotFoundError for a missing object.
"""
import mimetypes

from config import (logger, ROOT_DIR, S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
                    S3_BUCKET, S3_REGION)

_LOCAL_STORE = ROOT_DIR / "local_storage"
_USE_S3 = all((S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET))

_client = None


def _s3():
    global _client
    if _client is None:
        import boto3
        _client = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT_URL,
            aws_access_key_id=S3_ACCESS_KEY_ID,
            aws_secret_access_key=S3_SECRET_ACCESS_KEY,
            region_name=S3_REGION,
        )
    return _client


def _is_missing(err) -> bool:
    code = str(err.response.get("Error", {}).get("Code", ""))
    return code in ("NoSuchKey", "404", "NotFound")


def init_storage(force: bool = False):
    """Prepares the storage backend. With S3, checks the bucket is reachable so bad credentials
    show up in the startup log rather than on the first upload."""
    global _client
    if not _USE_S3:
        _LOCAL_STORE.mkdir(parents=True, exist_ok=True)
        return "local"
    if force:
        _client = None
    _s3().head_bucket(Bucket=S3_BUCKET)
    logger.info(f"Object storage: S3 bucket '{S3_BUCKET}' at {S3_ENDPOINT_URL}")
    return "s3"


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if not _USE_S3:
        dest = _LOCAL_STORE / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        # Store content-type alongside the file
        (dest.parent / (dest.name + ".ct")).write_text(content_type)
        return {"path": path}
    _s3().put_object(Bucket=S3_BUCKET, Key=path, Body=data, ContentType=content_type)
    return {"path": path}


def get_object(path: str):
    if not _USE_S3:
        dest = _LOCAL_STORE / path
        if not dest.exists():
            raise FileNotFoundError(f"Local storage: {path} not found")
        ct_file = dest.parent / (dest.name + ".ct")
        ct = ct_file.read_text() if ct_file.exists() else mimetypes.guess_type(str(dest))[0] or "application/octet-stream"
        return dest.read_bytes(), ct
    from botocore.exceptions import ClientError
    try:
        resp = _s3().get_object(Bucket=S3_BUCKET, Key=path)
    except ClientError as e:
        if _is_missing(e):
            raise FileNotFoundError(f"Object storage: {path} not found") from e
        raise
    return resp["Body"].read(), resp.get("ContentType") or "application/octet-stream"


def delete_object(path: str) -> None:
    """Remove a stored object. Raises on failure — callers decide how soft to be."""
    if not _USE_S3:
        dest = _LOCAL_STORE / path
        dest.unlink(missing_ok=True)
        (dest.parent / (dest.name + ".ct")).unlink(missing_ok=True)
        return
    _s3().delete_object(Bucket=S3_BUCKET, Key=path)
