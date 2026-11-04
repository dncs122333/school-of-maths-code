// Shared helpers for scene recorders: logged-in browser contexts, smooth motion, frame checks.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const UI = process.env.DEMO_UI || "http://localhost:3011";
export const API = process.env.DEMO_API || "http://localhost:8011/api";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEMO_PASSWORD = "DemoPass#2026"; // pitch-video/seed/roster.py
export const PEOPLE = {
  admin: ["admin@vidya.com", "admin123"],
  teacher: ["meera.iyer@schoolofmaths.demo", DEMO_PASSWORD],
  hero: ["aarav.sharma@schoolofmaths.demo", DEMO_PASSWORD],
  tara: ["tara.pillai@schoolofmaths.demo", DEMO_PASSWORD],
};

export async function token(who) {
  const [email, password] = PEOPLE[who];
  const r = await fetch(`${API}/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login ${who}: ${r.status}`);
  return (await r.json()).token;
}

export async function api(who, p) {
  const r = await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${await token(who)}` } });
  if (!r.ok) throw new Error(`GET ${p}: ${r.status}`);
  return r.json();
}

const DESKTOP = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

export async function open({ who, layout = "desktop", video = null, browser = null }) {
  const b = browser || (await chromium.launch());
  const opts = layout === "phone" ? PHONE : DESKTOP;
  const ctx = await b.newContext({
    ...opts, colorScheme: "light", reducedMotion: "no-preference",
    ...(video ? { recordVideo: { dir: video, size: opts.viewport } } : {}),
  });
  if (who) {
    const t = await token(who);
    await ctx.addInitScript((tok) => localStorage.setItem("vidya_token", tok), t);
  }
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.consoleErrors = consoleErrors;
  return { browser: b, ctx, page };
}

export async function settle(page, ms = 600) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

// Problems that must never reach a frame of the video
export async function frameCheck(page) {
  const problems = [];
  const text = await page.evaluate(() => document.body.innerText);
  if (/vidya\s*lab/i.test(text)) problems.push("text 'VidyaLab' visible");
  const busy = await page.evaluate(() => [...document.querySelectorAll(
    '[class*="animate-spin"],[class*="skeleton"],[class*="animate-pulse"],[aria-busy="true"]')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      // Decorative pulsing dots/icons are fine; a pulsing block is a loading skeleton
      const cls = el.getAttribute("class") || "";
      return !(cls.includes("animate-pulse") && r.width <= 24 && r.height <= 24);
    }).length);
  if (busy) problems.push(`${busy} loading indicator(s) visible`);
  if (await page.locator("#webpack-dev-server-client-overlay, iframe#webpack-dev-server-client-overlay").count())
    problems.push("dev error overlay visible");
  const errToast = await page.locator('[data-sonner-toast][data-type="error"]').count();
  if (errToast) problems.push("error toast visible");
  if (page.consoleErrors?.length) problems.push(`console errors: ${page.consoleErrors.slice(0, 2).join(" | ")}`);
  return problems;
}

export async function smoothScroll(page, dy, ms = 1200) {
  const steps = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;
    await page.mouse.wheel(0, dy * (ease(t1) - ease(t0)));
    await page.waitForTimeout(16);
  }
}

export function verifyStage(stage) {
  if (!stage) return null;
  const py = path.join(ROOT, "..", "backend", ".venv", "bin", "python");
  try {
    const out = execFileSync(py, [path.join(ROOT, "seed", "verify_stage.py"), "--stage", String(stage)],
      { env: { ...process.env, DB_NAME: "som_demo" }, encoding: "utf8" });
    return JSON.parse(out.trim().split("\n").pop());
  } catch (e) {
    const last = String(e.stdout || "").trim().split("\n").pop();
    throw new Error(`stage ${stage} check failed: ${last || e.message}`);
  }
}
