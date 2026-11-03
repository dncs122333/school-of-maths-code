import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

// Inline maths: $...$ or \(...\); display maths: $$...$$ or \[...\]
const MATH_RE = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\))/g;

function renderTex(src) {
  const display = src.startsWith("$$") || src.startsWith("\\[");
  const body = display ? src.slice(2, -2) : src.startsWith("$") ? src.slice(1, -1) : src.slice(2, -2);
  return { html: katex.renderToString(body, { displayMode: display, throwOnError: false, strict: "ignore" }), display };
}

// Questions written before LaTeX support use ASCII maths ("2x^2 - sqrt(5)x", "x^3*y^2"). Make them readable:
// powers as superscripts, sqrt(...) as √(...), and * as × between numbers (dropped between letters).
const ASCII_RE = /(sqrt\s*\(|\^\s*\(([^)]*)\)|\^\s*(-?[\w.]+)|(\d)\s*\*\s*(?=\d)|\s*\*\s*)/g;

function prettifyAscii(text, keyBase) {
  const out = [];
  let last = 0;
  let m;
  let k = 0;
  ASCII_RE.lastIndex = 0;
  while ((m = ASCII_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (/^sqrt/.test(tok)) out.push("√(");
    else if (m[2] !== undefined) out.push(<sup key={`${keyBase}-${k++}`}>{m[2]}</sup>);
    else if (m[3] !== undefined) out.push(<sup key={`${keyBase}-${k++}`}>{m[3]}</sup>);
    else if (m[4] !== undefined) out.push(`${m[4]} × `);
    else out.push(""); // a*b → ab
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Text that may contain maths. `as` sets the wrapper element (span by default). */
export default function MathText({ text, as: Tag = "span", className }) {
  const parts = useMemo(() => {
    const s = text == null ? "" : String(text);
    return s.split(MATH_RE).filter((p) => p !== "");
  }, [text]);

  return (
    <Tag className={className}>
      {parts.map((p, i) => {
        if (MATH_RE.test(p)) {
          MATH_RE.lastIndex = 0;
          const { html, display } = renderTex(p);
          return display
            ? <span key={i} className="block my-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
            : <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        MATH_RE.lastIndex = 0;
        return <React.Fragment key={i}>{prettifyAscii(p, i)}</React.Fragment>;
      })}
    </Tag>
  );
}
