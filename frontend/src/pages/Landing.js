import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "../components/ui/button";
import { Orbit, BookOpen, Timer, Sparkles, Trophy, Upload, ArrowRight, Atom, Sigma } from "lucide-react";

const features = [
  { icon: Upload, title: "Beautiful Notes", desc: "Teachers upload rough notes. AI rebuilds them into gorgeous, accurate notes with concept illustrations — a multi-pass engine ensures nothing is missed.", color: "text-[#3B82F6]", ring: "border-[#3B82F6]/30" },
  { icon: Timer, title: "Timed Competitive Tests", desc: "Upload a test sheet, pick class • subject • chapter • topic. It becomes a timed MCQ test, live only for the window you set.", color: "text-[#06B6D4]", ring: "border-[#06B6D4]/30" },
  { icon: Sparkles, title: "Daily Practice Problems", desc: "Auto-generated DPPs per chapter with instant answers and step-by-step explanations to build daily momentum.", color: "text-[#FBBF24]", ring: "border-[#FBBF24]/30" },
  { icon: Trophy, title: "Batches & Leaderboards", desc: "Group students into batches, push tests to the right batch, and rank results competitively.", color: "text-[#34D399]", ring: "border-[#34D399]/30" },
];

export default function Landing() {
  const nav = useNavigate();
  return (
    <div className="cosmic-bg min-h-screen overflow-hidden">
      <header className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-[#3B82F6] flex items-center justify-center glow-blue">
            <Orbit className="h-6 w-6 text-white" />
          </div>
          <span className="font-head font-700 text-2xl tracking-tight"><span className="text-[#3B82F6]">School</span> <span className="text-[#F87171]">of</span> <span className="text-[#3B82F6]">Maths</span></span>
        </div>
        <div className="flex items-center gap-3">
          <Button data-testid="landing-login-btn" variant="ghost" className="rounded-full font-600 text-[#94A3B8] hover:text-white hover:bg-white/5" onClick={() => nav("/auth")}>Log in</Button>
          <Button data-testid="landing-start-btn" className="rounded-full bg-[#3B82F6] text-white hover:bg-[#60A5FA] font-600" onClick={() => nav("/auth?mode=register")}>Get started</Button>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 pt-12 pb-20 grid lg:grid-cols-2 gap-12 items-center relative">
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2 text-xs font-600 uppercase tracking-widest text-[#06B6D4] bg-[#06B6D4]/10 border border-[#06B6D4]/20 px-3 py-1.5 rounded-full mb-6">
            <Atom className="h-3.5 w-3.5" /> For CBSE Class 9 & 10
          </span>
          <h1 className="font-head text-4xl sm:text-5xl lg:text-6xl font-700 tracking-tight leading-[1.05] text-white">
            Where Concepts Become <span className="text-[#3B82F6]">Confidence</span>.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-[#94A3B8] max-w-xl leading-relaxed">
            School of Maths is the coaching super-app for science & maths — AI-crafted notes with visuals, timed competitive MCQ tests, and daily practice, all organised by batch, subject and chapter.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button data-testid="hero-cta" size="lg" className="rounded-full bg-[#3B82F6] text-white font-700 hover:bg-[#60A5FA] glow-blue" onClick={() => nav("/auth?mode=register")}>
              Start learning free <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Button data-testid="hero-teacher" size="lg" variant="outline" className="rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 font-600" onClick={() => nav("/auth?mode=register&role=teacher")}>
              I'm a teacher
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3 font-mono text-sm">
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#06B6D4]/10 border border-[#06B6D4]/30 text-[#06B6D4]"><Sigma className="h-4 w-4" /> E = mc²</span>
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[#FBBF24]"><Atom className="h-4 w-4" /> v = u + at</span>
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#3B82F6]/10 border border-[#3B82F6]/30 text-[#3B82F6]"><Sparkles className="h-4 w-4" /> (a+b)² = a² + 2ab + b²</span>
          </div>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative">
          <div className="absolute inset-0 -m-10 rounded-full border border-dashed border-white/10 animate-spin-slow" />
          <div className="absolute inset-0 -m-20 rounded-full border border-dashed border-white/5 animate-spin-slow" style={{ animationDirection: "reverse" }} />
          <div className="live-wall relative rounded-3xl border border-[#1E293B] w-full h-[440px] glow-blue overflow-hidden">
            {/* twinkling stars */}
            <div className="absolute top-8 left-10 h-1.5 w-1.5 rounded-full bg-white/70 animate-twinkle" />
            <div className="absolute top-24 right-16 h-1 w-1 rounded-full bg-white/60 animate-twinkle" style={{ animationDelay: "0.8s" }} />
            <div className="absolute bottom-16 left-24 h-1 w-1 rounded-full bg-white/50 animate-twinkle" style={{ animationDelay: "1.6s" }} />
            <div className="absolute bottom-28 right-10 h-1.5 w-1.5 rounded-full bg-white/60 animate-twinkle" style={{ animationDelay: "2.2s" }} />

            {/* central atom / orbit system */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative h-52 w-52">
                <div className="absolute inset-0 rounded-full border border-[#3B82F6]/40 animate-spin-slow" />
                <div className="absolute inset-6 rounded-full border border-[#06B6D4]/40 animate-spin-slow" style={{ animationDirection: "reverse", animationDuration: "26s" }} />
                <div className="absolute inset-12 rounded-full border border-[#FBBF24]/30 animate-spin-slow" style={{ animationDuration: "32s" }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-14 w-14 rounded-2xl bg-[#3B82F6] flex items-center justify-center glow-blue animate-floaty">
                    <Atom className="h-8 w-8 text-white" />
                  </div>
                </div>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[#06B6D4]" />
                <div className="absolute top-1/2 -right-1 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
              </div>
            </div>

            {/* floating formula tiles */}
            <div className="absolute top-6 left-6 px-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-[#06B6D4] font-mono text-sm animate-floaty">πr²</div>
            <div className="absolute top-16 right-8 px-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-[#FBBF24] font-mono text-sm animate-floaty" style={{ animationDelay: "1s" }}>H₂O</div>
            <div className="absolute bottom-10 left-8 px-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-[#34D399] font-mono text-sm animate-floaty" style={{ animationDelay: "1.8s" }}>F = ma</div>
            <div className="absolute bottom-20 right-10 px-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-[#3B82F6] font-mono text-sm animate-floaty" style={{ animationDelay: "2.4s" }}>∫ f(x)dx</div>
          </div>
          <div className="absolute -top-3 -right-3 h-3 w-3 rounded-full bg-[#06B6D4] animate-twinkle" />
          <div className="absolute bottom-10 -left-4 h-2 w-2 rounded-full bg-[#FBBF24] animate-twinkle" style={{ animationDelay: "1s" }} />
        </motion.div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24 relative z-10">
        <div className="grid md:grid-cols-2 gap-5">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="rounded-3xl bg-[#111827] border border-[#1E293B] p-8 hover:border-[#3B82F6]/40 transition-colors">
              <div className={`h-12 w-12 rounded-2xl bg-[#0B0F19] border ${f.ring} flex items-center justify-center mb-4`}>
                <f.icon className={`h-6 w-6 ${f.color}`} />
              </div>
              <h3 className="font-head text-xl font-600 text-white">{f.title}</h3>
              <p className="mt-2 text-[#94A3B8] leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
