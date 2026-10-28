// Smoke test: load the built page in headless Chromium, let it run, screenshot,
// fail on any console error/warning or page error.
//
//   node tools/build.js && node tools/shot.js [seconds=4] [speed=5] [name=shot]
//
// Playwright is not a dependency of this project; it is borrowed read-only from
// slime-village (override with PLAYWRIGHT=/path/to/playwright/index.mjs, and
// CHROMIUM=/path/to/chrome if the revision does not match).
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "tmp"), { recursive: true });
const seconds = Number(process.argv[2] || 4), speed = Number(process.argv[3] || 5), name = process.argv[4] || "shot";
const skip = Number(process.env.SKIP_TICKS || 0);   // fast-forward the sim this many ticks before the first screenshot (e.g. SKIP_TICKS=90000 for mid-autumn)

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?seed=1");
if (skip) await page.evaluate((n) => { for (let i = 0; i < n; i++) __game.sim.step(); }, skip);
await page.keyboard.press(String(speed));
await page.waitForTimeout(seconds * 1000);
const info = await page.evaluate(() => ({ tick: __game.sim.tick, hash: __game.sim.hash(), villagers: __game.sim.ents.ofKind("villager").length }));
await page.screenshot({ path: join(root, "tmp", name + "-zoomed.png") });
await page.keyboard.press("0");
await page.waitForTimeout(300);
await page.screenshot({ path: join(root, "tmp", name + "-fit.png") });
await browser.close();

console.log("ticks", info.tick, "villagers", info.villagers, "hash", info.hash);
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("no console errors; screenshots in game/tmp/" + name + "-*.png");
