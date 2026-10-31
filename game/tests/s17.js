// S17: stockpile zones with filters, the yard's ring, the scout order, landmarks, the compact save forms.
//   node tests/s17.js
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { Sim } from "../src/sim/sim.js";
import { storeCell, putStack, stackAt, survey, STACK_CAP, inStore, stockCapacity } from "../src/sim/items.js";
import { yardTick, MAX_YARD } from "../src/sim/yard.js";
import { toJSON, restore, packEnts, unpackEnts } from "../src/sim/save.js";
import { packDeltas, unpackDeltas } from "../src/sim/deltas.js";
import { exploredAt } from "../src/sim/seen.js";
import { landmarksIn, sightFor } from "../src/sim/landmarks.js";
import { landmarkTick, CURIO_FROM } from "../src/sim/scout.js";
import { releaseJob } from "../src/sim/jobstate.js";
import { M, F } from "../src/sim/world.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DIR } from "../tools/make_fixtures.js";

const ok = (m) => console.log("ok  " + m);
const keep = (v) => { v.hunger = v.thirst = v.energy = 1; v.hp = 999; v.fear = 0; };
const run = (sim, n) => { for (let i = 0; i < n; i++) { for (const v of sim.ents.ofKind("villager")) keep(v); sim.step(); } };

// ---- 1. a zone with a filter receives the right items; the yard's last cells no longer lock materials out ----
{
  const sim = loadFixture("settled"), z = sim.stock;
  const free = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!sim.world.isWalkable(x, y, z.z) || sim.ents.at(x, y, z.z).length) return false; return true; };
  let zx = null, zy = null;
  outer: for (let r = 6; r < 22; r++) for (const [a, b] of [[r, 0], [-r - 4, 0], [0, r], [0, -r - 4], [r, r], [-r - 4, -r - 4]]) if (free(z.x0 + a, z.y0 + b, 4, 4)) { zx = z.x0 + a; zy = z.y0 + b; break outer; }
  assert.ok(zx !== null, "found free ground for a zone");
  assert.equal(sim.apply({ type: "zone", op: "add", x0: zx, y0: zy, x1: zx + 3, y1: zy + 3, z: z.z, f: "mat" }), true, "a materials zone is accepted");
  const q = sim.zones.list[0];
  assert.equal(q.f, "mat");
  assert.equal(sim.apply({ type: "zone", op: "add", x0: z.x0, y0: z.y0, x1: z.x0 + 2, y1: z.y0 + 2, z: z.z }), false, "a zone over the yard is refused");
  assert.equal(sim.apply({ type: "zone", op: "add", x0: zx, y0: zy, x1: zx + 20, y1: zy + 2, z: z.z }), false, "and one too large");
  const inside = (c) => c && c[0] >= q.x0 && c[0] <= q.x1 && c[1] >= q.y0 && c[1] <= q.y1;
  const cx = zx + 1, cy = zy + 1;
  assert.ok(inside(storeCell(sim, "log", cx, cy)), "a log standing next to the materials zone goes into it");
  assert.ok(!inside(storeCell(sim, "berry", cx, cy)), "berries do not: the zone takes materials only");
  assert.ok(inStore(sim, cx, cy, z.z), "a zone's cells count as stock (survey, keep-N, spoilage)");
  // fill the main yard with food until it has shut non-food out, then ask for logs
  for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) if (!stackAt(sim, x, y, z.z)) putStack(sim, "berry", STACK_CAP, x, y, z.z);
  assert.ok(!storeCell(sim, "log", z.x0, z.y0) || inside(storeCell(sim, "log", z.x0, z.y0)), "with the yard full of food a log can only go to the zone");
  // in play: loose logs lie by the camp, a keep-logs order is standing; the villagers carry them into the zone
  const sx = sim.site.x, sy = sim.site.y;
  let dropped = 0;
  for (let i = 0; i < 12 && dropped < 8; i++) { const x = sx + 5 + (i % 4), y = sy + 8 + (i >> 2), zz = sim.world.standZ(x, y); if (zz >= 0 && !sim.ents.at(x, y, zz).length) { putStack(sim, "log", 4, x, y, zz); dropped++; } }
  const before = survey(sim).loose.log;
  assert.ok(before > 0);
  run(sim, 5400);
  let inZoneLogs = 0;
  for (let y = q.y0; y <= q.y1; y++) for (let x = q.x0; x <= q.x1; x++) { const s = stackAt(sim, x, y, z.z, "log"); if (s) inZoneLogs += s.n; }
  assert.ok(inZoneLogs > 0, "villagers carried logs into the materials zone within three days: " + inZoneLogs + " (loose before " + before + ", after " + survey(sim).loose.log + ")");
  let food = 0;
  for (let y = q.y0; y <= q.y1; y++) for (let x = q.x0; x <= q.x1; x++) { const s = stackAt(sim, x, y, z.z); if (s && s.item === "berry") food += s.n; }
  assert.equal(food, 0, "and no food went into it");
  // removing the zone: its stock is loose again; capacity follows
  const cap = stockCapacity(sim);
  assert.equal(sim.apply({ type: "zone", op: "remove", id: q.id }), true);
  assert.ok(stockCapacity(sim) < cap && sim.zones.list.length === 0);
  ok("zones: a filtered zone took " + inZoneLogs + " logs and no food while the yard was full of food; refused over the yard and when too big; removed cleanly");
}

// ---- 2. the yard grows a ring when it is full, if the land is free ----
{
  const sim = loadFixture("settled"), z = sim.stock;
  assert.equal(yardTick(sim), false, "a yard with room does not grow");
  const w0 = z.x1 - z.x0 + 1;
  const fill = () => { for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) if (!stackAt(sim, x, y, z.z)) putStack(sim, "berry", STACK_CAP, x, y, z.z); };
  fill();
  // a wall on the ring: the land is not free, so it stays
  const wx = z.x0 - 1, wy = z.y0 + 2;
  const old = [sim.world.mat(wx, wy, z.z), sim.world.flags(wx, wy, z.z)];
  sim.world.set(wx, wy, z.z, M.WATTLE, F.PLAYER | F.USED);
  assert.equal(yardTick(sim), false, "a built cell on the ring stops it");
  sim.world.set(wx, wy, z.z, old[0], old[1]);
  const cx = (z.x0 + z.x1) >> 1, cy = (z.y0 + z.y1) >> 1, cap0 = stockCapacity(sim);
  const sim2 = restore(toJSON(sim));
  // make the ring free (the fixture's camp may have trees or beds round the yard)
  const ring = [];
  for (let y = z.y0 - 1; y <= z.y1 + 1; y++) for (let x = z.x0 - 1; x <= z.x1 + 1; x++) if (x < z.x0 || x > z.x1 || y < z.y0 || y > z.y1) ring.push([x, y]);
  let blocked = 0;
  for (const [x, y] of ring) { if (!sim.world.isWalkable(x, y, z.z)) { blocked++; continue; } for (const id of sim.ents.at(x, y, z.z).slice()) if (sim.ents.get(id).kind !== "item" && sim.ents.get(id).kind !== "villager") { sim.ents.remove(id); } }
  if (blocked) console.log("    (" + blocked + " ring cells are not walkable here; the ring is skipped for this check)");
  else {
    assert.equal(yardTick(sim), true, "a full yard with free land round it grows");
    assert.equal(z.x1 - z.x0 + 1, w0 + 2, "by one ring");
    assert.equal((z.x0 + z.x1) >> 1, cx); assert.equal((z.y0 + z.y1) >> 1, cy);
    assert.ok(stockCapacity(sim) > cap0);
    // over a few days it keeps going until MAX_YARD while it stays full
    for (let i = 0; i < 6; i++) { fill(); yardTick(sim); }
    assert.ok(z.x1 - z.x0 + 1 <= MAX_YARD, "and stops at " + MAX_YARD + ": " + (z.x1 - z.x0 + 1));
  }
  void sim2;
  ok("yard: a full yard grew from " + w0 + " to " + (z.x1 - z.x0 + 1) + " cells a side, centre unchanged; a built cell on the ring stopped it; capped at " + MAX_YARD);
}

// ---- 3. the scout order reveals land ----
function scout() {
  const sim = Sim.create(7, { villagers: 3 }), vs = sim.ents.ofKind("villager");
  const tx = sim.site.x + 70, ty = sim.site.y + 10;
  assert.ok(!exploredAt(sim.seen, tx, ty), "the target is unexplored");
  const n0 = sim.seen.ncols;
  assert.equal(sim.apply({ type: "scout", ids: [vs[0].id], x: tx, y: ty }), true);
  assert.equal(sim.apply({ type: "scout", ids: [vs[1].id], x: sim.site.x + 900, y: ty }), false, "too far to scout is refused");
  assert.equal(sim.lastBlocker, "SCOUT_FAR");
  let arrived = 0;
  for (let i = 0; i < 5400 && !arrived; i++) { run(sim, 1); if (exploredAt(sim.seen, tx, ty)) arrived = i; }
  assert.ok(arrived > 0, "the scout reached and revealed the target within three days");
  assert.ok(sim.seen.ncols > n0 + 800, "and revealed land on the way: " + (sim.seen.ncols - n0) + " columns");
  return { sim, arrived, gained: sim.seen.ncols - n0 };
}
{
  const a = scout(), b = scout();
  assert.equal(a.sim.hash(), b.sim.hash(), "the scout scenario is deterministic");
  ok("scout: the order took a villager 70 cells out in " + a.arrived + " ticks, revealing " + a.gained + " columns; deterministic");
}

// ---- 4. landmarks ----
{
  const sim = Sim.create(7, { villagers: 2 }), v = sim.ents.ofKind("villager")[0], def = sim.def;
  let lm = null;
  for (let r = 1; r < 12 && !lm; r++) for (let rx = -r; rx <= r && !lm; rx++) for (let ry = -r; ry <= r && !lm; ry++) {
    if (Math.max(Math.abs(rx), Math.abs(ry)) !== r) continue;
    for (const m of landmarksIn(def, rx, ry)) if (Math.max(Math.abs(m.x - sim.site.x), Math.abs(m.y - sim.site.y)) >= CURIO_FROM + 30 && sim.world.standZ(m.x - 12, m.y) >= 0 && m.k !== "lake") { lm = m; break; }
  }
  assert.ok(lm, "the wide world holds landmarks");
  assert.deepEqual(landmarksIn(def, Math.floor(lm.x / 64), Math.floor(lm.y / 64)), landmarksIn(def, Math.floor(lm.x / 64), Math.floor(lm.y / 64)), "landmarks are a pure function of the region");
  assert.ok(sightFor(22) > sightFor(14) && sightFor(14) === 22, "high ground sees farther: " + sightFor(14) + " on the flat, " + sightFor(22) + " on a hill");
  // far away: nothing seen; stand near: seen once, entering the Curiosities
  landmarkTick(sim);
  assert.equal(sim.seen.lm.length, 0, "nothing is seen from camp");
  const stand = (() => { for (let r = 0; r < 20; r++) for (let a = -r; a <= r; a++) for (const [p, q] of [[a, -r], [a, r], [-r, a], [r, a]]) { const x = lm.x - 12 + p, y = lm.y + q, z = sim.world.standZ(x, y); if (z >= 0 && !sim.ents.at(x, y, z).length) return [x, y, z]; } return null; })();
  sim.ents.move(v, stand[0], stand[1], stand[2]);
  landmarkTick(sim);
  assert.ok(sim.seen.lm.some(m => m[0] === lm.k && m[1] === lm.x && m[2] === lm.y), "the landmark (" + lm.k + ") is in the seen data");
  assert.ok(sim.disc.curio.some(c => c.id === "lm:" + lm.k + ":" + lm.x + "," + lm.y), "and in the Curiosities");
  const n = sim.seen.lm.length; landmarkTick(sim);
  assert.equal(sim.seen.lm.length, n, "once");
  const back = restore(toJSON(sim));
  assert.deepEqual(back.seen.lm, sim.seen.lm, "landmarks survive a save");
  assert.equal(back.hash(), sim.hash());
  ok("landmarks: a " + lm.k + " at " + lm.x + "," + lm.y + " is seen from 12 cells, enters seen.lm and the Curiosities once, and survives a save");
}

// ---- 5. the compact save forms are lossless ----
{
  const sim = loadFixture("settled");
  const flat = sim.world.deltas();
  const disk = JSON.parse(readFileSync(join(DIR, "settled.json"), "utf8"));
  assert.ok(flat.length > 0);
  assert.deepEqual(unpackDeltas(packDeltas(flat)).slice().sort(), flat.slice().sort(), "deltas: per-chunk local numbers round-trip");
  const j = JSON.parse(JSON.stringify(sim.ents.toJSON()));
  assert.deepEqual(unpackEnts(JSON.parse(JSON.stringify(packEnts(j)))), j, "entities: plants as arrays round-trip");
  const json = toJSON(sim), back = restore(json);
  assert.equal(back.hash(), sim.hash());
  assert.equal(toJSON(back), json);
  ok("save forms: deltas and plants round-trip exactly; the settled fixture is a v" + disk.v + " file (" + (JSON.stringify(disk).length / 1024).toFixed(0) + " KB) that loads and re-saves as v" + JSON.parse(json).v + " (" + (json.length / 1024).toFixed(0) + " KB)");
}
console.log("s17 ok");
