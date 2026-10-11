import React from "react";
import { Badge } from "../ui/badge";
import { FileQuestion, Sparkles, Activity } from "lucide-react";

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
    <div className="rounded-3xl bg-white p-6 sm:p-7 space-y-5 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-2xl bg-[#5B9BD5] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <h3 className="font-head text-lg font-900 text-[#1E293B]">Recent Activity</h3>
        </div>
        <Badge className="bg-[#FFF9E8] text-[#1E293B] border-2 border-[#1E293B] font-mono text-[11px] px-3 py-0.5">
          {submissions.length} Total Attempts
        </Badge>
      </div>

      {recent.length === 0 ? (
        <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-8 text-center space-y-2">
          <FileQuestion className="h-8 w-8 text-[#64748B] mx-auto opacity-50" />
          <p className="text-sm font-head font-bold text-[#1E293B]">No attempts recorded</p>
          <p className="text-xs text-[#64748B] max-w-xs mx-auto">
            Take your first test or DPP to start logging score velocity and accuracy trends!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recent.map((sub, i) => {
            const isDpp = sub.kind === "dpp";
            const scoreColor =
              sub.score >= 75
                ? "bg-[#4CAF7D] text-white"
                : sub.score >= 55
                ? "bg-[#F5C842] text-[#1E293B]"
                : "bg-[#FF6B5E] text-white";

            return (
              <div
                key={sub.id || sub.test_id || i}
                className="group flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-xl bg-white border-2 border-[#1E293B] flex items-center justify-center shrink-0">
                    {isDpp ? (
                      <Sparkles className="h-4 w-4 text-[#F5C842]" />
                    ) : (
                      <FileQuestion className="h-4 w-4 text-[#5B9BD5]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-head text-sm font-800 text-[#1E293B] truncate">
                      {sub.title || (isDpp ? "Daily Practice Problem" : "Timed Test Assessment")}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-[#64748B] font-mono font-bold mt-0.5">
                      <span>{formatTimeAgo(sub.created_at)}</span>
                      <span>•</span>
                      <span className="text-[#1E293B]">{sub.correct}/{sub.total} Correct</span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <Badge className={`font-mono text-xs font-bold border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] ${scoreColor}`}>
                    {sub.score}%
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
