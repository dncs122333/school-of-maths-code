"""Staged story for the demo: which tests exist at each stage and who answers what correctly.

Mastery counts class tests only, so the climb comes from class tests 3 and 4 after Quadratics practice (DPPs).
Everything is deterministic so re-seeding gives the same numbers.
"""
import random

import roster

QUAD = "Solutions of quadratic equations by factorization and by quadratic formula"
B = roster.HERO_BATCH

TESTS = {
    "ct1": {"title": "Class Test 1 – Quadratics, Real Numbers & Polynomials", "kind": "test", "stage": 1,
            "days_ago": 35, "batch": B,
            "question_ids": ["DQ01", "DQ02", "DQ05", "DQ09", "DQ13", "DQ20", "DR01", "DR02", "DR03", "DP01", "DP02", "DP03"]},
    "ct2": {"title": "Class Test 2 – Quadratics, Linear Equations & Triangles", "kind": "test", "stage": 1,
            "days_ago": 28, "batch": B,
            "question_ids": ["DQ03", "DQ04", "DQ10", "DQ14", "DQ15", "DQ21", "DL01", "DL02", "DL03", "DT01", "DT02", "DT03"]},
    "dpp1": {"title": "Daily Practice – Quadratics (Factorisation)", "kind": "dpp", "stage": 2, "days_ago": 18, "batch": B,
             "question_ids": ["DQ01", "DQ03", "DQ05", "DQ09", "DQ11", "DQ12", "DQ16", "DQ19"]},
    "dpp2": {"title": "Daily Practice – Quadratics (Formula)", "kind": "dpp", "stage": 2, "days_ago": 15, "batch": B,
             "question_ids": ["DQ06", "DQ13", "DQ14", "DQ24", "DQ02", "DQ07", "DQ10", "DQ15"]},
    "dpp3": {"title": "Daily Practice – Quadratics (Mixed)", "kind": "dpp", "stage": 2, "days_ago": 12, "batch": B,
             "question_ids": ["DQ17", "DQ18", "DQ20", "DQ21", "DQ22", "DQ23", "DQ08", "DQ04"]},
    "ct3": {"title": "Class Test 3 – Quadratics, Trigonometry & Statistics", "kind": "test", "stage": 2,
            "days_ago": 10, "batch": B,
            "question_ids": ["DQ06", "DQ07", "DQ11", "DQ16", "DQ17", "DQ22", "DG01", "DG02", "DG03", "DS01", "DS02", "DS03"]},
    "dpp4": {"title": "Daily Practice – Quadratics (Challenge)", "kind": "dpp", "stage": 3, "days_ago": 6, "batch": B,
             "question_ids": ["DQ20", "DQ21", "DQ22", "DQ23", "DQ24", "DQ13", "DQ14", "DQ09"]},
    "ct4": {"title": "Class Test 4 – Quadratics Retest & Polynomials", "kind": "test", "stage": 3,
            "days_ago": 2, "batch": B,
            "question_ids": ["DQ08", "DQ12", "DQ18", "DQ19", "DQ23", "DQ24", "DR04", "DR05", "DR06", "DP04", "DP05", "DP06"]},
}

# Not taken by anyone: a scheduled future class test for the "create and schedule" shot
UPCOMING = {"title": "Class Test 5 – Linear Equations & Triangles", "days_ahead": 3, "batch": B,
            "question_ids": ["DL04", "DL05", "DL06", "DT04", "DT05", "DT06", "DD01", "DD02", "DD03", "DD04"]}

# Two classmates missed the latest class test and get a make-up
MAKEUP_TEST = "ct4"
_MISSED_CT4 = {roster._email("Tara Pillai"), roster._email("Arnav Rao")}

# Classmates who, like the hero, really improve at Quadratics after practice
_RISERS = {roster._email(n) for n in ["Ananya Gupta", "Kabir Singh", "Myra Kapoor", "Rohan Chatterjee",
                                       "Zara Khan", "Krish Saxena"]}


def absent(test_key):
    return _MISSED_CT4 if test_key == MAKEUP_TEST else set()


def _ability(email):
    return random.Random(email).uniform(0.62, 0.92)


def fraction(email, test_key, topic):
    """Target share of questions answered correctly for this student, test and topic."""
    t = TESTS[test_key]
    if email == roster.HERO_EMAIL:
        if topic != QUAD:
            return 0.85
        return {"ct1": 3 / 6, "ct2": 3 / 6, "ct3": 1.0, "ct4": 1.0,
                "dpp1": 4 / 8, "dpp2": 5 / 8, "dpp3": 7 / 8, "dpp4": 7 / 8}[test_key]
    a = _ability(email)
    if topic != QUAD:
        return a
    start = a - 0.4
    if t["stage"] == 1:
        return max(0.0, start)
    lift = (0.45 if email in _RISERS else 0.15) * (1 if t["stage"] == 2 else 1.25)
    return min(1.0, start + lift)


_ORDER = {"easy": 0, "medium": 1, "hard": 2}


def correct_ids(email, test_key, questions_by_id):
    """IDs answered correctly: per topic, the easiest round(fraction * n) questions."""
    by_topic = {}
    for qid in TESTS[test_key]["question_ids"]:
        by_topic.setdefault(questions_by_id[qid]["Topic"], []).append(qid)
    out = set()
    for topic, ids in by_topic.items():
        key = QUAD if topic == QUAD else topic
        n = round(fraction(email, test_key, key) * len(ids))
        ids = sorted(ids, key=lambda i: (_ORDER[questions_by_id[i]["Difficulty"]], i))
        out.update(ids[:n])
    return out
