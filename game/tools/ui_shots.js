// Screenshot driver for the UI overhaul (S19a): loads a fixture into the built page and takes the checklist shots (UI_SPEC §9) at 1280x720 and 1920x1080.
//   node tools/build.js && node tools/ui_shots.js [which...]     (names below; no argument = all)
// One browser, one page, sequential: it runs no sim beyond a few hundred ticks.
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "tmp"), { recursive: true });
const want = process.argv.slice(2);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/GL Driver Message/.test(m.text())) errors.push(m.type() + ": " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const out = (n) => join(root, "tmp", "ui-s19a-" + n + ".png");
const G = (fn, arg) => page.evaluate(fn, arg);
async function load(fixture, query = "") {
  await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?seed=1&spawn=64,64" + query);
  await page.waitForFunction(() => window.__game);
  if (fixture) {
    await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", fixture + ".json"), "utf8"));
    await page.keyboard.press("Shift+O"); await page.waitForTimeout(500);
  }
  await G(() => { __game.state.paused = true; __game.ui.attn.tick = __game.sim.tick; });
}
const shots = {
  async start() { await load("start"); await page.waitForTimeout(500); await page.screenshot({ path: out("start") }); },
  async crowd() {
    await load("crowd");
    await G(() => { const g = __game, vs = g.sim.ents.ofKind("villager"); g.selectMany(vs.slice(0, 3).map(v => v.id)); g.ui.focus = vs[0].id; });
    await page.waitForTimeout(700); await page.screenshot({ path: out("crowd") });
    await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(600); await page.screenshot({ path: out("1920") });
    await page.setViewportSize({ width: 1280, height: 720 });
  },
  async villager() {
    await load("settled");
    await G(() => { const g = __game; const v = g.sim.ents.ofKind("villager")[0]; v.hunger = 0.3; v.warm = 0.2; g.sim.step(); g.selectOnly(v.id, true); });
    await page.waitForTimeout(700); await page.screenshot({ path: out("villager") });
    await page.locator('[data-test="why-rejected"] .jc').first().hover().catch(() => {}); await page.waitForTimeout(500); await page.screenshot({ path: out("why") });
  },
  async winter() {
    await load("prewinter");
    await G(() => { const g = __game; g.sim.board.runway = 4; g.sim.board.fc = 0; g.sim.board.sc = 1; g.sim.board.sneed = 3; });
    await page.waitForTimeout(700); await page.screenshot({ path: out("food-winter") });
  },
  async stock() {
    await load("settled");
    await page.waitForTimeout(500);
    const t = page.locator('[data-test="stock-tile"]').first();
    if (await t.count()) { await t.click(); await page.waitForTimeout(300); }
    await page.screenshot({ path: out("stock") });
  },
  async build() {
    await load("settled", "&tools=all");
    await page.keyboard.press("b"); await page.waitForTimeout(500);
    await G(() => { const b = __game.ui.build; b.tool = "wall"; });
    await page.waitForTimeout(400); await page.screenshot({ path: out("build") });
  },
  async book() {
    await load("settled", "&tools=all");
    await page.keyboard.press("k"); await page.waitForTimeout(500); await page.screenshot({ path: out("book-story") });
    await page.locator('[data-test="book-tab"][data-tab="know"]').click(); await page.waitForTimeout(400); await page.screenshot({ path: out("book-know") });
    await page.locator('[data-test="book-tab"][data-tab="people"]').click(); await page.waitForTimeout(400); await page.screenshot({ path: out("book-people") });
    await page.locator('[data-test="book-tab"][data-tab="keys"]').click(); await page.waitForTimeout(400); await page.screenshot({ path: out("book-keys") });
  },
  async possess() {
    await load("settled");
    await G(() => { const g = __game, v = g.sim.ents.ofKind("villager").find(q => q.born < -1000000) || g.sim.ents.ofKind("villager")[0]; g.selectOnly(v.id, true); g.possess(v.id); });
    await page.waitForTimeout(900); await page.screenshot({ path: out("possess") });
    await G(() => { __game.release(); });
    await load("settled", "&fpv=0");
    await G(() => { const g = __game, v = g.sim.ents.ofKind("villager")[0]; g.selectOnly(v.id, true); g.possess(v.id); });
    await page.waitForTimeout(700); await page.screenshot({ path: out("possess-topdown") });
  },
  async whisper() {
    await load("settled");
    await G(() => { const g = __game; for (const m of ["Planned 22 walls. Villagers fetch the materials and build them as ordinary chores.", "Chop: 3 villagers.", "Cannot scout there: no path.", "Orders cancelled.", "Select villagers first (click or drag a box)."]) g.toast(m); });
    await page.waitForTimeout(400); await page.screenshot({ path: out("whisper") });
  },
  async menus() {
    await load("settled", "&debug=1");
    await page.locator('[data-test="ff"]').click(); await page.waitForTimeout(250); await page.screenshot({ path: out("ff-debug") }); await page.keyboard.press("Escape");
    await page.mouse.click(640, 400);
    await page.locator('[data-test="layers"]').click(); await page.waitForTimeout(250); await page.screenshot({ path: out("layers") });
    await page.mouse.click(640, 400);
    await page.locator('[data-test="menu"]').click(); await page.waitForTimeout(250); await page.screenshot({ path: out("menu") });
    await page.mouse.click(640, 400);
    await G(() => { __game.ui.settings = true; }); await page.waitForTimeout(400); await page.screenshot({ path: out("settings") });
  },
};
for (const k of Object.keys(shots)) if (!want.length || want.includes(k)) { await shots[k](); console.log("shot", k); }
await browser.close();
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("done");
