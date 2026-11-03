import React, { useState } from "react";

// A question's diagram. Hidden if the link is broken rather than showing a broken-image icon.
export default function QuestionFigure({ src, className = "" }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt="Diagram for this question"
      loading="lazy"
      onError={() => setFailed(true)}
      className={`max-w-full max-h-80 h-auto rounded-xl border-2 border-[#1E293B] bg-white ${className}`}
    />
  );
}
