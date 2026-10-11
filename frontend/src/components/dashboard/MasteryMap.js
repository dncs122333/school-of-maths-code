import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Sparkles, Target, Compass, Clock, Activity, Zap, ArrowUpRight } from "lucide-react";
import { CircularProgress } from "./WeakTopicCard";

const BAND_CONFIG = {
  weak: {
    label: "Weak",
    glow: "border-[#FF6B5E] bg-[#FF6B5E]/10 text-[#FF6B5E]",
    barColor: "bg-[#FF6B5E]",
    badgeCls: "bg-[#FF6B5E] text-white border-2 border-[#1E293B]",
    dot: "bg-white",
  },
  developing: {
    label: "Developing",
    glow: "border-[#F5C842] bg-[#F5C842]/10 text-[#1E293B]",
    barColor: "bg-[#F5C842]",
    badgeCls: "bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B]",
    dot: "bg-[#1E293B]",
  },
  strong: {
    label: "Strong",
    glow: "border-[#4CAF7D] bg-[#4CAF7D]/10 text-[#4CAF7D]",
    barColor: "bg-[#4CAF7D]",
    badgeCls: "bg-[#4CAF7D] text-white border-2 border-[#1E293B]",
    dot: "bg-white",
  },
};

export default function MasteryMap({ topics = [], onStartDiagnostic, onPracticeTopic }) {
  const [filterSubject, setFilterSubject] = useState("all");
  const [selectedTopic, setSelectedTopic] = useState(null);

  const subjects = Array.from(new Set(topics.map((t) => t.subject).filter(Boolean)));
  const filteredTopics = topics.filter((t) => {
    if (filterSubject === "all") return true;
    return (t.subject || "").toLowerCase() === filterSubject.toLowerCase();
  });

  // AI Focus Today: pick the weakest topic or first weak topic
  const focusTopic =
    topics.find((t) => t.band === "weak") ||
    topics.find((t) => t.band === "developing") ||
    topics[0];

  return (
    <div className="space-y-6">
      {/* 1. Header & Subject Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-[#5B9BD5] font-head font-bold">
              Knowledge Topology
            </span>
            <span className="h-2 w-2 rounded-full bg-[#4CAF7D]" />
            <span className="text-xs text-[#64748B] font-mono font-bold">{topics.length} concepts indexed</span>
          </div>
          <h2 className="font-head text-2xl sm:text-3xl font-900 text-[#1E293B] mt-1">
            Mastery Radar
          </h2>
        </div>

        {/* Subject Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1">
          <button
            type="button"
            onClick={() => setFilterSubject("all")}
            className={`px-4 py-1.5 rounded-full text-xs font-head font-bold border-2 border-[#1E293B] transition-all ${
              filterSubject === "all"
                ? "bg-[#F5C842] text-[#1E293B] shadow-[2px_2px_0_#1E293B] -translate-y-0.5"
                : "bg-white text-[#1E293B] hover:bg-[#FFF9E8]"
            }`}
          >
            All ({topics.length})
          </button>
          {subjects.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterSubject(s)}
              className={`px-4 py-1.5 rounded-full text-xs font-head font-bold border-2 border-[#1E293B] transition-all whitespace-nowrap ${
                filterSubject === s
                  ? "bg-[#F5C842] text-[#1E293B] shadow-[2px_2px_0_#1E293B] -translate-y-0.5"
                  : "bg-white text-[#1E293B] hover:bg-[#FFF9E8]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 2. AI Focus Today Hero Capsule */}
      {focusTopic && (
        <div className="rounded-3xl bg-[#FFF9E8] border-[2.5px] border-[#1E293B] p-6 shadow-[4px_4px_0_#1E293B]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-head font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                  <Sparkles className="h-3.5 w-3.5 text-[#1E293B]" /> AI High-ROI Focus
                </span>
                <span className="text-xs text-[#64748B] font-mono font-bold">{focusTopic.subject} • {focusTopic.chapter}</span>
              </div>

              <h3 className="font-head text-2xl sm:text-3xl font-800 text-[#1E293B] tracking-tight">
                {focusTopic.topic}
              </h3>

              <p className="text-xs sm:text-sm text-[#1E293B]/80 max-w-xl leading-relaxed">
                Practicing this concept yields the highest accuracy gain on upcoming mock exams. Current calibration:{" "}
                <span className={`font-bold ${focusTopic.band === "weak" ? "text-[#FF6B5E]" : "text-[#1E293B]"}`}>
                  {focusTopic.score}% ({focusTopic.band})
                </span>.
              </p>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right hidden sm:block">
                <div className="font-head text-3xl font-900 text-[#1E293B]">{focusTopic.score}%</div>
                <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-mono font-bold">Current Score</div>
              </div>

              <Button
                onClick={() => onPracticeTopic ? onPracticeTopic(focusTopic) : null}
                asChild={!onPracticeTopic}
                className="rounded-full bg-[#5B9BD5] hover:bg-[#4D8BC4] text-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] font-head font-bold text-sm h-11 px-6 active:translate-x-[2px] active:translate-y-[2px]"
              >
                {onPracticeTopic ? (
                  <span className="flex items-center gap-2">
                    <Zap className="h-4 w-4" /> Practice Concept
                  </span>
                ) : (
                  <Link to="/dpp" className="flex items-center gap-2">
                    <Zap className="h-4 w-4" /> Practice Concept
                  </Link>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Interactive Topic Matrix Grid */}
      {filteredTopics.length === 0 ? (
        <div className="rounded-3xl bg-white p-12 text-center space-y-3 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B]">
          <Compass className="h-12 w-12 text-[#5B9BD5] mx-auto" />
          <h4 className="font-head text-lg font-800 text-[#1E293B]">No concept calibration yet</h4>
          <p className="text-xs text-[#64748B] max-w-md mx-auto leading-relaxed">
            Take a quick 10-question diagnostic test to populate your personal mastery heatmap.
          </p>
          {onStartDiagnostic && (
            <Button
              onClick={onStartDiagnostic}
              className="rounded-full bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] font-head font-bold text-xs px-6 h-10 mt-3"
            >
              Start Diagnostic Test
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTopics.map((t) => {
            const config = BAND_CONFIG[t.band] || BAND_CONFIG.developing;
            return (
              <div
                key={`${t.subject}|${t.chapter}|${t.topic}`}
                onClick={() => setSelectedTopic(t)}
                className="group cursor-pointer rounded-3xl p-5 bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] hover:-translate-y-1 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-mono font-bold text-[#64748B] truncate block">
                      {t.subject} • {t.chapter}
                    </span>
                    <h4 className="font-head text-base font-800 text-[#1E293B] truncate mt-1">
                      {t.topic}
                    </h4>
                  </div>
                  <Badge className={`text-[10px] font-head font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shrink-0 ${config.badgeCls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full mr-1 ${config.dot}`} />
                    {config.label}
                  </Badge>
                </div>

                <div className="mt-3.5 flex items-center gap-3">
                  <div className="flex-1 bg-[#FFF9E8] rounded-full h-3 overflow-hidden border-2 border-[#1E293B]">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${config.barColor}`}
                      style={{ width: `${Math.min(100, Math.max(8, t.score || 0))}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs font-900 text-[#1E293B] w-10 text-right">{t.score}%</span>
                </div>

                <div className="mt-3 pt-2.5 flex items-center justify-between text-[11px] text-[#64748B] border-t-2 border-[#1E293B]/15 font-mono font-bold">
                  <span>{t.attempts || 0} questions attempted</span>
                  <span className="text-[#5B9BD5] flex items-center gap-0.5 font-head font-bold">
                    Drilldown <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Topic Drilldown Modal */}
      <Dialog open={!!selectedTopic} onOpenChange={(open) => !open && setSelectedTopic(null)}>
        {selectedTopic && (
          <DialogContent className="bg-white border-[3px] border-[#1E293B] text-[#1E293B] max-w-md rounded-3xl p-6 sm:p-8 shadow-[6px_6px_0_#1E293B]">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className={`text-[11px] border ${(BAND_CONFIG[selectedTopic.band] || BAND_CONFIG.developing).badgeCls}`}>
                  {(BAND_CONFIG[selectedTopic.band] || BAND_CONFIG.developing).label} Band
                </Badge>
                <span className="text-xs text-[#64748B] font-mono font-bold">{selectedTopic.subject}</span>
              </div>
              <DialogTitle className="font-head text-2xl font-900 mt-2 text-[#1E293B]">
                {selectedTopic.topic}
              </DialogTitle>
              <p className="text-xs text-[#64748B] font-bold">{selectedTopic.chapter}</p>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-around p-5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B]">
                <CircularProgress
                  score={selectedTopic.score}
                  size={76}
                  strokeWidth={6}
                  color={
                    selectedTopic.band === "weak"
                      ? "#FF6B5E"
                      : selectedTopic.band === "strong"
                      ? "#4CAF7D"
                      : "#F5C842"
                  }
                />
                <div className="space-y-1 text-left">
                  <div className="text-xs text-[#64748B] font-mono font-bold">Mastery Index</div>
                  <div className="font-head text-3xl font-900 text-[#1E293B]">{selectedTopic.score}%</div>
                  <div className="text-[11px] text-[#64748B] font-semibold">
                    {selectedTopic.band === "weak"
                      ? "High-priority practice topic"
                      : selectedTopic.band === "strong"
                      ? "Retained & board ready"
                      : "Developing consistency"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] space-y-1">
                  <div className="text-[#64748B] flex items-center gap-1 font-bold">
                    <Activity className="h-3.5 w-3.5 text-[#5B9BD5]" /> Attempts
                  </div>
                  <div className="text-base font-900 text-[#1E293B]">{selectedTopic.attempts || 0} Qs</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] space-y-1">
                  <div className="text-[#64748B] flex items-center gap-1 font-bold">
                    <Clock className="h-3.5 w-3.5 text-[#4CAF7D]" /> Average Pace
                  </div>
                  <div className="text-base font-900 text-[#1E293B]">{selectedTopic.avg_time_s ? `${selectedTopic.avg_time_s}s` : "Untimed"}</div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedTopic(null)}
                  className="rounded-full border-2 border-[#1E293B] text-[#1E293B] hover:bg-[#FFF9E8]"
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    const top = selectedTopic;
                    setSelectedTopic(null);
                    if (onPracticeTopic) onPracticeTopic(top);
                  }}
                  asChild={!onPracticeTopic}
                  className="rounded-full bg-[#5B9BD5] hover:bg-[#4D8BC4] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold"
                >
                  {onPracticeTopic ? (
                    <span className="flex items-center gap-1.5">
                      <Zap className="h-4 w-4" /> Practice Topic
                    </span>
                  ) : (
                    <Link to="/dpp" className="flex items-center gap-1.5">
                      <Zap className="h-4 w-4" /> Practice Topic
                    </Link>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
