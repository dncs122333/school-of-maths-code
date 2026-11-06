"""What counts as a class test, in one place.

Averages, ranks, mastery and parents' reports use only tests a teacher set for a class. A student's own tests,
practice, drafts and deleted tests never count. Tests of those kinds keep their submissions for history.
"""
from typing import Any, Dict, Iterable, List, Set

from lib.mastery import CLASS_TEST_KINDS, source_weight

# `student_id: None` also matches tests with no such field, which is how teachers' tests are stored
COUNTED_CLASS_TEST = {"kind": {"$in": list(CLASS_TEST_KINDS)}, "student_id": None,
                      "is_deleted": {"$ne": True}, "is_draft": {"$ne": True}}


async def counted_class_test_ids(db, test_ids: Iterable[str]) -> Set[str]:
    ids = list({t for t in test_ids if t})
    if not ids:
        return set()
    return {t["id"] async for t in db.tests.find({**COUNTED_CLASS_TEST, "id": {"$in": ids}}, {"_id": 0, "id": 1})}


async def drop_uncounted_class_tests(db, submissions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Removes class-test submissions whose test doesn't count. Practice submissions stay: they already
    count only as practice, and are reported apart."""
    claimed = [s for s in submissions if source_weight(s.get("kind")) > 0]
    counted = await counted_class_test_ids(db, (s.get("test_id") for s in claimed))
    return [s for s in submissions if source_weight(s.get("kind")) == 0 or s.get("test_id") in counted]


async def batch_class_tests(db, batch_id: str, teacher_id: str) -> List[Dict[str, Any]]:
    """The batch's live class tests, plus its teacher's "All Students" ones."""
    return [t async for t in db.tests.find(
        {**COUNTED_CLASS_TEST, "valid_until": {"$ne": None},
         "$or": [{"batch_id": batch_id}, {"batch_id": "all", "teacher_id": teacher_id}]},
        {"_id": 0, "questions": 0})]


def class_rank_score(scores: List[float], tests_assigned: int) -> Any:
    """A student's score for class rank: the average across class tests, with a missed test counting as 0.
    Excused tests aren't in `tests_assigned`. A student with no tests at all has no score, and no rank."""
    tests = max(tests_assigned, len(scores))
    return sum(scores) / tests if tests else None


def assign_ranks(rows: List[Dict[str, Any]], score_key: str) -> None:
    """Sets `rank` on rows already sorted best first. Ties share a rank; rows with no score have none."""
    prev_score, prev_rank = None, 0
    for pos, row in enumerate(rows, start=1):
        if row.get(score_key) is None:
            row["rank"] = None
            continue
        if row[score_key] != prev_score:
            prev_score, prev_rank = row[score_key], pos
        row["rank"] = prev_rank
