import React from "react";
import { Award } from "lucide-react";

export default function SpotlightCard({
  studentName = "Aarav Sharma",
  batchName = "Batch: Alpha Scholars",
  badgeText = "CBSE Class 10 Topper",
  quote,
  streakDays = 7,
  accuracy = 96,
  testsCompleted = 12,
  title,
}) {
  return (
    <div className="rounded-3xl bg-white border-[3px] border-[#1E293B] shadow-[5px_5px_0_#1E293B] p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
      {/* Circular Avatar with Sparkles */}
      <div className="relative shrink-0">
        <span className="absolute -top-3 -right-2 text-2xl select-none animate-bounce">✨</span>
        <span className="absolute -bottom-2 -left-2 text-xl select-none">🌟</span>
        <span className="absolute top-1/2 -left-4 text-lg select-none">⭐</span>

        <div className="h-28 w-28 sm:h-36 sm:w-36 rounded-full border-[3px] border-[#1E293B] bg-[#F5C842] shadow-[4px_4px_0_#1E293B] flex items-center justify-center text-5xl sm:text-6xl overflow-hidden relative">
          <span>🎓</span>
        </div>
      </div>

      <div className="space-y-3 text-center sm:text-left flex-1">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
          <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-[#E04A3C] text-white border-2 border-[#1E293B] text-xs font-head font-bold shadow-[2px_2px_0_#1E293B]">
            <Award className="h-3.5 w-3.5" /> {badgeText}
          </span>
          <span className="text-xs font-mono font-bold text-[#64748B]">{batchName}</span>
        </div>

        <h3 className="font-head text-2xl sm:text-3xl font-black text-[#1E293B]">
          {studentName}{title ? ` — ${title}` : ""}
        </h3>

        {quote && (
          <p className="text-xs sm:text-sm text-[#1E293B]/80 font-medium leading-relaxed max-w-xl">
            "{quote}"
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
          {streakDays !== undefined && (
            <span className="px-3 py-1 rounded-full bg-[#FFF9E8] border-2 border-[#1E293B] text-xs font-head font-bold text-[#1E293B] shadow-[2px_2px_0_#1E293B]">
              🔥 {streakDays}-Day Active Streak
            </span>
          )}
          {accuracy !== undefined && (
            <span className="px-3 py-1 rounded-full bg-[#2F8A5F] text-white border-2 border-[#1E293B] text-xs font-head font-bold shadow-[2px_2px_0_#1E293B]">
              🎯 {accuracy}% Accuracy
            </span>
          )}
          {testsCompleted !== undefined && (
            <span className="px-3 py-1 rounded-full bg-[#7A5CC0] text-white border-2 border-[#1E293B] text-xs font-head font-bold shadow-[2px_2px_0_#1E293B]">
              ⭐ {testsCompleted} Practice Tests
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
