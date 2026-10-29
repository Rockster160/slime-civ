// 7.20: just the cores check and its screenshot (seconds, one headless Chromium, closed in `finally`), without the minutes-long smoke.
//   node tools/build.js && node tools/core720_shot.js
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import * as C720 from "./core720.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "tmp"), { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/GL Driver Message/.test(m.text())) errors.push(m.type() + ": " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?tools=all&seed=1&spawn=64,64&debug=1");
  await page.waitForFunction(() => window.__game);
  const G = (fn, arg) => page.evaluate(fn, arg);
  const shot = (p, name) => p.screenshot({ path: join(root, "tmp", name + ".png") });
  const c = { G, ok: (m) => console.log("ok " + m), shot };
  await C720.cores(page, c);
  await C720.network(page, c);
} finally { await browser.close(); }
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("no console errors");
