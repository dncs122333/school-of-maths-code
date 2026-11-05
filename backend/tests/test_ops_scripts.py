"""Backup, restore, upload migration and the deploy check. These run the scripts directly against scratch data."""
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from botocore.exceptions import ClientError
from bson import ObjectId

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from backup_db import connect, prune_old, write_backup  # noqa: E402
from migrate_to_r2 import local_files, migrate  # noqa: E402
from open_attempts import count_open_attempts  # noqa: E402
from restore_db import restore_backup  # noqa: E402


@pytest.fixture
def scratch_dbs():
    client = connect()
    tag = uuid.uuid4().hex[:8]
    source, target = client[f"scratch_src_{tag}"], client[f"scratch_dst_{tag}"]
    yield source, target
    client.drop_database(source.name)
    client.drop_database(target.name)
    client.close()


def test_backup_then_restore_gives_back_identical_documents(scratch_dbs, tmp_path):
    source, target = scratch_dbs
    oid = ObjectId()
    when = datetime(2026, 11, 5, 10, 30, tzinfo=timezone.utc)
    source.users.insert_one({"_id": oid, "name": "आरव", "at": when, "scores": [1, 2.5, None]})
    source.tests.insert_many([{"id": str(i)} for i in range(1203)])  # more than one insert batch

    archive = tmp_path / "b.tar"
    assert write_backup(source, archive) == {"tests": 1203, "users": 1}
    assert restore_backup(archive, target) == {"tests": 1203, "users": 1}

    user = target.users.find_one({"_id": oid})
    assert user["name"] == "आरव" and user["scores"] == [1, 2.5, None]
    assert user["at"].replace(tzinfo=timezone.utc) == when
    assert target.tests.count_documents({}) == 1203


def test_restore_refuses_a_database_with_data_unless_told(scratch_dbs, tmp_path):
    source, target = scratch_dbs
    source.users.insert_one({"name": "backup copy"})
    archive = tmp_path / "b.tar"
    write_backup(source, archive)
    target.users.insert_one({"name": "live"})
    with pytest.raises(ValueError):
        restore_backup(archive, target)
    assert target.users.find_one()["name"] == "live"
    restore_backup(archive, target, replace=True)
    assert [u["name"] for u in target.users.find()] == ["backup copy"]


class FakeBucket:
    def __init__(self, keys=()):
        self.objects = {k: {"LastModified": None} for k in keys}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")

    def put_object(self, Bucket, Key, Body, ContentType):
        self.objects[Key] = {"Body": Body, "ContentType": ContentType}

    def list_objects_v2(self, Bucket):
        return {"Contents": [{"Key": k, **v} for k, v in self.objects.items()]}

    def delete_object(self, Bucket, Key):
        del self.objects[Key]


def test_prune_keeps_recent_backups_and_at_least_seven():
    now = datetime(2026, 11, 5, tzinfo=timezone.utc)
    s3 = FakeBucket()
    for age in (1, 2, 3, 4, 5, 6, 7, 40, 41):
        s3.objects[f"{age}d"] = {"LastModified": now - timedelta(days=age)}
    assert sorted(prune_old(s3, "b", now)) == ["40d", "41d"]

    s3 = FakeBucket()
    for age in range(40, 48):  # job has been failing for weeks: keep the newest seven
        s3.objects[f"{age}d"] = {"LastModified": now - timedelta(days=age)}
    assert prune_old(s3, "b", now) == ["47d"]


def test_migration_uses_the_same_keys_and_content_types_and_can_be_rerun(tmp_path):
    folder = tmp_path / "som" / "resources" / "abc"
    folder.mkdir(parents=True)
    (folder / "a.pdf").write_bytes(b"%PDF")
    (folder / "a.pdf.ct").write_text("application/pdf")
    (folder / "b.png").write_bytes(b"png")
    assert [f[0] for f in local_files(tmp_path)] == ["som/resources/abc/a.pdf", "som/resources/abc/b.png"]

    s3 = FakeBucket(["som/resources/abc/b.png"])
    assert migrate(tmp_path, s3, "bucket", dry_run=True) == {"uploaded": 1, "already_there": 1}
    assert "som/resources/abc/a.pdf" not in s3.objects

    assert migrate(tmp_path, s3, "bucket") == {"uploaded": 1, "already_there": 1}
    assert s3.objects["som/resources/abc/a.pdf"]["ContentType"] == "application/pdf"
    assert migrate(tmp_path, s3, "bucket") == {"uploaded": 0, "already_there": 2}


def test_open_attempts_counts_only_class_tests_with_time_left(scratch_dbs):
    db, _ = scratch_dbs
    now = datetime(2026, 11, 5, 10, 0, tzinfo=timezone.utc)
    ago = lambda minutes: (now - timedelta(minutes=minutes)).isoformat()  # noqa: E731
    db.tests.insert_many([{"id": "class", "kind": "test", "duration_minutes": 30},
                          {"id": "practice", "kind": "dpp", "duration_minutes": 30}])
    db.test_starts.insert_many([{"test_id": "class", "student_id": "running", "started_at": ago(10)},
                                {"test_id": "class", "student_id": "time up", "started_at": ago(40)},
                                {"test_id": "practice", "student_id": "practice", "started_at": ago(10)}])
    assert count_open_attempts(db, now) == 1
    db.test_starts.delete_many({"student_id": "running"})
    assert count_open_attempts(db, now) == 0


def test_mailer_sends_the_link_through_brevo_and_hides_failures(monkeypatch, caplog):
    import asyncio
    import mailer
    sent = {}

    def fake_post(url, headers, json, timeout):
        sent.update(url=url, headers=headers, json=json)
        return SimpleNamespace(raise_for_status=lambda: None)

    monkeypatch.setattr(mailer, "BREVO_API_KEY", "key")
    monkeypatch.setattr(mailer, "EMAIL_FROM", "noreply@example.com")
    monkeypatch.setattr(mailer, "APP_URL", "https://app.example.com")
    monkeypatch.setattr(mailer.requests, "post", fake_post)
    asyncio.run(mailer.send_password_reset("s@example.com", "<Aarav>", "tok123"))
    assert sent["url"] == mailer.BREVO_SEND_URL and sent["headers"]["api-key"] == "key"
    assert sent["json"]["to"][0]["email"] == "s@example.com"
    assert "https://app.example.com/reset-password?token=tok123" in sent["json"]["textContent"]
    assert "&lt;Aarav&gt;" in sent["json"]["htmlContent"]

    def failing_post(*a, **k):
        raise RuntimeError("secret detail https://api.example/?key=abc")

    monkeypatch.setattr(mailer.requests, "post", failing_post)
    asyncio.run(mailer.send_password_reset("s@example.com", "A", "tok123"))  # doesn't raise
    assert "secret detail" not in caplog.text and "RuntimeError" in caplog.text
