import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
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
  Award,
  ArrowRight,
  FolderOpen,
  CheckCircle2,
  Orbit,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import ClassHeatmap from "../components/dashboard/ClassHeatmap";
import StudentRosterRadar from "../components/dashboard/StudentRosterRadar";
import PendingReviewsQueue from "../components/dashboard/PendingReviewsQueue";
import ImportQuestionsModal from "../components/dashboard/ImportQuestionsModal";
import LiveTestsDrawer from "../components/dashboard/LiveTestsDrawer";

export default function TeacherDashboard() {
  const { user } = useAuth();

  // State
  const [stats, setStats] = useState({});
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [reportData, setReportData] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importInitialTab, setImportInitialTab] = useState("ai_vision");
  const [liveDrawerOpen, setLiveDrawerOpen] = useState(false);

  const openImportModal = (initialTab = "ai_vision") => {
    setImportInitialTab(initialTab);
    setImportModalOpen(true);
  };

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
      <div className="rounded-3xl bg-[#F5C842] border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8 lg:p-10 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-900 uppercase">
                👨‍🏫 EDUCATOR COCKPIT
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#5B9BD5] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold">
                {formattedDate}
              </span>
              <Badge className="bg-[#4CAF7D] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs px-3 py-0.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> CBSE Calibrated
              </Badge>
            </div>

            <h1 className="font-head text-3xl sm:text-4xl lg:text-5xl font-900 tracking-tight text-[#1E293B] uppercase">
              {greeting}, {user?.name?.split(" ")[0]} sir!{" "}
              <span className="inline-block animate-floaty">📚</span>
            </h1>

            <p className="text-[#1E293B] font-medium text-sm sm:text-base max-w-xl leading-relaxed">
              Live mastery telemetry across your coaching cohorts. Monitor weak concepts, share study materials, and launch timed tests from verified question banks.
            </p>
          </div>

          {/* Quick Action Creation Toolkit */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 bg-white p-3.5 rounded-3xl border-2 border-[#1E293B] shadow-[4px_4px_0_#1E293B]">
            <Button
              asChild
              className="rounded-full bg-[#5B9BD5] hover:bg-[#4D8BC4] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-10 px-4"
            >
              <Link to="/materials" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" /> Class Notes
              </Link>
            </Button>
            <Button
              asChild
              className="rounded-full bg-[#FF6B5E] hover:bg-[#EE594B] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-10 px-4"
            >
              <Link to="/tests/new" className="flex items-center gap-2">
                <FileQuestion className="h-4 w-4" /> + Class Test
              </Link>
            </Button>
            <Button
              asChild
              className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-10 px-4"
            >
              <Link to="/dpp/new" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> + Chapterwise Test
              </Link>
            </Button>
            <Button
              type="button"
              onClick={() => openImportModal("ai_vision")}
              className="rounded-full bg-[#8E44AD] hover:bg-[#7D3C98] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-10 px-4"
            >
              <Sparkles className="h-4 w-4 mr-1.5" /> Scan Paper (AI)
            </Button>
            <Button
              type="button"
              onClick={() => openImportModal("file")}
              className="rounded-full bg-[#4CAF7D] hover:bg-[#429E6F] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-10 px-4"
            >
              <UploadCloud className="h-4 w-4 mr-1.5" /> Import Questions
            </Button>
          </div>
        </div>

        {/* 3 Metric Cards with Key Telemetry */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t-2 border-[#1E293B]/20">
          {/* Metric 1: Total Students */}
          <Link
            to={selectedBatchId ? `/batches?batch_id=${selectedBatchId}` : "/batches"}
            className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] hover:-translate-y-1 transition-all block"
          >
            <div className="flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-head font-bold uppercase tracking-wider text-[10px]">
                Active Students
              </span>
              <Users className="h-4 w-4 text-[#5B9BD5]" />
            </div>
            <div className="font-head text-2xl sm:text-3xl font-900 text-[#1E293B] mt-1 flex items-center justify-between">
              <span>{stats.students ?? (reportData?.students?.length || 0)}</span>
              <ArrowRight className="h-4 w-4 text-[#1E293B]" />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#4CAF7D] font-mono font-bold mt-1">
              <TrendingUp className="h-3.5 w-3.5" /> Enrolled across {batches.length} cohorts
            </div>
          </Link>

          {/* Metric 2: Active Assessments */}
          <button
            type="button"
            onClick={() => setLiveDrawerOpen(true)}
            className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-[#FF6B5E] shadow-[3px_3px_0_#FF6B5E] text-left hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#FF6B5E] transition-all cursor-pointer w-full"
          >
            <div className="flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-head font-bold uppercase tracking-wider text-[10px]">Live Tests</span>
              <Radio className="h-4 w-4 text-[#FF6B5E] animate-pulse" />
            </div>
            <div className="font-head text-2xl sm:text-3xl font-900 text-[#1E293B] mt-1">
              {(stats.tests || 0) + (stats.dpps || 0)}
            </div>
            <div className="text-[11px] text-[#64748B] font-mono font-bold mt-1">
              <span>{stats.tests ?? 0} Tests • {stats.dpps ?? 0} DPPs</span>
            </div>
            <div className="text-[10px] text-[#FF6B5E] font-mono font-bold mt-1.5">
              Click to manage →
            </div>
          </button>

          {/* Metric 3: Avg Class Score */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B]">
            <div className="flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-head font-bold uppercase tracking-wider text-[10px]">Class Average</span>
              <Award className="h-4 w-4 text-[#4CAF7D]" />
            </div>
            <div className="font-head text-2xl sm:text-3xl font-900 text-[#4CAF7D] mt-1">
              {avgClassScore}%
            </div>
            <div className="text-[11px] text-[#4CAF7D] font-mono font-bold mt-1">
              <span>Cohort Retention Index</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. BATCH SWITCHER CAPSULE STRIP */}
      {batches.length > 0 && (
        <div className="rounded-3xl bg-white p-4 sm:p-5 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Orbit className="h-5 w-5 text-[#5B9BD5]" />
            <span className="font-head text-sm font-800 text-[#1E293B]">Active Cohort:</span>
            <span className="text-xs text-[#64748B] font-mono font-bold">
              {activeBatch?.name} (Class {activeBatch?.class_level}) • Code:{" "}
              <code className="text-[#1E293B] font-bold bg-[#FFF9E8] px-2 py-0.5 rounded-md border-2 border-[#1E293B]">
                {activeBatch?.code}
              </code>
            </span>
            <Link
              to={`/batches?batch_id=${selectedBatchId || ""}`}
              className="text-xs font-head font-bold text-[#5B9BD5] hover:underline flex items-center gap-1 ml-2"
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
                className={`px-4 py-1.5 rounded-full text-xs font-head font-bold transition-all whitespace-nowrap flex items-center gap-2 border-2 border-[#1E293B] ${
                  selectedBatchId === b.id
                    ? "bg-[#F5C842] text-[#1E293B] shadow-[2px_2px_0_#1E293B] -translate-y-0.5"
                    : "bg-[#FFF9E8] text-[#1E293B] hover:bg-white"
                }`}
              >
                <span>{b.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white border border-[#1E293B] font-mono font-bold">
                  Class {b.class_level}
                </span>
              </button>
            ))}
            <Button
              size="sm"
              variant="outline"
              asChild
              className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] text-xs h-8 px-3 shrink-0 font-head font-bold"
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
          <div className="rounded-3xl bg-white p-6 sm:p-8 space-y-5 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-[#FF6B5E] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-head text-xl font-900 text-[#1E293B]">
                    Class Weak Topics Leaderboard
                  </h3>
                  <span className="text-xs text-[#64748B] font-bold">Concepts with lowest cohort accuracy</span>
                </div>
              </div>
              <Badge className="bg-[#FF6B5E] text-white border-2 border-[#1E293B] font-mono text-[10px] px-2.5 py-0.5">
                Auto-Ranked
              </Badge>
            </div>

            {!reportData || (reportData.weak_topics || []).length === 0 ? (
              <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-8 text-center text-xs text-[#64748B] space-y-1">
                <CheckCircle2 className="h-8 w-8 text-[#4CAF7D] mx-auto opacity-70" />
                <p className="font-bold text-[#1E293B]">No Critical Weaknesses Identified</p>
                <p>All student submissions in this batch are currently above the 55% threshold.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reportData.weak_topics.slice(0, 5).map((w, idx) => {
                  const isSevere = w.class_avg < 55;
                  return (
                    <div
                      key={`${w.subject}|${w.chapter}|${w.topic}|${idx}`}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:-translate-y-0.5 transition-all"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-900 text-[#FF6B5E]">#{idx + 1}</span>
                          <Badge className="bg-[#5B9BD5] text-white border-2 border-[#1E293B] text-[10px] font-bold">
                            {w.subject}
                          </Badge>
                          <span className="text-xs text-[#64748B] font-mono font-bold">{w.chapter}</span>
                        </div>
                        <h4 className="font-head text-sm sm:text-base font-800 text-[#1E293B] truncate">
                          {w.topic}
                        </h4>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right font-mono">
                          <div
                            className={`font-head text-xl font-900 ${
                              isSevere ? "text-[#FF6B5E]" : "text-[#1E293B]"
                            }`}
                          >
                            {w.class_avg}%
                          </div>
                          <span className="text-[10px] text-[#64748B] uppercase font-bold">Class Avg</span>
                        </div>

                        <Button
                          size="sm"
                          asChild
                          className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs h-8 px-3.5 font-head font-bold"
                        >
                          <Link to="/dpp/new">
                            <Plus className="h-3.5 w-3.5 mr-1" /> + Chapterwise Test
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
          <div className="rounded-3xl bg-white p-6 sm:p-7 space-y-4 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#F5C842]" />
              <h3 className="font-head text-base font-900 text-[#1E293B]">Educator Studio Toolkit</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                asChild
                variant="outline"
                className="h-auto py-3.5 px-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:-translate-y-0.5 flex flex-col items-start text-left justify-start"
              >
                <Link to="/materials" className="space-y-1 w-full">
                  <FolderOpen className="h-4 w-4 text-[#5B9BD5]" />
                  <span className="font-head font-bold text-xs text-[#1E293B] block">Class Materials</span>
                  <span className="text-[10px] text-[#64748B] block leading-tight font-medium">
                    Upload PDFs & handouts
                  </span>
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                className="h-auto py-3.5 px-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:-translate-y-0.5 flex flex-col items-start text-left justify-start"
              >
                <Link to="/tests/new" className="space-y-1 w-full">
                  <FileQuestion className="h-4 w-4 text-[#FF6B5E]" />
                  <span className="font-head font-bold text-xs text-[#1E293B] block">Timed Exam</span>
                  <span className="text-[10px] text-[#64748B] block leading-tight font-medium">
                    Snapshot from bank
                  </span>
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                className="h-auto py-3.5 px-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:-translate-y-0.5 flex flex-col items-start text-left justify-start"
              >
                <Link to="/materials" className="space-y-1 w-full">
                  <FolderOpen className="h-4 w-4 text-[#4CAF7D]" />
                  <span className="font-head font-bold text-xs text-[#1E293B] block">Class Materials</span>
                  <span className="text-[10px] text-[#64748B] block leading-tight font-medium">
                    Upload PDFs & sheets
                  </span>
                </Link>
              </Button>

              <Button
                type="button"
                onClick={() => openImportModal("ai_vision")}
                variant="outline"
                className="h-auto py-3.5 px-3.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:-translate-y-0.5 flex flex-col items-start text-left justify-start"
              >
                <div className="space-y-1 w-full">
                  <Sparkles className="h-4 w-4 text-[#8E44AD]" />
                  <span className="font-head font-bold text-xs text-[#1E293B] block">AI Question Scanner</span>
                  <span className="text-[10px] text-[#64748B] block leading-tight font-medium">
                    Scan PDF/Image paper with Gemini
                  </span>
                </div>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Question Import / AI Scanner Modal */}
      <ImportQuestionsModal
        open={importModalOpen}
        initialTab={importInitialTab}
        onOpenChange={setImportModalOpen}
        onImportSuccess={() => {
          api.get("/stats").then((r) => setStats(r.data || {})).catch(() => {});
        }}
      />

      {/* Live Tests Drawer */}
      <LiveTestsDrawer
        open={liveDrawerOpen}
        onClose={() => setLiveDrawerOpen(false)}
      />
    </div>
  );
}
