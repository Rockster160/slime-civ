// 6.19c label-pass screenshots at 1280x720 -> tmp/ui-s19c-*.png: the HUD, inspector, village panel, minimap, build strip, FPV mid-fight and FPV eating.
//   node tools/build.js && node tools/ui_shots19c.js [hud inspector village build fpv-fight fpv-eat ...]
// One browser, one page, sequential. World edits here are test setup (fixtures, a few hundred ticks at most).
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."); mkdirSync(join(root, "tmp"), { recursive: true });
const want = process.argv.slice(2);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/GL Driver Message/.test(m.text())) errors.push(m.type() + ": " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const out = (n) => join(root, "tmp", "ui-s19c-" + n + ".png");
const G = (fn, arg) => page.evaluate(fn, arg);
async function load(fixture, query = "") {
  await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?seed=1&spawn=64,64" + query);
  await page.waitForFunction(() => window.__game);
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", fixture + ".json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(600);
  await G(() => { __game.state.paused = true; __game.ui.attn.tick = __game.sim.tick; });
}
const holdPops = () => G(() => { __game.fpv.popMs = 30000; const st = document.createElement("style"); st.textContent = ".fv-pop{animation:none !important;opacity:1 !important}"; document.head.appendChild(st); });
const pick3 = () => G(() => { const g = __game, vs = g.sim.ents.ofKind("villager"); g.selectMany(vs.slice(0, 3).map(v => v.id)); g.ui.focus = vs[0].id; });
const shots = {
  async hud() {
    await load("settled");
    await pick3(); await page.waitForTimeout(800);
    await page.screenshot({ path: out("hud") });
  },
  async contrast() {
    await load("settled");
    await pick3(); await G(() => document.body.classList.add("hc")); await page.waitForTimeout(800);
    await page.screenshot({ path: out("hud-highcontrast") });
  },
  async inspector() {
    await load("settled");
    await G(() => { const g = __game, v = g.sim.ents.ofKind("villager")[0]; v.hunger = 0.3; v.warm = 0.2; g.sim.step(); g.selectOnly(v.id, true); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: out("inspector"), clip: { x: 880, y: 40, width: 400, height: 520 } });
    await page.screenshot({ path: out("inspector-full") });
  },
  async village() {
    await load("prewinter");
    await G(() => { const g = __game; g.sim.board.runway = 3.4; });
    await page.waitForTimeout(800);
    await page.screenshot({ path: out("village"), clip: { x: 0, y: 40, width: 420, height: 680 } });
    await page.screenshot({ path: out("village-full") });
  },
  async trip() {
    await load("settled");
    await pick3(); await page.waitForTimeout(600);
    await page.screenshot({ path: out("trip"), clip: { x: 880, y: 360, width: 400, height: 300 } });
  },
  async build() {
    await load("settled", "&tools=all");
    await page.keyboard.press("b"); await page.waitForTimeout(600);
    await page.screenshot({ path: out("build") });
  },
  async "fpv-fight"() {
    await load("thornback");
    const info = await G(() => {
      const g = __game, s = g.sim, w = s.world, tb = s.ents.ofKind("fauna").find(e => e.sp === "thornback");
      for (const q of s.ents.ofKind("villager")) { q.hunger = q.thirst = q.energy = 0.9; q.warm = 1; }
      const v = s.ents.ofKind("villager")[0], at = [tb.x - 3, tb.y, tb.z];
      s.ents.move(v, at[0], at[1], w.standZ(at[0], at[1])); v.action = null; v.job = null; s.cache.iv++;
      g.selectOnly(v.id, true); g.possess(v.id); if (!g.fpv.on) g.fpvToggle();
      g.fpv.popMs = 30000; g.fpv.look(0, -0.08); g.fpv.pos = null; g.state.paused = false; g.state.speed = 1;
      return { tb: [tb.x, tb.y, tb.z], v: [v.x, v.y, v.z] };
    });
    await holdPops(); await page.waitForTimeout(500);
    await G(() => document.querySelectorAll(".fv-pop").forEach(e => e.remove()));
    for (let i = 0; i < 150; i++) {
      await page.keyboard.press("e"); await page.waitForTimeout(80);
      if (await G(() => !!document.querySelector(".fv-pop.hit, .fv-pop.miss"))) break;
    }
    await page.screenshot({ path: out("fpv-fight") });
    console.log(JSON.stringify(info), JSON.stringify(await G(() => ({ tb: (t => t && [t.hp, t.ht, t.hd, __game.sim.tick])(__game.sim.ents.ofKind("fauna").find(e => e.sp === "thornback")), v: (v => [v.hp, v.ht, v.hd])(__game.possessed()), tags: [...document.querySelectorAll(".fv-tag")].map(e => e.textContent), chip: document.querySelector(".fv-chip").innerText, pops: [...document.querySelectorAll(".fv-pop")].map(e => e.innerText) }))));
  },
  async "fpv-eat"() {
    await load("settled");
    await G(() => {
      const g = __game, s = g.sim, w = s.world, z = s.stock;
      for (const q of s.ents.ofKind("villager")) { q.hunger = q.thirst = q.energy = 0.9; q.warm = 1; }
      const v = s.ents.ofKind("villager").find(q => q.born < -100000) || s.ents.ofKind("villager")[0];
      v.hunger = 0.25; v.carry = { item: "berry", n: 3 };
      const at = [z.x0 - 4, Math.floor((z.y0 + z.y1) / 2)]; s.ents.move(v, at[0], at[1], w.standZ(at[0], at[1])); v.action = null; v.job = null; s.cache.iv++;
      const o = s.ents.ofKind("villager").find(q => q !== v); s.ents.move(o, at[0] + 4, at[1] + 1, w.standZ(at[0] + 4, at[1] + 1)); o.action = null; s.cache.iv++;
      g.selectOnly(v.id, true); g.possess(v.id); if (!g.fpv.on) g.fpvToggle();
      g.fpv.popMs = 30000; g.fpv.look(0, -0.16); g.fpv.pos = null; g.state.paused = false; g.state.speed = 1;
    });
    await holdPops(); await page.waitForTimeout(600);
    await page.keyboard.press("c");
    for (let i = 0; i < 100; i++) { await page.waitForTimeout(40); if (await G(() => !!document.querySelector(".fv-pop") )) break; }
    await page.screenshot({ path: out("fpv-eat") });
    console.log(JSON.stringify(await G(() => ({ state: document.querySelector(".fv-state").textContent, pops: [...document.querySelectorAll(".fv-pop")].map(e => e.innerText), chip: document.querySelector(".fv-chip").innerText }))));
  },
};
for (const k of Object.keys(shots)) if (!want.length || want.includes(k)) { await shots[k](); console.log("shot", k); }
await browser.close();
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("done");
