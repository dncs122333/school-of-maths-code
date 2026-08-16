"""Tests for /api/resources — Materials feature (upload, list, file access, folders)."""
import io
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# a tiny valid PNG (1x1 red pixel)
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63f8cfc0f00f000501010045a1cb6a0000000049454e44ae426082"
)
# minimal PDF
PDF_BYTES = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000100 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF"
)


class TestResources:
    state = {}

    @pytest.fixture(scope="class", autouse=True)
    def setup(self):
        teacher = _login("teacher@vidya.com", "teacher123")
        student = _login("student@vidya.com", "student123")
        # outsider student (fresh account not in the batch)
        outsider_email = f"TEST_out_{uuid.uuid4().hex[:8]}@vidya.com"
        r = requests.post(f"{API}/auth/register", json={
            "name": "TEST Outsider", "email": outsider_email,
            "password": "pass1234", "role": "student"}, timeout=15)
        assert r.status_code == 200, r.text
        outsider = r.json()

        th = {"Authorization": f"Bearer {teacher['token']}"}
        sh = {"Authorization": f"Bearer {student['token']}"}
        oh = {"Authorization": f"Bearer {outsider['token']}"}

        # locate the Materials Batch that teacher owns
        r = requests.get(f"{API}/batches", headers=th, timeout=15)
        assert r.status_code == 200
        batches = r.json()
        mb = next((b for b in batches if b["name"] == "Materials Batch"), None)
        assert mb, f"'Materials Batch' not found; got {[b['name'] for b in batches]}"

        TestResources.state = {
            "teacher": teacher, "student": student, "outsider": outsider,
            "th": th, "sh": sh, "oh": oh, "batch": mb, "created": [],
        }
        yield
        # cleanup created resources
        for rid in TestResources.state["created"]:
            requests.delete(f"{API}/resources/{rid}", headers=th, timeout=15)

    def _upload(self, filename, content, ct, chapter="Electricity"):
        s = self.state
        files = {"file": (filename, io.BytesIO(content), ct)}
        data = {"title": f"TEST {filename}", "batch_id": s["batch"]["id"],
                "class_level": "10", "subject": "Science",
                "chapter": chapter, "topic": ""}
        r = requests.post(f"{API}/resources", headers=s["th"], files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        s["created"].append(d["id"])
        return d

    def test_01_teacher_uploads_image(self):
        d = self._upload("test_pixel.png", PNG_BYTES, "image/png", chapter="Electricity")
        assert d["content_type"].startswith("image/")
        assert d["size"] == len(PNG_BYTES)
        assert d["chapter"] == "Electricity"
        assert "_id" not in d
        self.state["img"] = d

    def test_02_teacher_uploads_pdf_no_chapter(self):
        # No chapter → should end up in General folder in UI
        d = self._upload("test_doc.pdf", PDF_BYTES, "application/pdf", chapter="")
        assert d["content_type"] == "application/pdf"
        assert d["chapter"] == ""
        self.state["pdf"] = d

    def test_03_list_by_teacher_includes_uploads(self):
        s = self.state
        r = requests.get(f"{API}/resources", headers=s["th"], timeout=15)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert s["img"]["id"] in ids and s["pdf"]["id"] in ids

    def test_04_list_by_student_in_batch_includes_uploads(self):
        s = self.state
        r = requests.get(f"{API}/resources", headers=s["sh"], timeout=15)
        assert r.status_code == 200
        items = r.json()
        ids = [x["id"] for x in items]
        assert s["img"]["id"] in ids and s["pdf"]["id"] in ids
        for x in items:
            assert "_id" not in x

    def test_05_outsider_sees_empty_or_no_batch_items(self):
        s = self.state
        r = requests.get(f"{API}/resources", headers=s["oh"], timeout=15)
        assert r.status_code == 200
        for x in r.json():
            # outsider must not see materials from Materials Batch
            assert x["batch_id"] != s["batch"]["id"], f"leak: {x}"

    def test_06_download_with_bearer_returns_bytes(self):
        s = self.state
        rid = s["img"]["id"]
        r = requests.get(f"{API}/resources/{rid}/file", headers=s["sh"], timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")
        assert r.content == PNG_BYTES

    def test_07_download_pdf_with_bearer(self):
        s = self.state
        rid = s["pdf"]["id"]
        r = requests.get(f"{API}/resources/{rid}/file", headers=s["sh"], timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "") == "application/pdf"
        assert r.content == PDF_BYTES

    def test_08_download_without_token_401(self):
        s = self.state
        r = requests.get(f"{API}/resources/{s['img']['id']}/file", timeout=15)
        assert r.status_code == 401

    def test_09_download_with_query_auth_still_works(self):
        s = self.state
        tok = s["student"]["token"]
        r = requests.get(f"{API}/resources/{s['img']['id']}/file?auth={tok}", timeout=15)
        assert r.status_code == 200

    def test_10_outsider_download_forbidden(self):
        s = self.state
        r = requests.get(f"{API}/resources/{s['img']['id']}/file", headers=s["oh"], timeout=15)
        assert r.status_code == 403

    def test_11_student_cannot_delete(self):
        s = self.state
        r = requests.delete(f"{API}/resources/{s['img']['id']}", headers=s["sh"], timeout=15)
        assert r.status_code == 403

    def test_12_teacher_can_delete_and_removed_from_list(self):
        s = self.state
        # upload a throwaway
        d = self._upload("test_throwaway.png", PNG_BYTES, "image/png")
        r = requests.delete(f"{API}/resources/{d['id']}", headers=s["th"], timeout=15)
        assert r.status_code == 200
        # verify no longer listed
        r = requests.get(f"{API}/resources", headers=s["th"], timeout=15)
        assert d["id"] not in [x["id"] for x in r.json()]
        # file 404 after soft-delete
        r = requests.get(f"{API}/resources/{d['id']}/file", headers=s["sh"], timeout=15)
        assert r.status_code == 404
