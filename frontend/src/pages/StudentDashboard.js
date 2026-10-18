import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Flame,
  Target,
  FileQuestion,
  Sparkles,
  ArrowRight,
  Orbit,
  AlertCircle,
  Loader2,
  ChevronRight,
  ShieldCheck,
  FolderOpen,
  Calendar,
  Clock,
  Pin,
} from "lucide-react";
import { toast } from "sonner";
import MasteryMap from "../components/dashboard/MasteryMap";
import WeakTopicCard from "../components/dashboard/WeakTopicCard";
import ActivityTimeline from "../components/dashboard/ActivityTimeline";
import SpotlightCard from "../components/SpotlightCard";
import WeeklyTimetable from "../components/WeeklyTimetable";

export default function StudentDashboard() {
  const { user, refreshUser } = useAuth();
  const nav = useNavigate();

  // State
  const [stats, setStats] = useState({});
  const [masteryTopics, setMasteryTopics] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [activeTests, setActiveTests] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [topper, setTopper] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [reminderDismissed, setReminderDismissed] = useState(() => {
    try {
      return localStorage.getItem("vidya_weekly_reminder_dismissed") === "true";
    } catch {
      return false;
    }
  });

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

  // Fetch all student data concurrently
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsRes, masteryRes, testsRes, matRes] = await Promise.allSettled([
          api.get("/stats"),
          api.get("/mastery/me"),
          api.get("/tests"),
          api.get("/resources"),
        ]);

        if (statsRes.status === "fulfilled") setStats(statsRes.value.data || {});
        if (masteryRes.status === "fulfilled") setMasteryTopics(masteryRes.value.data || []);
        if (testsRes.status === "fulfilled") {
          const list = testsRes.value.data || [];
          const live = list.filter((t) => t.is_active && !t.submitted && t.kind === "test");
          setActiveTests(live);
        }
        if (matRes.status === "fulfilled") setMaterials(matRes.value.data || []);

        // Fetch batch topper if student has a batch enrolled
        const studentBatchId = user?.batch_id || (user?.batch_ids && user.batch_ids[0]);
        if (studentBatchId) {
          try {
            const topperRes = await api.get(`/batches/${studentBatchId}/topper`);
            if (topperRes.data && topperRes.data.topper) {
              setTopper(topperRes.data.topper);
            } else {
              setTopper(null);
            }
          } catch {
            setTopper(null);
          }
        } else {
          setTopper(null);
        }

        // Fetch recent test submissions for activity timeline
        try {
          const testList = testsRes.status === "fulfilled" ? (testsRes.value.data || []) : [];
          const testIds = testList.slice(0, 6).map((t) => t.id);
          const subs = [];
          for (const tid of testIds) {
            try {
              const sRes = await api.get(`/tests/${tid}/submissions`);
              if (sRes.data) subs.push(...sRes.data);
            } catch {}
          }
          subs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          setSubmissions(subs);
        } catch {}
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  // Top 3 Weak Topics
  const weakTopics = useMemo(() => {
    return masteryTopics
      .filter((t) => t.band === "weak" || (t.score !== undefined && t.score < 55))
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .slice(0, 3);
  }, [masteryTopics]);

  // Handle batch join
  const handleJoinBatch = async (e) => {
    e?.preventDefault();
    if (!joinCode.trim()) {
      toast.error("Please enter a 6-character batch code.");
      return;
    }
    setJoining(true);
    try {
      const res = await api.post("/batches/join", { code: joinCode.trim() });
      await refreshUser();
      toast.success(`Successfully joined ${res.data.name}!`);
      setJoinCode("");
      const statsRes = await api.get("/stats");
      setStats(statsRes.data || {});
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setJoining(false);
    }
  };

  // Launch Diagnostic
  const handleStartDiagnostic = async () => {
    setDiagnosticBusy(true);
    try {
      const res = await api.post("/tests/diagnostic", {});
      toast.success("10-question syllabus diagnostic generated!");
      nav(`/quiz/${res.data.id}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setDiagnosticBusy(false);
    }
  };

  const handleDismissReminder = () => {
    try {
      localStorage.setItem("vidya_weekly_reminder_dismissed", "true");
    } catch {}
    setReminderDismissed(true);
    toast.success("Weekly reminder marked done!");
  };

  // Streak days indicator
  const streakDays = ["M", "T", "W", "T", "F", "S", "S"];
  const streakCount = stats.streak_days || 0;
  const activeWeekDays = stats.active_week_days || [];

  return (
    <div className="space-y-10 pb-16">
      {/* ======================================================== */}
      {/* 1. GREETING HEADER (YELLOW BANNER - CLASSROOM HUB STYLE) */}
      {/* ======================================================== */}
      <div className="rounded-3xl bg-[#F5C842] border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8 lg:p-10 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-black tracking-wider uppercase">
                🏫 CLASSROOM HUB
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#3E7CB1] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold">
                {formattedDate}
              </span>
              <Badge className="bg-[#2F8A5F] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs px-3 py-0.5 rounded-full">
                CBSE Class 9 & 10
              </Badge>
            </div>

            <h1 className="font-head text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#1E293B] uppercase">
              {greeting}, {user?.name?.split(" ")[0]}!{" "}
              <span className="inline-block animate-floaty">🎒</span>
            </h1>

            <p className="text-[#1E293B] font-medium text-sm sm:text-base max-w-xl leading-relaxed">
              {weakTopics.length > 0
                ? `You have ${weakTopics.length} priority topics flagged for revision today. Solve chapter DPPs to solidify your board exam score!`
                : "Your syllabus retention is looking fantastic! Keep up the daily practice sprint to secure full CBSE board marks."}
            </p>
          </div>

          {/* Quick Streak & Metrics Capsule */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 bg-white border-[2.5px] border-[#1E293B] p-4 rounded-3xl shrink-0 shadow-[4px_4px_0_#1E293B]">
            {/* Streak Counter with weekly mini dots */}
            <div className="px-4 py-2.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] flex flex-col justify-center text-center min-w-[130px]">
              <div className="flex items-center justify-center gap-1.5 text-sm font-head font-black text-[#1E293B]">
                <Flame className="h-5 w-5 text-[#E04A3C] fill-[#E04A3C]" />
                {streakCount > 0 ? `${streakCount}-Day Streak` : "0"}
              </div>
              <div className="text-[10px] text-[#64748B] font-head font-bold uppercase tracking-wider mt-0.5">
                {streakCount > 0 ? "Daily Practice" : "Start a practice streak today"}
              </div>
              {/* Day Dots - only marked for days with actual activity */}
              <div className="flex items-center justify-center gap-1 mt-1.5">
                {streakDays.map((d, i) => (
                  <span
                    key={i}
                    title={d}
                    className={`h-2.5 w-2.5 rounded-full border border-[#1E293B] transition-all ${
                      activeWeekDays[i]
                        ? "bg-[#F5C842]"
                        : "bg-white"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Total Tests Metric */}
            <div className="px-4 py-2.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] text-center min-w-[95px]">
              <div className="font-head font-black text-xl text-[#1E293B]">{stats.tests_taken ?? 0}</div>
              <div className="text-[10px] text-[#64748B] font-head font-bold uppercase tracking-wider mt-0.5">Tests Taken</div>
            </div>

            {/* Accuracy Rate */}
            <div className="px-4 py-2.5 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] text-center min-w-[95px]">
              <div className="font-head font-black text-xl text-[#2F8A5F]">{stats.avg_score ?? 0}%</div>
              <div className="text-[10px] text-[#64748B] font-head font-bold uppercase tracking-wider mt-0.5">Accuracy</div>
            </div>

            {/* Recalibrate CTA Button */}
            <Button
              size="sm"
              onClick={handleStartDiagnostic}
              disabled={diagnosticBusy}
              className="rounded-2xl bg-[#2F8A5F] hover:bg-[#256e4c] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs px-4 h-12 transition-transform active:translate-x-[2px] active:translate-y-[2px] shrink-0"
            >
              {diagnosticBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <div className="flex flex-col items-center leading-tight">
                  <span className="flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" /> Diagnostic
                  </span>
                  <span className="text-[10px] font-normal opacity-90">Recalibrate</span>
                </div>
              )}
            </Button>
          </div>
        </div>

        {/* Live Test Alert Banner if any */}
        {activeTests.length > 0 && (
          <div className="mt-6 rounded-2xl bg-[#E04A3C] border-2 border-[#1E293B] shadow-[3px_3px_0_#1E293B] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-white">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-white animate-ping" />
              <div>
                <span className="text-xs font-head font-black uppercase tracking-wider bg-white text-[#E04A3C] px-2 py-0.5 rounded-full border border-[#1E293B]">
                  LIVE TEST ACTIVE
                </span>
                <h4 className="font-head text-base sm:text-lg font-black mt-1">{activeTests[0].title}</h4>
              </div>
            </div>
            <Button
              asChild
              className="rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:bg-[#FFF9E8] font-head font-bold text-xs px-5 h-9 shrink-0"
            >
              <Link to={`/quiz/${activeTests[0].id}`}>
                Start Now <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 2. TODAY'S AGENDA SECTION (Yellow Pill Items + Bulletin) */}
      {/* ======================================================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-[#F5C842] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
              <Calendar className="h-4 w-4 text-[#1E293B]" />
            </div>
            <h2 className="font-head text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#1E293B]">
              Today's Agenda
            </h2>
          </div>
          <span className="text-xs font-mono font-bold text-[#64748B]">
            {formattedDate}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Agenda Items */}
          <div className={`${reminderDismissed ? "lg:col-span-12" : "lg:col-span-8"} grid grid-cols-1 sm:grid-cols-3 gap-4`}>
            {/* Agenda Item 1: DPP */}
            <Link
              to="/dpp"
              className="group p-5 rounded-3xl bg-[#F5C842] border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] hover:-translate-y-1 transition-[transform,box-shadow] duration-150 ease-out flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="h-10 w-10 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-[#1E293B]" />
                  </div>
                  <span className="text-[10px] font-head font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-white border border-[#1E293B] text-[#1E293B]">
                    Sprint #1
                  </span>
                </div>
                <h3 className="font-head text-lg font-black text-[#1E293B] uppercase">
                  Daily Chapter Practice (DPP)
                </h3>
                <p className="text-xs text-[#1E293B]/80 font-medium mt-1 leading-relaxed">
                  Topic-level board practice problems with instant step-by-step reasoning.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t-2 border-[#1E293B]/20 flex items-center justify-between text-xs font-head font-bold text-[#1E293B]">
                <span>Start Today's Problems</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Agenda Item 2: Class Tests */}
            <Link
              to="/tests"
              className="group p-5 rounded-3xl bg-[#F5C842] border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] hover:-translate-y-1 transition-[transform,box-shadow] duration-150 ease-out flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="h-10 w-10 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
                    <FileQuestion className="h-5 w-5 text-[#1E293B]" />
                  </div>
                  <span className="text-[10px] font-head font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-white border border-[#1E293B] text-[#1E293B]">
                    Sprint #2
                  </span>
                </div>
                <h3 className="font-head text-lg font-black text-[#1E293B] uppercase">
                  Timed Class Tests
                </h3>
                <p className="text-xs text-[#1E293B]/80 font-medium mt-1 leading-relaxed">
                  Real board simulation exams with strict timers and accuracy benchmarking.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t-2 border-[#1E293B]/20 flex items-center justify-between text-xs font-head font-bold text-[#1E293B]">
                <span>Take Examination</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Agenda Item 3: Materials */}
            <Link
              to="/materials"
              className="group p-5 rounded-3xl bg-[#F5C842] border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] hover:-translate-y-1 transition-[transform,box-shadow] duration-150 ease-out flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="h-10 w-10 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
                    <FolderOpen className="h-5 w-5 text-[#1E293B]" />
                  </div>
                  <span className="text-[10px] font-head font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-white border border-[#1E293B] text-[#1E293B]">
                    Sprint #3
                  </span>
                </div>
                <h3 className="font-head text-lg font-black text-[#1E293B] uppercase">
                  Teacher Class Notes
                </h3>
                <p className="text-xs text-[#1E293B]/80 font-medium mt-1 leading-relaxed">
                  Teacher-shared PDFs, solved chalkboard questions & batch assignments.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t-2 border-[#1E293B]/20 flex items-center justify-between text-xs font-head font-bold text-[#1E293B]">
                <span>Open Repository</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          </div>

          {/* Bulletin Reminder Card (Dismissible) */}
          {!reminderDismissed && (
            <div className="lg:col-span-4 rounded-3xl bg-[#7A5CC0] border-[3px] border-[#1E293B] shadow-[5px_5px_0_#1E293B] p-6 text-white flex flex-col justify-between relative overflow-hidden">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-black uppercase">
                    <Pin className="h-3.5 w-3.5 text-[#E04A3C]" /> BULLETIN NOTE
                  </div>
                  <span className="text-xs font-head font-bold uppercase tracking-wider text-white bg-black/20 px-2 py-0.5 rounded-full">
                    IMPORTANT
                  </span>
                </div>

                <div className="rounded-2xl border-2 border-dashed border-[#1E293B] bg-white/10 p-4 space-y-2.5">
                  <h4 className="font-head text-lg font-black uppercase text-white">
                    Weekly Practice Reminder
                  </h4>
                  <p className="text-xs sm:text-sm font-medium leading-relaxed text-white/90">
                    Complete at least 5 chapter practice DPP questions before this week's mock exam. Revision logs sync automatically with your syllabus mastery radar.
                  </p>
                </div>

                <div className="space-y-2 text-xs font-head font-bold text-white">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-white" />
                    <span>Board Formula Sheet review</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-white" />
                    <span>Complete active test modules</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-3 border-t-2 border-white/20 flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-white/80">VidyaLab Desk</span>
                <Button
                  size="sm"
                  onClick={handleDismissReminder}
                  className="rounded-full bg-white hover:bg-[#FFF9E8] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold h-8 px-3"
                >
                  Mark Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ======================================================== */}
      {/* 3. CLASS NEWS / RESOURCES (REAL CONTENT) */}
      {/* ======================================================== */}
      {(activeTests.length > 0 || materials.length > 0) && (
        <section className="rounded-3xl bg-[#2F8A5F] border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8 lg:p-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-black tracking-wider uppercase mb-2">
                📢 NOTICE BOARD
              </div>
              <h2 className="font-head text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
                Class News & Updates
              </h2>
            </div>
            <p className="text-white/90 text-xs sm:text-sm max-w-sm font-medium">
              Real-time curriculum materials and active tests published for your batch.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Card 2: Real Active Test or Tests Portal */}
            <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-[transform,box-shadow] duration-150 ease-out">
              <div>
                <div className="bg-[#3E7CB1] border-b-2 border-[#1E293B] p-5 text-center relative">
                  <span className="text-4xl block">⚡</span>
                  <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-white border-2 border-[#1E293B] text-[10px] font-head font-black uppercase text-[#1E293B]">
                    {activeTests.length > 0 ? "Active Test" : "Class Tests"}
                  </span>
                </div>
                <div className="p-5 space-y-2">
                  <span className="text-[11px] font-mono font-bold text-[#64748B]">
                    {activeTests[0]?.duration_minutes ? `${activeTests[0].duration_minutes} Minutes` : "Examination Portal"}
                  </span>
                  <h3 className="font-head text-lg font-black text-[#1E293B] leading-snug">
                    {activeTests[0]?.title || "CBSE Timed Examination Mocks"}
                  </h3>
                  <p className="text-xs text-[#64748B] font-medium leading-relaxed">
                    {activeTests.length > 0
                      ? "Live examination is ready for your submission. Timer begins on quiz launch."
                      : "Timed tests covering CBSE syllabus chapters with automatic score benchmarking."}
                  </p>
                </div>
              </div>
              <div className="p-5 pt-0">
                <Button
                  asChild
                  className="w-full rounded-full bg-[#3E7CB1] hover:bg-[#316491] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold h-9"
                >
                  <Link to={activeTests[0]?.id ? `/quiz/${activeTests[0].id}` : "/tests"}>
                    {activeTests.length > 0 ? "Take Test Now" : "View Tests"} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Card 3: Real Material */}
            <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-[transform,box-shadow] duration-150 ease-out">
              <div>
                <div className="bg-[#E04A3C] border-b-2 border-[#1E293B] p-5 text-center relative">
                  <span className="text-4xl block">📚</span>
                  <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-white border-2 border-[#1E293B] text-[10px] font-head font-black uppercase text-[#1E293B]">
                    Resource Center
                  </span>
                </div>
                <div className="p-5 space-y-2">
                  <span className="text-[11px] font-mono font-bold text-[#64748B]">
                    {materials[0]?.file_type ? materials[0].file_type.toUpperCase() : "Course Materials"}
                  </span>
                  <h3 className="font-head text-lg font-black text-[#1E293B] leading-snug">
                    {materials[0]?.title || "Classroom Handouts & PDFs"}
                  </h3>
                  <p className="text-xs text-[#64748B] font-medium leading-relaxed">
                    {materials[0]?.subject
                      ? `Subject: ${materials[0].subject}. Teacher-shared chalkboard notes and assignments.`
                      : "Teacher-shared chalkboard solutions, solved questions and batch assignments."}
                  </p>
                </div>
              </div>
              <div className="p-5 pt-0">
                <Button
                  asChild
                  className="w-full rounded-full bg-[#E04A3C] hover:bg-[#c93f33] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold h-9"
                >
                  <Link to="/materials">
                    Browse Materials <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================== */}
      {/* 4. STUDENT OF THE WEEK SECTION (REAL TOPPER ONLY) */}
      {/* ======================================================== */}
      {topper && (
        <section className="rounded-3xl bg-[#3E7CB1] border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8 lg:p-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-black tracking-wider uppercase mb-2">
                ⭐ HALL OF FAME
              </div>
              <h2 className="font-head text-3xl sm:text-4xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                Student of the Week <span>✨</span>
              </h2>
            </div>
            <span className="text-white font-head font-bold text-xs bg-white/25 px-3 py-1.5 rounded-full border border-white/40">
              Batch Top Performer
            </span>
          </div>

          <SpotlightCard
            studentName={topper.name}
            batchName={`Batch: ${topper.batch_name || "Active Batch"}`}
            badgeText="Batch Top Scorer"
            quote={topper.quote}
            streakDays={topper.streak_days}
            accuracy={topper.accuracy}
            testsCompleted={topper.tests_taken}
          />
        </section>
      )}

      {/* ======================================================== */}
      {/* 5. CLASS SCHEDULE SECTION (SHARED COMPONENT) */}
      {/* ======================================================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-[#7A5CC0] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
              <Clock className="h-4 w-4 text-white" />
            </div>
            <h2 className="font-head text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#1E293B]">
              Class Schedule
            </h2>
          </div>
          <span className="text-xs font-mono font-bold text-[#64748B]">
            CBSE Weekly Timetable
          </span>
        </div>

        <WeeklyTimetable />
      </section>

      {/* ======================================================== */}
      {/* 6. CLASS RESOURCES SECTION (CENTERED COLORED PILL BUTTONS) */}
      {/* ======================================================== */}
      <section className="rounded-3xl bg-white border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-8 text-center space-y-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#FFF9E8] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-black tracking-wider uppercase mb-2">
            🔗 QUICK NAVIGATION
          </div>
          <h2 className="font-head text-3xl sm:text-4xl font-black uppercase tracking-tight text-[#1E293B]">
            Class Resources
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] font-medium max-w-md mx-auto mt-1">
            Instant 1-click access to all CBSE syllabus study materials, tests, and radars.
          </p>
        </div>

        {/* Centered Colored Pill Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3.5 max-w-4xl mx-auto">
          <Link
            to="/materials"
            className="hub-btn hub-btn-green px-5 py-3 text-xs sm:text-sm uppercase tracking-wider"
          >
            📁 Teacher Handouts & PDFs
          </Link>

          <Link
            to="/dpp"
            className="hub-btn hub-btn-blue px-5 py-3 text-xs sm:text-sm uppercase tracking-wider"
          >
            ⚡ Chapterwise DPP Practice
          </Link>

          <Link
            to="/tests"
            className="hub-btn hub-btn-purple px-5 py-3 text-xs sm:text-sm uppercase tracking-wider"
          >
            ⏱️ Timed Examination Mocks
          </Link>

          <Link
            to="/mastery"
            className="hub-btn hub-btn-red px-5 py-3 text-xs sm:text-sm uppercase tracking-wider"
          >
            🎯 Syllabus Mastery Radar
          </Link>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 7. MAIN MASTERY & ACTIVITY GRID */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Mastery Map & Weak Topics (7 Cols) */}
        <div className="lg:col-span-7 space-y-8">
          {/* Interactive Mastery Map */}
          <MasteryMap
            topics={masteryTopics}
            onStartDiagnostic={handleStartDiagnostic}
            onPracticeTopic={() => nav(`/dpp`)}
          />

          {/* Weak Topics Panel */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-[#E04A3C]" />
                <h3 className="font-head text-xl font-black text-[#1E293B]">Targeted Weak Topics</h3>
              </div>
              <Link
                to="/mastery"
                className="text-xs font-head font-bold text-[#3E7CB1] hover:underline flex items-center gap-1"
              >
                Full syllabus radar <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {weakTopics.length === 0 ? (
              <div className="rounded-3xl bg-white p-8 text-center space-y-2 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B]">
                <ShieldCheck className="h-9 w-9 text-[#2F8A5F] mx-auto" />
                <h4 className="font-head text-base font-extrabold text-[#1E293B]">No Critical Weaknesses!</h4>
                <p className="text-xs text-[#64748B] max-w-sm mx-auto leading-relaxed">
                  All attempted concepts are currently above 55% accuracy. Challenge yourself with fresh board mocks!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                {weakTopics.map((top) => (
                  <WeakTopicCard
                    key={`${top.subject}|${top.chapter}|${top.topic}`}
                    topic={top}
                    onPractice={() => nav("/dpp")}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Recent Activity, Learning Queue & Batches (5 Cols) */}
        <div className="lg:col-span-5 space-y-8">
          {/* Recent Activity Timeline */}
          <ActivityTimeline submissions={submissions} />

          {/* Learning Queue: Class Materials */}
          <div className="rounded-3xl bg-white p-6 sm:p-7 space-y-4 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-[#F5C842] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center">
                  <FolderOpen className="h-4 w-4 text-[#1E293B]" />
                </div>
                <h3 className="font-head text-lg font-black text-[#1E293B]">Class Materials</h3>
              </div>
              <Link to="/materials" className="text-xs font-head font-bold text-[#3E7CB1] hover:underline">
                All materials →
              </Link>
            </div>

            {materials.length === 0 ? (
              <div className="rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] p-6 text-center text-xs text-[#64748B]">
                No class materials published yet. Handouts and PDFs shared by your teacher will appear here!
              </div>
            ) : (
              <div className="space-y-3">
                {materials.slice(0, 3).map((m) => (
                  <Link
                    key={m.id}
                    to="/materials"
                    className="group block p-3.5 sm:p-4 rounded-2xl bg-[#FFF9E8] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] hover:-translate-y-0.5 transition-[transform,box-shadow] duration-150 ease-out"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge className="bg-[#F5C842] text-[#1E293B] border-2 border-[#1E293B] text-[10px] font-bold">
                        {m.subject || "Resource"}
                      </Badge>
                      <span className="text-[11px] font-mono font-bold text-[#64748B] uppercase">{m.file_type || "PDF"}</span>
                    </div>
                    <h4 className="font-head text-sm font-extrabold text-[#1E293B] mt-1.5 truncate">
                      {m.title}
                    </h4>
                    <p className="text-xs text-[#64748B] truncate mt-0.5">{m.chapter || m.filename}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Batch Enrolment / Join Card */}
          <div className="rounded-3xl bg-[#FFF9E8] p-6 sm:p-7 space-y-4 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] relative overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[#2F8A5F] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center shrink-0">
                <Orbit className="h-5 w-5 text-white" />
              </div>
              <div>
                <h4 className="font-head text-base font-black text-[#1E293B]">Join Coaching Batch</h4>
                <p className="text-xs text-[#64748B] font-medium">
                  Enter the 6-character code provided by your teacher.
                </p>
              </div>
            </div>

            <form onSubmit={handleJoinBatch} className="flex gap-2.5">
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. 7F29B1"
                maxLength={8}
                className="rounded-xl bg-white border-2 border-[#1E293B] text-[#1E293B] font-mono font-bold text-sm uppercase tracking-widest"
              />
              <Button
                type="submit"
                disabled={joining || !joinCode.trim()}
                className="rounded-xl bg-[#3E7CB1] hover:bg-[#316491] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] font-head font-bold text-xs px-5 shrink-0"
              >
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
