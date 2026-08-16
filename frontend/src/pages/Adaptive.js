import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Sparkles, Lock, Unlock, Target, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Adaptive() {
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get("/adaptive").then((r) => setChapters(r.data)).finally(() => setLoading(false)); }, []);

  return (
    <div className="space-y-6">
      <div>
        <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600">Personalised for you</span>
        <h1 className="font-head text-3xl font-700 tracking-tight text-white flex items-center gap-2">For You <Target className="h-6 w-6 text-[#3B82F6]" /></h1>
        <p className="text-[#94A3B8] mt-1">Finish all of a chapter's tests to unlock a booster that re-asks what you got wrong and targets your weak topics.</p>
      </div>

      {loading ? <p className="text-[#94A3B8]">Loading…</p> : chapters.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#1E293B] p-16 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-[#94A3B8]/40" />
          <p className="mt-3 text-[#94A3B8]">No chapters yet. Join a batch and take some tests to build your personalised plan.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {chapters.map((c, i) => {
            const pct = c.total_tests ? Math.round((c.completed / c.total_tests) * 100) : 0;
            const unlocked = !!c.personal_test_id;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={`rounded-3xl bg-[#111827] border p-6 ${unlocked ? "border-[#3B82F6]/50" : "border-[#1E293B]"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-600 uppercase tracking-wide px-2.5 py-1 rounded-full border border-[#06B6D4]/40 bg-[#06B6D4]/10 text-[#06B6D4]">{c.subject}</span>
                  {c.is_complete ? <span className="flex items-center gap-1 text-xs text-[#34D399] font-600"><CheckCircle2 className="h-4 w-4" /> Chapter done</span>
                    : <span className="text-xs text-[#94A3B8] font-mono">{c.completed}/{c.total_tests} tests</span>}
                </div>
                <h3 className="font-head text-lg font-600 mt-3 text-white">{c.chapter}</h3>
                <Progress value={pct} className="h-2 mt-3 bg-[#1E293B]" />

                {c.weak_topics.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-xs text-[#94A3B8] font-600 mb-1.5">Weak topics</div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.weak_topics.map((t, j) => <span key={j} className="text-[11px] px-2 py-0.5 rounded-full border border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171]">{t}</span>)}
                    </div>
                  </div>
                ) : c.is_complete && <div className="mt-4 text-sm text-[#34D399]">No weak topics — great work! ✦</div>}

                <div className="mt-5">
                  {unlocked ? (
                    <Button data-testid={`start-booster-${i}`} asChild className="w-full rounded-full bg-[#3B82F6] text-white font-700 hover:bg-[#60A5FA]">
                      <Link to={`/quiz/${c.personal_test_id}`}><Unlock className="h-4 w-4 mr-1" /> Start booster · {c.personal_question_count} Qs</Link>
                    </Button>
                  ) : (
                    <Button disabled className="w-full rounded-full bg-[#1E293B] text-[#94A3B8] font-600">
                      <Lock className="h-4 w-4 mr-1" /> {c.is_complete ? "No booster needed" : "Finish all tests to unlock"}
                    </Button>
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
