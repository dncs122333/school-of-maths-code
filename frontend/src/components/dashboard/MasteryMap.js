import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Sparkles, Target, Compass, BookOpen, Clock, Activity, CheckCircle2, ChevronRight, Zap, Layers, Flame, ArrowUpRight } from "lucide-react";
import { CircularProgress } from "./WeakTopicCard";

const BAND_CONFIG = {
  weak: {
    label: "Weak",
    glow: "border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171] shadow-lg shadow-[#F87171]/10",
    barGradient: "bg-gradient-to-r from-[#EF4444] to-[#F87171]",
    badgeCls: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30",
    dot: "bg-[#F87171]",
  },
  developing: {
    label: "Developing",
    glow: "border-[#FBBF24]/40 bg-[#FBBF24]/10 text-[#FBBF24] shadow-lg shadow-[#FBBF24]/10",
    barGradient: "bg-gradient-to-r from-[#D97706] to-[#FBBF24]",
    badgeCls: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30",
    dot: "bg-[#FBBF24]",
  },
  strong: {
    label: "Strong",
    glow: "border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399] shadow-lg shadow-[#34D399]/10",
    barGradient: "bg-gradient-to-r from-[#059669] to-[#34D399]",
    badgeCls: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30",
    dot: "bg-[#34D399]",
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

  const weakCount = topics.filter((t) => t.band === "weak").length;
  const devCount = topics.filter((t) => t.band === "developing").length;
  const strongCount = topics.filter((t) => t.band === "strong").length;

  return (
    <div className="space-y-6">
      {/* 1. Header & Subject Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-600 font-mono">
              Knowledge Topology
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#06B6D4] animate-ping" />
            <span className="text-xs text-[#94A3B8] font-mono">{topics.length} concepts indexed</span>
          </div>
          <h2 className="font-head text-2xl sm:text-3xl font-800 text-white mt-1">
            Mastery Radar
          </h2>
        </div>

        {/* Subject Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0B0F19] border border-[#1E293B] overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setFilterSubject("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-700 transition-all ${
              filterSubject === "all"
                ? "bg-[#3B82F6] text-white shadow-md shadow-[#3B82F6]/30 glow-blue"
                : "text-[#94A3B8] hover:text-white hover:bg-white/5"
            }`}
          >
            All ({topics.length})
          </button>
          {subjects.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterSubject(s)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-700 transition-all whitespace-nowrap ${
                filterSubject === s
                  ? "bg-[#3B82F6] text-white shadow-md shadow-[#3B82F6]/30 glow-blue"
                  : "text-[#94A3B8] hover:text-white hover:bg-white/5"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 2. AI Focus Today Hero Capsule */}
      {focusTopic && (
        <div className="relative rounded-3xl bg-gradient-to-r from-[#1E1B4B]/90 via-[#172554]/80 to-[#0F172A]/95 border border-[#3B82F6]/40 p-6 overflow-hidden shadow-2xl shadow-[#3B82F6]/10">
          <div className="absolute right-0 top-0 w-80 h-80 bg-[#3B82F6]/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 -bottom-10 w-48 h-48 bg-[#06B6D4]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-700 uppercase tracking-wider px-3 py-1 rounded-full bg-[#3B82F6]/25 text-[#60A5FA] border border-[#3B82F6]/40 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-[#60A5FA]" /> AI High-ROI Focus
                </span>
                <span className="text-xs text-[#94A3B8] font-mono">{focusTopic.subject} • {focusTopic.chapter}</span>
              </div>

              <h3 className="font-head text-2xl sm:text-3xl font-800 text-white tracking-tight">
                {focusTopic.topic}
              </h3>

              <p className="text-xs sm:text-sm text-[#94A3B8] max-w-xl leading-relaxed">
                Practicing this concept yields the highest accuracy gain on upcoming mock exams. Current calibration:{" "}
                <span className={`font-700 ${focusTopic.band === "weak" ? "text-[#F87171]" : "text-[#FBBF24]"}`}>
                  {focusTopic.score}% ({focusTopic.band})
                </span>.
              </p>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right hidden sm:block">
                <div className="font-head text-3xl font-800 text-white">{focusTopic.score}%</div>
                <div className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-mono">Current Score</div>
              </div>

              <Button
                onClick={() => onPracticeTopic ? onPracticeTopic(focusTopic) : null}
                asChild={!onPracticeTopic}
                className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-800 text-sm h-12 px-6 glow-blue transition-all hover:scale-105 shadow-xl shadow-[#3B82F6]/30"
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
        <div className="rounded-3xl glass-panel p-12 text-center space-y-3 border border-[#1E293B]">
          <Compass className="h-12 w-12 text-[#06B6D4] mx-auto opacity-70 animate-twinkle" />
          <h4 className="font-head text-lg font-700 text-white">No concept calibration yet</h4>
          <p className="text-xs text-[#94A3B8] max-w-md mx-auto leading-relaxed">
            Take a quick 10-question diagnostic test to populate your personal mastery heatmap.
          </p>
          {onStartDiagnostic && (
            <Button
              onClick={onStartDiagnostic}
              className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-700 text-xs px-6 h-10 glow-blue mt-3"
            >
              Start Diagnostic Test
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredTopics.map((t) => {
            const config = BAND_CONFIG[t.band] || BAND_CONFIG.developing;
            return (
              <div
                key={`${t.subject}|${t.chapter}|${t.topic}`}
                onClick={() => setSelectedTopic(t)}
                className={`group cursor-pointer rounded-3xl p-4 sm:p-5 glass-panel-interactive border transition-all duration-300 ${
                  t.band === "weak"
                    ? "border-[#F87171]/30 hover:border-[#F87171]/70 hover:shadow-xl hover:shadow-[#F87171]/10"
                    : t.band === "strong"
                    ? "border-[#34D399]/30 hover:border-[#34D399]/70 hover:shadow-xl hover:shadow-[#34D399]/10"
                    : "border-[#1E293B] hover:border-[#FBBF24]/60 hover:shadow-xl hover:shadow-[#FBBF24]/10"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-mono text-[#94A3B8] truncate block">
                      {t.subject} • {t.chapter}
                    </span>
                    <h4 className="font-head text-sm sm:text-base font-700 text-white truncate mt-1 group-hover:text-[#60A5FA] transition-colors">
                      {t.topic}
                    </h4>
                  </div>
                  <Badge className={`text-[10px] font-700 uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${config.badgeCls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full mr-1 ${config.dot}`} />
                    {config.label}
                  </Badge>
                </div>

                <div className="mt-3.5 flex items-center gap-3">
                  <div className="flex-1 bg-[#0B0F19] rounded-full h-2 overflow-hidden border border-[#1E293B]">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${config.barGradient}`}
                      style={{ width: `${Math.min(100, Math.max(6, t.score || 0))}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs font-800 text-white w-9 text-right">{t.score}%</span>
                </div>

                <div className="mt-3 pt-2.5 flex items-center justify-between text-[11px] text-[#94A3B8] border-t border-[#1E293B]/60 font-mono">
                  <span>{t.attempts || 0} questions attempted</span>
                  <span className="text-[#3B82F6] flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity font-600">
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
          <DialogContent className="bg-[#111827] border border-[#1E293B] text-white max-w-md rounded-3xl p-6 sm:p-8">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className={`text-[11px] border ${(BAND_CONFIG[selectedTopic.band] || BAND_CONFIG.developing).badgeCls}`}>
                  {(BAND_CONFIG[selectedTopic.band] || BAND_CONFIG.developing).label} Band
                </Badge>
                <span className="text-xs text-[#94A3B8] font-mono">{selectedTopic.subject}</span>
              </div>
              <DialogTitle className="font-head text-2xl font-800 mt-2 text-white">
                {selectedTopic.topic}
              </DialogTitle>
              <p className="text-xs text-[#94A3B8]">{selectedTopic.chapter}</p>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-around p-5 rounded-2xl bg-[#0B0F19] border border-[#1E293B]">
                <CircularProgress
                  score={selectedTopic.score}
                  size={76}
                  strokeWidth={6}
                  color={
                    selectedTopic.band === "weak"
                      ? "#F87171"
                      : selectedTopic.band === "strong"
                      ? "#34D399"
                      : "#FBBF24"
                  }
                />
                <div className="space-y-1 text-left">
                  <div className="text-xs text-[#94A3B8] font-mono">Mastery Index</div>
                  <div className="font-head text-3xl font-800 text-white">{selectedTopic.score}%</div>
                  <div className="text-[11px] text-[#94A3B8]">
                    {selectedTopic.band === "weak"
                      ? "High-priority practice topic"
                      : selectedTopic.band === "strong"
                      ? "Retained & board ready"
                      : "Developing consistency"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3.5 rounded-2xl bg-[#0B0F19] border border-[#1E293B] space-y-1">
                  <div className="text-[#94A3B8] flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5 text-[#3B82F6]" /> Total Attempts
                  </div>
                  <div className="text-base font-700 text-white">{selectedTopic.attempts || 0} Qs</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#0B0F19] border border-[#1E293B] space-y-1">
                  <div className="text-[#94A3B8] flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-[#06B6D4]" /> Average Pace
                  </div>
                  <div className="text-base font-700 text-white">{selectedTopic.avg_time_s ? `${selectedTopic.avg_time_s}s` : "Untimed"}</div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedTopic(null)}
                  className="rounded-full border-[#1E293B] text-[#94A3B8] hover:text-white hover:bg-white/5"
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
                  className="rounded-full bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-700 glow-blue"
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
