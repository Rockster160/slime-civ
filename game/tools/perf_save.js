// Perf budget for 8.27: the autosave's main-thread time per frame while it is in flight, in headless Chromium, on the year2 and autumn fixtures.
//   node tools/build.js && node tools/perf_save.js        (about 30 s; one Chromium, closed in `finally`)
// Reports, per fixture and per run: the synchronous slices the save runs on the main thread (the cut = snapshot + package + record text; the store's pack / manifest slices), the
// frames it was in flight for, the ms per frame it adds (slices / frames, and the worst single slice), and the frame-interval stretch seen by a requestAnimationFrame probe.
// Fails when the worst slice or the mean per frame is over 8 ms.
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUDGET = 8, T0 = Date.now(), errors = [];
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let fail = "";
const rows = [];
try {
  for (const name of (process.argv[2] ? [process.argv[2]] : ["year2", "autumn"])) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error" && !/GL Driver Message/.test(m.text())) errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?seed=1&debug=1");
    await page.waitForFunction(() => window.__game && window.__game.sim.tick > 0 && window.__saves, null, { timeout: 15000 });
    await page.evaluate(() => window.__saves.storeReady);
    const text = readFileSync(join(root, "tests/fixtures", name + ".json"), "utf8");
    await page.evaluate((t) => { window.__saves.loadJSON(window.__game, t, "x"); }, text);
    await page.waitForFunction(() => window.__saves.warmed(), null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    // a probe: every animation frame's interval, tagged with whether a save was in flight
    await page.evaluate(() => {
      window.__fr = []; let last = performance.now();
      const loop = (now) => { window.__fr.push([now - last, window.__saves.storeInfo().busy > 0 || window.__game.autoBusy ? 1 : 0]); last = now; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    await page.waitForTimeout(1500);
    const runs = [];
    for (let i = 0; i < 4; i++) {                                   // (the first save writes everything; the later ones are the incremental steady state)
      await page.evaluate(() => { const g = window.__game; g.sim.tick += 12000; g.lastAutoDay = Math.floor(g.sim.tick / 12000) - 1; g.lastAutoMs = 0; g.autoBusy = false; window.__n0 = window.__fr.length; window.__prev = window.__saves.storeInfo().stats; window.__stats = null; });
      await page.waitForFunction(() => { const s = window.__saves.storeInfo(); return s.stats && s.stats !== window.__prev && !s.busy && !window.__game.autoBusy; }, null, { timeout: 30000 });
      runs.push(await page.evaluate(() => {
        const st = window.__saves.storeInfo().stats, fr = window.__fr.slice(window.__n0), fl = fr.filter(f => f[1]);
        const idle = window.__fr.filter(f => !f[1]).map(f => f[0]).sort((a, b) => a - b), med = idle[idle.length >> 1] || 16.7;
        const maxF = Math.max(0, ...fl.map(f => f[0]));
        return { wrote: st.wrote, reused: st.reused, ms: st.ms, cut: st.cut || 0, hash: st.hash, sync: st.sync, frames: fl.length, medFrame: med, maxFrame: maxF };
      }));
      await page.waitForTimeout(800);
    }
    for (const [i, r] of runs.entries()) {
      const slices = r.cut + r.hash.ms + r.sync.ms, worst = Math.max(r.cut, r.hash.worst, r.sync.max), perFrame = slices / Math.max(1, r.frames);
      rows.push({ name, i, ...r, slices, worst, perFrame });
      console.log(`${name} #${i + 1}: wrote ${r.wrote}/${r.wrote + r.reused}, in flight ${r.frames} frames (${r.ms} ms), cut ${r.cut.toFixed(1)} ms + hash ${r.hash.ms.toFixed(1)} ms (${r.hash.n} slices, worst ${r.hash.worst.toFixed(1)}) + store slices ${r.sync.ms.toFixed(1)} ms (${r.sync.n}, worst ${r.sync.max.toFixed(1)}) -> worst slice ${worst.toFixed(1)} ms, ${perFrame.toFixed(2)} ms/frame mean; slowest frame ${r.maxFrame.toFixed(1)} ms (idle median ${r.medFrame.toFixed(1)})`);
    }
    await ctx.close();
  }
  const bad = rows.filter(r => r.worst > BUDGET || r.perFrame > BUDGET);
  if (bad.length) fail = "over the " + BUDGET + " ms budget: " + bad.map(r => r.name + "#" + (r.i + 1) + " worst slice " + r.worst.toFixed(1) + " ms").join(", ");
  if (errors.length) fail = (fail ? fail + "\n" : "") + "console errors:\n" + errors.join("\n");
} catch (e) { fail = e.message; }
finally { await browser.close(); }
if (fail) { console.error("FAIL " + fail); process.exit(1); }
console.log("perf_save passed: every save's worst slice and mean per frame under " + BUDGET + " ms (" + ((Date.now() - T0) / 1000).toFixed(1) + " s)");
