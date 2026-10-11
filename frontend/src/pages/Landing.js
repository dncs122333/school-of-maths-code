import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  Sparkles,
  BookOpen,
  FileQuestion,
  Target,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  Users,
  Compass,
  Zap,
  FolderOpen,
} from "lucide-react";
import FloatingSymbols from "../components/FloatingSymbols";

export default function Landing() {
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-[#FFF9E8] text-[#1E293B] relative overflow-x-hidden">
      {/* Live Particle Overlay */}
      <FloatingSymbols count={30} />

      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-[#F5C842] border-b-[3px] border-[#1E293B] shadow-[0_4px_0_#1E293B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
          {/* Logo */}
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center group-hover:rotate-6 transition-transform">
              <span className="text-xl sm:text-2xl">📐</span>
            </div>
            <div className="flex flex-col">
              <span className="font-head font-900 text-xl sm:text-2xl tracking-tight text-[#1E293B] uppercase leading-none">
                School of <span className="text-[#FF6B5E]">Maths</span>
              </span>
              <span className="text-[10px] sm:text-xs font-head font-bold uppercase tracking-wider text-[#1E293B]/80 mt-0.5">
                Classroom Hub • CBSE 9–10
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              data-testid="landing-login-btn"
              variant="outline"
              className="rounded-full bg-white hover:bg-[#FFF9E8] text-[#1E293B] font-head font-bold text-xs sm:text-sm h-10 px-4 sm:px-5 border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              onClick={() => nav("/auth")}
            >
              Log in
            </Button>
            <Button
              data-testid="landing-start-btn"
              variant="dark"
              className="rounded-full !text-white font-head font-bold text-xs sm:text-sm h-10 px-4 sm:px-6 shadow-[2px_2px_0_#1E293B]"
              onClick={() => nav("/auth?mode=register")}
            >
              Get started <ArrowRight className="h-4 w-4 ml-1 inline" />
            </Button>
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 1. HERO SECTION (MUSTARD YELLOW #F5C842 BANNER) */}
      {/* ======================================================== */}
      <section className="bg-[#F5C842] border-b-[3px] border-[#1E293B] py-16 sm:py-24 px-4 sm:px-6 relative overflow-hidden">
        <div className="max-w-6xl mx-auto text-center space-y-6 sm:space-y-8 relative z-10">
          {/* Top Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border-[2.5px] border-[#1E293B] shadow-[3px_3px_0_#1E293B]">
            <span className="text-base select-none">📌</span>
            <span className="text-xs sm:text-sm font-head font-900 uppercase tracking-widest text-[#1E293B]">
              CBSE Classes 9–10 Academic Platform
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-head text-4xl sm:text-6xl md:text-7xl font-900 tracking-tight text-[#1E293B] uppercase leading-[1.05] max-w-5xl mx-auto">
            Smart Board Notes, Timed Tests &amp; Instant Mastery!
          </h1>

          {/* Subtext */}
          <p className="text-base sm:text-xl font-medium text-[#1E293B]/85 max-w-3xl mx-auto leading-relaxed">
            No confusion, just crystal-clear clarity. Prepare for CBSE board exams with
            structured topper notes, timed batch examinations, daily chapterwise practice, and
            real-time weak-topic detection.
          </p>

          {/* CTA Button Group */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Button
              size="lg"
              onClick={() => nav("/auth?mode=register")}
              className="rounded-full bg-white hover:bg-[#FFF9E8] text-[#1E293B] font-head font-900 text-sm sm:text-base px-8 h-14 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Start Learning Free <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => nav("/auth?mode=register&role=teacher")}
              className="rounded-full bg-[#4CAF7D] hover:bg-[#429E6F] text-white font-head font-900 text-sm sm:text-base px-7 h-14 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <Users className="h-5 w-5 mr-2" /> I'm a Teacher
            </Button>
          </div>

          {/* Retro Math Badges / Stickers floating across the hero */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm font-mono font-bold text-[#1E293B]">
            <span className="px-3.5 py-1.5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] rotate-[-2deg]">
              π ≈ 3.14159
            </span>
            <span className="px-3.5 py-1.5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] rotate-[2deg]">
              (a+b)² = a² + 2ab + b²
            </span>
            <span className="px-3.5 py-1.5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] rotate-[-1deg]">
              Pythagoras: a² + b² = c²
            </span>
            <span className="px-3.5 py-1.5 rounded-2xl bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] rotate-[3deg]">
              Discriminant: D = b² - 4ac
            </span>
          </div>

          {/* Quick Pillars Strip */}
          <div className="pt-6 border-t-2 border-[#1E293B]/20 grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
            <div className="p-3.5 rounded-2xl bg-white/70 border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
              <div className="flex items-center gap-2 font-head font-900 text-xs sm:text-sm text-[#1E293B]">
                <CheckCircle2 className="h-4 w-4 text-[#4CAF7D]" /> 100% CBSE Aligned
              </div>
              <div className="text-[11px] text-[#1E293B]/70 mt-1">Class 9 &amp; 10 NCERT Syllabus</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/70 border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
              <div className="flex items-center gap-2 font-head font-900 text-xs sm:text-sm text-[#1E293B]">
                <Sparkles className="h-4 w-4 text-[#FF6B5E]" /> Chapterwise DPPs
              </div>
              <div className="text-[11px] text-[#1E293B]/70 mt-1">Bite-sized daily practice sets</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/70 border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
              <div className="flex items-center gap-2 font-head font-900 text-xs sm:text-sm text-[#1E293B]">
                <FileQuestion className="h-4 w-4 text-[#5B9BD5]" /> Timed Class Exams
              </div>
              <div className="text-[11px] text-[#1E293B]/70 mt-1">Real exam countdown pressure</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/70 border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B]">
              <div className="flex items-center gap-2 font-head font-900 text-xs sm:text-sm text-[#1E293B]">
                <Target className="h-4 w-4 text-[#9B7EDE]" /> Concept Radar
              </div>
              <div className="text-[11px] text-[#1E293B]/70 mt-1">Instant weak-topic detection</div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 2. BULLETIN FEATURES SECTION (CREAM BACKGROUND) */}
      {/* ======================================================== */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 max-w-7xl mx-auto space-y-12">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F5C842] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-900 uppercase">
            ⚡ EVERYTHING YOU NEED TO SCORE 95%+
          </div>
          <h2 className="font-head text-3xl sm:text-5xl font-900 uppercase tracking-tight text-[#1E293B]">
            What's on the Bulletin Board?
          </h2>
          <p className="text-sm sm:text-base text-[#1E293B]/75 max-w-2xl mx-auto font-medium">
            Designed specifically around how CBSE students study: clear notes first, followed
            by timed test runs and targeted gap remediation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Topper Notes */}
          <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 sm:p-7 shadow-[4px_4px_0_#1E293B] flex flex-col justify-between hover:-translate-y-1 transition-all">
            <div>
              <div className="h-12 w-12 rounded-2xl bg-[#F5C842] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center mb-5">
                <BookOpen className="h-6 w-6 text-[#1E293B]" />
              </div>
              <span className="text-[10px] font-head font-900 uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FFF9E8] border border-[#1E293B] text-[#1E293B]">
                Exam Secrets
              </span>
              <h3 className="font-head text-xl font-900 text-[#1E293B] uppercase mt-2">
                Topper Notes
              </h3>
              <p className="text-xs sm:text-sm text-[#1E293B]/75 font-medium mt-2 leading-relaxed">
                Step-by-step NCERT explanations, formula flashcards, and mnemonic tricks for
                instant memory recall before tests.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t-2 border-dashed border-[#1E293B]/30">
              <span className="text-xs font-head font-bold text-[#1E293B] flex items-center gap-1">
                Real Numbers, Polynomials &amp; more <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>

          {/* Card 2: Timed Tests */}
          <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 sm:p-7 shadow-[4px_4px_0_#1E293B] flex flex-col justify-between hover:-translate-y-1 transition-all">
            <div>
              <div className="h-12 w-12 rounded-2xl bg-[#FF6B5E] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center mb-5">
                <FileQuestion className="h-6 w-6 text-white" />
              </div>
              <span className="text-[10px] font-head font-900 uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FFF9E8] border border-[#1E293B] text-[#1E293B]">
                Live Window
              </span>
              <h3 className="font-head text-xl font-900 text-[#1E293B] uppercase mt-2">
                Timed Tests
              </h3>
              <p className="text-xs sm:text-sm text-[#1E293B]/75 font-medium mt-2 leading-relaxed">
                Experience real board exam countdown pressure. Strict duration, instantaneous
                grading, and batch percentile benchmarking.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t-2 border-dashed border-[#1E293B]/30">
              <span className="text-xs font-head font-bold text-[#1E293B] flex items-center gap-1">
                Instant Leaderboard Rankings <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>

          {/* Card 3: Daily Practice Problems */}
          <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 sm:p-7 shadow-[4px_4px_0_#1E293B] flex flex-col justify-between hover:-translate-y-1 transition-all">
            <div>
              <div className="h-12 w-12 rounded-2xl bg-[#4CAF7D] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center mb-5">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <span className="text-[10px] font-head font-900 uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FFF9E8] border border-[#1E293B] text-[#1E293B]">
                Daily Habit
              </span>
              <h3 className="font-head text-xl font-900 text-[#1E293B] uppercase mt-2">
                Daily Practice (DPP)
              </h3>
              <p className="text-xs sm:text-sm text-[#1E293B]/75 font-medium mt-2 leading-relaxed">
                Untimed, repeatable question sets with instant step-by-step answers. Small daily
                efforts produce massive exam results.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t-2 border-dashed border-[#1E293B]/30">
              <span className="text-xs font-head font-bold text-[#1E293B] flex items-center gap-1">
                Zero Stress Practice <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>

          {/* Card 4: Concept Analytics */}
          <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] p-6 sm:p-7 shadow-[4px_4px_0_#1E293B] flex flex-col justify-between hover:-translate-y-1 transition-all">
            <div>
              <div className="h-12 w-12 rounded-2xl bg-[#5B9BD5] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center mb-5">
                <Target className="h-6 w-6 text-white" />
              </div>
              <span className="text-[10px] font-head font-900 uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FFF9E8] border border-[#1E293B] text-[#1E293B]">
                Concept Radar
              </span>
              <h3 className="font-head text-xl font-900 text-[#1E293B] uppercase mt-2">
                Smart Analytics
              </h3>
              <p className="text-xs sm:text-sm text-[#1E293B]/75 font-medium mt-2 leading-relaxed">
                No more guessing where you stand. Pinpoint weak theorems and fix them fast with
                topic-level radar telemetry.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t-2 border-dashed border-[#1E293B]/30">
              <span className="text-xs font-head font-bold text-[#1E293B] flex items-center gap-1">
                Visual Weak-Spot Detection <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 3. CLASS NEWS SECTION (SOLID TEAL GREEN #4CAF7D BLOCK) */}
      {/* ======================================================== */}
      <section className="bg-[#4CAF7D] border-y-[3px] border-[#1E293B] py-16 sm:py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-900 tracking-wider uppercase mb-2">
                📢 NOTICE BOARD
              </div>
              <h2 className="font-head text-3xl sm:text-5xl font-900 uppercase tracking-tight text-white">
                Classroom Hub in Action
              </h2>
            </div>
            <p className="text-white/90 text-sm max-w-md font-medium">
              Every coaching batch receives structured syllabus announcements, curated teacher notes,
              and live examination windows.
            </p>
          </div>

          {/* 3 White Cards Side by Side */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-all">
              <div>
                <div className="bg-[#F5C842] border-b-2 border-[#1E293B] p-6 text-center">
                  <span className="text-5xl block select-none">📐</span>
                  <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-white border-2 border-[#1E293B] text-xs font-head font-900 uppercase text-[#1E293B]">
                    Mathematics Core
                  </span>
                </div>
                <div className="p-6 space-y-2">
                  <span className="text-xs font-mono font-bold text-[#64748B]">Class 10 CBSE</span>
                  <h3 className="font-head text-xl font-900 text-[#1E293B] leading-snug">
                    Real Numbers &amp; Triangles Proofs
                  </h3>
                  <p className="text-xs sm:text-sm text-[#1E293B]/70 font-medium leading-relaxed">
                    Detailed step-by-step proofs of irrationality, Basic Proportionality Theorem
                    (BPT), and common exam traps.
                  </p>
                </div>
              </div>
              <div className="p-6 pt-0">
                <Button
                  onClick={() => nav("/auth?mode=register")}
                  className="w-full rounded-full bg-[#F5C842] hover:bg-[#E6B935] text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold h-10"
                >
                  Explore Study Notes <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-all">
              <div>
                <div className="bg-[#5B9BD5] border-b-2 border-[#1E293B] p-6 text-center">
                  <span className="text-5xl block select-none">⚡</span>
                  <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-white border-2 border-[#1E293B] text-xs font-head font-900 uppercase text-[#1E293B]">
                    Batch Examination
                  </span>
                </div>
                <div className="p-6 space-y-2">
                  <span className="text-xs font-mono font-bold text-[#64748B]">Weekly Timed Test</span>
                  <h3 className="font-head text-xl font-900 text-[#1E293B] leading-snug">
                    Linear Equations &amp; Polynomials
                  </h3>
                  <p className="text-xs sm:text-sm text-[#1E293B]/70 font-medium leading-relaxed">
                    Test your speed and precision under strict examination timers. Get instant
                    batch rankings and detailed answer keys.
                  </p>
                </div>
              </div>
              <div className="p-6 pt-0">
                <Button
                  onClick={() => nav("/auth?mode=register")}
                  className="w-full rounded-full bg-[#5B9BD5] hover:bg-[#4D8BC4] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold h-10"
                >
                  Take a Timed Test <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            <div className="rounded-3xl bg-white border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] overflow-hidden flex flex-col justify-between hover:-translate-y-1 transition-all">
              <div>
                <div className="bg-[#FF6B5E] border-b-2 border-[#1E293B] p-6 text-center">
                  <span className="text-5xl block select-none">📚</span>
                  <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-white border-2 border-[#1E293B] text-xs font-head font-900 uppercase text-[#1E293B]">
                    Resource Repository
                  </span>
                </div>
                <div className="p-6 space-y-2">
                  <span className="text-xs font-mono font-bold text-[#64748B]">Class Handouts</span>
                  <h3 className="font-head text-xl font-900 text-[#1E293B] leading-snug">
                    Teacher Chalkboard Notes &amp; PDFs
                  </h3>
                  <p className="text-xs sm:text-sm text-[#1E293B]/70 font-medium leading-relaxed">
                    Teachers can share PDF documents, handwritten board solution sheets, and
                    assignments with their batches seamlessly.
                  </p>
                </div>
              </div>
              <div className="p-6 pt-0">
                <Button
                  onClick={() => nav("/auth?mode=register")}
                  className="w-full rounded-full bg-[#FF6B5E] hover:bg-[#EE594B] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-bold h-10"
                >
                  Access Class Notes <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 4. STUDENT SUCCESS SECTION (SKY BLUE #5B9BD5 BLOCK) */}
      {/* ======================================================== */}
      <section className="bg-[#5B9BD5] border-b-[3px] border-[#1E293B] py-16 sm:py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white text-[#1E293B] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-900 uppercase">
              ⭐ HALL OF FAME
            </div>
            <h2 className="font-head text-3xl sm:text-5xl font-900 uppercase tracking-tight text-white flex items-center justify-center gap-2">
              Student of the Week <span>✨</span>
            </h2>
          </div>

          {/* Spotlight Card */}
          <div className="rounded-3xl bg-white border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-10 flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
            {/* Avatar with Sparkles */}
            <div className="relative shrink-0">
              <span className="absolute -top-3 -right-2 text-2xl select-none animate-bounce">✨</span>
              <span className="absolute -bottom-2 -left-2 text-xl select-none">🌟</span>
              <div className="h-32 w-32 sm:h-40 sm:w-40 rounded-full border-[3px] border-[#1E293B] bg-[#F5C842] shadow-[4px_4px_0_#1E293B] flex items-center justify-center text-6xl sm:text-7xl">
                🎓
              </div>
            </div>

            <div className="space-y-3 text-center sm:text-left flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-[#FF6B5E] text-white border-2 border-[#1E293B] text-xs font-head font-bold shadow-[2px_2px_0_#1E293B]">
                  <Award className="h-3.5 w-3.5" /> CBSE Class 10 Topper
                </span>
                <span className="text-xs font-mono font-bold text-[#64748B]">Batch: Alpha Scholars</span>
              </div>

              <h3 className="font-head text-2xl sm:text-3xl font-900 text-[#1E293B]">
                Aarav Sharma — 98% Accuracy
              </h3>

              <p className="text-xs sm:text-sm text-[#1E293B]/80 font-medium leading-relaxed">
                "Solving daily chapterwise questions with instant reasoning helped me turn Quadratic
                Equations and Triangles from my weakest topics into my highest-scoring board exam areas!"
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                <span className="px-3 py-1 rounded-full bg-[#FFF9E8] border-2 border-[#1E293B] text-xs font-head font-bold text-[#1E293B] shadow-[2px_2px_0_#1E293B]">
                  🔥 7-Day Active Streak
                </span>
                <span className="px-3 py-1 rounded-full bg-[#4CAF7D] text-white border-2 border-[#1E293B] text-xs font-head font-bold shadow-[2px_2px_0_#1E293B]">
                  🎯 96% Mock Test Score
                </span>
                <span className="px-3 py-1 rounded-full bg-[#9B7EDE] text-white border-2 border-[#1E293B] text-xs font-head font-bold shadow-[2px_2px_0_#1E293B]">
                  ⭐ 14 DPPs Completed
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 5. CLASS SCHEDULE PREVIEW SECTION */}
      {/* ======================================================== */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#9B7EDE] text-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-900 uppercase">
            📅 WEEKLY CURRICULUM
          </div>
          <h2 className="font-head text-3xl sm:text-4xl font-900 uppercase tracking-tight text-[#1E293B]">
            Structured CBSE Weekly Timetable
          </h2>
          <p className="text-xs sm:text-sm text-[#1E293B]/70 font-medium max-w-xl mx-auto">
            Stay aligned with your coaching cohorts through an organized, colorful weekly schedule.
          </p>
        </div>

        {/* Timetable Table */}
        <div className="overflow-x-auto rounded-3xl border-[3px] border-[#1E293B] shadow-[5px_5px_0_#1E293B] bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-[3px] border-[#1E293B]">
                <th className="p-4 bg-[#FFF9E8] text-[#1E293B] font-head font-900 text-xs uppercase tracking-wider border-r-2 border-[#1E293B] min-w-[120px]">
                  Time Slot
                </th>
                <th className="p-4 bg-[#FF6B5E] text-white font-head font-900 text-xs uppercase tracking-wider border-r-2 border-[#1E293B] min-w-[160px]">
                  Monday (Coral)
                </th>
                <th className="p-4 bg-[#F5C842] text-[#1E293B] font-head font-900 text-xs uppercase tracking-wider border-r-2 border-[#1E293B] min-w-[160px]">
                  Tuesday (Yellow)
                </th>
                <th className="p-4 bg-[#4CAF7D] text-white font-head font-900 text-xs uppercase tracking-wider border-r-2 border-[#1E293B] min-w-[160px]">
                  Wednesday (Green)
                </th>
                <th className="p-4 bg-[#5B9BD5] text-white font-head font-900 text-xs uppercase tracking-wider border-r-2 border-[#1E293B] min-w-[160px]">
                  Thursday (Blue)
                </th>
                <th className="p-4 bg-[#9B7EDE] text-white font-head font-900 text-xs uppercase tracking-wider min-w-[160px]">
                  Friday (Purple)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-[#1E293B]">
              <tr>
                <td className="p-4 bg-[#FFF9E8] font-head font-bold text-xs text-[#1E293B] border-r-2 border-[#1E293B] align-top">
                  4:00 PM – 5:00 PM
                  <div className="text-[10px] font-mono text-[#64748B] mt-0.5">Core Lecture</div>
                </td>
                <td className="p-4 bg-white border-r-2 border-[#1E293B] align-top">
                  <span className="font-head font-bold text-sm text-[#1E293B] block">Real Numbers &amp; Euclid</span>
                  <span className="text-xs text-[#64748B] block mt-0.5">Irrationality drills</span>
                </td>
                <td className="p-4 bg-white border-r-2 border-[#1E293B] align-top">
                  <span className="font-head font-bold text-sm text-[#1E293B] block">Polynomials &amp; Zeroes</span>
                  <span className="text-xs text-[#64748B] block mt-0.5">Factorization theorems</span>
                </td>
                <td className="p-4 bg-white border-r-2 border-[#1E293B] align-top">
                  <span className="font-head font-bold text-sm text-[#1E293B] block">Quadratic Equations</span>
                  <span className="text-xs text-[#64748B] block mt-0.5">Discriminant analysis</span>
                </td>
                <td className="p-4 bg-white border-r-2 border-[#1E293B] align-top">
                  <span className="font-head font-bold text-sm text-[#1E293B] block">Arithmetic Progressions</span>
                  <span className="text-xs text-[#64748B] block mt-0.5">Sum of n terms</span>
                </td>
                <td className="p-4 bg-white align-top">
                  <span className="font-head font-bold text-sm text-[#1E293B] block">Triangles &amp; BPT</span>
                  <span className="text-xs text-[#64748B] block mt-0.5">Similarity proofs</span>
                </td>
              </tr>
              <tr>
                <td className="p-4 bg-[#FFF9E8] font-head font-bold text-xs text-[#1E293B] border-r-2 border-[#1E293B] align-top">
                  5:15 PM – 6:00 PM
                  <div className="text-[10px] font-mono text-[#64748B] mt-0.5">Practice Sprint</div>
                </td>
                <td className="p-4 bg-[#FFF9E8]/60 border-r-2 border-[#1E293B] align-top">
                  <span className="font-head font-bold text-xs text-[#1E293B] block">DPP Sprint #1</span>
                  <span className="text-[11px] text-[#64748B]">10 Questions</span>
                </td>
                <td className="p-4 bg-[#FFF9E8]/60 border-r-2 border-[#1E293B] align-top">
                  <span className="font-head font-bold text-xs text-[#1E293B] block">DPP Sprint #2</span>
                  <span className="text-[11px] text-[#64748B]">10 Questions</span>
                </td>
                <td className="p-4 bg-[#FFF9E8]/60 border-r-2 border-[#1E293B] align-top">
                  <span className="font-head font-bold text-xs text-[#1E293B] block">DPP Sprint #3</span>
                  <span className="text-[11px] text-[#64748B]">10 Questions</span>
                </td>
                <td className="p-4 bg-[#FFF9E8]/60 border-r-2 border-[#1E293B] align-top">
                  <span className="font-head font-bold text-xs text-[#1E293B] block">DPP Sprint #4</span>
                  <span className="text-[11px] text-[#64748B]">10 Questions</span>
                </td>
                <td className="p-4 bg-[#F5C842]/30 align-top">
                  <span className="font-head font-bold text-xs text-[#1E293B] block">Weekly Timed Mock Exam</span>
                  <span className="text-[11px] text-[#FF6B5E] font-bold">Live Ranked Window</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 6. BOTTOM CALL-TO-ACTION (MUSTARD YELLOW #F5C842 BLOCK) */}
      {/* ======================================================== */}
      <section className="bg-[#F5C842] border-t-[3px] border-[#1E293B] py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] text-xs font-head font-900 uppercase">
            🚀 READY TO CRUSH YOUR BOARD EXAMS?
          </div>
          <h2 className="font-head text-3xl sm:text-5xl md:text-6xl font-900 uppercase tracking-tight text-[#1E293B] leading-[1.08]">
            Join Your Coaching Batch in Under 30 Seconds
          </h2>
          <p className="text-sm sm:text-lg text-[#1E293B]/85 font-medium max-w-2xl mx-auto leading-relaxed">
            Create a free student or teacher account, explore our interactive question bank,
            and start mastering CBSE Class 9 &amp; 10 Mathematics today.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              onClick={() => nav("/auth?mode=register")}
              className="rounded-full bg-white hover:bg-[#FFF9E8] text-[#1E293B] font-head font-900 text-sm sm:text-base px-8 h-14 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Sign Up as Student <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="dark"
              onClick={() => nav("/auth?mode=register&role=teacher")}
              className="rounded-full !text-white font-head font-900 text-sm sm:text-base px-7 h-14 border-[2.5px] border-[#1E293B] shadow-[4px_4px_0_#1E293B] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Teacher Sign Up
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t-[3px] border-[#1E293B] py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-head font-bold text-[#1E293B]">
          <div className="flex items-center gap-2">
            <span className="text-lg">📐</span>
            <span>VidyaLab • School of Maths Classroom Hub</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-[#1E293B]/70">
            <Link to="/auth" className="hover:underline">Student Login</Link>
            <span>•</span>
            <Link to="/auth?role=teacher" className="hover:underline">Teacher Portal</Link>
            <span>•</span>
            <span>CBSE Classes 9–10 Coaching</span>
          </div>
          <div className="text-[11px] font-mono text-[#1E293B]/60">
            © {new Date().getFullYear()} VidyaLab
          </div>
        </div>
      </footer>
    </div>
  );
}
