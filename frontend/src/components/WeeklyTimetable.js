import React from "react";

export default function WeeklyTimetable() {
  return (
    <div className="overflow-x-auto rounded-3xl border-[3px] border-[#1E293B] shadow-[5px_5px_0_#1E293B] bg-white overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b-[3px] border-[#1E293B]">
            <th className="p-4 bg-[#FFF9E8] text-[#1E293B] font-head font-black text-xs uppercase tracking-wider border-r-2 border-[#1E293B] min-w-[120px]">
              Time Slot
            </th>
            <th className="p-4 bg-[#E04A3C] text-white font-head font-black text-xs uppercase tracking-wider border-r-2 border-[#1E293B] min-w-[160px]">
              Monday (Coral)
            </th>
            <th className="p-4 bg-[#F5C842] text-[#1E293B] font-head font-black text-xs uppercase tracking-wider border-r-2 border-[#1E293B] min-w-[160px]">
              Tuesday (Yellow)
            </th>
            <th className="p-4 bg-[#2F8A5F] text-white font-head font-black text-xs uppercase tracking-wider border-r-2 border-[#1E293B] min-w-[160px]">
              Wednesday (Green)
            </th>
            <th className="p-4 bg-[#3E7CB1] text-white font-head font-black text-xs uppercase tracking-wider border-r-2 border-[#1E293B] min-w-[160px]">
              Thursday (Blue)
            </th>
            <th className="p-4 bg-[#7A5CC0] text-white font-head font-black text-xs uppercase tracking-wider min-w-[160px]">
              Friday (Purple)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-[#1E293B]">
          {/* Row 1 */}
          <tr>
            <td className="p-4 bg-[#FFF9E8] font-head font-bold text-xs text-[#1E293B] border-r-2 border-[#1E293B] align-top">
              4:00 PM – 5:00 PM
              <div className="text-[10px] font-mono text-[#64748B] mt-0.5">Core Lecture</div>
            </td>
            <td className="p-4 bg-white border-r-2 border-[#1E293B] align-top">
              <span className="font-head font-bold text-sm text-[#1E293B] block">Real Numbers &amp; Euclid</span>
              <span className="text-xs text-[#64748B] block mt-0.5">Proof of irrationality drills</span>
            </td>
            <td className="p-4 bg-white border-r-2 border-[#1E293B] align-top">
              <span className="font-head font-bold text-sm text-[#1E293B] block">Polynomials &amp; Factorization</span>
              <span className="text-xs text-[#64748B] block mt-0.5">Zeroes &amp; coefficients</span>
            </td>
            <td className="p-4 bg-white border-r-2 border-[#1E293B] align-top">
              <span className="font-head font-bold text-sm text-[#1E293B] block">Quadratic Equations</span>
              <span className="text-xs text-[#64748B] block mt-0.5">Discriminant &amp; word problems</span>
            </td>
            <td className="p-4 bg-white border-r-2 border-[#1E293B] align-top">
              <span className="font-head font-bold text-sm text-[#1E293B] block">Arithmetic Progressions</span>
              <span className="text-xs text-[#64748B] block mt-0.5">Sum of n terms formulas</span>
            </td>
            <td className="p-4 bg-white align-top">
              <span className="font-head font-bold text-sm text-[#1E293B] block">Triangles &amp; BPT Theorem</span>
              <span className="text-xs text-[#64748B] block mt-0.5">Step-by-step theorem proofs</span>
            </td>
          </tr>

          {/* Row 2 */}
          <tr>
            <td className="p-4 bg-[#FFF9E8] font-head font-bold text-xs text-[#1E293B] border-r-2 border-[#1E293B] align-top">
              5:15 PM – 6:15 PM
              <div className="text-[10px] font-mono text-[#64748B] mt-0.5">Sprint &amp; Doubt Lab</div>
            </td>
            <td className="p-4 bg-[#FFF9E8]/50 border-r-2 border-[#1E293B] align-top">
              <span className="font-head font-bold text-sm text-[#E04A3C] block">DPP Problem Lab #1</span>
              <span className="text-xs text-[#64748B] block mt-0.5">Section A &amp; B Speed Sprint</span>
            </td>
            <td className="p-4 bg-[#FFF9E8]/50 border-r-2 border-[#1E293B] align-top">
              <span className="font-head font-bold text-sm text-[#1E293B] block">NCERT Exemplar Review</span>
              <span className="text-xs text-[#64748B] block mt-0.5">High-difficulty challenges</span>
            </td>
            <td className="p-4 bg-[#FFF9E8]/50 border-r-2 border-[#1E293B] align-top">
              <span className="font-head font-bold text-sm text-[#2F8A5F] block">Formula Memorization</span>
              <span className="text-xs text-[#64748B] block mt-0.5">Flashcard active recall</span>
            </td>
            <td className="p-4 bg-[#FFF9E8]/50 border-r-2 border-[#1E293B] align-top">
              <span className="font-head font-bold text-sm text-[#3E7CB1] block">Previous Year Questions</span>
              <span className="text-xs text-[#64748B] block mt-0.5">CBSE 2019-2024 board patterns</span>
            </td>
            <td className="p-4 bg-[#FFF9E8]/50 align-top">
              <span className="font-head font-bold text-sm text-[#7A5CC0] block">Weekly Timed Mock Test</span>
              <span className="text-xs text-[#64748B] block mt-0.5">Full syllabus sprint &amp; analysis</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
