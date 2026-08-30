import React from "react";
import { Link } from "react-router-dom";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { TrendingUp, TrendingDown, Clock, CheckCircle2, ChevronRight, FileQuestion, Sparkles, Activity, ArrowRight } from "lucide-react";

export default function ActivityTimeline({ submissions = [] }) {
  const recent = submissions.slice(0, 5);

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return "Recently";
    try {
      const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
      if (diff < 60) return "Just now";
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch {
      return "Recently";
    }
  };

  return (
    <div className="rounded-3xl glass-panel p-6 sm:p-7 space-y-5 border border-[#1E293B]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center">
            <Activity className="h-4 w-4 text-[#3B82F6]" />
          </div>
          <h3 className="font-head text-lg font-700 text-white">Recent Activity</h3>
        </div>
        <Badge className="bg-[#3B82F6]/10 text-[#60A5FA] border-[#3B82F6]/25 font-mono text-[11px] px-2.5 py-0.5">
          {submissions.length} Total Attempts
        </Badge>
      </div>

      {recent.length === 0 ? (
        <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-8 text-center space-y-2">
          <FileQuestion className="h-8 w-8 text-[#94A3B8] mx-auto opacity-50" />
          <p className="text-sm font-700 text-white">No attempts recorded</p>
          <p className="text-xs text-[#94A3B8] max-w-xs mx-auto">
            Take your first test or DPP to start logging score velocity and accuracy trends!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recent.map((sub, i) => {
            const prev = recent[i + 1];
            const isBetter = prev ? sub.score >= prev.score : true;
            const isDpp = sub.kind === "dpp";
            const scoreColor =
              sub.score >= 75 ? "text-[#34D399] bg-[#34D399]/15 border-[#34D399]/30"
              : sub.score >= 55 ? "text-[#FBBF24] bg-[#FBBF24]/15 border-[#FBBF24]/30"
              : "text-[#F87171] bg-[#F87171]/15 border-[#F87171]/30";

            return (
              <div
                key={sub.id || sub.test_id || i}
                className="group flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] hover:border-[#3B82F6]/40 transition-all hover:bg-[#172033]/80 hover:translate-x-1"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-10 w-10 rounded-2xl bg-[#111827] border border-[#1E293B] flex items-center justify-center shrink-0">
                    {isDpp ? (
                      <Sparkles className="h-5 w-5 text-[#FBBF24]" />
                    ) : (
                      <FileQuestion className="h-5 w-5 text-[#06B6D4]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-head text-sm font-700 text-white truncate group-hover:text-[#60A5FA] transition-colors">
                      {sub.title || (isDpp ? "Daily Practice Problem" : "Timed Test Assessment")}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-[#94A3B8] font-mono mt-0.5">
                      <span>{formatTimeAgo(sub.created_at)}</span>
                      <span>•</span>
                      <span className="text-white font-600">{sub.correct}/{sub.total} Correct</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className={`px-3 py-1 rounded-xl text-xs font-mono font-800 border flex items-center gap-1.5 ${scoreColor}`}>
                    {sub.score}%
                    {prev && (
                      isBetter ? (
                        <TrendingUp className="h-3.5 w-3.5 text-[#34D399]" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-[#F87171]" />
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
