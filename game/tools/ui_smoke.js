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
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "tmp"), { recursive: true });
const shot = (page, name) => page.screenshot({ path: join(root, "tmp", name + ".png") });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("console", (m) => { if (process.env.DBG) console.log("PAGE", m.text()); if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(pathToFileURL(join(root, "slime-civ.html")).href);
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
  const g = __game, v = g.sim.ents.ofKind("villager").find(v => g.renderer.isShown(v));
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

// 2. right-click a tree -> chop order
const tree = await G((id) => {
  const g = __game, v = g.sim.ents.get(id);
  const t = g.sim.ents.ofKind("plant").filter(p => p.species === "tree" && g.renderer.isShown(p))
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
const box = await G(() => { const g = __game; return [g.cam.vw / 2 - 160, g.cam.vh / 2 - 160, g.cam.vw / 2 + 160, g.cam.vh / 2 + 160]; });
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

await browser.close();
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("ui smoke passed (" + n + " checks), no console errors; screenshots in game/tmp/ui-*.png");
