"""Unit tests for the join rate limiter: per-account cap on all attempts, per-IP cap on invalid codes only."""
import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402


def _run(coro):
    return asyncio.run(coro)


def test_classroom_on_one_ip_is_not_limited_by_successful_joins():
    ip = f"10.0.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"
    # 40 different students joining from the same school network, none failing
    for _ in range(40):
        assert _run(server._check_join_rate_limit(f"u-{uuid.uuid4().hex}", ip)) is True


def test_invalid_code_guessing_from_one_ip_is_limited():
    ip = f"10.1.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"
    for _ in range(server.JOIN_IP_MAX_FAILURES):
        assert _run(server._check_join_rate_limit(f"u-{uuid.uuid4().hex}", ip)) is True
        _run(server._record_failed_join(ip))
    # Fresh account, same IP: blocked because of the failures
    assert _run(server._check_join_rate_limit(f"u-{uuid.uuid4().hex}", ip)) is False


def test_single_account_is_capped():
    uid = f"u-{uuid.uuid4().hex}"
    for _ in range(server.JOIN_USER_MAX_ATTEMPTS):
        assert _run(server._check_join_rate_limit(uid, "unknown")) is True
    assert _run(server._check_join_rate_limit(uid, "unknown")) is False
