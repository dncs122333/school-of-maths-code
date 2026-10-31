"""Pure computation and Mongo aggregation helpers for student, teacher, and batch reports."""
from datetime import datetime, timezone, timedelta
import statistics
from typing import Dict, List, Optional, Any

try:
    from lib.mastery import round_half_up, band, compute_topic_mastery
    from curriculum import CURRICULUM, normalize_key, canonicalize_topic_title
except ImportError:
    from ..lib.mastery import round_half_up, band, compute_topic_mastery
    from ..curriculum import CURRICULUM, normalize_key, canonicalize_topic_title


def compute_test_analytics(
    test: Dict[str, Any],
    submissions: List[Dict[str, Any]],
    batch: Optional[Dict[str, Any]] = None,
    enrolled_count: Optional[int] = None
) -> Dict[str, Any]:
    """Computes comprehensive per-test batch metrics:
    - Completion rate, score distribution histogram, avg, median, topper, lowest
    - Item discrimination index (D) between top 33% and bottom 33% cohorts
    - Question-level % correct and pace outliers
    - Topic breakdown with round_half_up accuracy and band
    - Anomaly detection (tab switches, rushing)
    """
    total_enrolled = enrolled_count
    if total_enrolled is None:
        if batch and "student_ids" in batch:
            total_enrolled = len(batch["student_ids"])
        else:
            total_enrolled = len(submissions)

    submitted_count = len(submissions)
    completion_rate = round_half_up((submitted_count / total_enrolled * 100), 1) if total_enrolled else 0.0

    scores = [s.get("score", 0) for s in submissions]
    avg_score = round_half_up(sum(scores) / len(scores), 1) if scores else 0.0
    median_score = round_half_up(statistics.median(scores), 1) if scores else 0.0
    topper_score = max(scores) if scores else 0
    lowest_score = min(scores) if scores else 0

    # Score distribution histogram (5 standardized buckets)
    distribution = {
        "0-39": 0,
        "40-54": 0,
        "55-74": 0,
        "75-89": 0,
        "90-100": 0,
    }
    for sc in scores:
        if sc < 40:
            distribution["0-39"] += 1
        elif sc < 55:
            distribution["40-54"] += 1
        elif sc < 75:
            distribution["55-74"] += 1
        elif sc < 90:
            distribution["75-89"] += 1
        else:
            distribution["90-100"] += 1

    # Questions psychometric analysis
    test_questions = test.get("questions") or []
    q_count = len(test_questions)

    # Sort submissions by score descending to extract top and bottom cohorts for Item Discrimination
    sorted_subs = sorted(submissions, key=lambda s: s.get("score", 0), reverse=True)
    can_discriminate = len(sorted_subs) >= 3
    k = max(1, len(sorted_subs) // 3) if can_discriminate else 0
    top_cohort = sorted_subs[:k] if can_discriminate else []
    bottom_cohort = sorted_subs[-k:] if can_discriminate else []

    expected_duration_s = float(test.get("duration_minutes", 10) * 60)
    expected_per_q_s = (expected_duration_s / q_count) if q_count else 60.0

    # Collect per-question times across submissions
    q_times_map: Dict[int, List[float]] = {i: [] for i in range(q_count)}
    for s in submissions:
        t_list = s.get("times") or []
        for i, val in enumerate(t_list):
            if i in q_times_map:
                try:
                    q_times_map[i].append(float(val))
                except (ValueError, TypeError):
                    q_times_map[i].append(0.0)

    median_all_q_times = []
    for i in range(q_count):
        if q_times_map[i]:
            median_all_q_times.append(statistics.median(q_times_map[i]))
    benchmark_median_time = statistics.median(median_all_q_times) if median_all_q_times else expected_per_q_s

    question_analysis = []
    for i, q in enumerate(test_questions):
        correct_total = 0
        for s in submissions:
            res_list = s.get("results") or []
            if i < len(res_list) and res_list[i].get("is_correct"):
                correct_total += 1

        accuracy = round_half_up(correct_total / submitted_count * 100, 1) if submitted_count else 0.0

        # Discrimination Index D = P(Top) - P(Bottom)
        d_val = None
        d_rating = "N/A"
        if can_discriminate:
            top_correct = sum(
                1 for s in top_cohort
                if i < len(s.get("results") or []) and s["results"][i].get("is_correct")
            )
            bottom_correct = sum(
                1 for s in bottom_cohort
                if i < len(s.get("results") or []) and s["results"][i].get("is_correct")
            )
            p_top = top_correct / len(top_cohort)
            p_bot = bottom_correct / len(bottom_cohort)
            d_val = round_half_up(p_top - p_bot, 2)

            if d_val >= 0.35:
                d_rating = "Excellent"
            elif d_val >= 0.20:
                d_rating = "Good"
            elif d_val >= 0.0:
                d_rating = "Fair"
            else:
                d_rating = "Poor / Ambiguous"

        times_for_q = q_times_map.get(i, [])
        avg_q_time = round_half_up(sum(times_for_q) / len(times_for_q), 1) if times_for_q else 0.0

        # Pace outlier: question took unusually long (>2.5x benchmark) AND has low discrimination (<0.20 or N/A).
        # When discrimination is high (>=0.20), it represents a demanding, valid hard question rather than a pacing anomaly.
        is_slow = bool(avg_q_time > max(30.0, benchmark_median_time * 2.5))
        is_low_disc = (d_val is None or d_val < 0.20)
        is_pace_outlier = bool(is_slow and is_low_disc)

        question_analysis.append({
            "index": i + 1,
            "question_text": q.get("question", f"Question {i+1}"),
            "topic": canonicalize_topic_title(q.get("topic") or test.get("topic") or "General"),
            "chapter": q.get("chapter") or test.get("chapter") or "General",
            "difficulty": (q.get("difficulty") or "medium").lower(),
            "correct_count": correct_total,
            "accuracy": accuracy,
            "discrimination_index": d_val,
            "discrimination_rating": d_rating,
            "avg_time_s": avg_q_time,
            "is_pace_outlier": is_pace_outlier
        })

    # Topic-level weakness breakdown
    topic_map: Dict[Any, Dict[str, Any]] = {}
    for s in submissions:
        for r in (s.get("results") or []):
            subj = r.get("subject") or test.get("subject") or "Unknown"
            chap = r.get("chapter") or test.get("chapter") or "General"
            top = r.get("topic") or test.get("topic") or "General"
            k_norm = (normalize_key(subj), normalize_key(chap), normalize_key(top))

            if k_norm not in topic_map:
                topic_map[k_norm] = {
                    "subject": subj,
                    "chapter": chap,
                    "topic": canonicalize_topic_title(top),
                    "total": 0,
                    "correct": 0
                }
            topic_map[k_norm]["total"] += 1
            if r.get("is_correct"):
                topic_map[k_norm]["correct"] += 1

    topic_breakdown = []
    for v in topic_map.values():
        acc = round_half_up(v["correct"] / v["total"] * 100) if v["total"] else 0
        topic_breakdown.append({
            "subject": v["subject"],
            "chapter": v["chapter"],
            "topic": v["topic"],
            "total_attempts": v["total"],
            "correct_attempts": v["correct"],
            "accuracy": acc,
            "band": band(acc, attempts=v["total"])
        })
    # Sort weakest first
    topic_breakdown.sort(key=lambda t: (t["accuracy"], t["topic"]))

    # Anomaly detection (tab switches & fast submissions)
    anomalies = []
    for s in submissions:
        flag_reasons = []
        tab_switches = s.get("tab_switches", 0)
        if tab_switches >= 3:
            flag_reasons.append(f"{tab_switches} tab switches detected")

        s_times = s.get("times") or []
        total_time_taken = sum(float(t) for t in s_times if t is not None)

        # Rushing threshold: strong students (>=75%) can genuinely solve questions quickly without rushing;
        # only flag them if impossibly fast (<2.5s/q). For non-strong students (<75%), <5s/q indicates rushed guessing.
        student_score = s.get("score", 0)
        if student_score >= 75:
            min_reasonable_s = max(6.0, float(q_count * 2.5))
        else:
            min_reasonable_s = max(15.0, float(q_count * 5.0))

        if total_time_taken < min_reasonable_s:
            flag_reasons.append(f"Unusually rapid submission ({round_half_up(total_time_taken)}s total)")

        if flag_reasons:
            anomalies.append({
                "student_id": s.get("student_id"),
                "student_name": s.get("student_name", "Student"),
                "score": s.get("score", 0),
                "reasons": flag_reasons,
                "tab_switches": tab_switches,
                "time_taken_s": round_half_up(total_time_taken)
            })

    # Ingestion quality signal (unclassified topics/subject)
    unknown_topics = [t for t in topic_breakdown if (t.get("subject") or "").lower() == "unknown"]
    is_test_subject_unknown = (test.get("subject") or "").lower() in ("unknown", "")
    ingestion_quality = {
        "has_unknown": len(unknown_topics) > 0 or is_test_subject_unknown,
        "unknown_topics_count": len(unknown_topics),
        "status": "warning" if (len(unknown_topics) > 0 or is_test_subject_unknown) else "healthy",
        "signal": f"{len(unknown_topics)} question topic(s) have 'Unknown' subject." if unknown_topics else ("Test subject is 'Unknown'." if is_test_subject_unknown else "All topics classified.")
    }

    return {
        "test_id": test.get("id"),
        "title": test.get("title", "Assessment Report"),
        "kind": test.get("kind", "test"),
        "class_level": test.get("class_level", ""),
        "subject": test.get("subject") or "Unknown",
        "chapter": test.get("chapter", ""),
        "topic": test.get("topic", ""),
        "duration_minutes": test.get("duration_minutes", 15),
        "created_at": test.get("created_at"),
        "enrolled_count": total_enrolled,
        "submitted_count": submitted_count,
        "completion_rate": completion_rate,
        "ingestion_quality": ingestion_quality,
        "summary": {
            "avg_score": avg_score,
            "median_score": median_score,
            "topper_score": topper_score,
            "lowest_score": lowest_score,
            "score_band": band(avg_score, submitted_count)
        },
        "score_distribution": distribution,
        "question_analysis": question_analysis,
        "topic_breakdown": topic_breakdown,
        "anomalies": anomalies
    }


def compute_weekly_digest(
    batch_id: str,
    batch: Dict[str, Any],
    recent_submissions: List[Dict[str, Any]],
    prior_submissions: List[Dict[str, Any]],
    now: Optional[datetime] = None
) -> Dict[str, Any]:
    """Computes a 7-day rolling batch digest comparing the past 7 days against prior 7 days."""
    now = now or datetime.now(timezone.utc)
    student_ids = batch.get("student_ids") or []
    enrolled_count = len(student_ids)

    recent_scores = [s.get("score", 0) for s in recent_submissions]
    prior_scores = [s.get("score", 0) for s in prior_submissions]

    recent_avg = round_half_up(sum(recent_scores) / len(recent_scores), 1) if recent_scores else 0.0
    prior_avg = round_half_up(sum(prior_scores) / len(prior_scores), 1) if prior_scores else 0.0
    delta_avg = round_half_up(recent_avg - prior_avg, 1)

    active_students = len({s.get("student_id") for s in recent_submissions if s.get("student_id")})
    active_rate = round_half_up(active_students / enrolled_count * 100, 1) if enrolled_count else 0.0

    # Group topic performance in recent window vs prior window
    def _t_accuracies(subs):
        t_data = {}
        for s in subs:
            for r in (s.get("results") or []):
                top = r.get("topic") or "General"
                k = normalize_key(top)
                if k not in t_data:
                    t_data[k] = {"topic": canonicalize_topic_title(top), "correct": 0, "total": 0}
                t_data[k]["total"] += 1
                if r.get("is_correct"):
                    t_data[k]["correct"] += 1
        return {
            k: {
                "topic": v["topic"],
                "acc": round_half_up(v["correct"] / v["total"] * 100) if v["total"] else 0,
                "total": v["total"]
            }
            for k, v in t_data.items()
        }

    rec_t = _t_accuracies(recent_submissions)
    pri_t = _t_accuracies(prior_submissions)

    topic_movement = []
    for k, v in rec_t.items():
        prev_acc = pri_t.get(k, {}).get("acc")
        cur_acc = v["acc"]
        if prev_acc is not None:
            diff = cur_acc - prev_acc
            trajectory = "improving" if diff >= 5 else "slipping" if diff <= -5 else "steady"
        else:
            diff = 0
            trajectory = "new"

        topic_movement.append({
            "topic": v["topic"],
            "current_accuracy": cur_acc,
            "prior_accuracy": prev_acc,
            "delta": diff,
            "trajectory": trajectory,
            "band": band(cur_acc, attempts=v["total"])
        })

    # Sort topics with slipping first, then lowest accuracy
    topic_movement.sort(key=lambda t: (0 if t["trajectory"] == "slipping" else 1, t["current_accuracy"]))

    return {
        "batch_id": batch_id,
        "batch_name": batch.get("name", "Batch"),
        "class_level": batch.get("class_level", ""),
        "window_start": (now - timedelta(days=7)).date().isoformat(),
        "window_end": now.date().isoformat(),
        "enrolled_count": enrolled_count,
        "active_students": active_students,
        "active_rate": active_rate,
        "submissions_count": len(recent_submissions),
        "recent_avg": recent_avg,
        "prior_avg": prior_avg,
        "delta_avg": delta_avg,
        "topic_movement": topic_movement
    }


def compute_term_report(
    batch_id: str,
    batch: Dict[str, Any],
    all_submissions: List[Dict[str, Any]],
    student_map: Dict[str, str],
    term: Optional[Dict[str, Any]] = None,
    subject: Optional[str] = None
) -> Dict[str, Any]:
    """Computes cumulative term-wise report: coverage of curriculum, student rank matrix, and batch mastery."""
    enrolled_ids = batch.get("student_ids") or []
    cl = str(batch.get("class_level", "9"))

    # Syllabus coverage: union all subjects in CURRICULUM[cl], or filter to target subject
    target_subject = (subject or batch.get("subject") or "").strip()
    class_curriculum = CURRICULUM.get(cl, {})

    all_curriculum_topics = set()
    if target_subject and target_subject.lower() not in ("all", "both"):
        matched = False
        for s_name, chaps in class_curriculum.items():
            if target_subject.lower() in s_name.lower() or s_name.lower() in target_subject.lower():
                matched = True
                for topics in chaps.values():
                    for t in topics:
                        all_curriculum_topics.add(normalize_key(t))
        if not matched:
            for chaps in class_curriculum.values():
                for topics in chaps.values():
                    for t in topics:
                        all_curriculum_topics.add(normalize_key(t))
    else:
        for chaps in class_curriculum.values():
            for topics in chaps.values():
                for t in topics:
                    all_curriculum_topics.add(normalize_key(t))

    tested_topics = set()
    for s in all_submissions:
        for r in (s.get("results") or []):
            top = r.get("topic")
            if top:
                tested_topics.add(normalize_key(top))

    covered_topics = tested_topics & all_curriculum_topics
    syllabus_coverage_pct = (
        round_half_up(len(covered_topics) / len(all_curriculum_topics) * 100, 1)
        if all_curriculum_topics else 0.0
    )

    # Student summary ranking
    per_student_subs: Dict[str, List[Dict[str, Any]]] = {sid: [] for sid in enrolled_ids}
    for s in all_submissions:
        sid = s.get("student_id")
        if not sid:
            continue
        if sid in per_student_subs:
            per_student_subs[sid].append(s)
        else:
            per_student_subs[sid] = [s]

    student_summaries = []
    for sid, s_list in per_student_subs.items():
        name = student_map.get(sid, "Student")
        tests_taken = len(s_list)

        # 1. Question-weighted average score (weights a 50-q test higher than a 2-q DPP)
        total_q = 0
        total_corr = 0.0
        student_attempts = []
        for sub in s_list:
            results = sub.get("results") or []
            sub_created = sub.get("created_at")
            if results:
                q_cnt = len(results)
                q_corr = sum(1 for r in results if r.get("is_correct"))
                for r in results:
                    student_attempts.append({**r, "created_at": sub_created})
            elif sub.get("total") is not None:
                q_cnt = int(sub.get("total") or 0)
                q_corr = float(sub.get("correct", 0))
            else:
                q_cnt = 1
                q_corr = float(sub.get("score", 0)) / 100.0
            total_q += q_cnt
            total_corr += q_corr

        avg_score = round_half_up((total_corr / total_q) * 100, 1) if total_q else 0.0

        # 2. Feed student attempts through compute_topic_mastery (single source of truth)
        active_mastery = compute_topic_mastery(
            student_attempts,
            class_level=cl,
            subject=target_subject if target_subject and target_subject.lower() not in ("all", "both") else None,
            include_unattempted=False
        )

        # Weak topics require at least 2 attempts to confirm weakness (prevents 1-question distortion)
        weak_count = sum(1 for t in active_mastery if t.get("band") == "weak" and t.get("attempts", 0) >= 2)
        strong_count = sum(1 for t in active_mastery if t.get("band") == "strong" and t.get("attempts", 0) >= 2)

        student_summaries.append({
            "student_id": sid,
            "name": name,
            "tests_taken": tests_taken,
            "avg_score": avg_score,
            "overall_band": band(avg_score, total_q),
            "weak_topics_count": weak_count,
            "strong_topics_count": strong_count
        })

    # Sort students by avg_score descending
    student_summaries.sort(key=lambda s: s["avg_score"], reverse=True)
    for rank, s in enumerate(student_summaries, start=1):
        s["rank"] = rank

    return {
        "batch_id": batch_id,
        "batch_name": batch.get("name", "Batch"),
        "class_level": cl,
        "subject": target_subject or "All",
        "term_name": term.get("name", "Academic Term") if term else "All-Time Academic Overview",
        "total_enrolled": len(enrolled_ids),
        "total_submissions": len(all_submissions),
        "syllabus_coverage_pct": syllabus_coverage_pct,
        "covered_topics_count": len(covered_topics),
        "total_curriculum_topics": len(all_curriculum_topics),
        "student_summaries": student_summaries
    }
