// Phase 7 smoke (7.20 cores, 7.21 dungeons, 7.22 monsters, 7.23 delving and the core itself): a small separate script so tools/ui_smoke.js stays under its five minutes. It loads fixtures straight into the built page,
// one headless Chromium at a time, closed in `finally`. Run it AFTER ui_smoke, never beside it:
//   node tools/build.js && node tools/ui_smoke.js && node tools/ui_smoke_p7.js
//   * 7.20: the camp's core under a spire, its mana band on the map and the danger pip (tools/core720.js, moved here from ui_smoke)
//   * 7.21: the `trap` fixture (two villagers in a labyrinth beside hidden traps): a villager spots one, the glyph and its one-word label are on the map and the cell card, a right-click on
//     it offers Disarm and the order is given; the labyrinth is drawn in the angled view, in first person (stonework and the trap mark) and on the flat canvas fallback (screenshots in tmp/)
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import * as C720 from "./core720.js";
import { loadFixture } from "../tests/fixture.js";
import { dungeonAt, trapList } from "../src/sim/dungeon.js";
import { feel } from "../src/sim/memory.js";
import { toJSON } from "../src/sim/save.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "tmp"), { recursive: true });
const shot = (page, name) => page.screenshot({ path: join(root, "tmp", name + ".png") });
const errors = [];
let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);

// where the fixture's villager A and its dart plate are (found with the same rule as the test)
const f = loadFixture("trap");
const vs = f.ents.ofKind("villager").filter(v => v.z <= 14).slice(0, 2);
const dun = dungeonAt(f.def, vs[0].x, vs[0].y);
const plate = trapList(dun).find(t => t.z === vs[0].z && Math.abs(t.x - vs[0].x) + Math.abs(t.y - vs[0].y) === 2 && (t.x === vs[0].x || t.y === vs[0].y));
assert.ok(plate && plate.k === "dart", "the fixture's dart plate");
const A = { id: vs[0].id, x: vs[0].x, y: vs[0].y, z: vs[0].z };
const dungeonBox = { x0: dun.x0, y0: dun.y0, x1: dun.x0 + dun.W - 1, y1: dun.y0 + dun.H - 1, s: dun.s };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const mk = async (query) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/GL Driver Message/.test(m.text())) errors.push(m.type() + ": " + m.text()); });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + query);
    await page.waitForFunction(() => window.__game);
    return page;
  };

  // ---- 7.20: the camp's core ----
  {
    const page = await mk("?tools=all&seed=1&spawn=64,64&debug=1");
    await C720.cores(page, { G: (fn, arg) => page.evaluate(fn, arg), ok, shot });
    await page.close();
  }

  // ---- 7.21: the labyrinth ----
  const page = await mk("?tools=all&seed=1&debug=1");
  const G = (fn, arg) => page.evaluate(fn, arg);
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "trap.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(800);
  assert.equal(await G(() => __game.sim.tick), 36000); ok("the trap fixture loaded: two villagers in a labyrinth");
  // everybody pinned and fed; the labyrinth is hidden: nothing marked, the cell card is plain
  const pin = () => G((a) => { const g = __game, s = g.sim; g.state.paused = true; g.ui.follow = 0; for (const v of s.ents.ofKind("villager")) { v.hunger = v.thirst = v.energy = 1; v.hp = 100; v.fear = 0; if (v.id !== a.moveId) { v.job = null; v.order = null; v.action = { type: "Idle", wait: 5, blocker: null }; } } }, { moveId: 0 });
  await pin();
  assert.equal(await G(() => __game.sim.trp.seen.length), 0, "nothing is marked yet");
  // a villager standing two cells from the plate spots it (the sim runs in the page)
  const spotted = await G((p) => {
    const g = __game, s = g.sim;
    for (let t = 0; t < 3000; t++) {
      for (const v of s.ents.ofKind("villager")) { v.job = null; v.order = null; v.action = { type: "Idle", wait: 5, blocker: null }; v.hunger = v.thirst = v.energy = 1; v.hp = 100; v.fear = 0; }
      s.step();
      if (s.trp.seen.length && s.trp.seen.includes(__game.sim.world.constructor.idx(p.x, p.y, p.z))) return t;
    }
    return -1;
  }, plate);
  assert.ok(spotted >= 0, "the plate is spotted within 3000 ticks"); ok("a villager standing two cells away spotted the dart plate after " + spotted + " ticks");
  // mark the labyrinth seen for the pictures (test setup, as core720 does for the spire): every cell round the plate, on the levels of the dungeon
  await G((b) => {
    const g = __game, cell = (x, y, z) => { const k = ((x >> 4) + 32768) * 65536 + ((y >> 4) + 32768); let a = g.sim.seen.b.get(k); if (!a) { a = new Uint8Array(16 * 16 * 24); g.sim.seen.b.set(k, a); } a[(z << 8) | ((y & 15) << 4) | (x & 15)] = 1; };
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) for (let z = b.s[0] - 1; z <= b.s[b.s.length - 1] + 3; z++) cell(x, y, z);
    g.sim.seen.ver++;
  }, dungeonBox);
  // the angled map at the dungeon level, camera on the plate
  await G((p) => { const g = __game; g.clearSelection(); g.setMode("select"); g.renderer.setZ(p.z + 1); g.cam.zoom = 26; g.cam.x = p.x + 0.5; g.cam.y = p.y + 0.5; g.selectOther({ kind: "cell", x: p.x, y: p.y, z: p.z - 1 }); }, plate);
  await page.waitForTimeout(1500);
  const card = await page.locator("body").innerText();
  assert.ok(/Trap: Darts, spotted\./.test(card), "the cell card names the spotted trap in a word or two"); ok("the cell card over the plate reads \"Trap: Darts, spotted.\"");
  assert.equal(await G(() => __game.cam.oblique), true);
  await shot(page, "ui-721-dungeon-slice");
  await G(() => { const g = __game; g.clearSelection(); g.cam.zoom = 11; }); await page.waitForTimeout(900);
  await shot(page, "ui-721-dungeon-overview");
  await G((p) => { const g = __game; g.cam.zoom = 26; g.cam.x = p.x + 0.5; g.cam.y = p.y + 0.5; }, plate); await page.waitForTimeout(500);
  // the right-click on the marked plate with the villager selected: Disarm is the order
  await G((a) => { const g = __game; g.selectOnly(a.id, false); }, A);
  await page.waitForTimeout(300);
  const px = await G((p) => { const g = __game, [sx, sy] = g.cam.toScreen(p.x + 0.5, p.y + 0.5, p.z); return [Math.round(sx), Math.round(sy)]; }, plate);
  await page.mouse.click(px[0], px[1], { button: "right" }); await page.waitForTimeout(400);
  let verb = await G((a) => { const v = __game.sim.ents.get(a.id); return v.order ? v.order.verb : ""; }, A);
  if (verb !== "disarm") {                                           // a menu opened (several verbs fit): pick Disarm from it
    const b = page.locator(".ctxmenu button", { hasText: "Disarm" });
    assert.ok(await b.count() === 1, "the context menu offers Disarm over a spotted trap");
    await b.click(); await page.waitForTimeout(300);
    verb = await G((a) => { const v = __game.sim.ents.get(a.id); return v.order ? v.order.verb : ""; }, A);
  }
  assert.equal(verb, "disarm", "right-clicking the spotted trap gives the disarm order"); ok("right-click on the marked plate -> Disarm order given to the selected villager");
  // first person: possess, look down the corridor at the plate
  await G((a) => { const g = __game, s = g.sim, v = s.ents.get(a.id); v.order = null; v.job = null; v.action = null; const bx = v.x + Math.sign(v.x - a.px), by = v.y + Math.sign(v.y - a.py); if (s.world.isWalkable(bx, by, v.z)) s.ents.add("furniture", { f: "torch", x: bx, y: by, z: v.z, owner: 0, rv: 0, rt: 0 }); s.cache.iv++; g.selectOnly(v.id, true); g.possess(v.id); if (!g.fpv.on) g.fpvToggle(); const dx = Math.sign(a.px - v.x), dy = Math.sign(a.py - v.y); g.fpv.yaw = Math.atan2(dy, dx); g.fpv.pitch = -0.12; g.fpv.pos = null; for (let i = 0; i < 4; i++) s.step(); }, { id: A.id, px: plate.x, py: plate.y });
  await page.waitForTimeout(1200);
  await G(() => { __game.fpv.sample(9); }); await page.waitForFunction(() => __game.fpv.sampled, null, { timeout: 8000 });
  const sm = await G(() => __game.fpv.sampled), colours = new Set(sm.px.map(p => p.join())).size;
  assert.ok(colours >= 6, "first person draws the labyrinth: " + colours + " colours"); ok("first person looks down a corridor of ancient stonework at the marked plate (" + colours + " colours)");
  await shot(page, "ui-721-dungeon-fpv");
  await page.close();

  // ---- the flat canvas fallback ----
  {
    const fp = await mk("?tools=all&seed=1&debug=1&flat=1");
    await fp.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "trap.json"), "utf8"));
    await fp.keyboard.press("Shift+O"); await fp.waitForTimeout(800);
    const GF = (fn, arg) => fp.evaluate(fn, arg);
    await GF((a) => {
      const g = __game, s = g.sim; g.state.paused = true;
      for (const v of s.ents.ofKind("villager")) { v.hunger = v.thirst = v.energy = 1; }
      const pid = s.world.constructor.idx(a.x, a.y, a.z);
      for (let t = 0; t < 3000 && !s.trp.seen.includes(pid); t++) { for (const v of s.ents.ofKind("villager")) { v.job = null; v.order = null; v.action = { type: "Idle", wait: 5, blocker: null }; } s.step(); }
      const cell = (x, y, z) => { const k = ((x >> 4) + 32768) * 65536 + ((y >> 4) + 32768); let b = s.seen.b.get(k); if (!b) { b = new Uint8Array(16 * 16 * 24); s.seen.b.set(k, b); } b[(z << 8) | ((y & 15) << 4) | (x & 15)] = 1; };
      for (let y = a.y - 14; y <= a.y + 14; y++) for (let x = a.x - 14; x <= a.x + 14; x++) for (let z = a.z - 2; z <= a.z + 3; z++) cell(x, y, z);
      s.seen.ver++; g.clearSelection(); g.renderer.setZ(a.z + 1); g.cam.zoom = 28; g.cam.x = a.x + 0.5; g.cam.y = a.y + 0.5;
    }, plate);
    assert.equal(await GF(() => __game.cam.oblique), false, "the flat fallback is on"); assert.ok(await GF(() => __game.sim.trp.seen.length > 0));
    await fp.waitForTimeout(1000);
    await shot(fp, "ui-721-dungeon-flat");
    // the plate's glyph is drawn: warning orange-red pixels near the cell centre
    const c = await GF((p) => { const g = __game, [sx, sy] = g.cam.toScreen(p.x + 0.5, p.y + 0.5, p.z); return [Math.round(sx), Math.round(sy)]; }, plate);
    const px = await GF((c) => { let hot = 0; for (let dy = -12; dy <= 12; dy += 2) for (let dx = -12; dx <= 12; dx += 2) { const p = __game.mapPixel(c[0] + dx, c[1] + dy); if (p[0] > 200 && p[1] > 90 && p[1] < 160 && p[2] < 110) hot++; } return hot; }, c);
    assert.ok(px >= 8, "the flat view draws the trap glyph (orange pixels: " + px + ")"); ok("canvas2D fallback draws the warning glyph over the plate (" + px + " px)");
    await fp.close();
  }

  // ---- 7.22: monsters on the camp's doorstep: map billboards, a hit and its feedback, the Concern, first person, the flat fallback ----
  {
    const mp = await mk("?tools=all&seed=1&debug=1");
    const GM = (fn, arg) => mp.evaluate(fn, arg);
    await mp.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "monsters.json"), "utf8"));
    await mp.keyboard.press("Shift+O"); await mp.waitForTimeout(800);
    assert.equal(await GM(() => __game.sim.ents.ofKind("fauna").filter(e => e.mon).length > 3), true); ok("the monsters fixture loaded: a swarm and a spitter east of the camp");
    // step until somebody has just been struck, then freeze (the hit ring and number are drawn from the entity's last hit, so they hold while paused)
    const hit = await GM(() => {
      const g = __game, s = g.sim; g.state.paused = true; g.ui.follow = 0; g.clearSelection();
      for (let t = 0; t < 900; t++) { s.step(); const v = s.ents.ofKind("villager").find(q => q.ht && s.tick - q.ht < 3 && q.hd > 0); if (v) { const m = s.ents.ofKind("fauna").filter(e => e.mon).sort((a, b) => Math.abs(a.x - v.x) + Math.abs(a.y - v.y) - Math.abs(b.x - v.x) - Math.abs(b.y - v.y))[0]; return { vid: v.id, vx: v.x, vy: v.y, vz: v.z, mid: m.id, mx: m.x, my: m.y, mz: m.z, tick: s.tick }; } }
      return null;
    });
    assert.ok(hit, "a villager is struck within 900 ticks"); ok("a villager was struck at tick " + hit.tick + " (the fight is live)");
    await GM((h) => { const g = __game; g.cam.zoom = 30; g.cam.x = (h.vx + h.mx) / 2 + 0.5; g.cam.y = (h.vy + h.my) / 2 + 0.5; }, hit);
    await mp.waitForTimeout(1200);
    const txt = await mp.locator("body").innerText();
    assert.ok(/monsters? .*cells from camp|raiding the village/.test(txt), "the Concerns list names the monsters near camp"); ok("the Concerns list reads the raid (\"monsters ... cells from camp\")");
    // monsters are drawn: crawler-coloured pixels (pale chitin) near the nearest one's screen position
    const near = await GM((h) => { const g = __game, [sx, sy] = g.cam.toScreen(h.mx + 0.5, h.my + 0.5, h.mz); return [Math.round(sx), Math.round(sy)]; }, hit);
    const pale = await GM((c) => { let n = 0; for (let dy = -34; dy <= 6; dy += 2) for (let dx = -26; dx <= 26; dx += 2) { const p = __game.mapPixel(c[0] + dx, c[1] + dy); if (p[0] > 190 && p[1] > 180 && p[2] > 150 && p[2] < 215 && p[0] - p[2] > 14) n++; } return n; }, near);
    assert.ok(pale >= 6, "a crawler billboard is drawn on the angled map (pale chitin pixels: " + pale + ")"); ok("monsters render as billboards on the angled map (" + pale + " chitin pixels)");
    await shot(mp, "ui-722-monsters-map");
    // first person: guide the struck villager, face the monsters, torch-lit
    await GM((h) => {
      const g = __game, s = g.sim, v = s.ents.get(h.vid), m = s.ents.get(h.mid);
      v.order = null; v.job = null; v.action = null; v.fear = 0; g.selectOnly(v.id, true); g.possess(v.id); if (!g.fpv.on) g.fpvToggle();
      g.fpv.yaw = Math.atan2(m.y - v.y, m.x - v.x); g.fpv.pitch = -0.1; g.fpv.pos = null; for (let i = 0; i < 4; i++) s.step();
    }, hit);
    await mp.waitForTimeout(1400);
    await GM(() => { __game.fpv.sample(9); }); await mp.waitForFunction(() => __game.fpv.sampled, null, { timeout: 8000 });
    const sm = await GM(() => __game.fpv.sampled), colours = new Set(sm.px.map(p => p.join())).size;
    assert.ok(colours >= 6, "first person draws the scene: " + colours + " colours");
    const tags = await mp.locator(".fv-tag.foe").allInnerTexts();
    assert.ok(tags.some(t => /^(Crawler|Spitter): /.test(t)), "a monster is tagged in first person with its name and what it is doing: " + tags.join(" | ")); ok("first person tags the monsters (" + tags.slice(0, 2).join(", ") + ") over " + colours + " colours");
    await shot(mp, "ui-722-monsters-fpv");
    // 7.23: the two first-person fixes from this very picture: monster billboards are sized for what they are, and no empty chip sits at the foot of the screen
    await GM(() => { __game.fpv.sampled = null; __game.fpv.sample(24); }); await mp.waitForFunction(() => __game.fpv.sampled, null, { timeout: 8000 });
    const sm2 = await GM(() => __game.fpv.sampled), rows = sm2.px.length / 24, bottom = sm2.px.slice(Math.floor(rows * 2 / 3) * 24);
    const pale2 = bottom.filter(p => p[0] > 190 && p[1] > 170 && p[2] > 140 && p[0] - p[2] > 10).length;
    assert.ok(pale2 / bottom.length < 0.2, "a crawler beside the camera does not fill the bottom third of the view (pale share " + (pale2 / bottom.length).toFixed(2) + ")");
    const held = await GM(() => { const v = __game.sim.ents.ofKind("villager").find(q => q.poss), el = document.querySelector(".fv-held"); return { has: !!(v.carry || v.eq), shown: getComputedStyle(el).display !== "none" }; });
    assert.equal(held.shown, held.has, "the in-hand chip shows only when something is held (" + JSON.stringify(held) + ")");
    ok("first person: crawlers sized to their body (bottom-third pale share " + (pale2 / bottom.length).toFixed(2) + "), the in-hand chip hidden when empty-handed");
    await shot(mp, "ui-723-fpv-scale");
    await mp.close();
    // the flat canvas fallback
    const fp = await mk("?tools=all&seed=1&debug=1&flat=1");
    await fp.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "monsters.json"), "utf8"));
    await fp.keyboard.press("Shift+O"); await fp.waitForTimeout(800);
    const h2 = await fp.evaluate(() => { const g = __game, s = g.sim; g.state.paused = true; g.ui.follow = 0; g.clearSelection(); const m = s.ents.ofKind("fauna").find(e => e.sp === "crawler"); g.cam.zoom = 30; g.cam.x = m.x + 0.5; g.cam.y = m.y + 0.5; return { x: m.x, y: m.y, z: m.z }; });
    await fp.waitForTimeout(900);
    assert.equal(await fp.evaluate(() => __game.cam.oblique), false, "the flat fallback is on");
    const c2 = await fp.evaluate((p) => { const [sx, sy] = __game.cam.toScreen(p.x + 0.5, p.y + 0.5, p.z); return [Math.round(sx), Math.round(sy)]; }, h2);
    const flat = await fp.evaluate((c) => { let n = 0; for (let dy = -16; dy <= 16; dy += 2) for (let dx = -16; dx <= 16; dx += 2) { const p = __game.mapPixel(c[0] + dx, c[1] + dy); if (p[0] > 200 && p[1] > 195 && p[2] > 165 && p[2] < 200) n++; } return n; }, c2);
    assert.ok(flat >= 4, "the flat view draws the crawler (pale pixels: " + flat + ")"); ok("canvas2D fallback draws the crawlers (" + flat + " px)");
    await shot(fp, "ui-722-monsters-flat");
    await fp.close();
  }
  // ---- 7.23: the choice at the core, the delve, the explored outline ----
  {
    const cp = await mk("?tools=all&seed=1&debug=1");
    const GC = (fn, arg) => cp.evaluate(fn, arg);
    await cp.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "coreslain.json"), "utf8"));
    await cp.keyboard.press("Shift+O"); await cp.waitForTimeout(900);
    const info = await GC(() => { const g = __game, s = g.sim; g.state.paused = true; g.ui.follow = 0; const v = s.ents.ofKind("villager")[0]; g.selectOnly(v.id, true); return { key: s.cm.pend[0], shards: s.stock && 0 }; });
    assert.ok(info.key, "the coreslain fixture has the choice pending");
    await cp.waitForTimeout(700);
    const card = cp.locator("[data-test=core-choice-card]");
    assert.equal(await card.count(), 1, "the choice card is shown");
    const labels = await cp.locator("[data-test=core-harvest], [data-test=core-leave]").allInnerTexts();
    assert.deepEqual(labels.map(t => t.trim()), ["Harvest", "Leave"], "two buttons with one-word labels");
    await shot(cp, "ui-723-core-choice"); ok("the choice prompt: \"Harvest\" / \"Leave\", " + (await card.innerText()).split("\n")[0]);
    const sh0 = await GC(() => { let n = 0; for (const e of __game.sim.ents.ofKind("item")) if (e.item === "core_shard") n += e.n; return n; });
    await cp.locator("[data-test=core-harvest]").click(); await cp.waitForTimeout(600);
    const after = await GC(() => { let n = 0; for (const e of __game.sim.ents.ofKind("item")) if (e.item === "core_shard") n += e.n; return { n, gone: __game.sim.cm.gone.length, pend: __game.sim.cm.pend.length }; });
    assert.equal(await card.count(), 0, "the card goes once answered");
    assert.ok(after.gone === 1 && after.pend === 0 && after.n - sh0 === 24, "Harvest: 24 core shards, the core gone (" + JSON.stringify(after) + ")");
    ok("clicking Harvest: +" + (after.n - sh0) + " core shards, the card is gone, the ledger says gone");
    await cp.close();
    // a second page: Leave
    const lp = await mk("?tools=all&seed=1&debug=1");
    await lp.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "coreslain.json"), "utf8"));
    await lp.keyboard.press("Shift+O"); await lp.waitForTimeout(900);
    await lp.locator("[data-test=core-leave]").click(); await lp.waitForTimeout(500);
    const lv = await lp.evaluate(() => ({ left: __game.sim.cm.left.length, gone: __game.sim.cm.gone.length, cards: document.querySelectorAll("[data-test=core-choice-card]").length }));
    assert.deepEqual(lv, { left: 1, gone: 0, cards: 0 }); ok("clicking Leave: the core is kept, the card is gone");
    await lp.close();
  }
  {
    const dp = await mk("?tools=all&seed=1&debug=1");
    const GD = (fn, arg) => dp.evaluate(fn, arg);
    await dp.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "delve.json"), "utf8"));
    await dp.keyboard.press("Shift+O"); await dp.waitForTimeout(900);
    await GD(() => { const g = __game, s = g.sim; g.state.paused = true; g.ui.follow = 0; const vs = s.ents.ofKind("villager").slice(0, 3); g.clearSelection(); for (const v of vs) g.ui.sel.push(v.id); g.ui.sel.length = 3; });
    await dp.waitForTimeout(700);
    const btn = dp.locator("[data-test=delve-go]");
    assert.equal(await btn.count(), 1, "the Expedition panel offers Delve for the labyrinth they stand in");
    await btn.click(); await dp.waitForTimeout(400);
    assert.equal(await GD(() => __game.sim.exp.list.length && __game.sim.exp.list[0].kind), "delve", "the start was accepted (blocker " + await GD(() => __game.sim.lastBlocker) + ", whisper " + await GD(() => document.querySelector("#whisper") && document.querySelector("#whisper").innerText) + ")"); ok("the Delve button starts a delve expedition");
    const got = await GD(() => {                                                    // the sim runs in the page, capped
      const s = __game.sim, x = s.exp.list[0];
      for (let t = 0; t < 2500 && !(x.mapped >= 4 && x.opened >= 1); t++) s.step();
      __game.state.paused = true;
      const l = s.ents.get(x.ids[0]);
      return { mapped: x.mapped, rooms: x.rooms, opened: x.opened, disarmed: x.disarmed, lx: l.x, ly: l.y, lz: l.z };
    });
    assert.ok(got.mapped >= 4 && got.opened >= 1, "the party mapped " + got.mapped + " of " + got.rooms + " rooms and opened " + got.opened + " caches");
    await dp.waitForTimeout(800);
    assert.equal(await dp.locator("[data-test=delve-card]").count(), 1, "the delve card is on the panel");
    const ctext = await dp.locator("[data-test=delve-card]").innerText();
    assert.ok(/Delving: the .* ridge/i.test(ctext) && /\d+\/\d+\s*rooms/i.test(ctext), "the card reads the rooms mapped: " + ctext.split("\n").join(" | "));
    ok("the delve card: " + got.mapped + "/" + got.rooms + " rooms mapped, " + got.opened + " caches opened, " + got.disarmed + " traps cleared");
    // the explored outline on the angled map, at the labyrinth's level
    await GD((p) => { const g = __game; g.clearSelection(); g.setMode("select"); g.renderer.setZ(p.lz + 1); g.cam.zoom = 18; g.cam.x = p.lx + 0.5; g.cam.y = p.ly + 0.5; }, got);
    await dp.waitForTimeout(1600);
    const violet = await GD(() => { let n = 0; const W = innerWidth, H = innerHeight; for (let y = 90; y < H - 90; y += 3) for (let x = 40; x < W - 260; x += 3) { const p = __game.mapPixel(x, y); if (p[2] > 200 && p[0] > 150 && p[1] > 90 && p[1] < 190 && p[0] < 245) n++; } return n; });
    assert.ok(violet >= 25, "the explored part of the labyrinth is outlined in violet on the map (" + violet + " samples)");
    await shot(dp, "ui-723-dungeon-outline"); ok("the dungeon outline is drawn as cells are explored (" + violet + " violet samples)");
    // the minimap: the same explored cells, and a danger pip for every monster seen
    const mm = await GD(() => {
      const cv = document.querySelector("#minimap canvas"), cp = Object.assign(document.createElement("canvas"), { width: cv.width, height: cv.height }), c = cp.getContext("2d", { willReadFrequently: true }); c.drawImage(cv, 0, 0); const d = c.getImageData(0, 0, cv.width, cv.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 214 && d[i + 1] === 140 && d[i + 2] === 255) n++;
      return { violet: n, known: __game.sim.cm.known.length };
    });
    assert.ok(mm.known === 1 && mm.violet >= 6, "the minimap outlines the explored labyrinth (" + JSON.stringify(mm) + ")");
    ok("the minimap draws the explored labyrinth (" + mm.violet + " px)");
    await GD(() => {
      const s = __game.sim, L = s.ents.get(s.exp.list[0].ids[0]), sp = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]].map(d => [L.x + d[0], L.y + d[1]]).find(c => s.world.isWalkable(c[0], c[1], L.z));
      s.ents.add("fauna", { sp: "crawler", x: sp[0], y: sp[1], z: L.z, hp: 16, mhp: 16, cd: 10, st: "idle", tx: -999, ty: -999, n: 0, home: [sp[0], sp[1], L.z], ak: 0, ht: 0, hd: 0, lh: 0, rv: 0, rt: 0, bd: s.tick, tame: 0, pen: 0, mon: 1, hr: 24 });
    });
    await dp.waitForTimeout(1200);
    const pip = await GD(() => { const cv = document.querySelector("#minimap canvas"), cp = Object.assign(document.createElement("canvas"), { width: cv.width, height: cv.height }), c = cp.getContext("2d", { willReadFrequently: true }); c.drawImage(cv, 0, 0); const d = c.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] < 120 && d[i + 2] < 120 && d[i] - d[i + 1] > 100) n++; return n; });
    assert.ok(pip >= 3, "a monster in a seen cell is a red danger pip on the minimap (" + pip + " px; " + JSON.stringify(await GD(() => { const s = __game.sim, ms = s.ents.ofKind("fauna").filter(e => e.mon); return ms.map(e => [e.sp, e.x, e.y, e.z, s.seen.b.size && 1, __game.sim.world.mat(e.x, e.y, e.z - 1)]).slice(0, 3).concat([[__game.ui.mm.ox, __game.ui.mm.oy, __game.ui.mm.ps, __game.cam.x, __game.cam.y]]); })) + ")"); ok("danger pips: a seen monster is a red dot on the minimap (" + pip + " px)");
    await dp.close();
  }
  // ---- experiment: experience and memory. The `memory` fixture, a slime that has lived through a cave walk and a fight: the inspector's Memories sub shows chips and episodes ----
  {
    const sim = loadFixture("memory"), v = sim.ents.ofKind("villager").slice().sort((a, b) => a.id - b.id).find(q => q.x > 60);
    v.ps = { b: 40, c: 90, s: 70 };
    for (let i = 0; i < 4; i++) { feel(sim, v, "cave", "safe", 20); feel(sim, v, "crawler", "bad", 40); }
    feel(sim, v, "crawler", "good", 80); feel(sim, v, "gem", "good", 30); feel(sim, v, "gem", "good", 30); feel(sim, v, "cave", "good", 60);
    assert.ok(v.mem.length >= 3 && v.epi.length >= 2, "the setup gave the slime memories");
    const mp = await mk("?tools=all&seed=1&debug=1");
    await mp.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), toJSON(sim));
    await mp.keyboard.press("Shift+O"); await mp.waitForTimeout(800);
    await mp.evaluate((id) => { const g = __game; g.state.paused = true; g.selectOnly(id, false); }, v.id);
    await mp.waitForTimeout(900);
    const mem = mp.locator("[data-test=memories]");
    assert.equal(await mem.count(), 1, "the inspector has a Memories sub");
    const text = await mem.innerText();
    assert.ok(/memories/i.test(text) && /(Loves caves|Fears cave crawlers|Drawn to gems)/.test(text), "chips read like words: " + text.split("\n").join(" | "));
    assert.ok(await mem.locator(".ttl").count() <= 3, "at most three chips");
    assert.ok(text.split(/[.!?]\s/).length === 1 || !/[a-z]\. [A-Z]/.test(text), "no explanation sentences");
    await mem.evaluate((el) => el.scrollIntoView({ block: "center" })); await mp.waitForTimeout(300);
    await mp.setViewportSize({ width: 1280, height: 1100 }); await mp.waitForTimeout(700);        // (the inspector's "more" area is a small scroller at 720 high; a tall window shows the whole Memories sub for the picture)
    await mem.evaluate((el) => el.scrollIntoView({ block: "center" })); await mp.waitForTimeout(300);
    await mp.locator("[data-test=inspector]").screenshot({ path: join(root, "tmp", "ui-mem-inspector.png") });
    ok("the inspector's Memories sub: " + text.split("\n").filter(Boolean).join(" | "));
    await mp.close();
  }
} finally { await browser.close(); }
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("phase 7 smoke passed (" + n + " checks), no console errors; screenshots in game/tmp/ui-mem-inspector.png ui-720-*.png ui-721-*.png ui-722-*.png ui-723-*.png");
