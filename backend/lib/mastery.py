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


def is_confirmed_weak(topic_or_band, attempts: int = None, sessions: int = None, min_attempts: int = 2, use_sessions: bool = True) -> bool:
    """Central predicate to identify confirmed weak topics across all reports and dashboards.
    A topic is confirmed weak iff band == 'weak' and sessions (or attempts) >= min_attempts (default 2).
    Accepts either:
      - a topic dictionary with keys 'band' and 'sessions'/'attempts' (e.g., is_confirmed_weak(t))
      - a band string and attempts/sessions count (e.g., is_confirmed_weak("weak", attempts=2, sessions=1))
    """
    if isinstance(topic_or_band, dict):
        b = topic_or_band.get("band")
        att = topic_or_band.get("attempts", 0)
        sess = topic_or_band.get("sessions")
        if sess is None:
            sess = topic_or_band.get("sessions_count")
        if isinstance(sess, (set, list, tuple)):
            sess = len(sess)
        if sessions is None:
            sessions = sess
    else:
        b = str(topic_or_band or "")
        att = 0 if attempts is None else attempts

    metric_val = sessions if (use_sessions and sessions is not None) else att
    return b == "weak" and metric_val >= min_attempts


def is_confirmed_strong(topic_or_band, attempts: int = None, sessions: int = None, min_attempts: int = 2, use_sessions: bool = True) -> bool:
    """Predicate for confirmed strong topics (band == 'strong' and sessions/attempts >= min_attempts)."""
    if isinstance(topic_or_band, dict):
        b = topic_or_band.get("band")
        att = topic_or_band.get("attempts", 0)
        sess = topic_or_band.get("sessions")
        if sess is None:
            sess = topic_or_band.get("sessions_count")
        if isinstance(sess, (set, list, tuple)):
            sess = len(sess)
        if sessions is None:
            sessions = sess
    else:
        b = str(topic_or_band or "")
        att = 0 if attempts is None else attempts

    metric_val = sessions if (use_sessions and sessions is not None) else att
    return b == "strong" and metric_val >= min_attempts


def _extract_syllabus_topics(class_level=None, subject=None, syllabus=None):
    if syllabus is not None:
        return syllabus
    try:
        from curriculum import CURRICULUM, normalize_key, normalize_subject, subjects_match
    except ImportError:
        try:
            from ..curriculum import CURRICULUM, normalize_key, normalize_subject, subjects_match
        except ImportError:
            def normalize_subject(s):
                low = re.sub(r"\s+", " ", str(s or "")).strip().casefold()
                if low in ("math", "maths", "mathematics"): return "Maths"
                if low in ("science", "sci"): return "Science"
                return low.title()
            def subjects_match(s1, s2):
                if not s1 or not s2: return False
                n1, n2 = normalize_subject(s1), normalize_subject(s2)
                if n1 and n2 and n1.casefold() == n2.casefold(): return True
                l1, l2 = str(s1).strip().casefold(), str(s2).strip().casefold()
                return l1 == l2 or l1 in l2 or l2 in l1
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
        return []

    topics = []
    seen = set()
    for c in classes:
        for subj_name, chaps in CURRICULUM.get(c, {}).items():
            if subject and not subjects_match(subj_name, subject):
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


def compute_topic_mastery(attempts, now=None, syllabus=None, class_level=None, subject=None, include_unattempted=True, min_attempts: int = 2, use_sessions: bool = True):
    """Aggregate per-question attempts into per-(subject, chapter, topic) mastery,
    optionally unioned with the official syllabus topic list (marking unattempted topics as 'not_attempted').

    `attempts` is an iterable of dicts: {subject, chapter, topic, difficulty,
    is_correct, time_s, created_at, submission_id}. Returns a list sorted weakest/untested first.
    Tracks distinct sessions (submission_id / created_at) to prevent single-test false positives.
    """
    try:
        from curriculum import (
            normalize_key, infer_subject_and_chapter, canonicalize_topic_title,
            normalize_subject, subjects_match
        )
    except ImportError:
        try:
            from ..curriculum import (
                normalize_key, infer_subject_and_chapter, canonicalize_topic_title,
                normalize_subject, subjects_match
            )
        except ImportError:
            def normalize_key(s): return re.sub(r"\s+", " ", str(s or "")).strip().casefold()
            def infer_subject_and_chapter(cl, c, t): return "", ""
            def canonicalize_topic_title(t): return str(t or "").strip().title()
            def normalize_subject(s):
                low = re.sub(r"\s+", " ", str(s or "")).strip().casefold()
                if low in ("math", "maths", "mathematics"): return "Maths"
                if low in ("science", "sci"): return "Science"
                return low.title()
            def subjects_match(s1, s2):
                if not s1 or not s2: return False
                n1, n2 = normalize_subject(s1), normalize_subject(s2)
                if n1 and n2 and n1.casefold() == n2.casefold(): return True
                l1, l2 = str(s1).strip().casefold(), str(s2).strip().casefold()
                return l1 == l2 or l1 in l2 or l2 in l1

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
        if subject and not subjects_match(subj, subject):
            continue

        key = (normalize_key(subj), normalize_key(chap), normalize_key(top))

        # Use canonical display names from syllabus when matched, or normalized title
        if key in s_lookup:
            display_subj = s_lookup[key]["subject"]
            display_chap = s_lookup[key]["chapter"]
            display_top = s_lookup[key]["topic"]
        else:
            display_subj = normalize_subject(subj) if subj else "Unknown"
            display_chap = chap or "General"
            display_top = canonicalize_topic_title(top)


        g = groups.setdefault(key, {
            "subject": display_subj, "chapter": display_chap, "topic": display_top,
            "weighted_correct": 0.0, "weighted_total": 0.0,
            "attempts": 0, "sessions": set(), "time_total": 0.0, "last_attempt": None,
        })
        w = recency_decay(a.get("created_at"), now) * difficulty_weight(a.get("difficulty"))
        g["weighted_total"] += w
        if a.get("is_correct"):
            g["weighted_correct"] += w
        g["attempts"] += 1
        sess_key = a.get("submission_id") or a.get("session_id") or a.get("created_at")
        if sess_key:
            if a.get("student_id"):
                g["sessions"].add((a.get("student_id"), sess_key))
            else:
                g["sessions"].add(sess_key)
        g["time_total"] += float(a.get("time_s") or 0)
        if g["last_attempt"] is None or (a.get("created_at") or "") > (g["last_attempt"] or ""):
            g["last_attempt"] = a.get("created_at")

    out = []
    for g in groups.values():
        score = round_half_up(g["weighted_correct"] / g["weighted_total"] * 100) if g["weighted_total"] else 0
        is_unclass = (g["subject"] or "").lower() == "unknown"
        b = band(score, g["attempts"])
        sessions_count = len(g["sessions"]) if g["sessions"] else g["attempts"]
        out.append({
            "subject": g["subject"], "chapter": g["chapter"], "topic": g["topic"],
            "score": score, "band": b, "attempts": g["attempts"],
            "sessions": sessions_count,
            "is_confirmed_weak": is_confirmed_weak(
                b, attempts=g["attempts"], sessions=sessions_count, min_attempts=min_attempts, use_sessions=use_sessions
            ),
            "avg_time_s": round_half_up(g["time_total"] / g["attempts"], 1) if g["attempts"] else 0.0,
            "last_attempt": g["last_attempt"],
            "is_unclassified": is_unclass,
        })

    # Union with syllabus topics (surfacing unattempted as amber 'not_attempted')
    if include_unattempted:
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
                    "sessions": 0,
                    "is_confirmed_weak": False,
                    "avg_time_s": 0.0,
                    "last_attempt": None,
                    "is_unclassified": False,
                })

    # Sort order:
    # 0. confirmed weak (score < 55 and attempts >= 2) -> lowest score first
    # 1. not_attempted -> alphabetical by chapter, topic
    # 2. developing / unconfirmed weak -> lowest score first
    # 3. strong (score > 75) -> lowest score first
    def _sort_key(item):
        if is_confirmed_weak(item):
            order_val = 0
        elif item.get("band") == "not_attempted":
            order_val = 1
        elif item.get("band") == "strong":
            order_val = 3
        else:
            order_val = 2
        return (order_val, item["score"], item["subject"], item["chapter"], item["topic"])

    out.sort(key=_sort_key)
    return out


def compute_unattempted_summary(attempted_topics, class_level=None, syllabus=None):
    """Compute chapter-level unattempted counts and overview summary stats.
    Returns:
      {
        "not_attempted_by_chapter": {chapter_name: count},
        "summary": {
          "attempted_count": int,
          "not_attempted_count": int,
          "total_topics": int,
          "weak_count": int,
          "developing_count": int,
          "strong_count": int
        }
      }
    """
    try:
        from curriculum import normalize_key
    except ImportError:
        try:
            from ..curriculum import normalize_key
        except ImportError:
            def normalize_key(s): return re.sub(r"\s+", " ", str(s or "")).strip().casefold()

    s_topics = _extract_syllabus_topics(class_level=class_level, syllabus=syllabus)
    attempted_keys = {
        (normalize_key(t.get("subject")), normalize_key(t.get("chapter")), normalize_key(t.get("topic")))
        for t in attempted_topics
    }

    not_attempted_by_chapter = {}
    for st in s_topics:
        k = (normalize_key(st.get("subject")), normalize_key(st.get("chapter")), normalize_key(st.get("topic")))
        if k not in attempted_keys:
            chap = st.get("chapter") or "General"
            not_attempted_by_chapter[chap] = not_attempted_by_chapter.get(chap, 0) + 1

    total_unattempted = sum(not_attempted_by_chapter.values())
    attempted_count = len(attempted_topics)
    weak_count = sum(1 for t in attempted_topics if is_confirmed_weak(t))
    strong_count = sum(1 for t in attempted_topics if t.get("band") == "strong")
    developing_count = attempted_count - weak_count - strong_count

    return {
        "not_attempted_by_chapter": not_attempted_by_chapter,
        "summary": {
            "attempted_count": attempted_count,
            "not_attempted_count": total_unattempted,
            "total_topics": attempted_count + total_unattempted,
            "weak_count": weak_count,
            "developing_count": developing_count,
            "strong_count": strong_count,
        }
    }


def get_ingestion_quality_summary(mastery_items):
    """Scan computed mastery items and return an ingestion-quality signal for teachers."""
    unclassified = [
        m for m in mastery_items
        if m.get("is_unclassified") or (m.get("subject") or "").lower() == "unknown"
    ]
    total_attempts = sum(m.get("attempts", 0) for m in unclassified)
    has_issues = len(unclassified) > 0
    return {
        "has_unknown": has_issues,
        "unknown_topics_count": len(unclassified),
        "unknown_attempts_count": total_attempts,
        "topics": [{"subject": m["subject"], "chapter": m["chapter"], "topic": m["topic"], "attempts": m.get("attempts", 0)} for m in unclassified],
        "status": "warning" if has_issues else "healthy",
        "signal": f"{len(unclassified)} unclassified topic(s) with {total_attempts} student attempt(s) detected ('Unknown' subject). Ingestion tags need correction." if has_issues else "All attempted questions are properly classified."
    }


