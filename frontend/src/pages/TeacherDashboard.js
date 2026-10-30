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
  TrendingUp,
  Award,
  ArrowRight,
  CheckCircle2,
  Orbit,
  Radio,
  Database,
  CreditCard,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import CohortLeaderboardTab from "../components/dashboard/CohortLeaderboardTab";
import ImportQuestionsModal from "../components/dashboard/ImportQuestionsModal";
import LiveTestsDrawer from "../components/dashboard/LiveTestsDrawer";
import BatchFeeStatusTab from "../components/dashboard/BatchFeeStatusTab";

export default function TeacherDashboard() {
  const { user } = useAuth();

  // State
  const [stats, setStats] = useState({});
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [cohortTab, setCohortTab] = useState("leaderboard"); // "leaderboard" | "fees"
  const [reportData, setReportData] = useState(null);
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
      if (list.length > 0) {
        setSelectedBatchId((curr) => curr || list[0].id);
      }
    }).catch(() => {});
  }, []);

  // Fetch report data when selectedBatchId changes
  useEffect(() => {
    if (!selectedBatchId) return;
    api.get("/mastery/teacher", { params: { batch_id: selectedBatchId } })
      .then((r) => setReportData(r.data))
      .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail)));
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

  const totalEnrollments = useMemo(() => {
    if (stats.enrollments !== undefined && stats.enrollments !== null) return stats.enrollments;
    return batches.reduce((sum, b) => sum + (b.student_count || 0), 0);
  }, [stats.enrollments, batches]);

  return (
    <div className="space-y-8 pb-16">
      {/* 1. TEACHER COMMAND HERO & STATS BANNER */}
      <div className="rounded-3xl bg-[#F5C842] border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8 lg:p-10 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-900 uppercase">
                👨‍🏫 CBSE EDUCATOR
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

            <p className="text-[#1E293B]/80 font-medium text-sm sm:text-base max-w-xl leading-relaxed italic">
              “Guiding students from confusion to clarity, curiosity to mastery.”
            </p>
          </div>

          {/* Quick Action Creation Toolkit - 3x2 Structured Alignment */}
          <div className="bg-white p-3.5 sm:p-4 rounded-3xl border-2 border-[#1E293B] shadow-[4px_4px_0_#1E293B] space-y-3 shrink-0 max-w-xl w-full lg:w-auto">
            {/* Row 1: Assessments & Notes */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 px-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B]">
                  Assessments & Study Notes
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  asChild
                  className="rounded-full bg-[#5B9BD5] hover:bg-[#4D8BC4] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-9 px-3 justify-center"
                >
                  <Link to="/materials" className="flex items-center justify-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" /> Class Notes
                  </Link>
                </Button>
                <Button
                  asChild
                  className="rounded-full bg-[#FF6B5E] hover:bg-[#EE594B] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-9 px-3 justify-center"
                >
                  <Link to="/tests/new" className="flex items-center justify-center gap-1.5">
                    <FileQuestion className="h-3.5 w-3.5" /> + Class Test
                  </Link>
                </Button>
                <Button
                  asChild
                  className="rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-9 px-3 justify-center"
                >
                  <Link to="/dpp/new" className="flex items-center justify-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> + Practice Test
                  </Link>
                </Button>
              </div>
            </div>

            <div className="h-[1px] bg-[#1E293B]/10" />

            {/* Row 2: Question Vault & Ingestion */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 px-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B]">
                  Question Vault & Ingestion
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  type="button"
                  onClick={() => openImportModal("ai_vision")}
                  className="rounded-full bg-[#8E44AD] hover:bg-[#7D3C98] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-9 px-3 justify-center"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Scan Paper (AI)
                </Button>
                <Button
                  type="button"
                  onClick={() => openImportModal("file")}
                  className="rounded-full bg-[#4CAF7D] hover:bg-[#429E6F] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-9 px-3 justify-center"
                >
                  <UploadCloud className="h-3.5 w-3.5 mr-1" /> Import Questions
                </Button>
                <Button
                  asChild
                  className="rounded-full bg-[#1E293B] hover:bg-[#334155] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs h-9 px-3 justify-center"
                >
                  <Link to="/question-bank" className="flex items-center justify-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-[#F5C842]" /> Question Bank
                  </Link>
                </Button>
              </div>
            </div>
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
              <span>{totalEnrollments} {totalEnrollments === 1 ? "Enrollment" : "Enrollments"}</span>
              <ArrowRight className="h-4 w-4 text-[#1E293B]" />
            </div>
            <div className="text-xs sm:text-sm font-head font-bold text-[#64748B] mt-0.5">
              {stats.students ?? (reportData?.students?.length || 0)} Students
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#4CAF7D] font-mono font-bold mt-1.5">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              <span>Across {batches.length} {batches.length === 1 ? "batch" : "batches"}</span>
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
              <span>Batch Retention Index</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. BATCH SWITCHER CAPSULE STRIP */}
      {batches.length > 0 && (
        <div className="rounded-3xl bg-white p-5 sm:p-6 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] space-y-4">
          {/* Top Row: Active Batch telemetry & quick link */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-[#1E293B]/10">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="h-8 w-8 rounded-xl bg-[#5B9BD5]/20 border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] flex items-center justify-center">
                <Orbit className="h-4 w-4 text-[#1E293B]" />
              </div>
              <span className="font-head text-sm font-900 text-[#1E293B] uppercase tracking-wide">
                Active Batch:
              </span>
              <span className="font-head text-base font-bold text-[#1E293B]">
                {activeBatch?.name}
              </span>
              <Badge className="bg-[#5B9BD5] text-white border-2 border-[#1E293B] shadow-[1px_1px_0_#1E293B] text-xs font-mono font-bold px-2.5 py-0.5">
                Class {activeBatch?.class_level}
              </Badge>
            </div>

            <Link
              to={`/batches?batch_id=${selectedBatchId || ""}`}
              className="text-xs font-head font-bold text-[#5B9BD5] hover:text-[#1E293B] hover:underline flex items-center gap-1 shrink-0"
            >
              Manage in Batch Studio →
            </Link>
          </div>

          {/* Cohort Switcher Buttons */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {batches.map((b) => {
              const isSelected = selectedBatchId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBatchId(b.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-head font-bold transition-all whitespace-nowrap flex items-center gap-2 border-2 border-[#1E293B] ${
                    isSelected
                      ? "bg-[#F5C842] text-[#1E293B] shadow-[2px_2px_0_#1E293B] -translate-y-0.5"
                      : "bg-[#FFF9E8] text-[#1E293B] hover:bg-white shadow-[1px_1px_0_#1E293B]"
                  }`}
                >
                  <span>{b.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white border border-[#1E293B] font-mono font-bold">
                    Class {b.class_level}
                  </span>
                  <span className="text-[10px] text-[#64748B] font-mono font-bold">
                    {b.student_count || 0}s
                  </span>
                </button>
              );
            })}

            <Button
              size="sm"
              variant="outline"
              asChild
              className="rounded-full border-2 border-[#1E293B] bg-white text-[#1E293B] hover:bg-[#FFF9E8] text-xs h-8 px-3 shrink-0 font-head font-bold ml-auto"
            >
              <Link to="/batches">
                <Plus className="h-3.5 w-3.5 mr-1" /> New Batch
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* 3. COHORT VIEW TABS (Leaderboard vs Fees Status) */}
      <div className="flex items-center justify-between gap-3 border-b-2 border-[#1E293B]/20 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setCohortTab("leaderboard")}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-head font-bold transition-all border-2 border-[#1E293B] ${
              cohortTab === "leaderboard"
                ? "bg-[#F5C842] text-[#1E293B] shadow-[3px_3px_0_#1E293B] -translate-y-0.5"
                : "bg-white text-[#1E293B]/70 hover:text-[#1E293B] hover:bg-[#FFF9E8]"
            }`}
          >
            <Trophy className="h-4 w-4 text-[#1E293B]" />
            <span>🏆 Leaderboard</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-black ${
                cohortTab === "leaderboard"
                  ? "bg-white text-[#1E293B] border border-[#1E293B]"
                  : "bg-[#FFF9E8] text-[#1E293B]"
              }`}
            >
              {activeBatch?.name || "Active Batch"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCohortTab("fees")}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-head font-bold transition-all border-2 border-[#1E293B] ${
              cohortTab === "fees"
                ? "bg-[#F5C842] text-[#1E293B] shadow-[3px_3px_0_#1E293B] -translate-y-0.5"
                : "bg-white text-[#1E293B]/70 hover:text-[#1E293B] hover:bg-[#FFF9E8]"
            }`}
          >
            <CreditCard className="h-4 w-4 text-[#2F8A5F]" />
            <span>Fees Status</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-black ${
                cohortTab === "fees"
                  ? "bg-white text-[#1E293B] border border-[#1E293B]"
                  : "bg-[#FFF9E8] text-[#1E293B]"
              }`}
            >
              {activeBatch?.name || "Active Batch"}
            </span>
          </button>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-[#64748B] font-mono font-bold">
          <span className="h-2 w-2 rounded-full bg-[#4CAF7D] animate-pulse" />
          <span>Active Batch Telemetry</span>
        </div>
      </div>

      {/* 4. CONDITIONAL TAB VIEW */}
      {cohortTab === "fees" ? (
        <BatchFeeStatusTab batchId={selectedBatchId} activeBatch={activeBatch} />
      ) : (
        <CohortLeaderboardTab
          batchId={selectedBatchId}
          activeBatch={activeBatch}
          reportData={reportData}
          onRefreshStats={() => {
            api.get("/stats").then((r) => setStats(r.data || {})).catch(() => {});
          }}
        />
      )}

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
