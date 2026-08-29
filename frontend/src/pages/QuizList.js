import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Plus, FileQuestion, Sparkles, Clock, CheckCircle2, Lock, PlayCircle, Trophy, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";

function timeLeft(iso) {
  const diff = new Date(iso) - new Date();
  if (diff <= 0) return "expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function Leaderboard({ testId }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const toggle = () => {
    if (!open && rows === null) {
      api.get(`/tests/${testId}/leaderboard`).then((r) => setRows(r.data)).catch(() => setRows([]));
    }
    setOpen(!open);
  };
  return (
    <div className="mt-3">
      <button data-testid={`leaderboard-${testId}`} onClick={toggle}
        className="w-full flex items-center justify-center gap-1 text-xs font-600 text-[#94A3B8] hover:text-white py-1 transition-colors">
        <Trophy className="h-3.5 w-3.5" /> Leaderboard
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-3">
          {rows === null ? <div className="text-xs text-[#94A3B8]">Loading…</div>
            : rows.length === 0 ? <div className="text-xs text-[#94A3B8]">No submissions yet.</div>
            : rows.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-[#94A3B8] truncate">{i + 1}. {r.student_name}</span>
                  <span className="font-700 text-white">{r.score}% <span className="text-[#94A3B8] font-400">({r.correct}/{r.total})</span></span>
                </div>
              ))}
        </div>
      )}
    </div>
  );
}

export default function QuizList({ kind }) {
  const { user } = useAuth();
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const isDpp = kind === "dpp";

  useEffect(() => {
    setLoading(true);
    api.get("/tests", { params: { kind } }).then((r) => setItems(r.data)).finally(() => setLoading(false));
  }, [kind]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600">{isDpp ? "Daily Practice" : "Assessments"}</span>
          <h1 className="font-head text-3xl font-700 tracking-tight text-white">{isDpp ? "Practice Problems" : "Timed Tests"}</h1>
        </div>
        {isTeacher && (
          <Button data-testid="new-quiz-btn" asChild className="rounded-full bg-[#3B82F6] text-white font-700 hover:bg-[#60A5FA]">
            <Link to={isDpp ? "/dpp/new" : "/tests/new"}><Plus className="h-4 w-4 mr-1" /> New {isDpp ? "DPP" : "test"}</Link>
          </Button>
        )}
      </div>

      {loading ? <p className="text-[#94A3B8]">Loading…</p> : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#1E293B] p-16 text-center">
          {isDpp ? <Sparkles className="h-10 w-10 mx-auto text-[#94A3B8]/40" /> : <FileQuestion className="h-10 w-10 mx-auto text-[#94A3B8]/40" />}
          <p className="mt-3 text-[#94A3B8]">Nothing here yet{!isTeacher && ". Join a batch to get tests from your teacher."}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((t, i) => {
            const active = isTeacher ? true : t.is_active;
            const done = t.submitted;
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="rounded-3xl bg-[#111827] border border-[#1E293B] p-6 flex flex-col hover:border-[#3B82F6]/40 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-600 uppercase tracking-wide px-2.5 py-1 rounded-full border border-[#06B6D4]/40 bg-[#06B6D4]/10 text-[#06B6D4]">{t.subject}</span>
                  {!isTeacher && (done
                    ? <span className="flex items-center gap-1 text-xs font-700 text-[#34D399]"><CheckCircle2 className="h-4 w-4" /> {t.score}%</span>
                    : active ? <span className="flex items-center gap-1 text-xs font-700 text-[#3B82F6]"><PlayCircle className="h-4 w-4" /> Live</span>
                    : <span className="flex items-center gap-1 text-xs font-600 text-[#94A3B8]/60"><Lock className="h-3.5 w-3.5" /> Closed</span>)}
                </div>
                <h3 className="font-head text-lg font-600 leading-snug text-white">{t.title}</h3>
                <div className="text-xs text-[#94A3B8] mt-1 font-500">Class {t.class_level} • {t.chapter}{t.topic ? ` • ${t.topic}` : ""}</div>
                <div className="mt-4 flex items-center gap-3 text-xs text-[#94A3B8] font-500 font-mono">
                  <span className="flex items-center gap-1"><FileQuestion className="h-3.5 w-3.5" /> {t.question_count} Qs</span>
                  {!isDpp && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {t.duration_minutes} min</span>}
                </div>
                {!isTeacher && !isDpp && active && !done && (
                  <div className="text-xs text-[#3B82F6] font-600 mt-2 font-mono">{timeLeft(t.valid_until)}</div>
                )}
                <div className="mt-5">
                  {isTeacher ? (
                    t.status === "processing" ? (
                      <Button disabled className="w-full rounded-full font-600 bg-[#1E293B] text-[#94A3B8]">Building…</Button>
                    ) : t.status === "failed" ? (
                      <Button disabled className="w-full rounded-full font-600 bg-[#1E293B] text-[#F87171]">Failed</Button>
                    ) : (
                      <Button data-testid={`view-quiz-${t.id}`} asChild variant="outline" className="w-full rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 font-600">
                        <Link to={`/quiz/${t.id}`}>Preview</Link>
                      </Button>
                    )
                  ) : done ? (
                    <Button disabled className="w-full rounded-full font-600 bg-[#1E293B] text-[#94A3B8]">Completed</Button>
                  ) : active ? (
                    <Button data-testid={`start-quiz-${t.id}`} asChild className="w-full rounded-full bg-[#3B82F6] text-white font-700 hover:bg-[#60A5FA]">
                      <Link to={`/quiz/${t.id}`}>{isDpp ? "Practice" : "Start test"}</Link>
                    </Button>
                  ) : (
                    <Button disabled className="w-full rounded-full font-600 bg-[#1E293B] text-[#94A3B8]">Not active</Button>
                  )}
                </div>
                {!isDpp && <Leaderboard testId={t.id} />}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
