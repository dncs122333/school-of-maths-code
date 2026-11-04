// Crisp capture: Chrome screencast frames (JPEG q92) with real timestamps, assembled by ffmpeg into an mp4.
// Playwright's built-in recordVideo is ~1 Mbit VP8, which blurs small text at 1080p.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export async function startCapture(page, { maxWidth, maxHeight }) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth, maxHeight, everyNthFrame: 1 });
  const started = Date.now() / 1000;
  return async function stop(outFile) {
    const ended = Date.now() / 1000;
    await cdp.send("Page.stopScreencast").catch(() => {});
    if (!frames.length) throw new Error("no frames captured");
    const dir = fs.mkdtempSync(path.join(path.dirname(outFile), ".frames-"));
    const lines = ["ffconcat version 1.0"];
    frames.forEach((f, i) => {
      const name = `f${String(i).padStart(5, "0")}.jpg`;
      fs.writeFileSync(path.join(dir, name), Buffer.from(f.data, "base64"));
      const next = i + 1 < frames.length ? frames[i + 1].t : ended;
      const dur = Math.max(1 / 60, next - (i === 0 ? Math.min(f.t, started) : f.t));
      lines.push(`file ${name}`, `duration ${dur.toFixed(4)}`);
    });
    lines.push(`file f${String(frames.length - 1).padStart(5, "0")}.jpg`); // concat demuxer needs the last file twice
    fs.writeFileSync(path.join(dir, "list.ffconcat"), lines.join("\n"));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.ffconcat"),
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "14",
      "-preset", "medium", outFile]);
    fs.rmSync(dir, { recursive: true, force: true });
    return { frames: frames.length, seconds: ended - started };
  };
}

// A visible cursor with a click ripple, injected into every page (headless Chrome draws none).
export const CURSOR_SCRIPT = () => {
  const install = () => {
    if (document.getElementById("__demo_cursor")) return;
    const c = document.createElement("div");
    c.id = "__demo_cursor";
    c.style.cssText = "position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;" +
      "transform:translate(-200px,-200px);transition:transform 0.02s linear";
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#1E293B" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.style.cssText = `position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;` +
        "border:3px solid #F5C542;z-index:2147483646;pointer-events:none;transition:all .45s ease-out;opacity:1";
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.8)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install); else install();
};
