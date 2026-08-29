import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Clock, CheckCircle2, XCircle, ArrowLeft, Trophy, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function QuizRunner() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [secs, setSecs] = useState(null);
  const [submitting, setSubmitting] = useState(false);
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
        if (!isTeacher && r.data.kind === "test") setSecs(r.data.duration_minutes * 60);
      })
      .catch((e) => { toast.error(formatApiErrorDetail(e.response?.data?.detail)); nav(-1); });
  }, [id]);

  useEffect(() => { idxRef.current = idx; }, [idx]);

  const recordTime = useCallback(() => {
    const now = Date.now();
    const elapsed = (now - questionStartRef.current) / 1000;
    timesRef.current[idxRef.current] = (timesRef.current[idxRef.current] || 0) + elapsed;
    questionStartRef.current = now;
  }, []);

  // Track tab/window switches as an anti-cheat signal (flag >= 3 server-side).
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
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); submitted.current = false; }
    finally { setSubmitting(false); }
  }, [answers, id, recordTime]);

  useEffect(() => {
    if (secs === null || result) return;
    if (secs <= 0) { doSubmit(); return; }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs, result, doSubmit]);

  if (!quiz) return <div className="py-20 text-center text-[#94A3B8]">Loading…</div>;

  // ---------- Result view ----------
  if (result) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="rounded-3xl bg-[#111827] border border-[#1E293B] p-8 text-center relative overflow-hidden">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-dashed border-white/10 animate-spin-slow" />
          <Trophy className="h-12 w-12 mx-auto text-[#FBBF24] relative" />
          <div className="font-head text-5xl font-700 mt-3 text-white relative">{result.score}%</div>
          <p className="text-[#94A3B8] mt-1 relative font-mono">{result.correct} / {result.total} correct</p>
        </div>
        <div className="mt-6 space-y-4">
          {result.review.map((q, i) => (
            <div key={i} className="rounded-2xl bg-[#111827] border border-[#1E293B] p-5">
              <div className="flex items-start gap-2">
                {q.is_correct ? <CheckCircle2 className="h-5 w-5 text-[#34D399] shrink-0 mt-0.5" /> : <XCircle className="h-5 w-5 text-[#F87171] shrink-0 mt-0.5" />}
                <p className="font-600 text-white">{i + 1}. {q.question}</p>
              </div>
              <div className="mt-3 space-y-1.5 pl-7">
                {q.options.map((o, j) => (
                  <div key={j} className={`text-sm px-3 py-2 rounded-xl border ${j === q.correct_index ? "border-[#34D399]/50 bg-[#34D399]/10 text-[#D1FAE5]" : j === q.chosen ? "border-[#F87171]/50 bg-[#F87171]/10 text-[#FECACA]" : "border-[#1E293B] bg-[#0B0F19] text-[#94A3B8]"}`}>{o}</div>
                ))}
                {q.explanation && <p className="text-sm text-[#94A3B8] mt-2">✦ {q.explanation}</p>}
              </div>
            </div>
          ))}
        </div>
        <Button data-testid="result-done-btn" onClick={() => nav(quiz.kind === "dpp" ? "/dpp" : "/tests")} className="w-full mt-6 rounded-full bg-[#3B82F6] text-white font-700 h-11 hover:bg-[#60A5FA]">Done</Button>
      </div>
    );
  }

  // ---------- Teacher preview ----------
  if (isTeacher) {
    return (
      <div className="max-w-2xl mx-auto">
        <Button asChild variant="ghost" className="rounded-full mb-4 -ml-2 text-[#94A3B8] hover:text-white hover:bg-white/5"><Link to={quiz.kind === "dpp" ? "/dpp" : "/tests"}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
        <h1 className="font-head text-2xl font-700 text-white">{quiz.title} <span className="text-sm font-500 text-[#94A3B8]">(answer key)</span></h1>
        <div className="mt-6 space-y-4">
          {quiz.questions.map((q, i) => (
            <div key={i} className="rounded-2xl bg-[#111827] border border-[#1E293B] p-5">
              <p className="font-600 text-white">{i + 1}. {q.question}</p>
              <div className="mt-3 space-y-1.5">
                {q.options.map((o, j) => (
                  <div key={j} className={`text-sm px-3 py-2 rounded-xl border ${j === q.correct_index ? "border-[#34D399]/50 bg-[#34D399]/10 text-[#D1FAE5] font-600" : "border-[#1E293B] bg-[#0B0F19] text-[#94A3B8]"}`}>{o}</div>
                ))}
              </div>
              {q.explanation && <p className="text-sm text-[#94A3B8] mt-2">✦ {q.explanation}</p>}
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
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-16 z-30 bg-[#0B0F19]/85 backdrop-blur-xl border border-[#1E293B] rounded-2xl p-4 mb-6 flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="text-sm font-600 truncate text-white">{quiz.title}</div>
          <Progress value={(answered / quiz.questions.length) * 100} className="h-2 mt-1 bg-[#1E293B]" />
        </div>
        {!isDpp && secs !== null && (
          <div data-testid="timer" className={`flex items-center gap-1.5 font-mono font-700 text-lg px-3 py-1.5 rounded-xl border ${low ? "bg-[#F87171]/15 border-[#F87171]/40 text-[#F87171] animate-pulse" : "bg-[#3B82F6]/10 border-[#3B82F6]/40 text-[#3B82F6]"}`}>
            <Clock className="h-4 w-4" /> {mm}:{ss}
          </div>
        )}
      </div>

      <div className="rounded-3xl bg-[#111827] border border-[#1E293B] p-6 sm:p-8">
        <div className="text-xs uppercase tracking-widest text-[#06B6D4] font-600 mb-2 font-mono">Question {idx + 1} of {quiz.questions.length}</div>
        <p className="font-head text-xl font-600 leading-snug text-white">{q.question}</p>
        <div className="mt-6 space-y-3">
          {q.options.map((o, j) => (
            <button key={j} data-testid={`option-${j}`} onClick={() => pick(j)}
              className={`w-full text-left px-4 py-3.5 rounded-2xl border font-500 transition-colors flex items-center gap-3 ${answers[idx] === j ? "border-[#3B82F6] ring-2 ring-[#3B82F6] bg-[#3B82F6]/10 text-white" : "border-[#1E293B] bg-[#0B0F19] text-[#D1D5DB] hover:border-[#3B82F6]/40"}`}>
              <span className={`h-7 w-7 shrink-0 rounded-lg border flex items-center justify-center text-sm font-700 font-mono ${answers[idx] === j ? "border-[#3B82F6] bg-[#3B82F6] text-white" : "border-[#1E293B] text-[#94A3B8]"}`}>{String.fromCharCode(65 + j)}</span>
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 gap-3">
        <Button data-testid="prev-btn" variant="outline" disabled={idx === 0} onClick={() => goTo(idx - 1)} className="rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 font-600"><ChevronLeft className="h-4 w-4 mr-1" /> Prev</Button>
        {idx < quiz.questions.length - 1 ? (
          <Button data-testid="next-btn" onClick={() => goTo(idx + 1)} className="rounded-full bg-[#3B82F6] text-white font-600 hover:bg-[#60A5FA]">Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
        ) : (
          <Button data-testid="submit-quiz-btn" onClick={doSubmit} disabled={submitting} className="rounded-full bg-[#34D399] text-[#0B0F19] font-700 hover:bg-[#6EE7B7]">{submitting ? "Submitting…" : "Submit"}</Button>
        )}
      </div>
    </div>
  );
}
