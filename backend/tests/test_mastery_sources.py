"""Unit tests: mastery and averages count class tests only; practice is reported apart and can be re-weighted later."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.mastery import (MASTERY_SOURCE_WEIGHTS, PRACTICE_SOURCE_WEIGHTS, compute_topic_mastery,  # noqa: E402
                         source_weight)
from reports.aggregations import compute_term_report, compute_weekly_digest  # noqa: E402

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)


def _attempt(kind, correct, sub_id, topic="Polynomials Basics"):
    return {"subject": "Maths", "chapter": "Polynomials", "topic": topic, "difficulty": "medium",
            "is_correct": correct, "answered": True, "created_at": NOW.isoformat(), "submission_id": sub_id,
            "kind": kind}


def _topic(rows, topic="Polynomials Basics"):
    return next((r for r in rows if r["topic"] == topic and r.get("attempts")), None)


def test_source_weight_rules():
    assert source_weight("test") == 1.0 and source_weight("class_test") == 1.0
    assert source_weight("dpp") == 0.0 and source_weight("diagnostic") == 0.0
    assert source_weight("something_new") == 0.0  # unknown kinds never leak into mastery
    assert source_weight(None) == 1.0             # callers that don't track kind keep working
    assert source_weight("dpp", PRACTICE_SOURCE_WEIGHTS) == 1.0


def test_practice_only_gives_no_mastery_but_practice_view():
    attempts = [_attempt("dpp", True, "p1"), _attempt("dpp", True, "p2"), _attempt("diagnostic", False, "d1")]
    assert _topic(compute_topic_mastery(attempts, now=NOW, include_unattempted=False)) is None
    practice = _topic(compute_topic_mastery(attempts, now=NOW, include_unattempted=False,
                                            source_weights=PRACTICE_SOURCE_WEIGHTS))
    assert practice["attempts"] == 3 and practice["score"] == 67


def test_practice_retakes_do_not_confirm_a_topic():
    # Two practice retakes used to count as two sessions and confirm "weak"; now they are ignored entirely
    attempts = [_attempt("dpp", False, "p1"), _attempt("dpp", False, "p2"), _attempt("test", False, "t1")]
    row = _topic(compute_topic_mastery(attempts, now=NOW, include_unattempted=False))
    assert row["attempts"] == 1 and row["sessions"] == 1 and row["is_confirmed_weak"] is False


def test_class_tests_drive_mastery_and_practice_weight_can_be_raised_later():
    attempts = [_attempt("test", True, "t1"), _attempt("dpp", False, "p1")]
    assert _topic(compute_topic_mastery(attempts, now=NOW, include_unattempted=False))["score"] == 100
    # Future switch: practice as half-weight evidence — config only, no code change
    weights = {**MASTERY_SOURCE_WEIGHTS, "dpp": 0.5}
    row = _topic(compute_topic_mastery(attempts, now=NOW, include_unattempted=False, source_weights=weights))
    assert row["attempts"] == 2 and row["score"] == 67  # 1.0 correct / (1.0 + 0.5)


def _sub(kind, sid, correct, total, when=NOW):
    results = [{"subject": "Maths", "chapter": "Polynomials", "topic": "Polynomials Basics", "difficulty": "medium",
                "is_correct": i < correct, "answered": True} for i in range(total)]
    return {"id": f"{kind}-{sid}-{correct}-{when.isoformat()}", "student_id": sid, "kind": kind, "results": results,
            "score": round(correct / total * 100), "correct": correct, "total": total, "created_at": when.isoformat()}


def test_term_report_averages_class_tests_only():
    batch = {"id": "b1", "class_level": "9", "student_ids": ["s1"]}
    subs = [_sub("test", "s1", 2, 4), _sub("dpp", "s1", 4, 4), _sub("dpp", "s1", 4, 4)]
    rep = compute_term_report("b1", batch, subs, {"s1": "Asha"}, subject="Maths")
    row = rep["student_summaries"][0]
    assert row["tests_taken"] == 1 and row["avg_score"] == 50.0  # practice 100%s ignored
    assert rep["total_submissions"] == 3                         # activity still counts everything


def test_weekly_digest_averages_class_tests_only_but_counts_all():
    batch = {"id": "b1", "class_level": "9", "student_ids": ["s1", "s2"]}
    recent = [_sub("test", "s1", 1, 4, NOW - timedelta(days=1)), _sub("dpp", "s2", 4, 4, NOW - timedelta(days=1))]
    digest = compute_weekly_digest("b1", batch, recent, [], now=NOW)
    assert digest["recent_avg"] == 25.0
    assert digest["active_students"] == 2
