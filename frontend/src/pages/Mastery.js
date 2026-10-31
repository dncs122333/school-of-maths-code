import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Brain, Target, Loader2, Activity, BookOpenCheck, Sparkles, Compass } from "lucide-react";
import { toast } from "sonner";

const BAND = {
  weak: { label: "Weak", cls: "bg-[#FF6B5E]/20 text-[#1E293B] font-800 border-2 border-[#1E293B]", bar: "#FF6B5E" },
  developing: { label: "Developing", cls: "bg-[#F5C842]/30 text-[#1E293B] font-800 border-2 border-[#1E293B]", bar: "#F5C842" },
  strong: { label: "Strong", cls: "bg-[#4CAF7D]/25 text-[#1E293B] font-800 border-2 border-[#1E293B]", bar: "#4CAF7D" },
  not_attempted: { label: "Not attempted yet", cls: "bg-[#F59E0B]/25 text-[#1E293B] font-800 border-2 border-[#1E293B]", bar: "#F59E0B" },
};

export default function Mastery() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [attemptedTopics, setAttemptedTopics] = useState(null);
  const [fullTopics, setFullTopics] = useState(null);
  const [summary, setSummary] = useState(null);
  const [notAttemptedByChapter, setNotAttemptedByChapter] = useState({});
  const [busy, setBusy] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [showFullRadar, setShowFullRadar] = useState(false);
  const [filterBand, setFilterBand] = useState("all");

  useEffect(() => {
    // 1. Fast load: Fetch attempted topics + summary counts immediately
    api.get("/mastery/me")
      .then((r) => {
        const d = r.data;
        const list = Array.isArray(d) ? d : (d?.topics || []);
        setAttemptedTopics(list);
        setSummary(d?.summary || null);
        setNotAttemptedByChapter(d?.not_attempted_by_chapter || {});
      })
      .catch(() => setAttemptedTopics([]));

    // 2. Lazy-load: Asynchronously load full radar in the background
    setLoadingFull(true);
    api.get("/mastery/me?full=true")
      .then((r) => {
        const d = r.data;
        const list = Array.isArray(d) ? d : (d?.topics || []);
        setFullTopics(list);
        if (d?.summary) setSummary(d.summary);
      })
      .catch(() => {})
      .finally(() => setLoadingFull(false));
  }, []);

  const loadFullRadarExplicitly = () => {
    setShowFullRadar(true);
    if (!fullTopics && !loadingFull) {
      setLoadingFull(true);
      api.get("/mastery/me?full=true")
        .then((r) => {
          const d = r.data;
          setFullTopics(Array.isArray(d) ? d : (d?.topics || []));
        })
        .catch(() => toast.error("Could not load full syllabus radar"))
        .finally(() => setLoadingFull(false));
    }
  };

  const startDiagnostic = async () => {
    setBusy(true);
    try {
      const r = await api.post("/tests/diagnostic", {});
      toast.success("Diagnostic ready — good luck!");
      nav(`/quiz/${r.data.id}`);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const activeTopicList = showFullRadar ? (fullTopics || attemptedTopics || []) : (attemptedTopics || []);
  const displayedTopics = activeTopicList.filter((t) => {
    if (filterBand === "all") return true;
    return t.band === filterBand;
  });

  const weak = summary?.weak_count ?? (activeTopicList.filter((t) => t.band === "weak").length);
  const strong = summary?.strong_count ?? (activeTopicList.filter((t) => t.band === "strong").length);
  const untested = summary?.not_attempted_count ?? (activeTopicList.filter((t) => t.band === "not_attempted").length);
  const totalSyllabus = summary?.total_topics ?? activeTopicList.length;

  return (
    <div className="space-y-8">
      <div className="rounded-3xl bg-[#F5C842] border-[2.5px] border-[#1E293B] p-8 relative overflow-hidden shadow-[4px_4px_0_#1E293B]">
        <span className="inline-block px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] text-xs font-900 uppercase tracking-widest shadow-[2px_2px_0_#1E293B]">
          Your learning map
        </span>
        <h1 className="font-head text-3xl sm:text-4xl font-900 mt-2 tracking-tight text-[#1E293B]">
          MASTERY, {user?.name ? user.name.split(" ")[0].toUpperCase() : "STUDENT"}
        </h1>
        <p className="text-[#1E293B]/80 font-medium mt-2 max-w-lg">
          Weighted by question difficulty and recency. {attemptedTopics === null ? "Crunching your numbers…" : `${weak} weak · ${untested} untested · ${strong} strong across ${totalSyllabus} syllabus topics.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button data-testid="start-diagnostic" onClick={startDiagnostic} disabled={busy}
            className="rounded-full bg-white hover:bg-[#FFF9E8] text-[#1E293B] font-900 border-[2.5px] border-[#1E293B] shadow-[3px_3px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin text-[#1E293B]" /> : <Target className="h-4 w-4 mr-2 text-[#1E293B]" />}
            {attemptedTopics && attemptedTopics.length === 0 ? "Take the diagnostic" : "Re-run diagnostic"}
          </Button>

          {!showFullRadar ? (
            <Button
              type="button"
              onClick={loadFullRadarExplicitly}
              className="rounded-full bg-[#3E7CB1] hover:bg-[#316491] text-white font-900 border-[2.5px] border-[#1E293B] shadow-[3px_3px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px]"
            >
              {loadingFull ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Compass className="h-4 w-4 mr-2" />}
              Load Full Syllabus Radar ({untested} untested)
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => setShowFullRadar(false)}
              className="rounded-full bg-white hover:bg-[#FFF9E8] text-[#1E293B] font-900 border-[2.5px] border-[#1E293B] shadow-[3px_3px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px]"
            >
              <Sparkles className="h-4 w-4 mr-2 text-[#3E7CB1]" />
              Show Attempted Only ({(attemptedTopics || []).length})
            </Button>
          )}
        </div>
      </div>

      {/* Filter Tabs & View Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {[
            { id: "all", label: `All (${activeTopicList.length})` },
            { id: "weak", label: `Weak (${activeTopicList.filter((t) => t.band === "weak").length})` },
            { id: "developing", label: `Developing (${activeTopicList.filter((t) => t.band === "developing").length})` },
            { id: "strong", label: `Strong (${activeTopicList.filter((t) => t.band === "strong").length})` },
            ...(showFullRadar ? [{ id: "not_attempted", label: `Untested (${activeTopicList.filter((t) => t.band === "not_attempted").length})` }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterBand(tab.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-head font-bold border-2 border-[#1E293B] transition-all whitespace-nowrap ${
                filterBand === tab.id
                  ? "bg-[#F5C842] text-[#1E293B] shadow-[2px_2px_0_#1E293B] -translate-y-0.5"
                  : "bg-white text-[#1E293B] hover:bg-[#FFF9E8]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono font-bold text-[#64748B] flex items-center gap-2">
          {loadingFull && (
            <span className="flex items-center gap-1.5 text-[#3E7CB1]">
              <Loader2 className="h-3 w-3 animate-spin" /> Lazy-loading full radar...
            </span>
          )}
          {!loadingFull && (
            <span>
              {showFullRadar ? "Showing full syllabus radar" : `Showing ${(attemptedTopics || []).length} attempted concepts`}
            </span>
          )}
        </div>
      </div>

      {/* Unattempted Topics by Chapter Summary when in Attempted Only view */}
      {!showFullRadar && Object.keys(notAttemptedByChapter).length > 0 && (
        <div className="rounded-3xl bg-[#FFF9E8] border-[2.5px] border-[#1E293B] p-5 shadow-[4px_4px_0_#1E293B] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-[#3E7CB1]" />
              <h4 className="font-head text-sm font-black text-[#1E293B]">
                Unattempted Topics Per Chapter ({untested})
              </h4>
            </div>
            <button
              type="button"
              onClick={loadFullRadarExplicitly}
              className="text-xs font-head font-bold text-[#3E7CB1] hover:underline flex items-center gap-1"
            >
              Expand Full Syllabus Radar
            </button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {Object.entries(notAttemptedByChapter)
              .filter(([, count]) => count > 0)
              .map(([chap, count]) => (
                <span
                  key={chap}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-head font-bold bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                >
                  <span>{chap}</span>
                  <span className="font-mono text-[#E04A3C]">+{count}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {attemptedTopics === null ? (
        <div className="text-[#1E293B] font-medium flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading mastery…</div>
      ) : displayedTopics.length === 0 ? (
        <div className="rounded-3xl bg-white border-[2.5px] border-dashed border-[#1E293B] p-10 text-center shadow-[4px_4px_0_#1E293B]">
          <Brain className="h-10 w-10 text-[#F5C842] mx-auto mb-3" />
          <div className="font-head text-xl font-800 text-[#1E293B]">No topics match this view</div>
          <p className="text-[#1E293B]/70 font-medium mt-1">Take the diagnostic (or any DPP/test) to build your map.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {displayedTopics.map((t) => {
            const b = BAND[t.band] || BAND.developing;
            const isUntested = t.band === "not_attempted";
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
                    <div className="h-full rounded-full transition-all" style={{ width: `${isUntested ? 100 : t.score}%`, backgroundColor: b.bar, opacity: isUntested ? 0.4 : 1 }} />
                  </div>
                  <span className="text-sm font-900 font-mono text-[#1E293B] min-w-14 text-right">
                    {isUntested ? "Untested" : `${t.score}%`}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-[#1E293B]/70">
                  <span className="flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5 text-[#1E293B]" />{" "}
                    {isUntested ? "Not attempted yet" : `${t.attempts} attempts`}
                  </span>
                  {!isUntested && (
                    <span className="flex items-center gap-1">
                      <BookOpenCheck className="h-3.5 w-3.5 text-[#1E293B]" /> {t.avg_time_s}s avg
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
