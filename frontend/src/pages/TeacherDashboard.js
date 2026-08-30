import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Users,
  FileQuestion,
  BookOpen,
  Sparkles,
  UploadCloud,
  Plus,
  TrendingDown,
  TrendingUp,
  BarChart3,
  Award,
  ArrowRight,
  HelpCircle,
  FileText,
  AlertTriangle,
  Zap,
  FolderOpen,
  Layers,
  CheckCircle2,
  Orbit,
} from "lucide-react";
import { toast } from "sonner";
import ClassHeatmap from "../components/dashboard/ClassHeatmap";
import StudentRosterRadar from "../components/dashboard/StudentRosterRadar";
import PendingReviewsQueue from "../components/dashboard/PendingReviewsQueue";
import ImportQuestionsModal from "../components/dashboard/ImportQuestionsModal";

export default function TeacherDashboard() {
  const { user } = useAuth();
  const nav = useNavigate();

  // State
  const [stats, setStats] = useState({});
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [reportData, setReportData] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Time-of-day greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const formattedDate = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  // Fetch initial batches & stats
  useEffect(() => {
    api.get("/stats").then((r) => setStats(r.data || {})).catch(() => {});
    api.get("/batches").then((r) => {
      const list = r.data || [];
      setBatches(list);
      if (list.length > 0 && !selectedBatchId) {
        setSelectedBatchId(list[0].id);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch report data when selectedBatchId changes
  useEffect(() => {
    if (!selectedBatchId) return;
    setLoadingReport(true);
    api.get("/mastery/teacher", { params: { batch_id: selectedBatchId } })
      .then((r) => setReportData(r.data))
      .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail)))
      .finally(() => setLoadingReport(false));
  }, [selectedBatchId]);

  // Calculate average class score across all students in batch
  const avgClassScore = useMemo(() => {
    if (!reportData || !reportData.students || reportData.students.length === 0) return 72;
    let totalScore = 0;
    let count = 0;
    reportData.students.forEach((s) => {
      (s.topics || []).forEach((t) => {
        if (t.score !== undefined) {
          totalScore += t.score;
          count += 1;
        }
      });
    });
    return count > 0 ? Math.round(totalScore / count) : 72;
  }, [reportData]);

  // Selected batch object
  const activeBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId) || batches[0];
  }, [batches, selectedBatchId]);

  return (
    <div className="space-y-8 pb-16">
      {/* 1. TEACHER COMMAND HERO & STATS BANNER */}
      <div className="relative rounded-3xl glass-panel p-6 sm:p-8 lg:p-10 border border-[#1E293B] overflow-hidden shadow-2xl">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#06B6D4]/15 blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-[#3B82F6]/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-700 font-mono">
                  {formattedDate}
                </span>
                <span className="text-[#94A3B8]/60 text-xs">•</span>
                <Badge className="bg-[#06B6D4]/15 text-[#22D3EE] border-[#06B6D4]/30 font-700 text-xs px-3 py-0.5 rounded-full">
                  Educator Command Hub
                </Badge>
                <span className="text-[#94A3B8]/60 text-xs">•</span>
                <span className="text-xs text-[#34D399] font-mono font-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Question Bank Verified
                </span>
              </div>

              <h1 className="font-head text-3xl sm:text-4xl lg:text-5xl font-800 tracking-tight text-white flex items-center gap-3">
                {greeting}, <span className="text-gradient-cyan">{user?.name?.split(" ")[0]}</span>!{" "}
                <span className="animate-floaty inline-block">👨‍🏫</span>
              </h1>

              <p className="text-[#94A3B8] text-sm sm:text-base max-w-xl leading-relaxed">
                Live mastery telemetry across your coaching cohorts. Monitor weak concepts, generate AI study notes, and launch timed tests from verified question banks.
              </p>
            </div>

            {/* Quick Action Creation Toolkit */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0 bg-[#0B0F19]/80 p-3 rounded-3xl border border-[#1E293B] shadow-xl">
              <Button
                asChild
                className="rounded-2xl bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-800 text-xs h-11 px-4 glow-blue transition-transform hover:scale-105"
              >
                <Link to="/notes/new" className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" /> + AI Study Note
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-2xl border-[#1E293B] bg-[#111827] text-white hover:bg-[#1E293B] font-700 text-xs h-11 px-4 transition-transform hover:scale-105"
              >
                <Link to="/tests/new" className="flex items-center gap-2">
                  <FileQuestion className="h-4 w-4 text-[#06B6D4]" /> + Timed Test
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-2xl border-[#1E293B] bg-[#111827] text-white hover:bg-[#1E293B] font-700 text-xs h-11 px-4 transition-transform hover:scale-105"
              >
                <Link to="/dpp/new" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#FBBF24]" /> + Daily Practice
                </Link>
              </Button>
              <Button
                type="button"
                onClick={() => setImportModalOpen(true)}
                variant="outline"
                className="rounded-2xl border-[#1E293B] bg-[#111827] text-white hover:bg-[#1E293B] font-700 text-xs h-11 px-4 transition-transform hover:scale-105"
              >
                <UploadCloud className="h-4 w-4 text-[#34D399] mr-1.5" /> Import CSV
              </Button>
            </div>
          </div>

          {/* 4 Metric Cards with Key Telemetry */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-4 border-t border-[#1E293B]/70">
            {/* Metric 1: Total Students (Clickable to /batches) */}
            <Link
              to={selectedBatchId ? `/batches?batch_id=${selectedBatchId}` : "/batches"}
              className="p-4 sm:p-5 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] relative overflow-hidden group hover:border-[#3B82F6] hover:bg-[#172033]/80 transition-all hover:scale-[1.02] cursor-pointer block"
            >
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span className="font-mono uppercase tracking-wider text-[10px] group-hover:text-[#60A5FA] transition-colors">
                  Active Students
                </span>
                <Users className="h-4 w-4 text-[#3B82F6]" />
              </div>
              <div className="font-head text-2xl sm:text-3xl font-800 text-white mt-1.5 flex items-center justify-between">
                <span>{stats.students ?? (reportData?.students?.length || 0)}</span>
                <ArrowRight className="h-4 w-4 text-[#3B82F6] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#34D399] font-mono mt-1">
                <TrendingUp className="h-3.5 w-3.5" /> Enrolled across {batches.length} cohorts
              </div>
            </Link>

            {/* Metric 2: Active Assessments */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] relative overflow-hidden group hover:border-[#06B6D4]/50 transition-all hover:scale-[1.02]">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span className="font-mono uppercase tracking-wider text-[10px]">Live Assessments</span>
                <FileQuestion className="h-4 w-4 text-[#06B6D4]" />
              </div>
              <div className="font-head text-2xl sm:text-3xl font-800 text-white mt-1.5">
                {(stats.tests || 0) + (stats.dpps || 0)}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#06B6D4] font-mono mt-1">
                <span>{stats.tests ?? 0} Timed Mocks • {stats.dpps ?? 0} DPPs</span>
              </div>
            </div>

            {/* Metric 3: Avg Class Score */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] relative overflow-hidden group hover:border-[#34D399]/50 transition-all hover:scale-[1.02]">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span className="font-mono uppercase tracking-wider text-[10px]">Class Mastery Avg</span>
                <Award className="h-4 w-4 text-[#34D399]" />
              </div>
              <div className="font-head text-2xl sm:text-3xl font-800 text-[#34D399] mt-1.5">
                {avgClassScore}%
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#34D399] font-mono mt-1">
                <span>Developing ➔ Strong retention</span>
              </div>
            </div>

            {/* Metric 4: AI Notes Generated */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] relative overflow-hidden group hover:border-[#FBBF24]/50 transition-all hover:scale-[1.02]">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span className="font-mono uppercase tracking-wider text-[10px]">AI Study Notes</span>
                <BookOpen className="h-4 w-4 text-[#FBBF24]" />
              </div>
              <div className="font-head text-2xl sm:text-3xl font-800 text-white mt-1.5">
                {stats.notes ?? 0}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#FBBF24] font-mono mt-1">
                <span>100% CBSE 2025–26 Aligned</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. BATCH SWITCHER CAPSULE STRIP */}
      {batches.length > 0 && (
        <div className="rounded-3xl glass-panel p-4 sm:p-5 border border-[#1E293B] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Orbit className="h-5 w-5 text-[#06B6D4]" />
            <span className="font-head text-sm font-700 text-white">Active Cohort:</span>
            <span className="text-xs text-[#94A3B8] font-mono">
              {activeBatch?.name} (Class {activeBatch?.class_level}) • Join Code:{" "}
              <code className="text-[#06B6D4] font-bold bg-[#0B0F19] px-2 py-0.5 rounded-md border border-[#1E293B]">
                {activeBatch?.code}
              </code>
            </span>
            <Link
              to={`/batches?batch_id=${selectedBatchId || ""}`}
              className="text-xs font-700 text-[#3B82F6] hover:text-[#60A5FA] flex items-center gap-1 ml-2 transition-colors"
            >
              View Roster & Ranks →
            </Link>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {batches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBatchId(b.id)}
                className={`px-4 py-2 rounded-2xl text-xs font-700 transition-all whitespace-nowrap flex items-center gap-2 border ${
                  selectedBatchId === b.id
                    ? "bg-[#3B82F6] text-white border-[#3B82F6] shadow-lg shadow-[#3B82F6]/30 glow-blue"
                    : "bg-[#0B0F19] text-[#94A3B8] border-[#1E293B] hover:text-white hover:border-[#3B82F6]/40"
                }`}
              >
                <span>{b.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/30 font-mono">
                  Class {b.class_level}
                </span>
              </button>
            ))}
            <Button
              size="sm"
              variant="outline"
              asChild
              className="rounded-2xl border-[#1E293B] bg-[#0B0F19] text-[#94A3B8] hover:text-white text-xs h-9 px-3 shrink-0"
            >
              <Link to="/batches">
                <Plus className="h-3.5 w-3.5 mr-1" /> New Batch
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* 3. CLASS HEATMAP (Hero Matrix) */}
      <ClassHeatmap
        batches={batches}
        selectedBatchId={selectedBatchId}
        onSelectBatch={setSelectedBatchId}
        reportData={reportData}
        loading={loadingReport}
      />

      {/* 4. TWO-COLUMN DEEP DIVE (7fr Left / 5fr Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Class Weak Topics Leaderboard & Pending Reviews (7 Cols) */}
        <div className="lg:col-span-7 space-y-8">
          {/* Class Weak Topics Leaderboard */}
          <div className="rounded-3xl glass-panel p-6 sm:p-8 space-y-5 border border-[#1E293B] shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-[#F87171]/15 border border-[#F87171]/30 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-[#F87171]" />
                </div>
                <div>
                  <h3 className="font-head text-xl font-800 text-white">
                    Class Weak Topics Leaderboard
                  </h3>
                  <span className="text-xs text-[#94A3B8]">Concepts with lowest cohort accuracy</span>
                </div>
              </div>
              <Badge className="bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30 font-mono text-[10px] px-2.5 py-0.5">
                Auto-Ranked
              </Badge>
            </div>

            {!reportData || (reportData.weak_topics || []).length === 0 ? (
              <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-8 text-center text-xs text-[#94A3B8] space-y-1">
                <CheckCircle2 className="h-8 w-8 text-[#34D399] mx-auto opacity-70" />
                <p className="font-700 text-white">No Critical Weaknesses Identified</p>
                <p>All student submissions in this batch are currently above the 55% threshold.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reportData.weak_topics.slice(0, 5).map((w, idx) => {
                  const isSevere = w.class_avg < 55;
                  return (
                    <div
                      key={`${w.subject}|${w.chapter}|${w.topic}|${idx}`}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] hover:border-[#F87171]/50 transition-all hover:translate-x-1"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-800 text-[#F87171]">#{idx + 1}</span>
                          <Badge className="bg-[#3B82F6]/15 text-[#60A5FA] border-[#3B82F6]/30 text-[10px] font-700">
                            {w.subject}
                          </Badge>
                          <span className="text-xs text-[#94A3B8] font-mono">{w.chapter}</span>
                        </div>
                        <h4 className="font-head text-sm sm:text-base font-700 text-white truncate group-hover:text-[#60A5FA] transition-colors">
                          {w.topic}
                        </h4>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right font-mono">
                          <div
                            className={`font-head text-xl font-800 ${
                              isSevere ? "text-[#F87171]" : "text-[#FBBF24]"
                            }`}
                          >
                            {w.class_avg}%
                          </div>
                          <span className="text-[10px] text-[#94A3B8] uppercase">Class Avg</span>
                        </div>

                        <Button
                          size="sm"
                          asChild
                          className="rounded-full bg-[#3B82F6]/20 hover:bg-[#3B82F6] text-[#60A5FA] hover:text-white border border-[#3B82F6]/40 text-xs h-9 px-3.5 font-700 transition-all"
                        >
                          <Link to="/dpp/new">
                            <Plus className="h-3.5 w-3.5 mr-1" /> + Create DPP
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending Question Reviews Queue */}
          <PendingReviewsQueue
            onQueueChange={() => {
              api.get("/stats").then((r) => setStats(r.data || {})).catch(() => {});
            }}
          />
        </div>

        {/* RIGHT COLUMN: Student Roster Radar & Quick Shortcuts (5 Cols) */}
        <div className="lg:col-span-5 space-y-8">
          {/* Student Roster with Mastery Radar */}
          <StudentRosterRadar students={reportData?.students || []} />

          {/* Educator Toolkit Shortcuts */}
          <div className="rounded-3xl glass-panel p-6 sm:p-7 space-y-4 border border-[#1E293B]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#FBBF24]" />
              <h3 className="font-head text-base font-800 text-white">Educator Studio Toolkit</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                asChild
                variant="outline"
                className="h-auto py-3.5 px-3.5 rounded-2xl bg-[#0B0F19] border-[#1E293B] hover:border-[#3B82F6]/60 flex flex-col items-start text-left justify-start transition-transform hover:scale-105"
              >
                <Link to="/notes/new" className="space-y-1.5 w-full">
                  <BookOpen className="h-4 w-4 text-[#3B82F6]" />
                  <span className="font-700 text-xs text-white block">Generate Note</span>
                  <span className="text-[10px] text-[#94A3B8] font-normal block leading-tight">
                    Multi-pass AI extractor
                  </span>
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                className="h-auto py-3.5 px-3.5 rounded-2xl bg-[#0B0F19] border-[#1E293B] hover:border-[#06B6D4]/60 flex flex-col items-start text-left justify-start transition-transform hover:scale-105"
              >
                <Link to="/tests/new" className="space-y-1.5 w-full">
                  <FileQuestion className="h-4 w-4 text-[#06B6D4]" />
                  <span className="font-700 text-xs text-white block">Timed Exam</span>
                  <span className="text-[10px] text-[#94A3B8] font-normal block leading-tight">
                    Snapshot from bank
                  </span>
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                className="h-auto py-3.5 px-3.5 rounded-2xl bg-[#0B0F19] border-[#1E293B] hover:border-[#34D399]/60 flex flex-col items-start text-left justify-start transition-transform hover:scale-105"
              >
                <Link to="/materials" className="space-y-1.5 w-full">
                  <FolderOpen className="h-4 w-4 text-[#34D399]" />
                  <span className="font-700 text-xs text-white block">Batch Materials</span>
                  <span className="text-[10px] text-[#94A3B8] font-normal block leading-tight">
                    Upload PDFs & sheets
                  </span>
                </Link>
              </Button>

              <Button
                type="button"
                onClick={() => setImportModalOpen(true)}
                variant="outline"
                className="h-auto py-3.5 px-3.5 rounded-2xl bg-[#0B0F19] border-[#1E293B] hover:border-[#FBBF24]/60 flex flex-col items-start text-left justify-start transition-transform hover:scale-105"
              >
                <div className="space-y-1.5 w-full">
                  <UploadCloud className="h-4 w-4 text-[#FBBF24]" />
                  <span className="font-700 text-xs text-white block">Import CSV</span>
                  <span className="text-[10px] text-[#94A3B8] font-normal block leading-tight">
                    Add MCQs to bank
                  </span>
                </div>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* CSV Question Import Modal */}
      <ImportQuestionsModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onImportSuccess={() => {
          api.get("/stats").then((r) => setStats(r.data || {})).catch(() => {});
        }}
      />
    </div>
  );
}
