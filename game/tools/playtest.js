// A scripted first-year playthrough, played through the real page like a player (S4b playtest pass):
// select slimes, order foraging and chopping, set keep-N, plan a 5x4 wattle+thatch hut with a door and 4 beds,
// give it the Shelter purpose, capture a blueprint and stamp a second hut, possess a villager and chop a tree,
// release, then run through winter and report who survived. Time passes with __game.fastForward.
//   node tools/build.js && node tools/playtest.js [seed]
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "tmp"), { recursive: true });
const seed = process.argv[2] || "21";
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1360, height: 840 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?seed=" + seed);
await page.waitForFunction(() => window.__game);
const G = (fn, arg) => page.evaluate(fn, arg);
const shot = (name) => page.screenshot({ path: join(root, "tmp", "play-" + name + ".png") });
const say = (m) => console.log(m);
const ff = (n) => G((n) => __game.fastForward(n), n);
const status = () => G(() => { const s = __game.sim; return { day: Math.floor(s.tick / 12000), pop: s.ents.ofKind("villager").length, runway: s.board.runway, deaths: Object.values(s.chron.recs).map(r => r.cause + "@d" + Math.floor(r.death / 1800)).join(" ") }; });
const cellPx = (x, y) => G(([x, y]) => __game.cam.toScreen(x + 0.5, y + 0.5), [x, y]);
const dragCells = async (a, b) => { const [ax, ay] = await cellPx(...a), [bx, by] = await cellPx(...b); await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 6 }); await page.mouse.up(); };
const clickCell = async (x, y) => { const [px, py] = await cellPx(x, y); await page.mouse.move(px, py); await page.mouse.click(px, py); };

await page.keyboard.press("Space");                                  // paused while setting up
await page.waitForTimeout(500);
await shot("1-start");

// 1. orders: everyone idle-ish starts by foraging; one chops
const vs = await G(() => __game.sim.ents.ofKind("villager").filter(v => v.born < -100000).map(v => ({ id: v.id, name: v.name })));
say("adults: " + vs.map(v => v.name).join(", "));
const tree = await G(() => { const g = __game, s = g.sim, v = s.ents.ofKind("villager")[0]; g.selectOnly(v.id, true);
  const t = s.ents.ofKind("plant").filter(p => p.species === "tree" && g.renderer.isShown(p)).sort((a, b) => Math.abs(a.x - 64) + Math.abs(a.y - 64) - Math.abs(b.x - 64) - Math.abs(b.y - 64))[0];
  const [x, y] = g.cam.toScreen(t.x + 0.5, t.y + 0.5); return { x, y }; });
await page.mouse.click(tree.x, tree.y, { button: "right" });
const bush = await G(() => { const g = __game, s = g.sim, v = s.ents.ofKind("villager")[1]; g.selectOnly(v.id, true);
  const t = s.ents.ofKind("plant").filter(p => p.species === "berry" && g.renderer.isShown(p)).sort((a, b) => Math.abs(a.x - 64) + Math.abs(a.y - 64) - Math.abs(b.x - 64) - Math.abs(b.y - 64))[0];
  const [x, y] = g.cam.toScreen(t.x + 0.5, t.y + 0.5); return { x, y }; });
await page.mouse.click(bush.x, bush.y, { button: "right" });
await page.locator('.srow[data-item="stick"]').click(); await page.locator(".keepedit input").fill("50"); await page.locator(".keepedit input").press("Enter");
await page.locator('.srow[data-item="grass"]').click(); await page.locator(".keepedit input").fill("40"); await page.locator(".keepedit input").press("Enter");
say("orders + keep sticks 50, grass 40: " + JSON.stringify(await G(() => ({ keeps: __game.sim.board.keeps.map(k => k.item + k.n), orders: __game.sim.ents.ofKind("villager").filter(v => v.order).map(v => v.order.verb) }))));
await shot("2-orders");

// 2. the hut: find a clear 5x4 plot near camp, drag a wall outline, roof, door, 4 beds
const spot = await G(() => {
  const g = __game, s = g.sim, w = s.world, z = s.stock.z;
  const free = (x, y) => w.standZ(x, y) === z && !s.ents.at(x, y, z).some(id => ["plant", "item", "furniture"].includes(s.ents.get(id).kind)) && !(s.stock && x >= s.stock.x0 - 1 && x <= s.stock.x1 + 1 && y >= s.stock.y0 - 1 && y <= s.stock.y1 + 1);
  for (let r = 4; r < 24; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x0 = 64 + dx, y0 = 64 + dy; let ok = true;
    for (let j = 0; j < 4 && ok; j++) for (let i = 0; i < 5 && ok; i++) ok = free(x0 + i, y0 + j);
    if (ok) { g.cam.x = x0 + 2; g.cam.y = y0 + 2; g.renderer.setZ(z); return { x0, y0, z }; }
  }
  return null;
});
say("hut plot: " + JSON.stringify(spot));
await page.keyboard.press("b"); await page.waitForTimeout(300);
const { x0, y0 } = spot;
await page.locator(".tool-wall").click(); await dragCells([x0, y0], [x0 + 4, y0 + 3]);
await page.locator(".tool-door").click(); await clickCell(x0 + 2, y0 + 3);
await page.locator(".tool-roof").click(); await dragCells([x0 + 1, y0 + 1], [x0 + 3, y0 + 2]);
await page.locator(".tool-bed").click(); for (const [dx, dy] of [[1, 1], [2, 1], [3, 1], [1, 2]]) await clickCell(x0 + dx, y0 + dy);
say("planned: " + JSON.stringify(await G(() => { const c = {}; for (const s of __game.sim.ents.ofKind("csite")) c[s.w] = (c[s.w] || 0) + 1; return c; })));
await shot("3-plan");
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");

// 3. let the village work; check in every few days
await G(() => { __game.state.paused = true; });
for (let d = 0; d < 40; d += 5) {
  await ff(9000);
  const s = await status(), left = await G(() => __game.sim.ents.ofKind("csite").length);
  say(`day ${s.day}: pop ${s.pop}, food ${s.runway} d, planned pieces left ${left}`);
  if (!left) break;
}
await G(() => { const g = __game; g.cam.x = g.cam.x; });
await page.waitForTimeout(300); await shot("4-built");
const room = await G(([x, y, z]) => { const r = __game.sim.rooms.at(x + 2, y + 1, z); return r ? { n: r.n, enclosed: r.enclosed } : null; }, [x0, y0, spot.z]);
say("room: " + JSON.stringify(room));
await G(() => { __game.renderer.setZ(__game.sim.stock.z + 1); });
await clickCell(x0 + 2, y0 + 1); await page.waitForTimeout(350);
const panel = (await page.locator("#panel-insp .pbody").innerText()).split("\n").slice(0, 3).join(" | ");
say("room panel: " + panel);
if (await page.locator('[data-act="purpose:shelter"]').count()) await page.locator('[data-act="purpose:shelter"]').click();
await page.waitForTimeout(300); await shot("5-room");
await page.keyboard.press("Escape");

// 4. capture a blueprint and stamp a second hut
await G(() => { __game.renderer.setZ(__game.sim.stock.z); });
await page.keyboard.press("b"); await page.locator(".tool-capture").click(); await page.locator(".bp-name").fill("Hut 5x4");
await dragCells([x0, y0], [x0 + 4, y0 + 3]);
say("blueprints: " + await G(() => __game.sim.bps.list.map(b => b.name + " " + b.cells.length + " pieces").join(", ")));
await page.locator('[data-bp^="stamp:"]').click(); await G(() => document.activeElement && document.activeElement.blur());
const second = await G(([x0, y0, z]) => { const s = __game.sim, w = s.world;
  for (let dx = 7; dx < 20; dx++) { const X = x0 + dx; let ok = true;
    for (let j = 0; j < 4 && ok; j++) for (let i = 0; i < 5 && ok; i++) ok = w.standZ(X + i, y0 + j) === z && !s.ents.at(X + i, y0 + j, z).some(id => ["plant", "furniture", "item"].includes(s.ents.get(id).kind));
    if (ok) return X; } return null; }, [x0, y0, spot.z]);
if (second) { const [sx, sy] = await cellPx(second, y0); await page.mouse.move(sx, sy); await page.waitForTimeout(200); await page.mouse.click(sx, sy); }
say("second hut stamped at x=" + second + ", planned pieces " + await G(() => __game.sim.ents.ofKind("csite").length));
await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
await ff(9000);

// 5. possess a villager and chop a tree with the keys
const pz = await G(() => {
  const g = __game, s = g.sim, vs = s.ents.ofKind("villager").filter(v => v.born < -100000);
  const v = vs[vs.length - 1]; g.selectOnly(v.id, true);
  const t = s.ents.ofKind("plant").filter(p => p.species === "tree").sort((a, b) => Math.abs(a.x - v.x) + Math.abs(a.y - v.y) - Math.abs(b.x - v.x) - Math.abs(b.y - v.y))[0];
  return { id: v.id, tree: t.id, name: v.name, dist: Math.abs(t.x - v.x) + Math.abs(t.y - v.y) };
});
say(`possessing ${pz.name}; nearest tree is ${pz.dist} cells away`);
await page.keyboard.press("q");
await G(() => { __game.setSpeed(2); });
const stepsTo = async () => {
  for (let k = 0; k < 60; k++) {
    const d = await G(([id, tid]) => { const s = __game.sim, v = s.ents.get(id), t = s.ents.get(tid); return { dx: t.x - v.x, dy: t.y - v.y, tree: t.species }; }, [pz.id, pz.tree]);
    if (d.tree !== "tree") return false;
    if (Math.abs(d.dx) + Math.abs(d.dy) <= 1) return true;
    const key = Math.abs(d.dx) >= Math.abs(d.dy) ? (d.dx > 0 ? "d" : "a") : (d.dy > 0 ? "s" : "w");
    const before = await G((id) => { const v = __game.sim.ents.get(id); return v.x + "," + v.y; }, pz.id);
    await page.keyboard.down(key);
    await page.waitForFunction(([id, b]) => { const v = __game.sim.ents.get(id); return v.x + "," + v.y !== b; }, [pz.id, before], { timeout: 4000 }).catch(() => {});
    await page.keyboard.up(key); await page.waitForTimeout(250);
  }
  return false;
};
const there = await stepsTo();
await shot("6-possess-walk");
await page.keyboard.press("e");
await page.waitForFunction((t) => __game.sim.ents.get(t).species !== "tree", pz.tree, { timeout: 40000 }).catch(() => {});
say("possessed chop: reached tree " + there + ", tree felled " + await G((t) => __game.sim.ents.get(t).species !== "tree", pz.tree));
await shot("7-possess-chop");
await page.keyboard.press("Escape"); await page.waitForTimeout(200);
say("released: possessed now " + await G(() => !!__game.possessed()));

// 6. through autumn and winter
await G(() => { __game.state.paused = true; });
const log = [];
for (let i = 0; i < 20; i++) {
  await ff(9000);
  const s = await status(); log.push(s);
  if (s.day === 74 || s.day === 75 || s.day === 60) await shot("8-day" + s.day);
  if (s.day >= 100) break;
}
for (const s of log.filter((_, i) => i % 2 === 0)) say(`day ${s.day}: pop ${s.pop}, food ${s.runway} d, deaths so far: ${s.deaths || "none"}`);
await G(() => { const g = __game; g.renderer.setZ(g.sim.stock.z + 1); });
await page.waitForTimeout(300); await shot("9-end-of-year");
const fin = await G(() => { const s = __game.sim, rooms = s.rooms.all().filter(r => r.enclosed).length; return { day: Math.floor(s.tick / 12000), pop: s.ents.ofKind("villager").length, rooms, cold: Object.values(s.chron.recs).filter(r => r.cause === "cold").length, starved: Object.values(s.chron.recs).filter(r => r.cause === "starvation").length, chron: s.chron.entries.slice(-6).map(e => e.text) }; });
say("END " + JSON.stringify(fin));
await browser.close();
if (errors.length) { console.log("CONSOLE ERRORS:\n" + errors.join("\n")); process.exit(1); }
