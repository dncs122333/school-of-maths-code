import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Plus, FileQuestion, Sparkles, Clock, CheckCircle2, Lock, PlayCircle } from "lucide-react";
import { motion } from "framer-motion";

function timeLeft(iso) {
  const diff = new Date(iso) - new Date();
  if (diff <= 0) return "expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
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
          <span className="text-xs uppercase tracking-widest text-brand-purple font-700">{isDpp ? "Daily Practice" : "Assessments"}</span>
          <h1 className="font-head text-3xl font-700 tracking-tight">{isDpp ? "Practice Problems" : "Timed Tests"}</h1>
        </div>
        {isTeacher && (
          <Button data-testid="new-quiz-btn" asChild className="rounded-full bg-brand-blue text-brand-ink border-2 border-brand-ink font-700">
            <Link to={isDpp ? "/dpp/new" : "/tests/new"}><Plus className="h-4 w-4 mr-1" /> New {isDpp ? "DPP" : "test"}</Link>
          </Button>
        )}
      </div>

      {loading ? <p className="text-brand-ink/50">Loading…</p> : items.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-brand-ink/20 p-16 text-center">
          {isDpp ? <Sparkles className="h-10 w-10 mx-auto text-brand-ink/30" /> : <FileQuestion className="h-10 w-10 mx-auto text-brand-ink/30" />}
          <p className="mt-3 text-brand-ink/50">Nothing here yet{!isTeacher && ". Join a batch to get tests from your teacher."}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((t, i) => {
            const active = isTeacher ? true : t.is_active;
            const done = t.submitted;
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="rounded-3xl bg-white border-2 border-brand-ink p-6 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-700 uppercase tracking-wide px-2.5 py-1 rounded-full border-2 border-brand-ink bg-brand-yellow">{t.subject}</span>
                  {!isTeacher && (done
                    ? <span className="flex items-center gap-1 text-xs font-700 text-green-600"><CheckCircle2 className="h-4 w-4" /> {t.score}%</span>
                    : active ? <span className="flex items-center gap-1 text-xs font-700 text-brand-purple"><PlayCircle className="h-4 w-4" /> Live</span>
                    : <span className="flex items-center gap-1 text-xs font-600 text-brand-ink/40"><Lock className="h-3.5 w-3.5" /> Closed</span>)}
                </div>
                <h3 className="font-head text-lg font-600 leading-snug">{t.title}</h3>
                <div className="text-xs text-brand-ink/50 mt-1 font-500">Class {t.class_level} • {t.chapter}{t.topic ? ` • ${t.topic}` : ""}</div>
                <div className="mt-4 flex items-center gap-3 text-xs text-brand-ink/60 font-500">
                  <span className="flex items-center gap-1"><FileQuestion className="h-3.5 w-3.5" /> {t.question_count} Qs</span>
                  {!isDpp && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {t.duration_minutes} min</span>}
                </div>
                {!isTeacher && !isDpp && active && !done && (
                  <div className="text-xs text-brand-purple font-600 mt-2">{timeLeft(t.valid_until)}</div>
                )}
                <div className="mt-5">
                  {isTeacher ? (
                    <Button data-testid={`view-quiz-${t.id}`} asChild variant="outline" className="w-full rounded-full border-2 border-brand-ink/15 font-600">
                      <Link to={`/quiz/${t.id}`}>Preview</Link>
                    </Button>
                  ) : done ? (
                    <Button disabled className="w-full rounded-full font-600" variant="secondary">Completed</Button>
                  ) : active ? (
                    <Button data-testid={`start-quiz-${t.id}`} asChild className="w-full rounded-full bg-brand-ink text-white font-700">
                      <Link to={`/quiz/${t.id}`}>{isDpp ? "Practice" : "Start test"}</Link>
                    </Button>
                  ) : (
                    <Button disabled className="w-full rounded-full font-600" variant="secondary">Not active</Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
