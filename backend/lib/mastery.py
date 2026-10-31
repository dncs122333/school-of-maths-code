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
from decimal import Decimal, ROUND_HALF_UP
import re

DIFFICULTY_WEIGHT = {"easy": 1.0, "medium": 1.5, "hard": 2.0}
DEFAULT_WEIGHT = 1.0
WEAK_BELOW = 55
STRONG_ABOVE = 75


def round_half_up(val, decimals: int = 0):
    """Rounds half-up instead of Python's banker's (round-half-to-even) rounding.

    Prevents boundary score anomalies where 54.5 rounds down to 54 (weak) while
    55.5 rounds up to 56, or 74.5 rounds down to 74 while 75.5 rounds up to 76.
    """
    if val is None:
        return 0 if decimals == 0 else 0.0
    try:
        d = Decimal(str(val))
        if decimals == 0:
            return int(d.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        q = Decimal("10") ** -decimals
        return float(d.quantize(q, rounding=ROUND_HALF_UP))
    except Exception:
        import math
        factor = 10 ** decimals
        res = math.floor(float(val) * factor + 0.5) / factor
        return int(res) if decimals == 0 else res


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


def band(score: float, attempts: int = 1) -> str:
    """Classifies a score into a mastery band:
    - 0 attempts: 'not_attempted'
    - < 55: 'weak'
    - 55–75: 'developing'
    - > 75: 'strong'

    Uses round_half_up on floating-point boundary scores so that unrounded 54.5
    rounds consistently to 55 ('developing') rather than flipping to 54 ('weak').
    """
    if attempts == 0:
        return "not_attempted"
    s = round_half_up(score)
    if s < WEAK_BELOW:
        return "weak"
    if s > STRONG_ABOVE:
        return "strong"
    return "developing"


def _extract_syllabus_topics(class_level=None, subject=None, syllabus=None):
    if syllabus is not None:
        return syllabus
    try:
        from curriculum import CURRICULUM, normalize_key
    except ImportError:
        try:
            from ..curriculum import CURRICULUM, normalize_key
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
                    k = (normalize_key(subj_name), normalize_key(chap_name), normalize_key(t))
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
    try:
        from curriculum import normalize_key, infer_subject_and_chapter, canonicalize_topic_title
    except ImportError:
        try:
            from ..curriculum import normalize_key, infer_subject_and_chapter, canonicalize_topic_title
        except ImportError:
            def normalize_key(s): return re.sub(r"\s+", " ", str(s or "")).strip().casefold()
            def infer_subject_and_chapter(cl, c, t): return "", ""
            def canonicalize_topic_title(t): return str(t or "").strip().title()

    detected_class = class_level
    s_topics = _extract_syllabus_topics(class_level=detected_class, subject=subject, syllabus=syllabus)
    s_lookup = {
        (normalize_key(st["subject"]), normalize_key(st["chapter"]), normalize_key(st["topic"])): st
        for st in s_topics
    }

    groups = {}
    for a in attempts:
        subj = (a.get("subject") or "").strip()
        chap = (a.get("chapter") or "").strip()
        top = (a.get("topic") or "").strip() or "General"

        # If subject or chapter is missing (e.g. diagnostic results), infer from curriculum
        if not subj or not chap:
            inferred_subj, inferred_chap = infer_subject_and_chapter(detected_class, chap, top)
            if not subj and inferred_subj:
                subj = inferred_subj
            if not chap and inferred_chap:
                chap = inferred_chap
            if not subj:
                subj = "Unknown"

        # If a specific subject is requested, do not pollute with other or unknown subjects
        if subject and normalize_key(subj) != normalize_key(subject):
            continue

        key = (normalize_key(subj), normalize_key(chap), normalize_key(top))

        # Use canonical display names from syllabus when matched, or normalized title
        if key in s_lookup:
            display_subj = s_lookup[key]["subject"]
            display_chap = s_lookup[key]["chapter"]
            display_top = s_lookup[key]["topic"]
        else:
            display_subj = subj or "Unknown"
            display_chap = chap or "General"
            display_top = canonicalize_topic_title(top)

        g = groups.setdefault(key, {
            "subject": display_subj, "chapter": display_chap, "topic": display_top,
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
        score = round_half_up(g["weighted_correct"] / g["weighted_total"] * 100) if g["weighted_total"] else 0
        out.append({
            "subject": g["subject"], "chapter": g["chapter"], "topic": g["topic"],
            "score": score, "band": band(score, g["attempts"]), "attempts": g["attempts"],
            "avg_time_s": round_half_up(g["time_total"] / g["attempts"], 1) if g["attempts"] else 0.0,
            "last_attempt": g["last_attempt"],
        })

    # Union with syllabus topics (surfacing unattempted as amber 'not_attempted')
    for st in s_topics:
        s_key = (normalize_key(st["subject"]), normalize_key(st["chapter"]), normalize_key(st["topic"]))
        if s_key not in groups:
            out.append({
                "subject": st["subject"],
                "chapter": st["chapter"],
                "topic": st["topic"],
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

