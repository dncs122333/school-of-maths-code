import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiErrorDetail } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import {
  Flame,
  Trophy,
  Target,
  TrendingUp,
  Clock,
  BookOpen,
  FileQuestion,
  Sparkles,
  Users,
  ArrowRight,
  Orbit,
  AlertCircle,
  Loader2,
  FileText,
  ChevronRight,
  ShieldCheck,
  Zap,
  FolderOpen,
  Award,
  CheckCircle2,
  Layers,
  Compass,
} from "lucide-react";
import { toast } from "sonner";
import MasteryMap from "../components/dashboard/MasteryMap";
import WeakTopicCard from "../components/dashboard/WeakTopicCard";
import ActivityTimeline from "../components/dashboard/ActivityTimeline";

export default function StudentDashboard() {
  const { user, refreshUser } = useAuth();
  const nav = useNavigate();

  // State
  const [stats, setStats] = useState({});
  const [masteryTopics, setMasteryTopics] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [activeTests, setActiveTests] = useState([]);
  const [notes, setNotes] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);

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
        const [statsRes, masteryRes, testsRes, notesRes, matRes] = await Promise.allSettled([
          api.get("/stats"),
          api.get("/mastery/me"),
          api.get("/tests"),
          api.get("/notes"),
          api.get("/resources"),
        ]);

        if (statsRes.status === "fulfilled") setStats(statsRes.value.data || {});
        if (masteryRes.status === "fulfilled") setMasteryTopics(masteryRes.value.data || []);
        if (testsRes.status === "fulfilled") {
          const list = testsRes.value.data || [];
          const live = list.filter((t) => t.is_active && !t.submitted && t.kind === "test");
          setActiveTests(live);
        }
        if (notesRes.status === "fulfilled") setNotes(notesRes.value.data || []);
        if (matRes.status === "fulfilled") setMaterials(matRes.value.data || []);

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
  }, []);

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

  // Streak days indicator
  const streakDays = ["M", "T", "W", "T", "F", "S", "S"];
  const activeDayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  return (
    <div className="space-y-8 pb-16">
      {/* 1. HERO GREETING CARD (Cinematic Cosmic Glassmorphism) */}
      <div className="relative rounded-3xl glass-panel p-6 sm:p-8 lg:p-10 border border-[#1E293B] overflow-hidden shadow-2xl">
        {/* Subtle Ambient Cosmic Glow */}
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#3B82F6]/20 blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-[#06B6D4]/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs uppercase tracking-widest text-[#06B6D4] font-700 font-mono">
                {formattedDate}
              </span>
              <span className="text-[#94A3B8]/60 text-xs">•</span>
              <Badge className="bg-[#3B82F6]/15 text-[#60A5FA] border-[#3B82F6]/30 font-700 text-xs px-3 py-0.5 rounded-full">
                CBSE Class 9 & 10 Explorer
              </Badge>
              <span className="text-[#94A3B8]/60 text-xs">•</span>
              <span className="text-xs text-[#34D399] font-mono font-600 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Board Prep Calibrated
              </span>
            </div>

            <h1 className="font-head text-3xl sm:text-4xl lg:text-5xl font-800 tracking-tight text-white flex items-center gap-3">
              {greeting}, <span className="text-gradient-cyan">{user?.name?.split(" ")[0]}</span>!{" "}
              <span className="animate-floaty inline-block">🚀</span>
            </h1>

            <p className="text-[#94A3B8] text-sm sm:text-base max-w-xl leading-relaxed">
              {weakTopics.length > 0
                ? `You have ${weakTopics.length} priority topics flagged for revision. Target them today to maximize your mock exam percentile.`
                : "Your syllabus retention is looking stellar. Keep up daily practice sprints to lock in full board marks!"}
            </p>
          </div>

          {/* Quick Streak & Metrics Capsule */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 bg-[#0B0F19]/90 border border-[#1E293B] p-4 rounded-3xl shrink-0 shadow-xl">
            {/* Streak Counter with weekly mini dots */}
            <div className="px-4 py-2.5 rounded-2xl bg-[#111827] border border-[#1E293B] flex flex-col justify-center text-center min-w-[120px]">
              <div className="flex items-center justify-center gap-1.5 text-base font-800 text-[#FBBF24]">
                <Flame className="h-5 w-5 text-[#FBBF24] animate-bounce" /> 7-Day Streak
              </div>
              {/* Day Dots */}
              <div className="flex items-center justify-center gap-1 mt-1.5">
                {streakDays.map((d, i) => (
                  <span
                    key={i}
                    title={d}
                    className={`h-2 w-2 rounded-full transition-all ${
                      i <= activeDayIndex
                        ? "bg-[#FBBF24] shadow-sm shadow-[#FBBF24]/50"
                        : "bg-[#1E293B]"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Total Tests Metric */}
            <div className="px-4 py-2.5 rounded-2xl bg-[#111827] border border-[#1E293B] text-center min-w-[95px]">
              <div className="font-head font-800 text-xl text-white">{stats.tests_taken ?? 0}</div>
              <div className="text-[10px] text-[#94A3B8] font-mono uppercase tracking-wider mt-0.5">Tests Taken</div>
            </div>

            {/* Accuracy Rate */}
            <div className="px-4 py-2.5 rounded-2xl bg-[#111827] border border-[#1E293B] text-center min-w-[95px]">
              <div className="font-head font-800 text-xl text-[#34D399]">{stats.avg_score ?? 0}%</div>
              <div className="text-[10px] text-[#94A3B8] font-mono uppercase tracking-wider mt-0.5">Accuracy</div>
            </div>

            {/* Recalibrate CTA Button */}
            <Button
              size="sm"
              onClick={handleStartDiagnostic}
              disabled={diagnosticBusy}
              className="rounded-2xl bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-700 text-xs px-4 h-12 glow-blue transition-all hover:scale-105 shrink-0"
            >
              {diagnosticBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <div className="flex flex-col items-center leading-tight">
                  <span className="flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" /> Diagnostic
                  </span>
                  <span className="text-[10px] font-normal opacity-80">Recalibrate</span>
                </div>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* 2. UPCOMING & LIVE TESTS BANNER (Conditional) */}
      {activeTests.length > 0 && (
        <div className="rounded-3xl bg-gradient-to-r from-[#0F172A] via-[#1E1B4B]/80 to-[#0F172A] border border-[#06B6D4]/50 p-5 sm:p-6 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-2xl bg-[#06B6D4]/20 border border-[#06B6D4]/50 flex items-center justify-center shrink-0">
                <span className="relative flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#06B6D4] opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#06B6D4]" />
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-[#06B6D4]/20 text-[#22D3EE] border-[#06B6D4]/40 text-[10px] uppercase font-mono tracking-wider font-700">
                    Live Assessment Active
                  </Badge>
                  <span className="text-xs text-[#94A3B8] font-mono">
                    Duration: {activeTests[0].duration_minutes} mins
                  </span>
                </div>
                <h3 className="font-head text-lg sm:text-xl font-800 text-white mt-1">
                  {activeTests[0].title}
                </h3>
              </div>
            </div>

            <Button
              asChild
              className="rounded-full bg-[#06B6D4] hover:bg-[#22D3EE] text-black font-800 px-6 h-11 glow-cyan shrink-0 transition-transform hover:scale-105"
            >
              <Link to={`/quiz/${activeTests[0].id}`} className="flex items-center gap-2">
                Start Test Now <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* 3. QUICK STUDY SPRINTS (Action Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Sprint 1: DPP */}
        <Link
          to="/dpp"
          className="group relative rounded-3xl glass-panel-interactive p-5 border border-[#1E293B] hover:border-[#FBBF24]/50 overflow-hidden"
        >
          <div className="h-10 w-10 rounded-2xl bg-[#FBBF24]/15 border border-[#FBBF24]/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Sparkles className="h-5 w-5 text-[#FBBF24]" />
          </div>
          <h4 className="font-head text-base font-700 text-white group-hover:text-[#FDE68A] transition-colors">
            Daily Practice (DPP)
          </h4>
          <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
            Untimed, repeatable question drills with step-by-step reasoning.
          </p>
        </Link>

        {/* Sprint 2: Timed Tests */}
        <Link
          to="/tests"
          className="group relative rounded-3xl glass-panel-interactive p-5 border border-[#1E293B] hover:border-[#06B6D4]/50 overflow-hidden"
        >
          <div className="h-10 w-10 rounded-2xl bg-[#06B6D4]/15 border border-[#06B6D4]/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <FileQuestion className="h-5 w-5 text-[#06B6D4]" />
          </div>
          <h4 className="font-head text-base font-700 text-white group-hover:text-[#67E8F9] transition-colors">
            Timed Board Mocks
          </h4>
          <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
            Real examination simulations with strict timers and leaderboards.
          </p>
        </Link>

        {/* Sprint 3: Notes */}
        <Link
          to="/notes"
          className="group relative rounded-3xl glass-panel-interactive p-5 border border-[#1E293B] hover:border-[#3B82F6]/50 overflow-hidden"
        >
          <div className="h-10 w-10 rounded-2xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <BookOpen className="h-5 w-5 text-[#3B82F6]" />
          </div>
          <h4 className="font-head text-base font-700 text-white group-hover:text-[#93C5FD] transition-colors">
            AI Study Notes
          </h4>
          <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
            Visual concept breakdowns, formula sheets & mnemonics.
          </p>
        </Link>

        {/* Sprint 4: Materials */}
        <Link
          to="/materials"
          className="group relative rounded-3xl glass-panel-interactive p-5 border border-[#1E293B] hover:border-[#34D399]/50 overflow-hidden"
        >
          <div className="h-10 w-10 rounded-2xl bg-[#34D399]/15 border border-[#34D399]/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <FolderOpen className="h-5 w-5 text-[#34D399]" />
          </div>
          <h4 className="font-head text-base font-700 text-white group-hover:text-[#86EFAC] transition-colors">
            Batch Resources
          </h4>
          <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
            Teacher-shared PDFs, assignment sheets & solved question papers.
          </p>
        </Link>
      </div>

      {/* 4. MAIN COGNITIVE GRID (7 Cols Left / 5 Cols Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Mastery Map & Weak Topics (7 Cols) */}
        <div className="lg:col-span-7 space-y-8">
          {/* Interactive Mastery Map */}
          <MasteryMap
            topics={masteryTopics}
            onStartDiagnostic={handleStartDiagnostic}
            onPracticeTopic={(topic) => nav(`/dpp`)}
          />

          {/* Weak Topics Panel */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-[#F87171]" />
                <h3 className="font-head text-xl font-800 text-white">Targeted Weak Topics</h3>
              </div>
              <Link
                to="/mastery"
                className="text-xs font-700 text-[#3B82F6] hover:text-[#60A5FA] flex items-center gap-1"
              >
                Full syllabus radar <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {weakTopics.length === 0 ? (
              <div className="rounded-3xl glass-panel p-8 text-center space-y-2 border border-[#1E293B]">
                <ShieldCheck className="h-9 w-9 text-[#34D399] mx-auto animate-twinkle" />
                <h4 className="font-head text-base font-700 text-white">No Critical Weaknesses!</h4>
                <p className="text-xs text-[#94A3B8] max-w-sm mx-auto leading-relaxed">
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

          {/* Learning Queue: AI Study Notes Carousel */}
          <div className="rounded-3xl glass-panel p-6 sm:p-7 space-y-4 border border-[#1E293B]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-[#3B82F6]" />
                </div>
                <h3 className="font-head text-lg font-700 text-white">Learning Queue</h3>
              </div>
              <Link to="/notes" className="text-xs font-700 text-[#3B82F6] hover:text-[#60A5FA]">
                All notes →
              </Link>
            </div>

            {notes.length === 0 ? (
              <div className="rounded-2xl bg-[#0B0F19] border border-[#1E293B] p-6 text-center text-xs text-[#94A3B8]">
                No study notes published yet. Notes created by your teacher appear here!
              </div>
            ) : (
              <div className="space-y-3">
                {notes.slice(0, 3).map((n) => (
                  <Link
                    key={n.id}
                    to={`/notes/${n.id}`}
                    className="group block p-3.5 sm:p-4 rounded-2xl bg-[#0B0F19]/90 border border-[#1E293B] hover:border-[#3B82F6]/50 hover:bg-[#172033]/80 transition-all hover:translate-x-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge className="bg-[#3B82F6]/15 text-[#60A5FA] border-[#3B82F6]/30 text-[10px] font-700">
                        {n.subject}
                      </Badge>
                      <span className="text-[11px] font-mono text-[#94A3B8]">Class {n.class_level}</span>
                    </div>
                    <h4 className="font-head text-sm font-700 text-white mt-1.5 truncate group-hover:text-[#60A5FA] transition-colors">
                      {n.title}
                    </h4>
                    <p className="text-xs text-[#94A3B8] truncate mt-0.5">{n.chapter}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Batch Enrolment / Join Card */}
          <div className="rounded-3xl glass-panel p-6 sm:p-7 space-y-4 border border-[#06B6D4]/30 relative overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[#06B6D4]/15 border border-[#06B6D4]/40 flex items-center justify-center shrink-0">
                <Orbit className="h-5 w-5 text-[#06B6D4]" />
              </div>
              <div>
                <h4 className="font-head text-base font-800 text-white">Join Coaching Batch</h4>
                <p className="text-xs text-[#94A3B8]">
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
                className="rounded-xl bg-[#0B0F19] border-[#1E293B] text-white font-mono text-sm uppercase tracking-widest focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]"
              />
              <Button
                type="submit"
                disabled={joining || !joinCode.trim()}
                className="rounded-xl bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-700 text-xs px-5 shrink-0 glow-blue transition-transform hover:scale-105"
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
