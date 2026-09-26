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

  // Shrink the tile's font as the name • email grows so the full text always fits the 380px tile
  const fontSize = useMemo(
    () => Math.max(9, Math.min(13, (380 / (displayText.length * 7.8)) * 13)),
    [displayText]
  );

  // Construct SVG pattern data URLs for seamless, crisp diagonal tiling.
  // Two variants: a light fill for the dark UI, and a dark fill swapped in for print
  // (the light fill is invisible on white paper).
  const { watermarkSvgUri, printSvgUri } = useMemo(() => {
    // Escape XML characters in student info
    const safeText = displayText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    const svgFor = (fill) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="380" height="200" viewBox="0 0 380 200">
        <text x="190" y="100" 
              fill="${fill}" 
              font-family="'JetBrains Mono', 'IBM Plex Sans', monospace, sans-serif" 
              font-size="${fontSize}" 
              font-weight="600" 
              letter-spacing="0.5px"
              text-anchor="middle" 
              transform="rotate(-25 190 100)">
          ${safeText}
        </text>
      </svg>
    `;
    const toUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    return {
      watermarkSvgUri: toUri(svgFor("rgba(255, 255, 255, 0.08)")),
      printSvgUri: toUri(svgFor("rgba(15, 23, 42, 0.18)")),
    };
  }, [displayText, fontSize]);

  const tileStyle = {
    backgroundRepeat: "repeat",
    backgroundSize: "380px 200px",
    printColorAdjust: "exact",
    WebkitPrintColorAdjust: "exact",
  };

  return (
    <>
      {/* 1. Tiled Full-Coverage Diagonal Watermark Overlay (screen: light fill) */}
      <div
        className="pointer-events-none select-none absolute inset-0 z-20 overflow-hidden print:hidden"
        aria-hidden="true"
        style={{
          backgroundImage: `url("${watermarkSvgUri}")`,
          ...tileStyle,
        }}
      />
      {/* 1b. Print variant: dark fill swapped in under the `print:` variant so the watermark shows on paper */}
      <div
        className="pointer-events-none select-none absolute inset-0 z-20 overflow-hidden hidden print:block"
        aria-hidden="true"
        style={{
          backgroundImage: `url("${printSvgUri}")`,
          ...tileStyle,
        }}
      />

      {/* 2. Floating Security Token — compact, static version below sm (no animation jank on mobile) */}
      {showFloatingBadge && (
        <>
          <div
            aria-hidden="true"
            className="flex sm:hidden fixed bottom-3 right-3 z-30 pointer-events-none select-none items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0B0F19]/80 backdrop-blur-md border border-white/10 shadow-lg text-xs font-mono text-[#94A3B8]/75 max-w-[200px]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6] shrink-0" />
            <span className="truncate">
              Protected Copy: <span className="text-white font-medium">{displayText}</span>
            </span>
          </div>

          {/* Desktop: dynamic floating / slowly-rotating security token */}
          <motion.div
            aria-hidden="true"
            className="hidden sm:flex fixed bottom-6 right-6 z-30 pointer-events-none select-none items-center gap-2 px-3 py-1.5 rounded-full bg-[#0B0F19]/80 backdrop-blur-md border border-white/10 shadow-2xl text-[11px] font-mono text-[#94A3B8]/75 print:hidden"
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
        </>
      )}
    </>
  );
}
