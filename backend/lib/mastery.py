"""Mastery engine — pure computation, no database I/O.

Mastery is computed on read from a student's submission `results`. Each "attempt"
is a single answered question carrying subject/chapter/topic/difficulty/correctness/
time plus the parent submission's `created_at` (for recency decay).

Formula (SPEC v3.0 §3.4):
    mastery(topic)   = Σ weight(a)·correct(a) / Σ weight(a)
    weight(a)        = recency_decay × difficulty_weight
    recency_decay    = 0.9 ^ (days_since_attempt / 7)
    difficulty_weight = easy 1.0 · medium 1.5 · hard 2.0
Bands: < 55 weak · 55–75 developing · > 75 strong.
"""
from datetime import datetime, timezone

DIFFICULTY_WEIGHT = {"easy": 1.0, "medium": 1.5, "hard": 2.0}
DEFAULT_WEIGHT = 1.0
WEAK_BELOW = 55
STRONG_ABOVE = 75


def difficulty_weight(difficulty: str) -> float:
    return DIFFICULTY_WEIGHT.get((difficulty or "").lower(), DEFAULT_WEIGHT)


def recency_decay(created_at, now: datetime = None) -> float:
    """0.9 ^ (days / 7). Newer attempts weigh more; missing dates weigh 1.0."""
    now = now or datetime.now(timezone.utc)
    if not created_at:
        return 1.0
    try:
        t = datetime.fromisoformat(str(created_at))
    except (ValueError, TypeError):
        return 1.0
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    days = max(0.0, (now - t).total_seconds() / 86400.0)
    return 0.9 ** (days / 7.0)


import re

def band(score: float, attempts: int = 1) -> str:
    if attempts == 0:
        return "not_attempted"
    if score < WEAK_BELOW:
        return "weak"
    if score > STRONG_ABOVE:
        return "strong"
    return "developing"


def _extract_syllabus_topics(class_level=None, subject=None, syllabus=None):
    if syllabus is not None:
        return syllabus
    try:
        from curriculum import CURRICULUM
    except ImportError:
        try:
            from ..curriculum import CURRICULUM
        except ImportError:
            return []

    classes = []
    if isinstance(class_level, (list, tuple, set)):
        for item in class_level:
            c = re.sub(r"[^0-9]", "", str(item))
            if c in CURRICULUM and c not in classes:
                classes.append(c)
    elif class_level:
        c = re.sub(r"[^0-9]", "", str(class_level))
        if c in CURRICULUM:
            classes.append(c)
    if not classes:
        classes = ["10"]

    topics = []
    seen = set()
    for c in classes:
        for subj_name, chaps in CURRICULUM.get(c, {}).items():
            if subject and subject.lower() not in subj_name.lower():
                continue
            for chap_name, topic_list in chaps.items():
                for t in topic_list:
                    k = (subj_name.lower().strip(), chap_name.lower().strip(), t.lower().strip())
                    if k not in seen:
                        seen.add(k)
                        topics.append({
                            "subject": subj_name,
                            "chapter": chap_name,
                            "topic": t
                        })
    return topics


def compute_topic_mastery(attempts, now=None, syllabus=None, class_level=None, subject=None):
    """Aggregate per-question attempts into per-(subject, chapter, topic) mastery,
    unioned with the official syllabus topic list (marking unattempted topics as 'not_attempted').

    `attempts` is an iterable of dicts: {subject, chapter, topic, difficulty,
    is_correct, time_s, created_at}. Returns a list sorted weakest/untested first.
    """
    groups = {}
    detected_class = class_level
    for a in attempts:
        subj = (a.get("subject") or "").strip()
        chap = (a.get("chapter") or "").strip()
        top = (a.get("topic") or "").strip() or "General"
        key = (subj.lower(), chap.lower(), top.lower())
        g = groups.setdefault(key, {
            "subject": subj, "chapter": chap, "topic": top,
            "weighted_correct": 0.0, "weighted_total": 0.0,
            "attempts": 0, "time_total": 0.0, "last_attempt": None,
        })
        w = recency_decay(a.get("created_at"), now) * difficulty_weight(a.get("difficulty"))
        g["weighted_total"] += w
        if a.get("is_correct"):
            g["weighted_correct"] += w
        g["attempts"] += 1
        g["time_total"] += float(a.get("time_s") or 0)
        if g["last_attempt"] is None or (a.get("created_at") or "") > (g["last_attempt"] or ""):
            g["last_attempt"] = a.get("created_at")

    out = []
    for g in groups.values():
        score = round(g["weighted_correct"] / g["weighted_total"] * 100) if g["weighted_total"] else 0
        out.append({
            "subject": g["subject"], "chapter": g["chapter"], "topic": g["topic"],
            "score": score, "band": band(score, g["attempts"]), "attempts": g["attempts"],
            "avg_time_s": round(g["time_total"] / g["attempts"], 1) if g["attempts"] else 0.0,
            "last_attempt": g["last_attempt"],
        })

    # Union with syllabus topics (surfacing unattempted as amber 'not_attempted')
    s_topics = _extract_syllabus_topics(class_level=detected_class, subject=subject, syllabus=syllabus)
    for st in s_topics:
        s_subj = st["subject"]
        s_chap = st["chapter"]
        s_top = st["topic"]
        s_key = (s_subj.lower().strip(), s_chap.lower().strip(), s_top.lower().strip())
        if s_key not in groups:
            out.append({
                "subject": s_subj,
                "chapter": s_chap,
                "topic": s_top,
                "score": 0,
                "band": "not_attempted",
                "attempts": 0,
                "avg_time_s": 0.0,
                "last_attempt": None,
            })

    # Sort order:
    # 0. confirmed weak (score < 55) -> lowest score first
    # 1. not_attempted -> alphabetical by chapter, topic
    # 2. developing (55 <= score <= 75) -> lowest score first
    # 3. strong (score > 75) -> lowest score first
    def _sort_key(item):
        b = item["band"]
        order = {"weak": 0, "not_attempted": 1, "developing": 2, "strong": 3}
        return (order.get(b, 1), item["score"], item["subject"], item["chapter"], item["topic"])

    out.sort(key=_sort_key)
    return out

