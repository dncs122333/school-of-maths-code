"""Limits on login, sign-up and password-reset attempts.

Attempts are kept in MongoDB (`auth_limits`, cleared by a TTL index) so a limit holds across uvicorn workers
and restarts. The per-IP limits are generous on purpose: a classroom on one Wi-Fi network, or students behind
a mobile carrier's shared address, all arrive from a single IP.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from db import db

FIFTEEN_MINUTES = 15 * 60
ONE_HOUR = 60 * 60

LOGIN_EMAIL = ("login:email", 10, FIFTEEN_MINUTES)  # failed attempts per account
LOGIN_IP = ("login:ip", 100, FIFTEEN_MINUTES)  # failed attempts per address
REGISTER_IP = ("register:ip", 60, ONE_HOUR)  # sign-ups per address (a whole class can join at once)
FORGOT_EMAIL = ("forgot:email", 3, ONE_HOUR)  # reset emails per account
FORGOT_IP = ("forgot:ip", 30, ONE_HOUR)
RESET_IP = ("reset:ip", 20, ONE_HOUR)  # failed reset attempts per address

# The dev server and test suite connect from this machine and create hundreds of accounts; in production the
# address always comes from the proxy's forwarded header, so these never match a real client.
_LOCAL_ADDRESSES = {"127.0.0.1", "::1"}


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _applies(rule: tuple, value: str) -> bool:
    return not (rule[0].endswith(":ip") and value in _LOCAL_ADDRESSES)


async def is_over_limit(rule: tuple, value: str) -> bool:
    if not _applies(rule, value):
        return False
    scope, limit, window = rule
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=window)
    return await db.auth_limits.count_documents({"key": f"{scope}:{value}", "at": {"$gt": cutoff}}, limit=limit) >= limit


async def enforce(rule: tuple, value: str, message: str = "Too many attempts. Please wait a while and try again.") -> None:
    if await is_over_limit(rule, value):
        raise HTTPException(status_code=429, detail=message, headers={"Retry-After": str(rule[2])})


async def record(rule: tuple, value: str) -> None:
    if not _applies(rule, value):
        return
    scope, _, window = rule
    now = datetime.now(timezone.utc)
    await db.auth_limits.insert_one({"key": f"{scope}:{value}", "at": now, "expire_at": now + timedelta(seconds=window)})


async def clear(rule: tuple, value: str) -> None:
    await db.auth_limits.delete_many({"key": f"{rule[0]}:{value}"})
