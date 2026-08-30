import React, { useState, useMemo } from "react";
import { api, formatApiErrorDetail } from "../../lib/api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Progress } from "../ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  Users,
  TrendingDown,
  TrendingUp,
  ChevronRight,
  Activity,
  Clock,
  ShieldAlert,
  Award,
  Search,
  CheckCircle2,
  AlertCircle,
  FileQuestion,
} from "lucide-react";
import { toast } from "sonner";

export default function StudentRosterRadar({ students = [] }) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [drillData, setDrillData] = useState(null);
  const [loadingDrill, setLoadingDrill] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBand, setFilterBand] = useState("all"); // "all", "weak", "dev", "strong"

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
    }).sort((a, b) => a.overall - b.overall); // weakest first by default
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
    <div className="rounded-3xl glass-panel p-6 sm:p-7 space-y-5 border border-[#1E293B] shadow-2xl">
      {/* 1. Header & Quick Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center">
            <Users className="h-4 w-4 text-[#3B82F6]" />
          </div>
          <div>
            <h3 className="font-head text-lg font-700 text-white">Student Roster & Velocity</h3>
            <span className="text-xs text-[#94A3B8] font-mono">{filteredStudents.length} active profiles</span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0B0F19] border border-[#1E293B] text-xs">
          <button
            type="button"
            onClick={() => setFilterBand("all")}
            className={`px-2.5 py-1 rounded-lg font-700 transition-colors ${
              filterBand === "all" ? "bg-[#3B82F6] text-white" : "text-[#94A3B8] hover:text-white"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterBand("weak")}
            className={`px-2.5 py-1 rounded-lg font-700 transition-colors ${
              filterBand === "weak" ? "bg-[#F87171]/20 text-[#F87171] border border-[#F87171]/30" : "text-[#94A3B8] hover:text-white"
            }`}
          >
            Needs Help
          </button>
          <button
            type="button"
            onClick={() => setFilterBand("strong")}
            className={`px-2.5 py-1 rounded-lg font-700 transition-colors ${
              filterBand === "strong" ? "bg-[#34D399]/20 text-[#34D399] border border-[#34D399]/30" : "text-[#94A3B8] hover:text-white"
            }`}
          >
            Top Performers
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search student by name…"
          className="pl-10 rounded-2xl bg-[#0B0F19] border-[#1E293B] text-white text-xs h-10 placeholder:text-[#94A3B8]/60 focus:border-[#3B82F6]"
        />
      </div>

      {/* Student List */}
      {filteredStudents.length === 0 ? (
        <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-8 text-center text-xs text-[#94A3B8] space-y-1">
          <p className="text-white font-600">No student profiles match your filter</p>
          <p>Try clearing your search query or selecting "All".</p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
          {filteredStudents.map((st) => (
            <div
              key={st.id}
              onClick={() => handleOpenStudent(st)}
              className="group cursor-pointer flex items-center justify-between gap-3.5 p-3.5 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] hover:border-[#3B82F6]/50 hover:bg-[#172033]/80 transition-all hover:translate-x-1"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`h-10 w-10 rounded-2xl flex items-center justify-center font-head font-800 text-sm shrink-0 border ${
                    st.overall >= 75
                      ? "bg-[#34D399]/15 border-[#34D399]/30 text-[#34D399]"
                      : st.overall >= 55
                      ? "bg-[#FBBF24]/15 border-[#FBBF24]/30 text-[#FBBF24]"
                      : "bg-[#F87171]/15 border-[#F87171]/30 text-[#F87171]"
                  }`}
                >
                  {st.name?.charAt(0)?.toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-head text-sm font-700 text-white truncate group-hover:text-[#60A5FA] transition-colors">
                      {st.name}
                    </h4>
                    {st.isStruggling && (
                      <span title="Multiple weak topics detected" className="text-[#F87171] inline-flex items-center">
                        <TrendingDown className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#94A3B8] font-mono mt-0.5">
                    {st.topics?.length || 0} topics • <span className="text-[#F87171] font-600">{st.weakTopics} weak</span> • <span className="text-[#34D399] font-600">{st.strongTopics} strong</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right font-mono">
                  <span
                    className={`text-sm font-800 block ${
                      st.overall >= 75
                        ? "text-[#34D399]"
                        : st.overall >= 55
                        ? "text-[#FBBF24]"
                        : "text-[#F87171]"
                    }`}
                  >
                    {st.overall}%
                  </span>
                  <span className="text-[9px] text-[#94A3B8] uppercase">Mastery</span>
                </div>
                <ChevronRight className="h-4 w-4 text-[#94A3B8] group-hover:text-white transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Student Deep-Dive Drawer / Modal */}
      <Dialog open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
        {selectedStudent && (
          <DialogContent className="bg-[#111827] border border-[#1E293B] text-white max-w-lg rounded-3xl p-6 sm:p-8 max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-3.5">
                <div className="h-12 w-12 rounded-2xl bg-[#3B82F6]/20 border border-[#3B82F6]/40 flex items-center justify-center text-base font-800 text-[#60A5FA]">
                  {selectedStudent.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <DialogTitle className="font-head text-2xl font-800 text-white">
                    {selectedStudent.name}
                  </DialogTitle>
                  <p className="text-xs text-[#94A3B8] font-mono">
                    Batch Mastery Index: <span className="text-white font-800">{selectedStudent.overall}%</span>
                  </p>
                </div>
              </div>
            </DialogHeader>

            {loadingDrill ? (
              <div className="p-12 text-center text-xs text-[#94A3B8] flex items-center justify-center gap-2">
                <span className="h-4 w-4 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
                Retrieving detailed attempt logs…
              </div>
            ) : drillData ? (
              <div className="mt-4 space-y-6">
                {/* Recent Submissions Trend */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase font-700 tracking-wider text-[#06B6D4] font-mono">
                      Recent Assessment History ({drillData.trend?.length || 0})
                    </h4>
                  </div>

                  {drillData.trend?.length === 0 ? (
                    <p className="text-xs text-[#94A3B8] p-4 bg-[#0B0F19] rounded-2xl border border-[#1E293B]">
                      No completed assessments on file for this student yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {drillData.trend.slice(0, 5).map((tr, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-2xl bg-[#0B0F19] border border-[#1E293B] text-xs font-mono"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="text-white font-700 block truncate">{tr.title || "Assessment"}</span>
                            <span className="text-[#94A3B8] text-[11px]">
                              {tr.correct}/{tr.total} correct • {tr.kind === "dpp" ? "DPP Practice" : "Timed Test"}
                            </span>
                          </div>
                          <span
                            className={`font-800 px-2.5 py-1 rounded-xl border shrink-0 ${
                              tr.score >= 75
                                ? "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30"
                                : tr.score >= 55
                                ? "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30"
                                : "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30"
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
                  <h4 className="text-xs uppercase font-700 tracking-wider text-[#06B6D4] font-mono">
                    Topic Breakdown ({drillData.topics?.length || 0})
                  </h4>
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {(drillData.topics || []).map((t, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-[#0B0F19] border border-[#1E293B] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="text-white font-700 truncate block">{t.topic}</span>
                          <span className="text-[11px] text-[#94A3B8] truncate block font-mono">
                            {t.chapter} • {t.attempts} Qs attempted
                          </span>
                        </div>
                        <span
                          className={`font-mono font-800 px-2.5 py-1 rounded-xl shrink-0 ${
                            t.band === "weak"
                              ? "text-[#F87171] bg-[#F87171]/15 border border-[#F87171]/30"
                              : t.band === "strong"
                              ? "text-[#34D399] bg-[#34D399]/15 border border-[#34D399]/30"
                              : "text-[#FBBF24] bg-[#FBBF24]/15 border border-[#FBBF24]/30"
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
