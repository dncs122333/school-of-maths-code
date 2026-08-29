import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Brain, Target, Loader2, Activity, BookOpenCheck } from "lucide-react";
import { toast } from "sonner";

const BAND = {
  weak: { label: "Weak", cls: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30", bar: "#F87171" },
  developing: { label: "Developing", cls: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30", bar: "#FBBF24" },
  strong: { label: "Strong", cls: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30", bar: "#34D399" },
};

export default function Mastery() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [topics, setTopics] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/mastery/me").then((r) => setTopics(r.data)).catch(() => setTopics([]));
  }, []);

  const startDiagnostic = async () => {
    setBusy(true);
    try {
      const r = await api.post("/tests/diagnostic", {});
      toast.success("Diagnostic ready — good luck!");
      nav(`/quiz/${r.data.id}`);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const weak = (topics || []).filter((t) => t.band === "weak").length;
  const strong = (topics || []).filter((t) => t.band === "strong").length;

  return (
    <div className="space-y-8">
      <div className="rounded-3xl bg-[#111827] border border-[#1E293B] p-8 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[#3B82F6]/10 blur-3xl" />
        <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600 relative">Your learning map</span>
        <h1 className="font-head text-3xl sm:text-4xl font-700 mt-2 tracking-tight text-white relative">Mastery, {user.name.split(" ")[0]}</h1>
        <p className="text-[#94A3B8] mt-2 max-w-lg relative">
          Weighted by question difficulty and recency. {topics === null ? "Crunching your numbers…" : `${weak} weak · ${strong} strong across ${(topics || []).length} topics.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-3 relative">
          <Button data-testid="start-diagnostic" onClick={startDiagnostic} disabled={busy}
            className="rounded-full bg-[#3B82F6] text-white font-700 hover:bg-[#60A5FA] glow-blue">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Target className="h-4 w-4 mr-2" />}
            {topics && topics.length === 0 ? "Take the diagnostic" : "Re-run diagnostic"}
          </Button>
        </div>
      </div>

      {topics === null ? (
        <div className="text-[#94A3B8] flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading mastery…</div>
      ) : topics.length === 0 ? (
        <div className="rounded-3xl bg-[#111827] border border-[#1E293B] p-10 text-center">
          <Brain className="h-10 w-10 text-[#06B6D4] mx-auto mb-3" />
          <div className="font-head text-lg font-600 text-white">No mastery data yet</div>
          <p className="text-[#94A3B8] mt-1">Take the diagnostic (or any DPP/test) to build your map.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {topics.map((t) => {
            const b = BAND[t.band] || BAND.developing;
            return (
              <div key={`${t.subject}|${t.chapter}|${t.topic}`} className="rounded-3xl bg-[#111827] border border-[#1E293B] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-head font-600 text-white">{t.topic}</div>
                    <div className="text-xs text-[#94A3B8] mt-0.5">{t.chapter} · {t.subject}</div>
                  </div>
                  <Badge data-testid="band-badge" className={`border ${b.cls}`}>{b.label}</Badge>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Progress value={t.score} className="h-2" />
                  <span className="text-sm font-600 text-white w-12 text-right">{t.score}%</span>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-[#94A3B8]">
                  <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> {t.attempts} attempts</span>
                  <span className="flex items-center gap-1"><BookOpenCheck className="h-3.5 w-3.5" /> {t.avg_time_s}s avg</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
