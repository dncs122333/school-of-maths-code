import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const SYMBOLS = [
  'π', '∫', '∑', 'E=mc²', 'H₂O', '⚛', '6.022×10²³', 
  '√', '∞', '∆', 'θ', 'λ', 'μ', 'Ω', 'CO₂', 'O₂', 
  'NaCl', '±', '≠', '≈', 'C₆H₁₂O₆', 'F=ma', 'v=u+at'
];

const COLORS = [
  'text-[#3B82F6]', // Blue
  'text-[#06B6D4]', // Cyan
  'text-[#FBBF24]', // Yellow
  'text-[#34D399]', // Green
  'text-white',
  'text-[#94A3B8]'  // Slate
];

export default function FloatingSymbols({ count = 35 }) {
  // Generate random properties for each particle only once on mount
  const particles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const size = Math.random() * 1.5 + 0.8; // 0.8rem to 2.3rem
      const left = Math.random() * 100; // 0 to 100vw
      const startBottom = -20 - Math.random() * 20; // Start below screen
      const duration = Math.random() * 20 + 15; // 15 to 35 seconds
      const delay = Math.random() * -35; // Random start time so it's already populated
      const opacity = Math.random() * 0.4 + 0.1; // 0.1 to 0.5 opacity (subtle)
      
      return {
        id: i,
        symbol,
        color,
        size,
        left,
        startBottom,
        duration,
        delay,
        opacity
      };
    });
  }, [count]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[50] overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={`absolute ${p.color} font-mono font-medium`}
          style={{ 
            left: `${p.left}%`,
            fontSize: `${p.size}rem`,
            bottom: `${p.startBottom}%`,
            opacity: p.opacity,
            textShadow: '0 0 10px currentColor'
          }}
          animate={{
            y: [0, -1200], // move up
            x: [0, Math.random() * 100 - 50, Math.random() * 100 - 50], // drift left/right
            rotate: [0, Math.random() * 360 - 180] // slight rotation
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
