// Rooms (GDD §12.5): flood-fill detection, doors, roofs, natural overhead, graded oversize,
// and the incremental update agreeing with a from-scratch rebuild after random edits.
//   node game/tests/rooms.js
import "./legacy.js";
import assert from "node:assert/strict";
import { Sim } from "../src/sim/sim.js";
import { M, F } from "../src/sim/world.js";
import { Rooms, FLOOD_CAP } from "../src/sim/rooms.js";
import { evaluate } from "../src/sim/roomeval.js";
import { flatSpot, instantHut, levelGround } from "./helpers.js";

const fresh = (seed = 1) => Sim.create(seed);
const rooms = (sim) => sim.rooms.all();

// ---- 1. a roofed, walled room with a door is an enclosed room with insulation-scaled warmth ----
{
  const sim = fresh(), [x, y, z] = flatSpot(sim, 7, 6);
  instantHut(sim, x, y, 7, 6, { z });
  const r = rooms(sim);
  assert.equal(r.length, 1, "one room");
  assert.equal(r[0].n, 5 * 4, "interior is 5x4");
  assert.ok(r[0].enclosed && r[0].roofed === 20, "roofed and enclosed");
  assert.ok(r[0].ins > 0.38 && r[0].ins < 0.5, "wattle + thatch + a door is about 0.43, got " + r[0].ins);
  assert.ok(Math.abs(r[0].warm - 0.75 * r[0].ins) < 1e-9, "warmth is insulation-scaled");
  assert.equal(sim.rooms.at(x + 2, y + 2, z), r[0]);
  console.log(`1 ok: ${r[0].n} cells, insulation ${r[0].ins.toFixed(3)}, warmth +${r[0].warm.toFixed(3)}`);

  // stone walls beat wattle
  const sim2 = fresh(), [x2, y2, z2] = flatSpot(sim2, 7, 6);
  instantHut(sim2, x2, y2, 7, 6, { z: z2, wall: M.STONEWALL, roofMat: M.LOGROOF });
  assert.ok(rooms(sim2)[0].warm > r[0].warm, "stone + log roof is warmer than wattle + thatch");
}

// ---- 2. a gap is a leak; a door in the gap closes the room; no door but sealed is also a room ----
{
  const sim = fresh(), [x, y, z] = flatSpot(sim, 7, 6);
  instantHut(sim, x, y, 7, 6, { z, door: false });
  assert.equal(rooms(sim).length, 1, "sealed ring (no door) is a room");
  const wall = (cx, cy) => sim.world.set(cx, cy, z, M.AIR, 0);
  wall(x + 3, y + 5); sim.rooms.update(sim);
  assert.equal(rooms(sim).length, 0, "a missing wall cell leaks: no room");
  sim.ents.add("furniture", { f: "door", x: x + 3, y: y + 5, z, owner: 0, rv: 0, rt: 0 }); sim.world.markDirty(x + 3, y + 5, z); sim.rooms.update(sim);
  assert.equal(rooms(sim).length, 1, "a door in the gap closes the room again");
  assert.ok(rooms(sim)[0].ins < 0.45, "the door lowers the mean insulation");
  console.log("2 ok: leak, door, sealed");
}

// ---- 3. roof required ----
{
  const sim = fresh(), [x, y, z] = flatSpot(sim, 7, 6);
  instantHut(sim, x, y, 7, 6, { z, roof: false });
  let r = rooms(sim)[0];
  assert.ok(r && !r.enclosed && r.warm === 0 && r.roofed === 0, "walls without a roof: a room, but not enclosed, no warmth");
  for (let cy = y + 1; cy < y + 5; cy++) for (let cx = x + 1; cx < x + 6; cx++) sim.world.set(cx, cy, z + 1, M.THATCH, sim.world.flags(cx, cy, z + 1) | F.PLAYER);
  sim.rooms.update(sim);
  r = rooms(sim)[0];
  assert.ok(r.enclosed && r.warm > 0.3, "adding the roof later warms it (incremental)");
  // one roof tile missing: still not enclosed
  sim.world.set(x + 2, y + 2, z + 1, M.AIR, 0); sim.rooms.update(sim);
  r = rooms(sim)[0];
  assert.ok(!r.enclosed && r.roofed === r.n - 1, "a hole in the roof breaks enclosure");
  console.log("3 ok: roof required");
}

// ---- 4. natural overhead rock counts as a roof ----
{
  const sim = fresh(), [x, y, z] = flatSpot(sim, 7, 6);
  instantHut(sim, x, y, 7, 6, { z, roof: false });
  for (let cy = y + 1; cy < y + 5; cy++) for (let cx = x + 1; cx < x + 6; cx++) sim.world.set(cx, cy, z + 2, M.STONE, 0);   // a ledge two up, not player-built
  sim.rooms.update(sim);
  const r = rooms(sim)[0];
  assert.ok(r && r.enclosed, "rock overhead roofs the room");
  assert.ok(Math.abs(r.ins - (0.4 * 18 + 0.2 + 0.6 * 20) / 39) < 0.02, "rock roof insulates at 0.6");
  console.log("4 ok: natural overhead");
}

// ---- 5. oversize is graded, never a fail; beyond the flood cap it is a yard ----
{
  const sim = fresh();
  const [x, y, z] = [50, 50, sim.stock.z];
  levelGround(sim, x, y, 13, 12, z);
  instantHut(sim, x, y, 13, 12, { z });                       // interior 11 x 10 = 110 cells
  const r = rooms(sim)[0];
  assert.ok(r && r.n === 110 && r.n <= FLOOD_CAP, "a 110-cell hall is still a room");
  sim.rooms.setPurpose(sim, x + 2, y + 2, z, "shelter");
  const ev = evaluate(sim, rooms(sim)[0]);
  assert.ok(ev.parts.size < 1 && ev.parts.size >= 0.5, "oversize lowers size fit but keeps it >= 0.5: " + ev.parts.size);
  assert.ok(ev.quality > 0 && ev.checks.length >= 4, "still graded");
  // a small snug shelter scores size 1
  const sim2 = fresh(), [x2, y2, z2] = flatSpot(sim2, 7, 6);
  instantHut(sim2, x2, y2, 7, 6, { z: z2 }); sim2.rooms.setPurpose(sim2, x2 + 2, y2 + 2, z2, "shelter");
  const ev2 = evaluate(sim2, rooms(sim2)[0]);
  assert.equal(ev2.parts.size, 1);
  assert.ok(ev2.checks.find(c => c.k === "beds") && !ev2.checks.find(c => c.k === "beds").ok, "no beds yet: the checklist says so");
  assert.ok(ev2.quality > 0.2, "an empty but closed room is not a zero");
  // too big for the flood: not a room at all
  const sim3 = fresh(), [x3, y3, z3] = [50, 50, sim3.stock.z];
  levelGround(sim3, x3, y3, 15, 14, z3);
  instantHut(sim3, x3, y3, 15, 14, { z: z3 });                // interior 13 x 12 = 156 > 128
  assert.equal(rooms(sim3).length, 0, "beyond the flood cap it counts as outdoors");
  console.log(`5 ok: 110-cell hall size-fit ${ev.parts.size.toFixed(2)}, quality ${ev.word}; snug shelter ${ev2.word}; 156 cells = yard`);
}

// ---- 6. incremental recompute == full recompute after random edits ----
{
  const sim = fresh(3), [x0, y0, z] = [50, 50, sim.stock.z];
  levelGround(sim, x0, y0, 14, 12, z);
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) % n; };
  let checks = 0, maxRooms = 0;
  for (let batch = 0; batch < 120; batch++) {
    for (let k = 0; k < 3; k++) {
      const w = sim.world, op = rnd(8), bw = 3 + rnd(5), bh = 3 + rnd(4), bx = x0 + rnd(14 - bw), by = y0 + rnd(12 - bh);
      const set = (x, y, dz, m, on) => w.set(x, y, z + dz, m, on ? w.flags(x, y, z + dz) | F.PLAYER : w.flags(x, y, z + dz) & ~F.PLAYER);
      if (op <= 1) {                                                  // a wall ring
        for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) if (x === bx || y === by || x === bx + bw - 1 || y === by + bh - 1) set(x, y, 0, M.WATTLE, true);
      } else if (op === 2) {                                          // roof over a rectangle
        for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) set(x, y, 1, M.THATCH, true);
      } else if (op === 3) {                                          // knock holes in walls
        for (let i = 0; i < 3; i++) { const x = x0 + rnd(14), y = y0 + rnd(12); if (w.mat(x, y, z) === M.WATTLE) set(x, y, 0, M.AIR, false); }
      } else if (op === 4) {                                          // doors toggle on edge cells of the ring
        const x = bx + rnd(bw), y = by + (rnd(2) ? 0 : bh - 1);
        const here = sim.ents.at(x, y, z).map(id => sim.ents.get(id)).find(e => e.f === "door");
        if (here) { sim.ents.remove(here.id); w.markDirty(x, y, z); }
        else if (w.mat(x, y, z) === M.AIR) { sim.ents.add("furniture", { f: "door", x, y, z, owner: 0, rv: 0, rt: 0 }); w.markDirty(x, y, z); }
      } else if (op === 5) {                                          // roof tiles removed
        for (let i = 0; i < 4; i++) { const x = x0 + rnd(14), y = y0 + rnd(12); if (w.mat(x, y, z + 1) === M.THATCH) set(x, y, 1, M.AIR, false); }
      } else if (op === 6) {                                          // a wall ring replaced by air (demolish)
        for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) if (w.mat(x, y, z) === M.WATTLE && rnd(2)) set(x, y, 0, M.AIR, false);
      } else {                                                        // natural-looking overhead (not player built)
        for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) w.set(x, y, z + 2, M.STONE, 0);
      }
    }
    if (batch % 3 === 0) {       // sometimes let several edits pile up before updating
      sim.rooms.update(sim);
      const full = new Rooms(); full.marks = sim.rooms.marks;
      full.fullRebuild(sim);
      assert.deepEqual(sim.rooms.canon(), full.canon(), "incremental differs from full rebuild at batch " + batch);
      checks++; maxRooms = Math.max(maxRooms, sim.rooms.list.size);
    }
  }
  assert.ok(maxRooms >= 2, "the random edits should have produced some rooms (max " + maxRooms + ")");
  console.log(`6 ok: ${checks} incremental == full comparisons, up to ${maxRooms} rooms at once`);
}
console.log("rooms ok");
