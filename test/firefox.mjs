// Firefox smoke test via Selenium: node test/firefox.mjs (needs dist/*.zip from `npm run build`)
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const zip = fs.readdirSync(path.join(root, "dist")).find((f) => f.endsWith(".zip"));
const opts = new firefox.Options();
if (!process.env.HEADED) opts.addArguments("-headless");
const driver = await new Builder().forBrowser("firefox").setFirefoxOptions(opts).build();
let ok = true;
const check = (name, pass, extra = "") => {
  ok &&= pass;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await driver.installAddon(path.join(root, "dist", zip), true);
  await driver.get("https://www.youtube.com/results?search_query=lofi");
  await sleep(8000);
  const n = await driver.executeScript("return document.querySelectorAll('yts-summarize').length");
  check("Firefox: thumbnails get buttons", n > 5, `${n}`);
  const main = await driver.getWindowHandle();
  await driver.executeScript("document.querySelector('yts-summarize').click()");
  await sleep(2000);
  const handles = await driver.getAllWindowHandles();
  check("Firefox: click opens a tab", handles.length === 2);
  if (handles.length === 2) {
    await driver.switchTo().window(handles.find((h) => h !== main));
    await sleep(15000);
    const url = await driver.getCurrentUrl();
    const sent = await driver.executeScript(
      "return document.querySelector('user-query, .query-text')?.innerText || ''",
    );
    check("Firefox: Gemini chat started", /summarize https:\/\/www\.youtube\.com\/watch\?v=/.test(sent), url);
  }
} finally {
  await driver.quit();
}
process.exit(ok ? 0 : 1);
