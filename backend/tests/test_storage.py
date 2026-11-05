"""Unit tests for backend/storage.py: local-disk backend and S3-compatible (Cloudflare R2) backend."""
import io
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import storage  # noqa: E402


@pytest.fixture
def local_store(monkeypatch, tmp_path):
    monkeypatch.setattr(storage, "_USE_S3", False)
    monkeypatch.setattr(storage, "_LOCAL_STORE", tmp_path)
    return tmp_path


@pytest.fixture
def s3_stub(monkeypatch):
    import boto3
    from botocore.stub import Stubber

    client = boto3.client(
        "s3",
        endpoint_url="https://example-account.r2.cloudflarestorage.com",
        aws_access_key_id="test",
        aws_secret_access_key="test",
        region_name="auto",
    )
    monkeypatch.setattr(storage, "_USE_S3", True)
    monkeypatch.setattr(storage, "S3_BUCKET", "test-bucket")
    monkeypatch.setattr(storage, "_client", client)
    with Stubber(client) as stub:
        yield stub
        stub.assert_no_pending_responses()


def test_local_round_trip(local_store):
    assert storage.init_storage() == "local"
    assert storage.put_object("som/notes/a.pdf", b"%PDF-1.4 data", "application/pdf") == {"path": "som/notes/a.pdf"}
    assert (local_store / "som/notes/a.pdf").read_bytes() == b"%PDF-1.4 data"

    data, ct = storage.get_object("som/notes/a.pdf")
    assert data == b"%PDF-1.4 data"
    assert ct == "application/pdf"

    storage.delete_object("som/notes/a.pdf")
    with pytest.raises(FileNotFoundError):
        storage.get_object("som/notes/a.pdf")
    # Deleting an already-missing object is a no-op locally
    storage.delete_object("som/notes/a.pdf")


def test_s3_put_get_delete(s3_stub):
    s3_stub.add_response(
        "put_object", {},
        {"Bucket": "test-bucket", "Key": "som/img.png", "Body": b"png-bytes", "ContentType": "image/png"},
    )
    assert storage.put_object("som/img.png", b"png-bytes", "image/png") == {"path": "som/img.png"}

    from botocore.response import StreamingBody
    s3_stub.add_response(
        "get_object",
        {"Body": StreamingBody(io.BytesIO(b"png-bytes"), len(b"png-bytes")), "ContentType": "image/png"},
        {"Bucket": "test-bucket", "Key": "som/img.png"},
    )
    assert storage.get_object("som/img.png") == (b"png-bytes", "image/png")

    s3_stub.add_response("delete_object", {}, {"Bucket": "test-bucket", "Key": "som/img.png"})
    storage.delete_object("som/img.png")


def test_s3_missing_object_raises_file_not_found(s3_stub):
    s3_stub.add_client_error("get_object", service_error_code="NoSuchKey", http_status_code=404,
                             expected_params={"Bucket": "test-bucket", "Key": "som/gone.pdf"})
    with pytest.raises(FileNotFoundError):
        storage.get_object("som/gone.pdf")


def test_s3_other_errors_propagate(s3_stub):
    from botocore.exceptions import ClientError

    s3_stub.add_client_error("get_object", service_error_code="AccessDenied", http_status_code=403)
    with pytest.raises(ClientError):
        storage.get_object("som/secret.pdf")


def test_s3_init_checks_bucket(s3_stub):
    s3_stub.add_response("head_bucket", {}, {"Bucket": "test-bucket"})
    assert storage.init_storage() == "s3"


@pytest.mark.parametrize("key", ["../server.py", "../../.env", "a/../../outside.txt", "/etc/passwd", ""])
def test_local_store_rejects_paths_outside_the_store(local_store, key):
    (local_store.parent / "outside.txt").write_text("secret")
    with pytest.raises(FileNotFoundError):
        storage.get_object(key)
    with pytest.raises(FileNotFoundError):
        storage.put_object(key, b"x", "text/plain")
    with pytest.raises(FileNotFoundError):
        storage.delete_object(key)
    assert (local_store.parent / "outside.txt").read_text() == "secret"
