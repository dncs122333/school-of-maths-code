"""Tests for the burned-in recipient watermark on materials.

Contract under test (phase 1):
  - students receive a watermarked copy of PDFs and images;
  - teachers/admin receive the pristine original;
  - docx/pptx/txt pass through untouched (they cannot carry a mark);
  - a watermark failure must never make a material unreachable.
"""
import io
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _make_pdf(pages=2):
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    for i in range(pages):
        c.drawString(100, 700, f"Watermark fixture page {i + 1}")
        c.showPage()
    c.save()
    return buf.getvalue()


def _make_png(size=(600, 400)):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", size, (245, 245, 245)).save(buf, format="PNG")
    return buf.getvalue()


class TestMaterialWatermark:
    state = {}

    @pytest.fixture(scope="class", autouse=True)
    def setup(self):
        teacher = _login("teacher@vidya.com", "teacher123")
        student = _login("student@vidya.com", "student123")
        th = {"Authorization": f"Bearer {teacher['token']}"}
        sh = {"Authorization": f"Bearer {student['token']}"}

        r = requests.post(f"{API}/batches", headers=th,
                          json={"name": f"TEST WM Batch {uuid.uuid4().hex[:6]}", "class_level": "10"}, timeout=15)
        assert r.status_code == 200, r.text
        batch = r.json()
        r = requests.post(f"{API}/batches/join", headers=sh, json={"code": batch["code"]}, timeout=15)
        assert r.status_code == 200, r.text

        TestMaterialWatermark.state = {"th": th, "sh": sh, "batch": batch, "created": [],
                                       "pdf_bytes": _make_pdf(), "png_bytes": _make_png()}
        yield
        for rid in TestMaterialWatermark.state["created"]:
            requests.delete(f"{API}/resources/{rid}", headers=th, timeout=15)

    def _upload(self, filename, content, ct):
        s = self.state
        files = {"file": (filename, io.BytesIO(content), ct)}
        data = {"title": f"TEST WM {filename}", "batch_id": s["batch"]["id"],
                "class_level": "10", "subject": "Science", "chapter": "Electricity", "topic": ""}
        r = requests.post(f"{API}/resources", headers=s["th"], files=files, data=data, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        s["created"].append(d["id"])
        return d

    def _get(self, rid, headers):
        r = requests.get(f"{API}/resources/{rid}/file", headers=headers, timeout=60)
        assert r.status_code == 200, r.text
        return r

    def test_01_student_pdf_is_watermarked(self):
        s = self.state
        d = self._upload("wm_doc.pdf", s["pdf_bytes"], "application/pdf")
        got = self._get(d["id"], s["sh"]).content
        assert got != s["pdf_bytes"], "student PDF was served unmarked"
        assert got.startswith(b"%PDF"), "watermarked output is not a valid PDF"
        s["pdf_res"] = d

    def test_02_student_pdf_keeps_page_count_and_is_readable(self):
        from pypdf import PdfReader
        s = self.state
        got = self._get(s["pdf_res"]["id"], s["sh"]).content
        reader = PdfReader(io.BytesIO(got))
        assert len(reader.pages) == len(PdfReader(io.BytesIO(s["pdf_bytes"])).pages)
        # original text must still be extractable — the mark overlays, it does not replace
        assert "Watermark fixture page 1" in (reader.pages[0].extract_text() or "")

    def test_03_teacher_gets_clean_original_pdf(self):
        s = self.state
        got = self._get(s["pdf_res"]["id"], s["th"]).content
        assert got == s["pdf_bytes"], "teacher received a watermarked copy"

    def test_04_student_image_is_watermarked_and_valid(self):
        from PIL import Image
        s = self.state
        d = self._upload("wm_pic.png", s["png_bytes"], "image/png")
        got = self._get(d["id"], s["sh"]).content
        assert got != s["png_bytes"], "student image was served unmarked"
        img = Image.open(io.BytesIO(got))
        assert img.size == (600, 400), "watermarking changed the image dimensions"
        s["png_res"] = d

    def test_05_teacher_gets_clean_original_image(self):
        s = self.state
        got = self._get(s["png_res"]["id"], s["th"]).content
        assert got == s["png_bytes"], "teacher received a watermarked image"

    def test_06_docx_passes_through_unmarked_for_student(self):
        s = self.state
        raw = b"PK\x03\x04 not really a docx but must pass through"
        d = self._upload("wm_slides.docx", raw,
                         "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        r = self._get(d["id"], s["sh"])
        assert r.content == raw, "docx must not be altered"
        assert "attachment" in r.headers.get("content-disposition", "").lower()

    def test_07_txt_passes_through_unmarked_for_student(self):
        s = self.state
        raw = b"plain text material, nowhere to put a watermark"
        d = self._upload("wm_notes.txt", raw, "text/plain")
        assert self._get(d["id"], s["sh"]).content == raw

    def test_08_corrupt_pdf_still_downloads(self):
        """A watermark failure must degrade to the original, not a 500."""
        s = self.state
        raw = b"%PDF-1.4 truncated and unparseable"
        d = self._upload("wm_broken.pdf", raw, "application/pdf")
        r = requests.get(f"{API}/resources/{d['id']}/file", headers=s["sh"], timeout=60)
        assert r.status_code == 200, r.text
        assert r.content == raw

    def test_09_each_student_gets_their_own_mark(self):
        """Two different recipients must not receive byte-identical copies."""
        s = self.state
        email = f"TEST_wm_{uuid.uuid4().hex[:8]}@vidya.com"
        r = requests.post(f"{API}/auth/register", json={
            "name": "TEST WM Second Student", "email": email,
            "password": "pass1234", "role": "student"}, timeout=15)
        assert r.status_code == 200, r.text
        other = r.json()
        oh = {"Authorization": f"Bearer {other['token']}"}
        r = requests.post(f"{API}/batches/join", headers=oh, json={"code": s["batch"]["code"]}, timeout=15)
        assert r.status_code == 200, r.text

        mine = self._get(s["pdf_res"]["id"], s["sh"]).content
        theirs = self._get(s["pdf_res"]["id"], oh).content
        assert mine != theirs, "both students received an identical copy — the mark is not per-recipient"
