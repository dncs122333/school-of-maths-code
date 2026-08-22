import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Orbit } from "lucide-react";
import { mountLetsScroll } from "../lib/scrub-engine";
import FloatingSymbols from "../components/FloatingSymbols";

export default function Landing() {
  const nav = useNavigate();
  const worldRef = useRef(null);

  useEffect(() => {
    if (!worldRef.current) return;
    
    // Clear out any previous instances if React strict mode double-invokes
    worldRef.current.innerHTML = "";
    
    mountLetsScroll(worldRef.current, {
      diveScroll: 1.3,
      connScroll: 0.9,
      hint: 'scroll to dive in',
      nav: false, // We use the custom header instead of the built-in topnav
      atmosphere: true,
      sections: [
        {
          id: 'notes', label: 'Topper Notes',
          still: '/assets/notes.webp',
          stillMobile: '/assets/notes_mobile.webp',
          clip: '/assets/vid/notes.mp4',
          clipMobile: '/assets/vid/notes_mobile.mp4',
          accent: '#3B82F6',
          scroll: 1.6, linger: 0.45,
          eyebrow: 'Concept Illustrations',
          title: 'Topper Notes',
          body: 'Study like a genius. Get instant access to meticulously structured, high-yield notes optimized for maximum retention and concept mastery. No fluff, just results.',
          tags: ['AI-crafted', 'Multi-pass Engine', 'Accurate']
        },
        {
          id: 'tests', label: 'Timed Tests',
          still: '/assets/tests.webp',
          stillMobile: '/assets/tests_mobile.webp',
          clip: '/assets/vid/tests.mp4',
          clipMobile: '/assets/vid/tests_mobile.mp4',
          accent: '#06B6D4',
          scroll: 1.6, linger: 0.45,
          eyebrow: 'Live Exam Window',
          title: 'Timed Competitive Tests',
          body: 'Upload a test sheet, pick class • subject • chapter • topic. It becomes a timed MCQ test, live only for the window you set.',
          tags: ['Timed MCQ', 'Topic-wise']
        },
        {
          id: 'dpp', label: 'Daily Practice',
          still: '/assets/dpp.webp',
          stillMobile: '/assets/dpp_mobile.webp',
          clip: '/assets/vid/dpp.mp4',
          clipMobile: '/assets/vid/dpp_mobile.mp4',
          accent: '#FBBF24',
          scroll: 1.6, linger: 0.45,
          eyebrow: 'Build Momentum',
          title: 'Daily Practice Problems',
          body: 'Auto-generated DPPs per chapter with instant answers and step-by-step explanations to build daily momentum.',
          tags: ['Auto-generated', 'Step-by-step']
        },
        {
          id: 'leaderboard', label: 'Leaderboards',
          still: '/assets/leaderboard.webp',
          stillMobile: '/assets/leaderboard_mobile.webp',
          clip: '/assets/vid/leaderboard.mp4',
          clipMobile: '/assets/vid/leaderboard_mobile.mp4',
          accent: '#34D399',
          scroll: 1.6, linger: 0.45,
          eyebrow: 'Group & Rank',
          title: 'Batches & Leaderboards',
          body: 'Group students into batches, push tests to the right batch, and rank results competitively.',
          tags: ['Competitive', 'Rankings'],
          cta: {
            primary: { label: 'Start learning free', href: '/auth?mode=register' },
            secondary: { label: 'I\'m a teacher', href: '/auth?mode=register&role=teacher' }
          }
        }
      ],
      connectors: [], // Architecture A (Continuous forward take) uses no connectors
      connectorsMobile: []
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#111827]">
      <header className="fixed top-0 left-0 right-0 max-w-7xl mx-auto px-6 h-20 flex items-center justify-between z-[200] pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto cursor-pointer" onClick={() => window.scrollTo(0, 0)}>
          <div className="h-10 w-10 rounded-xl bg-[#3B82F6] flex items-center justify-center glow-blue">
            <Orbit className="h-6 w-6 text-white" />
          </div>
          <span className="font-head font-700 text-2xl tracking-tight"><span className="text-[#3B82F6]">School</span> <span className="text-[#F87171]">of</span> <span className="text-[#3B82F6]">Maths</span></span>
        </div>
        <div className="flex items-center gap-3 pointer-events-auto">
          <Button data-testid="landing-login-btn" variant="ghost" className="rounded-full font-600 text-[#94A3B8] hover:text-white hover:bg-white/5 bg-[#111827]/80 backdrop-blur-md" onClick={() => nav("/auth")}>Log in</Button>
          <Button data-testid="landing-start-btn" className="rounded-full bg-[#3B82F6] text-white hover:bg-[#60A5FA] font-600 shadow-[0_0_15px_rgba(59,130,246,0.5)]" onClick={() => nav("/auth?mode=register")}>Get started</Button>
        </div>
      </header>
      
      {/* Live Particle Overlay */}
      <FloatingSymbols count={40} />
      
      {/* CSS Overrides for a larger world context */}
      <style>{`
        /* Make the titles massive and cinematic */
        #world .sw-title {
          font-family: 'Outfit', sans-serif !important;
          font-size: 5rem !important;
          line-height: 1.05 !important;
          font-weight: 800 !important;
          margin-bottom: 2rem !important;
        }
        @media (min-width: 768px) {
          #world .sw-title { font-size: 8rem !important; }
        }
        
        /* Make the body text larger and container wider */
        #world .sw-body {
          font-size: 1.75rem !important;
          max-width: 900px !important;
          line-height: 1.6 !important;
          color: #E2E8F0 !important;
        }
        
        #world .sw-eyebrow {
          font-size: 2.25rem !important;
          letter-spacing: 0.15em !important;
          margin-bottom: 1.5rem !important;
          color: #94A3B8 !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
        }
        
        #world .sw-tags {
          margin-top: 3.5rem !important;
          gap: 1.5rem !important;
        }
        
        #world .sw-tag {
          font-size: 1.25rem !important;
          padding: 0.75rem 1.75rem !important;
          border-radius: 99px !important;
          font-weight: 600 !important;
        }

        /* Fix CTA buttons visibility */
        #world .sw-cta {
          margin-top: 3.5rem !important;
          gap: 1.5rem !important;
        }
        #world .sw-cta a {
          font-size: 1.25rem !important;
          padding: 1rem 2rem !important;
          background: rgba(59, 130, 246, 0.9) !important; /* solid blue */
          color: white !important;
          border: none !important;
          border-radius: 99px !important;
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.5) !important;
          font-weight: 700 !important;
          transition: all 0.2s ease !important;
        }
        #world .sw-cta a:hover {
          background: rgba(59, 130, 246, 1) !important;
          transform: scale(1.05);
        }
        #world .sw-cta a:last-child {
          background: rgba(17, 24, 39, 0.8) !important; /* dark transparent */
          border: 1px solid rgba(255, 255, 255, 0.3) !important;
          box-shadow: none !important;
        }
        #world .sw-cta a:last-child:hover {
          background: rgba(255, 255, 255, 0.1) !important;
        }
      `}</style>

      <div id="world" ref={worldRef}></div>
    </div>
  );
}
