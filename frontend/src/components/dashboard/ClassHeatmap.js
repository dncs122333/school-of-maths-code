import React, { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  BarChart3,
  Users,
  BookOpen,
  Activity,
  AlertCircle,
  Sparkles,
  Filter,
  ChevronRight,
  ShieldAlert,
  Search,
  CheckCircle2,
  TrendingDown,
  Layers,
} from "lucide-react";

export default function ClassHeatmap({
  batches = [],
  selectedBatchId,
  onSelectBatch,
  reportData,
  loading,
}) {
  const [selectedCell, setSelectedCell] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [filterStrugglingOnly, setFilterStrugglingOnly] = useState(false);

  const students = useMemo(() => reportData?.students || [], [reportData]);
  const allTopics = useMemo(() => reportData?.weak_topics || [], [reportData]);

  const subjects = useMemo(
    () => Array.from(new Set(allTopics.map((t) => t.subject).filter(Boolean))),
    [allTopics]
  );
  const visibleTopics = useMemo(
    () =>
      allTopics
        .filter((t) => subjectFilter === "all" || (t.subject || "").toLowerCase() === subjectFilter.toLowerCase())
        .slice(0, 10),
    [allTopics, subjectFilter]
  );

  // Map student topic scores for fast lookup
  const studentScoreMap = useMemo(() => {
    const map = {};
    students.forEach((s) => {
      map[s.id] = {};
      (s.topics || []).forEach((t) => {
        map[s.id][`${t.subject}|${t.chapter}|${t.topic}`] = t;
      });
    });
    return map;
  }, [students]);

  // Filtered students by search and struggling flag
  const filteredStudents = useMemo(() => {
    return students.filter((st) => {
      const matchesName = (st.name || "").toLowerCase().includes(studentSearch.toLowerCase());
      if (!matchesName) return false;
      if (!filterStrugglingOnly) return true;
      // Check if student has at least one weak topic (<55%)
      const weakTopics = (st.topics || []).filter((t) => (t.score !== undefined && t.score < 55) || t.band === "weak");
      return weakTopics.length > 0;
    });
  }, [students, studentSearch, filterStrugglingOnly]);

  // Calculate cohort distribution stats
  const stats = useMemo(() => {
    let weak = 0;
    let dev = 0;
    let strong = 0;
    students.forEach((s) => {
      (s.topics || []).forEach((t) => {
        if (t.score !== undefined) {
          if (t.score < 55) weak += 1;
          else if (t.score <= 75) dev += 1;
          else strong += 1;
        }
      });
    });
    return { weak, dev, strong };
  }, [students]);

  const getCellColor = (topicData) => {
    if (!topicData || topicData.score === undefined) {
      return "bg-[#1E293B]/30 border-[#1E293B] text-[#94A3B8]/40";
    }
    if (topicData.score >= 75) {
      return "bg-[#34D399]/20 border-[#34D399]/40 text-[#34D399] hover:bg-[#34D399]/35 hover:scale-105 shadow-sm shadow-[#34D399]/10";
    }
    if (topicData.score >= 55) {
      return "bg-[#FBBF24]/20 border-[#FBBF24]/40 text-[#FBBF24] hover:bg-[#FBBF24]/35 hover:scale-105 shadow-sm shadow-[#FBBF24]/10";
    }
    return "bg-[#F87171]/20 border-[#F87171]/40 text-[#F87171] hover:bg-[#F87171]/35 hover:scale-105 shadow-sm shadow-[#F87171]/10";
  };

  return (
    <div className="rounded-3xl glass-panel p-6 sm:p-8 space-y-6 border border-[#1E293B] shadow-2xl">
      {/* 1. Heatmap Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-700 font-mono">
              Cohort Intelligence Matrix
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#06B6D4] animate-pulse" />
            <span className="text-xs text-[#94A3B8] font-mono">{students.length} enrolled students</span>
          </div>
          <h2 className="font-head text-2xl sm:text-3xl font-800 text-white mt-1 flex items-center gap-2.5">
            Class Mastery Heatmap
          </h2>
        </div>

        {/* Action Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Subject Filter Tabs */}
          {subjects.length > 0 && (
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#0B0F19] border border-[#1E293B]">
              <button
                type="button"
                onClick={() => setSubjectFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-700 transition-all ${
                  subjectFilter === "all" ? "bg-[#3B82F6] text-white shadow-md glow-blue" : "text-[#94A3B8] hover:text-white"
                }`}
              >
                All Subjects
              </button>
              {subjects.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSubjectFilter(sub)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-700 transition-all whitespace-nowrap ${
                    subjectFilter === sub ? "bg-[#3B82F6] text-white shadow-md glow-blue" : "text-[#94A3B8] hover:text-white"
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}

          {/* Struggling Filter Toggle */}
          <button
            type="button"
            onClick={() => setFilterStrugglingOnly((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-700 border transition-all ${
              filterStrugglingOnly
                ? "bg-[#F87171]/20 border-[#F87171] text-[#F87171] shadow-lg shadow-[#F87171]/15"
                : "bg-[#0B0F19] border-[#1E293B] text-[#94A3B8] hover:text-white"
            }`}
          >
            <TrendingDown className="h-3.5 w-3.5" />
            {filterStrugglingOnly ? "Showing Struggling Only" : "Filter Weak Students"}
          </button>
        </div>
      </div>

      {/* 2. Band Breakdown Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        <div className="p-3 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-mono">Critical Topics</span>
            <div className="font-head text-lg font-800 text-[#F87171]">{stats.weak} cells</div>
          </div>
          <span className="h-3 w-3 rounded-full bg-[#F87171] shadow-sm shadow-[#F87171]" />
        </div>

        <div className="p-3 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-mono">Developing</span>
            <div className="font-head text-lg font-800 text-[#FBBF24]">{stats.dev} cells</div>
          </div>
          <span className="h-3 w-3 rounded-full bg-[#FBBF24] shadow-sm shadow-[#FBBF24]" />
        </div>

        <div className="p-3 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-mono">Mastered</span>
            <div className="font-head text-lg font-800 text-[#34D399]">{stats.strong} cells</div>
          </div>
          <span className="h-3 w-3 rounded-full bg-[#34D399] shadow-sm shadow-[#34D399]" />
        </div>

        <div className="p-3 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-mono">Active Topics</span>
            <div className="font-head text-lg font-800 text-white">{visibleTopics.length} columns</div>
          </div>
          <Layers className="h-4 w-4 text-[#3B82F6]" />
        </div>
      </div>

      {/* 3. Heatmap Table Matrix */}
      {loading ? (
        <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-16 text-center text-[#94A3B8] flex items-center justify-center gap-2.5">
          <span className="h-5 w-5 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-sm">Synthesizing cohort mastery heatmap…</span>
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-12 text-center space-y-2 text-[#94A3B8]">
          <Users className="h-9 w-9 mx-auto text-[#06B6D4] opacity-50" />
          <h4 className="font-head text-lg font-700 text-white">No students enrolled in this batch</h4>
          <p className="text-xs max-w-sm mx-auto leading-relaxed">
            Share your 6-character batch join code with students to populate live diagnostic records.
          </p>
        </div>
      ) : visibleTopics.length === 0 ? (
        <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-12 text-center space-y-2 text-[#94A3B8]">
          <BarChart3 className="h-9 w-9 mx-auto text-[#06B6D4] opacity-50" />
          <h4 className="font-head text-lg font-700 text-white">No test submissions for this batch yet</h4>
          <p className="text-xs leading-relaxed">
            Launch a timed test or DPP to start mapping student topic retention automatically.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#1E293B] bg-[#0B0F19]/80 shadow-inner">
          <table className="w-full text-xs text-left min-w-[760px]">
            <thead>
              <tr className="border-b border-[#1E293B] bg-[#0B0F19]">
                <th className="py-3.5 px-4 font-700 text-white sticky left-0 bg-[#0B0F19] z-10 w-52 shadow-[4px_0_10px_rgba(0,0,0,0.5)]">
                  Student Name ({filteredStudents.length})
                </th>
                {visibleTopics.map((top) => (
                  <th
                    key={`${top.subject}|${top.chapter}|${top.topic}`}
                    className="py-3.5 px-3 font-700 text-[#94A3B8] text-center whitespace-nowrap min-w-[120px]"
                    title={`${top.subject} • ${top.chapter} • ${top.topic}`}
                  >
                    <span className="block truncate max-w-[130px] mx-auto text-white">{top.topic}</span>
                    <span className="text-[10px] text-[#94A3B8]/70 font-mono block mt-0.5">
                      Batch Avg: <span className="font-700 text-white">{top.class_avg}%</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]/60">
              {filteredStudents.map((st) => (
                <tr key={st.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="py-3 px-4 font-700 text-white sticky left-0 bg-[#0B0F19] z-10 whitespace-nowrap shadow-[4px_0_10px_rgba(0,0,0,0.5)] flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-xl bg-[#3B82F6]/20 border border-[#3B82F6]/40 flex items-center justify-center text-xs font-800 text-[#60A5FA]">
                      {st.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span className="truncate max-w-[140px]">{st.name}</span>
                  </td>

                  {visibleTopics.map((top) => {
                    const k = `${top.subject}|${top.chapter}|${top.topic}`;
                    const topicData = studentScoreMap[st.id]?.[k];
                    const colorCls = getCellColor(topicData);

                    return (
                      <td key={k} className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCell({
                              student: st,
                              topic: top,
                              data: topicData,
                            })
                          }
                          className={`w-full py-1.5 px-2 rounded-xl font-mono text-xs font-800 border transition-all duration-200 ${colorCls}`}
                        >
                          {topicData ? `${topicData.score}%` : "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Cell Drilldown Modal */}
      <Dialog open={!!selectedCell} onOpenChange={(open) => !open && setSelectedCell(null)}>
        {selectedCell && (
          <DialogContent className="bg-[#111827] border border-[#1E293B] text-white max-w-md rounded-3xl p-6 sm:p-8">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-[#3B82F6]/20 text-[#60A5FA] border-[#3B82F6]/30 text-xs font-700">
                  {selectedCell.topic.subject}
                </Badge>
                <span className="text-xs text-[#94A3B8] font-mono">{selectedCell.topic.chapter}</span>
              </div>
              <DialogTitle className="font-head text-2xl font-800 text-white mt-1.5">
                {selectedCell.topic.topic}
              </DialogTitle>
              <p className="text-xs text-[#94A3B8]">
                Student: <span className="text-white font-700">{selectedCell.student.name}</span>
              </p>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              {selectedCell.data ? (
                <div className="p-5 rounded-2xl bg-[#0B0F19] border border-[#1E293B] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#94A3B8] font-mono uppercase tracking-wider">Concept Score</span>
                    <span
                      className={`font-head text-3xl font-800 ${
                        selectedCell.data.score >= 75
                          ? "text-[#34D399]"
                          : selectedCell.data.score >= 55
                          ? "text-[#FBBF24]"
                          : "text-[#F87171]"
                      }`}
                    >
                      {selectedCell.data.score}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-mono pt-3 border-t border-[#1E293B]">
                    <div className="p-2.5 rounded-xl bg-[#111827] border border-[#1E293B]">
                      <span className="text-[#94A3B8] text-[10px] block">Questions Attempted</span>
                      <span className="text-white font-800 text-sm">{selectedCell.data.attempts || 0} Qs</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#111827] border border-[#1E293B]">
                      <span className="text-[#94A3B8] text-[10px] block">Average Pace</span>
                      <span className="text-white font-800 text-sm">
                        {selectedCell.data.avg_time_s ? `${selectedCell.data.avg_time_s}s` : "Untimed"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-[#0B0F19] border border-[#1E293B] text-center text-xs text-[#94A3B8] space-y-1">
                  <p className="font-600 text-white">Unattempted Concept</p>
                  <p>This student has not submitted any questions on this topic yet.</p>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
