// Render the video's own graphics from HTML: caption overlays, phone stage + bezel, hook, title, climb counter, end card.
//   node render.mjs <build-dir> <plan.json>      (plan.json is written by edit/compose.py)
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { startCapture } from "./capture.mjs";
import { ROOT } from "./lib.mjs";

const [outDir, planPath] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const LOGO = "data:image/png;base64," + fs.readFileSync(path.join(ROOT, "..", "frontend", "public", "logo512.png")).toString("base64");
const P = plan.phone; // {x, y, w, h}

const BASE = `<style id="pause">*,*::before,*::after{animation-play-state:paused!important}</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=IBM+Plex+Sans:wght@500;600&display=swap" rel="stylesheet">
<style>
:root{--yellow:#F5C842;--navy:#1E293B;--cream:#FFF8E7;--red:#E8553F;--green:#4CAF7D;--amber:#F2A93B}
*{box-sizing:border-box;margin:0;padding:0} html,body{width:1920px;height:1080px;overflow:hidden}
body{font-family:'IBM Plex Sans',sans-serif;color:var(--navy)}
.stage{position:absolute;inset:0;background:var(--cream);
  background-image:radial-gradient(rgba(30,41,59,.18) 1.6px,transparent 1.6px);background-size:28px 28px}
h1,h2,.head{font-family:'Outfit',sans-serif}
.brand{display:flex;align-items:center;gap:22px} .brand img{width:96px;height:96px}
.brand b{font-family:'Outfit';font-weight:900;font-size:64px;letter-spacing:-1px} .brand b span{color:var(--red)}
</style>`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const pages = {
  caption: (text) => `${BASE}<style>body{background:transparent}
    .cap{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);max-width:1500px;padding:20px 40px;
    background:var(--navy);color:#fff;border-radius:22px;font:700 50px/1.2 'Outfit';text-align:center;
    box-shadow:6px 6px 0 var(--yellow)}</style><div class="cap">${esc(text)}</div>`,
  phoneBg: (headline) => `${BASE}<div class="stage"></div>
    <div style="position:absolute;left:${P.x + P.w + 150}px;top:0;bottom:0;right:120px;display:flex;flex-direction:column;justify-content:center;gap:34px">
      <div class="brand"><img src="${LOGO}" style="width:72px;height:72px"><b style="font-size:44px">SCHOOL OF <span>MATHS</span></b></div>
      <h1 style="font:800 76px/1.08 'Outfit';letter-spacing:-1px">${esc(headline)}</h1>
    </div>`,
  phoneFrame: () => `${BASE}<style>body{background:transparent}</style>
    <div style="position:absolute;left:${P.x - 18}px;top:${P.y - 18}px;width:${P.w + 36}px;height:${P.h + 36}px;
      border:18px solid var(--navy);border-radius:64px;box-shadow:14px 14px 0 rgba(30,41,59,.25);
      outline:3px solid #334155"></div>
    <div style="position:absolute;left:${P.x + P.w / 2 - 60}px;top:${P.y - 6}px;width:120px;height:26px;background:var(--navy);border-radius:0 0 16px 16px"></div>`,
  phoneMask: () => `${BASE}<style>body{background:transparent}</style>
    <svg width="1920" height="1080" style="position:absolute;inset:0"><defs><mask id="m">
      <rect width="1920" height="1080" fill="white"/><rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" rx="46" fill="black"/></mask></defs>
      <rect x="${P.x - 2}" y="${P.y - 2}" width="${P.w + 4}" height="${P.h + 4}" fill="#1E293B" mask="url(#m)"/></svg>`,
  hook: (d) => `${BASE}<div class="stage"></div>
    <style>.card{position:absolute;top:240px;width:470px;height:560px;background:#fff;border:4px solid var(--navy);border-radius:32px;
      box-shadow:10px 10px 0 var(--navy);padding:34px;opacity:0;transform:translateY(40px) rotate(var(--r));animation:in .7s ease-out forwards}
      .card h2{font:800 40px 'Outfit';margin-bottom:22px} .row{height:44px;border-radius:12px;margin:14px 0;background:#E2E8F0}
      .bub{background:#DCF8C6;border-radius:18px;padding:14px 18px;margin:12px 0;font:600 24px 'IBM Plex Sans'}
      .x{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:900 150px 'Outfit';color:var(--red);opacity:0;animation:x .4s ease-out forwards}
      @keyframes in{to{opacity:1;transform:translateY(0) rotate(var(--r))}} @keyframes x{to{opacity:.9}}</style>
    <div class="card" style="left:150px;--r:-3deg;animation-delay:.3s"><h2>💬 Notes on WhatsApp</h2>
      <div class="bub">Ch 4 notes.pdf 📄</div><div class="bub">Sir pls send again</div><div class="bub">which chapter for test??</div><div class="bub">notes not opening 😕</div>
      <div class="x" style="animation-delay:${d * 0.62}s">✕</div></div>
    <div class="card" style="left:725px;--r:2deg;animation-delay:${d * 0.22}s"><h2>📝 Tests on paper</h2>
      <div class="row"></div><div class="row" style="width:80%"></div><div class="row"></div><div class="row" style="width:60%"></div><div class="row" style="width:85%"></div>
      <div class="x" style="animation-delay:${d * 0.7}s">✕</div></div>
    <div class="card" style="left:1300px;--r:-2deg;animation-delay:${d * 0.42}s"><h2>📒 Fees in a register</h2>
      <div class="row" style="background:#FDE68A"></div><div class="row" style="width:70%"></div><div class="row" style="background:#FECACA"></div><div class="row"></div><div class="row" style="width:75%"></div>
      <div class="x" style="animation-delay:${d * 0.78}s">✕</div></div>`,
  title: () => `${BASE}<div class="stage" style="background-color:var(--yellow)"></div>
    <style>.t{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;opacity:0;transform:scale(.94);animation:in .8s .2s ease-out forwards}
    @keyframes in{to{opacity:1;transform:scale(1)}}</style>
    <div class="t"><div class="brand"><img src="${LOGO}" style="width:150px;height:150px"><b style="font-size:104px">SCHOOL OF <span>MATHS</span></b></div>
      <h2 style="font:700 50px 'Outfit'">Notes · Tests · Results · Weak topics · Fees — one app</h2></div>`,
  endcard: () => `${BASE}<div class="stage" style="background-color:var(--yellow)"></div>
    <style>.t{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;opacity:0;animation:in 1s .2s ease-out forwards}
    @keyframes in{to{opacity:1}}</style>
    <div class="t"><img src="${LOGO}" style="width:220px;height:220px"><div class="brand"><b style="font-size:110px">SCHOOL OF <span>MATHS</span></b></div>
      <div style="font:600 34px 'IBM Plex Sans'">CBSE Classes 9–10 Maths</div></div>`,
  climb: (scores, d) => `${BASE}<div class="stage"></div>
    <div style="position:absolute;left:${P.x + P.w + 150}px;top:0;bottom:0;right:120px;display:flex;flex-direction:column;justify-content:center;gap:24px">
      <div class="head" style="font:700 40px 'Outfit'">Aarav · Quadratic Equations</div>
      <div id="n" style="font:900 260px/1 'Outfit';letter-spacing:-6px">${scores[0]}%</div>
      <div id="b" style="align-self:flex-start;font:800 54px 'Outfit';padding:10px 34px;border:4px solid var(--navy);border-radius:999px;background:var(--red);color:#fff">Weak</div>
      <div style="font:600 32px 'IBM Plex Sans';opacity:.75" id="s">After class tests 1 & 2</div>
    </div>
    <script>
      const S=${JSON.stringify(scores)}, D=${d}*1000, seg=D/3;
      const band=v=>v>75?["Strong","#4CAF7D"]:v>=55?["Developing","#F2A93B"]:["Weak","#E8553F"];
      const sub=["After class tests 1 & 2","After practice + class test 3","After class test 4"];
      let t0;
      window.go=()=>{t0=performance.now();requestAnimationFrame(f)};
      function f(now){const t=now-t0;let i=Math.min(2,Math.floor(t/seg));const into=t-i*seg;
        let v=S[i]; if(i>0&&into<900){const k=into/900,e=1-Math.pow(1-k,3);v=Math.round(S[i-1]+(S[i]-S[i-1])*e)}
        n.textContent=v+"%";const [l,c]=band(v);b.textContent=l;b.style.background=c;s.textContent=sub[i];
        if(t<D)requestAnimationFrame(f)}
    </script>`,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

async function png(name, html) {
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => { document.fonts.ready; document.getElementById("pause")?.remove(); });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, name), omitBackground: true });
  await page.close();
}
async function clip(name, html, seconds) {
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const stop = await startCapture(page, { maxWidth: 1920, maxHeight: 1080 });
  await page.evaluate(() => { document.getElementById("pause")?.remove(); window.go?.(); });
  await page.waitForTimeout(seconds * 1000);
  await stop(path.join(outDir, name));
  await page.close();
}

await png("phone_frame.png", pages.phoneFrame());
await png("phone_mask.png", pages.phoneMask());
for (const s of plan.scenes) {
  if (s.caption) await png(`caption_${s.id}.png`, pages.caption(s.caption));
  if (s.headline) await png(`phonebg_${s.id}.png`, pages.phoneBg(s.headline));
  if (s.render === "hook") await clip("s01.mp4", pages.hook(s.length), s.length + 0.5);
  if (s.render === "title") await clip("s02.mp4", pages.title(), s.length + 0.5);
  if (s.render === "endcard") await clip("s13.mp4", pages.endcard(), s.length + 0.5);
  if (s.render === "climb") await clip("climb_bg.mp4", pages.climb(s.scores, s.length), s.length + 0.5);
}
await browser.close();
console.log("rendered graphics into", outDir);
