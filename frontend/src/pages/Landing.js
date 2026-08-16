import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "../components/ui/button";
import { GraduationCap, BookOpen, Timer, Sparkles, Trophy, Upload, ArrowRight } from "lucide-react";

const HERO = "https://images.unsplash.com/photo-1516534775068-ba3e7458af70?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA4Mzl8MHwxfHNlYXJjaHwzfHx0ZWVuJTIwc3R1ZGVudCUyMHN0dWR5aW5nJTIwaGFwcHl8ZW58MHx8fHwxNzg2ODg0NzkwfDA&ixlib=rb-4.1.0&q=85";

const features = [
  { icon: Upload, title: "Upload → Beautiful Notes", desc: "Teachers upload rough notes. AI turns them into gorgeous, memorable study notes with concept illustrations — nothing left out.", color: "bg-brand-blue" },
  { icon: Timer, title: "Timed Competitive Tests", desc: "Upload a test sheet, pick class • subject • chapter • topic. It becomes a timed MCQ test, live only for the window you set.", color: "bg-brand-purple" },
  { icon: Sparkles, title: "Daily Practice Problems", desc: "Auto-generated DPPs per chapter with instant answers and explanations to build daily momentum.", color: "bg-brand-mint" },
  { icon: Trophy, title: "Batches & Leaderboards", desc: "Group students into batches, push tests to the right batch, and rank results competitively.", color: "bg-brand-yellow" },
];

export default function Landing() {
  const nav = useNavigate();
  return (
    <div className="grain-bg min-h-screen">
      <header className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-brand-blue flex items-center justify-center border-2 border-brand-ink">
            <GraduationCap className="h-6 w-6 text-brand-ink" />
          </div>
          <span className="font-head font-700 text-2xl tracking-tight">Vidya<span className="text-brand-purple">Lab</span></span>
        </div>
        <div className="flex items-center gap-3">
          <Button data-testid="landing-login-btn" variant="ghost" className="rounded-full font-600" onClick={() => nav("/auth")}>Log in</Button>
          <Button data-testid="landing-start-btn" className="rounded-full bg-brand-ink text-white hover:bg-brand-ink/90 font-600" onClick={() => nav("/auth?mode=register")}>Get started</Button>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 pt-10 pb-20 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <span className="inline-block text-xs font-700 uppercase tracking-widest text-brand-purple bg-brand-purple/10 px-3 py-1.5 rounded-full mb-6">For CBSE Class 9 & 10</span>
          <h1 className="font-head text-4xl sm:text-5xl lg:text-6xl font-700 tracking-tight leading-[1.05]">
            Turn rough notes into <span className="text-brand-blue">beautiful notes</span> your brain remembers.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-brand-ink/70 max-w-xl leading-relaxed">
            VidyaLab is the coaching super-app — AI-crafted notes with visuals, timed competitive MCQ tests, and daily practice, all organised by batch, subject and chapter.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button data-testid="hero-cta" size="lg" className="rounded-full bg-brand-blue text-brand-ink border-2 border-brand-ink font-700 hover:bg-brand-blue/80" onClick={() => nav("/auth?mode=register")}>
              Start learning free <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Button data-testid="hero-teacher" size="lg" variant="outline" className="rounded-full border-2 border-brand-ink/20 font-600" onClick={() => nav("/auth?mode=register&role=teacher")}>
              I'm a teacher
            </Button>
          </div>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative">
          <div className="absolute -top-6 -left-6 h-24 w-24 rounded-3xl bg-brand-yellow border-2 border-brand-ink animate-floaty" />
          <div className="absolute -bottom-6 -right-4 h-20 w-20 rounded-full bg-brand-mint border-2 border-brand-ink animate-floaty" style={{ animationDelay: "1.5s" }} />
          <img src={HERO} alt="Student studying" className="relative rounded-3xl border-4 border-brand-ink object-cover w-full h-[440px] shadow-xl" />
        </motion.div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-2 gap-5">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="rounded-3xl bg-white border-2 border-brand-ink p-8 hover:-translate-y-1 transition-transform">
              <div className={`h-12 w-12 rounded-2xl ${f.color} border-2 border-brand-ink flex items-center justify-center mb-4`}>
                <f.icon className="h-6 w-6 text-brand-ink" />
              </div>
              <h3 className="font-head text-xl font-600">{f.title}</h3>
              <p className="mt-2 text-brand-ink/70 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
