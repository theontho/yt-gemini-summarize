// Regenerates docs/screenshot.png: node test/screenshots.mjs
import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const ext = path.resolve(import.meta.dirname, "..");
const out = path.join(ext, "test-results");
fs.mkdirSync(out, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "yts-shot-"));
const ctx = await chromium.launchPersistentContext(userData, {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent("serviceworker");
  const page = await ctx.newPage();
  await page.goto("https://www.youtube.com/watch?v=jNQXAC9IVRw");
  await page.waitForSelector("#yts-page-button");
  await page.waitForSelector("yts-summarize[data-compact]");
  await page.waitForTimeout(4000);
  await page.evaluate(() => document.querySelector("video")?.pause());
  await page.screenshot({ path: path.join(out, "shot-watch.png") });

  const [gem] = await Promise.all([ctx.waitForEvent("page"), page.locator("#yts-page-button").click()]);
  await gem.waitForTimeout(12000);
  await gem.close();

  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 364, height: 600 });
  const [yt] = await sw.evaluate(() => chrome.tabs.query({ url: "*://www.youtube.com/watch*" }).then((t) => t.map((x) => x.id)));
  await pop.goto(`chrome-extension://${new URL(sw.url()).host}/popup.html?tab=${yt}`);
  await pop.waitForTimeout(1000);
  const h = await pop.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
  await pop.screenshot({ path: path.join(out, "shot-popup.png"), clip: { x: 0, y: 0, width: 364, height: h } });
} finally {
  await ctx.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
