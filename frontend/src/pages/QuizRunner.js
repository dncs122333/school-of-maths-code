import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import {
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Lightbulb,
  Tag,
  Target
} from "lucide-react";
import { toast } from "sonner";

export default function QuizRunner() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [secs, setSecs] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const submitted = useRef(false);
  const timesRef = useRef([]);
  const questionStartRef = useRef(Date.now());
  const tabSwitchesRef = useRef(0);
  const idxRef = useRef(0);

  useEffect(() => {
    api.get(`/tests/${id}`)
      .then((r) => {
        setQuiz(r.data);
        setAnswers(new Array(r.data.questions.length).fill(-1));
        timesRef.current = new Array(r.data.questions.length).fill(0);
        questionStartRef.current = Date.now();
        if (!isTeacher && Number(r.data.duration_minutes) > 0) setSecs(Number(r.data.duration_minutes) * 60);
      })
      .catch((e) => { toast.error(formatApiErrorDetail(e.response?.data?.detail)); nav(-1); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { idxRef.current = idx; setShowHint(false); }, [idx]);

  const recordTime = useCallback(() => {
    const now = Date.now();
    const elapsed = (now - questionStartRef.current) / 1000;
    timesRef.current[idxRef.current] = (timesRef.current[idxRef.current] || 0) + elapsed;
    questionStartRef.current = now;
  }, []);

  // Track tab/window switches as an anti-cheat signal
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "hidden") tabSwitchesRef.current += 1;
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const goTo = useCallback((i) => { recordTime(); setIdx(i); }, [recordTime]);

  const doSubmit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    recordTime();
    try {
      const r = await api.post(`/tests/${id}/submit`, {
        answers,
        times: timesRef.current,
        tab_switches: tabSwitchesRef.current,
      });
      setResult(r.data);
      window.scrollTo(0, 0);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
      submitted.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [answers, id, recordTime]);

  useEffect(() => {
    if (secs === null || result) return;
    if (secs <= 0) { doSubmit(); return; }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs, result, doSubmit]);

  if (!quiz) return <div className="py-20 text-center text-[#64748B] font-bold">Loading assessment…</div>;

  // ---------- Result view ----------
  if (result) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="rounded-3xl bg-[#F5C842] border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-8 text-center text-[#1E293B]">
          <Trophy className="h-14 w-14 mx-auto text-[#1E293B]" />
          <div className="font-head text-5xl font-black mt-2 text-[#1E293B]">{result.score}%</div>
          <p className="text-sm font-head font-bold uppercase tracking-wider text-[#1E293B] mt-1">
            {result.correct} / {result.total} Correct
          </p>
        </div>

        {/* Chapter Topic Mastery Breakdown */}
        {result.topic_summary && result.topic_summary.length > 0 && (
          <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-6 space-y-4">
            <div className="flex items-center gap-2 font-head font-bold text-lg text-[#1E293B]">
              <Target className="h-5 w-5 text-[#2F8A5F]" />
              Chapter Topic Performance
            </div>
            <div className="space-y-3">
              {result.topic_summary.map((ts, idx) => {
                const acc = ts.accuracy ?? 0;
                const colorBg = acc >= 70 ? "bg-[#2F8A5F]" : acc >= 40 ? "bg-[#F5C842]" : "bg-[#E04A3C]";
                return (
                  <div key={idx} className="p-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[#1E293B]">
                      <span className="flex items-center gap-1.5 font-head">
                        <Tag className="h-3.5 w-3.5 text-[#5B9BD5]" />
                        {ts.topic}
                      </span>
                      <span className="font-mono">
                        {ts.correct} / {ts.total} ({acc}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white border border-[#1E293B] overflow-hidden">
                      <div className={`h-full ${colorBg}`} style={{ width: `${acc}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {result.review.map((q, i) => (
            <div key={i} className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  {q.is_correct ? (
                    <CheckCircle2 className="h-5 w-5 text-[#2F8A5F] shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-[#E04A3C] shrink-0 mt-0.5" />
                  )}
                  <p className="font-head font-bold text-base text-[#1E293B]">{i + 1}. {q.question}</p>
                </div>
                {q.topic && (
                  <Badge variant="outline" className="text-[10px] bg-[#FFF9E8] border-[#1E293B] shrink-0 font-bold">
                    {q.topic}
                  </Badge>
                )}
              </div>

              <div className="mt-3 space-y-1.5 pl-7">
                {q.options.map((o, j) => (
                  <div
                    key={j}
                    className={`text-xs px-3.5 py-2.5 rounded-xl border-2 border-[#1E293B] font-bold ${
                      j === q.correct_index
                        ? "bg-[#2F8A5F] text-white"
                        : j === q.chosen
                        ? "bg-[#E04A3C] text-white"
                        : "bg-[#FFF9E8] text-[#1E293B]"
                    }`}
                  >
                    {o}
                  </div>
                ))}
                {q.explanation && (
                  <p className="text-xs text-[#1E293B] mt-2 font-medium bg-[#FFF9E8] p-3 rounded-xl border border-[#1E293B] leading-relaxed">
                    <span className="font-bold text-[#2F8A5F] block mb-0.5">✦ Step-by-Step Explanation:</span>
                    {q.explanation}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button
          data-testid="result-done-btn"
          onClick={() => nav(quiz.kind === "dpp" ? "/dpp" : "/tests")}
          className="w-full rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] font-head font-black h-12 uppercase tracking-wider active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          Done
        </Button>
      </div>
    );
  }

  // ---------- Teacher preview ----------
  if (isTeacher) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Button asChild variant="ghost" className="rounded-full -ml-2 text-[#1E293B] hover:underline font-bold">
          <Link to={quiz.kind === "dpp" ? "/dpp" : "/tests"}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to library
          </Link>
        </Button>
        <div className="p-6 rounded-3xl bg-[#F5C842] border-[3px] border-[#1E293B] shadow-[5px_5px_0_#1E293B]">
          <h1 className="font-head text-2xl sm:text-3xl font-black text-[#1E293B] uppercase">{quiz.title}</h1>
          <span className="text-xs font-head font-bold uppercase tracking-wider text-[#1E293B]/80 mt-1 block">
            Teacher Answer Key Preview • {quiz.questions.length} Questions
          </span>
        </div>
        <div className="space-y-4">
          {quiz.questions.map((q, i) => (
            <div key={i} className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="font-head font-bold text-base text-[#1E293B]">{i + 1}. {q.question}</p>
                {q.topic && (
                  <Badge variant="outline" className="text-[10px] bg-[#FFF9E8] border-[#1E293B] font-bold shrink-0">
                    {q.topic}
                  </Badge>
                )}
              </div>
              <div className="mt-3 space-y-1.5">
                {q.options.map((o, j) => (
                  <div
                    key={j}
                    className={`text-xs px-3.5 py-2.5 rounded-xl border-2 border-[#1E293B] font-bold ${
                      j === q.correct_index ? "bg-[#2F8A5F] text-white" : "bg-[#FFF9E8] text-[#1E293B]"
                    }`}
                  >
                    {o}
                  </div>
                ))}
              </div>
              {q.explanation && (
                <p className="text-xs text-[#1E293B] mt-2 font-medium bg-[#FFF9E8] p-2.5 rounded-xl border border-[#1E293B]">
                  ✦ {q.explanation}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- Student runner ----------
  const q = quiz.questions[idx];
  const isDpp = quiz.kind === "dpp";
  const answered = answers.filter((a) => a !== -1).length;
  const mm = secs !== null ? String(Math.floor(secs / 60)).padStart(2, "0") : "";
  const ss = secs !== null ? String(secs % 60).padStart(2, "0") : "";
  const low = secs !== null && secs < 60;

  const pick = (j) => setAnswers((a) => { const n = [...a]; n[idx] = j; return n; });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="sticky top-16 z-30 bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] rounded-2xl p-4 flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="text-xs font-head font-bold truncate text-[#1E293B] uppercase">{quiz.title}</div>
          <Progress value={(answered / quiz.questions.length) * 100} className="h-2.5 mt-1.5 bg-[#FFF9E8] border border-[#1E293B]" />
        </div>
        {secs !== null && (
          <div data-testid="timer" className={`flex items-center gap-1.5 font-mono font-bold text-base px-3 py-1 rounded-xl border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] ${low ? "bg-[#E04A3C] text-white animate-pulse" : "bg-[#FFF9E8] text-[#1E293B]"}`}>
            <Clock className="h-4 w-4" /> {mm}:{ss}
          </div>
        )}
      </div>

      <div className="rounded-3xl bg-white border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs uppercase tracking-widest text-[#3E7CB1] font-head font-extrabold">
            Question {idx + 1} of {quiz.questions.length}
          </div>
          <div className="flex items-center gap-1.5">
            {isTeacher && q.topic && (
              <Badge variant="outline" className="text-[10px] bg-[#FFF9E8] border-[#1E293B] text-[#1E293B] font-bold">
                {q.topic}
              </Badge>
            )}
            {q.difficulty && (
              <Badge variant="outline" className="text-[10px] bg-white border-[#1E293B] text-[#64748B] font-bold capitalize">
                {q.difficulty}
              </Badge>
            )}
          </div>
        </div>

        <p className="font-head text-xl font-extrabold leading-snug text-[#1E293B]">{q.question}</p>

        {/* Practice mode hint */}
        {isDpp && q.hint && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowHint(!showHint)}
              className="text-xs font-bold text-[#64748B] hover:text-[#1E293B] flex items-center gap-1 transition-colors"
            >
              <Lightbulb className="h-3.5 w-3.5 text-[#F5C842]" />
              {showHint ? "Hide Hint" : "Need a Hint?"}
            </button>
            {showHint && (
              <div className="mt-1.5 p-2.5 rounded-xl bg-[#FFF9E8] border border-[#1E293B] text-xs text-[#1E293B] font-medium animate-in fade-in">
                💡 {q.hint}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {q.options.map((o, j) => (
            <button
              key={j}
              data-testid={`option-${j}`}
              onClick={() => pick(j)}
              className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 border-[#1E293B] font-head font-bold text-sm transition-all flex items-center gap-3 ${
                answers[idx] === j
                  ? "bg-[#F5C842] text-[#1E293B] shadow-[3px_3px_0_#1E293B] -translate-y-0.5"
                  : "bg-[#FFF9E8] text-[#1E293B] hover:bg-white"
              }`}
            >
              <span className={`h-7 w-7 shrink-0 rounded-lg border-2 border-[#1E293B] flex items-center justify-center text-xs font-black font-mono ${answers[idx] === j ? "bg-white text-[#1E293B]" : "bg-white text-[#1E293B]"}`}>
                {String.fromCharCode(65 + j)}
              </span>
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button
          data-testid="prev-btn"
          variant="outline"
          disabled={idx === 0}
          onClick={() => goTo(idx - 1)}
          className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] font-head font-bold active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Prev
        </Button>
        {idx < quiz.questions.length - 1 ? (
          <Button
            data-testid="next-btn"
            onClick={() => goTo(idx + 1)}
            className="rounded-full bg-[#3E7CB1] hover:bg-[#336894] text-white border-2 border-[#1E293B] font-head font-bold active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            data-testid="submit-quiz-btn"
            onClick={doSubmit}
            disabled={submitting}
            className="rounded-full bg-[#2F8A5F] hover:bg-[#26734E] text-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] font-head font-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            {submitting ? "Submitting…" : "Submit Assessment"}
          </Button>
        )}
      </div>
    </div>
  );
}
