// Browser check for 8.25: autosave into the chunked store (IndexedDB, then the localStorage fallback), a page reload, and Continue from the Menu.
//   node tools/build.js && node tools/ui_smoke_save.js        (about 25 s; one Chromium, closed in `finally`)
// Also measures whether IndexedDB works on file:// in this Chromium, the bytes an autosave writes (first vs incremental), and that a flat-JSON save left by an
// older build still loads and is replaced on the first autosave of its slot.
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = pathToFileURL(join(root, "slime-civ.html")).href + "?seed=1&debug=1";
const errors = [], T0 = Date.now();
let fail = "";
const must = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const open = async (ctx, init) => {
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/GL Driver Message/.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  if (init) await page.addInitScript(init);
  await page.goto(URL_);
  await page.waitForFunction(() => window.__game && window.__game.sim.tick > 0 && window.__saves, null, { timeout: 15000 });
  await page.evaluate(() => window.__saves.storeReady);
  return page;
};
// Make the next frame's autosave due, then wait for it to land. -> the store's stats for that save.
const autosave = async (page) => {
  await page.evaluate(() => { const g = window.__game; g.sim.tick += 12000; g.lastAutoDay = Math.floor(g.sim.tick / 12000) - 1; g.lastAutoMs = 0; g.autoBusy = false; window.__n = (window.__saves.storeInfo().stats || {}).gen || 0; window.__seen = false; });
  await page.waitForFunction(() => { const i = window.__saves.storeInfo(); if (i.busy) window.__seen = true; return i.stats && !i.busy && !window.__game.autoBusy && (i.stats.slot + "/" + i.stats.gen) !== window.__last; }, null, { timeout: 20000 });
  return page.evaluate(() => { const i = window.__saves.storeInfo(); window.__last = i.stats.slot + "/" + i.stats.gen; return { ...i.stats, sawChip: window.__seen }; });
};
const continueFromMenu = async (page, slot) => {
  await page.click(".tb-game");
  await page.waitForSelector(`[data-auto="${slot}"]`, { timeout: 5000 });
  const label = await page.textContent(`[data-auto="${slot}"]`);
  await page.click(`[data-auto="${slot}"]`);
  await page.waitForFunction(() => /Loaded the autosave/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  return label;
};
try {
  // ---- 1. IndexedDB (the default) ----
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let page = await open(ctx);
  const info = await page.evaluate(() => ({ backend: window.__saves.storeInfo().backend, hasIdb: typeof indexedDB !== "undefined" }));
  console.log("IndexedDB on file://: indexedDB " + (info.hasIdb ? "present" : "missing") + ", store backend = " + info.backend);
  must(info.backend === "IndexedDB", "IndexedDB did not open on file:// (backend " + info.backend + ")");
  // a flat-JSON save from an older build, in the ring slot auto.1
  await page.evaluate(() => { const g = window.__game, j = window.__saves.flatJson(g); localStorage.setItem("slimeciv.auto.1", j); localStorage.setItem("slimeciv.auto.1.meta", JSON.stringify({ tick: g.sim.tick - 1, seed: g.sim.seed, day: 0, pop: 5, kb: Math.round(j.length / 1024), iron: 0 })); });
  const s1 = await autosave(page);
  console.log("autosave 1: slot " + s1.slot + ", wrote " + s1.wrote + " of " + (s1.wrote + s1.reused) + " records, " + s1.bytes + " B (store holds " + s1.total + " B), " + s1.ms + " ms, chip seen " + s1.sawChip);
  must(s1.slot === "auto.0", "an empty ring slot goes first, got " + s1.slot);
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 400; i++) g.sim.step(); });
  const s2 = await autosave(page);
  console.log("autosave 2: slot " + s2.slot + ", wrote " + s2.wrote + " of " + (s2.wrote + s2.reused) + " records, " + s2.bytes + " B, " + s2.ms + " ms");
  must(s2.slot === "auto.2" && s2.reused > 0 && s2.wrote < s1.wrote + s1.reused, "the second autosave goes to the next empty slot and reuses records (" + s2.slot + ")");
  const s3 = await autosave(page);
  must(s3.slot === "auto.1", "the flat-era slot is then the oldest, so it is written next, got " + s3.slot);
  const s4 = await autosave(page);                               // the ring comes round: auto.0 gets its second generation
  must(s4.slot === "auto.0" && s4.gen === 2, "the ring comes round to auto.0, gen 2 (got " + s4.slot + " gen " + s4.gen + ")");
  must(await page.evaluate(() => localStorage.getItem("slimeciv.auto.1") === null), "writing a slot replaces its flat-JSON save");
  const tick = await page.evaluate(() => window.__saves.slotList().filter(s => s.slot === "auto.1")[0].tick);
  console.log("ring written in order auto.0, auto.2, auto.1 (the flat-era slot, replaced by a package)");
  // ---- 2. reload, then Continue ----
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.sim.tick > 0 && window.__saves, null, { timeout: 15000 });
  await page.evaluate(() => window.__saves.storeReady);
  const before = await page.evaluate(() => window.__game.sim.tick);
  const label = await continueFromMenu(page, "auto.1");
  await page.waitForFunction((t) => window.__game.sim.tick === t, tick, { timeout: 10000 });
  console.log("reload + Continue (IndexedDB): '" + label.trim() + "' -> tick " + before + " became " + tick + "; size shown: " + /KB|MB/.test(label));
  must(/KB|MB/.test(label), "the Menu shows the slot's size");

  // ---- 2b. the save browser (8.27): every slot from the manifests, a preview, export, recovery from a damaged newest generation, delete ----
  await page.click(".tb-game"); await page.click('[data-m="saves"]');
  await page.waitForSelector('[data-test="saves"] [data-test="save-row"]', { timeout: 5000 });
  const rows = await page.$$eval('[data-test="save-row"]', (rs) => rs.map(r => ({ slot: r.dataset.slot, text: r.innerText.replace(/\s+/g, " "), cells: r.querySelectorAll("[data-test=save-preview] rect").length })));
  console.log("save browser: " + rows.map(r => r.slot + " [" + r.text + "] " + r.cells + " chunks").join(" | "));
  must(rows.length === 3, "three slots listed, got " + rows.length);
  must(rows.every(r => /KB|MB/.test(r.text) && /D\d+/.test(r.text) && r.cells > 2), "each row shows a size, a date and a preview");
  must(rows.every(r => /\d+ (now|min|h)/.test(r.text) || /now|min/.test(r.text)), "each row shows when it was written");
  await page.screenshot({ path: join(root, "tmp", "saves_browser.png") });
  const dl = page.waitForEvent("download", { timeout: 15000 });
  await page.click('[data-slot="auto.1"] [data-test="save-export"]');
  const file = await dl;
  must(/\.slime$/.test(file.suggestedFilename()), "export downloads a .slime file (" + file.suggestedFilename() + ")");
  console.log("export: " + file.suggestedFilename());
  // damage the newest generation of auto.0 and load it: the previous generation comes back, with a short toast
  const dmg = await page.evaluate(async () => {
    const st = window.__saves.getStore(), man = st.cache.get("auto.0"), key = Object.keys(man.rs).find(k => !man.prev.rs[k]);
    await st.primary.put(key, new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]));
    return { key, prevTick: man.prev.m.tick, tick: man.m.tick };
  });
  await page.click('[data-slot="auto.0"] [data-test="save-load"]');
  await page.waitForFunction((t) => window.__game.sim.tick === t, dmg.prevTick, { timeout: 15000 });
  const toast = await page.evaluate(() => document.body.innerText.match(/Newest save damaged[^\n]*/));
  must(toast, "a short toast says the newest save was damaged");
  console.log("recovery: damaged " + dmg.key + "; loaded tick " + dmg.prevTick + " instead of " + dmg.tick + "; toast '" + toast[0] + "'");
  // delete (two clicks) takes the row away
  await page.click(".tb-game"); await page.click('[data-m="saves"]');
  await page.waitForSelector('[data-slot="auto.2"] [data-test="save-delete"]');
  await page.click('[data-slot="auto.2"] [data-test="save-delete"]');
  await page.waitForFunction(() => /Sure\?/.test(document.querySelector('[data-slot="auto.2"] [data-test="save-delete"]').textContent), null, { timeout: 3000 }).catch(() => { throw new Error("the first Delete click asks 'Sure?'"); });
  await page.click('[data-slot="auto.2"] [data-test="save-delete"]');
  await page.waitForFunction(() => !document.querySelector('[data-slot="auto.2"]'), null, { timeout: 5000 });
  must(await page.evaluate(() => window.__saves.browserSlots().length === 2), "the slot is gone from the list");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("savesOverlay")).display === "none", null, { timeout: 3000 }).catch(() => { throw new Error("Esc closes the save browser"); });
  await ctx.close();

  // ---- 3. IndexedDB blocked: the localStorage fallback ----
  ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await open(ctx, () => { Object.defineProperty(window, "indexedDB", { get() { throw new Error("SecurityError: blocked"); } }); });
  const fb = await page.evaluate(() => window.__saves.storeInfo().backend);
  must(fb === "localStorage", "fallback backend, got " + fb);
  const f1 = await autosave(page);
  console.log("fallback: backend " + fb + ", autosave wrote " + f1.wrote + " records, " + f1.bytes + " B");
  const ftick = await page.evaluate(() => window.__saves.slotList()[0].tick);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.sim.tick > 0 && window.__saves, null, { timeout: 15000 });
  await page.evaluate(() => window.__saves.storeReady);
  await continueFromMenu(page, "auto.0");
  await page.waitForFunction((t) => window.__game.sim.tick === t, ftick, { timeout: 10000 });
  console.log("reload + Continue (localStorage fallback): tick " + ftick + " restored");
  await ctx.close();
} catch (e) { fail = e.message; }
finally { await browser.close(); }
if (errors.length) fail = (fail ? fail + "\n" : "") + "console errors:\n" + errors.join("\n");
if (fail) { console.error("FAIL " + fail); process.exit(1); }
console.log("ui_smoke_save passed (" + ((Date.now() - T0) / 1000).toFixed(1) + " s)");
