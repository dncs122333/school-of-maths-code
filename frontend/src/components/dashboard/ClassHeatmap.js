import React, { useState, useMemo } from "react";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  BarChart3,
  Users,
  Layers,
  TrendingDown,
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
  const [studentSearch] = useState("");
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
      return "bg-[#FFF9E8] border border-[#1E293B]/20 text-[#64748B]";
    }
    if (topicData.score >= 75) {
      return "bg-[#4CAF7D] border-2 border-[#1E293B] text-white hover:scale-105 shadow-[1px_1px_0_#1E293B]";
    }
    if (topicData.score >= 55) {
      return "bg-[#F5C842] border-2 border-[#1E293B] text-[#1E293B] hover:scale-105 shadow-[1px_1px_0_#1E293B]";
    }
    return "bg-[#FF6B5E] border-2 border-[#1E293B] text-white hover:scale-105 shadow-[1px_1px_0_#1E293B]";
  };

  return (
    <div className="rounded-3xl bg-white p-6 sm:p-8 space-y-6 border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B]">
      {/* 1. Heatmap Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-[#5B9BD5] font-head font-bold">
              Cohort Intelligence Matrix
            </span>
            <span className="h-2 w-2 rounded-full bg-[#4CAF7D]" />
            <span className="text-xs text-[#64748B] font-mono font-bold">{students.length} enrolled students</span>
          </div>
          <h2 className="font-head text-2xl sm:text-3xl font-900 text-[#1E293B] mt-1 flex items-center gap-2.5">
            Class Mastery Heatmap
          </h2>
        </div>

        {/* Action Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Subject Filter Tabs */}
          {subjects.length > 0 && (
            <div className="flex items-center gap-1.5 p-1 rounded-full bg-[#FFF9E8] border-2 border-[#1E293B]">
              <button
                type="button"
                onClick={() => setSubjectFilter("all")}
                className={`px-3.5 py-1 rounded-full text-xs font-head font-bold transition-all ${
                  subjectFilter === "all" ? "bg-[#F5C842] text-[#1E293B] shadow-[2px_2px_0_#1E293B]" : "text-[#1E293B] hover:bg-white"
                }`}
              >
                All Subjects
              </button>
              {subjects.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSubjectFilter(sub)}
                  className={`px-3.5 py-1 rounded-full text-xs font-head font-bold transition-all whitespace-nowrap ${
                    subjectFilter === sub ? "bg-[#F5C842] text-[#1E293B] shadow-[2px_2px_0_#1E293B]" : "text-[#1E293B] hover:bg-white"
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
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-head font-bold border-2 border-[#1E293B] transition-all ${
              filterStrugglingOnly
                ? "bg-[#FF6B5E] text-white shadow-[2px_2px_0_#1E293B]"
                : "bg-white text-[#1E293B] hover:bg-[#FFF9E8] shadow-[2px_2px_0_#1E293B]"
            }`}
          >
            <TrendingDown className="h-3.5 w-3.5" />
            {filterStrugglingOnly ? "Showing Weak Only" : "Filter Weak Students"}
          </button>
        </div>
      </div>

      {/* 2. Band Breakdown Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        <div className="p-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider text-[#64748B] font-head font-bold">Critical Topics</span>
            <div className="font-head text-lg font-900 text-[#FF6B5E]">{stats.weak} cells</div>
          </div>
          <span className="h-4 w-4 rounded-full bg-[#FF6B5E] border-2 border-[#1E293B]" />
        </div>

        <div className="p-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider text-[#64748B] font-head font-bold">Developing</span>
            <div className="font-head text-lg font-900 text-[#1E293B]">{stats.dev} cells</div>
          </div>
          <span className="h-4 w-4 rounded-full bg-[#F5C842] border-2 border-[#1E293B]" />
        </div>

        <div className="p-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider text-[#64748B] font-head font-bold">Mastered</span>
            <div className="font-head text-lg font-900 text-[#4CAF7D]">{stats.strong} cells</div>
          </div>
          <span className="h-4 w-4 rounded-full bg-[#4CAF7D] border-2 border-[#1E293B]" />
        </div>

        <div className="p-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider text-[#64748B] font-head font-bold">Active Topics</span>
            <div className="font-head text-lg font-900 text-[#1E293B]">{visibleTopics.length} columns</div>
          </div>
          <Layers className="h-4 w-4 text-[#5B9BD5]" />
        </div>
      </div>

      {/* 3. Heatmap Table Matrix */}
      {loading ? (
        <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-16 text-center text-[#1E293B] flex items-center justify-center gap-2.5">
          <span className="h-5 w-5 border-2 border-[#1E293B] border-t-transparent rounded-full animate-spin" />
          <span className="font-head font-bold text-sm">Synthesizing cohort mastery heatmap…</span>
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-12 text-center space-y-2 text-[#64748B]">
          <Users className="h-9 w-9 mx-auto text-[#5B9BD5] opacity-50" />
          <h4 className="font-head text-lg font-800 text-[#1E293B]">No students enrolled in this batch</h4>
          <p className="text-xs max-w-sm mx-auto leading-relaxed">
            Share your 6-character batch join code with students to populate live diagnostic records.
          </p>
        </div>
      ) : visibleTopics.length === 0 ? (
        <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-12 text-center space-y-2 text-[#64748B]">
          <BarChart3 className="h-9 w-9 mx-auto text-[#5B9BD5] opacity-50" />
          <h4 className="font-head text-lg font-800 text-[#1E293B]">No test submissions for this batch yet</h4>
          <p className="text-xs leading-relaxed">
            Launch a timed test or DPP to start mapping student topic retention automatically.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border-2 border-[#1E293B] bg-white shadow-[3px_3px_0_#1E293B]">
          <table className="w-full text-xs text-left min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b-2 border-[#1E293B] bg-[#FFF9E8]">
                <th className="py-3.5 px-4 font-head font-bold text-[#1E293B] sticky left-0 bg-[#FFF9E8] z-10 w-52 border-r-2 border-[#1E293B]">
                  Student Name ({filteredStudents.length})
                </th>
                {visibleTopics.map((top) => (
                  <th
                    key={`${top.subject}|${top.chapter}|${top.topic}`}
                    className="py-3.5 px-3 font-head font-bold text-[#1E293B] text-center whitespace-nowrap min-w-[120px] border-r-2 border-[#1E293B] last:border-r-0"
                    title={`${top.subject} • ${top.chapter} • ${top.topic}`}
                  >
                    <span className="block truncate max-w-[130px] mx-auto">{top.topic}</span>
                    <span className="text-[10px] text-[#64748B] font-mono block mt-0.5">
                      Batch Avg: <span className="font-bold text-[#1E293B]">{top.class_avg}%</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-[#1E293B]">
              {filteredStudents.map((st) => (
                <tr key={st.id} className="hover:bg-[#FFF9E8]/50 transition-colors">
                  <td className="py-3 px-4 font-head font-bold text-[#1E293B] sticky left-0 bg-white z-10 whitespace-nowrap border-r-2 border-[#1E293B] flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-xl bg-[#F5C842] border border-[#1E293B] flex items-center justify-center text-xs font-900 text-[#1E293B]">
                      {st.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span className="truncate max-w-[140px]">{st.name}</span>
                  </td>

                  {visibleTopics.map((top) => {
                    const k = `${top.subject}|${top.chapter}|${top.topic}`;
                    const topicData = studentScoreMap[st.id]?.[k];
                    const colorCls = getCellColor(topicData);

                    return (
                      <td key={k} className="py-2 px-2 text-center border-r-2 border-[#1E293B] last:border-r-0">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCell({
                              student: st,
                              topic: top,
                              data: topicData,
                            })
                          }
                          className={`w-full py-1.5 px-2 rounded-xl font-mono text-xs font-bold border transition-all duration-200 ${colorCls}`}
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
          <DialogContent className="bg-white border-[3px] border-[#1E293B] text-[#1E293B] max-w-md rounded-3xl p-6 sm:p-8 shadow-[6px_6px_0_#1E293B]">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-[#5B9BD5] text-white border-2 border-[#1E293B] text-xs font-bold">
                  {selectedCell.topic.subject}
                </Badge>
                <span className="text-xs text-[#64748B] font-mono font-bold">{selectedCell.topic.chapter}</span>
              </div>
              <DialogTitle className="font-head text-2xl font-900 text-[#1E293B] mt-1.5">
                {selectedCell.topic.topic}
              </DialogTitle>
              <p className="text-xs text-[#64748B] font-bold">
                Student: <span className="text-[#1E293B] font-900">{selectedCell.student.name}</span>
              </p>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              {selectedCell.data ? (
                <div className="p-5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#64748B] font-head font-bold uppercase tracking-wider">Concept Score</span>
                    <span
                      className={`font-head text-3xl font-900 ${
                        selectedCell.data.score >= 75
                          ? "text-[#4CAF7D]"
                          : selectedCell.data.score >= 55
                          ? "text-[#F5C842]"
                          : "text-[#FF6B5E]"
                      }`}
                    >
                      {selectedCell.data.score}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-mono pt-3 border-t-2 border-[#1E293B]">
                    <div className="p-2.5 rounded-xl bg-white border border-[#1E293B]">
                      <span className="text-[#64748B] text-[10px] block font-bold">Questions Attempted</span>
                      <span className="text-[#1E293B] font-900 text-sm">{selectedCell.data.attempts || 0} Qs</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-[#1E293B]">
                      <span className="text-[#64748B] text-[10px] block font-bold">Average Pace</span>
                      <span className="text-[#1E293B] font-900 text-sm">
                        {selectedCell.data.avg_time_s ? `${selectedCell.data.avg_time_s}s` : "Untimed"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] text-center text-xs text-[#64748B] space-y-1">
                  <p className="font-head font-bold text-[#1E293B]">Unattempted Concept</p>
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
