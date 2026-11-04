import os
import sys
from pathlib import Path

import certifi
import requests
from pymongo import MongoClient

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
API = os.environ.get("DEMO_API", "http://localhost:8011/api")
QUAD = "solutions of quadratic equations by factorization and by quadratic formula"


def demo_db():
    os.environ["DB_NAME"] = "som_demo"
    from backend_env import load_backend
    load_backend()
    return MongoClient(os.environ["MONGO_URL"], tlsCAFile=certifi.where())["som_demo"]


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def find_rows(obj, topic=QUAD):
    """Every dict in a JSON response whose 'topic' matches, wherever it sits."""
    out = []
    if isinstance(obj, dict):
        if str(obj.get("topic", "")).casefold() == topic:
            out.append(obj)
        for v in obj.values():
            out += find_rows(v, topic)
    elif isinstance(obj, list):
        for v in obj:
            out += find_rows(v, topic)
    return out
