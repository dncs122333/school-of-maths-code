"""Join controls: approval queue, closed joining, seat limit."""
import os
import uuid

import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("frontend/.env") if os.path.exists("frontend/.env") else {}
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL", "")).rstrip("/") or "http://localhost:8001"
API = f"{BASE_URL}/api"


def _register(role, name):
    r = requests.post(f"{API}/auth/register", json={"name": name, "email": f"test_{role}_{uuid.uuid4().hex[:8]}@example.com",
                                                   "password": "password123", "role": role}, timeout=15)
    assert r.status_code == 200, r.text
    return {"id": r.json()["user"]["id"], "name": name, "headers": {"Authorization": f"Bearer {r.json()['token']}"}}


def _batch(teacher, **settings):
    r = requests.post(f"{API}/batches", json={"name": f"Join {uuid.uuid4().hex[:4]}", "class_level": "10", **settings},
                      headers=teacher["headers"], timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _join(student, code):
    return requests.post(f"{API}/batches/join", json={"code": code}, headers=student["headers"], timeout=15)


def _roster_ids(teacher, batch):
    r = requests.get(f"{API}/batches/{batch['id']}/students", headers=teacher["headers"], timeout=15)
    return {s["id"] for s in r.json()["students"]}


def test_approval_flow_keeps_leaked_code_from_enrolling():
    teacher = _register("teacher", "Approval Teacher")
    other_teacher = _register("teacher", "Other Teacher")
    batch = _batch(teacher, join_requires_approval=True)
    friend = _register("student", "Friend With Leaked Code")
    real = _register("student", "Real Student")

    for s in (friend, real):
        r = _join(s, batch["code"])
        assert r.status_code == 200, r.text
        assert r.json()["join_status"] == "pending"
    assert _roster_ids(teacher, batch) == set()
    # Pending student cannot see the batch or its content
    assert requests.get(f"{API}/batches", headers=friend["headers"], timeout=15).json() == []
    mine = requests.get(f"{API}/batches/join-requests/mine", headers=friend["headers"], timeout=15).json()
    assert [m["batch_id"] for m in mine] == [batch["id"]]

    reqs = requests.get(f"{API}/batches/{batch['id']}/join-requests", headers=teacher["headers"], timeout=15).json()
    by_name = {r["student_name"]: r for r in reqs}
    assert set(by_name) == {"Friend With Leaked Code", "Real Student"}
    assert requests.get(f"{API}/batches/{batch['id']}/join-requests", headers=other_teacher["headers"], timeout=15).status_code == 403

    assert requests.post(f"{API}/batches/{batch['id']}/join-requests/{by_name['Real Student']['id']}/approve",
                         headers=teacher["headers"], timeout=15).status_code == 200
    assert requests.post(f"{API}/batches/{batch['id']}/join-requests/{by_name['Friend With Leaked Code']['id']}/reject",
                         headers=teacher["headers"], timeout=15).status_code == 200

    assert _roster_ids(teacher, batch) == {real["id"]}
    # A declined student can't keep re-requesting
    assert _join(friend, batch["code"]).status_code == 403
    # Joining again after approval is a no-op success
    assert _join(real, batch["code"]).json()["join_status"] == "joined"


def test_approve_all_respects_seat_limit():
    teacher = _register("teacher", "Seat Teacher")
    batch = _batch(teacher, join_requires_approval=True, max_students=2)
    students = [_register("student", f"Seat S{i}") for i in range(3)]
    for s in students:
        assert _join(s, batch["code"]).json()["join_status"] == "pending"
    r = requests.post(f"{API}/batches/{batch['id']}/join-requests-approve-all", headers=teacher["headers"], timeout=15)
    assert r.status_code == 200, r.text
    assert r.json() == {"approved": 2, "remaining": 1}
    assert len(_roster_ids(teacher, batch)) == 2


def test_closed_joining_and_open_batch_seat_limit():
    teacher = _register("teacher", "Closed Teacher")
    batch = _batch(teacher, max_students=1)
    first, second = _register("student", "First In"), _register("student", "Second In")
    assert _join(first, batch["code"]).json()["join_status"] == "joined"
    assert _join(second, batch["code"]).status_code == 403  # full

    r = requests.put(f"{API}/batches/{batch['id']}", json={"joining_closed": True, "max_students": 0},
                     headers=teacher["headers"], timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["max_students"] is None
    assert _join(second, batch["code"]).status_code == 403  # closed

    requests.put(f"{API}/batches/{batch['id']}", json={"joining_closed": False}, headers=teacher["headers"], timeout=15)
    assert _join(second, batch["code"]).json()["join_status"] == "joined"
