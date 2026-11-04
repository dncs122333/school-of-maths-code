"""The staged answer plan, run through the app's own mastery engine, must tell the Weak -> Strong story."""
import csv
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "backend"))
from curriculum import normalize_taxonomy  # noqa: E402
from lib.mastery import compute_topic_mastery  # noqa: E402

import hero  # noqa: E402
import roster  # noqa: E402

QUAD = "Solutions of quadratic equations by factorization and by quadratic formula"
NOW = datetime.now(timezone.utc)
QUESTIONS = {r["ID"]: r for r in csv.DictReader(open(HERE / "demo_questions.csv"))}


def attempts_for(email, stage):
    out = []
    for key, t in hero.TESTS.items():
        if t["stage"] > stage or t["batch"] != roster.HERO_BATCH:
            continue
        if email in hero.absent(key):
            continue
        correct = hero.correct_ids(email, key, QUESTIONS)
        when = (NOW - timedelta(days=t["days_ago"])).isoformat()
        for qid in t["question_ids"]:
            q = QUESTIONS[qid]
            _, subj, chap, top, tops = normalize_taxonomy("10", q["Subject"], q["Chapter"], q["Topic"])
            out.append({"subject": subj, "chapter": chap, "topic": top, "topics": tops,
                        "difficulty": q["Difficulty"], "is_correct": qid in correct, "answered": True,
                        "kind": t["kind"], "created_at": when, "submission_id": f"{email}:{key}",
                        "student_id": email})
    return out


def topic_score(attempts, topic=QUAD):
    rows = compute_topic_mastery(attempts, now=NOW, include_unattempted=False)
    return {r["topic"].casefold(): r["score"] for r in rows}.get(topic.casefold())


def class_scores(stage):
    pooled = [a for s in roster.hero_batch_students() for a in attempts_for(s["email"], stage)]
    return {r["topic"].casefold(): r["score"] for r in compute_topic_mastery(pooled, now=NOW, include_unattempted=False)}


def test_hero_quadratics_weak_after_stage_1():
    assert 30 <= topic_score(attempts_for(roster.HERO_EMAIL, 1)) <= 40


def test_hero_quadratics_developing_after_stage_2():
    assert 56 <= topic_score(attempts_for(roster.HERO_EMAIL, 2)) <= 70


def test_hero_quadratics_strong_after_stage_3():
    assert 76 <= topic_score(attempts_for(roster.HERO_EMAIL, 3)) <= 85


def test_hero_other_topics_at_least_60():
    rows = compute_topic_mastery(attempts_for(roster.HERO_EMAIL, 3), now=NOW, include_unattempted=False)
    others = [r["score"] for r in rows if r["topic"].casefold() != QUAD.casefold()]
    assert others and min(others) >= 60


def test_quadratics_is_class_weakest_after_stage_1():
    scores = class_scores(1)
    assert min(scores, key=scores.get) == QUAD.casefold()


def test_class_quadratics_average_rises_each_stage():
    s1, s2, s3 = (class_scores(n)[QUAD.casefold()] for n in (1, 2, 3))
    assert s1 < s2 < s3


def test_at_least_four_classmates_reach_developing_by_stage_3():
    risers = [s for s in roster.hero_batch_students() if s["email"] != roster.HERO_EMAIL
              and topic_score(attempts_for(s["email"], 1)) < 55 <= topic_score(attempts_for(s["email"], 3))]
    assert len(risers) >= 4


def test_roster_sizes_and_fake_emails():
    assert len(roster.hero_batch_students()) == 24  # 25 minus one pending join request
    assert len(roster.STUDENTS) == 37
    assert all(s["email"].endswith("@schoolofmaths.demo") for s in roster.STUDENTS)
    assert len({s["email"] for s in roster.STUDENTS}) == 37
