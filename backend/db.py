"""MongoDB Atlas client, availability guard, and shared API router."""
import os
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter
from motor.motor_asyncio import AsyncIOMotorClient


ATLAS_UNAVAILABLE_MESSAGE = "Database unavailable. Contact Dhruv immediately."
_STATUS_CACHE_SECONDS = 3
_mongo_url = (os.environ.get("MONGO_URL") or "").strip()
_parsed_mongo_url = urlparse(_mongo_url)


def _is_atlas_uri() -> bool:
    """Only an Atlas SRV URL is accepted; a local URI cannot become a fallback."""
    return (
        _parsed_mongo_url.scheme == "mongodb+srv"
        and bool(_parsed_mongo_url.hostname)
        and _parsed_mongo_url.hostname.endswith(".mongodb.net")
    )


if not _is_atlas_uri():
    raise RuntimeError("MONGO_URL must be a MongoDB Atlas SRV connection string")


client = AsyncIOMotorClient(
    _mongo_url,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
)
db = client[os.environ["DB_NAME"]]
api_router = APIRouter(prefix="/api")

_last_checked_at = 0.0
_last_available = False
_last_checked_iso = None


def mark_atlas_unavailable() -> None:
    """Record a database failure without exposing driver or network details."""
    global _last_checked_at, _last_available, _last_checked_iso
    _last_checked_at = time.monotonic()
    _last_available = False
    _last_checked_iso = datetime.now(timezone.utc).isoformat()


async def atlas_connection_status(force: bool = False) -> dict:
    """Ping Atlas with a short cache so every API route can fail closed safely."""
    global _last_checked_at, _last_available, _last_checked_iso
    now = time.monotonic()
    if not force and _last_checked_iso and now - _last_checked_at < _STATUS_CACHE_SECONDS:
        return {"available": _last_available, "checked_at": _last_checked_iso}

    try:
        await client.admin.command("ping")
        _last_available = True
    except Exception:
        _last_available = False
    _last_checked_at = now
    _last_checked_iso = datetime.now(timezone.utc).isoformat()
    return {"available": _last_available, "checked_at": _last_checked_iso}
