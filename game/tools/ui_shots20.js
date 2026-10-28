// 6.20 screenshots and the stage's checks on their own:  node tools/build.js && node tools/ui_shots20.js   -> tmp/ui-s20-*.png
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import * as S from "./s20.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "tmp"), { recursive: true });
const only = process.argv[2];
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?tools=all&seed=1&spawn=64,64");
  await page.waitForFunction(() => window.__game);
  const ctx = { G: (f, a) => page.evaluate(f, a), ok: (m) => console.log("ok " + m), shot: (p, n) => p.screenshot({ path: join(root, "tmp", n + ".png") }) };
  for (const k of ["pointers", "boxSelect", "gauge", "inspector"]) if (!only || only === k) await S[k](page, ctx);
  if (!only || only === "build") await S.buildStamp(page, ctx);
  if (!only || only === "hints") await S.hints(browser, ctx);
  if (errors.length) { console.log("PAGE ERRORS", errors); process.exitCode = 1; }
} finally { await browser.close(); }
