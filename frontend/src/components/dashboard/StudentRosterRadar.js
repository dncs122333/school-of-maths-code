import React, { useState, useMemo } from "react";
import { api, formatApiErrorDetail } from "../../lib/api";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  Users,
  TrendingDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { toast } from "sonner";

export default function StudentRosterRadar({ students = [] }) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [drillData, setDrillData] = useState(null);
  const [loadingDrill, setLoadingDrill] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBand, setFilterBand] = useState("all");

  const calculateOverallMastery = (topics = []) => {
    if (!topics || topics.length === 0) return 0;
    const total = topics.reduce((acc, t) => acc + (t.score || 0), 0);
    return Math.round(total / topics.length);
  };

  const processedStudents = useMemo(() => {
    return students.map((s) => {
      const overall = calculateOverallMastery(s.topics);
      const weakTopics = (s.topics || []).filter((t) => t.band === "weak" || (t.score !== undefined && t.score < 55)).length;
      const strongTopics = (s.topics || []).filter((t) => t.band === "strong" || (t.score !== undefined && t.score >= 75)).length;
      const isStruggling = overall < 55 || weakTopics >= 2;
      return { ...s, overall, weakTopics, strongTopics, isStruggling };
    });
  }, [students]);

  const filteredStudents = useMemo(() => {
    return processedStudents.filter((st) => {
      const matchesSearch = (st.name || "").toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (filterBand === "weak") return st.overall < 55 || st.weakTopics > 0;
      if (filterBand === "dev") return st.overall >= 55 && st.overall <= 75;
      if (filterBand === "strong") return st.overall > 75;
      return true;
    }).sort((a, b) => a.overall - b.overall);
  }, [processedStudents, searchQuery, filterBand]);

  const handleOpenStudent = async (st) => {
    setSelectedStudent(st);
    setLoadingDrill(true);
    try {
      const res = await api.get(`/mastery/teacher/student/${st.id}`);
      setDrillData(res.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoadingDrill(false);
    }
  };

  return (
    <div className="rounded-3xl bg-white p-6 sm:p-7 space-y-5 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B]">
      {/* 1. Header & Quick Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-2xl bg-[#5B9BD5] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
            <Users className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-head text-lg font-900 text-[#1E293B]">Student Roster & Velocity</h3>
            <span className="text-xs text-[#64748B] font-mono font-bold">{filteredStudents.length} active profiles</span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-full bg-[#FFF9E8] border-2 border-[#1E293B] text-xs">
          <button
            type="button"
            onClick={() => setFilterBand("all")}
            className={`px-3 py-1 rounded-full font-head font-bold transition-all ${
              filterBand === "all" ? "bg-[#F5C842] text-[#1E293B] shadow-[2px_2px_0_#1E293B]" : "text-[#1E293B] hover:bg-white"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterBand("weak")}
            className={`px-3 py-1 rounded-full font-head font-bold transition-all ${
              filterBand === "weak" ? "bg-[#FF6B5E] text-white shadow-[2px_2px_0_#1E293B]" : "text-[#1E293B] hover:bg-white"
            }`}
          >
            Needs Help
          </button>
          <button
            type="button"
            onClick={() => setFilterBand("strong")}
            className={`px-3 py-1 rounded-full font-head font-bold transition-all ${
              filterBand === "strong" ? "bg-[#4CAF7D] text-white shadow-[2px_2px_0_#1E293B]" : "text-[#1E293B] hover:bg-white"
            }`}
          >
            Top Stars
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search student by name…"
          className="pl-10 rounded-xl bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B] text-xs h-10 placeholder:text-[#64748B]"
        />
      </div>

      {/* Student List */}
      {filteredStudents.length === 0 ? (
        <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-8 text-center text-xs text-[#64748B] space-y-1">
          <p className="text-[#1E293B] font-bold">No student profiles match your filter</p>
          <p>Try clearing your search query or selecting "All".</p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
          {filteredStudents.map((st) => (
            <div
              key={st.id}
              onClick={() => handleOpenStudent(st)}
              className="group cursor-pointer flex items-center justify-between gap-3.5 p-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`h-10 w-10 rounded-2xl flex items-center justify-center font-head font-900 text-sm shrink-0 border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] ${
                    st.overall >= 75
                      ? "bg-[#4CAF7D] text-white"
                      : st.overall >= 55
                      ? "bg-[#F5C842] text-[#1E293B]"
                      : "bg-[#FF6B5E] text-white"
                  }`}
                >
                  {st.name?.charAt(0)?.toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-head text-sm font-800 text-[#1E293B] truncate">
                      {st.name}
                    </h4>
                    {st.isStruggling && (
                      <span title="Multiple weak topics detected" className="text-[#FF6B5E] inline-flex items-center">
                        <TrendingDown className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#64748B] font-mono font-bold mt-0.5">
                    {st.topics?.length || 0} topics • <span className="text-[#FF6B5E]">{st.weakTopics} weak</span> • <span className="text-[#4CAF7D]">{st.strongTopics} strong</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right font-mono">
                  <span
                    className={`text-sm font-900 block ${
                      st.overall >= 75
                        ? "text-[#4CAF7D]"
                        : st.overall >= 55
                        ? "text-[#1E293B]"
                        : "text-[#FF6B5E]"
                    }`}
                  >
                    {st.overall}%
                  </span>
                  <span className="text-[9px] text-[#64748B] uppercase font-bold">Mastery</span>
                </div>
                <ChevronRight className="h-4 w-4 text-[#1E293B]" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Student Deep-Dive Drawer / Modal */}
      <Dialog open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
        {selectedStudent && (
          <DialogContent className="bg-white border-[3px] border-[#1E293B] text-[#1E293B] max-w-lg rounded-3xl p-6 sm:p-8 max-h-[85vh] overflow-y-auto shadow-[6px_6px_0_#1E293B]">
            <DialogHeader>
              <div className="flex items-center gap-3.5">
                <div className="h-12 w-12 rounded-2xl bg-[#5B9BD5] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center text-lg font-900 text-white">
                  {selectedStudent.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <DialogTitle className="font-head text-2xl font-900 text-[#1E293B]">
                    {selectedStudent.name}
                  </DialogTitle>
                  <p className="text-xs text-[#64748B] font-mono font-bold">
                    Batch Mastery Index: <span className="text-[#1E293B] font-900">{selectedStudent.overall}%</span>
                  </p>
                </div>
              </div>
            </DialogHeader>

            {loadingDrill ? (
              <div className="p-12 text-center text-xs text-[#1E293B] flex items-center justify-center gap-2">
                <span className="h-4 w-4 border-2 border-[#1E293B] border-t-transparent rounded-full animate-spin" />
                Retrieving detailed attempt logs…
              </div>
            ) : drillData ? (
              <div className="mt-4 space-y-6">
                {/* Recent Submissions Trend */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase font-head font-bold tracking-wider text-[#5B9BD5]">
                      Recent Assessment History ({drillData.trend?.length || 0})
                    </h4>
                  </div>

                  {drillData.trend?.length === 0 ? (
                    <p className="text-xs text-[#64748B] p-4 bg-[#FFF9E8] rounded-2xl border-2 border-[#1E293B]">
                      No completed assessments on file for this student yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {drillData.trend.slice(0, 5).map((tr, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] text-xs font-mono"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="text-[#1E293B] font-bold block truncate">{tr.title || "Assessment"}</span>
                            <span className="text-[#64748B] text-[11px] font-bold">
                              {tr.correct}/{tr.total} correct • {tr.kind === "dpp" ? "DPP Practice" : "Timed Test"}
                            </span>
                          </div>
                          <span
                            className={`font-900 px-2.5 py-1 rounded-xl border-2 border-[#1E293B] shrink-0 ${
                              tr.score >= 75
                                ? "bg-[#4CAF7D] text-white"
                                : tr.score >= 55
                                ? "bg-[#F5C842] text-[#1E293B]"
                                : "bg-[#FF6B5E] text-white"
                            }`}
                          >
                            {tr.score}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Topic Breakdown */}
                <div className="space-y-2.5">
                  <h4 className="text-xs uppercase font-head font-bold tracking-wider text-[#5B9BD5]">
                    Topic Breakdown ({drillData.topics?.length || 0})
                  </h4>
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {(drillData.topics || []).map((t, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="text-[#1E293B] font-bold truncate block">{t.topic}</span>
                          <span className="text-[11px] text-[#64748B] truncate block font-mono font-bold">
                            {t.chapter} • {t.attempts} Qs attempted
                          </span>
                        </div>
                        <span
                          className={`font-mono font-900 px-2.5 py-1 rounded-xl border-2 border-[#1E293B] shrink-0 ${
                            t.band === "weak"
                              ? "bg-[#FF6B5E] text-white"
                              : t.band === "strong"
                              ? "bg-[#4CAF7D] text-white"
                              : "bg-[#F5C842] text-[#1E293B]"
                          }`}
                        >
                          {t.score}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
