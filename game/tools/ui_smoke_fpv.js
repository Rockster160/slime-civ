// First-person work countdown smoke: possess a slime, start a chop, and read the HUD ring (a fraction rising 0 -> 1, not the spinner), the resource icon, the seconds
// left, a +n pop when the log lands; then a berry bush for the units count. Screenshot: tmp/ui-fpv-countdown.png. One headless Chromium, closed in `finally`.
//   node tools/build.js && node tools/ui_smoke_fpv.js
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "tmp"), { recursive: true });
const errors = []; let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/GL Driver Message/.test(m.text())) errors.push(m.type() + ": " + m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?tools=all&seed=1&debug=1");
  await page.waitForFunction(() => window.__game);
  const G = (fn, arg) => page.evaluate(fn, arg);
  await G((j) => (localStorage.setItem("slimeciv.save.1", j), localStorage.setItem("slimeciv.save.1.meta", '{"tick":1000000000,"seed":0,"day":0,"pop":0,"kb":1,"iron":0}')), readFileSync(join(root, "tests", "fixtures", "start.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(800);
  // setup: one adult on open ground facing east, a tree beside it and a berry bush two cells further on
  const info = await G(() => {
    const g = __game, s = g.sim, w = s.world; g.state.paused = true; g.ui.follow = 0; g.clearSelection();
    for (const q of s.ents.ofKind("villager")) { q.hunger = q.thirst = q.energy = 0.95; q.warm = 1; q.hp = Math.max(q.hp, 50); }
    let spot = null;
    for (let y = s.site.y - 22; y < s.site.y + 22 && !spot; y++) for (let x = s.site.x - 22; x < s.site.x + 22 && !spot; x++) {
      const z0 = w.standZ(x, y); let good = z0 > 0;
      for (let i = -1; i < 5 && good; i++) for (let j = -1; j <= 1 && good; j++) good = w.standZ(x + i, y + j) === z0 && s.ents.at(x + i, y + j, z0).length === 0;
      if (good) spot = { x, y, z: z0 };
    }
    const v = s.ents.ofKind("villager").find(q => q.born < -1300000 && q.born > -2400000) || s.ents.ofKind("villager")[0];
    s.ents.move(v, spot.x, spot.y, spot.z); v.action = null; v.job = null; s.cache.iv++;
    const t = s.ents.add("plant", { species: "tree", x: spot.x + 1, y: spot.y, z: spot.z, yield: 4, nx: 0, rv: 0, rt: 0 });
    w.setFlags(spot.x + 1, spot.y, spot.z, w.flags(spot.x + 1, spot.y, spot.z) | g.F.OBSTACLE);
    g.selectOnly(v.id, true);
    return { id: v.id, tree: t.id, X: spot.x, Y: spot.y, z: spot.z };
  });
  await page.keyboard.press("q"); await page.waitForTimeout(500);
  assert.equal(await G(() => __game.fpv.on), true, "first person is on");
  await G(() => { const f = __game.fpv; f.look(0); f.pos = null; __game.state.paused = false; __game.state.speed = 1; __game.fpv.popMs = 6000; });
  await page.waitForTimeout(600);
  await page.keyboard.press("e"); await page.waitForTimeout(500);       // use: chop what the crosshair points at
  const read = () => G(() => {
    const c = document.querySelector(".fv-chip"), w = c && c.querySelector(".fv-work");
    if (!w) return null;
    const fg = w.querySelector(".fg"), d = parseFloat(fg.style.strokeDasharray) || 0;
    return { frac: d / 47.12, spin: w.classList.contains("ind"), icon: w.querySelector(".wic").style.display !== "none", secs: c.querySelector(".wsec").textContent, cnt: c.querySelector(".wcnt").textContent, pops: [...document.querySelectorAll(".fv-pop")].map(p => p.textContent) };
  });
  let first = await read();
  assert.ok(first, "the work ring is on the chip once the chop starts");
  assert.equal(first.spin, false, "a known length: the ring is a fraction, not the spinner");
  assert.ok(first.icon, "the log icon sits in the centre");
  assert.match(first.secs, /^\d+s$/, "seconds left are shown: " + first.secs);
  await page.waitForTimeout(3500);
  const mid = await read();
  assert.ok(mid.frac > first.frac + 0.1 && mid.frac < 1, "the ring fills over time: " + first.frac.toFixed(2) + " -> " + mid.frac.toFixed(2));
  assert.ok(parseInt(mid.secs) < parseInt(first.secs), "the seconds count down: " + first.secs + " -> " + mid.secs);
  await page.screenshot({ path: join(root, "tmp", "ui-fpv-countdown.png") });
  ok(`chop: ring ${first.frac.toFixed(2)} -> ${mid.frac.toFixed(2)}, ${first.secs} -> ${mid.secs}, log icon, no spinner`);
  // paused: the ring holds, the count shows a pause
  await G(() => { __game.state.paused = true; }); await page.waitForTimeout(500);
  const p1 = await read(); await page.waitForTimeout(500); const p2 = await read();
  assert.equal(p1.secs, "II"); assert.ok(Math.abs(p1.frac - p2.frac) < 0.01, "paused: the ring holds"); ok("paused: the ring holds and the count reads II");
  await G(() => { __game.state.paused = false; __game.state.speed = 2; });
  // let it land: a +2 Log pop
  let popped = false;
  for (let i = 0; i < 80 && !popped; i++) { await page.waitForTimeout(250); const r = await G(() => [...document.querySelectorAll(".fv-pop")].map(p => p.textContent)); popped = r.some(t => /^\+2 /.test(t)); }
  assert.ok(popped, "a +2 pop shows when the logs land"); ok("a +2 Log pop shows when the tree falls");
  await page.screenshot({ path: join(root, "tmp", "ui-fpv-countdown-land.png") });
  // a bush: the units count
  await G((a) => {
    const g = __game, s = g.sim, w = s.world, v = s.ents.get(a.id);
    for (const e of s.ents.ofKind("item")) if (e.x === a.X + 1 && e.y === a.Y) s.ents.remove ? s.ents.remove(e) : 0;
    const b = s.ents.add("plant", { species: "berry", x: a.X + 1, y: a.Y, z: a.z, yield: 4, nx: 0, rv: 0, rt: 0 });
    w.setFlags(a.X + 1, a.Y, a.z, w.flags(a.X + 1, a.Y, a.z) | g.F.OBSTACLE); v.action = null; v.job = null; g.state.speed = 1;
  }, info);
  await G(() => __game.fpv.look(0, -0.5));            // the eye is higher now and a bush is low and close: look down at it, as a player with the mouse would
  await page.waitForTimeout(500);
  await page.keyboard.press("e");
  let cnt = ""; for (let i = 0; i < 40 && !/^\d\/\d$/.test(cnt); i++) { await page.waitForTimeout(250); const r = await read(); cnt = r ? r.cnt : ""; }
  assert.match(cnt, /^\d\/\d$/, "the units count shows on a bush: " + cnt); ok("berry bush: units count " + cnt);
  assert.deepEqual(errors, [], "no console errors");
  console.log("ui_smoke_fpv ok");
} finally { await browser.close(); }
