import React from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ArrowRight, AlertTriangle } from "lucide-react";

export function CircularProgress({ score, size = 68, strokeWidth = 6, color = "#E04A3C" }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeScore = Math.min(100, Math.max(0, score ?? 0));
  const strokeDashoffset = circumference - (safeScore / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#FFF9E8"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-head font-black text-sm leading-none text-[#1E293B]">{safeScore}%</span>
        <span className="text-[9px] text-[#64748B] font-head font-bold mt-0.5">Mastery</span>
      </div>
    </div>
  );
}

export default function WeakTopicCard({ topic, onPractice }) {
  if (!topic) return null;

  // Evidence behind the flag, from the mastery payload: how many tests and questions, and when last tried
  const getEvidenceNote = (t) => {
    const sessions = t.sessions ?? 0;
    const attempts = t.attempts ?? 0;
    const parts = [
      `Weak across ${sessions} ${sessions === 1 ? "test" : "tests"}`,
      `${attempts} ${attempts === 1 ? "question" : "questions"} answered`,
    ];
    if (t.last_attempt) {
      const d = new Date(t.last_attempt);
      if (!Number.isNaN(d.getTime())) {
        parts.push(`last tried ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`);
      }
    }
    return parts.join(" · ");
  };

  const isMaths = (topic.subject || "").toLowerCase().includes("math");
  const badgeCls = isMaths
    ? "bg-[#3E7CB1] text-white border-2 border-[#1E293B]"
    : "bg-[#2F8A5F] text-white border-2 border-[#1E293B]";

  const scoreColor =
    topic.band === "strong"
      ? "#2F8A5F"
      : topic.band === "developing"
      ? "#F5C842"
      : topic.band === "weak"
      ? "#E04A3C"
      : (topic.score ?? 0) >= 75
      ? "#2F8A5F"
      : (topic.score ?? 0) >= 55
      ? "#F5C842"
      : "#E04A3C";

  return (
    <div className="group relative rounded-3xl bg-white p-5 sm:p-6 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] hover:-translate-y-1 transition-[transform,box-shadow] duration-150 ease-out flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-[10px] font-head font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${badgeCls}`}>
                {topic.subject}
              </Badge>
              <span className="text-xs text-[#64748B] font-mono font-semibold truncate">{topic.chapter}</span>
            </div>
            <h3 className="font-head text-lg sm:text-xl font-extrabold text-[#1E293B] truncate">
              {topic.topic}
            </h3>
          </div>

          <CircularProgress score={topic.score ?? 0} size={64} strokeWidth={6} color={scoreColor} />
        </div>

        {/* Why this was flagged, with retro dashed inner border */}
        <div className="mt-3.5 p-3 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] flex items-center gap-2.5 text-xs text-[#1E293B]">
          <AlertTriangle className="h-4 w-4 text-[#E04A3C] shrink-0" />
          <span className="truncate leading-relaxed font-medium">{getEvidenceNote(topic)}</span>
        </div>
      </div>

      <div className="mt-4 pt-3.5 border-t-2 border-[#1E293B]/20 flex items-center justify-end gap-3">
        <Button
          size="sm"
          onClick={() => onPractice && onPractice(topic)}
          className="rounded-full bg-[#E04A3C] hover:bg-[#c93f33] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold h-8 px-4"
        >
          Fix Concept <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
