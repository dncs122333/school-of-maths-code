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
      nav: false,
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
          eyebrow: 'EXAM SECRETS',
          title: 'Topper Notes',
          body: 'No Confusion, Just Clarity!\nSmart Notes for Easy Understanding.',
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
          body: 'Practise under real exam pressure\nChallenge yourself against the clock.',
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
          body: 'Small daily steps, massive exams result..\nMaster Tough Concepts with Daily Practice',
        },
        {
          id: 'leaderboard', label: 'Smart Analytics',
          still: '/assets/leaderboard.webp',
          stillMobile: '/assets/leaderboard_mobile.webp',
          clip: '/assets/vid/leaderboard.mp4',
          clipMobile: '/assets/vid/leaderboard_mobile.mp4',
          accent: '#34D399',
          scroll: 1.6, linger: 0.45,
          eyebrow: 'Personalized AI Power-up',
          title: 'Smart Analytics',
          body: 'No more Guessing!\nUncover your Weak Concepts, Fix them fast and Level Up.',
        },
        {
          id: 'smart-practice', label: 'Smart Practice',
          still: '/assets/smart_practice.webp',
          stillMobile: '/assets/smart_practice_mobile.webp',
          clip: '/assets/vid/smart_practice.mp4',
          clipMobile: '/assets/vid/smart_practice_mobile.mp4',
          accent: '#A78BFA',
          scroll: 1.6, linger: 0.45,
          eyebrow: 'Personalized AI trained on your Weak Concepts',
          title: 'Smart Practice',
          body: 'Turn your Weak spots into your strongest topics with\nSmart Tests tailored just for you.',
          cta: {
            primary: { label: 'Start learning free', href: '/auth?mode=register' },
            secondary: { label: "I'm a teacher", href: '/auth?mode=register&role=teacher' }
          }
        }
      ],
      connectors: [],
      connectorsMobile: []
    });

    // Inject animated ↑ arrow into the last section's body text
    const lastBody = worldRef.current.querySelectorAll('.sw-copy__body');
    if (lastBody.length > 0) {
      const last = lastBody[lastBody.length - 1];
      const arrow = document.createElement('span');
      arrow.className = 'level-up-arrow';
      arrow.textContent = ' ↑';
      last.appendChild(arrow);
    }

    // Inject animated artistic SVG lock icon next to first eyebrow
    const eyebrows = worldRef.current.querySelectorAll('.sw-copy__eyebrow');
    if (eyebrows.length > 0) {
      const lockSpan = document.createElement('span');
      lockSpan.className = 'lock-icon';
      lockSpan.innerHTML = `
        <svg class="artistic-lock" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="lock-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#60A5FA" />
              <stop offset="100%" stop-color="#2563EB" />
            </linearGradient>
            <linearGradient id="shackle-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#E2E8F0" />
              <stop offset="100%" stop-color="#94A3B8" />
            </linearGradient>
          </defs>
          <!-- Shackle -->
          <path class="lock-shackle" d="M32 45 V 28 A 18 18 0 0 1 68 28 V 45" fill="none" stroke="url(#shackle-grad)" stroke-width="8" stroke-linecap="round" />
          <!-- Lock Body -->
          <rect class="lock-body" x="18" y="45" width="64" height="48" rx="12" fill="url(#lock-grad)" stroke="#3B82F6" stroke-width="3" />
          <!-- Keyhole -->
          <circle cx="50" cy="65" r="7" fill="#111827" />
          <path d="M46 65 L54 65 L56 81 L44 81 Z" fill="#111827" />
        </svg>
      `;
      eyebrows[0].appendChild(lockSpan);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#111827]">
      <header className="fixed top-0 left-0 right-0 max-w-7xl mx-auto px-6 h-20 flex items-center justify-between z-[200] pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto cursor-pointer" onClick={() => window.scrollTo(0, 0)}>
          <div className="h-12 w-12 rounded-xl bg-[#3B82F6] flex items-center justify-center glow-blue">
            <Orbit className="h-7 w-7 text-white" />
          </div>
          <span className="font-head font-700 text-3xl sm:text-4xl tracking-tight"><span className="text-[#3B82F6]">School</span> <span className="text-[#F87171]">of</span> <span className="text-[#3B82F6]">Maths</span></span>
        </div>
        <div className="flex items-center gap-3 pointer-events-auto">
          <Button data-testid="landing-login-btn" variant="ghost" className="rounded-full font-600 text-[#94A3B8] hover:text-white hover:bg-white/5 bg-[#111827]/80 backdrop-blur-md" onClick={() => nav("/auth")}>Log in</Button>
          <Button data-testid="landing-start-btn" className="rounded-full bg-[#3B82F6] text-white hover:bg-[#60A5FA] font-600 shadow-[0_0_15px_rgba(59,130,246,0.5)]" onClick={() => nav("/auth?mode=register")}>Get started</Button>
        </div>
      </header>

      {/* Live Particle Overlay */}
      <FloatingSymbols count={40} />

      {/* CSS Overrides — unlayered CSS always wins over @layer sw from scrub-engine */}
      <style>{`
        /* Override scrub-engine theme tokens to match our dark background */
        .sw-root {
          --sw-bg: #111827 !important;
          --sw-ink: #F1F5F9 !important;
          --sw-ink-soft: #94A3B8 !important;
        }
        html, body {
          background: #111827 !important;
        }
        /* Kill the white sky background & glow */
        .sw-sky {
          background: #111827 !important;
        }
        .sw-sky__grad, .sw-sky__glow {
          display: none !important;
        }

        /* Widen the copy container and move it up so full description is visible */
        .sw-copy {
          width: min(55vw, 800px) !important;
          top: 45% !important;
          transform: translateY(-30%) !important;
        }

        /* Eyebrow: "Concept Illustrations", "Group & Rank" etc. */
        .sw-copy__eyebrow {
          font-size: 2rem !important;
          letter-spacing: 0.15em !important;
          margin-top: 12px !important;
          margin-bottom: 1.5rem !important;
          font-weight: 800 !important;
        }

        /* Main title: "Topper Notes", "Batches & Leaderboards" etc. */
        .sw-copy__title {
          font-family: 'Outfit', sans-serif !important;
          font-size: clamp(2.2rem, 4.5vw, 5rem) !important;
          line-height: 1.05 !important;
          font-weight: 800 !important;
          margin: 8px 0 0 !important;
        }

        /* Body description text */
        .sw-copy__body {
          font-size: clamp(1.2rem, 1.8vw, 1.75rem) !important;
          max-width: none !important;
          line-height: 1.6 !important;
          margin-top: 1.5rem !important;
          color: #E2E8F0 !important;
          white-space: pre-line !important;
        }

        /* Tags like "AI-crafted", "Competitive" */
        .sw-copy__tags li {
          font-size: 1.1rem !important;
          padding: 0.6rem 1.5rem !important;
          font-weight: 600 !important;
        }

        /* CTA buttons: "Start learning free" / "I'm a teacher" */
        .sw-copy__cta {
          margin-top: 3rem !important;
          gap: 1.25rem !important;
        }
        .sw-btn {
          font-size: 1.2rem !important;
          padding: 14px 28px !important;
        }
        .sw-btn--primary {
          background: rgba(59, 130, 246, 0.95) !important;
          color: white !important;
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.5) !important;
        }
        .sw-btn--primary:hover {
          background: rgba(59, 130, 246, 1) !important;
        }
        .sw-btn--ghost {
          background: rgba(17, 24, 39, 0.75) !important;
          color: white !important;
          border: 1.5px solid rgba(255,255,255,0.3) !important;
        }
        .sw-btn--ghost:hover {
          background: rgba(255,255,255,0.1) !important;
        }
        /* Animated level-up arrow */
        @keyframes bounce-up {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50% { transform: translateY(-8px); opacity: 0.7; }
        }
        .level-up-arrow {
          display: inline-block;
          color: #34D399;
          font-size: 1.4em;
          font-weight: 900;
          animation: bounce-up 1.2s ease-in-out infinite;
          margin-left: 4px;
          text-shadow: 0 0 12px rgba(52, 211, 153, 0.8);
        }

        /* Lock-unlock animation */
        @keyframes shackle-unlock {
          0%, 40%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          50%, 90% {
            transform: translateY(-8px) rotate(-18deg);
          }
        }
        .lock-icon {
          display: inline-block;
          margin-left: 15px;
          width: 3.5rem;
          height: 3.5rem;
          vertical-align: middle;
          opacity: 1 !important;
        }
        .artistic-lock {
          width: 100%;
          height: 100%;
          overflow: visible;
          filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.7));
        }
        .lock-shackle {
          animation: shackle-unlock 2.8s cubic-bezier(0.77, 0, 0.175, 1) infinite;
          transform-origin: 32px 45px;
        }
      `}</style>

      <div id="world" ref={worldRef}></div>
    </div>
  );
}
