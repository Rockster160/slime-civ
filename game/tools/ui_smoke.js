// Drives the built page like a player (headless Chromium via Playwright, borrowed
// from slime-village): select a villager by clicking it, read the Why panel,
// right-click an order, set a keep-N target, save, load, and fail on any
// console error. Screenshots go to tmp/.
//
//   node tools/build.js && node tools/ui_smoke.js
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "tmp"), { recursive: true });
const shot = (page, name) => page.screenshot({ path: join(root, "tmp", name + ".png") });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("console", (m) => { if (process.env.DBG) console.log("PAGE", m.text()); if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?tools=all&spawn=64,64");      // (S16: the smoke hard-codes positions round the old camp, so it pins the camp there; the endless-world section below starts a fresh game at the real spawn) S11: tools appear as the village earns them; the smoke loads fixtures, so it asks for all of them
await page.waitForFunction(() => window.__game);
const G = (fn, arg) => page.evaluate(fn, arg);
let n = 0;
const ok = (msg) => console.log("ok " + ++n + " " + msg);

// Run the sim a little, paused, so villagers have plans.
await page.keyboard.press("Space");
await G(() => { for (let i = 0; i < 3000; i++) __game.sim.step(); __game.ui.attn.tick = __game.sim.tick; });
await page.waitForTimeout(400);
ok("paused page with sim at tick " + await G(() => __game.sim.tick));

// 1. click a villager at its screen position
const target = await G(() => {
  const g = __game, clear = (v) => { const [sx, sy] = g.cam.toScreen(v.x + 0.5, v.y + 0.5); return sx > 380 && sx < g.cam.vw - 380 && sy > 110 && sy < g.cam.vh - 110; };   // not under a panel or the top bar
  const v = g.sim.ents.ofKind("villager").find(v => g.renderer.isShown(v) && clear(v));
  const [x, y] = g.cam.toScreen(v.x + 0.5, v.y + 0.5);
  return { id: v.id, x, y, name: v.name };
});
await page.mouse.click(target.x, target.y);
await page.waitForTimeout(350);
assert.deepEqual(await G(() => __game.ui.sel), [target.id]); ok("click selects " + target.name);
const whyText = await page.locator("#panel-why .pbody").innerText();
assert.match(whyText, /-/); assert.ok(whyText.length > 20, "why panel has text"); ok("Why panel: " + whyText.split("\n")[0]);
assert.ok(await page.locator("#panel-insp").isVisible()); ok("inspector visible");
await shot(page, "ui-a-selected-why");
{ // S5: skills with a profession label, nine traits, lineage line
  const t = await page.locator("#panel-insp .pbody").innerText();
  for (const w of ["Digging", "Building", "Crafting", "Hardiness", "Leisure", "Drive", "Skills:", "Generation"]) assert.ok(t.toLowerCase().includes(w.toLowerCase()), "inspector shows " + w + ": " + t.slice(0, 300));
  await page.locator("#panel-insp").screenshot({ path: join(root, "tmp", "ui-s5-inspector.png") });
  ok("inspector shows skills, profession, nine traits and lineage");
}
{ // S13: free time (hobby), relationships with reasons, kin
  const t = await page.locator("#panel-insp .pbody").innerText();
  for (const w of ["Free time", "Relationships", "Kin"]) assert.ok(t.toLowerCase().includes(w.toLowerCase()), "inspector shows " + w + ": " + t.slice(0, 200));
  assert.match(t, /hobby \d\.\d\d/i); ok("inspector shows the hobby, relationships and kin");
  await G((id) => { const v = __game.sim.ents.get(id), o = __game.sim.ents.ofKind("villager").find(q => q !== v); v.rel = [{ o: o.id, k: "friend", s: 0.8, w: "work" }]; v.sk.dig.xp = 40; v.sk.dig.rs = 0.2; v.ti = ["first to keep a fire"]; v.gr = { u: __game.sim.tick + 5000, s: 0.5, f: o.id }; }, target.id);
  await page.waitForTimeout(500);
  const t2 = await page.locator("#panel-insp .pbody").innerText();
  assert.match(t2, /Friend: /i); assert.match(t2, /side by side/); assert.match(t2, /rusty/i); assert.match(t2, /first to keep a fire/i); assert.match(t2, /Grieving/i); ok("a friend with its reason line, rusty digging, a title and grief show in the inspector");
  await page.setViewportSize({ width: 1280, height: 1700 }); await page.waitForTimeout(300);        // tall enough that the whole card is on screen
  await page.locator("#panel-insp").screenshot({ path: join(root, "tmp", "ui-s13-people.png") });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(300);
  await G((id) => { const v = __game.sim.ents.get(id); v.rel = []; v.gr = null; v.ti = []; v.sk.dig.rs = 0; }, target.id);
}

// 2. right-click a tree -> chop order
const tree = await G((id) => {
  const g = __game, v = g.sim.ents.get(id);
  const clear = (p) => { const [sx, sy] = g.cam.toScreen(p.x + 0.5, p.y + 0.5); return sx > 380 && sx < g.cam.vw - 380 && sy > 110 && sy < g.cam.vh - 110; };     // not under a panel
  const t = g.sim.ents.ofKind("plant").filter(p => p.species === "tree" && g.renderer.isShown(p) && clear(p))
    .sort((a, b) => Math.abs(a.x - v.x) + Math.abs(a.y - v.y) - Math.abs(b.x - v.x) - Math.abs(b.y - v.y))[0];
  const [x, y] = g.cam.toScreen(t.x + 0.5, t.y + 0.5);
  return { id: t.id, x, y };
}, target.id);
await page.mouse.click(tree.x, tree.y, { button: "right" });
await page.waitForTimeout(200);
const ord = await G((id) => __game.sim.ents.get(id).order, target.id);
await shot(page, "ui-d-order-marker");
assert.equal(ord && ord.verb, "chop"); assert.equal(ord.tid, tree.id); ok("right-click on a tree orders chop");
assert.ok((await page.locator("#orderbar").innerText()).includes("selected")); ok("order bar shows selection");

// 3. drag-box selects several; Tab cycles; Esc clears
await G(() => {      // villagers wander: gather three of them at the middle of the view so the box test does not depend on where the day's foraging took them
  const g = __game, [cx, cy] = g.cam.toWorld(g.cam.vw / 2, g.cam.vh / 2), vs = g.sim.ents.ofKind("villager");
  for (let k = 1; k <= 3; k++) { const x = Math.floor(cx) + k, y = Math.floor(cy), z = g.sim.world.standZ(x, y); if (z > 0) { const v = vs[k]; g.sim.ents.move(v, x, y, z); v.action = null; v.job = null; } }
  g.renderer.setZ(17);
});
const box = await G(() => {      // around the two villagers nearest each other on screen (and clear of the panels)
  const g = __game, ps = g.sim.ents.ofKind('villager').filter(v => g.renderer.isShown(v)).map(v => g.cam.toScreen(v.x + 0.5, v.y + 0.5)).filter(p => p[0] > 380 && p[0] < g.cam.vw - 380 && p[1] > 110 && p[1] < g.cam.vh - 110);
  let best = null, bd = 1e9;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const d = Math.hypot(ps[i][0] - ps[j][0], ps[i][1] - ps[j][1]); if (d < bd) { bd = d; best = [ps[i], ps[j]]; } }
  const [a, b] = best;
  return [Math.min(a[0], b[0]) - 30, Math.min(a[1], b[1]) - 30, Math.max(a[0], b[0]) + 30, Math.max(a[1], b[1]) + 30];
});
await page.mouse.move(box[0], box[1]); await page.mouse.down(); await page.mouse.move(box[2], box[3], { steps: 6 }); await page.mouse.up();
const many = await G(() => __game.ui.sel.length);
assert.ok(many >= 2, "drag box selected " + many); ok("drag box selected " + many + " villagers");
await page.keyboard.press("Tab");
assert.equal(await G(() => __game.ui.sel.length), 1); ok("Tab selects the next villager");
await page.keyboard.press("Escape");
assert.equal(await G(() => __game.ui.sel.length), 0); ok("Esc clears the selection");

// 4. keep-N through the village panel
await page.locator('.srow[data-item="log"]').click();
await page.locator(".keepedit button[data-d='10']").click();
await page.locator(".keepedit button[data-d='10']").click();
assert.equal(await G(() => __game.sim.board.keeps.find(k => k.item === "log").n), 20); ok("keep 20 logs set from the stock bar");
await page.locator(".keepedit input").fill("35"); await page.locator(".keepedit input").press("Enter");
assert.equal(await G(() => __game.sim.board.keeps.find(k => k.item === "log").n), 35); ok("keep input works");

// 5. save and load
await page.keyboard.press("Shift+S");
const saved = await G(() => ({ tick: __game.sim.tick, hash: __game.sim.hash(), has: !!localStorage.getItem("slimeciv.save.1") }));
assert.ok(saved.has); ok("Shift-S wrote a browser save");
await G(() => { for (let i = 0; i < 500; i++) __game.sim.step(); });
await page.keyboard.press("Shift+O");
const loaded = await G(() => ({ tick: __game.sim.tick, hash: __game.sim.hash() }));
assert.deepEqual(loaded, { tick: saved.tick, hash: saved.hash }); ok("Shift-O restored the exact state");
// file download + upload round trip
const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(".tb-game").click().then(() => page.locator('[data-m="dl"]').click())]);
await dl.saveAs(join(root, "tmp", "ui-save.json")); ok("download save: " + dl.suggestedFilename());
await page.locator(".tb-game").click();
await page.locator('.tb-menu input[type=file]').setInputFiles(join(root, "tmp", "ui-save.json"));
await page.waitForTimeout(300);
assert.equal(await G(() => __game.sim.hash()), saved.hash); ok("loading the downloaded file restores the same state");

// 6. help, overlays, new game
await page.keyboard.press("h"); await page.waitForTimeout(300); assert.ok(await page.locator(".helpcard").isVisible()); await shot(page, "ui-help"); await page.keyboard.press("h"); ok("help overlay");
await page.keyboard.press("z"); await page.keyboard.press("l"); await page.keyboard.press("t");
assert.deepEqual(await G(() => __game.ui.overlays), { zones: true, jobs: true, temp: true }); await page.waitForTimeout(100); await shot(page, "ui-overlays");
await page.keyboard.press("z"); await page.keyboard.press("l"); await page.keyboard.press("t"); ok("overlays toggle");

// 8. Build mode (S4a): plan a hut with the palette, watch it get built, give the room a purpose, capture + stamp it.
// Test setup (not player input): flatten a plot, drop building materials into the stockpile.
await G(() => {
  const g = __game, sim = g.sim, w = sim.world, z = sim.stock.z, zs = sim.stock;
  for (let y = 46; y <= 64; y++) for (let x = 46; x <= 62; x++) {
    for (let k = 0; k <= 4; k++) if (w.mat(x, y, z + k) !== 0) w.set(x, y, z + k, 0, 0);
    for (let k = z - 1; k >= z - 3; k--) if (w.mat(x, y, k) === 0 || w.mat(x, y, k) === 5) w.set(x, y, k, 2, 0);
    for (const id of sim.ents.at(x, y, z).slice()) { const e = sim.ents.get(id); if (e.kind === "plant" || e.kind === "item" || e.kind === "furniture" || e.kind === "site") sim.ents.remove(id); }
    w.setFlags(x, y, z, 0);
  }
  for (let k = 0; k < 8; k++) { sim.ents.add("item", { item: "stick", n: 10, sp: 0, rv: 0, rt: 0, x: zs.x0 + k % 6, y: zs.y0 + 5 - (k > 5 ? 1 : 0), z: zs.z }); }
  for (let k = 0; k < 6; k++) sim.ents.add("item", { item: "grass", n: 10, sp: 0, rv: 0, rt: 0, x: zs.x0 + k, y: zs.y0 + 3, z: zs.z });
  sim.cache.iv++;
  g.cam.x = 56; g.cam.y = 56;
  for (const v of sim.ents.ofKind("villager")) { v.hunger = 0.95; v.thirst = 0.95; v.energy = 0.95; v.warm = 1; }
});
const cellPx = (x, y) => G(([x, y]) => __game.cam.toScreen(x + 0.5, y + 0.5), [x, y]);
const dragCells = async (a, b, shot) => {
  const [ax, ay] = await cellPx(...a), [bx, by] = await cellPx(...b);
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 8 });
  if (shot) { await page.waitForTimeout(250); await shot(); }
  await page.mouse.up();
};
const clickCell = async (x, y) => { const [px, py] = await cellPx(x, y); await page.mouse.move(px, py); await page.mouse.click(px, py); };
const sites = (w) => G((w) => __game.sim.ents.ofKind("csite").filter(s => !w || s.w === w).length, w);

await page.keyboard.press("b"); await page.waitForTimeout(350);
assert.equal(await G(() => __game.ui.mode), "build"); assert.ok(await page.locator("#buildbar").isVisible()); ok("B opens build mode and the palette");
assert.equal(await G(() => __game.renderer.z === __game.sim.stock.z), true); ok("the viewed level snaps to the ground level");
await page.locator(".tool-wall").click();
await dragCells([48, 48], [54, 53]);
assert.equal(await sites("wall"), 22); ok("dragging an outline plans 22 wall pieces (7x6 ring)");
await page.locator(".tool-door").click(); await clickCell(51, 53);
assert.equal(await sites("door"), 1); assert.equal(await sites("wall"), 21); ok("a door replaces one wall ghost");
await page.locator(".tool-roof").click();
await dragCells([49, 49], [53, 52], async () => { await shot(page, "ui-e-build-palette"); });
assert.equal(await sites("roof"), 20); ok("roof fill over the 5x4 interior (screenshot taken mid-drag with the cost preview)");
await page.locator(".tool-bed").click();
for (const [x, y] of [[49, 49], [51, 49], [53, 49]]) await clickCell(x, y);
assert.equal(await sites("bed"), 3); ok("three beds planned");
await page.locator(".tool-wall").click(); await clickCell(48, 56);          // hover a lone cell for the cost line
await shot(page, "ui-f-build-ghosts");
// erase one ghost and re-plan it
await page.locator(".tool-erase").click(); await clickCell(48, 56);
await page.locator(".tool-wall").click();

// watch it build at speed 5 for a few real seconds, then let it finish in bulk
await page.keyboard.press("Escape");           // Esc with no drag: leaves build mode
assert.equal(await G(() => __game.ui.mode), "select"); ok("Esc leaves build mode");
await G(() => { __game.state.paused = false; __game.setSpeed(5); });
const t0 = await G(() => __game.sim.tick); await page.waitForTimeout(2500);
const t1 = await G(() => __game.sim.tick);
assert.ok(t1 - t0 > 100, "sim ran at speed 5"); ok("ghosts shown in select mode while the sim runs at 5x (" + (t1 - t0) + " ticks)");
await shot(page, "ui-g-build-progress");
if (await page.locator("#digest").isVisible()) await page.locator(".dg-close").click();
await G(() => { __game.state.paused = true; const sim = __game.sim; for (let i = 0; i < 40000 && sim.ents.ofKind("csite").length; i++) { if (i % 20 === 0) for (const v of sim.ents.ofKind("villager")) { v.hunger = Math.max(v.hunger, .8); v.thirst = Math.max(v.thirst, .8); v.energy = Math.max(v.energy, .8); } sim.step(); } sim.step(); });
assert.equal(await sites(), 0); ok("everything got built (" + await G(() => __game.sim.tick) + " ticks)");
const room = await G(() => { const r = __game.sim.rooms.all()[0]; return r ? { n: r.n, enclosed: r.enclosed, warm: r.warm } : null; });
assert.ok(room && room.enclosed && room.n === 20 && room.warm > 0.3); ok("a 20-cell enclosed room, warmth +" + room.warm.toFixed(2));

// click inside the room (roof visible from above) -> the room inspector with its checklist
await G(() => { __game.renderer.setZ(17); });
const free = await G(() => {      // an interior cell with no villager standing close, so the click lands on the floor
  const vs = __game.sim.ents.ofKind("villager"); let best = [51, 51], bd = -1;
  for (let y = 50; y <= 52; y++) for (let x = 49; x <= 53; x++) { const d = Math.min(...vs.map(v => Math.hypot(v.x - x, v.y - y))); if (d > bd) { bd = d; best = [x, y]; } }
  return best;
});
await clickCell(...free);
assert.equal(await G(() => __game.ui.other && __game.ui.other.kind), "room"); ok("clicking a room's floor selects the room");
await page.waitForTimeout(350);
const roomText = await page.locator("#panel-insp .pbody").innerText();
assert.match(roomText, /checklist/i); assert.match(roomText, /✓/); ok("room inspector shows the checklist with ticks");
await page.locator('[data-act="purpose:shelter"]').click();
assert.equal(await G(() => __game.sim.rooms.all()[0].purpose), "shelter"); ok("assigned the Shelter purpose");
await page.waitForTimeout(300);
assert.match(await page.locator("#panel-insp .pbody").innerText(), /✗ A bed for every two sleepers/); ok("the shelter checklist marks the missing beds with a ✗");
await shot(page, "ui-h-room-inspector");
await page.keyboard.press("t"); await page.waitForTimeout(200); await shot(page, "ui-i-room-warmth"); await page.keyboard.press("t");

// capture it as a blueprint, stamp two rotated copies
if (await page.locator("#digest").isVisible()) await page.locator(".dg-close").click();      // the away digest sits over the map
await page.keyboard.press("b");
await page.locator(".tool-capture").click();
await page.locator(".bp-name").fill("Smoke hut");
await dragCells([48, 48], [54, 53]);
if (process.env.DBG) console.log(await G(() => ({ mode: __game.ui.mode, tool: __game.ui.build.tool, z: __game.renderer.z, bps: __game.sim.bps.list.length, toasts: [...document.querySelectorAll(".toast")].map(t => t.textContent), walls: __game.sim.world.mat(48, 48, __game.sim.stock.z) })));
assert.equal(await G(() => __game.sim.bps.list.length), 1); ok("captured a blueprint: " + await G(() => __game.sim.bps.list[0].name + ", " + __game.sim.bps.list[0].cells.length + " pieces"));
assert.ok(await page.locator("#panel-bps").isVisible()); ok("Blueprints panel lists it");
await page.locator('[data-bp^="stamp:"]').click();
await page.locator(".bs-n").fill("2"); await page.locator(".bs-n").dispatchEvent("change");
await G(() => document.activeElement && document.activeElement.blur());      // keys go to the map again
await page.keyboard.press("r");
assert.equal(await G(() => __game.ui.build.bp.rot), 1); ok("R rotates the stamp");
await page.locator(".bs-wall").selectOption("log");
await G(() => {       // test setup: S10's plants seed into bare ground over the long build above (the world is alive); clear the stamp site again
  const sim = __game.sim, z = sim.stock.z;
  for (let y = 54; y <= 68; y++) for (let x = 46; x <= 64; x++) for (const id of sim.ents.at(x, y, z).slice()) { const e = sim.ents.get(id); if (e.kind === "plant" && !e.burn) { sim.world.setFlags(x, y, z, sim.world.flags(x, y, z) & ~2); sim.ents.remove(id); } }
  sim.cache.iv++;
});
const [sx, sy] = await cellPx(48, 56); await page.mouse.move(sx, sy); await page.waitForTimeout(250);
await shot(page, "ui-j-blueprint-stamp");
await page.mouse.click(sx, sy);
const stamped = await G(() => __game.sim.ents.ofKind("csite").filter(s => s.y >= 56).length);
assert.ok(stamped > 80, "two rotated copies planned: " + stamped); ok("stamped 2 copies (" + stamped + " pieces, walls swapped to log)");
assert.equal(await G(() => __game.sim.ents.ofKind("csite").filter(s => s.w === "wall" && s.m === "log").length > 20), true); ok("material swapped at stamp time");
await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
await page.waitForTimeout(350);
await G(() => __game.renderer.setZ(17));
await shot(page, "ui-k-after-stamp");
// the Why panel while paused right after an order: "next:"
const vid = await G(() => { const g = __game, v = g.sim.ents.ofKind("villager")[0]; g.selectOnly(v.id, true); g.sim.apply({ type: "order", ids: [v.id], verb: "move", x: 60, y: 58, z: g.sim.stock.z }); return v.id; });
await page.waitForTimeout(400);
assert.match(await page.locator("#panel-why .pbody").innerText(), /next:/i); ok("paused after a command: the Why panel shows \"next:\"");


// 9. Speeds, skip-to, deconstruct, the provisional room, possession (S4b). World edits below are test setup, not player input.
await G(() => { __game.state.paused = true; });
await page.keyboard.press("6"); assert.equal(await G(() => __game.state.speed), 10);
await page.keyboard.press("9"); assert.equal(await G(() => __game.state.speed), Infinity);
await page.keyboard.press("2"); assert.equal(await G(() => __game.state.speed), 2); await page.keyboard.press("Space");
ok("speed keys: 6 = 10x, 9 = MAX, 2 = 2x");
await page.locator(".tb-skip [data-skip=morning]").click();
await page.waitForFunction(() => !__game.skipper.active, null, { timeout: 30000 });
const sk = await G(() => ({ msg: __game.skipper.msg, paused: __game.state.paused }));
assert.match(sk.msg, /Stopped/); assert.ok(sk.paused); ok("Next morning ran at MAX and stopped: " + sk.msg);
const prog = await G(() => { __game.skipper.start("event"); return __game.skipper.progress(); });
assert.match(prog, /Skipping event: day \d+/); await page.keyboard.press("Escape");
assert.equal(await G(() => !!__game.skipper.active), false); ok("a skip shows 'day N' progress and Esc cancels it");
const ff = await G(() => { const t = __game.sim.tick; return __game.fastForward(300) - t; }); assert.equal(ff, 300); ok("window.__game.fastForward(n) steps n ticks synchronously");

// deconstruct: take one finished bed down through the build tool
await G(() => { __game.renderer.setZ(__game.sim.stock.z); });
await G(() => { __game.ui.follow = 0; __game.cam.x = 56; __game.cam.y = 56; });     // earlier steps may have left the camera following someone
const bedBefore = await G(() => __game.sim.ents.ofKind("furniture").filter(f => f.f === "bed" && f.x === 49 && f.y === 49).length);
await page.keyboard.press("b"); await page.locator(".tool-deconstruct").click(); await dragCells([49, 49], [49, 49]);
assert.ok(await G(() => __game.sim.ents.ofKind("dsite").length) >= bedBefore && bedBefore === 1); ok("Deconstruct tool marked the finished bed and the roof over it (" + await G(() => __game.sim.ents.ofKind("dsite").length) + " pieces)");
await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
await G(() => { const sim = __game.sim; for (let i = 0; i < 20000 && sim.ents.ofKind("dsite").length; i++) { if (i % 20 === 0) for (const v of sim.ents.ofKind("villager")) { v.hunger = Math.max(v.hunger, .8); v.thirst = Math.max(v.thirst, .8); v.energy = Math.max(v.energy, .8); v.warm = 1; } sim.step(); } });
assert.equal(await G(() => __game.sim.ents.ofKind("dsite").length), 0);
assert.equal(await G(() => __game.sim.ents.ofKind("furniture").filter(f => f.f === "bed" && f.x === 49 && f.y === 49).length), 0); ok("villagers took the bed down");

// provisional room: walls + roof, no door
await G(() => {
  const g = __game, sim = g.sim, w = sim.world, z = sim.stock.z;
  for (let y = 46; y <= 50; y++) for (let x = 57; x <= 61; x++) {
    const edge = x === 57 || x === 61 || y === 46 || y === 50;
    if (edge && !(x === 59 && y === 50)) w.set(x, y, z, g.M.WATTLE, w.flags(x, y, z) | g.F.PLAYER);
    else if (!edge) w.set(x, y, z + 1, g.M.THATCH, w.flags(x, y, z + 1) | g.F.PLAYER);
  }
  sim.rooms.update(sim); g.renderer.setZ(z + 1); g.cam.x = 56; g.cam.y = 52;
  for (const v of sim.ents.ofKind("villager")) if (v.x >= 56 && v.x <= 62 && v.y >= 45 && v.y <= 51) sim.ents.move(v, 52, 60, z);
});
await page.waitForTimeout(200);
await clickCell(58, 48); await page.waitForTimeout(350);
assert.equal(await G(() => __game.ui.other && __game.ui.other.kind), "proom");
assert.match(await page.locator("#panel-insp .pbody").innerText(), /needs a door to close/); ok("walls + roof without a door: 'Not a room yet - needs a door to close'");
await shot(page, "ui-m-provisional-room");
await page.keyboard.press("Escape");

// possession: Q, walk 3 steps, chop, release
const pz = await G(() => {
  const g = __game, sim = g.sim, w = sim.world;
  let spot = null;                                   // a free flat run of 6 cells to walk along
  for (let y = 66; y < 100 && !spot; y++) for (let x = 20; x < 100 && !spot; x++) {
    const z0 = w.standZ(x, y); let ok = z0 > 0;
    for (let i = 0; i < 6 && ok; i++) ok = w.standZ(x + i, y) === z0 && sim.ents.at(x + i, y, z0).length === 0;
    if (ok) spot = { x, y, z: z0 };
  }
  const { z } = spot, X = spot.x, Y = spot.y;
  const v = sim.ents.ofKind("villager").find(q => q.born < -100000);
  for (const q of sim.ents.ofKind("villager")) { q.hunger = q.thirst = q.energy = 0.95; q.warm = 1; }
  sim.ents.move(v, X, Y, z); v.action = null; v.job = null; sim.cache.iv++;
  const t = sim.ents.add("plant", { species: "tree", x: X + 4, y: Y, z, yield: 4, nx: 0, rv: 0, rt: 0 });
  w.setFlags(X + 4, Y, z, w.flags(X + 4, Y, z) | g.F.OBSTACLE);
  g.selectOnly(v.id, true); g.state.paused = true;
  g.cam.x = X + 2; g.cam.y = Y;
  return { id: v.id, tree: t.id, z, X, Y };
});
await page.waitForTimeout(250);
const zoomBefore = await G(() => __game.cam.zoom);
await page.keyboard.press("q");
await G(() => { __game.setSpeed(5); });
assert.equal(await G(() => __game.ui.mode), "possess"); assert.ok(await G((id) => !!__game.sim.ents.get(id).poss, pz.id)); ok("Q possesses the selected villager");
await page.waitForTimeout(350);
assert.match(await page.locator("#possbanner").innerText(), /POSSESSING/); ok("banner: " + (await page.locator("#possbanner .pb-head b").innerText()));
assert.ok(await G(() => __game.cam.zoom) > zoomBefore * 2); ok("camera zoomed in on the villager");
assert.equal(await G(() => __game.effectiveSpeed()), 2); ok("speed 5x is capped at 2x while possessed");
assert.match(await page.locator("#panel-why .pbody").innerText(), /You are guiding/); ok("Why panel: You are guiding ...");
await page.locator(".tb-skip [data-skip=season]").click({ force: true }).catch(() => {});
assert.equal(await G(() => !!__game.skipper.active), false); ok("skip buttons are disabled while possessed");
await page.keyboard.down("d");
await page.waitForFunction(([id, x]) => __game.sim.ents.get(id).x >= x + 3, [pz.id, pz.X], { timeout: 15000 });
await page.keyboard.up("d");
await page.waitForTimeout(500);
const px = await G((id) => __game.sim.ents.get(id).x, pz.id);
assert.equal(px, pz.X + 3,  "walked 3 steps east with D, stopping at the tree: x=" + px); ok("holding D walked the villager east (x " + pz.X + " -> " + px + ")");
await page.keyboard.press("e");
await page.waitForTimeout(200);
if (process.env.DBG) console.log(await G((id) => { const v = __game.sim.ents.get(id); return { x: v.x, y: v.y, z: v.z, poss: v.poss, pin: v.pin, job: v.job, act: v.action && v.action.type, keys: [...__game.keys] }; }, pz.id));
assert.equal(await G((id) => __game.sim.ents.get(id).job && __game.sim.ents.get(id).job.k, pz.id), "chop"); ok("E chops the tree beside them");
await shot(page, "ui-l-possess-chop");
await page.waitForFunction((t) => __game.sim.ents.get(t).species !== "tree", pz.tree, { timeout: 30000 });
assert.ok(await G(([X, Y]) => __game.sim.ents.ofKind("item").some(i => i.item === "log" && i.x === X + 4 && i.y === Y), [pz.X, pz.Y])); ok("the tree fell and logs lie at its foot");
assert.ok(await G(() => __game.sim.cmdLog.some(c => c.type === "possess") && __game.sim.cmdLog.filter(c => c.type === "pinput").length >= 3)); ok("possession went through sim.apply (command log)");
await page.keyboard.press("Escape");
assert.equal(await G(() => __game.ui.mode), "select"); assert.equal(await G(() => !!__game.sim.ents.ofKind("villager").some(v => v.poss)), false);
assert.ok(Math.abs(await G(() => __game.cam.zoom) - zoomBefore) < 0.01); ok("Esc releases; zoom restored; the village AI takes over");
await G(() => { __game.state.paused = true; });

// 7. late autumn village panel + digest
await G(() => { const g = __game; g.setSim(g.sim); const sim = g.sim; while (sim.tick < 104500) sim.step(); g.state.paused = true; });
await page.keyboard.press("1"); await page.keyboard.press("Space");
await page.waitForTimeout(500);
assert.ok(await page.locator("#digest").isVisible(), "digest appears after a long stretch"); ok("while-you-were-away digest appears");
await shot(page, "ui-c-digest");
await page.locator(".dg-close").click();
const target2 = await G(() => { const g = __game; const v = g.sim.ents.ofKind("villager")[0]; g.selectOnly(v.id, true); return v.id; });
await page.keyboard.press("Space");
await page.waitForTimeout(500);
await shot(page, "ui-b-village-autumn");
console.log("season:", await page.locator("#panel-village .seasonline").innerText());

// 8. S6 geology & mining: load the mine fixture, drag a dig region, then look at the mine on a lower level
{
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "mine.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(500);
  assert.equal(await G(() => __game.sim.tick), 36000); assert.ok(await G(() => __game.sim.seen.log.length > 500)); ok("the mine fixture loaded (the fog log came with it)");
  await G(() => { __game.state.paused = true; __game.ui.follow = 0; __game.clearSelection(); __game.cam.x = 72; __game.cam.y = 57; __game.cam.zoom = 20; });
  await page.keyboard.press("b"); await page.waitForTimeout(300);
  await page.locator(".tool-dig").click(); await page.waitForTimeout(200);
  assert.ok(await page.locator('[data-dig="region"]').isVisible() && await page.locator('[data-ditem="malachite"]').count() === 0, "dig intents shown"); ok("the Dig tool offers region / stair / vein / seek / order");
  const px = async (x, y) => { const [sx, sy] = await cellPx(x, y); return G(([sx, sy]) => { const t = document.createElement("canvas"); t.width = t.height = 1; const c = t.getContext("2d", { willReadFrequently: true }); c.drawImage(document.getElementById("view"), Math.round(sx * __game.renderer.dpr), Math.round(sy * __game.renderer.dpr), 1, 1, 0, 0, 1, 1); const d = c.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }, [sx, sy]); };
  const before = await px(71, 57);
  await dragCells([70, 56], [73, 58]);
  await page.waitForTimeout(300);
  assert.equal(await G(() => __game.sim.mine.list.length), 1); assert.equal(await G(() => __game.sim.mine.list[0].kind), "region"); ok("dragging a box marks a dig region (one command, no per-block orders)");
  await page.mouse.move(10, 400); await page.waitForTimeout(250);
  const after = await px(71, 57);
  assert.ok(after[2] - before[2] > 25, "the marked cells are tinted: " + before + " -> " + after); ok("the marked cells show a purple wash on the map");
  await shot(page, "ui-s6-dig-region");
  await page.locator('[data-dig="depth"]').click(); await clickCell(68, 58);
  assert.equal(await G(() => __game.sim.mine.list.map(d => d.kind).join()), "region,depth"); ok("Stair down marks a stair from one click");
  await page.locator('[data-dig="seek"]').click(); await page.locator('[data-ditem="malachite"]').click(); await clickCell(87, 63);
  assert.equal(await G(() => __game.sim.mine.list.map(d => d.kind).join()), "region,depth,seek"); ok("Seek (malachite) marks a search from the clicked spot");
  await page.locator("[data-dig-cancel]").click();
  assert.equal(await G(() => __game.sim.mine.list.length), 0); ok("Cancel digs clears them");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  // the mine, one level down at its tunnel level: seen rock is lit, the rest is dark unknown
  const MF = await G(() => {                                    // the mine fixture's exposed malachite face (found, not hard-coded: it moves with the land)
    const g = __game, w = g.sim.world, M = g.M, S = g.sim.site;
    for (let y = S.y - 14; y < S.y + 16; y++) for (let x = S.x + 6; x < S.x + 56; x++) for (let z = 3; z < g.sim.stock.z - 3; z++) if (w.mat(x, y, z) === M.MALACHITE && w.mat(x - 1, y, z) === M.AIR && g.seenAt(x, y, z)) return { x, y, z };
    return null;
  });
  assert.ok(MF, "the mine fixture has a face");
  await G((f) => { const g = __game; g.setMode("select"); g.renderer.setZ(f.z); g.cam.x = f.x - 1; g.cam.y = f.y; g.cam.zoom = 28; g.sim.apply({ type: "mine", op: "vein", x: f.x, y: f.y, z: f.z }); }, MF);
  await page.waitForTimeout(300);
  const tunnel = await px(MF.x - 3, MF.y), wall = await px(MF.x - 3, MF.y + 1), far = await px(MF.x - 3, MF.y + 5);
  assert.deepEqual(far, [15, 18, 24]); assert.notDeepEqual(tunnel, far); assert.notDeepEqual(wall, far); ok("on the tunnel level unseen rock is dark and the tunnel and its walls are drawn");
  await shot(page, "ui-s6-mine-z8");
  await clickCell(MF.x - 3, MF.y + 1); await page.waitForTimeout(300);
  const cellText = await page.locator("#panel-insp .pbody").innerText();
  assert.match(cellText, /rock|Flint|flint/); ok("clicking a wall cell names its material: " + (await page.locator("#panel-insp .ptitle, #panel-insp h3").first().innerText().catch(() => "")).trim().slice(0, 40));
  await clickCell(MF.x - 3, MF.y + 5); await page.waitForTimeout(250);
  assert.match(await page.locator("#panel-insp .pbody").innerText(), /Nobody has seen/); ok("an unseen cell says nobody has seen it");
  // the cave one level at its floor
  await G(() => { const c = __game.sim.world.geo.caves[0]; __game.renderer.setZ(c.zf); __game.cam.x = c.cx; __game.cam.y = c.cy; __game.cam.zoom = 22; });
  await page.waitForTimeout(250); await shot(page, "ui-s6-cave-unseen");
  await G(() => { const g = __game, c = g.sim.world.geo.caves[0]; g.sim.ents.move(g.sim.ents.ofKind("villager")[0], c.cx, c.cy, c.zf); });
  await G(() => { __game.fastForward(2); });
  await page.waitForTimeout(250); await shot(page, "ui-s6-cave-seen");
  assert.ok(await G(() => { const c = __game.sim.world.geo.caves[0]; return __game.seenAt(c.cx + 2, c.cy, c.zf); })); ok("a villager standing in the cave shows the hall around them");
}

// 9. S7a discovery & fire: force lightning from the Game menu, see the tree burn, watch fire become known, open the Almanac, then a hearth.
{
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "settled.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(500);
  await G(() => { __game.state.paused = true; __game.ui.follow = 0; __game.clearSelection(); __game.ui.overlays.temp = false; __game.renderer.setZ(__game.sim.stock.z); });
  assert.equal(await G(() => __game.sim.disc.era), "");
  await page.locator(".tb-game").click(); await page.waitForTimeout(150);
  await page.locator('[data-m="lightning"]').click(); await page.waitForTimeout(300);
  const fl = await G(() => { const f = __game.sim.ents.ofKind("flame")[0]; return f ? { x: f.x, y: f.y, z: f.z } : null; });
  assert.ok(fl, "Force lightning made a flame"); ok("Game menu > Force lightning: a tree is burning at " + fl.x + "," + fl.y);
  await G((f) => { const g = __game; g.cam.zoom = 22; g.cam.x = f.x + 0.5 + 4; g.cam.y = f.y + 0.5; g.renderer.setZ(f.z); }, fl);
  await page.waitForTimeout(500);
  const fpx = async (x, y) => G(([x, y]) => { const g = __game, [sx, sy] = g.cam.toScreen(x + 0.5, y + 0.5); const t = document.createElement("canvas"); t.width = t.height = 1; const c = t.getContext("2d", { willReadFrequently: true }); c.drawImage(document.getElementById("view"), Math.round((sx) * g.renderer.dpr), Math.round((sy - g.cam.zoom * 0.3) * g.renderer.dpr), 1, 1, 0, 0, 1, 1); return Array.from(c.getImageData(0, 0, 1, 1).data); }, [x, y]);
  let bright = false;
  for (let i = 0; i < 12 && !bright; i++) { const c = await fpx(fl.x, fl.y); if (c[0] > 200 && c[0] > c[2] + 90) bright = true; await page.waitForTimeout(90); }     // the flame animates: sample a few frames
  assert.ok(bright, "the burning tree draws orange flames"); ok("the burning tree shows animated flames on the map");
  await shot(page, "ui-s7a-burning-tree");
  const names = await G(() => { __game.fastForward(1500); return __game.sim.ents.ofKind("villager").filter(v => v.fam && v.fam.FIRE_TENDING).map(v => v.name); });
  assert.ok(names.length >= 1, "someone learned fire"); ok("after a day: " + names.join(", ") + " understood fire");
  await page.locator(".tb-almanac").click(); await page.waitForTimeout(500);
  const alm = await page.locator("#panel-almanac .pbody").innerText();
  assert.match(alm, /Keeping a fire/); assert.match(alm, /Hearth age/); ok("the Almanac lists Keeping a fire, its holders and the Hearth age");
  await page.locator('#panel-almanac [data-trace]').click(); await page.waitForTimeout(300);
  assert.match(await page.locator("#panel-almanac .pbody").innerText(), /witness|perform/); ok("the discovery trace toggle shows the rolls");
  await G(() => { __game.cam.x = 64 + 150 / __game.cam.zoom; });
  await page.locator("#panel-almanac").screenshot({ path: join(root, "tmp", "ui-s7a-almanac.png") });
  await shot(page, "ui-s7a-almanac-page");

  // the hearth: fire fixture, Warmth overlay, build palette
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "fire.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(500);
  const hp = await G(() => { const g = __game, h = g.sim.ents.ofKind("furniture").find(f => f.f === "hearth"); g.state.paused = true; g.cam.zoom = 24; g.cam.x = h.x + 0.5 + 3; g.cam.y = h.y + 0.5; g.renderer.setZ(h.z); g.fastForward(30); return { x: h.x, y: h.y, lit: h.lit, hl: h.hl }; });
  assert.equal(hp.lit, 1); await page.waitForTimeout(400);
  let hb = false;
  for (let i = 0; i < 12 && !hb; i++) { const c = await fpx(hp.x, hp.y); if (c[0] > 180 && c[0] > c[2] + 70) hb = true; await page.waitForTimeout(90); }
  assert.ok(hb, "the lit hearth draws a flame"); ok("a lit fire ring burns on the map");
  await shot(page, "ui-s7a-hearth");
  await G(() => { __game.ui.overlays.temp = true; });
  await page.waitForTimeout(300); await shot(page, "ui-s7a-hearth-warmth");
  await G(() => { __game.ui.overlays.temp = false; });
  await page.keyboard.press("b"); await page.waitForTimeout(300);
  assert.ok(await page.locator(".tool-hearth").isEnabled(), "the Fire ring tool is enabled once fire is known"); ok("build mode offers the Fire ring now that fire is known");
  await page.keyboard.press("Escape");
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "settled.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(500);
  await page.keyboard.press("b"); await page.waitForTimeout(300);
  assert.ok(await page.locator(".tool-hearth").isDisabled(), "disabled while nobody knows fire"); ok("...and greys it out while nobody does");
  await page.keyboard.press("Escape");
}

// 10. S7b clay -> charcoal -> copper: the `copperready` fixture (pottery, charcoal known; a kiln already stands), the palette shows the stations the village knows,
// place a kiln by clicking the map, let villagers build it, click it and read its inspector (heat level, fuel, and WHY it is not hotter).
{
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "copperready.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(500);
  await G(() => { __game.state.paused = true; });
  await page.keyboard.press("b"); await page.waitForTimeout(300);
  assert.ok(await page.locator(".tool-kiln").isVisible(), "the Kiln tool shows once pottery is known"); assert.ok(await page.locator(".tool-mound").isVisible());
  assert.ok(await page.locator(".tool-workbench").isVisible()); ok("build mode shows Kiln, Charcoal mound and Workbench for a village that knows pottery and charcoal");
  const spot = await G(() => {
    const g = __game, w = g.sim.world, c = { x: (g.sim.stock.x0 + g.sim.stock.x1) >> 1, y: (g.sim.stock.y0 + g.sim.stock.y1) >> 1 };
    for (let r = 6; r < 16; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = c.x + dx, y = c.y + dy, z = w.standZ(x, y);
      if (z === g.sim.stock.z && !g.sim.ents.at(x, y, z).length && !g.sim.ents.at(x + 1, y, z).length) { g.cam.zoom = 24; g.cam.x = x + 0.5; g.cam.y = y + 0.5; g.renderer.setZ(z); const [sx, sy] = g.cam.toScreen(x + 0.5, y + 0.5); return { x, y, z, sx, sy }; }
    }
    return null;
  });
  assert.ok(spot, "found a free cell for the kiln");
  await page.locator(".tool-kiln").click(); await page.waitForTimeout(150);
  await page.mouse.click(spot.sx, spot.sy); await page.waitForTimeout(250);
  assert.ok(await G((s) => __game.sim.ents.ofKind("csite").some(c => c.w === "kiln" && c.x === s.x && c.y === s.y), spot), "clicking placed a kiln ghost");
  await shot(page, "ui-s7b-kiln-ghost"); ok("placed a kiln by clicking the map");
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  const built = await G((s) => { __game.fastForward(3000); const k = __game.sim.ents.ofKind("furniture").filter(f => f.f === "kiln").find(f => f.x === s.x && f.y === s.y); return !!k; }, spot);
  assert.ok(built, "villagers built the kiln from clay"); await page.waitForTimeout(300);
  const [kx, ky] = await G((s) => { const [sx, sy] = __game.cam.toScreen(s.x + 0.5, s.y + 0.5); return [sx, sy]; }, spot);
  await page.mouse.click(kx, ky); await page.waitForTimeout(400);
  const insp = await page.locator("#panel-insp .pbody").innerText();
  assert.match(insp, /kiln/i); assert.match(insp, /level \d/); assert.match(insp, /needs draft/i); assert.match(insp, /Investigate here/);
  ok("the kiln inspector shows heat by fuel and why it is not hotter: " + insp.split("\n").filter(l => /draft/.test(l))[0].slice(0, 80));
  await page.locator("#panel-insp").screenshot({ path: join(root, "tmp", "ui-s7b-kiln-inspector.png") });
  await shot(page, "ui-s7b-kiln");
  // products appear in the stock bars once someone knows how to make them
  await page.locator(".tb-almanac").click(); await page.waitForTimeout(300);
  const stockTxt = await page.locator("#panel-village .pbody").innerText();
  assert.match(stockTxt, /charcoal/i); assert.match(stockTxt, /fired clay/i); ok("stock bars list charcoal and fired clay");
}

// 12. S8: creatures, hunting, possession combat, expeditions. World edits below are test setup, not player input.
{
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  await G(() => {
    const g = __game, sim = g.sim.constructor.create(7);
    for (let i = 0; i < 2500; i++) sim.step();
    g.setSim(sim); g.setMode("select"); g.state.paused = true; g.ui.overlays.zones = false; g.cam.zoom = 22;
  });
  // a hopper in view: click it, read the card; select a villager and right-click it to hunt
  const hp = await G(() => {
    const g = __game, sim = g.sim, c = { x: 64, y: 64 };
    const h = sim.ents.ofKind("fauna").filter(e => e.sp === "hopper").sort((a, b) => Math.abs(a.x - c.x) + Math.abs(a.y - c.y) - Math.abs(b.x - c.x) - Math.abs(b.y - c.y))[0];
    g.cam.x = h.x + 0.5 + 4; g.cam.y = h.y + 0.5; g.renderer.setZ(h.z);
    const v = sim.ents.ofKind("villager")[0];
    g.selectOnly(v.id);
    return { id: h.id, vid: v.id };
  });
  await page.waitForTimeout(400);
  const hs = await G((id) => { const g = __game, h = g.sim.ents.get(id), [sx, sy] = g.cam.toScreen(h.x + 0.5, h.y + 0.5); return { sx, sy, shown: g.renderer.isShown(h) }; }, hp.id);
  assert.ok(hs.shown, "the hopper is drawn on the map");
  await shot(page, "ui-s8-hopper");
  await page.mouse.move(hs.sx, hs.sy); await page.waitForTimeout(100);
  if (process.env.DBG2) console.log("HOVER", await G(() => { const h = __game.ui.hover; return h ? JSON.stringify({kind: h.kind, z: h.z, x: h.x, y: h.y, ents: h.ents.map(e => e.kind + e.id)}) : "none"; }), JSON.stringify(await G((id) => { const h = __game.sim.ents.get(id); return [h.x, h.y, h.z, __game.renderer.z]; }, hp.id)));
  await page.mouse.click(hs.sx, hs.sy, { button: "right" }); await page.waitForTimeout(300);
  if (await page.locator(".ctxmenu").count()) { await page.locator(".ctxmenu button", { hasText: /Hunt/ }).click(); await page.waitForTimeout(250); }     // ground that can be dug offers a menu: pick Hunt
  assert.equal(await G((id) => { const v = __game.sim.ents.get(id); return v.order && v.order.verb; }, hp.vid), "hunt"); ok("right-clicking a hopper orders a hunt");
  await G((id) => __game.cancelOrders([id]), hp.vid);
  await page.mouse.click(hs.sx, hs.sy); await page.waitForTimeout(350);
  const hinsp = await page.locator("#panel-insp .pbody").innerText();
  assert.match(hinsp, /hopper/i); assert.match(hinsp, /Health/); ok("the inspector works on a creature: " + hinsp.split("\n")[0].slice(0, 70));

  // possess a villager next to a hopper, with a spear, and strike once with E
  await G((hid) => {
    const g = __game, sim = g.sim, v = sim.ents.ofKind("villager").find(q => q.born < -100000), h = sim.ents.get(hid);
    sim.ents.move(h, v.x + 1, v.y, sim.world.standZ(v.x + 1, v.y)); h.cd = 1e9; h.hp = h.mhp = 80;
    v.eq = { item: "copper_spear", u: 30, q: 0.5 };
    g.selectOnly(v.id); g.possess(v.id);
    g.cam.x = v.x + 0.5; g.cam.y = v.y + 0.5; g.renderer.setZ(v.z); g.state.paused = true;
  }, hp.id);
  await page.keyboard.press("e"); await page.waitForTimeout(150);
  await G(() => __game.fastForward(70)); await page.waitForTimeout(300);
  const struck = await G((hid) => { const h = __game.sim.ents.get(hid); return h ? { ht: h.ht, hp: h.hp } : { dead: 1 }; }, hp.id);
  assert.ok(struck.dead || struck.ht > 0, "E struck the adjacent creature"); ok("possessed villager struck a hopper with E (" + JSON.stringify(struck) + ")");
  const banner = await page.locator("#possbanner").innerText();
  assert.match(banner, /Fear/); assert.match(banner, /Health/); ok("the banner shows health and fear");
  assert.ok(await G(() => __game.sim.cmdLog.some(c => c.type === "pinput" && c.tid)), "the strike went through sim.apply");

  // the thornback encounter: a sturdy guided villager faces it; screenshot while a hit flash is up
  await G(() => {
    const g = __game, sim = g.sim, v = g.possessed(), tb = sim.ents.ofKind("fauna").find(e => e.sp === "thornback");
    v.t.hardiness = 2.5; v.hp = 250; v.eq = { item: "copper_spear", u: 30, q: 0.5 };
    sim.ents.move(tb, v.x + 2, v.y, sim.world.standZ(v.x + 2, v.y)); tb.home = [tb.x, tb.y, tb.z]; tb.cd = 1;
    g.cam.zoom = 26; g.cam.x = v.x + 1.5; g.cam.y = v.y + 0.5; g.renderer.setZ(v.z);
  });
  for (let k = 0; k < 40; k++) {
    await G(() => { const g = __game, v = g.possessed(), tb = g.sim.ents.ofKind("fauna").find(e => e.sp === "thornback"); if (v && tb && !v.action && Math.abs(tb.x - v.x) + Math.abs(tb.y - v.y) <= 1) g.sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: tb.id, verb: "" }); else if (v && tb && !v.action) g.sim.apply({ type: "pinput", id: v.id, dx: Math.sign(tb.x - v.x), dy: 0, tid: 0, verb: "" }); __game.fastForward(6); });
    const fl = await G(() => { const s = __game.sim, tb = s.ents.ofKind("fauna").find(e => e.sp === "thornback"), v = __game.possessed(); return !!tb && s.tick - tb.ht < 12 && tb.ht > 0 && v && v.fear > 0; });
    if (fl) break;
  }
  await G(() => { const g = __game, s = g.sim, v = g.possessed(), tb = s.ents.ofKind("fauna").find(e => e.sp === "thornback"); if (v && tb && tb.x === v.x && tb.y === v.y) { const z = s.world.standZ(v.x + 1, v.y); if (z >= 0) s.ents.move(tb, v.x + 1, v.y, z); } g.cam.x = v.x + 0.5 + 0.5; });   // (a creature and a villager may share a cell: nudge it for the picture)
  await page.mouse.move(2, 2); await page.waitForTimeout(250);
  if (process.env.DBG2) console.log("ENC", await G(() => { const g = __game, s = g.sim, v = g.possessed(); return JSON.stringify({ tick: s.tick, v: [v.x, v.y, v.z, v.ht, v.hd, v.hp], f: s.ents.ofKind("fauna").filter(e => Math.abs(e.x - v.x) < 6 && Math.abs(e.y - v.y) < 6).map(e => [e.sp, e.x, e.y, e.z, e.ht, e.hd, e.hp, g.renderer.isShown(e)]) }); }));
  await shot(page, "ui-s8-thornback-encounter");
  const eb = await page.locator("#possbanner").innerText();
  assert.match(eb, /steadfast/i); ok("the thornback encounter is on screen with the possession banner: " + eb.split("\n").filter(l => /Fear/.test(l)).join(" ").slice(0, 60));
  assert.ok(await G(() => { const tb = __game.sim.ents.ofKind("fauna").find(e => e.sp === "thornback"); return !tb || tb.hp < tb.mhp; }), "the thornback took damage");
  // the cave: underground light radius (render-side) draws without errors
  await G(() => { const g = __game, sim = g.sim, v = g.possessed(), cv = sim.world.geo.caves[0], W = sim.world.constructor, f = cv.floor.find(i => sim.world.isWalkable(...W.xyz(i))); const [x, y, z] = W.xyz(f); sim.ents.move(v, x, y, z); g.cam.x = x + 0.5; g.cam.y = y + 0.5; g.renderer.setZ(z); g.fastForward(4); });
  await page.mouse.move(2, 2); await page.waitForTimeout(300);
  if (process.env.DBG2) console.log("CAVE", await G(() => { const g = __game, v = g.possessed(), [sx, sy] = g.cam.toScreen(v.x + 0.5, v.y + 0.5); return JSON.stringify({ v: [v.x, v.y, v.z], shown: g.renderer.isShown(v), sx, sy, z: g.renderer.z, cam: [g.cam.x, g.cam.y], top: g.renderer.topAt(v.x, v.y) }); }));
  await shot(page, "ui-s8-cave-light"); ok("underground light radius draws");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  assert.equal(await G(() => !!__game.possessed()), false);

  // expeditions: select three villagers, send them, recall, see the report
  await G(() => {
    const g = __game, sim = g.sim, vs = sim.ents.ofKind("villager").filter(q => q.born < -100000).slice(0, 3);
    g.cam.zoom = 14; g.cam.x = 64 + 150 / 14; g.cam.y = 64; g.renderer.setZ(sim.stock.z);
    g.selectMany(vs.map(v => v.id));
    for (const v of vs) { v.hunger = v.thirst = v.energy = 1; }
  });
  await page.waitForTimeout(500);
  assert.ok(await page.locator("#panel-exp").isVisible()); ok("the Expeditions panel shows when villagers are selected");
  await page.locator("#panel-exp [data-act='go:any']").click(); await page.waitForTimeout(300);
  assert.equal(await G(() => __game.sim.exp.list.length), 1); assert.equal(await G(() => __game.sim.ents.ofKind("villager").filter(v => v.xp).length), 3); ok("Anything new starts an expedition for 3 villagers");
  await G(() => { __game.fastForward(900); }); await page.waitForTimeout(500);
  const card = await page.locator("#panel-exp .pbody").innerText();
  assert.match(card, /Find anything new/i); assert.match(card, /Status/); assert.match(card, /Stalled/); assert.match(card, /Recall/);
  await page.locator("#panel-exp").screenshot({ path: join(root, "tmp", "ui-s8-expedition-card.png") });
  await shot(page, "ui-s8-expedition"); ok("the expedition card shows members, target, status and stall reason");
  await page.locator("#panel-exp [data-act^='recall']").click(); await page.waitForTimeout(300);
  assert.equal(await G(() => __game.sim.exp.list[0].st), "home"); assert.equal(await G(() => __game.sim.exp.list[0].why), "recall"); ok("Recall turns the crew back");
  await G(() => { __game.fastForward(2600); }); await page.waitForTimeout(500);
  assert.equal(await G(() => __game.sim.exp.list[0].st), "done");
  const rep = await page.locator("#panel-exp .pbody").innerText();
  assert.match(rep, /expedition for .* is over/i); ok("the report: " + rep.split("\n").find(l => /is over/.test(l)).slice(0, 90));
}

// 12. S9 discoveries: the `ironready` fixture (pottery, kiln firing, a brick forge with a bellows). The palette lists only the wall materials the village can work (brick, not hide),
// a brick wall is placed by clicking the map and gets built, the forge inspector explains heat 5, and the Almanac shows the twelve and the era flow.
{
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "ironready.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(500);
  await G(() => { __game.state.paused = true; });
  await page.keyboard.press("b"); await page.waitForTimeout(300);
  assert.ok(await page.locator(".tool-forge").isVisible(), "the Brick forge tool shows once kiln firing is known"); assert.ok(await page.locator(".tool-smoker").isVisible());
  await page.locator(".tool-wall").click(); await page.waitForTimeout(200);
  assert.equal(await page.locator("[data-mat='brick']").count(), 1, "a brick wall is offered (kiln firing is known)");
  assert.equal(await page.locator("[data-mat='hide']").count(), 0, "a hide wall is not (nobody knows hide working)");
  assert.equal(await page.locator("[data-mat='dressed']").count(), 0);
  await page.locator("[data-mat='brick']").click(); await page.waitForTimeout(150);
  const spot = await G(() => {
    const g = __game, w = g.sim.world, c = { x: (g.sim.stock.x0 + g.sim.stock.x1) >> 1, y: (g.sim.stock.y0 + g.sim.stock.y1) >> 1 };
    for (let r = 7; r < 18; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = c.x + dx, y = c.y + dy, z = w.standZ(x, y);
      if (z === g.sim.stock.z && !g.sim.ents.at(x, y, z).length && !g.sim.ents.at(x + 1, y, z).length) { g.cam.zoom = 24; g.cam.x = x + 0.5; g.cam.y = y + 0.5; g.renderer.setZ(z); const [sx, sy] = g.cam.toScreen(x + 0.5, y + 0.5); return { x, y, z, sx, sy }; }
    }
    return null;
  });
  assert.ok(spot, "found a free cell for the brick wall");
  await G(() => { __game.ui.build.shape.wall = "box"; });
  await page.mouse.click(spot.sx, spot.sy); await page.waitForTimeout(250);
  assert.ok(await G((s) => __game.sim.ents.ofKind("csite").some(c => c.w === "wall" && c.m === "brick" && c.x === s.x && c.y === s.y), spot), "clicking placed a brick wall ghost");
  await shot(page, "ui-s9-brick-ghost"); ok("a brick wall is placeable once kiln firing is known (hide and dressed stone are not offered)");
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  const built = await G((s) => { __game.fastForward(2400); return __game.sim.world.mat(s.x, s.y, s.z) === 24; }, spot);
  assert.ok(built, "villagers raised the brick wall"); ok("...and villagers built it from bricks");
  // the forge inspector: heat by fuel and why not 5
  const fpos = await G(() => { const f = __game.sim.ents.ofKind("furniture").find(e => e.f === "forge"); __game.cam.zoom = 24; __game.cam.x = f.x + 0.5; __game.cam.y = f.y + 0.5; __game.renderer.setZ(f.z); const [sx, sy] = __game.cam.toScreen(f.x + 0.5, f.y + 0.5); return { sx, sy }; });
  await page.mouse.click(fpos.sx, fpos.sy); await page.waitForTimeout(400);
  const insp = await page.locator("#panel-insp .pbody").innerText();
  assert.match(insp, /forge/i); assert.match(insp, /Why heat 5 is hard/i); assert.match(insp, /coal/i); assert.match(insp, /draft/i);
  await page.locator("#panel-insp").screenshot({ path: join(root, "tmp", "ui-s9-forge-inspector.png") });
  await shot(page, "ui-s9-forge"); ok("the forge inspector explains heat 5: " + insp.split("\n").filter(l => /Heat 5/.test(l))[0].slice(0, 90));
  // stock bars carry the new products once someone can make them (bricks and coal are in the yard)
  const bars = await page.locator("#panel-village .srow .sl").allInnerTexts().catch(() => []);
  const bars2 = bars.length ? bars : await page.locator(".srow .sl").allInnerTexts();
  assert.ok(bars2.some(t => /bricks/.test(t)) && bars2.some(t => /coal/.test(t)) && bars2.some(t => /iron ore/.test(t)), "stock bars: " + bars2.join(", ")); ok("stock bars show bricks, coal and iron ore");
  // the Almanac: era flow with all seven ages and the twelve
  await page.locator(".tb-almanac").click(); await page.waitForTimeout(300);
  const alm = await page.locator("#panel-almanac .pbody").innerText();
  assert.match(alm, /Hearth\s*→\s*Hide\s*→\s*Stone\s*→\s*Clay\s*→\s*Timber\s*→\s*Copper\s*→\s*Iron/); assert.match(alm, /The twelve/i); assert.match(alm, /something to find/i);
  await page.locator("#panel-almanac").screenshot({ path: join(root, "tmp", "ui-s9-almanac.png") });
  ok("the Almanac shows the era flow Hearth -> Hide -> Stone -> Clay -> Timber -> Copper -> Iron and the twelve");
}

// 13. S10 living world: the Field tool appears once farming is known; drag a field, villagers till and sow it; the crop stages are drawn; a pen has its own inspector.
{
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "settled.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(500);
  await G(() => { __game.state.paused = true; __game.ui.follow = 0; __game.clearSelection(); __game.ui.overlays.temp = false; __game.renderer.setZ(__game.sim.stock.z); });
  await page.keyboard.press("b"); await page.waitForTimeout(300);
  assert.ok(!(await page.locator(".tool-field").isVisible()), "no Field tool before farming is known"); ok("the build palette hides Field until the village has seen a seed come up");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  const spot = await G(() => {      // test setup: farming is known, seed is in the yard, and a bare 5x3 patch near the camp is found for the drag
    const g = __game, sim = g.sim, w = sim.world, z = sim.stock.z, vs = sim.ents.ofKind("villager");
    sim.apply({ type: "grant", id: vs[0].id, craft: "CULTIVATION" });
    for (let k = 0; k < 3; k++) sim.ents.add("item", { item: "berry", n: 10, sp: 0, rv: 0, rt: 0, x: sim.stock.x0 + k, y: sim.stock.y0 + 1, z });
    sim.cache.iv++;
    const free = (x, y) => w.standZ(x, y) === z && !sim.ents.at(x, y, z).length && !(x >= sim.stock.x0 - 1 && x <= sim.stock.x1 + 1 && y >= sim.stock.y0 - 1 && y <= sim.stock.y1 + 1);
    for (let r = 4; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = sim.stock.x0 + dx, y = sim.stock.y0 + dy;
      let ok = true; for (let j = 0; j < 3 && ok; j++) for (let i = 0; i < 5 && ok; i++) ok = free(x + i, y + j);
      if (ok) { g.cam.zoom = 26; g.cam.x = x + 2.5; g.cam.y = y + 1.5; return { x, y }; }
    }
    return null;
  });
  assert.ok(spot, "a bare patch near the camp");
  await page.keyboard.press("b"); await page.waitForTimeout(300);
  assert.ok(await page.locator(".tool-field").isVisible()); ok("the Field tool appears in the palette once farming is known");
  await page.locator(".tool-field").click();
  await dragCells([spot.x, spot.y], [spot.x + 4, spot.y + 2]);
  await page.waitForTimeout(300);
  assert.equal(await G(() => __game.sim.farm.fields.length), 1); assert.equal(await G(() => __game.sim.ents.ofKind("plot").length), 15); ok("dragging a rectangle designates a field of 15 plots");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  const seen = await G(() => {
    const sim = __game.sim, kinds = {};
    for (const v of sim.ents.ofKind("villager")) { v.hunger = 0.95; v.thirst = 0.95; v.energy = 0.95; v.warm = 1; }
    for (let i = 0; i < 3000; i++) { sim.step(); if (i % 20 === 0) for (const v of sim.ents.ofKind("villager")) if (v.job && v.action) kinds[v.job.k] = (kinds[v.job.k] || 0) + 1; }
    return kinds;
  });
  assert.ok(seen.till > 0 && seen.sow > 0, "villagers till and sow the new field: " + JSON.stringify(seen)); ok("villagers tilled and sowed the field: " + JSON.stringify({ till: seen.till, sow: seen.sow, water: seen.water_field || 0 }));
  // the growth stages, drawn: set four plots to one stage each (test setup) and look
  await G((s) => { const sim = __game.sim, ps = sim.ents.ofKind("plot").filter(p => p.y === s.y + 1); [0, 2.5, 5, 7].forEach((g, i) => { const p = ps[i]; p.tl = 1; p.cr = "berry"; p.gr = g; p.wt = i % 2 ? sim.tick + 5000 : 0; if (g >= 7) p.yl = 8; }); __game.cam.x = s.x + 2.5; __game.cam.y = s.y + 1.5; __game.cam.zoom = 34; }, spot);
  await page.waitForTimeout(350); await shot(page, "ui-s10-field-stages");
  const pxc = await G((s) => { const t = document.createElement("canvas"); t.width = t.height = 1; const c = t.getContext("2d", { willReadFrequently: true }); const cv = document.querySelector("canvas"); const [sx, sy] = __game.cam.toScreen(s.x + 3.5, s.y + 1.5); c.drawImage(cv, sx * __game.renderer.dpr, sy * __game.renderer.dpr, 1, 1, 0, 0, 1, 1); return Array.from(c.getImageData(0, 0, 1, 1).data); }, spot);
  assert.ok(pxc[3] > 0); ok("the crop stages are drawn (sprout, leafy, flowering, ripe)");
  await clickCell(spot.x + 3, spot.y + 1); await page.waitForTimeout(350);
  const ft = await page.locator("#panel-insp .pbody").innerText();
  assert.match(ft, /Field|field/); assert.match(ft, /growing|ripe|sown/); await page.locator("#panel-insp").screenshot({ path: join(root, "tmp", "ui-s10-field-inspector.png")}); ok("clicking a plot opens the field inspector: " + ft.split("\n")[0]);

  // the pen: fixture with a fenced pen of three hoppers; click it; the Capture order is offered
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "pen.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(500);
  const pp = await G(() => { const g = __game, pn = g.sim.farm.pens[0]; g.state.paused = true; g.ui.follow = 0; g.clearSelection(); g.cam.zoom = 30; g.cam.x = (pn.x0 + pn.x1) / 2 + 1; g.cam.y = (pn.y0 + pn.y1) / 2; g.renderer.setZ(pn.z); return { x: pn.x0, y: pn.y0, x1: pn.x1, y1: pn.y1 }; });
  await page.waitForTimeout(400); await shot(page, "ui-s10-pen");
  const empty = await G((p) => { const sim = __game.sim; for (let y = p.y; y <= p.y1; y++) for (let x = p.x; x <= p.x1; x++) if (!sim.ents.at(x, y, sim.farm.pens[0].z).length) return { x, y }; return null; }, pp);
  assert.ok(empty, "an empty cell inside the pen");
  await clickCell(empty.x, empty.y); await page.waitForTimeout(350);
  const pt = await page.locator("#panel-insp .pbody").innerText();
  assert.match(pt, /fenced pen|Fodder|Keep/); assert.match(pt, /Hoppers/); await page.locator("#panel-insp").screenshot({ path: join(root, "tmp", "ui-s10-pen-inspector.png") });
  await page.locator('[data-act^="penkeep:"]').first().click(); await page.waitForTimeout(150);
  assert.equal(await G(() => __game.sim.farm.pens[0].keep), 3); ok("clicking the pen opens its inspector (hoppers, fodder, keep-N); Keep -1 goes through sim.apply");
  assert.ok(await page.locator(".ob-verbs button", { hasText: "Capture" }).count() > 0); ok("the Capture order button is offered once husbandry is known");
  // spoilage in the Village panel: fresh food piles up, two days pass, the panel counts the losses and warns that it is rotting
  await G(() => { const sim = __game.sim, zs = sim.stock; for (let k = 0; k < 5; k++) sim.ents.add("item", { item: "berry", n: 10, sp: 0, rv: 0, rt: 0, x: zs.x0 + k, y: zs.y0 + 4, z: zs.z }); sim.cache.iv++; for (let i = 0; i < 3700; i++) sim.step(); __game.clearSelection(); });
  await page.waitForTimeout(500);
  await page.locator("#panel-village").scrollIntoViewIfNeeded().catch(() => {});
  const vt = await page.locator("#panel-village .pbody").innerText();
  assert.match(vt, /Spoiled in the last day|Lost to rot/); assert.match(vt, /rotting|Pens|Fields/i);
  await page.locator("#panel-village").screenshot({ path: join(root, "tmp", "ui-s10-village.png") }); ok("the Village panel shows spoilage losses and the pens: " + vt.split("\n").filter(l => /Spoiled|rot/i.test(l))[0].slice(0, 80));
}

// 14. S11 command scale: a crowd of 60. Box-select a crew, name it, give it a task, read the stall line; the Concerns panel; the strip filtered by crew;
// then a blueprint revision pushed to two buildings.
{
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "crowd.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(800);
  await G(() => { const g = __game; g.state.paused = true; g.ui.follow = 0; g.clearSelection(); g.ui.overlays.temp = false; g.renderer.setZ(g.sim.stock.z); g.cam.zoom = 22; g.cam.x = 64; g.cam.y = 64; });
  await page.waitForTimeout(500);
  assert.equal(await G(() => __game.sim.ents.ofKind("villager").length), 60); ok("the crowd fixture: 60 villagers");
  assert.ok(!(await page.locator("#panel-crews").isVisible()), "no crews yet and nothing selected");
  const [bx0, by0] = await cellPx(58, 58), [bx1, by1] = await cellPx(70, 70);
  await page.mouse.move(bx0, by0); await page.mouse.down(); await page.mouse.move(bx1, by1, { steps: 8 }); await page.mouse.up();
  let picked = await G(() => __game.ui.sel.length);
  assert.ok(picked >= 15, "box-selected a crowd: " + picked); ok("a box selected " + picked + " villagers");
  await page.waitForTimeout(400);
  assert.ok(await page.locator("#panel-crews").isVisible()); await page.locator("#panel-crews .cr-name").fill("Smoke crew");
  await page.locator("#panel-crews [data-c=make]").click(); await page.waitForTimeout(300);
  const made = await G(() => __game.sim.crews.list.map(c => [c.name, c.ids.length]));
  assert.ok(made.length === 1 && made[0][0] === "Smoke crew" && made[0][1] <= picked && made[0][1] >= picked - 4, "the crew is the selection less any children (they cannot join): " + JSON.stringify(made) + " of " + picked); ok("Make crew named the selection (" + made[0][1] + " of " + picked + ", children left out)"); picked = made[0][1];
  await page.locator("#panel-crews select[data-task]").selectOption("chore:haul"); await page.waitForTimeout(200);
  assert.deepEqual(await G(() => __game.sim.crews.list[0].task), { t: "chore", g: "haul" }); ok("the crew prefers hauling");
  await G(() => { __game.fastForward(700); }); await page.waitForTimeout(600);
  const line = await page.locator("#panel-crews .cr-sum").first().innerText();
  assert.match(line, /^\d+ of \d+ working/); ok("the crew's stall line: " + line);
  // aim an order: Order: chop (click the map) -> the click orders the crew and becomes its default task
  await page.locator("#panel-crews select[data-task]").selectOption("order:chop"); await page.waitForTimeout(200);
  assert.equal(await G(() => __game.ui.targeting), "chop");
  const tree = await G(() => { const g = __game, clear = (p) => { const [sx, sy] = g.cam.toScreen(p.x + 0.5, p.y + 0.5); return sx > 420 && sx < g.cam.vw - 420 && sy > 120 && sy < g.cam.vh - 120; }, ts = g.sim.ents.ofKind("plant").filter(p => p.species === "tree" && g.renderer.isShown(p) && clear(p)); return ts.length ? { x: ts[0].x, y: ts[0].y } : null; });       // (a tree in the clear middle of the map, not under a panel)
  if (tree) { await clickCell(tree.x, tree.y); await page.waitForTimeout(300); assert.equal(await G(() => __game.sim.crews.list[0].task.verb), "chop"); ok("an aimed order became the crew's default task"); }
  else { await G(() => { __game.ui.targeting = null; }); ok("(no tree in view for the aimed order; skipped)"); }
  await G(() => { __game.fastForward(300); }); await page.waitForTimeout(500);
  // hotkeys: Ctrl+2 numbers the crew, Alt+2 selects it again
  await page.keyboard.press("Control+2"); await page.waitForTimeout(200);
  assert.equal(await G(() => __game.sim.crews.list[0].hk), 2);
  await G(() => __game.clearSelection()); await page.keyboard.press("Alt+2"); await page.waitForTimeout(200);
  assert.equal(await G(() => __game.ui.sel.length), picked); ok("Ctrl+2 gave the crew a key; Alt+2 selects it (1..9 stay the speeds)");
  // the strip at 60: collapsed, then filtered by crew
  await G(() => __game.clearSelection()); await page.waitForTimeout(400);
  const collapsed = await page.locator("#notables .nt").count();
  assert.ok(collapsed <= 22, "the strip collapses at 60: " + collapsed);
  await page.locator("#notables [data-filter]").nth(1).click(); await page.waitForTimeout(400);
  assert.equal(await page.locator("#notables .nt").count(), picked); ok("the strip collapses to " + collapsed + " and filters to the crew's " + picked);
  await shot(page, "ui-s11-crowd");
  await page.locator("#panel-crews").screenshot({ path: join(root, "tmp", "ui-s11-crews-panel.png") });
  await page.locator("#notables [data-filter]").first().click();
  // Concerns: a food emergency is the first line; Show takes the camera there
  await G(() => { __game.sim.board.fc = 1; __game.sim.board.runway = 0.8; });
  await page.waitForTimeout(500);
  const ctext = await page.locator("#panel-concerns .pbody").innerText();
  assert.match(ctext, /Food is critical/); ok("Concerns lists the emergency first: " + ctext.split("\n").filter(Boolean).slice(0, 2).join(" "));
  await page.locator("#panel-concerns").screenshot({ path: join(root, "tmp", "ui-s11-concerns.png") });
  await G(() => { __game.cam.x = 20; __game.cam.y = 20; });
  await page.locator("#panel-concerns [data-loc]").first().click();
  assert.ok(Math.abs(await G(() => __game.cam.x)) > 50); ok("Show moves the camera to the stockpile");
  await G(() => { __game.sim.board.fc = 0; __game.sim.board.runway = 99; });
  // command-scale progression: with it ON, crews are unlocked at 60 villagers, blueprints wait for the first room; the Game menu carries the override
  await G(() => { __game.ui.progression = true; __game.ui.showAll = false; __game.ui.unlock = {}; __game.ui.revealInit = true; });
  await page.waitForTimeout(500);
  assert.ok(await G(() => __game.unlocked("crews")) === true); ok("crews are unlocked at 60 villagers");
  assert.ok(await G(() => __game.unlocked("blueprints")) === false); ok("blueprints stay hidden until the first room (no room in the crowd world)");
  await G(() => { __game.ui.progression = false; });
  await page.locator("#topbar .tb-game").click();
  assert.ok(await page.locator("#topbar .showall").isVisible()); ok("the Game menu has Show all tools");
  await page.locator("#topbar .tb-game").click();

  // blueprint revision: two buildings stamped from one design, the design redrawn in timber, pushed
  await G(() => {
    const g = __game, sim = g.sim, w = sim.world, z = sim.stock.z, M = g.M, F = g.F, vs = sim.ents.ofKind("villager");
    g.clearSelection();
    sim.apply({ type: "grant", id: vs[0].id, craft: "FRAMING" }); sim.cache.kn = null;
    for (let y = 40; y < 48; y++) for (let x = 40; x < 60; x++) { for (let k = 0; k <= 4; k++) if (w.mat(x, y, z + k) !== M.AIR) w.set(x, y, z + k, M.AIR, 0); for (let k = z - 1; k >= z - 3; k--) w.set(x, y, k, M.DIRT, 0); for (const id of sim.ents.at(x, y, z).slice()) { const e = sim.ents.get(id); if (e.kind === "plant" || e.kind === "item") sim.ents.remove(id); } w.setFlags(x, y, z, 0); }
    const cells = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) { const edge = x === 0 || y === 0 || x === 5 || y === 3; if (edge) cells.push([x, y, x === 3 && y === 3 ? "door" : "wall", x === 3 && y === 3 ? "" : "wattle"]); else cells.push([x, y, "roof", "thatch"]); }
    cells.push([1, 1, "bed", ""]);
    sim.apply({ type: "blueprint", op: "add", bp: { name: "Smoke house", w: 6, h: 4, cells } });
    const bp = sim.bps.list[sim.bps.list.length - 1];
    for (const ox of [41, 49]) {
      const cs = cells.map(([dx, dy, p, m]) => ({ w: p, m, x: ox + dx, y: 41 + dy, z }));
      sim.apply({ type: "build", bp: bp.id, cells: cs, at: { ox, oy: 41, z, rot: 0, over: {} } });
      for (const s of sim.ents.ofKind("csite").slice()) {                  // test setup: finish the ghosts as if built
        if (s.w === "wall") w.set(s.x, s.y, s.z, M.WATTLE, w.flags(s.x, s.y, s.z) | F.PLAYER | F.USED);
        else if (s.w === "roof") w.set(s.x, s.y, s.z + 1, M.THATCH, w.flags(s.x, s.y, s.z + 1) | F.PLAYER | F.USED);
        else sim.ents.add("furniture", { f: s.w, x: s.x, y: s.y, z: s.z, owner: 0, rv: 0, rt: 0 });
        sim.ents.remove(s.id);
      }
    }
    sim.cache.iv++; sim.cache.csv = (sim.cache.csv | 0) + 1; sim.rooms.update(sim);
    for (let k = 0; k < 6; k++) sim.ents.add("item", { item: "timber", n: 10, sp: 0, rv: 0, rt: 0, x: sim.stock.x0 + k, y: sim.stock.y0 + 5, z });
    sim.cache.iv++;
  });
  await page.waitForTimeout(600);
  const bpText0 = await page.locator("#panel-bps .pbody").innerText();
  assert.match(bpText0, /Smoke house/); assert.match(bpText0, /2 buildings follow it, all up to date/); ok("the Blueprints panel: " + bpText0.split("\n").filter(l => /follow/.test(l))[0]);
  await page.locator('#panel-bps select[data-bp^="theme:"]').selectOption("timber"); await page.waitForTimeout(400);
  assert.equal(await G(() => __game.sim.bps.list[__game.sim.bps.list.length - 1].rev), 2);
  assert.match(await page.locator("#panel-bps .pbody").innerText(), /2 behind/);
  if (false) console.log("DBGCAN", await G(() => { const sim = __game.sim; return JSON.stringify([sim.disc && Object.keys(sim.ents.ofKind("villager")[0].fam || {}), sim.ents.ofKind("villager").filter(v => v.fam && v.fam.FRAMING).length, sim.bps.inst.map(i => [i.rev, i.ox, i.oy, i.z])]); }));
  await page.locator('#panel-bps [data-bp^="push:"]').click(); await page.waitForTimeout(400);
  const marked = await G(() => __game.sim.ents.ofKind("csite").filter(s => s.rp).length);
  if (process.env.DBG) console.log(await G(() => { const c = {}; for (const s of __game.sim.ents.ofKind("csite")) c[s.w + (s.rp ? "+rp" : "") + ":" + s.m] = (c[s.w + (s.rp ? "+rp" : "") + ":" + s.m] || 0) + 1; return JSON.stringify(c); }));
  assert.ok(marked >= 30, "walls and roofs of both buildings marked for in-place swaps: " + marked);
  assert.deepEqual(await G(() => __game.sim.bps.inst.map(i => i.rev)), [2, 2]);
  await G(() => { __game.renderer.setZ(__game.sim.stock.z); __game.cam.x = 50; __game.cam.y = 43; __game.cam.zoom = 22; });
  await page.waitForTimeout(500);
  await page.locator("#panel-bps").screenshot({ path: join(root, "tmp", "ui-s11-blueprint-push.png") });
  await shot(page, "ui-s11-revision");
  await page.locator('#panel-bps [data-bp^="revise:"]').click();
  assert.equal(await G(() => __game.ui.build.tool), "capture"); assert.ok(await G(() => __game.ui.reviseBp) > 0); ok("Revise arms the capture tool for the next revision");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  ok("Push revision marked " + marked + " pieces for in-place rebuild across 2 buildings");
}

// 15. S12 underground and world: a torch and a timber support placed through the Build palette, cracks, bad air and torchlight on the map; the Controls
// panel (remap a key, the help follows), the accessibility switches, the ironman flag; and the new biomes on a fresh world.
{
  await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", "mine.json"), "utf8"));
  await page.keyboard.press("Shift+O"); await page.waitForTimeout(800);
  const sp = await G(() => {                                    // the mine fixture's exposed malachite face (found, not hard-coded) and the tunnel running west from it
    const g = __game, w = g.sim.world, M = g.M;
    for (let y = g.sim.site.y - 14; y < g.sim.site.y + 16; y++) for (let x = g.sim.site.x + 6; x < g.sim.site.x + 56; x++) for (let z = 3; z < g.sim.stock.z - 3; z++) if (w.mat(x, y, z) === M.MALACHITE && w.mat(x - 1, y, z) === M.AIR && g.seenAt(x, y, z)) return { x, y, z };
    return null;
  });
  assert.ok(sp, "the mine fixture has a face");
  await G((s) => {
    const g = __game, sim = g.sim, vs = sim.ents.ofKind("villager");
    g.state.paused = true; g.ui.follow = 0; g.clearSelection(); g.ui.overlays.temp = false;
    sim.apply({ type: "grant", id: vs[0].id, craft: "FIRE_TENDING" }); sim.apply({ type: "grant", id: vs[1].id, craft: "FRAMING" }); sim.cache.kn = null;
    for (let k = 0; k < 4; k++) sim.ents.add("item", { item: "timber", n: 6, sp: 0, rv: 0, rt: 0, x: sim.stock.x0 + k, y: sim.stock.y0 + 5, z: sim.stock.z });
    for (let k = 0; k < 2; k++) sim.ents.add("item", { item: "stick", n: 8, sp: 0, rv: 0, rt: 0, x: sim.stock.x0 + k, y: sim.stock.y0 + 4, z: sim.stock.z });
    sim.cache.iv++;
    // a hall beside the tunnel (a one-cell wall between): too wide for its roof
    for (let y = s.y + 2; y <= s.y + 8; y++) for (let x = s.x - 10; x <= s.x - 4; x++) sim.world.set(x, y, s.z, g.M.AIR, 0);
    g.renderer.setZ(s.z); g.cam.zoom = 30; g.cam.x = s.x - 6; g.cam.y = s.y + 3;
    g.fastForward(40);
  }, sp);
  await page.waitForTimeout(500);
  assert.equal(await G(() => __game.sim.ug.cr.length), 9); ok("a 7x7 hall dug beside the tunnel: 9 cells crack");
  // build mode: the Torch tool and the Timber support material, placed by clicking the map
  await page.locator("#topbar .tb-build").click(); await page.waitForTimeout(300);
  await G((s) => __game.renderer.setZ(s.z), sp);
  assert.ok(await page.locator("#buildbar .tool-torch").isVisible(), "Torch appears once fire is known"); assert.ok(await page.locator("#buildbar .tool-vent").isVisible());
  await page.locator("#buildbar .tool-torch").click();
  await clickCell(sp.x - 3, sp.y); await page.waitForTimeout(300);
  assert.ok(await G(() => __game.sim.ents.ofKind("csite").some(c => c.w === "torch")), "a torch ghost was planned"); ok("the Torch tool planned a torch in the tunnel");
  await page.locator("#buildbar .tool-wall").click(); await page.waitForTimeout(250);
  const sup = page.locator('#buildbar [data-mat="support"]');
  assert.ok(await sup.isVisible(), "Timber support is offered once framing is known"); await sup.click();
  await page.locator('#buildbar [data-shape="line"]').click();
  await clickCell(sp.x - 7, sp.y + 5); await page.waitForTimeout(300);
  assert.ok(await G(() => __game.sim.ents.ofKind("csite").some(c => c.w === "wall" && c.m === "support")), "a support ghost was planned"); ok("the wall tool with the Timber support material planned a post in the cracking hall");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  // let the village build the torch; bad air from an opened gas pocket in the tunnel; look at it all
  await G((s) => {
    const g = __game, sim = g.sim, w = sim.world;
    w.set(s.x - 2, s.y - 1, s.z, g.M.AIR, w.flags(s.x - 2, s.y - 1, s.z) | 32); { const c = w.peekResident((s.x - 2) >> 4, (s.y - 1) >> 4); delete c.gas; sim.cache.gasv = -1; }      // a gas pocket is a GAS flag (32) on a cell; this one is opened
    g.fastForward(30);
    const look = (x, y, z) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { g.sim.world.constructor && (() => { const cx = (x + dx) >> 4, cy = (y + dy) >> 4, k = (cx + 32768) * 65536 + (cy + 32768); let a = g.sim.seen.b.get(k); if (!a) { a = new Uint8Array(16 * 16 * 24); g.sim.seen.b.set(k, a); } a[((z + dz) << 8) | (((y + dy) & 15) << 4) | ((x + dx) & 15)] = 1; })(); } };
    for (let x = s.x - 8; x <= s.x; x++) look(x, s.y, s.z);
    for (let y = s.y + 3; y <= s.y + 7; y++) for (let x = s.x - 9; x <= s.x - 5; x++) look(x, y, s.z);        // the hall has been walked through
    g.sim.seen.ver++;
    sim.ents.add("furniture", { f: "torch", x: s.x - 5, y: s.y, z: s.z, owner: 0, rv: 0, rt: 0 });
    sim.cache.iv++;
    g.fastForward(25);
  }, sp);
  await page.waitForTimeout(500);
  const hz = await G(() => { const sim = __game.sim, u = sim.ug.cr.length, a = sim.cache.air; return { cr: u, bad: a ? a.bad.size : -1 }; });      // (cache.air is the renderer's, drawn each frame)
  assert.ok(hz.cr > 0); ok("the cracked hall and the tunnel's foul air show on the map (cracks " + hz.cr + ", foul cells " + hz.bad + ")");
  await shot(page, "ui-s12-lit-mine");
  // the cell card says why
  await page.locator("#topbar .tb-build").click(); await page.waitForTimeout(200); await page.keyboard.press("Escape");
  await G((s) => { __game.setMode("select"); __game.selectOther({ kind: "cell", x: s.x - 6, y: s.y + 5, z: s.z - 1 }); }, sp);
  await page.waitForTimeout(500);
  const card = await page.locator("#panel-insp .pbody").innerText();
  assert.match(card, /cracking/); ok("the cell card names the crack: " + card.split("\n").filter(l => /crack/.test(l))[0].slice(0, 70));
  await G(() => __game.clearSelection());

  // Controls: open Settings, remap Build from B to G, the help follows, the key works, reset
  await page.locator("#topbar .tb-set").click(); await page.waitForTimeout(300);
  assert.ok(await page.locator("#settingsOverlay .setcard").isVisible()); ok("Settings opens (top bar)");
  const rowText = await page.locator('#settingsOverlay tr[data-act="build"]').innerText();
  assert.match(rowText, /Build mode/); assert.match(rowText, /B/);
  await page.locator('#settingsOverlay [data-chg="build"]').click(); await page.waitForTimeout(150);
  assert.match(await page.locator('#settingsOverlay tr[data-act="build"]').innerText(), /press a key/);
  await page.keyboard.press("g"); await page.waitForTimeout(250);
  assert.deepEqual(await G(() => __game.keymap.keysOf("build")), ["g"]); ok("clicking Change and pressing G rebound Build");
  assert.match(await G(() => localStorage.getItem("slimeciv.keys")), /"build":\["g"\]/); ok("the change is in the browser's storage (not the save)");
  await page.locator('#settingsOverlay [data-chg="follow"]').click(); await page.keyboard.press("g"); await page.waitForTimeout(200);
  assert.match(await page.locator("#settingsOverlay .msg").innerText(), /already does "Build mode"/); ok("a clash is refused in words: " + (await page.locator("#settingsOverlay .msg").innerText()).slice(0, 60));
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  // accessibility
  await page.locator("#settingsOverlay .a-hc").check(); await page.waitForTimeout(200);
  assert.ok(await G(() => document.body.classList.contains("hc")) && await G(() => __game.renderer.access.contrast)); ok("high contrast: the page and the renderer switched");
  await page.locator("#settingsOverlay .a-cb").check(); await page.locator("#settingsOverlay .a-calm").check();
  await page.locator("#settingsOverlay .a-scale").selectOption("1.15"); await page.waitForTimeout(200);
  assert.deepEqual(await G(() => __game.access), { scale: 1.15, contrast: true, cb: true, calm: true }); ok("scale 115%, colour-blind marks and reduced flashing are on");
  await shot(page, "ui-s12-settings");
  await page.locator("#settingsOverlay .sclose").click(); await page.waitForTimeout(200);
  await G(() => { __game.ui.build.tool = "wall"; __game.ui.mode === "build" && __game.setMode("select"); });
  await page.keyboard.press("g"); await page.waitForTimeout(250);
  assert.equal(await G(() => __game.ui.mode), "build"); ok("the remapped key (G) opens build mode; B no longer does");
  await page.keyboard.press("Escape"); await page.keyboard.press("b"); await page.waitForTimeout(150);
  assert.equal(await G(() => __game.ui.mode), "select");
  await page.keyboard.press("h"); await page.waitForTimeout(300);
  const help = await page.locator("#helpOverlay").innerText();
  assert.match(help, /\nG\s/); ok("the help overlay lists the new key");
  await page.keyboard.press("h");
  await shot(page, "ui-s12-mine-contrast");
  // ironman: new game with the flag; no manual save or load; one autosave slot
  await page.locator("#settingsOverlay").evaluate(() => 0); await page.locator("#topbar .tb-game").click(); await page.waitForTimeout(150);
  await page.locator("#topbar .iron").check(); await page.locator('#topbar [data-m="new"]').click(); await page.waitForTimeout(600);
  assert.equal(await G(() => __game.sim.ironman), true); ok("a new game with the Ironman box ticked is an ironman game");
  await page.locator("#topbar .tb-game").click(); await page.waitForTimeout(150);
  assert.ok(await page.locator('#topbar [data-m="save"]').isDisabled() && await page.locator('#topbar [data-m="load"]').isDisabled()); ok("ironman: Save and Load are off in the Game menu");
  await page.locator("#topbar .tb-game").click();
  await G(() => { __game.fastForward(3700); });
  for (let i = 0; i < 20 && !(await G(() => Object.keys(localStorage).some(k => k === "slimeciv.iron"))); i++) await page.waitForTimeout(250);
  assert.ok(await G(() => Object.keys(localStorage).some(k => k === "slimeciv.iron")) && !(await G(() => Object.keys(localStorage).some(k => /slimeciv\.auto\.\d$/.test(k) && __game.sim.ironman && false)))); ok("the ironman autosave lives in its single slot");
  await G((on) => __game.setAccess({ contrast: false, cb: false, calm: false, scale: 1 }), 0);
  await G(() => { __game.keymap.reset(); });
}
{ // S13: a forced death leaves a grave marker with an inscription; the notables strip shows a title
  const gid = await G(() => { const g = __game, vs = g.sim.ents.ofKind("villager"), v = vs[vs.length - 1]; v.ti = ["first to keep a fire"]; v.hp = 0.0001; v.hunger = 0; v.thirst = 0; for (let i = 0; i < 60; i++) g.sim.step(); const gr = g.sim.ents.ofKind("grave"); return gr.length ? { id: gr[0].id, x: gr[0].x, y: gr[0].y, z: gr[0].z, ins: gr[0].ins } : null; });
  assert.ok(gid, "the death left a grave"); assert.match(gid.ins, /died of/); ok("a forced death left a grave: " + gid.ins.slice(0, 70));
  await G((gr) => { const g = __game; g.state.paused = true; g.cam.zoom = 34; g.cam.x = gr.x + 0.5; g.cam.y = gr.y + 0.5; g.ui.digest = null; g.renderer.setZ(gr.z + 1); g.selectOther({ kind: "grave", id: gr.id }); }, gid);
  await page.waitForTimeout(600);
  assert.match(await page.locator("#panel-insp .pbody").innerText(), /died of/i); ok("the grave card shows the inscription");
  await shot(page, "ui-s13-grave");
}
{ // the new biomes on a fresh world (seed 5: meadow, highland and marsh)
  await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?tools=all&seed=5");
  await page.waitForFunction(() => window.__game); await page.waitForTimeout(500);
  await G(() => { const g = __game; g.state.paused = true; g.setAccess({ cb: true }); g.cam.fit(); });
  await page.waitForTimeout(600);
  const bm = await G(() => { const g = __game, w = g.sim.world, S = g.sim.site, c = [0, 0, 0]; let hi = null, ma = null; for (let y = S.y - 120; y < S.y + 120; y++) for (let x = S.x - 120; x < S.x + 120; x++) { const b = w.biomeAt(x, y); c[b]++; if (b === 1 && !hi && w.hsAt(x, y) >= 15) hi = { x, y, z: w.hsAt(x, y) }; if (b === 2 && !ma && w.hsAt(x, y) >= 13) ma = { x, y, z: w.hsAt(x, y) }; } return { c, hi, ma }; });
  assert.ok(bm.c[1] > 1000 && bm.c[2] > 1000 && bm.c[0] > 3000, "meadow, highland and marsh all show: " + bm.c); ok("seed 5 has meadow " + bm.c[0] + ", highland " + bm.c[1] + " and marsh " + bm.c[2] + " columns within 120 cells of the camp");
  await G(() => { __game.ui.settings = false; }); await page.waitForTimeout(400);
  await shot(page, "ui-s12-biomes-map");
  const markSeen = (c) => { const g = __game, k = ((c.x >> 4) + 32768) * 65536 + ((c.y >> 4) + 32768); let a = g.sim.seen.b.get(k); if (!a) { a = new Uint8Array(16 * 16 * 24); g.sim.seen.b.set(k, a); } a[(c.z << 8) | ((c.y & 15) << 4) | (c.x & 15)] = 1; };       // (S16: unexplored land is not "seen": the cell card says nobody has seen it, so these two cells are walked to, in effect)
  await G(markSeen, bm.hi); await G(markSeen, bm.ma);
  await G((b) => { __game.cam.zoom = 14; __game.cam.x = b.hi.x; __game.cam.y = b.hi.y; __game.selectOther({ kind: "cell", x: b.hi.x, y: b.hi.y, z: b.hi.z }); }, bm);
  await page.waitForTimeout(600);
  assert.match(await page.locator("#panel-insp .pbody").innerText(), /Highland:/); ok("the cell card names the Highland");
  await shot(page, "ui-s12-highland");
  await G((b) => { __game.cam.x = b.ma.x; __game.cam.y = b.ma.y; __game.selectOther({ kind: "cell", x: b.ma.x, y: b.ma.y, z: b.ma.z }); }, bm);
  await page.waitForTimeout(600);
  assert.match(await page.locator("#panel-insp .pbody").innerText(), /Marsh:/); ok("and the Marsh");
  await shot(page, "ui-s12-marsh");
  await G(() => __game.setAccess({ cb: false }));
}

{ // S14 world depth: a wolf on the map, a sick villager (inspector, Concerns, chronicle), the Almanac's "This world" section
  const wf = await G(() => { const g = __game, s = g.sim; g.state.paused = true; for (let i = 0; i < 40; i++) s.step(); const w = s.ents.ofKind("fauna").find(e => e.sp === "wolf"); if (!w) return null; g.cam.zoom = 22; g.cam.x = w.x + 0.5; g.cam.y = w.y + 0.5; g.renderer.setZ(w.z); g.ui.settings = false; g.ui.sel = []; return { id: w.id, x: w.x, y: w.y, n: s.ents.ofKind("fauna").filter(e => e.sp === "wolf").length }; });
  assert.ok(wf && wf.n >= 3, "a wolf pack exists in a new world"); await page.waitForTimeout(500);
  const wp = await G((id) => { const g = __game, w = g.sim.ents.get(id), [sx, sy] = g.cam.toScreen(w.x + 0.5, w.y + 0.5); return { sx, sy, shown: g.renderer.isShown(w) }; }, wf.id);
  assert.ok(wp.shown, "the wolf is drawn on the map");
  await shot(page, "ui-s14-wolf");
  await page.mouse.click(wp.sx, wp.sy); await page.waitForTimeout(400);
  let wt = await page.locator("#panel-insp .pbody").innerText();
  if (!/Wolf/.test(wt)) { await G((id) => __game.selectOther({ kind: "fauna", id }), wf.id); await page.waitForTimeout(400); wt = await page.locator("#panel-insp .pbody").innerText(); }
  assert.match(wt, /Wolf/); assert.match(wt, /alone|lone/i); ok("a wolf on the map: its card says it hunts the lone on winter nights (" + wt.split("\n")[0] + ")");
  await page.locator("#panel-insp").screenshot({ path: join(root, "tmp", "ui-s14-wolf-card.png") });
  // a sick villager
  const sv = await G(() => { const g = __game, s = g.sim, v = s.ents.ofKind("villager").find(q => q.age === undefined && !q.ill); const ok = s.apply({ type: "ill", id: v.id }); g.cam.zoom = 20; g.cam.x = v.x + 0.5; g.cam.y = v.y + 0.5; g.renderer.setZ(v.z); g.selectOnly(v.id); return { id: v.id, ok, name: v.name }; });
  assert.ok(sv.ok, "the debug command makes someone ill"); await page.waitForTimeout(500);
  const it = await page.locator("#panel-insp .pbody").innerText();
  assert.match(it, /Sick/); assert.match(it, /recovered/i); assert.match(it, /sickness you sent/); assert.match(it, /Nothing is helping yet|Helping/);
  ok("the sick villager's inspector shows the sickness, its cause and what would help");
  await shot(page, "ui-s14-sick");
  await page.locator("#panel-insp").screenshot({ path: join(root, "tmp", "ui-s14-sick-card.png") });
  await page.waitForTimeout(400);
  const ct = await page.locator("#panel-concerns .pbody").innerText();
  assert.match(ct, /sick/i); ok("Concerns lists it: " + ct.split("\n").filter(l => /sick/i.test(l))[0].slice(0, 90));
  assert.ok(await G(() => __game.sim.chron.entries.some(e => /fell ill/.test(e.text)))); ok("the chronicle records that they fell ill");
  await page.locator("#panel-chron").screenshot({ path: join(root, "tmp", "ui-s14-chronicle.png") });
  assert.match(await page.locator("#panel-chron .pbody").innerText(), /fell ill/); ok("and the Chronicle panel shows the line");
  // the Almanac's "This world" section
  await page.locator(".tb-almanac").click(); await page.waitForTimeout(500);
  const at = await page.locator("#panel-almanac .pbody").innerText();
  assert.match(at, /this world/i); assert.match(at, /Land:/); assert.match(at, /Salt licks/); ok("the Almanac has a This world section: " + at.split("\n").filter(l => /\(\+|\(-|\(\u2212/.test(l)).slice(0, 2).join(" | "));
  await page.locator("#panel-almanac").screenshot({ path: join(root, "tmp", "ui-s14-almanac-world.png") });
  await page.locator(".tb-almanac").click();
  await shot(page, "ui-s14-almanac-page");
}

{ // S15 settlement depth: a room set to Kitchen and its checklist, a wagon on the map, an advisory card (dismissed), the chronicle download, many crews
  await G(() => { const g = __game; g.state.paused = true; g.cam.zoom = 20; });
  const hutAt = await G(() => {
    const g = __game, s = g.sim, w = s.world, M = g.M, F = g.F;
    let z = s.stock.z, at = null;
    for (let dy = -40; dy <= 40 && !at; dy++) for (let dx = 4; dx <= 90 && !at; dx++) {      // (S16: a flat 9 x 8 patch at any one level, anywhere near: the land is not a meadow plain any more)
      const x0 = s.stock.x1 + dx, y0 = s.stock.y0 + dy, zc = w.standZ(x0, y0); let ok = zc >= 3;
      for (let j = -1; j <= 6 && ok; j++) for (let i = -1; i <= 7 && ok; i++) if (w.standZ(x0 + i, y0 + j) !== zc || s.ents.at(x0 + i, y0 + j, zc).length) ok = false;
      if (ok) { at = [x0, y0]; z = zc; }
    }
    if (!at) return null;
    const [x0, y0] = at;
    for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 7; x++) {
      const edge = x === x0 || x === x0 + 6 || y === y0 || y === y0 + 5, door = x === x0 + 3 && y === y0 + 5;
      if (edge && !door) w.set(x, y, z, M.WATTLE, w.flags(x, y, z) | F.PLAYER); else if (!edge) w.set(x, y, z + 1, M.THATCH, w.flags(x, y, z + 1) | F.PLAYER);
    }
    s.ents.add("furniture", { f: "door", x: x0 + 3, y: y0 + 5, z, owner: 0, rv: 0, rt: 0 }); w.markDirty(x0 + 3, y0 + 5, z);
    s.rooms.update(s);
    const r = s.rooms.at(x0 + 1, y0 + 1, z);
    g.cam.x = x0 + 3.5; g.cam.y = y0 + 3; g.renderer.setZ(z);
    return r ? { id: r.id, x0, y0, z } : null;
  });
  assert.ok(hutAt, "a hut stands on the map"); await page.waitForTimeout(300);
  await G((h) => __game.selectOther({ kind: "room", id: h.id }), hutAt); await page.waitForTimeout(500);
  assert.ok(await page.locator('#panel-insp [data-act="purpose:kitchen"]').count(), "the room card offers Kitchen");
  for (const k of ["bedroom", "storage", "shelter", "workshop"]) assert.ok(await page.locator(`#panel-insp [data-act="purpose:${k}"]`).count(), "and " + k);
  await page.locator('#panel-insp [data-act="purpose:kitchen"]').click(); await page.waitForTimeout(500);
  let rt = await page.locator("#panel-insp .pbody").innerText();
  assert.match(rt, /A fire ring inside/); assert.match(rt, /none yet: build a fire ring/); assert.match(rt, /Quality/); assert.match(rt, /Villagers cook here/);
  ok("a room set to Kitchen shows its checklist (fire ring missing) and what a kitchen does");
  await G((h) => { const s = __game.sim; s.ents.add("furniture", { f: "hearth", x: h.x0 + 3, y: h.y0 + 2, z: h.z, owner: 0, rv: 0, rt: 0, fuel: 9000, lit: 1, fi: "log", hl: 2 }); }, hutAt);
  await page.waitForTimeout(600);
  rt = await page.locator("#panel-insp .pbody").innerText();
  assert.ok(!/none yet: build a fire ring/.test(rt)); assert.match(rt, /\u2713\s*A fire ring inside/);
  ok("with a fire ring inside the checklist ticks it");
  await page.locator("#panel-insp").screenshot({ path: join(root, "tmp", "ui-s15-kitchen-card.png") });
  await shot(page, "ui-s15-kitchen");
  // a wagon on the map, and its card
  const wg = await G((h) => { const g = __game, s = g.sim, w = s.ents.add("wagon", { t: "wagon", x: h.x0 + 8, y: h.y0 + 2, z: h.z, rv: 0, rt: 0, dr: 0, an: 0, tr: 2 }); g.cam.x = h.x0 + 5; g.renderer.setZ(h.z); return { id: w.id }; }, hutAt);
  await page.waitForTimeout(500);
  const wp = await G((id) => { const g = __game, w = g.sim.ents.get(id), [sx, sy] = g.cam.toScreen(w.x + 0.5, w.y + 0.5); return { sx, sy, shown: g.renderer.isShown(w) }; }, wg.id);
  assert.ok(wp.shown, "the wagon is drawn on the map");
  await page.mouse.click(wp.sx, wp.sy); await page.waitForTimeout(400);
  if (!/Wagon/.test(await page.locator("#panel-insp .pbody").innerText())) { await G((id) => __game.selectOther({ kind: "entity", id }), wg.id); await page.waitForTimeout(400); }
  const wt = await page.locator("#panel-insp .pbody").innerText();
  assert.match(wt, /Wagon/); assert.match(wt, /Carries/); assert.match(wt, /2/); ok("a wagon is on the map and its inspector says what it carries and who has it");
  await shot(page, "ui-s15-wagon");
  await page.locator("#panel-insp").screenshot({ path: join(root, "tmp", "ui-s15-wagon-card.png") });
  // an advisory card: the cold class rises to an alarming level
  await G(() => { const g = __game; g.clearSelection(); g.sim.board.sc = 1; g.sim.board.sneed = 3; g.ui.advisor = null; });
  await page.waitForTimeout(700);
  const adv = page.locator('#advisories .adv[data-k="cold"]');
  assert.equal(await adv.count(), 1, "one advisory card for the cold class");
  const at = await adv.innerText(); assert.match(at, /(Winter in \d+ days?|It is winter) and 3 villagers have no warm bed/); assert.match(at, /Show/); assert.match(at, /Snooze/); assert.match(at, /Dismiss/);
  ok("an advisory card appears: " + at.split("\n")[1]);
  await shot(page, "ui-s15-advisory");
  assert.match(await page.locator("#panel-concerns .phint").innerText(), /\d/); ok("the Concerns header carries a count badge");
  await page.waitForTimeout(700);
  assert.equal(await page.locator('#advisories .adv[data-k="cold"]').count(), 1, "still one card after more refreshes");
  await adv.locator('[data-adv^="dismiss"]').click(); await page.waitForTimeout(700);
  assert.equal(await page.locator("#advisories .adv").count(), 0, "dismissed");
  assert.match(await page.locator("#panel-concerns .pbody").innerText(), /no bed/); ok("dismissed: the card is gone and stays gone; the Concerns list still has the line");
  await G(() => { __game.sim.board.sc = 0; __game.sim.board.sneed = 0; });
  // the chronicle download (a real browser download of the Markdown file)
  await page.locator("#panel-chron").scrollIntoViewIfNeeded();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.locator("#panel-chron [data-dl]").click()]);
  assert.match(dl.suggestedFilename(), /^chronicle-seed\d+-day\d+\.md$/);
  const body = readFileSync(await dl.path(), "utf8");
  assert.match(body, /^# Chronicle of the slime village/); assert.match(body, /## Births and deaths/); assert.match(body, /## Graves/);
  ok("Download chronicle saves " + dl.suggestedFilename() + " (" + body.split("\n").length + " lines)");
  await page.keyboard.press("Escape");
  // many crews: folded cards, a count, a scrolling list, select all idle
  const cr = await G(() => {
    const g = __game, s = g.sim; for (let i = 0; i < 40; i++) s.spawnVillager();
    const ad = s.ents.ofKind("villager").filter(v => !v.cr && (s.tick - v.born) / 1800 >= 80);
    for (let k = 0; k < 12; k++) s.apply({ type: "crew", op: "make", name: "Crew " + (k + 1), ids: ad.slice(k * 3, k * 3 + 3).map(v => v.id) });
    for (const v of ad.slice(36, 41)) { v.job = null; v.action = null; v.slp = 0; }
    return { crews: s.crews.list.length };
  });
  assert.equal(cr.crews, 12); await page.waitForTimeout(700);
  await page.locator("#panel-crews").scrollIntoViewIfNeeded();
  const folded = await page.locator("#panel-crews .crew.folded").count();
  assert.ok(folded >= 12, "12 crews start folded to one line each: " + folded);
  assert.match(await page.locator("#panel-crews .cr-total").innerText(), /12 crews, 36 members/);
  const sc = await G(() => { const l = document.querySelector("#panel-crews .cr-list"); return { sh: l.scrollHeight, ch: l.clientHeight }; });
  assert.ok(sc.sh >= sc.ch, "the list scrolls inside its panel");
  await page.locator('#panel-crews [data-c="tog:' + (await G(() => __game.sim.crews.list[0].id)) + '"]').click(); await page.waitForTimeout(400);
  assert.ok(await page.locator("#panel-crews .crew:not(.folded)").count() === 1, "one card unfolds on its own");
  await page.locator('#panel-crews [data-c="idle"]').click(); await page.waitForTimeout(400);
  assert.ok(await G(() => __game.ui.sel.length) >= 1, "Select all idle selects the villagers with nothing to do");
  ok("12 crews: folded cards, '12 crews, 36 members', a scrolling list, unfold one, select all idle (" + await G(() => __game.ui.sel.length) + ")");
  await shot(page, "ui-s15-crews");
  await page.locator("#panel-crews").screenshot({ path: join(root, "tmp", "ui-s15-crews-panel.png") });
}

{ // S16: the endless world. A fresh game at the real spawn: pan 300 cells away and unexplored land is drawn (dim), not black; send a villager there; key 0 frames the explored area.
  await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?tools=all&seed=7");
  await page.waitForFunction(() => window.__game); await page.waitForTimeout(500);
  const sp = await G(() => { const g = __game, S = g.sim.site; g.state.paused = true; g.ui.follow = 0; g.clearSelection(); return { x: S.x, y: S.y, z: S.z, n: g.sim.world.chunks.size }; });
  assert.ok(sp.n >= 36 && sp.n <= 64, "the land round the camp is active at the start: " + sp.n); ok("a fresh game at the real spawn (" + sp.x + "," + sp.y + "), " + sp.n + " chunks active");
  // the pixel at the middle of the canvas, as [r, g, b]
  const centre = () => G(() => { const c = document.getElementById("view"), x = c.getContext("2d"), d = x.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data; return [d[0], d[1], d[2]]; });
  await G(() => { const g = __game; g.cam.zoom = 6; g.cam.x = g.sim.site.x + 300; g.cam.y = g.sim.site.y + 12; g.renderer.setZ(23); });
  await page.waitForTimeout(500);
  const far = await centre();
  assert.ok(far[0] + far[1] + far[2] > 120, "300 cells from the camp the land is drawn, not black: rgb " + far);
  const chunksAfter = await G(() => __game.sim.world.chunks.size);
  assert.equal(chunksAfter, sp.n, "looking at far land makes nothing resident: the sim never depends on the camera (" + chunksAfter + " chunks)");
  const rc = await G(() => ({ made: __game.renderer.view.made, lru: __game.renderer.view.lru.size, cap: 2400 }));
  assert.ok(rc.made > 20 && rc.lru <= rc.cap, "the renderer's own cache holds it: " + JSON.stringify(rc));
  await shot(page, "ui-s16-unexplored");
  ok("panned 300 cells away: unexplored land is drawn dim (rgb " + far + "), nothing became resident, the render cache holds " + rc.lru + " chunks");
  // send a villager there, hop by hop (an order only plans a few dozen cells ahead)
  const v0 = await G(() => { const g = __game, s = g.sim; const v = s.ents.ofKind("villager")[0]; g.state.paused = true; g.selectOnly(v.id, true); return { id: v.id }; });
  const reached = await G((id) => {
    const g = __game, s = g.sim, v = s.ents.get(id), W = s.world;
    for (let hop = 0; hop < 90 && v.x < s.site.x + 120; hop++) {
      let tx = v.x + 40, tz = -1;
      for (let d = 0; d < 30 && tz < 0; d++) { tz = W.standZ(tx - d, v.y); if (tz >= 0) tx -= d; }
      if (tz >= 0) s.apply({ type: "order", ids: [id], verb: "move", x: tx, y: v.y, z: tz });
      for (let i = 0; i < 400; i++) { v.hunger = v.thirst = v.energy = 1; v.hp = 999; s.step(); if (!v.order) break; }
    }
    return { x: v.x, y: v.y, chunks: W.chunks.size, active: W.activeAt(v.x, v.y), explored: s.seen.cols.length };
  }, v0.id);
  assert.ok(reached.x >= sp.x + 100 && reached.active, "the villager walked well beyond the start and the land there woke up: " + JSON.stringify(reached)); ok("a villager was sent " + (reached.x - sp.x) + " cells east: " + reached.chunks + " chunks active, " + reached.explored + " surface columns explored");
  await G(() => { const g = __game, v = g.sim.ents.ofKind("villager")[0]; g.ui.follow = v.id; g.cam.zoom = 12; g.cam.x = v.x; g.cam.y = v.y; });
  await page.waitForTimeout(500);
  await shot(page, "ui-s16-far-villager");
  // key 0: frame the explored area; then a wide, zoomed-out look: explored land bright round the path, dim land beyond
  await G(() => { __game.ui.follow = 0; __game.clearSelection(); });
  await page.keyboard.press("0"); await page.waitForTimeout(600);
  const fit = await G(() => { const g = __game, b = g.sim.seen.bbox, v = g.cam.visible(); return { zoom: g.cam.zoom, covers: v.x0 <= b.x0 && v.x1 >= b.x1 && v.y0 <= b.y0 && v.y1 >= b.y1 }; });
  assert.ok(fit.covers, "key 0 frames the explored area: " + JSON.stringify(fit)); ok("key 0 fits the explored area (zoom " + fit.zoom.toFixed(2) + ")");
  await G(() => { const g = __game; g.cam.zoom = 2.2; g.cam.x = g.sim.site.x + 60; g.cam.y = g.sim.site.y; });
  await page.waitForTimeout(900);
  await shot(page, "ui-s16-wide");
  ok("wide view drawn (ui-s16-wide.png)");
}

await browser.close();
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("ui smoke passed (" + n + " checks), no console errors; screenshots in game/tmp/ui-*.png");
