// The endless world (S16), through the Sim: land materialises where people go, untouched land far from everyone is let go and regrows identically,
// memory stays bounded however far a villager walks, a save taken mid-exploration continues exactly, and the same seed and commands give the same hashes.
// Not pinned to the old camp: these run on the real game's spawn (the origin for most seeds). Pure generation (order independence, the 20-seed spawn search,
// borders) is tests/geology.js.
//   node tests/endless.js
import assert from "node:assert/strict";
import { Sim } from "../src/sim/sim.js";
import { toJSON, restore } from "../src/sim/save.js";
import { World, M } from "../src/sim/world.js";
import { genChunk } from "../src/sim/terrain.js";
import { chunkKey } from "../src/sim/cellkey.js";
import { DEACT_CH, ACT_CH } from "../src/sim/chunks.js";
import { exploredAt, isSeen } from "../src/sim/seen.js";
import { Hasher } from "../src/sim/hash.js";

const mk = (seed, o) => (SIM = Sim.create(seed, o));
const ok = (m) => console.log("ok  " + m);
import { releaseJob } from "../src/sim/jobstate.js";
let SIM = null;
const fed = (v, sim = SIM) => { v.hunger = v.thirst = v.energy = 1; v.hp = 999; v.fear = 0; if (v.job && sim) releaseJob(sim, v); v.job = null; v.action = null; v.order = null; };       // (fed, and carried: no errand of its own pulls the walker back)
const standNear = (sim, x, y) => { for (let r = 0; r < 10; r++) for (const [a, b] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) { const z = sim.world.standZ(x + a, y + b); if (z >= 0 && !sim.ents.at(x + a, y + b, z).length) return [x + a, y + b, z]; } return null; };
/** Carry a villager along a line one cell per `tpc` ticks (stepping the sim): fast travel that still goes through every tick, so activation, fog and unloading run as in play. */
function travel(sim, v, dx, dy, cells, tpc = 2, each) {
  for (let n = 0; n < cells; n++) {
    let p = null;                                                          // the nearest standable cell ahead (a lake or a cliff is stepped round, never back)
    for (let r = 0; r <= 90 && !p; r++) for (let l = -Math.min(r, 14); l <= Math.min(r, 14) && !p; l++) {
      const x = v.x + dx + (dx ? dx * r : l), y = v.y + dy + (dy ? dy * r : l), z = sim.world.standZ(x, y);
      if (z >= 0 && !sim.ents.at(x, y, z).length) p = [x, y, z];
    }
    if (p) sim.ents.move(v, p[0], p[1], p[2]);
    for (let k = 0; k < tpc; k++) { fed(v); sim.step(); }
    if (each) each(n);
  }
}
const heapMB = () => process.memoryUsage().heapUsed / 1048576, bufMB = () => process.memoryUsage().arrayBuffers / 1048576;
const plantsIn = (sim, cx, cy) => sim.ents.ofKind("plant").filter(p => (p.x >> 4) === cx && (p.y >> 4) === cy).map(p => [p.species, p.x, p.y, p.z, p.yield].join(",")).sort();

// ---- 1. walking beyond the old edge ----
{
  const sim = mk(7, { villagers: 2 }), v = sim.ents.ofKind("villager")[0];
  assert.ok(!sim.world.chunks.has(chunkKey(20, 0)), "nothing is active 320 cells out at the start");
  const n0 = sim.world.chunks.size;
  assert.ok(n0 >= 36 && n0 <= 64, "the land round the camp is active at the start (" + n0 + " chunks)");
  travel(sim, v, 1, 0, 190);                                              // 190 cells east: well past the old 128-wide map
  assert.ok(v.x > 150, "the villager is far east: " + v.x);
  const c = sim.world.chunks.get(chunkKey(v.x >> 4, v.y >> 4));
  assert.ok(c && c.act === 1, "the chunk under the villager is active");
  assert.ok(sim.ents.ofKind("plant").some(p => p.x > 160), "plants grew out there (flora from the chunk-keyed stream)");
  // what they stand on is what the pure generator says (nothing is invented by being visited)
  const pure = genChunk(sim.def, c.cx, c.cy);
  assert.deepEqual(Array.from(pure.mats), Array.from(c.mats), "the active chunk's cells are genChunk's");
  assert.ok(exploredAt(sim.seen, v.x, v.y) && isSeen(sim, v.x, v.y, sim.world.hsAt(v.x, v.y)), "the surface where they have been is seen");
  assert.ok(!exploredAt(sim.seen, v.x + 60, v.y), "and the land beyond is not");
  assert.ok(sim.seen.bbox.x1 >= v.x + 10 && sim.seen.bbox.x0 <= sim.site.x - 30, "the explored box grew along the way: " + JSON.stringify(sim.seen.bbox));
  ok("walking: 190 cells east, " + sim.world.chunks.size + " chunks active (from " + n0 + "), flora out there, cells equal the pure generator, fog reveals the path");
}

// ---- 2. unload and regrow, identically ----
{
  const sim = mk(7, { villagers: 2 }), v = sim.ents.ofKind("villager")[0];
  travel(sim, v, 1, 0, 150);
  const cx = v.x >> 4, cy = v.y >> 4, key = chunkKey(cx, cy);
  const c0 = sim.world.chunks.get(key);
  assert.ok(c0 && c0.act === 1 && !c0.mod, "an untouched active chunk far out");
  const cells0 = Array.from(c0.mats), flags0 = Array.from(c0.flgs), plants0 = plantsIn(sim, cx, cy), wi0 = sim.ents.ofKind("fauna").filter(e => (e.x >> 4) === cx && (e.y >> 4) === cy && e.wi).length;
  assert.ok(plants0.length > 0, "there were plants in it");
  const gen0 = sim.world.genCount;
  // everyone goes home: the walker is carried back, and time passes
  const p = standNear(sim, sim.site.x + 2, sim.site.y + 2);
  sim.ents.move(v, p[0], p[1], p[2]);
  for (let i = 0; i < 700; i++) { fed(v); sim.step(); }
  assert.ok(!sim.world.chunks.has(key), "the untouched far chunk was let go (" + sim.world.chunks.size + " chunks left)");
  assert.deepEqual(plantsIn(sim, cx, cy), [], "its plants went with it");
  assert.ok(!sim.ents.ofKind("fauna").some(e => (e.x >> 4) === cx && (e.y >> 4) === cy && e.wi), "and its wild creatures");
  // ... and when they come back it grows again, the same
  const q = standNear(sim, cx * 16 + 8, cy * 16 + 8);
  sim.ents.move(v, q[0], q[1], q[2]);
  for (let i = 0; i < 60; i++) { fed(v); sim.step(); }
  const c1 = sim.world.chunks.get(key);
  assert.ok(c1 && c1 !== c0 && c1.act === 1, "the chunk is active again, a fresh object");
  assert.deepEqual(Array.from(c1.mats), cells0, "same cells after unload and regeneration");
  assert.deepEqual(Array.from(c1.flgs), flags0, "same flags (trees' obstacle bits included)");
  assert.deepEqual(plantsIn(sim, cx, cy), plants0, "same plants, same places");
  assert.equal(sim.ents.ofKind("fauna").filter(e => (e.x >> 4) === cx && (e.y >> 4) === cy && e.wi).length, wi0, "same wild creatures");
  assert.ok(sim.world.genCount > gen0, "it really was generated again");
  // a changed chunk is never let go
  const hole = standNear(sim, cx * 16 + 3, cy * 16 + 3);
  sim.world.set(hole[0], hole[1], hole[2] - 1, M.AIR, 0);
  assert.equal(sim.world.chunks.get(key).mod, 1, "a dug cell marks the chunk changed");
  const home = standNear(sim, sim.site.x + 3, sim.site.y + 3);
  sim.ents.move(v, home[0], home[1], home[2]);
  for (let i = 0; i < 700; i++) { fed(v); sim.step(); }
  assert.ok(sim.world.chunks.has(key) && sim.world.mat(hole[0], hole[1], hole[2] - 1) === M.AIR, "the dug chunk stayed, with its hole");
  ok("unload: an untouched far chunk (" + plants0.length + " plants) was let go and came back identical; a chunk with a dug cell was kept (DEACT_CH " + DEACT_CH + ", ACT_CH " + ACT_CH + ")");
}

// ---- 3. memory stays bounded however far they walk ----
{
  const sim = mk(7, { villagers: 3 }), v = sim.ents.ofKind("villager")[0];
  const buf0 = bufMB(), h0 = heapMB();
  let maxChunks = 0, maxGc = 0, maxEnts = 0, at1000 = 0, at2000 = 0;
  travel(sim, v, 1, 0, 2000, 2, (n) => { maxChunks = Math.max(maxChunks, sim.world.chunks.size); maxGc = Math.max(maxGc, sim.world.gc.size); maxEnts = Math.max(maxEnts, sim.ents.list.length); if (n >= 500 && n < 1000) at1000 = Math.max(at1000, sim.world.chunks.size); if (n >= 1500) at2000 = Math.max(at2000, sim.world.chunks.size); });
  assert.ok(v.x > 1900, "2000 cells east: " + v.x);
  // every anchor (3 villagers, the camp) holds at most a 9 x 9 block of chunks (DEACT_CH 4); the count must not grow with the distance walked
  assert.ok(maxChunks <= 4 * 81, "the loaded chunk count stayed bounded: peak " + maxChunks + ", at the end " + sim.world.chunks.size);
  assert.ok(at2000 <= at1000 * 1.25, "and it did not grow with the distance: peak " + at1000 + " over cells 500-1000, " + at2000 + " over 1500-2000");
  assert.ok(sim.world.gc.size <= 256, "the regrowable cache is capped: " + maxGc);
  const buf1 = bufMB(), h1 = heapMB();
  assert.ok(h1 < 600 && buf1 - buf0 < 120, "memory under the limit: heap " + h1.toFixed(0) + " MB, typed arrays +" + (buf1 - buf0).toFixed(1) + " MB");
  // the camp is still there, intact (not unloaded: it has people and changes), and the fog list is the length of the trip, not the world
  assert.ok(sim.world.chunks.has(chunkKey(0, 0)) || sim.world.chunks.has(chunkKey(sim.site.x >> 4, sim.site.y >> 4)), "the camp chunk stayed");
  const r = sim.seen.ncols;
  assert.ok(r < 400000, "revealed columns: " + r);
  console.log("    2000 cells: peak chunks " + maxChunks + " (end " + sim.world.chunks.size + "), cache " + maxGc + ", entities peak " + maxEnts + ", heap " + h1.toFixed(0) + " MB, typed arrays +" + (buf1 - buf0).toFixed(1) + " MB, explored columns " + r + ", save " + (toJSON(sim).length / 1024).toFixed(0) + " KB");
  ok("memory: walked 2000 cells east; the loaded chunks stayed under " + (maxChunks + 1) + ", the cache under 256, the heap under the limit");
}

// ---- 4. a save taken mid-exploration continues exactly ----
{
  const a = mk(7, { villagers: 3 }), v = a.ents.ofKind("villager")[0];
  travel(a, v, 1, 0, 120);
  travel(a, v, 0, 1, 40);
  const json = toJSON(a), b = restore(json);
  assert.equal(b.hash(), a.hash(), "hash right after load");
  assert.equal(toJSON(b), json, "re-saving the loaded sim changes nothing");
  assert.equal(b.world.chunks.size, a.world.chunks.size, "the same resident chunks");
  const vb = b.ents.get(v.id);
  // both keep exploring the same way (the walker is carried on in both); hashes agree on every tick, activation and unloading included
  for (let n = 0; n < 60; n++) {
    for (const [sim, w] of [[a, v], [b, vb]]) { const p = standNear(sim, w.x + 1, w.y + 1); if (p) sim.ents.move(w, p[0], p[1], p[2]); }
    for (let k = 0; k < 8; k++) { fed(v, a); fed(vb, b); a.step(); b.step(); assert.equal(a.hash(), b.hash(), "diverged at tick " + a.tick); }
  }
  // and the way back, past the point where chunks are let go
  for (const [sim, w] of [[a, v], [b, vb]]) { const p = standNear(sim, sim.site.x + 2, sim.site.y + 2); sim.ents.move(w, p[0], p[1], p[2]); }
  for (let i = 0; i < 500; i++) { fed(v, a); fed(vb, b); a.step(); b.step(); if (i % 50 === 0) assert.equal(a.hash(), b.hash(), "diverged on the way back at tick " + a.tick); }
  assert.equal(a.hash(), b.hash());
  const c = restore(toJSON(b));
  assert.equal(c.hash(), b.hash(), "a second generation of save and load");
  ok("save: mid-exploration, then home again ("  + (json.length / 1024).toFixed(0) + " KB, " + a.world.chunks.size + " chunks); the loaded sim stays equal tick by tick through more exploring, unloading and a second save");
}

// ---- 5. determinism: the same seed and commands give the same hashes ----
{
  const run = () => {
    const sim = mk(11, { villagers: 3 }), v = sim.ents.ofKind("villager")[0], hs = [];
    sim.apply({ type: "keep", item: "stick", n: 20 });
    travel(sim, v, -1, 0, 90, 3, (n) => { if (n % 10 === 0) hs.push(sim.hash()); });
    travel(sim, v, 0, 1, 60, 3, (n) => { if (n % 10 === 0) hs.push(sim.hash()); });
    return { hs, final: sim.hash(), site: sim.site };
  };
  const x = run(), y = run();
  assert.deepEqual(x.hs, y.hs, "the hashes agree all the way");
  assert.equal(x.final, y.final);
  // activation order does not matter to the land: the chunks a sim holds are the pure generator's, in whatever order they came
  const sim = Sim.create(11, { villagers: 1 });
  for (const k of sim.world.chunkKeys().slice(0, 12)) { const c = sim.world.chunks.get(k), p = genChunk(sim.def, c.cx, c.cy); if (!c.mod) assert.deepEqual(Array.from(c.hs), Array.from(p.hs)); }
  ok("determinism: 2 runs of a 150-cell exploration agree at " + x.hs.length + " checkpoints (seed 11, spawn " + x.site.x + "," + x.site.y + ")");
}

// ---- 6. the cost: ms per tick at the camp, memory per chunk ----
{
  const sim = Sim.create(7);
  for (let i = 0; i < 600; i++) sim.step();                             // settle
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 1800; i++) sim.step();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 1800;
  assert.ok(ms < 5, "a tick at the camp costs " + ms.toFixed(3) + " ms");
  const nAct = sim.world.chunks.size, w = sim.world, b0 = bufMB();
  for (let i = 0; i < 300; i++) w.resident(1000 + i, 1000);            // 300 more resident chunks, far away
  const per = ((bufMB() - b0) * 1048576) / 300;
  console.log("    one game day at the camp: " + ms.toFixed(3) + " ms/tick (7 villagers, " + nAct + " chunks active); a resident chunk is " + (per / 1024).toFixed(1) + " KB of typed arrays");
  assert.ok(per < 20 * 1024, "a chunk is " + per + " bytes");
  ok("cost: " + ms.toFixed(3) + " ms/tick at the camp; " + (per / 1024).toFixed(1) + " KB per resident chunk");
}
console.log("endless ok");
void World; void Hasher;
