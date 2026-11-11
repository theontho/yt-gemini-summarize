// End-to-end smoke test in Playwright Chromium: node test/e2e.mjs
import { chromium } from "playwright";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const ext = path.resolve(import.meta.dirname, "..");
const out = path.join(ext, "test-results");
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
};

const server = http.createServer((_req, res) => {
  res.setHeader("content-type", "text/html");
  res.end(`<!doctype html><body style="font:16px sans-serif;padding:40px">
    <p>Text link: <a id="l1" href="https://youtu.be/dQw4w9WgXcQ">a video</a> and
       <a id="l2" href="https://example.com">not a video</a></p>
    <iframe id="emb" width="560" height="315" src="https://www.youtube.com/embed/jNQXAC9IVRw"></iframe>
  </body>`);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const local = `http://127.0.0.1:${server.address().port}/`;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "yts-"));
const ctx = await chromium.launchPersistentContext(userData, {
  channel: "chromium",
  headless: !process.env.HEADED,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const errors = [];
try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent("serviceworker");
  check("service worker loaded", !!sw, sw.url());

  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`page: ${e.message}`));

  await page.goto("https://www.youtube.com/results?search_query=lofi", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("yts-summarize", { timeout: 20000 }).catch(() => {});
  const thumbs = await page.locator("yts-summarize").count();
  check("search result thumbnails get buttons", thumbs > 5, `${thumbs} buttons`);
  await page.screenshot({ path: path.join(out, "search.png") });

  const before = page.url();
  const [gem] = await Promise.all([
    ctx.waitForEvent("page", { timeout: 10000 }),
    page.locator("yts-summarize").first().click(),
  ]);
  await gem.waitForLoadState("domcontentloaded");
  check("thumbnail click opens Gemini", gem.url().includes("gemini.google.com"), gem.url());
  await page.waitForTimeout(1000);
  check("thumbnail click does not navigate YouTube", page.url() === before);

  await gem.waitForTimeout(10000);
  const editorText = await gem
    .locator('.ql-editor, [contenteditable="true"], textarea')
    .first()
    .innerText({ timeout: 2000 })
    .catch(() => null);
  const userMsg = await gem.locator("user-query, .query-text").first().innerText({ timeout: 2000 }).catch(() => null);
  const mode = await gem.locator('[data-test-id="bard-mode-menu-button"]').getAttribute("aria-label").catch(() => null);
  check("Gemini model set to Flash-Lite", /currently Flash-Lite/i.test(mode || ""), mode);
  console.log(`INFO gemini url=${gem.url()} editor=${JSON.stringify(editorText)}`);
  check("Gemini chat started with summarize prompt", /summarize https:\/\/www\.youtube\.com\/watch\?v=/.test(userMsg || ""), userMsg?.split("\n").pop());
  await gem.screenshot({ path: path.join(out, "gemini.png") }).catch(() => {});
  await gem.close();

  await sw.evaluate(() => chrome.storage.sync.set({ model: "Flash" }));
  const [gem2] = await Promise.all([ctx.waitForEvent("page"), page.locator("yts-summarize").nth(1).click()]);
  await gem2.waitForTimeout(12000);
  const mode2 = await gem2.locator('[data-test-id="bard-mode-menu-button"]').getAttribute("aria-label").catch(() => null);
  const sent2 = await gem2.locator("user-query, .query-text").first().innerText({ timeout: 2000 }).catch(() => "");
  const run2 = await sw.evaluate(() => chrome.storage.local.get("lastRun").then((r) => r.lastRun));
  // Signed-out Gemini only enables Flash-Lite, so "Flash" must be reported unavailable and still send.
  check(
    "unavailable model falls back, still sends, status recorded",
    run2?.stage === "sent" && ["unavailable", "selected"].includes(run2?.modelResult) && /summarize/.test(sent2),
    `${run2?.modelResult} / ${mode2}`,
  );
  const extId = new URL(sw.url()).host;
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 360, height: 640 });
  await pop.goto(`chrome-extension://${extId}/popup.html`);
  await pop.waitForTimeout(800);
  const popText = await pop.locator("body").innerText();
  const opts = await pop.locator("#model option").allTextContents();
  check("popup shows last run + model list", /Sent/.test(popText) && opts.some((o) => /Flash-Lite/.test(o)), opts.join(" | "));
  await pop.screenshot({ path: path.join(out, "popup.png") });
  await pop.close();
  await gem2.close();
  await sw.evaluate(() => chrome.storage.sync.remove("model"));

  await page.goto("https://www.youtube.com/watch?v=jNQXAC9IVRw", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#yts-page-button", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const where = await page.evaluate(() => {
    const b = document.getElementById("yts-page-button");
    const h = b?.parentElement;
    if (!h) return null;
    const br = b.getBoundingClientRect(), hr = h.getBoundingClientRect();
    return { parent: h.tagName, inside: br.top >= hr.top - 4 && br.bottom <= hr.bottom + 4 && br.height > 0 };
  });
  check("watch page button inline after title", where?.parent === "H1" && where.inside, JSON.stringify(where));
  const compact = await page.evaluate(() =>
    [...document.querySelectorAll("yts-summarize[data-compact]")].map((b) => {
      const r = b.getBoundingClientRect(), a = b.parentElement.getBoundingClientRect();
      return { w: Math.round(r.width), bottomLeft: a.bottom - r.bottom < 12 && r.left - a.left < 12 };
    }),
  );
  check("sidebar thumbnails get compact bottom-left icon", compact.length > 3 && compact.every((c) => c.w <= 26 && c.bottomLeft), `${compact.length} compact`);
  console.log(`INFO watch page sidebar buttons=${await page.locator("yts-summarize").count()}`);
  await page.screenshot({ path: path.join(out, "watch.png") });

  await page.goto(local);
  await page.waitForTimeout(1500);
  await page.hover("#l1");
  await page.waitForTimeout(300);
  const visible = await page.evaluate(() =>
    [...document.querySelectorAll("yts-summarize")].some((b) => b.style.display !== "none"),
  );
  check("hover over YouTube link shows button", visible);
  await page.screenshot({ path: path.join(out, "other-site-hover.png") });
  await page.hover("#l2");
  await page.waitForTimeout(900);
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll("yts-summarize")].every((b) => b.style.display === "none"),
  );
  check("button hides on non-video link", hidden);

  const frame = page.frames().find((f) => f.url().includes("/embed/"));
  await frame?.waitForSelector("yts-summarize", { timeout: 15000 }).catch(() => {});
  const embedBtn = frame ? await frame.locator("yts-summarize").count() : 0;
  check("embed iframe gets button", embedBtn === 1);
  await page.screenshot({ path: path.join(out, "other-site-embed.png") });
  if (embedBtn) {
    const [g2] = await Promise.all([ctx.waitForEvent("page"), frame.locator("yts-summarize").click()]);
    check("embed click opens Gemini", g2.url().includes("gemini.google.com"));
    await g2.close();
  }

  const v = await sw.evaluate(() => [
    YTS.canonicalUrl("https://youtu.be/dQw4w9WgXcQ?t=3"),
    YTS.canonicalUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    YTS.canonicalUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"),
    YTS.canonicalUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x"),
    YTS.canonicalUrl("https://www.youtube.com/@channel"),
  ]);
  check(
    "URL normalization",
    v.slice(0, 4).every((u) => u === "https://www.youtube.com/watch?v=dQw4w9WgXcQ") && v[4] === null,
    JSON.stringify(v),
  );
} finally {
  console.log(errors.filter((e) => /yts|YTS|summar/i.test(e)).join("\n") || "INFO no extension page errors");
  await ctx.close();
  server.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
process.exit(results.every(Boolean) ? 0 : 1);
