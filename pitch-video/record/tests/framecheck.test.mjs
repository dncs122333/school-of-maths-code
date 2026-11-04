import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { frameCheck } from "../lib.mjs";

async function check(html) {
  const b = await chromium.launch();
  const page = await b.newPage();
  page.consoleErrors = [];
  await page.setContent(html);
  const out = await frameCheck(page);
  await b.close();
  return out;
}

test("old brand name fails the frame", async () => {
  assert.deepEqual(await check("<p>Welcome to VidyaLab Desk</p>"), ["text 'VidyaLab' visible"]);
});
test("visible spinner fails the frame", async () => {
  assert.deepEqual(await check('<div class="animate-spin" style="width:20px;height:20px"></div>'), ["1 loading indicator(s) visible"]);
});
test("clean School of Maths page passes", async () => {
  assert.deepEqual(await check("<h1>School of Maths</h1>"), []);
});
test("small decorative pulse passes", async () => {
  assert.deepEqual(await check('<span class="animate-pulse" style="display:inline-block;width:8px;height:8px"></span>'), []);
});
test("pulsing skeleton block fails the frame", async () => {
  assert.deepEqual(await check('<div class="animate-pulse" style="width:300px;height:40px"></div>'), ["1 loading indicator(s) visible"]);
});
