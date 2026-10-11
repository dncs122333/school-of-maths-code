import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const SYMBOLS = [
  'π', '∫', '∑', 'E=mc²', 'H₂O', '⚛', '6.022×10²³', 
  '√', '∞', '∆', 'θ', 'λ', 'μ', 'Ω', 'CO₂', 'O₂', 
  'NaCl', '±', '≠', '≈', 'C₆H₁₂O₆', 'F=ma', 'v=u+at'
];

const COLORS = [
  'text-[#1E293B]', // Dark Slate
  'text-[#E04A3C]', // Coral Red (WCAG AA)
  'text-[#2F8A5F]', // Teal Green (WCAG AA)
  'text-[#3E7CB1]', // Sky Blue (WCAG AA)
  'text-[#7A5CC0]', // Soft Purple (WCAG AA)
  'text-[#D9A014]'  // Dark Mustard
];

export default function FloatingSymbols({ count = 20 }) {
  const prefersReducedMotion = typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Generate random properties for each particle only once on mount
  const particles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const size = Math.random() * 1.0 + 0.8; // 0.8rem to 1.8rem
      const left = Math.random() * 100; // 0 to 100vw
      const startBottom = -20 - Math.random() * 20; // Start below screen
      const duration = Math.random() * 20 + 15; // 15 to 35 seconds
      const delay = Math.random() * -35; // Random start time so it's already populated
      const opacity = Math.random() * 0.4 + 0.1; // 0.1 to 0.5 opacity (subtle)
      const driftX = [0, Math.random() * 100 - 50, Math.random() * 100 - 50];
      const rotate = [0, Math.random() * 360 - 180];
      
      return {
        id: i,
        symbol,
        color,
        size,
        left,
        startBottom,
        duration,
        delay,
        opacity,
        driftX,
        rotate
      };
    });
  }, [count]);

  if (prefersReducedMotion) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={`absolute ${p.color} font-mono font-medium`}
          style={{ 
            left: `${p.left}%`,
            fontSize: `${p.size}rem`,
            bottom: `${p.startBottom}%`,
            opacity: p.opacity
          }}
          animate={{
            y: [0, -1200], // move up
            x: p.driftX, // precomputed drift
            rotate: p.rotate // precomputed rotation
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: "linear",
            delay: p.delay
          }}
        >
          {p.symbol}
        </motion.div>
      ))}
    </div>
  );
}
