// Record scene clips from the live demo app.  node record.mjs --stage 1|2|3   (or --only s08,s09)
// Each stage's scenes need som_demo seeded to that stage; the stage check runs first and aborts on mismatch.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { open, settle, frameCheck, smoothScroll, verifyStage, token, ROOT, UI } from "./lib.mjs";
import { startCapture, CURSOR_SCRIPT } from "./capture.mjs";

const CLIPS = path.join(ROOT, "clips");
fs.mkdirSync(CLIPS, { recursive: true });
const NOTES = [];

async function glide(page, locator, ms = 700) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: Math.round(ms / 16) });
  await page.waitForTimeout(150);
}
async function tap(page, locator, after = 900) {
  await glide(page, locator);
  await locator.click();
  await settle(page, after);
}
async function scrollTo(page, locator, offset = 160, ms = 1400) {
  const y = await locator.evaluate((el) => el.getBoundingClientRect().top);
  await smoothScroll(page, y - offset, ms);
  await page.waitForTimeout(300);
}
const firstVisible = (page, text) => page.getByText(text, { exact: false }).filter({ visible: true }).first();

const SCENES = {
  // ---- stage 1: before
  s08: { stage: 1, who: "teacher", layout: "desktop", async run(page) {
    await page.goto(`${UI}/reports`); await settle(page, 1200);
    await tap(page, page.getByRole("button", { name: "Student Mastery Matrix" }), 1800);
    await page.waitForTimeout(1500);
    await smoothScroll(page, 420, 1600); await page.waitForTimeout(1600);
    await page.goto(`${UI}/teacher/dashboard`); await settle(page, 1200);
    await scrollTo(page, firstVisible(page, "Class Weak Topics"), 120, 1800);
    await page.waitForTimeout(2600);
  } },
  s09: { stage: 1, who: "hero", layout: "phone", async run(page) {
    await page.goto(`${UI}/mastery`); await settle(page, 1200);
    await page.waitForTimeout(1000);
    await tap(page, page.getByRole("button", { name: /^Weak/ }), 1200);
    await scrollTo(page, firstVisible(page, "Solutions of quadratic equations"), 220, 1500);
    await page.waitForTimeout(3500);
  } },
  s11a: { stage: 1, who: "hero", layout: "phone", run: (p) => masteryCard(p) },
  // ---- stage 2: practice
  s10: { stage: 2, who: "hero", layout: "phone", async run(page) {
    await page.goto(`${UI}/dashboard`); await settle(page, 1500);
    const focus = firstVisible(page, "Focus");
    if (await focus.count()) await scrollTo(page, focus, 120, 1600);
    else NOTES.push("s10: no 'Focus' section found on the student dashboard");
    await page.waitForTimeout(2500);
    await page.goto(`${UI}/dpp`); await settle(page, 1200);
    await page.waitForTimeout(1200);
    await smoothScroll(page, 500, 1600); await page.waitForTimeout(1500);
  } },
  s11b: { stage: 2, who: "hero", layout: "phone", run: (p) => masteryCard(p) },
  // ---- stage 3: after, plus the feature montage
  s03: { stage: 3, who: "teacher", layout: "desktop", async run(page) {
    await page.goto(`${UI}/batches`); await settle(page, 1500);
    await page.waitForTimeout(1200);
    await glide(page, firstVisible(page, "Code:"), 900); await page.waitForTimeout(900);
    await scrollTo(page, firstVisible(page, "waiting to join"), 200, 1200);
    await page.waitForTimeout(700);
    await tap(page, page.getByRole("button", { name: "Approve" }).first(), 1800);
  } },
  s04: { stage: 3, who: "hero", layout: "phone", async run(page) {
    await page.goto(`${UI}/materials`); await settle(page, 1500);
    await page.waitForTimeout(1000);
    await tap(page, page.getByRole("button", { name: "View" }).first(), 3000);
    await page.waitForTimeout(3500);
  } },
  s05: { stage: 3, who: "teacher", layout: "desktop", async run(page) {
    await page.goto(`${UI}/question-bank`); await settle(page, 1500);
    await page.waitForTimeout(1500);
    await page.goto(`${UI}/tests/new`); await settle(page, 1500);
    const title = page.locator("input").filter({ visible: true }).first();
    await glide(page, title); await title.click();
    await page.keyboard.type("Class Test 6 – Quadratics Final", { delay: 45 });
    await page.waitForTimeout(600);
    await smoothScroll(page, 500, 1800); await page.waitForTimeout(1500);
  } },
  s05p: { stage: 3, who: "tara", layout: "phone", async run(page) {
    const tests = await (await fetch(`${process.env.DEMO_API || "http://localhost:8011/api"}/tests`, {
      headers: { Authorization: `Bearer ${await token("tara")}` } })).json();
    const t = (Array.isArray(tests) ? tests : tests.tests || []).find((x) => /Class Test 4/.test(x.title));
    if (!t) throw new Error("Tara has no Class Test 4 make-up");
    await page.goto(`${UI}/quiz/${t.id}`); await settle(page, 2000);
    const nav = page.locator('nav[aria-label="Questions"]');
    for (const [q, opt] of [[2, 3], [3, 0], [4, 2]]) {
      await tap(page, nav.locator("button").filter({ hasText: new RegExp(`^\\s*${q}\\s*$`) }).first(), 700);
      await tap(page, page.locator(`[data-testid="option-${opt}"]`), 800);
    }
    await page.waitForTimeout(1200);
  } },
  s06: { stage: 3, who: "teacher", layout: "desktop", async run(page) {
    await page.goto(`${UI}/reports`); await settle(page, 1200);
    await tap(page, page.getByRole("combobox").filter({ hasText: /\(TEST|\(DPP/ }).first(), 700);
    await tap(page, page.getByRole("option", { name: /Class Test 4/ }), 1800);
    await page.waitForTimeout(1200);
    await smoothScroll(page, 380, 1500); await page.waitForTimeout(800);
    await smoothScroll(page, -380, 900);
    await glide(page, page.getByRole("button", { name: "Download Official PDF" }), 900);
    await page.waitForTimeout(1500);
  } },
  s07: { stage: 3, who: "teacher", layout: "desktop", async run(page) {
    await page.goto(`${UI}/teacher/dashboard`); await settle(page, 1200);
    await scrollTo(page, firstVisible(page, "Fees Status"), 200, 1200);
    await tap(page, firstVisible(page, "Fees Status"), 1500);
    await smoothScroll(page, 300, 1400);
    await page.waitForTimeout(2200);
  } },
  s11c: { stage: 3, who: "hero", layout: "phone", run: (p) => masteryCard(p) },
  s12: { stage: 3, who: "teacher", layout: "desktop", async run(page) {
    await page.goto(`${UI}/teacher/dashboard`); await settle(page, 1200);
    await scrollTo(page, firstVisible(page, "Class Weak Topics"), 120, 1600);
    await page.waitForTimeout(2200);
    await page.goto(`${UI}/reports`); await settle(page, 1200);
    await tap(page, page.getByRole("button", { name: "Term & Coverage Overview" }), 1800);
    await smoothScroll(page, 450, 1600); await page.waitForTimeout(1800);
  } },
};

// The same view at every stage, so the three clips line up in the climb transition
async function masteryCard(page) {
  await page.goto(`${UI}/mastery`); await settle(page, 1500);
  const card = firstVisible(page, "Solutions of quadratic equations");
  const y = await card.evaluate((el) => el.getBoundingClientRect().top + scrollY);
  await page.evaluate((top) => scrollTo(0, top - 260), y);
  await settle(page, 1500);
  await page.waitForTimeout(3000);
}

async function recordScene(id, browser) {
  const s = SCENES[id];
  const { ctx, page } = await open({ who: s.who, layout: s.layout, browser });
  await ctx.addInitScript(CURSOR_SCRIPT);
  // Warm up: first load compiles bundles and fills caches, so the take itself has no spinners
  await page.goto(`${UI}/`); await settle(page, 800);
  const size = s.layout === "phone" ? { maxWidth: 780, maxHeight: 1688 } : { maxWidth: 1920, maxHeight: 1080 };
  const stop = await startCapture(page, size);
  let problems = [];
  try {
    await s.run(page);
    problems = await frameCheck(page);
  } finally {
    const out = path.join(CLIPS, `${id}.mp4`);
    const info = await stop(out);
    await page.screenshot({ path: path.join(CLIPS, `${id}.last.png`) });
    console.log(`${id}: ${info.seconds.toFixed(1)}s, ${info.frames} frames${problems.length ? "  PROBLEMS: " + problems.join("; ") : ""}`);
    if (problems.length) NOTES.push(`${id}: ${problems.join("; ")}`);
    await ctx.close();
  }
  return problems;
}

const args = process.argv.slice(2);
const stage = args.includes("--stage") ? Number(args[args.indexOf("--stage") + 1]) : null;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const ids = Object.keys(SCENES).filter((id) => (only ? only.includes(id) : SCENES[id].stage === stage));
if (!ids.length) { console.error("nothing to record"); process.exit(2); }
for (const st of new Set(ids.map((id) => SCENES[id].stage))) console.log("stage check:", JSON.stringify(verifyStage(st)));
const browser = await chromium.launch();
let failed = 0;
for (const id of ids) {
  try { failed += (await recordScene(id, browser)).length ? 1 : 0; }
  catch (e) { failed++; console.log(`${id}: FAILED ${e.message.split("\n")[0]}`); NOTES.push(`${id}: failed – ${e.message.split("\n")[0]}`); }
}
await browser.close();
if (NOTES.length) fs.appendFileSync(path.join(ROOT, "RECORDING_NOTES.md"), NOTES.map((n) => `- ${n}`).join("\n") + "\n");
process.exit(failed ? 1 : 0);
