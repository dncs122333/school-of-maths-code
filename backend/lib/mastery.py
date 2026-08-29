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


def band(score: float) -> str:
    if score < WEAK_BELOW:
        return "weak"
    if score > STRONG_ABOVE:
        return "strong"
    return "developing"


def compute_topic_mastery(attempts, now=None):
    """Aggregate per-question attempts into per-(subject, chapter, topic) mastery.

    `attempts` is an iterable of dicts: {subject, chapter, topic, difficulty,
    is_correct, time_s, created_at}. Returns a list sorted weakest-first.
    """
    groups = {}
    for a in attempts:
        subject = (a.get("subject") or "").strip()
        chapter = (a.get("chapter") or "").strip()
        topic = (a.get("topic") or "").strip() or "General"
        key = (subject, chapter, topic)
        g = groups.setdefault(key, {
            "subject": subject, "chapter": chapter, "topic": topic,
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
            "score": score, "band": band(score), "attempts": g["attempts"],
            "avg_time_s": round(g["time_total"] / g["attempts"], 1) if g["attempts"] else 0.0,
            "last_attempt": g["last_attempt"],
        })
    out.sort(key=lambda x: x["score"])
    return out
