import React, { useMemo } from "react";
import { motion } from "framer-motion";

export default function WatermarkOverlay({
  studentName = "Student",
  studentEmail = "student@vidya.com",
  showFloatingBadge = true,
}) {
  const displayText = useMemo(() => {
    const name = studentName || "Student";
    const email = studentEmail || "";
    return email ? `${name} • ${email}` : name;
  }, [studentName, studentEmail]);

  // Construct SVG pattern data URL for seamless, crisp diagonal tiling
  const watermarkSvgUri = useMemo(() => {
    // Escape XML characters in student info
    const safeText = displayText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="380" height="200" viewBox="0 0 380 200">
        <text x="190" y="100" 
              fill="rgba(255, 255, 255, 0.08)" 
              font-family="'JetBrains Mono', 'IBM Plex Sans', monospace, sans-serif" 
              font-size="13" 
              font-weight="600" 
              letter-spacing="0.5px"
              text-anchor="middle" 
              transform="rotate(-25 190 100)">
          ${safeText}
        </text>
      </svg>
    `;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [displayText]);

  return (
    <>
      {/* 1. Tiled Full-Coverage Diagonal Watermark Overlay */}
      <div
        className="pointer-events-none select-none absolute inset-0 z-20 overflow-hidden print:opacity-40"
        aria-hidden="true"
        style={{
          backgroundImage: `url("${watermarkSvgUri}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "380px 200px",
        }}
      />

      {/* 2. Dynamic Floating / Slowly-Rotating Security Token */}
      {showFloatingBadge && (
        <motion.div
          aria-hidden="true"
          className="fixed bottom-6 right-6 z-30 pointer-events-none select-none hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0B0F19]/80 backdrop-blur-md border border-white/10 shadow-2xl text-[11px] font-mono text-[#94A3B8]/75"
          animate={{
            y: [0, -10, 0, 8, 0],
            rotate: [-2, 2, -1, 3, -2],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6] animate-pulse" />
          <span className="truncate max-w-[260px]">
            Protected Copy: <span className="text-white font-medium">{displayText}</span>
          </span>
        </motion.div>
      )}
    </>
  );
}
