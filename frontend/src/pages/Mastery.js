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
  weak: { label: "Weak", cls: "bg-[#FF6B5E]/20 text-[#1E293B] font-800 border-2 border-[#1E293B]", bar: "#FF6B5E" },
  developing: { label: "Developing", cls: "bg-[#F5C842]/30 text-[#1E293B] font-800 border-2 border-[#1E293B]", bar: "#F5C842" },
  strong: { label: "Strong", cls: "bg-[#4CAF7D]/25 text-[#1E293B] font-800 border-2 border-[#1E293B]", bar: "#4CAF7D" },
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
      <div className="rounded-3xl bg-[#F5C842] border-[2.5px] border-[#1E293B] p-8 relative overflow-hidden shadow-[4px_4px_0_#1E293B]">
        <span className="inline-block px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] text-xs font-900 uppercase tracking-widest shadow-[2px_2px_0_#1E293B]">
          Your learning map
        </span>
        <h1 className="font-head text-3xl sm:text-4xl font-900 mt-2 tracking-tight text-[#1E293B]">
          MASTERY, {user.name.split(" ")[0].toUpperCase()}
        </h1>
        <p className="text-[#1E293B]/80 font-medium mt-2 max-w-lg">
          Weighted by question difficulty and recency. {topics === null ? "Crunching your numbers…" : `${weak} weak · ${strong} strong across ${(topics || []).length} topics.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button data-testid="start-diagnostic" onClick={startDiagnostic} disabled={busy}
            className="rounded-full bg-white hover:bg-[#FFF9E8] text-[#1E293B] font-900 border-[2.5px] border-[#1E293B] shadow-[3px_3px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin text-[#1E293B]" /> : <Target className="h-4 w-4 mr-2 text-[#1E293B]" />}
            {topics && topics.length === 0 ? "Take the diagnostic" : "Re-run diagnostic"}
          </Button>
        </div>
      </div>

      {topics === null ? (
        <div className="text-[#1E293B] font-medium flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading mastery…</div>
      ) : topics.length === 0 ? (
        <div className="rounded-3xl bg-white border-[2.5px] border-dashed border-[#1E293B] p-10 text-center shadow-[4px_4px_0_#1E293B]">
          <Brain className="h-10 w-10 text-[#F5C842] mx-auto mb-3" />
          <div className="font-head text-xl font-800 text-[#1E293B]">No mastery data yet</div>
          <p className="text-[#1E293B]/70 font-medium mt-1">Take the diagnostic (or any DPP/test) to build your map.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {topics.map((t) => {
            const b = BAND[t.band] || BAND.developing;
            return (
              <div key={`${t.subject}|${t.chapter}|${t.topic}`} className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-5 shadow-[4px_4px_0_#1E293B]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-head font-800 text-lg text-[#1E293B]">{t.topic}</div>
                    <div className="text-xs font-semibold text-[#1E293B]/60 mt-0.5">{t.chapter} · {t.subject}</div>
                  </div>
                  <Badge data-testid="band-badge" className={`border-2 ${b.cls}`}>{b.label}</Badge>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1 h-3 rounded-full bg-[#FFF9E8] border-2 border-[#1E293B] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${t.score}%`, backgroundColor: b.bar }} />
                  </div>
                  <span className="text-sm font-900 font-mono text-[#1E293B] w-12 text-right">{t.score}%</span>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-[#1E293B]/70">
                  <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5 text-[#1E293B]" /> {t.attempts} attempts</span>
                  <span className="flex items-center gap-1"><BookOpenCheck className="h-3.5 w-3.5 text-[#1E293B]" /> {t.avg_time_s}s avg</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
