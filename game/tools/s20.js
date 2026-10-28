// 6.20 UX stability checks, shared by tools/ui_smoke.js (the check) and tools/ui_shots20.js (the screenshots). Each function drives the page like a player and asserts.
//   1 pointers   an on-screen target has an in-place marker and NO edge pointer; an edge pointer does not move; no flip-flop on the border
//   2 boxselect  box-select around (and only touching) every drawn slime selects it, on flat ground, a hill, a slope, mid-hop; a group box selects the group
//   3 gauge      the depth gauge never moves or resizes (selection, inspector, levels, village panel)
//   4 inspector  the top sections of the slime inspector keep their tops and heights while the slime works
//   5 hints      a brand-new browser profile with NO url params, through Menu > New game, shows a visible hint caption above the HUD
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const fixtureJSON = (name) => readFileSync(join(root, "tests", "fixtures", name + ".json"), "utf8");
const loadFx = async (page, G, name) => {
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), fixtureJSON(name));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(600);
  await G(() => { const g = __game; g.state.paused = true; g.ui.follow = 0; g.clearSelection(); g.setMode("select"); g.ui.digest = null; g.sim.board.fc = 0; g.setLevel(g.D - 1); g.renderer.peek = null; });
};

/** 1. off-screen markers */
export async function pointers(page, { G, ok, shot }) {
  await loadFx(page, G, "mine");
  const cave = await G(() => {
    const g = __game, w = g.sim.world, cv = w.geo.caves[0], W = w.constructor, f = cv.floor.find(i => w.isWalkable(...W.xyz(i))), [x, y, z] = W.xyz(f);
    const fake = [{ k: "underground", level: 3, sev: 3, text: "Cave test", loc: { x, y, z }, icon: "underground", adv: "" }];
    Object.defineProperty(g.ui, "concerns", { get() { return fake; }, set() {}, configurable: true });
    g.cam.zoom = 22; return { x, y, z };
  });
  const look = (dx, dy) => G(([c, dx, dy]) => { const g = __game; g.cam.x = c.x + 0.5 + dx; g.cam.y = c.y + 0.5 + dy; g.ui.follow = 0; }, [cave, dx, dy]);
  const sample = async (n) => { const out = []; for (let i = 0; i < n; i++) { out.push(await G(() => { const p = document.querySelector("[data-test=pointer]"), pl = (__game.ui.cplace || [])[0]; if (!p) return { none: true, on: pl && pl.on }; const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, on: pl && pl.on }; })); await page.waitForTimeout(16); } return out; };
  // the cave target at the centre of the view, and a hair either side: marker in place, no pointer, for 60 frames
  for (const [dx, dy] of [[0, 0], [0.4, 0.3], [-0.5, -0.4]]) {
    await look(dx, dy); await page.waitForTimeout(300);
    const s = await sample(60);
    assert.ok(s.every(p => p.none && p.on), "a target at the centre of the view has an in-place marker and no edge pointer (" + dx + "," + dy + ")");
  }
  await shot(page, "ui-s20-marker-inplace");
  // far off to the side: one edge pointer that does not move over 60 frames
  await look(30, 0); await page.waitForTimeout(800);
  const e1 = await sample(60), xs = e1.map(p => p.x), ys = e1.map(p => p.y);
  assert.ok(e1.every(p => !p.none && !p.on), "an off-screen target has an edge pointer");
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 1 && Math.max(...ys) - Math.min(...ys) <= 1, "the edge pointer holds still over 60 frames: x " + Math.min(...xs) + ".." + Math.max(...xs) + " y " + Math.min(...ys) + ".." + Math.max(...ys));
  await shot(page, "ui-s20-pointer-edge");
  // the border: a target a pixel or two either side of the free-area edge never flips on every frame (hysteresis)
  const flips = await G(async ([c]) => {
    const g = __game, raf = () => new Promise(r => requestAnimationFrame(() => r()));
    g.ui.sel = [g.sim.ents.ofKind("villager")[0].id]; g.ui.focus = g.ui.sel[0]; await raf(); await raf(); await raf();          // (with a selection the free area ends at the inspector)
    const f = { x1: document.getElementById("slotI").getBoundingClientRect().left - 24 }; let last = null, flips = 0;
    { const [sx0] = g.cam.toScreen(c.x + 0.5, c.y + 0.5, g.renderer.topAt(c.x, c.y) + 1); g.cam.x -= (f.x1 - 40 - sx0) / g.cam.zoom; await raf(); await raf(); }      // start well inside
    for (let i = 0; i < 40; i++) {
      const [sx0] = g.cam.toScreen(c.x + 0.5, c.y + 0.5, g.renderer.topAt(c.x, c.y) + 1), want = f.x1 + (i % 2 ? 3 : -3);
      g.cam.x -= (want - sx0) / g.cam.zoom; await new Promise(r => requestAnimationFrame(() => r()));
      const pl0 = (g.ui.cplace || [])[0], on = pl0 && pl0.on; (window.__dbg = window.__dbg || []).push([i, Math.round(pl0 ? pl0.sx : -1), Math.round(f.x1), !!on]); if (last !== null && on !== last) flips++; last = on;
    }
    g.clearSelection(); return flips;
  }, [cave]);
  assert.ok(flips <= 1, "a target jittering 6 px across the border flips at most once, not every frame: " + flips);
  await G(() => { delete __game.ui.concerns; });
  ok("off-screen markers: an on-screen cave target has an in-place marker and no edge pointer (60 frames), an edge pointer holds still, the border has hysteresis (" + flips + " flips)");
}

/** 2. box select */
export async function boxSelect(page, { G, ok, shot }) {
  await loadFx(page, G, "settled");
  // places: flat ground, a hill step, a slope (a hill with the slime on its upper cell) and a slime mid-hop
  const setup = await G(() => {
    const g = __game, S = g.sim.site, view = g.renderer.view, vs = g.sim.ents.ofKind("villager"); g.cam.zoom = 26; g.cam.x = S.x + 4; g.cam.y = S.y; g.renderer.draw(g.sim);
    const hill = []; for (let y = S.y - 14; y < S.y + 14 && hill.length < 3; y++) for (let x = S.x - 4; x < S.x + 20; x++) { const t = view.topZ(x, y, g.D - 1), s1 = view.topZ(x, y + 1, g.D - 1); if (t >= 0 && s1 >= 0 && t - s1 === 1 && g.sim.world.isWalkable(x, y, t + 1) && !hill.some(h => Math.abs(h.x - x) < 3 && Math.abs(h.y - y) < 3)) hill.push({ x, y, z: t + 1 }); }
    return { n: vs.length, hill };
  });
  const cases = [];
  const runCase = async (name, prep) => {
    const info = await G(prep);
    await page.waitForTimeout(500);                                             // the sprite glides to its cell
    const d = await G((id) => { const g = __game, q = g.renderer.drawn.find(d => d.pri === "villager" && d.e.id === id); g.state.paused = true; return q ? { l: q.l, r: q.r, t: q.t, b: q.b } : null; }, info.id);
    assert.ok(d && d.l > 300 && d.r < 960 && d.t > 80 && d.b < 640, name + ": the slime's sprite is drawn clear of the panels: " + JSON.stringify(d));
    // (1) a real mouse drag round the sprite, (2) a drag that only touches its lower-left corner
    for (const [mode, bx] of [["around", [d.l - 3, d.t - 3, d.r + 3, d.b + 3]], ["touching", [d.l - 40, d.t + (d.b - d.t) * 0.75, d.l + 3, d.b + 40]]]) {
      await G(() => __game.clearSelection());
      await page.mouse.move(bx[0], bx[1]); await page.mouse.down(); await page.mouse.move((bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2, { steps: 3 }); await page.mouse.move(bx[2], bx[3], { steps: 3 }); await page.mouse.up();
      const sel = await G(() => __game.ui.sel.slice());
      assert.ok(sel.includes(info.id), name + " (" + mode + "): the box over the drawn slime selects it: " + JSON.stringify({ sel, id: info.id, box: bx }));
      cases.push(name + "/" + mode);
    }
  };
  await runCase("flat ground", () => { const g = __game, S = g.sim.site, v = g.sim.ents.ofKind("villager")[0], z = g.renderer.view.topZ(S.x + 6, S.y, g.D - 1) + 1; (window.__park = (id, x, y, z) => { const v = g.sim.ents.get(id); g.sim.ents.move(v, x, y, z); const a = g.renderer.anim.get(id); if (a) { a.x = x; a.y = y; } g.state.paused = true; g.clearSelection(); })(v.id, S.x + 6, S.y, z); return { id: v.id }; });
  if (setup.hill.length) {
    await runCase("a hill", () => { const g = __game, h = (window.__hill = window.__hill || null), S = g.sim.site, view = g.renderer.view; let pick = null; for (let y = S.y - 14; y < S.y + 14 && !pick; y++) for (let x = S.x - 4; x < S.x + 20 && !pick; x++) { const t = view.topZ(x, y, g.D - 1), s1 = view.topZ(x, y + 1, g.D - 1); if (t >= 0 && s1 >= 0 && t - s1 === 1 && g.sim.world.isWalkable(x, y, t + 1)) pick = { x, y, z: t + 1 }; } const v = g.sim.ents.ofKind("villager")[1]; g.cam.x = pick.x + 0.5; g.cam.y = pick.y + 0.5; __park(v.id, pick.x, pick.y, pick.z); return { id: v.id }; });
    await runCase("a slope (the low cell below a step)", () => { const g = __game, S = g.sim.site, view = g.renderer.view; let pick = null; for (let y = S.y - 14; y < S.y + 14 && !pick; y++) for (let x = S.x - 4; x < S.x + 20 && !pick; x++) { const t = view.topZ(x, y, g.D - 1), s1 = view.topZ(x, y + 1, g.D - 1); if (t >= 0 && s1 >= 0 && t - s1 === 1 && g.sim.world.isWalkable(x, y + 1, s1 + 1)) pick = { x, y: y + 1, z: s1 + 1 }; } const v = g.sim.ents.ofKind("villager")[2]; g.cam.x = pick.x + 0.5; g.cam.y = pick.y - 0.5; __park(v.id, pick.x, pick.y, pick.z); return { id: v.id }; });
  }
  // mid-hop: the slime hops (its sprite rides up by the hop height); the box is made in the SAME frame from the drawn rectangle, then once more a frame later
  const hop = await G(() => new Promise((res) => {
    const g = __game, v = g.sim.ents.ofKind("villager")[3], a0 = g.renderer.anim.get(v.id), S = g.sim.site; __park(v.id, S.x + 6, S.y + 1, g.renderer.view.topZ(S.x + 6, S.y + 1, g.D - 1) + 1);
    g.cam.x = S.x + 6.5; g.cam.y = S.y + 1.5; let tries = 0, best = null, rects = 0, okAll = true;
    const tick = () => {
      const a = g.renderer.anim.get(v.id); if (a) a.mt = performance.now() + 1e9;               // "moving" for ever: it keeps hopping
      const q = g.renderer.drawn.find(d => d.pri === "villager" && d.e.id === v.id);
      if (q && q.hop > 0.02) { rects++; const got = g.villagersIn(q.l - 1, q.t - 1, q.r + 1, q.b + 1).some(e => e.id === v.id), touch = g.villagersIn(q.l - 30, q.b - 2, q.l + 1, q.b + 30).some(e => e.id === v.id); if (!got || !touch) okAll = false; best = Math.max(best || 0, q.hop); }
      if (++tries < 60 && rects < 6) requestAnimationFrame(tick); else res({ rects, okAll, best });
    };
    requestAnimationFrame(tick);
  }));
  assert.ok(hop.rects >= 3 && hop.okAll, "a slime mid-hop is selected by a box round (or touching) its drawn sprite on every hopping frame: " + JSON.stringify(hop));
  cases.push("mid-hop");
  // a group: every slime that is drawn on screen, boxed together
  await G(() => { const g = __game; for (const v of g.sim.ents.ofKind("villager")) { const a = g.renderer.anim.get(v.id); if (a) a.mt = -1e9; } g.cam.zoom = 18; g.cam.x = g.sim.site.x + 3; g.cam.y = g.sim.site.y; g.clearSelection(); });
  await page.waitForTimeout(600);
  const grp = await G(() => { const g = __game, ds = g.renderer.drawn.filter(d => d.pri === "villager" && g.renderer.isShown(d.e) && d.l > 300 && d.r < 960 && d.t > 80 && d.b < 640); return { ids: ds.map(d => d.e.id), box: [Math.min(...ds.map(d => d.l)) - 2, Math.min(...ds.map(d => d.t)) - 2, Math.max(...ds.map(d => d.r)) + 2, Math.max(...ds.map(d => d.b)) + 2] }; });
  assert.ok(grp.ids.length >= 3, "several slimes are on screen: " + grp.ids.length);
  await page.mouse.move(grp.box[0], grp.box[1]); await page.mouse.down(); await page.mouse.move((grp.box[0] + grp.box[2]) / 2, (grp.box[1] + grp.box[3]) / 2, { steps: 4 }); await page.mouse.move(grp.box[2], grp.box[3], { steps: 4 }); await page.mouse.up();
  const sel = await G(() => __game.ui.sel.slice());
  for (const id of grp.ids) assert.ok(sel.includes(id), "the group box selects every slime in it: missing " + id);
  await shot(page, "ui-s20-boxselect");
  ok("box-select picks a slime whenever its drawn sprite is boxed or touched: " + cases.join(", ") + "; a box over " + grp.ids.length + " slimes selects all of them");
  await G(() => __game.clearSelection());
}

/** 3. the depth gauge */
export async function gauge(page, { G, ok, shot }) {
  await loadFx(page, G, "mine");
  const rect = () => G(() => { const r = (s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(x => Math.round(x * 10) / 10); }; return { gauge: r("#gauge"), now: r("[data-test=gauge-now]"), rows: r("[data-test=gauge-rows]"), nrows: document.querySelectorAll("#gauge .g-row").length }; });
  const states = [
    ["surface, nothing selected", () => { const g = __game; g.clearSelection(); g.setLevel(g.D - 1); }],
    ["a slime selected (inspector open)", () => { const g = __game; g.selectOnly(g.sim.ents.ofKind("villager")[0].id); }],
    ["village panel with a keep editor open", () => { const g = __game; g.ui.editKeep = "berries"; }],
    ["camp level", () => { const g = __game; g.ui.editKeep = null; g.setLevel(g.sim.stock.z); }],
    ["3 below ground", () => { const g = __game; g.setLevel(g.sim.stock.z - 3); }],
    ["6 below ground, inspector with a room selected", () => { const g = __game; g.clearSelection(); g.selectOther({ kind: "stock" }); g.setLevel(g.sim.stock.z - 6); }],
    ["Book open", () => { const g = __game; g.openBook("story"); }],
    ["the deepest level", () => { const g = __game; g.closeBook(); g.setLevel(1); }],
  ];
  let first = null; const seen = [];
  for (const [name, f] of states) {
    await G(f); await page.waitForTimeout(450);
    const r = await rect(); seen.push([name, await G(() => __game.levelLabel())]);
    if (name === "Book open") { await G(() => __game.closeBook()); await page.waitForTimeout(200); }
    assert.ok(r.gauge && r.now && r.rows, name + ": the gauge is on screen");
    if (!first) first = r;
    assert.deepEqual([r.gauge, r.now, r.rows, r.nrows], [first.gauge, first.now, first.rows, first.nrows], name + ": the gauge has not moved or changed size");
  }
  const g = first.gauge;
  assert.ok(g[0] + g[2] > 700 && g[1] + g[3] > 600 && g[1] + g[3] <= 720 - 4, "the gauge sits in the bottom-right of the map area: " + JSON.stringify(g));
  assert.equal(first.nrows, 9, "the gauge shows a fixed window of 9 levels");
  await G(() => { const g = __game; g.selectOnly(g.sim.ents.ofKind("villager")[0].id); g.setLevel(g.sim.stock.z - 3); });
  await page.waitForTimeout(500); await shot(page, "ui-s20-gauge");
  ok("depth gauge: one fixed place (" + g.map(Math.round) + ") and size over 8 panel/level states (" + seen.map(s => s[1]).join(" | ") + "), 9 rows always");
  await G(() => { const g = __game; g.clearSelection(); g.setLevel(g.D - 1); });
}

/** 4. the slime inspector */
export async function inspector(page, { G, ok, shot }) {
  await loadFx(page, G, "settled");
  const pick = await G(() => { const g = __game, vs = g.sim.ents.ofKind("villager"), v = vs.find(q => q.job && q.job.k !== "sleep") || vs[0]; g.selectOnly(v.id); g.state.paused = false; g.setSpeed(5); return { id: v.id, job: v.job && v.job.k }; });
  await page.waitForTimeout(500);
  const SECS = 6, jobs = new Set(), base = [];
  const read = () => G(() => { const root = document.querySelector("[data-test=inspector]"); const q = [...root.querySelectorAll("[data-sec]")].slice(0, 7).map(e => { const b = e.getBoundingClientRect(); return [e.dataset.sec, Math.round(b.top * 10) / 10, Math.round(b.height * 10) / 10]; }); const v = __game.sim.ents.get(__game.ui.focus), card = root.getBoundingClientRect(); return { q, card: [card.top, card.height], job: v && v.job ? v.job.k : "-", why: (document.querySelector("[data-test=job-label]") || {}).textContent }; });
  // 20 s of play at 5x (about 100 s of game time), a sample every 250 ms
  const t0 = Date.now(); let n = 0, jobsChanged = 0, lastJob = null;
  while (Date.now() - t0 < 20000) {
    const r = await read(); n++;
    jobs.add(r.job + "/" + r.why); if (lastJob !== null && r.job !== lastJob) jobsChanged++; lastJob = r.job;
    if (!base.length) base.push(r);
    assert.equal(r.q.length >= 6 ? 6 : r.q.length, 6, "the first six sections exist: " + JSON.stringify(r.q));
    assert.deepEqual(r.q.slice(0, 6), base[0].q.slice(0, 6), "the inspector's top sections keep their tops and heights (sample " + n + ", job " + r.job + ")");
    assert.deepEqual(r.card, base[0].card, "the inspector card keeps its place and size");
    await page.waitForTimeout(250);
  }
  assert.ok(n >= 70, "enough samples were taken: " + n);
  await G(() => { __game.state.paused = true; });
  // the "Passed over" row shows at most two chips and a +N chip, and the Why? disclosure opens inside its own box
  ok("inspector: the top 6 sections kept their tops and heights over " + n + " samples (20 s at 5x), the slime did " + jobs.size + " different thing(s) [" + [...jobs].slice(0, 4).join(", ") + "]");
  // three refreshes side by side for the screenshot
  for (let i = 1; i <= 3; i++) { await G(() => { __game.state.paused = false; __game.setSpeed(5); }); await page.waitForTimeout(1300); await G(() => { __game.state.paused = true; }); await page.waitForTimeout(350); await shot(page, "ui-s20-inspector-" + i); }
  await G(() => { __game.clearSelection(); });
}

/** 5. hints: a brand-new profile (no params at all), the real user path */
const pngPixel = (page, buf, x, y) => page.evaluate(async ([b64, x, y]) => {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([u], { type: "image/png" })), c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  const k = c.getContext("2d"); k.drawImage(bmp, 0, 0); return Array.from(k.getImageData(x, y, 1, 1).data);
}, [buf.toString("base64"), x, y]);
export async function hints(browser, { ok, shot }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
  try {
    await page.goto(pathToFileURL(join(root, "slime-civ.html")).href);                 // NO ?tools, ?tips, ?seed: exactly what the player opens
    await page.waitForFunction(() => window.__game);
    const probe = () => page.evaluate(() => { const g = __game, c = document.querySelector("[data-test=guide-caption]"), r = c.getBoundingClientRect(), cs = getComputedStyle(c), gs = getComputedStyle(document.getElementById("guide")); return { id: g.guide.cur && g.guide.cur.id, text: c.textContent, vis: cs.display !== "none" && gs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.9, rect: [r.left, r.top, r.width, r.height], bg: cs.backgroundColor, urgent: (g.ui.concerns || []).filter(c => c.sev >= 3).length, hand: document.querySelector("[data-test=guide-hand]").getBoundingClientRect().width > 0 }; });
    const check = async (label, shotName) => {
      let r = null; for (let i = 0; i < 24; i++) { r = await probe(); if (r.vis && r.id) break; await page.waitForTimeout(500); }
      assert.ok(r.vis && r.id, label + ": a hint caption is showing (" + JSON.stringify(r) + ")");
      assert.ok(r.rect[0] >= 0 && r.rect[1] >= 40 && r.rect[0] + r.rect[2] <= 1280 && r.rect[1] + r.rect[3] <= 720 && r.rect[2] > 40, label + ": the caption is inside the window: " + r.rect);
      assert.ok(r.hand, label + ": the ghost hand is showing");
      await page.evaluate(() => { __game.state.paused = true; }); await page.waitForTimeout(300); r = await probe();      // (held still so the pixels can be read where the caption is)
      const top = await page.evaluate(([x, y]) => { const e = document.elementsFromPoint(x, y); return e.map(q => q.id || q.className).slice(0, 4).join(">"); }, [r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2]);
      await page.waitForTimeout(250);
      const buf = await page.screenshot(); await shot(page, shotName);
      const px = await pngPixel(page, buf, Math.round(r.rect[0] + 12), Math.round(r.rect[1] + r.rect[3] / 2)), want = r.bg.match(/\d+/g).map(Number);
      assert.ok(Math.abs(px[0] - want[0]) < 14 && Math.abs(px[1] - want[1]) < 14 && Math.abs(px[2] - want[2]) < 14, label + ": the caption's own pixels are on screen (not covered): got " + px + " want " + want + " over " + top);
      return r;
    };
    const a = await check("fresh page", "ui-s20-hint-fresh");
    // Menu > New game (random seed), as a player does it
    await page.locator("[data-test=menu]").click(); await page.waitForTimeout(250); await page.locator('[data-m="new"]').click(); await page.waitForTimeout(500);
    const b = await check("after Menu > New game", "ui-s20-hint-newgame");
    // "Replay tips": the Settings button and the Keys page button re-arm every hint
    await page.evaluate(() => { __game.ui.help = true; }); await page.waitForTimeout(300);
    await page.locator("[data-test=replay-tips]").click(); await page.waitForTimeout(300);
    const shown = await page.evaluate(() => JSON.stringify(__game.guide.shown));
    assert.equal(shown, "{}", "Replay tips clears what was seen");
    ok("hints: a brand-new profile (no URL params) shows \"" + a.text + "\" with a ghost hand " + (a.urgent ? "while " + a.urgent + " urgent concern(s) are up " : "") + "and after Menu > New game shows \"" + b.text + "\"; Replay tips works");
  } finally { await ctx.close(); }
}

/** The build stamp: only in Menu > About this world (next to the seed), matching window.__BUILD; nothing permanent on screen */
export async function buildStamp(page, { G, ok }) {
  const b = await G(() => window.__BUILD);
  assert.ok(b && b.stage && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(b.time) && b.commit, "the build injected window.__BUILD: " + JSON.stringify(b));
  assert.equal(await G(() => !!document.getElementById("build")), false, "no permanent stamp on screen");
  const want = "v" + b.stage + " \u00b7 " + b.commit + (b.dirty ? "+" : "") + " \u00b7 " + b.time.slice(5);
  await page.locator("[data-test=menu]").click(); await page.waitForTimeout(250);
  const about = await G(() => document.querySelector("[data-test=about-world]").innerText + " " + document.querySelector("[data-test=about-build]").innerText), tip = await G(() => document.querySelector("[data-test=about-build]").dataset.tip);
  const spill = await G(() => { const m = document.querySelector("[data-test=menu-pop]").getBoundingClientRect(); return [...document.querySelectorAll("[data-test=menu-pop] *")].filter(e => e.offsetParent && e.getBoundingClientRect().right > m.right + 0.5).map(e => (e.className || e.tagName) + ":" + (e.textContent || "").slice(0, 30)); });
  assert.deepEqual(spill, [], "nothing in the Menu runs past its edge");
  await page.locator("[data-test=menu]").click();
  assert.ok(about.includes(want) && /seed\s+\d+/i.test(about), "Menu > About this world shows the seed and \"" + want + "\": " + about);
  assert.ok(tip.includes(b.time), "hovering it shows the full build time: " + tip);
  ok("build stamp \"" + want + "\" is in Menu > About this world next to the seed (hover: full time), and nowhere else");
}
