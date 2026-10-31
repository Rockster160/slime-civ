// S18: first-person screenshots. Loads a fixture into the built page, possesses a villager, switches to first person and writes tmp/fpv-<scene>.png
// (daylight at the camp, night, a lit cave tunnel, a rock face to dig, a thornback). One headless Chromium, closed in `finally`. World edits here are test setup.
//   node tools/build.js && node tools/fpv_shot.js [day night tunnel dig thornback]
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."); mkdirSync(join(root, "tmp"), { recursive: true });
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ["day", "night", "tunnel", "dig", "thornback"];
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => { if (process.env.DBG) console.log("PAGE", m.text()); if ((m.type() === "error" || m.type() === "warning") && !/GL Driver Message/.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?tools=all&seed=1");
  await page.waitForFunction(() => window.__game);
  const load = async (name) => { await page.evaluate((j) => (localStorage.setItem("slimeciv.save.1", j), localStorage.setItem("slimeciv.save.1.meta", '{"tick":1000000000,"seed":0,"day":0,"pop":0,"kb":1,"iron":0}')), readFileSync(join(root, "tests", "fixtures", name + ".json"), "utf8")); await page.keyboard.press("Shift+O"); await page.waitForTimeout(700); };
  const run = (fn, arg) => page.evaluate(fn, arg);
  for (const sc of scenes) {
    if (await run(() => !!__game.possessed())) await page.keyboard.press("Escape");
    await load(sc === "thornback" ? "thornback" : "settled");
    const info = await run(({ sc }) => {
      const g = __game, s = g.sim, w = s.world; g.state.paused = true; g.ui.follow = 0;
      const ph = (t) => ((t + 2400) % 12000) / 12000;
      if (sc === "day" || sc === "thornback") { for (let i = 0; i < 12000 && Math.abs(ph(s.tick) - 0.42) > 0.004; i++) s.step(); }
      if (sc === "night") { for (let i = 0; i < 12000 && Math.abs(ph(s.tick) - 0.93) > 0.004; i++) s.step(); }
      for (const q of s.ents.ofKind("villager")) { q.hunger = q.thirst = q.energy = 0.9; q.warm = 1; }
      const v = s.ents.ofKind("villager").find(q => q.born < -100000) || s.ents.ofKind("villager")[0];
      let at = null, yaw = 0, pitch = -0.04;
      if (sc === "day" || sc === "night") { const z = s.stock; at = [z.x0 - 4, Math.floor((z.y0 + z.y1) / 2), z.z]; yaw = 0; }
      if (sc === "thornback") { const tb = s.ents.ofKind("fauna").find(e => e.sp === "thornback"); at = [tb.x - 5, tb.y, tb.z]; yaw = 0; if (w.standZ(at[0], at[1]) !== tb.z) at[2] = w.standZ(at[0], at[1]); }
      if (sc === "tunnel" || sc === "dig") {
        const cv = w.geo.caves[0], W = w.constructor, floor = cv.floor.map(i => W.xyz(i)).filter(c => w.isWalkable(...c)).sort((a, b) => a[2] - b[2] || a[0] - b[0]);
        const c = floor[0]; at = c; yaw = 0;
        let best = null; for (const d of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { let n = 0; while (n < 12 && w.isWalkable(c[0] + d[0] * (n + 1), c[1] + d[1] * (n + 1), c[2])) n++; if (!best || n > best.n) best = { n, d }; }
        yaw = Math.atan2(best.d[1], best.d[0]);
        if (sc === "dig") { const wl = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(d => !w.isWalkable(c[0] + d[0], c[1] + d[1], c[2]) && w.isSolid(c[0] + d[0], c[1] + d[1], c[2])); w.set(c[0] + wl[0], c[1] + wl[1], c[2], g.M.SOFT); yaw = Math.atan2(wl[1], wl[0]); pitch = -0.1; }
        s.ents.add("furniture", { f: "torch", x: c[0] + best.d[0] * Math.min(4, best.n), y: c[1] + best.d[1] * Math.min(4, best.n), z: c[2], owner: 0, rv: 0, rt: 0 });
      }
      if (at) { const z = w.standZ(at[0], at[1]); s.ents.move(v, at[0], at[1], at[2] >= 0 ? at[2] : z); v.action = null; v.job = null; s.cache.iv++; }
      g.selectOnly(v.id, true); g.possess(v.id);
      if (!g.fpv.on) g.fpvToggle();
      g.fpv.yaw = yaw; g.fpv.pitch = pitch; g.fpv.pos = null;
      for (let i = 0; i < 20; i++) s.step();
      return { v: [v.x, v.y, v.z], tick: s.tick };
    }, { sc });
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(root, "tmp", "fpv-" + sc + ".png") });
    console.log("chip: " + JSON.stringify(await run(() => { const c = document.querySelector(".fv-chip"); const t = __game.fpv.target; return [c.style.display, c.innerText, c.style.transform, t && t.task, t && t.blocker]; })));
    console.log("scene " + sc + " at " + JSON.stringify(info) + " stats " + JSON.stringify(await run(() => __game.fpv.stats())));
  }
  console.log(errors.length ? "ERRORS: " + errors.join("\n") : "no console errors");
} finally { await browser.close(); }
