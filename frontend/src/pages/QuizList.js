import React, { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { isConfirmedWeak, isConfirmedStrong } from "../lib/mastery";
import { Button } from "../components/ui/button";
import { useConfirm } from "../components/ConfirmDialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import {
  Plus, FileQuestion, Sparkles, Clock, CheckCircle2, Lock,
  PlayCircle, Trophy, ChevronDown, Folder, Pencil, Trash2, Loader2, Users,
  Copy, Send, UserX, Search, Target, Zap, X, ChevronRight, ChevronLeft, BarChart2,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { motion } from "framer-motion";
import { toast } from "sonner";

function formatExpiry(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart}, ${timePart}`;
}

function TestStudentsModal({ testData, onClose, isTeacher }) {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState("leaderboard");
  const [leaderboard, setLeaderboard] = useState(null);
  const [missedData, setMissedData] = useState(null);
  const [absenceBusy, setAbsenceBusy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDrillLoading, setStudentDrillLoading] = useState(false);
  const [studentReview, setStudentReview] = useState(null);
  const [studentMastery, setStudentMastery] = useState(null);
  const [questionFilter, setQuestionFilter] = useState("all");
  const [topicSortOrder, setTopicSortOrder] = useState("weakest");

  const test = testData?.test;

  useEffect(() => {
    if (!test?.id) return;
    setActiveTab(testData?.initialTab || "leaderboard");
    setSelectedStudent(null);
    setStudentReview(null);
    setStudentMastery(null);
    setLoading(true);
    setSearch("");
    setCopied(false);
    setTopicSortOrder("weakest");

    const p1 = api
      .get(`/tests/${test.id}/leaderboard`)
      .then((r) => setLeaderboard(r.data || []))
      .catch(() => setLeaderboard([]));

    const p2 = isTeacher
      ? api
          .get(`/tests/${test.id}/missed-students`)
          .then((r) => setMissedData(r.data || null))
          .catch(() => setMissedData(null))
      : Promise.resolve();

    Promise.all([p1, p2]).finally(() => setLoading(false));
  }, [test?.id, testData?.initialTab, isTeacher]);

  const handleSelectStudent = (studentItem, medal, rankNum) => {
    if (!isTeacher || !studentItem.student_id) return;
    setSelectedStudent({
      ...studentItem,
      medal,
      rank: rankNum
    });
    setStudentDrillLoading(true);
    setQuestionFilter("all");
    setTopicSortOrder("weakest");

    const pReview = api
      .get(`/tests/${test.id}/submissions/${studentItem.student_id}`)
      .then((r) => setStudentReview(r.data))
      .catch(() => setStudentReview(null));

    const pMastery = api
      .get(`/mastery/teacher/student/${studentItem.student_id}`)
      .then((r) => setStudentMastery(r.data))
      .catch(() => setStudentMastery(null));

    Promise.all([pReview, pMastery]).finally(() => {
      setStudentDrillLoading(false);
    });
  };

  const sortedTopics = useMemo(() => {
    let list = [];
    if (studentMastery?.topics?.length) {
      // The mastery payload also lists untested syllabus topics (score 0); they are not calibrations
      list = studentMastery.topics.filter((t) => t.band !== "not_attempted");
    } else if (studentReview?.topic_summary?.length) {
      list = [...studentReview.topic_summary].map((t) => ({
        topic: t.topic,
        chapter: t.chapter,
        score: t.accuracy,
      }));
    }
    return list.sort((a, b) => {
      const sa = a.score ?? 0;
      const sb = b.score ?? 0;
      return topicSortOrder === "strongest" ? sb - sa : sa - sb;
    });
  }, [studentMastery, studentReview, topicSortOrder]);

  const filteredQuestions = useMemo(() => {
    const list = studentReview?.questions || [];
    if (questionFilter === "correct") return list.filter((q) => q.is_correct);
    if (questionFilter === "incorrect") return list.filter((q) => !q.is_correct);
    return list;
  }, [studentReview, questionFilter]);

  if (!test) return null;

  const reloadMissed = () =>
    api.get(`/tests/${test.id}/missed-students`).then((r) => setMissedData(r.data || null)).catch(() => {});

  const handleMakeup = async (st) => {
    if (!await confirm(`Give ${st.name} a make-up window starting now (${test.duration_minutes || ""} min test, open ${(Number(test.duration_minutes) || 0) + 30} min)? Answers stay hidden from the class until it closes.`)) return;
    setAbsenceBusy(st.id);
    try {
      await api.post(`/tests/${test.id}/makeup`, { student_ids: [st.id] });
      toast.success(`Make-up opened for ${st.name}`);
      await reloadMissed();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not open a make-up");
    } finally {
      setAbsenceBusy(null);
    }
  };

  const handleExcuse = async (st, excused) => {
    setAbsenceBusy(st.id);
    try {
      await api.post(`/tests/${test.id}/excuse`, { student_ids: [st.id], excused });
      toast.success(excused ? `${st.name} excused from this test` : `${st.name} no longer excused`);
      await reloadMissed();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not update");
    } finally {
      setAbsenceBusy(null);
    }
  };

  const handleReleaseResults = async () => {
    if (!await confirm("Show students the correct answers now? Anyone who hasn't taken it yet could be told them.")) return;
    try {
      await api.post(`/tests/${test.id}/release-results`);
      toast.success("Answers released to students");
      await reloadMissed();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not release results");
    }
  };

  const handleCopyAbsent = () => {
    if (!missedData?.missed_students?.length) return;
    const names = missedData.missed_students
      .map((s, idx) => `${idx + 1}. ${s.name}${s.email ? ` (${s.email})` : ""}`)
      .join("\n");
    const textToCopy = `Missed Test Roster: ${test.title}\nBatch: ${missedData.batch_name || "All Students"}\nTotal Absent: ${missedData.missed_count} students\n\n${names}`;
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setCopied(true);
        toast.success("Absent student roster copied to clipboard!");
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => {
        toast.error("Failed to copy to clipboard");
      });
  };

  const filteredLeaderboard = (leaderboard || []).filter((s) =>
    (s.student_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredMissed = (missedData?.missed_students || []).filter(
    (s) =>
      (s.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={!!test} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`bg-white border-[3px] border-[#1E293B] ${selectedStudent ? "max-w-2xl" : "max-w-lg"} rounded-3xl p-6 shadow-[6px_6px_0_#1E293B] text-[#1E293B] max-h-[88vh] flex flex-col transition-all duration-150`}>
        {selectedStudent ? (
          /* DRILL-DOWN HEADER */
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#1E293B]/10">
            <button
              type="button"
              onClick={() => { setSelectedStudent(null); setStudentReview(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFF9E8] hover:bg-[#FBEFC8] border-2 border-[#1E293B] font-head font-bold text-xs text-[#1E293B] shadow-[1.5px_1.5px_0_#1E293B] cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back to Leaderboard</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="font-head font-black text-xs px-2.5 py-1 rounded-lg bg-[#FFF9E8] border border-[#1E293B]">
                {selectedStudent.medal} Rank #{selectedStudent.rank}
              </span>
              <span className="font-head font-black text-xs px-2.5 py-1 rounded-lg bg-[#F5C842] border-2 border-[#1E293B] text-[#1E293B] shadow-[1px_1px_0_#1E293B]">
                {selectedStudent.score}%
              </span>
            </div>
          </div>
        ) : (
          /* DEFAULT TEST HEADER */
          <>
            <DialogHeader className="space-y-1 pb-3 border-b-2 border-[#1E293B]/10">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-[#FFF9E8] border border-[#1E293B] text-[11px] font-mono font-bold text-[#1E293B]">
                  Class {test.class_level || 9}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#5B9BD5]/15 border border-[#5B9BD5] text-[11px] font-mono font-bold text-[#3E7CB1]">
                  {test.batch_name || "All Students"}
                </span>
                <span className="text-xs text-[#64748B] font-mono font-bold">
                  {test.kind === "dpp" ? "Practice Test" : "Class Test"}
                </span>
              </div>
              <DialogTitle className="text-[#1E293B] font-head text-2xl font-black truncate">
                {test.title}
              </DialogTitle>
              <p className="text-xs text-[#64748B] font-medium truncate">
                {test.chapter}{test.topic ? ` • ${test.topic}` : ""}
              </p>
            </DialogHeader>

            {/* Tab Switcher Pills */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setActiveTab("leaderboard"); setSearch(""); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-2xl text-xs font-head font-900 border-2 border-[#1E293B] transition-all cursor-pointer ${
                  activeTab === "leaderboard"
                    ? "bg-[#F5C842] text-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                    : "bg-white text-[#64748B] hover:bg-[#FFF9E8] hover:text-[#1E293B]"
                }`}
              >
                <Trophy className="h-4 w-4 text-[#F5C842]" />
                <span>Leaderboard</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white border border-[#1E293B] font-bold">
                  {leaderboard ? leaderboard.length : "…"}
                </span>
              </button>

              {isTeacher && (
                <button
                  type="button"
                  onClick={() => { setActiveTab("missed"); setSearch(""); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-2xl text-xs font-head font-900 border-2 border-[#1E293B] transition-all cursor-pointer ${
                    activeTab === "missed"
                      ? "bg-[#FF6B5E] text-white shadow-[2px_2px_0_#1E293B]"
                      : "bg-white text-[#64748B] hover:bg-[#FEE2E2] hover:text-[#E04A3C]"
                  }`}
                >
                  <UserX className="h-4 w-4" />
                  <span>Missed Test</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono border font-bold ${
                    activeTab === "missed"
                      ? "bg-white text-[#E04A3C] border-[#1E293B]"
                      : "bg-[#FFF9E8] text-[#1E293B] border-[#1E293B]"
                  }`}>
                    {missedData ? missedData.missed_count : "…"}
                  </span>
                </button>
              )}
            </div>
          </>
        )}

        {/* Tab / Drill-down Body */}
        {selectedStudent ? (
          /* STUDENT DETAIL VIEW (ANSWERS + TOPIC BAR GRAPH) */
          <div className="flex-1 overflow-y-auto space-y-4 pt-2 pr-1 min-h-[300px]">
            {/* Student Overview Strip */}
            <div className="p-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] flex items-center justify-between gap-3 shadow-[1.5px_1.5px_0_#1E293B]">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#64748B] font-bold">
                  Student Assessment Drill-Down
                </div>
                <h3 className="font-head text-lg font-black text-[#1E293B]">
                  {selectedStudent.student_name}
                </h3>
                <p className="text-[11px] text-[#64748B] font-medium">
                  {test.title} • {test.chapter}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="text-center px-3 py-1 rounded-xl bg-white border border-[#1E293B]">
                  <span className="block font-head font-black text-sm text-[#2F8A5F]">
                    {studentReview?.summary?.correct ?? selectedStudent.correct}
                  </span>
                  <span className="text-[9px] font-mono text-[#64748B] uppercase font-bold">Correct</span>
                </div>
                <div className="text-center px-3 py-1 rounded-xl bg-white border border-[#1E293B]">
                  <span className="block font-head font-black text-sm text-[#E04A3C]">
                    {(studentReview?.summary?.total ?? selectedStudent.total) - (studentReview?.summary?.correct ?? selectedStudent.correct)}
                  </span>
                  <span className="text-[9px] font-mono text-[#64748B] uppercase font-bold">Incorrect</span>
                </div>
              </div>
            </div>

            {studentDrillLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-[#64748B] space-y-2">
                <span className="h-6 w-6 border-3 border-[#1E293B] border-t-transparent rounded-full animate-spin" />
                <span className="font-head text-xs font-bold text-[#1E293B]">Loading student submission and topic calibrations…</span>
              </div>
            ) : (
              <>
                {/* 1. DUAL-COLOR TOPIC MASTERY & GAP ANALYSIS BAR GRAPH */}
                <div className="rounded-2xl bg-white border-2 border-[#1E293B] p-4 shadow-[2px_2px_0_#1E293B] space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <BarChart2 className="h-4 w-4 text-[#3E7CB1]" />
                      <h4 className="font-head font-black text-sm text-[#1E293B] uppercase tracking-wide">
                        Topic Mastery & Gap Analysis
                      </h4>
                    </div>

                    {/* Legend & Sort Toggle */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Mini Legend */}
                      <div className="flex items-center gap-2 bg-[#FFF9E8] px-2.5 py-1 rounded-lg border border-[#1E293B] text-[10px] font-head font-bold">
                        <span className="flex items-center gap-1 text-[#2F8A5F]">
                          <span className="h-2 w-2 rounded-full bg-[#2F8A5F]" />
                          Mastered
                        </span>
                        <span className="text-[#64748B]">|</span>
                        <span className="flex items-center gap-1 text-[#E04A3C]">
                          <span className="h-2 w-2 rounded-full bg-[#E04A3C]" />
                          Gap (Needs Work)
                        </span>
                      </div>

                      {/* Sort Toggle */}
                      <div className="flex items-center bg-[#FFF9E8] p-0.5 rounded-lg border border-[#1E293B] text-[10px] font-head font-bold">
                        <button
                          id="btn-sort-weakest"
                          type="button"
                          onClick={() => setTopicSortOrder("weakest")}
                          className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                            topicSortOrder === "weakest"
                              ? "bg-[#1E293B] text-white shadow-[1px_1px_0_#1E293B]"
                              : "text-[#64748B] hover:text-[#1E293B]"
                          }`}
                        >
                          Weakest First
                        </button>
                        <button
                          id="btn-sort-strongest"
                          type="button"
                          onClick={() => setTopicSortOrder("strongest")}
                          className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                            topicSortOrder === "strongest"
                              ? "bg-[#1E293B] text-white shadow-[1px_1px_0_#1E293B]"
                              : "text-[#64748B] hover:text-[#1E293B]"
                          }`}
                        >
                          Strongest First
                        </button>
                      </div>
                    </div>
                  </div>

                  {sortedTopics.length === 0 ? (
                    <p className="text-xs text-[#64748B] text-center py-4">No topic calibrations available yet.</p>
                  ) : (
                    <div className="space-y-3 pt-1">
                      {sortedTopics.map((top, idx) => {
                        const rawScore = top.score ?? 0;
                        const score = Math.round(Math.max(0, Math.min(100, rawScore)));
                        const gap = 100 - score;
                        // Mastery rows carry backend confirmation flags (weak/strong across >= 2 tests);
                        // anything unconfirmed reads as Developing. Per-test topic_summary rows have no band.
                        const isWeak = top.band ? isConfirmedWeak(top) : score < 55;
                        const isDev = top.band ? !isWeak && !isConfirmedStrong(top) : (score >= 55 && score < 75);
                        const bandLabel = isWeak ? "Needs Work" : isDev ? "Developing" : "Mastered";
                        const bandClass = isWeak
                          ? "text-[#E04A3C] border-[#E04A3C] bg-[#FEE2E2]"
                          : isDev
                          ? "text-[#B45309] border-[#B45309] bg-[#FEF3C7]"
                          : "text-[#2F8A5F] border-[#2F8A5F] bg-[#EAF7EE]";

                        return (
                          <div key={idx} className="space-y-1.5 p-2.5 rounded-xl bg-[#FFF9E8]/50 border border-[#1E293B]/20">
                            <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                              <span className="font-head font-bold text-[#1E293B] truncate max-w-[260px]">
                                {top.topic}
                                {top.chapter ? (
                                  <span className="text-[10px] text-[#64748B] font-mono font-normal"> ({top.chapter})</span>
                                ) : null}
                              </span>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`text-[10px] font-head font-black uppercase px-2 py-0.5 rounded-full border ${bandClass}`}>
                                  {bandLabel}
                                </span>
                                <span className="font-mono text-[10px] font-bold text-[#2F8A5F] bg-white px-1.5 py-0.5 rounded border border-[#2F8A5F]/40 shadow-xs">
                                  {score}% Mastered
                                </span>
                                {gap > 0 && (
                                  <span className="font-mono text-[10px] font-bold text-[#E04A3C] bg-white px-1.5 py-0.5 rounded border border-[#E04A3C]/40 shadow-xs">
                                    {gap}% Gap
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Dual-Color Bar Track */}
                            <div className="h-4 w-full bg-[#FFF9E8] rounded-full border-2 border-[#1E293B] overflow-hidden flex shadow-[1px_1px_0_#1E293B]">
                              {/* Green Segment (Score) */}
                              {score > 0 && (
                                <div
                                  className="h-full bg-[#2F8A5F] flex items-center justify-center text-[9px] font-mono font-black text-white transition-all duration-500 overflow-hidden"
                                  style={{ width: `${score}%` }}
                                  title={`Mastered: ${score}%`}
                                >
                                  {score >= 18 ? `${score}%` : ""}
                                </div>
                              )}
                              {/* Red Segment (Gap) */}
                              {gap > 0 && (
                                <div
                                  className="h-full bg-[#E04A3C] flex items-center justify-center text-[9px] font-mono font-black text-white transition-all duration-500 overflow-hidden"
                                  style={{ width: `${gap}%` }}
                                  title={`Gap (Needs Work): ${gap}%`}
                                >
                                  {gap >= 18 ? `${gap}%` : ""}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. CORRECT & INCORRECT ANSWERS BREAKDOWN */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#2F8A5F]" />
                      <h4 className="font-head font-black text-sm text-[#1E293B] uppercase tracking-wide">
                        Test Questions & Student Answers
                      </h4>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1.5 bg-[#FFF9E8] p-1 rounded-xl border border-[#1E293B]">
                      <button
                        type="button"
                        onClick={() => setQuestionFilter("all")}
                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-head font-bold transition-all cursor-pointer ${
                          questionFilter === "all"
                            ? "bg-[#1E293B] text-white shadow-[1px_1px_0_#1E293B]"
                            : "text-[#64748B] hover:text-[#1E293B]"
                        }`}
                      >
                        All ({studentReview?.questions?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuestionFilter("correct")}
                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-head font-bold transition-all cursor-pointer ${
                          questionFilter === "correct"
                            ? "bg-[#2F8A5F] text-white shadow-[1px_1px_0_#1E293B]"
                            : "text-[#2F8A5F] hover:bg-[#EAF7EE]"
                        }`}
                      >
                        Correct ({studentReview?.summary?.correct || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuestionFilter("incorrect")}
                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-head font-bold transition-all cursor-pointer ${
                          questionFilter === "incorrect"
                            ? "bg-[#E04A3C] text-white shadow-[1px_1px_0_#1E293B]"
                            : "text-[#E04A3C] hover:bg-[#FEE2E2]"
                        }`}
                      >
                        Incorrect ({(studentReview?.summary?.total || 0) - (studentReview?.summary?.correct || 0)})
                      </button>
                    </div>
                  </div>

                  {/* Question Cards List */}
                  <div className="space-y-3">
                    {filteredQuestions.map((q) => {
                      const isCorrect = q.is_correct;
                      const isUnattempted = q.is_unattempted;
                      return (
                        <div
                          key={q.index}
                          className={`rounded-2xl border-2 p-4 space-y-3 text-xs bg-white shadow-[2px_2px_0_#1E293B] ${
                            isCorrect
                              ? "border-[#2F8A5F]/60"
                              : isUnattempted
                              ? "border-[#64748B]/60"
                              : "border-[#E04A3C]/60"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-head font-black text-sm text-[#1E293B]">
                                Q{q.index}.
                              </span>
                              {q.topic && (
                                <span className="px-2 py-0.5 rounded-md bg-[#FFF9E8] border border-[#1E293B] text-[10px] font-mono font-bold text-[#1E293B]">
                                  {q.topic}
                                </span>
                              )}
                            </div>

                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-head font-black border uppercase ${
                                isCorrect
                                  ? "bg-[#EAF7EE] text-[#2F8A5F] border-[#2F8A5F]"
                                  : isUnattempted
                                  ? "bg-[#F1F5F9] text-[#64748B] border-[#64748B]"
                                  : "bg-[#FEE2E2] text-[#E04A3C] border-[#E04A3C]"
                              }`}
                            >
                              {isCorrect ? "✓ Correct" : isUnattempted ? "— Unattempted" : "✗ Incorrect"}
                            </span>
                          </div>

                          <p className="font-bold text-[#1E293B] text-xs leading-relaxed">
                            {q.question}
                          </p>

                          <div className="space-y-1.5 pt-1">
                            {q.options.map((opt, optIdx) => {
                              const isChosen = q.chosen_index === optIdx;
                              const isRightAns = q.correct_index === optIdx;

                              let optClass = "border-[#1E293B]/20 bg-white text-[#1E293B]";
                              if (isRightAns) {
                                optClass = "border-[#2F8A5F] bg-[#EAF7EE] font-bold text-[#2F8A5F]";
                              }
                              if (isChosen && !isCorrect) {
                                optClass = "border-[#E04A3C] bg-[#FEE2E2] font-bold text-[#E04A3C]";
                              }

                              return (
                                <div
                                  key={optIdx}
                                  className={`flex items-center justify-between p-2 rounded-xl border-2 text-xs transition-colors ${optClass}`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 pr-2">
                                    <span className="font-mono font-bold text-[11px] w-5">
                                      {String.fromCharCode(65 + optIdx)}.
                                    </span>
                                    <span className="truncate">{opt}</span>
                                  </div>

                                  <div className="shrink-0 flex items-center gap-1.5 text-[10px] font-head font-bold">
                                    {isChosen && (
                                      <span className="px-1.5 py-0.2 rounded bg-white/80 border border-current">
                                        Student's Choice
                                      </span>
                                    )}
                                    {isRightAns && (
                                      <span className="px-1.5 py-0.2 rounded bg-[#2F8A5F] text-white">
                                        Correct Answer
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {q.explanation && (
                            <div className="p-2.5 rounded-xl bg-[#FFF9E8] border border-[#1E293B]/30 text-[11px] space-y-1">
                              <span className="font-head font-bold text-[#1E293B] block">💡 Explanation:</span>
                              <p className="text-[#64748B] leading-relaxed font-medium">
                                {q.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          /* DEFAULT LEADERBOARD & MISSED TABS */
          <div className="flex-1 overflow-y-auto space-y-3 pt-2 pr-1 min-h-[220px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-[#64748B] space-y-2">
                <span className="h-6 w-6 border-3 border-[#1E293B] border-t-transparent rounded-full animate-spin" />
                <span className="font-head text-xs font-bold text-[#1E293B]">Retrieving student roster…</span>
              </div>
            ) : activeTab === "leaderboard" ? (
              /* LEADERBOARD VIEW */
              <div className="space-y-2.5">
                {isTeacher && leaderboard && leaderboard.length > 0 && (
                  <p className="text-[11px] text-[#3E7CB1] font-head font-bold px-1">
                    💡 Click on any student to review their answers & topic mastery bar graph.
                  </p>
                )}
                {leaderboard && leaderboard.length > 4 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748B]" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search students in leaderboard…"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border-2 border-[#1E293B] bg-[#FFF9E8] text-[#1E293B] focus:outline-none"
                    />
                  </div>
                )}

                {leaderboard?.length === 0 ? (
                  <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-8 text-center space-y-1">
                    <Trophy className="h-8 w-8 mx-auto text-[#64748B]/40" />
                    <p className="font-head font-bold text-sm text-[#1E293B]">No Submissions Yet</p>
                    <p className="text-xs text-[#64748B]">
                      Students have not submitted this test yet. Once submitted, their ranks and scores will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredLeaderboard.map((r, i) => {
                      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
                      return (
                        <div
                          key={i}
                          onClick={() => isTeacher && handleSelectStudent(r, medal, i + 1)}
                          className={`flex items-center justify-between p-2.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] text-xs transition-all ${
                            isTeacher && r.student_id
                              ? "hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#1E293B] hover:bg-[#FBEFC8] cursor-pointer"
                              : ""
                          }`}
                          title={isTeacher ? "Click to view student answers & topic breakdown" : undefined}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <span className="font-head font-900 text-sm w-7 text-center shrink-0">
                              {medal}
                            </span>
                            <span className="font-head font-bold text-[#1E293B] truncate">
                              {r.student_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[11px] text-[#64748B]">
                              {r.correct}/{r.total} Qs
                            </span>
                            <span className="font-head font-black px-2.5 py-0.5 rounded-lg bg-white border border-[#1E293B] text-xs text-[#1E293B]">
                              {r.score}%
                            </span>
                            {isTeacher && r.student_id && (
                              <span className="text-[10px] font-head font-bold text-[#3E7CB1] flex items-center gap-0.5 pl-1">
                                Review <ChevronRight className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* MISSED TEST VIEW */
              <div className="space-y-2.5">
                {!missedData || !missedData.has_batch ? (
                  <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-8 text-center space-y-1">
                    <p className="font-head font-bold text-sm text-[#1E293B]">Unassigned Test</p>
                    <p className="text-xs text-[#64748B]">
                      Assign this test to a specific batch using the <strong>Reuse</strong> button to track batch attendance.
                    </p>
                  </div>
                ) : missedData.missed_count === 0 ? (
                  <div className="rounded-2xl bg-[#4CAF7D]/10 border-2 border-[#4CAF7D] p-6 text-center space-y-1">
                    <CheckCircle2 className="h-8 w-8 mx-auto text-[#4CAF7D]" />
                    <p className="font-head font-900 text-sm text-[#2F8A5F]">100% Attendance!</p>
                    <p className="text-xs text-[#2F8A5F]/80">
                      All {missedData.total_enrolled} enrolled students in <strong>{missedData.batch_name}</strong> completed this test.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Summary & Copy Strip */}
                    <div className="flex items-center justify-between p-2.5 rounded-2xl bg-[#FEE2E2] border-2 border-[#E04A3C] text-xs">
                      <div>
                        <span className="font-head font-900 text-[#E04A3C]">
                          {missedData.missed_count} of {missedData.total_enrolled} Absent
                        </span>
                        <span className="block text-[10px] text-[#64748B] font-mono">
                          {missedData.batch_name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyAbsent}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border-2 border-[#E04A3C] font-head font-bold text-xs text-[#E04A3C] hover:bg-[#E04A3C] hover:text-white transition-colors shadow-[1px_1px_0_#E04A3C] cursor-pointer"
                      >
                        {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copied ? "Copied!" : "Copy Absent List"}</span>
                      </button>
                    </div>

                    {missedData.missed_students.length > 4 && (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748B]" />
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search absent student…"
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border-2 border-[#1E293B] bg-[#FFF9E8] text-[#1E293B] focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {filteredMissed.map((st, idx) => (
                        <div
                          key={st.id || idx}
                          className="flex items-center justify-between p-2.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] text-xs"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-head font-bold text-[#1E293B] truncate block">
                              {idx + 1}. {st.name}
                            </span>
                            {st.email && (
                              <span className="text-[10px] text-[#64748B] font-mono truncate block">
                                {st.email}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {st.excused ? (
                              <span className="px-2 py-0.5 rounded-lg bg-[#1E293B]/5 border border-[#1E293B]/30 text-[#1E293B]/70 font-mono text-[10px] font-bold">Excused</span>
                            ) : st.makeup ? (
                              <span className="px-2 py-0.5 rounded-lg bg-[#3E7CB1]/10 border border-[#3E7CB1]/40 text-[#3E7CB1] font-mono text-[10px] font-bold" title={`Until ${new Date(st.makeup.closes_at).toLocaleString()}`}>
                                Make-up {new Date(st.makeup.opens_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-lg bg-[#E04A3C]/10 border border-[#E04A3C]/40 text-[#E04A3C] font-mono text-[10px] font-bold">Missed</span>
                            )}
                            {missedData?.kind === "test" && missedData?.window_closed && (
                              <>
                                {!st.makeup && (
                                  <button type="button" disabled={absenceBusy === st.id} onClick={() => handleMakeup(st)}
                                    className="px-2 py-0.5 rounded-lg border border-[#1E293B] bg-white text-[10px] font-bold hover:bg-[#FFF9E8]"
                                    title="Give this student their own window (same questions and duration) starting now">
                                    Make-up
                                  </button>
                                )}
                                <button type="button" disabled={absenceBusy === st.id} onClick={() => handleExcuse(st, !st.excused)}
                                  className="px-2 py-0.5 rounded-lg border border-[#1E293B] bg-white text-[10px] font-bold hover:bg-[#FFF9E8]"
                                  title={st.excused ? "Count this test in their attendance again" : "Leave this test out of their attendance"}>
                                  {st.excused ? "Un-excuse" : "Excuse"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-3 pt-2 border-t border-[#1E293B]/10 flex items-center justify-between">
          {selectedStudent ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => { setSelectedStudent(null); setStudentReview(null); }}
              className="rounded-full border-2 border-[#1E293B] bg-white font-head font-bold text-xs h-9 px-4 shadow-[1.5px_1.5px_0_#1E293B]"
            >
              ← Back to Leaderboard
            </Button>
          ) : missedData?.kind === "test" && !missedData?.results_released ? (
            // Answers are hidden until the test (and make-ups) close; the teacher can release them early
            <Button type="button" variant="outline" onClick={handleReleaseResults}
              className="rounded-full border-2 border-[#1E293B] bg-white font-head font-bold text-xs h-9 px-4 shadow-[1.5px_1.5px_0_#1E293B]"
              title={missedData?.results_release_at ? `Otherwise released ${new Date(missedData.results_release_at).toLocaleString()}` : undefined}>
              Release answers now
            </Button>
          ) : <div />}
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-full border-2 border-[#1E293B] bg-white font-head font-bold text-xs h-9 px-4 shadow-[1.5px_1.5px_0_#1E293B]"
          >
            Close Window
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PAGE_SIZE = 24;

// Where a test sits in a student's list
function studentStatus(t, now) {
  if (t.submitted) return "done";
  if (t.opens_in_future) return "upcoming";
  const expired = t.valid_until ? new Date(t.valid_until) <= now : false;
  return t.is_active && !expired ? "todo" : "closed";
}

const STUDENT_FILTERS = [
  { key: "todo", label: "To do" },
  { key: "done", label: "Done" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

function TestCard({ t, isTeacher, isDpp, i, onEdit, onDelete, deleting, onReuse, onToggleActive, togglingActive, onOpenStudentsModal, isTargeted }) {
  const done = t.submitted;
  // Templates are a teacher concept; students are never sent drafts
  const isDraft = isTeacher && Boolean(
    t.is_draft ||
    (!t.valid_until && t.is_active === false) ||
    (t.is_active === false && (!t.batch_name || t.batch_name === "Saved / Unassigned")) ||
    (!t.batch_id && (!t.batch_name || t.batch_name === "Saved / Unassigned"))
  );
  const isExpired = !isDraft && t.valid_until ? new Date(t.valid_until) <= new Date() : false;
  const isTeacherLive = !isDraft && !isExpired && t.is_active !== false;
  const isTeacherPaused = !isDraft && !isExpired && t.is_active === false;
  const studentLive = !isTeacher && !isDraft && t.is_active && !isExpired;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
      className={`relative group min-w-0 rounded-3xl bg-white border-[2.5px] ${isTargeted ? "border-[#E04A3C] ring-2 ring-[#E04A3C]/30 shadow-[5px_5px_0_#E04A3C]" : "border-[#1E293B] shadow-[4px_4px_0_#1E293B]"} p-5 sm:p-6 flex flex-col justify-between hover:-translate-y-1 transition-all`}>

      <div>
        {isTargeted && (
          <div className="mb-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E04A3C]/10 border-2 border-[#E04A3C] text-[#E04A3C] text-[11px] font-head font-black shadow-[1.5px_1.5px_0_#E04A3C]">
            <Target className="h-3.5 w-3.5 animate-pulse" />
            <span>🎯 TARGETED WEAK CONCEPT</span>
          </div>
        )}
        {/* Teacher action buttons */}
        {isTeacher && (
          // Always visible on touch screens (no hover); hover-to-reveal only where a mouse exists
          <div className="absolute top-3 right-3 flex gap-1.5 transition-opacity z-10 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100">
            <button
              data-testid={`reuse-icon-${t.id}`}
              onClick={() => onReuse(t)}
              aria-label="Reuse test" className="h-10 w-10 rounded-full bg-white hover:bg-[#F5C842]/40 border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center justify-center text-[#1E293B] transition-colors"
              title="Reuse test / assign to batch">
              <Copy className="h-3.5 w-3.5 text-[#1E293B]" />
            </button>
            <button
              data-testid={`edit-test-${t.id}`}
              onClick={() => onEdit(t)}
              aria-label="Edit test" className="h-10 w-10 rounded-full bg-white hover:bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center justify-center text-[#1E293B] transition-colors"
              title="Edit test">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              data-testid={`delete-test-${t.id}`}
              onClick={() => onDelete(t)}
              disabled={deleting === t.id}
              aria-label="Delete test" className="h-10 w-10 rounded-full bg-white hover:bg-[#FF6B5E]/20 border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center justify-center text-[#FF6B5E] transition-colors disabled:opacity-50"
              title="Delete test">
              {deleting === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        <div className={`flex flex-wrap items-center justify-between gap-2 mb-3 ${isTeacher ? "pr-36" : ""}`}>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="max-w-full truncate text-[11px] font-head font-bold uppercase tracking-wide px-3 py-0.5 rounded-full border-2 border-[#1E293B] bg-[#FFF9E8] text-[#1E293B]">{t.subject}</span>
            {isTeacher && (
              isDraft ? (
                <button
                  type="button"
                  data-testid={`assign-template-${t.id}`}
                  onClick={() => onReuse(t)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-head font-bold border-2 transition-all bg-[#F3E8FF] text-[#7E22CE] border-[#7E22CE]/40 hover:bg-[#E9D5FF] cursor-pointer"
                  title="Master Template. Click to assign to a batch as a live test."
                >
                  <span className="h-2 w-2 rounded-full bg-[#9333EA]" />
                  Template
                </button>
              ) : (
                <button
                  type="button"
                  data-testid={`toggle-active-${t.id}`}
                  onClick={() => onToggleActive(t)}
                  disabled={togglingActive === t.id || isExpired}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-head font-bold border-2 transition-all ${
                    isExpired
                      ? "bg-[#F1F5F9] text-[#64748B] border-[#94A3B8]/60 cursor-not-allowed opacity-90"
                      : isTeacherLive
                      ? "bg-[#EAF7EE] text-[#2F8A5F] border-[#2F8A5F]/50 hover:bg-[#d5f0dd] cursor-pointer"
                      : "bg-[#FFFBEB] text-[#B45309] border-[#F59E0B]/50 hover:bg-[#FEF3C7] cursor-pointer"
                  }`}
                  title={
                    isExpired
                      ? "Test window has expired. Click Edit (pencil icon) to extend."
                      : isTeacherLive
                      ? "Currently live for students. Click to pause."
                      : "Currently paused. Click to make live."
                  }
                >
                  {togglingActive === t.id ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isExpired
                          ? "bg-[#94A3B8]"
                          : isTeacherLive
                          ? "bg-[#2F8A5F] animate-pulse"
                          : "bg-[#F59E0B]"
                      }`}
                    />
                  )}
                  {isExpired ? "Expired" : isTeacherLive ? "Live" : "Paused"}
                </button>
              )
            )}
          </div>
          {!isTeacher && (done ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs font-head font-bold text-[#64748B]">
                <Lock className="h-3.5 w-3.5" /> Closed
              </span>
              <span className="flex items-center gap-1 text-xs font-head font-bold text-[#4CAF7D]">
                <CheckCircle2 className="h-4 w-4" /> {t.score}%
              </span>
            </div>
          ) : studentLive ? (
            <span className="flex items-center gap-1.5 text-xs font-head font-bold text-[#2F8A5F] bg-[#EAF7EE] px-2.5 py-0.5 rounded-full border border-[#2F8A5F]/40">
              <span className="h-2 w-2 rounded-full bg-[#2F8A5F] animate-pulse" /> Live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-head font-bold text-[#64748B] bg-[#F1F5F9] px-2.5 py-0.5 rounded-full border border-[#94A3B8]/40">
              <Lock className="h-3.5 w-3.5" /> Closed
            </span>
          ))}
        </div>
        <h3 className="font-head text-lg font-900 leading-snug text-[#1E293B]">{t.title}</h3>
        <div className="text-xs text-[#64748B] mt-1 font-bold">
          Class {t.class_level} • {t.chapter}{t.topic ? ` • ${t.topic}` : ""}{isDraft ? " • Reusable Master Template" : (t.batch_name ? ` • Batch: ${t.batch_name}` : "")}
        </div>
        <div className="mt-4 flex items-center gap-3 text-xs text-[#1E293B] font-mono font-bold">
          <span className="flex items-center gap-1"><FileQuestion className="h-3.5 w-3.5 text-[#5B9BD5]" /> {t.question_count} Qs</span>
          {t.duration_minutes > 0 ? (
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-[#F5C842]" /> {t.duration_minutes} min</span>
          ) : isDpp ? (
            <span className="flex items-center gap-1 text-[#64748B]"><Clock className="h-3.5 w-3.5 text-[#64748B]" /> Untimed</span>
          ) : null}
        </div>
        {isDraft ? (
          <div className="text-xs font-bold mt-2 font-mono flex items-center gap-1.5 text-[#7E22CE]">
            <Clock className="h-3.5 w-3.5" />
            <span>Master Template • Ready to assign</span>
          </div>
        ) : t.valid_until ? (
          <div className={`text-xs font-bold mt-2 font-mono flex items-center gap-1.5 ${isExpired ? "text-[#64748B]" : "text-[#5B9BD5]"}`}>
            <Clock className="h-3.5 w-3.5" />
            <span>{isExpired ? "Expired:" : "Expires:"} {formatExpiry(t.valid_until)}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        {isTeacher ? (
          t.status === "processing" ? (
            <Button disabled className="w-full rounded-full font-head font-bold bg-[#FFF9E8] text-[#64748B] border-2 border-[#1E293B]">Building…</Button>
          ) : t.status === "failed" ? (
            <Button disabled className="w-full rounded-full font-head font-bold bg-[#FFF9E8] text-[#FF6B5E] border-2 border-[#1E293B]">Failed</Button>
          ) : isDraft ? (
            <div className="grid grid-cols-2 gap-2">
              <Button data-testid={`view-quiz-${t.id}`} asChild variant="outline" className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] font-head font-bold shadow-[2px_2px_0_#1E293B] text-xs h-9">
                <Link to={`/quiz/${t.id}`}>Preview</Link>
              </Button>
              <Button
                data-testid={`assign-quiz-${t.id}`}
                onClick={() => onReuse(t)}
                className="rounded-full bg-[#F5C842] hover:bg-[#ebd438] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-9 flex items-center justify-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" /> Assign to Batch
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button data-testid={`view-quiz-${t.id}`} asChild variant="outline" className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] font-head font-bold shadow-[2px_2px_0_#1E293B] text-xs h-9">
                <Link to={`/quiz/${t.id}`}>Preview</Link>
              </Button>
              <Button
                data-testid={`reuse-quiz-${t.id}`}
                onClick={() => onReuse(t)}
                className="rounded-full bg-[#F5C842] hover:bg-[#ebd438] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-9 flex items-center justify-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" /> Reuse
              </Button>
            </div>
          )
        ) : done && !isDpp ? (
          // Class test answers open once the test (and any make-ups) close, or when the teacher releases them
          t.results_released ? (
            <Button asChild variant="outline" className="w-full rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] font-head font-bold">
              <Link to={`/quiz/${t.id}?review=1`}>View answers</Link>
            </Button>
          ) : (
            <Button disabled className="w-full rounded-full font-head font-bold bg-[#FFF9E8] text-[#64748B] border-2 border-[#1E293B]">Answers after the test closes</Button>
          )
        ) : done ? (
          <Button disabled className="w-full rounded-full font-head font-bold bg-[#FFF9E8] text-[#64748B] border-2 border-[#1E293B]">Completed</Button>
        ) : t.opens_in_future ? (
          <Button disabled className="w-full rounded-full font-head font-bold bg-[#F1F5F9] text-[#1E293B] border-2 border-[#1E293B]">
            Opens {formatExpiry(t.valid_from)}
          </Button>
        ) : studentLive ? (
          <Button data-testid={`start-quiz-${t.id}`} asChild className={`w-full rounded-full border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold ${
            isTargeted
              ? "bg-[#E04A3C] hover:bg-[#c93f33] text-white"
              : "bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B]"
          }`}>
            <Link to={`/quiz/${t.id}`}>
              {isTargeted ? "Fix Concept Sprint ➔" : isDpp ? "Practice Sprint" : t.is_makeup ? "Start Make-up Test" : "Start Test"}
            </Link>
          </Button>
        ) : (
          <Button disabled className="w-full rounded-full font-head font-bold bg-[#F1F5F9] text-[#64748B] border-2 border-[#1E293B]">Closed</Button>
        )}
      </div>
      {/* Student Standings (Leaderboard) & Missed Test Modal Buttons */}
      <div className="mt-3 pt-2.5 border-t border-[#1E293B]/10 grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid={`open-leaderboard-${t.id}`}
          onClick={() => onOpenStudentsModal(t, "leaderboard")}
          className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-[#FFF9E8] hover:bg-[#FBEFC8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold text-[#1E293B] transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <Trophy className="h-3.5 w-3.5 text-[#F5C842]" />
          <span>Leaderboard</span>
        </button>
        {isTeacher ? (
          <button
            type="button"
            data-testid={`open-missed-${t.id}`}
            onClick={() => onOpenStudentsModal(t, "missed")}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-[#FFF9E8] hover:bg-[#FEE2E2] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold text-[#1E293B] transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <UserX className="h-3.5 w-3.5 text-[#E04A3C]" />
            <span>Missed Test</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenStudentsModal(t, "leaderboard")}
            className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl bg-white border border-[#1E293B]/20 text-xs font-head font-bold text-[#64748B] hover:text-[#1E293B] cursor-pointer"
          >
            <span>Class Ranks</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}

const inp = "rounded-xl mt-1.5 bg-[#FFF9E8] border-2 border-[#1E293B] text-[#1E293B]";

export default function QuizList({ kind }) {
  const { user } = useAuth();
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentsModal, setStudentsModal] = useState(null);
  const isDpp = kind === "dpp";

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const nav = useNavigate();

  const targetSubject = searchParams.get("subject") || location.state?.subject || "";
  const targetChapter = searchParams.get("chapter") || location.state?.chapter || "";
  const targetTopic = searchParams.get("topic") || location.state?.topic || "";
  const hasTarget = isDpp && Boolean(targetSubject || targetChapter || targetTopic);

  const [generatingSprint, setGeneratingSprint] = useState(false);
  const handleStartTargetedSprint = async () => {
    setGeneratingSprint(true);
    try {
      const res = await api.post("/tests/diagnostic", {
        subject: targetSubject,
        chapter: targetChapter,
        topic: targetTopic,
      });
      toast.success(`Targeted sprint generated for ${targetTopic || targetChapter}!`);
      nav(`/quiz/${res.data.id}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to generate targeted sprint");
    } finally {
      setGeneratingSprint(false);
    }
  };

  const isTargetMatch = (t) => {
    if (!hasTarget) return false;
    const topicNorm = (targetTopic || "").toLowerCase().trim();
    const chapterNorm = (targetChapter || "").toLowerCase().trim();
    const subjectNorm = (targetSubject || "").toLowerCase().trim();

    const tTopic = (t.topic || "").toLowerCase();
    const tChapter = (t.chapter || "").toLowerCase();
    const tTitle = (t.title || "").toLowerCase();
    const tSubject = (t.subject || "").toLowerCase();

    if (subjectNorm && tSubject && !tSubject.includes(subjectNorm) && !subjectNorm.includes(tSubject)) {
      return false;
    }

    if (topicNorm && (tTopic.includes(topicNorm) || tTitle.includes(topicNorm) || topicNorm.includes(tTopic))) {
      return true;
    }

    if (chapterNorm && (tChapter.includes(chapterNorm) || tTitle.includes(chapterNorm) || chapterNorm.includes(tChapter))) {
      return true;
    }

    return false;
  };

  // Batches for reuse modal
  const [batches, setBatches] = useState([]);
  useEffect(() => {
    if (isTeacher) {
      api.get("/batches").then((r) => setBatches(r.data || [])).catch(() => setBatches([]));
    }
  }, [isTeacher]);

  // Live / Paused / Draft toggle state
  const [togglingActive, setTogglingActive] = useState(null);
  const handleToggleActive = async (test) => {
    const isDraft = Boolean(test.is_draft || (!test.valid_until && test.is_active === false) || (test.is_active === false && test.batch_name === "Saved / Unassigned"));
    const isExpired = !isDraft && test.valid_until ? new Date(test.valid_until) <= new Date() : false;
    if (isExpired) {
      toast.info("This test has expired. Click Edit (pencil icon) to extend the active window.");
      return;
    }
    setTogglingActive(test.id);
    const nextVal = test.is_active === false;
    try {
      const payload = { is_active: nextVal, is_draft: false };
      if (isDraft) {
        payload.valid_hours = test.valid_hours || 24;
      }
      const res = await api.patch(`/tests/${test.id}`, payload);
      setItems((prev) =>
        prev.map((t) =>
          t.id === test.id
            ? { ...t, ...res.data, is_active: res.data?.is_active ?? nextVal, is_draft: false }
            : t
        )
      );
      toast.success(
        isDraft
          ? "Draft published and now Live for students!"
          : nextVal
          ? "Test is now Live for students"
          : "Test Paused (hidden from students)"
      );
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to update status");
    } finally {
      setTogglingActive(null);
    }
  };

  // Reuse / Duplicate state
  const [reuseTest, setReuseTest] = useState(null);
  const [reuseForm, setReuseForm] = useState({
    title: "",
    batch_id: "all",
    duration_minutes: 0,
    valid_hours: 24,
    timing_mode: "untimed",
  });
  const [reusing, setReusing] = useState(false);

  const openReuse = (test) => {
    setReuseTest(test);
    const dur = test.duration_minutes || 0;
    setReuseForm({
      title: test.title, // Option A: same title as template
      batch_id: test.batch_id || "all",
      duration_minutes: dur,
      valid_hours: test.valid_hours || 24,
      timing_mode: dur > 0 ? "timed" : "untimed",
    });
  };

  const handleDuplicate = async () => {
    if (!reuseTest) return;
    setReusing(true);
    try {
      const payload = {
        title: reuseForm.title || reuseTest.title,
        batch_id: reuseForm.batch_id === "all" ? "" : reuseForm.batch_id,
        duration_minutes: reuseForm.timing_mode === "timed" ? Number(reuseForm.duration_minutes) || 15 : 0,
        valid_hours: Number(reuseForm.valid_hours) || 24,
      };
      const res = await api.post(`/tests/${reuseTest.id}/duplicate`, payload);
      toast.success(
        reuseTest.is_draft
          ? `Test launched live${res.data?.batch_name ? ` for ${res.data.batch_name}` : ""}! Master template preserved.`
          : `Test created & assigned${res.data?.batch_name ? ` to ${res.data.batch_name}` : ""}!`
      );
      setReuseTest(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to duplicate test");
    } finally {
      setReusing(false);
    }
  };

  // Delete state
  const [deleting, setDeleting] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Edit state
  const [editTest, setEditTest] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/tests", { params: { kind } }).then((r) => setItems(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState(null); // null until items load, then "todo" or "all"
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) => [t.title, t.chapter, t.topic, t.subject, t.batch_name]
      .some((v) => (v || "").toLowerCase().includes(q)));
  }, [items, search]);

  // Students: one list, what they can do now first
  const studentBuckets = useMemo(() => {
    const now = new Date();
    const b = { todo: [], upcoming: [], done: [], closed: [] };
    for (const t of searched) b[studentStatus(t, now)].push(t);
    const closes = (t) => (t.valid_until ? new Date(t.valid_until).getTime() : Infinity);
    b.todo.sort((x, y) => (isTargetMatch(y) ? 1 : 0) - (isTargetMatch(x) ? 1 : 0) || closes(x) - closes(y));
    b.upcoming.sort((x, y) => new Date(x.valid_from) - new Date(y.valid_from));
    return b;
  }, [searched]);
  const activeStudentFilter = studentFilter || (studentBuckets.todo.length ? "todo" : "all");
  const studentList = activeStudentFilter === "all"
    ? [...studentBuckets.todo, ...studentBuckets.upcoming, ...studentBuckets.done, ...studentBuckets.closed]
    : activeStudentFilter === "todo" ? [...studentBuckets.todo, ...studentBuckets.upcoming] : studentBuckets[activeStudentFilter];
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [activeStudentFilter, search, kind]);

  // Group by Class → Batch
  const classGroups = useMemo(() => {
    return searched.reduce((acc, t) => {
      const cl = `Class ${t.class_level || "?"}`;
      const isDraft = Boolean(
        t.is_draft ||
        (!t.valid_until && t.is_active === false) ||
        (t.is_active === false && (!t.batch_name || t.batch_name === "Saved / Unassigned")) ||
        (!t.batch_id && (!t.batch_name || t.batch_name === "Saved / Unassigned"))
      );
      const batch = (isDraft && isTeacher)
        ? "Master Templates"
        : (t.batch_name?.trim() || (isTeacher ? "Master Templates" : "General"));
      if (!acc[cl]) acc[cl] = {};
      if (!acc[cl][batch]) acc[cl][batch] = [];
      acc[cl][batch].push(t);
      return acc;
    }, {});
  }, [searched, isTeacher]);
  const sortedClasses = useMemo(() => Object.keys(classGroups).sort(), [classGroups]);

  /* ---- Delete ---- */
  const handleDelete = async (test) => {
    setDeleting(test.id);
    try {
      await api.delete(`/tests/${test.id}`);
      toast.success("Test deleted");
      setItems((prev) => prev.filter((t) => t.id !== test.id));
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Delete failed");
    } finally {
      setDeleting(null);
      setDeleteConfirm(null);
    }
  };

  /* ---- Edit ---- */
  const openEdit = (test) => {
    setEditTest(test);
    setEditForm({ title: test.title, valid_hours: test.valid_hours || 24 });
  };

  const saveEdit = async () => {
    if (!editTest) return;
    setSaving(true);
    try {
      const res = await api.patch(`/tests/${editTest.id}`, editForm);
      toast.success("Test updated");
      setItems((prev) => prev.map((t) => (t.id === editTest.id ? { ...t, ...res.data } : t)));
      setEditTest(null);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-[#F5C842] border-[3px] border-[#1E293B] shadow-[5px_5px_0_#1E293B]">
        <div>
          <span className="text-xs uppercase tracking-widest text-[#1E293B] font-head font-extrabold px-3 py-1 bg-white rounded-full border-2 border-[#1E293B]">
            {isDpp ? "Practice Tests" : "Board Assessments"}
          </span>
          <h1 className="font-head text-3xl sm:text-4xl font-900 tracking-tight text-[#1E293B] uppercase mt-2">
            {isDpp ? "Practice Tests (DPP)" : "Class Tests"}
          </h1>
        </div>
        {isTeacher && (
          <Button data-testid="new-quiz-btn" asChild className="rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold hover:bg-[#FFF9E8]">
            <Link to={isDpp ? "/dpp/new" : "/tests/new"}>
              <Plus className="h-4 w-4 mr-1" /> + Create {isDpp ? "Practice Test" : "Test"}
            </Link>
          </Button>
        )}
      </div>

      {/* Targeted Weak Concept Hero Banner for Students */}
      {hasTarget && !isTeacher && (
        <div className="p-6 sm:p-7 rounded-3xl bg-[#FFF9E8] border-[3px] border-[#1E293B] shadow-[5px_5px_0_#1E293B] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-[#E04A3C] text-white text-xs font-head font-black border-2 border-[#1E293B] shadow-[1.5px_1.5px_0_#1E293B] flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 animate-pulse" /> TARGETED CONCEPT PRESCRIPTION
              </span>
              {targetSubject && (
                <span className="px-2.5 py-0.5 rounded-full bg-white text-[#1E293B] text-xs font-mono font-bold border border-[#1E293B]">
                  {targetSubject}
                </span>
              )}
              {targetChapter && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#5B9BD5]/20 text-[#3E7CB1] text-xs font-mono font-bold border border-[#5B9BD5]">
                  {targetChapter}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchParams({});
                nav("/dpp", { replace: true, state: {} });
              }}
              className="flex items-center gap-1 text-xs font-head font-bold text-[#64748B] hover:text-[#1E293B] underline cursor-pointer"
            >
              <X className="h-3.5 w-3.5" /> Clear filter (Show all practice sets)
            </button>
          </div>

          <div>
            <h2 className="font-head text-2xl sm:text-3xl font-black text-[#1E293B]">
              Fix Concept: {targetTopic || targetChapter}
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B] font-medium mt-1">
              Personalized practice set targeting your diagnosed weakness to build mastery for CBSE board exams.
            </p>
          </div>

          <div className="pt-1 flex flex-wrap items-center gap-3">
            <Button
              onClick={handleStartTargetedSprint}
              disabled={generatingSprint}
              className="rounded-full bg-[#E04A3C] hover:bg-[#c93f33] text-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] font-head font-bold text-xs h-10 px-5 flex items-center gap-2 active:translate-x-[1px] active:translate-y-[1px]"
            >
              {generatingSprint ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Calibrating 10 Questions…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 fill-white" /> Start Instant 10-Q Sprint on {targetTopic || targetChapter}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-3">
          <Input
            type="search"
            aria-label={isDpp ? "Search practice tests" : "Search class tests"}
            placeholder="Search by title or chapter"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-full border-2 border-[#1E293B] bg-white"
          />
          {!isTeacher && (
            <div role="tablist" aria-label="Show" className="flex gap-2 overflow-x-auto pb-1">
              {STUDENT_FILTERS.map((f) => {
                const count = f.key === "all" ? searched.length
                  : f.key === "todo" ? studentBuckets.todo.length + studentBuckets.upcoming.length
                  : studentBuckets[f.key].length;
                return (
                  <button
                    key={f.key}
                    role="tab"
                    aria-selected={activeStudentFilter === f.key}
                    data-testid={`filter-${f.key}`}
                    onClick={() => setStudentFilter(f.key)}
                    className={`shrink-0 min-h-11 px-4 rounded-full text-sm font-head font-bold border-2 border-[#1E293B] ${
                      activeStudentFilter === f.key ? "bg-[#1E293B] text-white" : "bg-white text-[#1E293B]"
                    }`}
                  >
                    {f.label} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading ? <p className="text-[#64748B] font-bold">Loading assessments…</p> : items.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[#1E293B] bg-white p-16 text-center shadow-[4px_4px_0_#1E293B]">
          {isDpp ? <Sparkles className="h-10 w-10 mx-auto text-[#64748B]" /> : <FileQuestion className="h-10 w-10 mx-auto text-[#64748B]" />}
          <p className="mt-3 text-[#1E293B] font-bold">Nothing here yet{!isTeacher && ". Join a batch to receive tests from your teacher."}</p>
        </div>
      ) : !isTeacher ? (
        studentList.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-[#1E293B]/40 bg-white p-10 text-center font-bold text-[#64748B]">
            {search ? "No tests match your search." : activeStudentFilter === "todo" ? "You're all caught up. Nothing to do right now." : "Nothing here."}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {studentList.slice(0, visibleCount).map((t, i) => (
                <TestCard
                  key={t.id} t={t} isTeacher={false} isDpp={isDpp} i={Math.min(i, 6)}
                  onOpenStudentsModal={(test, initialTab) => setStudentsModal({ test, initialTab })}
                  isTargeted={isTargetMatch(t)}
                />
              ))}
            </div>
            {studentList.length > visibleCount && (
              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  className="min-h-11 rounded-full border-2 border-[#1E293B] bg-white font-head font-bold"
                >
                  Show more ({studentList.length - visibleCount} left)
                </Button>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="space-y-10">
          {sortedClasses.map((cl) => {
            const batchMap = classGroups[cl];
            const sortedBatches = Object.keys(batchMap).sort((a, b) => {
              if (a === "Master Templates") return -1;
              if (b === "Master Templates") return 1;
              if (a === "General") return 1;
              if (b === "General") return -1;
              return a.localeCompare(b);
            });
            return (
              <div key={cl}>
                {/* Class header */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-8 w-8 rounded-xl bg-[#5B9BD5] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
                    <Folder className="h-4 w-4 text-white" />
                  </div>
                  <h2 className="font-head text-2xl font-900 text-[#1E293B] uppercase">{cl}</h2>
                  <div className="flex-1 h-0.5 bg-[#1E293B]" />
                </div>

                <div className="space-y-6 sm:pl-2 sm:border-l-2 border-[#1E293B]">
                  {sortedBatches.map((batch) => {
                    const batchItems = batchMap[batch];
                    const isTemplateFolder = batch === "Master Templates";
                    return (
                      <div key={batch}>
                        {/* Batch sub-header */}
                        {isTemplateFolder ? (
                          <div className="flex flex-wrap items-center gap-2.5 mb-4 sm:ml-4 p-2.5 rounded-2xl bg-[#F3E8FF]/80 border-2 border-[#9333EA]/30 pr-4 shadow-[2px_2px_0_#9333EA]/20">
                            <div className="h-7 w-7 rounded-xl bg-[#9333EA] border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center justify-center">
                              <Sparkles className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-head font-900 text-[#7E22CE] text-sm tracking-wide uppercase">
                                📁 Master Templates
                              </h3>
                              <span className="text-[10px] font-sans font-bold px-2.5 py-0.5 rounded-full bg-white text-[#7E22CE] border border-[#7E22CE]/40">
                                Reusable Library
                              </span>
                            </div>
                            <span className="text-xs text-[#7E22CE] font-mono font-bold">({batchItems.length})</span>
                            <div className="flex-1 h-0.5 bg-[#9333EA]/30 ml-1" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mb-4 sm:ml-4 min-w-0">
                            <Folder className="h-4 w-4 text-[#F5C842]" />
                            <h3 className="font-head font-bold text-[#1E293B] text-sm tracking-wide uppercase">{batch}</h3>
                            <span className="text-xs text-[#64748B] font-mono font-bold">({batchItems.length})</span>
                            <div className="flex-1 h-0.5 bg-[#1E293B]/20 ml-1" />
                          </div>
                        )}
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:pl-4">
                          {batchItems
                            .slice()
                            .sort((a, b) => (isTargetMatch(b) ? 1 : 0) - (isTargetMatch(a) ? 1 : 0))
                            .map((t, i) => (
                              <TestCard
                                key={t.id} t={t} isTeacher={isTeacher} isDpp={isDpp} i={i}
                                onEdit={openEdit} onDelete={setDeleteConfirm} deleting={deleting}
                                onReuse={openReuse} onToggleActive={handleToggleActive} togglingActive={togglingActive}
                                onOpenStudentsModal={(test, initialTab) => setStudentsModal({ test, initialTab })}
                                isTargeted={isTargetMatch(t)}
                              />
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Reuse / Duplicate dialog ---- */}
      <Dialog open={!!reuseTest} onOpenChange={(o) => { if (!o) setReuseTest(null); }}>
        <DialogContent className="bg-white border-[3px] border-[#1E293B] max-w-lg rounded-3xl p-6 shadow-[6px_6px_0_#1E293B] text-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] font-head text-xl font-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#F5C842]" />
              {reuseTest?.is_draft ? "Assign Template to Batch" : "Reuse / Assign Test"}
            </DialogTitle>
          </DialogHeader>

          {reuseTest && (
            <div className="space-y-4 py-2">
              {/* Summary Box */}
              <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-3 text-xs space-y-1">
                <div className="font-head font-bold text-[#1E293B] flex items-center justify-between">
                  <span>Class {reuseTest.class_level} • {reuseTest.subject}</span>
                  <span className="font-mono text-[#5B9BD5] font-bold">{reuseTest.question_count} Questions</span>
                </div>
                <div className="text-[#64748B] font-medium truncate">
                  {reuseTest.chapter}{reuseTest.topic ? ` • ${reuseTest.topic}` : ""}
                </div>
                <div className="text-[11px] text-[#2F8A5F] font-bold pt-0.5">
                  {reuseTest.is_draft
                    ? "✓ Creates a fresh live test for the batch. Master template remains preserved in your library."
                    : "✓ Reuses exact questions with a fresh attempt history & leaderboard."}
                </div>
              </div>

              {/* Title */}
              <div>
                <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">New Test Title</Label>
                <Input
                  data-testid="reuse-title-input"
                  className={inp}
                  value={reuseForm.title}
                  onChange={(e) => setReuseForm({ ...reuseForm, title: e.target.value })}
                />
              </div>

              {/* Target Batch */}
              <div>
                <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Target Batch</Label>
                <Select
                  value={reuseForm.batch_id}
                  onValueChange={(v) => setReuseForm({ ...reuseForm, batch_id: v })}
                >
                  <SelectTrigger data-testid="reuse-batch-select" className={inp}>
                    <SelectValue placeholder="Choose batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {isDpp ? "All my students (every batch I teach)" : "All my students"}
                    </SelectItem>
                    {batches
                      .filter((b) => !b.class_level || String(b.class_level) === String(reuseTest.class_level))
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} (Class {b.class_level || reuseTest.class_level})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Timing & Validity */}
              <div className="grid grid-cols-2 gap-3">
                {isDpp ? (
                  <div>
                    <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Mode</Label>
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      <button
                        type="button"
                        onClick={() => setReuseForm({ ...reuseForm, timing_mode: "untimed", duration_minutes: 0 })}
                        className={`py-2 rounded-xl text-xs font-head font-bold border-2 transition-all ${
                          reuseForm.timing_mode === "untimed"
                            ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                            : "bg-[#FFF9E8] text-[#1E293B]/70 border-[#1E293B]/30"
                        }`}
                      >
                        Untimed
                      </button>
                      <button
                        type="button"
                        onClick={() => setReuseForm({ ...reuseForm, timing_mode: "timed", duration_minutes: reuseForm.duration_minutes || 15 })}
                        className={`py-2 rounded-xl text-xs font-head font-bold border-2 transition-all ${
                          reuseForm.timing_mode === "timed"
                            ? "bg-[#F5C842] text-[#1E293B] border-[#1E293B] shadow-[2px_2px_0_#1E293B]"
                            : "bg-[#FFF9E8] text-[#1E293B]/70 border-[#1E293B]/30"
                        }`}
                      >
                        Timed
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Duration (min)</Label>
                    <Input
                      type="number" min={1}
                      className={inp + " font-mono"}
                      value={reuseForm.duration_minutes}
                      onChange={(e) => setReuseForm({ ...reuseForm, duration_minutes: e.target.value })}
                    />
                  </div>
                )}

                <div>
                  <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Valid for (hours)</Label>
                  <Input
                    type="number" min={1} max={720}
                    className={inp + " font-mono"}
                    value={reuseForm.valid_hours}
                    onChange={(e) => setReuseForm({ ...reuseForm, valid_hours: e.target.value })}
                  />
                  {reuseForm.valid_hours && (
                    <div className="text-[11px] text-[#5B9BD5] font-bold font-mono mt-1">
                      Expires: {formatExpiry(new Date(Date.now() + (Number(reuseForm.valid_hours) || 24) * 3600000))}
                    </div>
                  )}
                </div>
              </div>

              {reuseForm.timing_mode === "timed" && isDpp && (
                <div>
                  <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Sprint Duration (minutes)</Label>
                  <Input
                    type="number" min={1}
                    className={inp + " font-mono"}
                    value={reuseForm.duration_minutes}
                    onChange={(e) => setReuseForm({ ...reuseForm, duration_minutes: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" className="rounded-full border-2 border-[#1E293B] text-[#1E293B]"
              onClick={() => setReuseTest(null)}>Cancel</Button>
            <Button
              data-testid="confirm-reuse-btn"
              className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] font-head font-bold shadow-[2px_2px_0_#1E293B]"
              disabled={reusing}
              onClick={handleDuplicate}
            >
              {reusing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              {reuseTest?.is_draft ? "Launch to Batch" : "Launch Fresh Test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete confirmation ---- */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="bg-white border-[3px] border-[#1E293B] max-w-md rounded-3xl p-6 shadow-[6px_6px_0_#1E293B] text-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] font-head text-xl font-900">Delete test?</DialogTitle>
          </DialogHeader>
          <p className="text-[#64748B] text-sm leading-relaxed font-medium">
            <span className="font-bold text-[#1E293B]">"{deleteConfirm?.title}"</span> will be permanently removed.
            Students who haven't taken it yet will lose access.
          </p>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" className="rounded-full border-2 border-[#1E293B] text-[#1E293B]"
              onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              className="rounded-full bg-[#FF6B5E] hover:bg-[#EE594B] text-white border-2 border-[#1E293B] font-head font-bold"
              disabled={!!deleting}
              onClick={() => handleDelete(deleteConfirm)}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Edit dialog ---- */}
      <Dialog open={!!editTest} onOpenChange={(o) => { if (!o) setEditTest(null); }}>
        <DialogContent className="bg-white border-[3px] border-[#1E293B] max-w-md rounded-3xl p-6 shadow-[6px_6px_0_#1E293B] text-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] font-head text-xl font-900">Edit test</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">Title</Label>
              <Input className={inp} value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            <div>
              <Label className="font-head font-bold text-xs uppercase text-[#1E293B]">
                Active window (hours from now)
              </Label>
              <Input
                className={inp}
                type="number" min={1} max={720}
                value={editForm.valid_hours || ""}
                onChange={(e) => setEditForm({ ...editForm, valid_hours: parseInt(e.target.value, 10) || 24 })}
              />
              {editForm.valid_hours && (
                <div className="text-[11px] text-[#5B9BD5] font-bold font-mono mt-1">
                  Expires: {formatExpiry(new Date(Date.now() + (Number(editForm.valid_hours) || 24) * 3600000))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" className="rounded-full border-2 border-[#1E293B] text-[#1E293B]"
              onClick={() => setEditTest(null)}>Cancel</Button>
            <Button className="rounded-full bg-[#5B9BD5] hover:bg-[#4D8BC4] text-white border-2 border-[#1E293B] font-head font-bold"
              disabled={saving} onClick={saveEdit}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Student Standings & Missed Test Modal Window ---- */}
      <TestStudentsModal
        testData={studentsModal}
        onClose={() => setStudentsModal(null)}
        isTeacher={isTeacher}
      />
    </div>
  );
}
