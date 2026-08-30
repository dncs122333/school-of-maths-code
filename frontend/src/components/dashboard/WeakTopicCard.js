import React from "react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ArrowRight, AlertTriangle, Lightbulb, Target, Sparkles, BookOpen } from "lucide-react";

export function CircularProgress({ score, size = 68, strokeWidth = 6, color = "#F87171" }) {
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
          stroke="#1E293B"
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
        <span className="font-head font-800 text-sm leading-none text-white">{safeScore}%</span>
        <span className="text-[9px] text-[#94A3B8] font-mono mt-0.5">Mastery</span>
      </div>
    </div>
  );
}

export default function WeakTopicCard({ topic, onPractice }) {
  if (!topic) return null;

  const getWeightageNote = (sub, top) => {
    const t = (top || "").toLowerCase();
    if (t.includes("triangle") || t.includes("circle") || t.includes("trigonometry")) {
      return "High-weightage in CBSE board exams (~6–8 marks)";
    }
    if (t.includes("reaction") || t.includes("electricity") || t.includes("light")) {
      return "Frequent numericals & diagram questions in Section C/D";
    }
    if (t.includes("quadratic") || t.includes("polynomial") || t.includes("arithmetic")) {
      return "Core algebra standard with frequent 3-mark questions";
    }
    if (t.includes("gravitation") || t.includes("motion") || t.includes("force")) {
      return "Key mechanics chapter with formula-based numericals";
    }
    return "Core CBSE syllabus concept with high board relevance";
  };

  const isMaths = (topic.subject || "").toLowerCase().includes("math");
  const badgeCls = isMaths
    ? "bg-[#3B82F6]/15 text-[#60A5FA] border-[#3B82F6]/30"
    : "bg-[#06B6D4]/15 text-[#22D3EE] border-[#06B6D4]/30";

  return (
    <div className="group relative rounded-3xl glass-panel p-5 sm:p-6 border border-[#1E293B] hover:border-[#F87171]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[#F87171]/10 hover:-translate-y-1 overflow-hidden flex flex-col justify-between">
      {/* Background glowing gradient orb */}
      <div className="absolute -top-10 -right-10 w-36 h-36 bg-[#F87171]/10 rounded-full blur-3xl pointer-events-none group-hover:bg-[#F87171]/15 transition-all" />

      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-[10px] font-700 uppercase tracking-wider px-2 py-0.5 rounded-md border ${badgeCls}`}>
                {topic.subject}
              </Badge>
              <span className="text-xs text-[#94A3B8] font-mono truncate">{topic.chapter}</span>
            </div>
            <h3 className="font-head text-lg sm:text-xl font-700 text-white truncate group-hover:text-[#FECACA] transition-colors">
              {topic.topic}
            </h3>
          </div>

          <CircularProgress score={topic.score ?? 0} size={64} strokeWidth={5} color="#F87171" />
        </div>

        {/* Why this matters callout */}
        <div className="mt-3.5 p-3 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] flex items-center gap-2.5 text-xs text-[#94A3B8]">
          <AlertTriangle className="h-4 w-4 text-[#F87171] shrink-0" />
          <span className="truncate leading-relaxed">{getWeightageNote(topic.subject, topic.topic)}</span>
        </div>
      </div>

      <div className="mt-4 pt-3.5 border-t border-[#1E293B]/70 flex items-center justify-between gap-3">
        <div className="text-xs font-mono text-[#94A3B8]">
          <span className="text-white font-600">{topic.attempts || 0}</span> attempts •{" "}
          <span>{topic.avg_time_s ? `${topic.avg_time_s}s avg` : "Untimed"}</span>
        </div>

        <Button
          size="sm"
          onClick={() => onPractice && onPractice(topic)}
          asChild={!onPractice}
          className="rounded-full bg-[#F87171] hover:bg-[#EF4444] text-white font-700 text-xs px-4 h-9 shadow-lg shadow-[#F87171]/25 group-hover:shadow-[#F87171]/40 transition-all shrink-0"
        >
          {onPractice ? (
            <span className="flex items-center gap-1.5">
              Practice 10 Qs <ArrowRight className="h-3.5 w-3.5" />
            </span>
          ) : (
            <Link to="/dpp" className="flex items-center gap-1.5">
              Practice 10 Qs <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </Button>
      </div>
    </div>
  );
}
