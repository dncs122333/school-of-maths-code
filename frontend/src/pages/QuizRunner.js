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

  useEffect(() => {
    api.get(`/tests/${id}`)
      .then((r) => {
        setQuiz(r.data);
        setAnswers(new Array(r.data.questions.length).fill(-1));
        if (!isTeacher && r.data.kind === "test") setSecs(r.data.duration_minutes * 60);
      })
      .catch((e) => { toast.error(formatApiErrorDetail(e.response?.data?.detail)); nav(-1); });
  }, [id]);

  const doSubmit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    try {
      const r = await api.post(`/tests/${id}/submit`, { answers });
      setResult(r.data);
      window.scrollTo(0, 0);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); submitted.current = false; }
    finally { setSubmitting(false); }
  }, [answers, id]);

  useEffect(() => {
    if (secs === null || result) return;
    if (secs <= 0) { doSubmit(); return; }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs, result, doSubmit]);

  if (!quiz) return <div className="py-20 text-center text-brand-ink/50">Loading…</div>;

  // ---------- Result view ----------
  if (result) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="rounded-3xl bg-brand-ink text-white p-8 text-center relative overflow-hidden">
          <Trophy className="h-12 w-12 mx-auto text-brand-yellow" />
          <div className="font-head text-5xl font-700 mt-3">{result.score}%</div>
          <p className="text-white/70 mt-1">{result.correct} / {result.total} correct</p>
        </div>
        <div className="mt-6 space-y-4">
          {result.review.map((q, i) => (
            <div key={i} className="rounded-2xl bg-white border-2 border-brand-ink p-5">
              <div className="flex items-start gap-2">
                {q.is_correct ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" /> : <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />}
                <p className="font-600">{i + 1}. {q.question}</p>
              </div>
              <div className="mt-3 space-y-1.5 pl-7">
                {q.options.map((o, j) => (
                  <div key={j} className={`text-sm px-3 py-2 rounded-xl border-2 ${j === q.correct_index ? "border-green-500 bg-green-50" : j === q.chosen ? "border-red-400 bg-red-50" : "border-transparent bg-muted"}`}>{o}</div>
                ))}
                {q.explanation && <p className="text-sm text-brand-ink/60 mt-2">💡 {q.explanation}</p>}
              </div>
            </div>
          ))}
        </div>
        <Button data-testid="result-done-btn" onClick={() => nav(quiz.kind === "dpp" ? "/dpp" : "/tests")} className="w-full mt-6 rounded-full bg-brand-ink text-white font-700 h-11">Done</Button>
      </div>
    );
  }

  // ---------- Teacher preview ----------
  if (isTeacher) {
    return (
      <div className="max-w-2xl mx-auto">
        <Button asChild variant="ghost" className="rounded-full mb-4 -ml-2"><Link to={quiz.kind === "dpp" ? "/dpp" : "/tests"}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
        <h1 className="font-head text-2xl font-700">{quiz.title} <span className="text-sm font-500 text-brand-ink/50">(answer key)</span></h1>
        <div className="mt-6 space-y-4">
          {quiz.questions.map((q, i) => (
            <div key={i} className="rounded-2xl bg-white border-2 border-brand-ink p-5">
              <p className="font-600">{i + 1}. {q.question}</p>
              <div className="mt-3 space-y-1.5">
                {q.options.map((o, j) => (
                  <div key={j} className={`text-sm px-3 py-2 rounded-xl border-2 ${j === q.correct_index ? "border-green-500 bg-green-50 font-600" : "border-transparent bg-muted"}`}>{o}</div>
                ))}
              </div>
              {q.explanation && <p className="text-sm text-brand-ink/60 mt-2">💡 {q.explanation}</p>}
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
      <div className="sticky top-16 z-30 bg-white/85 backdrop-blur-xl border-2 border-brand-ink rounded-2xl p-4 mb-6 flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="text-sm font-600 truncate">{quiz.title}</div>
          <Progress value={(answered / quiz.questions.length) * 100} className="h-2 mt-1" />
        </div>
        {!isDpp && secs !== null && (
          <div data-testid="timer" className={`flex items-center gap-1.5 font-head font-700 text-lg px-3 py-1.5 rounded-xl border-2 border-brand-ink ${low ? "bg-red-100 text-red-600 animate-pulse" : "bg-brand-yellow"}`}>
            <Clock className="h-4 w-4" /> {mm}:{ss}
          </div>
        )}
      </div>

      <div className="rounded-3xl bg-white border-2 border-brand-ink p-6 sm:p-8">
        <div className="text-xs uppercase tracking-widest text-brand-purple font-700 mb-2">Question {idx + 1} of {quiz.questions.length}</div>
        <p className="font-head text-xl font-600 leading-snug">{q.question}</p>
        <div className="mt-6 space-y-3">
          {q.options.map((o, j) => (
            <button key={j} data-testid={`option-${j}`} onClick={() => pick(j)}
              className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 font-500 transition-colors flex items-center gap-3 ${answers[idx] === j ? "border-brand-ink bg-brand-blue/20" : "border-border hover:border-brand-ink/40"}`}>
              <span className={`h-7 w-7 shrink-0 rounded-lg border-2 flex items-center justify-center text-sm font-700 ${answers[idx] === j ? "border-brand-ink bg-brand-ink text-white" : "border-brand-ink/20"}`}>{String.fromCharCode(65 + j)}</span>
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 gap-3">
        <Button data-testid="prev-btn" variant="outline" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)} className="rounded-full border-2 border-brand-ink/15 font-600"><ChevronLeft className="h-4 w-4 mr-1" /> Prev</Button>
        {idx < quiz.questions.length - 1 ? (
          <Button data-testid="next-btn" onClick={() => setIdx((i) => i + 1)} className="rounded-full bg-brand-ink text-white font-600">Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
        ) : (
          <Button data-testid="submit-quiz-btn" onClick={doSubmit} disabled={submitting} className="rounded-full bg-brand-blue text-brand-ink border-2 border-brand-ink font-700">{submitting ? "Submitting…" : "Submit"}</Button>
        )}
      </div>
    </div>
  );
}
