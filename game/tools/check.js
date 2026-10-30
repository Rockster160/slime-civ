// Quick check for small changes (seconds, not minutes): load the built game, fail on any console error, and optionally assert one thing.
//   node tools/build.js && node tools/check.js                       (loads without error)
//   node tools/check.js "[data-test=day]" "Year \d+ · Day"          (that element's text matches the pattern)
//   node tools/check.js --eval "__game.sim.ents.ofKind('villager').length > 0"
// One headless Chromium, closed in `finally`. Use this, not the full smoke scripts, for a single UI or text change.
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const errors = [];
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let fail = "";
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => { if (m.type() === "error" && !/GL Driver Message/.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?seed=1&debug=1");
  await page.waitForFunction(() => window.__game && window.__game.sim.tick > 0, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  if (args[0] === "--eval") {
    const r = await page.evaluate(args[1]);
    if (!r) fail = "eval was falsy: " + args[1]; else console.log("ok eval: " + args[1]);
  } else if (args[0]) {
    const t = (await page.textContent(args[0], { timeout: 5000 })) || "";
    if (args[1] && !new RegExp(args[1]).test(t)) fail = `${args[0]} = "${t}" does not match /${args[1]}/`;
    else console.log(`ok ${args[0]} = "${t}"`);
  }
  if (errors.length) fail = (fail ? fail + "\n" : "") + "console errors:\n" + errors.join("\n");
} finally { await browser.close(); }
if (fail) { console.error("FAIL " + fail); process.exit(1); }
console.log("check passed: game loads with no console errors");
