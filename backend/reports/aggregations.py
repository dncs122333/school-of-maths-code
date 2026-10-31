"""Pure computation and Mongo aggregation helpers for student, teacher, and batch reports."""
from datetime import datetime, timezone, timedelta
import statistics
from typing import Dict, List, Optional, Any

try:
    from lib.mastery import round_half_up, band, compute_topic_mastery, is_confirmed_weak, is_confirmed_strong
    from curriculum import CURRICULUM, normalize_key, canonicalize_topic_title, subjects_match, normalize_subject, normalize_class_level
except ImportError:
    from ..lib.mastery import round_half_up, band, compute_topic_mastery, is_confirmed_weak, is_confirmed_strong
    from ..curriculum import CURRICULUM, normalize_key, canonicalize_topic_title, subjects_match, normalize_subject, normalize_class_level


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
    if total_enrolled is None and batch and batch.get("student_ids"):
        total_enrolled = len(batch["student_ids"])

    submitted_count = len(submissions)
    if total_enrolled is not None and total_enrolled > 0:
        completion_rate = round_half_up((submitted_count / total_enrolled * 100), 1)
    else:
        completion_rate = None

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


def parse_utc_datetime(dt_val: Any) -> Optional[datetime]:
    """Parses any ISO-8601 string (with Z, +05:30, +00:00, or naive) into a timezone-aware UTC datetime."""
    if not dt_val:
        return None
    if isinstance(dt_val, datetime):
        return dt_val.astimezone(timezone.utc) if dt_val.tzinfo else dt_val.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(dt_val).strip())
        return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def compute_weekly_digest(
    batch_id: str,
    batch: Dict[str, Any],
    recent_submissions: List[Dict[str, Any]],
    prior_submissions: List[Dict[str, Any]],
    now: Optional[datetime] = None
) -> Dict[str, Any]:
    """Computes a 7-day rolling batch digest comparing the past 7 days against prior 7 days.
    Dates are strictly compared in UTC to prevent mixed ISO offset misbucketing.
    """
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    now = now.astimezone(timezone.utc)

    recent_cutoff = now - timedelta(days=7)
    prior_cutoff = now - timedelta(days=14)

    # Re-bucket using UTC datetimes if created_at is present, eliminating raw string offset misbucketing
    # Tag provenance before merging to ensure O(n) re-bucketing and prevent duplicate dict misbucketing
    tagged_combined = [(s, "recent") for s in recent_submissions] + [(s, "prior") for s in prior_submissions]
    if any(s.get("created_at") for s, _ in tagged_combined):
        rec_subs = []
        pri_subs = []
        for s, orig_tag in tagged_combined:
            dt = parse_utc_datetime(s.get("created_at"))
            if dt is not None:
                if dt >= recent_cutoff:
                    rec_subs.append(s)
                elif dt >= prior_cutoff:
                    pri_subs.append(s)
            else:
                if orig_tag == "recent":
                    rec_subs.append(s)
                else:
                    pri_subs.append(s)
        recent_submissions = rec_subs
        prior_submissions = pri_subs

    student_ids = batch.get("student_ids") or []
    enrolled_count = len(student_ids)

    recent_scores = [s.get("score", 0) for s in recent_submissions]
    prior_scores = [s.get("score", 0) for s in prior_submissions]

    recent_avg = round_half_up(sum(recent_scores) / len(recent_scores), 1) if recent_scores else 0.0
    prior_avg = round_half_up(sum(prior_scores) / len(prior_scores), 1) if prior_scores else None
    # Report delta_avg: None when prior is empty to prevent phantom improvement
    delta_avg = round_half_up(recent_avg - prior_avg, 1) if prior_scores else None

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
    # 1. Topics attempted in recent window
    for k, v in rec_t.items():
        prev_acc = pri_t.get(k, {}).get("acc")
        cur_acc = v["acc"]
        if prev_acc is not None:
            diff = cur_acc - prev_acc
            trajectory = "improving" if diff >= 5 else "slipping" if diff <= -5 else "steady"
        else:
            diff = None
            trajectory = "new"

        topic_movement.append({
            "topic": v["topic"],
            "current_accuracy": cur_acc,
            "prior_accuracy": prev_acc,
            "delta": diff,
            "trajectory": trajectory,
            "band": band(cur_acc, attempts=v["total"])
        })

    # 2. Union prior-only topics with trajectory 'regressed' so neglected/abandoned topics are visible
    for k, v in pri_t.items():
        if k not in rec_t:
            topic_movement.append({
                "topic": v["topic"],
                "current_accuracy": None,
                "prior_accuracy": v["acc"],
                "delta": None,
                "trajectory": "regressed",
                "band": "not_attempted"
            })

    # Sort topics with regressed and slipping first, then lowest accuracy
    topic_movement.sort(key=lambda t: (
        0 if t["trajectory"] in ("regressed", "slipping") else 1,
        t["current_accuracy"] if t["current_accuracy"] is not None else (t["prior_accuracy"] or 0)
    ))

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
    raw_cl = batch.get("class_level", "9")
    cl = normalize_class_level(raw_cl)
    if cl not in CURRICULUM:
        raise ValueError(
            f"Class level '{raw_cl}' (normalized: '{cl}') not found in CURRICULUM. "
            f"Supported class levels: {list(CURRICULUM.keys())}"
        )

    # Syllabus coverage: union all subjects in CURRICULUM[cl], or filter to target subject
    # Key on (subject, chapter, topic) tuple so identical topic names across different chapters/subjects do not collide
    target_subject = (subject or batch.get("subject") or "").strip()
    class_curriculum = CURRICULUM[cl]

    all_curriculum_topics = set()
    if target_subject and target_subject.lower() not in ("all", "both"):
        matched = False
        for s_name, chaps in class_curriculum.items():
            if subjects_match(s_name, target_subject):
                matched = True
                norm_s = normalize_key(normalize_subject(s_name))
                for c_name, topics in chaps.items():
                    norm_c = normalize_key(c_name)
                    for t in topics:
                        all_curriculum_topics.add((norm_s, norm_c, normalize_key(t)))
        if not matched:
            for s_name, chaps in class_curriculum.items():
                norm_s = normalize_key(normalize_subject(s_name))
                for c_name, topics in chaps.items():
                    norm_c = normalize_key(c_name)
                    for t in topics:
                        all_curriculum_topics.add((norm_s, norm_c, normalize_key(t)))
    else:
        for s_name, chaps in class_curriculum.items():
            norm_s = normalize_key(normalize_subject(s_name))
            for c_name, topics in chaps.items():
                norm_c = normalize_key(c_name)
                for t in topics:
                    all_curriculum_topics.add((norm_s, norm_c, normalize_key(t)))

    covered_topics = set()
    for s in all_submissions:
        sub_subj = s.get("subject") or batch.get("subject") or target_subject or ""
        sub_chap = s.get("chapter") or ""
        results = s.get("results") or []
        if not results and s.get("topic"):
            results = [{"topic": s.get("topic"), "chapter": sub_chap, "subject": sub_subj}]

        for r in results:
            subj_raw = r.get("subject") or sub_subj
            chap_raw = r.get("chapter") or sub_chap

            r_subj = normalize_key(normalize_subject(subj_raw)) if subj_raw else ""
            r_chap = normalize_key(chap_raw) if chap_raw else ""

            candidate_tops = []
            if r.get("topics") and isinstance(r.get("topics"), list):
                candidate_tops.extend(r.get("topics"))
            if r.get("topic") and r.get("topic") not in candidate_tops:
                candidate_tops.append(r.get("topic"))

            for top_raw in candidate_tops:
                r_top = normalize_key(top_raw)
                if not r_top:
                    continue

                # 1. Exact 3-tuple match: (subject, chapter, topic)
                if r_subj and r_chap and (r_subj, r_chap, r_top) in all_curriculum_topics:
                    covered_topics.add((r_subj, r_chap, r_top))
                    continue

                # 2. Known chapter: match strictly within chapter to prevent cross-chapter topic collisions
                matched_chap = False
                if r_chap:
                    # Exact chapter + exact topic
                    for (cs, cc, ct) in all_curriculum_topics:
                        if (not r_subj or cs == r_subj or subjects_match(cs, r_subj)) and cc == r_chap:
                            if ct == r_top:
                                covered_topics.add((cs, cc, ct))
                                matched_chap = True
                                break
                    if matched_chap:
                        continue

                    # Exact chapter + substring topic match
                    for (cs, cc, ct) in all_curriculum_topics:
                        if (not r_subj or cs == r_subj or subjects_match(cs, r_subj)) and cc == r_chap:
                            if len(r_top) >= 4 and (r_top in ct or ct in r_top):
                                covered_topics.add((cs, cc, ct))
                                matched_chap = True
                                break
                    if matched_chap:
                        continue

                    # Fuzzy chapter name match (e.g. "Chapter 1: Real Numbers" vs "Real Numbers")
                    for (cs, cc, ct) in all_curriculum_topics:
                        if (not r_subj or cs == r_subj or subjects_match(cs, r_subj)) and (
                            len(r_chap) >= 4 and (r_chap in cc or cc in r_chap)
                        ):
                            if ct == r_top or (len(r_top) >= 4 and (r_top in ct or ct in r_top)):
                                covered_topics.add((cs, cc, ct))
                                matched_chap = True
                                break
                    if matched_chap:
                        continue

                # 3. Chapter unknown: match by topic across curriculum in matching subject
                matched_any = False
                for (cs, cc, ct) in all_curriculum_topics:
                    if not r_subj or cs == r_subj or subjects_match(cs, r_subj):
                        if ct == r_top:
                            covered_topics.add((cs, cc, ct))
                            matched_any = True
                            break
                if matched_any:
                    continue

                for (cs, cc, ct) in all_curriculum_topics:
                    if not r_subj or cs == r_subj or subjects_match(cs, r_subj):
                        if len(r_top) >= 4 and (r_top in ct or ct in r_top):
                            covered_topics.add((cs, cc, ct))
                            break

    syllabus_coverage_pct = (
        round_half_up(len(covered_topics) / len(all_curriculum_topics) * 100, 1)
        if all_curriculum_topics else 0.0
    )

    # Student summary ranking: strictly only include currently enrolled students (drop sids not in enrolled_ids)
    enrolled_set = set(enrolled_ids)
    per_student_subs: Dict[str, List[Dict[str, Any]]] = {sid: [] for sid in enrolled_ids}
    for s in all_submissions:
        sid = s.get("student_id")
        if not sid or sid not in enrolled_set:
            continue
        per_student_subs[sid].append(s)

    student_summaries = []
    for sid, s_list in per_student_subs.items():
        name = student_map.get(sid, "Student")
        tests_taken = len(s_list)

        # 1. Question-weighted average score (weights a 50-q test higher than a 2-q DPP)
        total_q = 0
        total_corr = 0.0
        student_attempts = []
        for sub_idx, sub in enumerate(s_list):
            results = sub.get("results") or []
            sub_created = sub.get("created_at")
            sub_sess = sub.get("id") or sub.get("submission_id") or sub_created or f"sub_{sub_idx}"
            if results:
                q_cnt = len(results)
                q_corr = sum(1 for r in results if r.get("is_correct"))
                for r in results:
                    student_attempts.append({**r, "created_at": sub_created, "submission_id": sub_sess, "student_id": sid})
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
        weak_count = sum(1 for t in active_mastery if is_confirmed_weak(t))
        strong_count = sum(1 for t in active_mastery if is_confirmed_strong(t))

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
