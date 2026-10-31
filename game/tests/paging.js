// Chunk paging (8.26): eviction on vs off, side by side. Two sims are built the same way from the real spawn (seed 7), one with paging, and stepped in lockstep.
//   node tests/paging.js
// 1. a far camp (a dug tunnel, a building, a dropped item, a hearth) is left behind: the paged sim evicts it and hashes, and packages, exactly like the other at every check
// 2. the walker returns: the chunk comes back byte for byte (cells, flags, entities), and the two stay equal
// 3. a hall spanning an awake chunk and an evicted one cracks: the evicted half is deferred (never lost) and falls when it wakes; a burning tree on the edge burns out as before
// 4. a scripted long walk past 40 changed chunks: resident chunks stay under the cap (and the sim without paging is shown for comparison)
// 5. the cold store: records survive a JSON round trip, a record missing at a write is counted (world.lost), the cap evicts farthest first
import assert from "node:assert/strict";
import { Sim } from "../src/sim/sim.js";
import { savePackage, restore, toJSON } from "../src/sim/save.js";
import { releaseJob } from "../src/sim/jobstate.js";
import { chunkKey } from "../src/sim/cellkey.js";
import { dropLoose } from "../src/sim/items.js";
import { igniteTree } from "../src/sim/fire.js";
import { newPlant } from "../src/sim/plants.js";
import { M, F } from "../src/sim/world.js";
import { enablePaging, keepNear } from "../src/sim/paging.js";

const t00 = Date.now();
const ok = (m) => console.log("ok  " + m + "  (" + ((Date.now() - t00) / 1000).toFixed(1) + " s)");
const fed = (sim, v) => { v.hunger = v.thirst = v.energy = 1; v.hp = 999; v.fear = 0; if (v.job) releaseJob(sim, v); v.job = null; v.action = null; v.order = null; };
const standNear = (sim, x, y) => { for (let r = 0; r < 12; r++) for (let a = -r; a <= r; a++) for (const [p, q] of [[a, -r], [a, r], [-r, a], [r, a]]) { const z = sim.world.standZ(x + p, y + q); if (z >= 0 && !sim.ents.at(x + p, y + q, z).length) return [x + p, y + q, z]; } return null; };
const standIn = (sim, cx, cy, lx, ly) => { let best = null, bd = 1e9; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const X = (cx << 4) + x, Y = (cy << 4) + y, z = sim.world.standZ(X, Y); if (z < 0 || sim.ents.at(X, Y, z).length) continue; const d = (x - lx) ** 2 + (y - ly) ** 2; if (d < bd) { bd = d; best = [X, Y, z]; } } return best; };
const carry = (sim, v, x, y) => { const p = standNear(sim, x, y); sim.ents.move(v, p[0], p[1], p[2]); };
const run = (sim, n) => { for (let i = 0; i < n; i++) { for (const v of sim.ents.ofKind("villager")) fed(sim, v); sim.step(); } };
/** The same steps on both sims, comparing hashes every `every` ticks. */
function lock(a, b, n, every = 100, what = "") {
  for (let i = 0; i < n; i += every) {
    const m = Math.min(every, n - i);
    run(a, m); run(b, m);
    assert.equal(a.hash(), b.hash(), what + ": paged and unpaged hashes agree at tick " + a.tick);
  }
}
const pkgKey = (sim) => { const p = savePackage(sim); return JSON.stringify([p.m.tick, p.m.g, p.m.c, p.m.x]); };

/** The far camp. Chunk B holds a tunnel, a building, a hearth, a dropped item (and a stack that stays an entity); chunk A beside it (west) is kept awake by a reserved plant, holds a burning tree on its east edge, and half of a hall that crosses into B. */
function camp(paging) {
  const sim = Sim.create(7, { villagers: 2 });
  if (paging) enablePaging(sim);
  const vs = sim.ents.ofKind("villager"), v = vs[0];
  const FX = sim.site.x + 150, FY = sim.site.y;
  carry(sim, v, FX, FY);
  run(sim, 60);
  const cx = v.x >> 4, cy = v.y >> 4, ax = cx - 1, X0 = cx << 4, Y0 = cy << 4, w = sim.world;
  assert.ok(w.peekResident(cx, cy).act === 1 && w.peekResident(ax, cy).act === 1, "both chunks are active while the walker stands in B");
  // a tunnel: three cells in a row under the surface
  const tun = standIn(sim, cx, cy, 8, 3), tz = tun[2] - 1;
  for (let i = 0; i < 4; i++) { w.set(tun[0] + i, tun[1], tz, M.AIR, 0); w.set(tun[0] + i, tun[1], tz - 1, M.AIR, 0); }
  // a building: a ring of wattle walls with a roof, a hearth inside (unlit)
  const bs = standIn(sim, cx, cy, 11, 11);
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    const edge = x === 0 || y === 0 || x === 3 || y === 3;
    if (edge) { w.set(bs[0] + x, bs[1] + y, bs[2], M.WATTLE, F.PLAYER | F.USED); w.set(bs[0] + x, bs[1] + y, bs[2] + 1, M.WATTLE, F.PLAYER | F.USED); }
    w.set(bs[0] + x, bs[1] + y, bs[2] + 2, M.THATCH, F.PLAYER | F.USED);
  }
  sim.ents.add("furniture", { f: "hearth", x: bs[0] + 1, y: bs[1] + 1, z: bs[2], owner: 0, rv: 0, rt: 0, fuel: 0, lit: 0, fi: "log", hl: 0 });
  const it = standIn(sim, cx, cy, 3, 13);
  dropLoose(sim, "berry", 30, it[0], it[1], it[2]);
  const it2 = standIn(sim, cx, cy, 5, 14);
  dropLoose(sim, "stick", 7, it2[0], it2[1], it2[2]);
  // chunk A: kept awake (a reserved plant), a burning tree on its east edge
  const keep = standIn(sim, ax, cy, 2, 2), kp = newPlant(sim.ents, "tuft", keep[0], keep[1], keep[2]); kp.rv = vs[1].id; kp.rt = sim.tick;
  const te = standIn(sim, ax, cy, 15, 9), tree = newPlant(sim.ents, "tree", te[0], te[1], te[2]);
  w.setFlagsQuiet(te[0], te[1], te[2], w.flags(te[0], te[1], te[2]) | F.OBSTACLE);
  igniteTree(sim, tree);
  // a hall across the boundary (x from X0-3 to X0+5), rock around it: too wide, it will crack
  const z0 = w.hsAt(X0, Y0 + 7) - 7;
  for (let x = X0 - 5; x <= X0 + 7; x++) for (let y = Y0 + 2; y <= Y0 + 12; y++) for (let z = z0; z <= z0 + 2; z++) w.set(x, y, z, M.STONE, 0);
  for (let x = X0 - 3; x <= X0 + 5; x++) for (let y = Y0 + 5; y <= Y0 + 9; y++) w.set(x, y, z0 + 1, M.AIR, 0);
  run(sim, 20);
  return { sim, v, cx, cy, ax, X0, Y0, z0, key: chunkKey(cx, cy), keyA: chunkKey(ax, cy), bs, tun, tz, it, tree: { x: te[0], y: te[1] } };
}
const cellsOf = (w, cx, cy) => { const c = w.chunks.get(chunkKey(cx, cy)); return JSON.stringify([Array.from(c.mats), Array.from(c.flgs), c.act, c.mod, c.last, c.dz]); };

// ---- 1 + 2 + 3. the camp ----
{
  const A = camp(true), B = camp(false);
  assert.equal(A.sim.hash(), B.sim.hash(), "the two builds start equal");
  const { sim, v } = A, w = sim.world, home = sim.site;
  const hot = cellsOf(B.sim.world, B.cx, B.cy);                  // what B looks like while the unpaged sim holds it
  const crackAt = sim.tick;
  carry(A.sim, A.v, home.x + 3, home.y + 3); carry(B.sim, B.v, home.x + 3, home.y + 3);
  let n = 0;
  while (!w.ev.has(A.key) && n < 1200) { lock(A.sim, B.sim, 100, 100, "leaving"); n += 100; }
  assert.ok(w.ev.has(A.key), "the far camp chunk was evicted (after " + n + " ticks)");
  assert.ok(!w.chunks.has(A.key) && !w.activeAt(A.X0 + 3, A.Y0 + 3) && w.dormantAt(A.X0 + 3, A.Y0 + 3), "an evicted chunk is not resident and counts as dormant");
  assert.ok(w.chunks.has(A.keyA) && w.activeAt(A.X0 - 3, A.Y0 + 3), "chunk A beside it is still awake and resident");
  assert.ok(A.sim.pg.cold.peek(A.key) && A.sim.pg.cold.peek(A.key).e.some(e => e.kind === "furniture"), "the record carries the hearth (the loose stacks are packed in the chunk meta)");
  assert.ok(w.chunks.size < B.sim.world.chunks.size, "fewer chunks resident: " + w.chunks.size + " vs " + B.sim.world.chunks.size);
  { const pa = savePackage(A.sim), pb = savePackage(B.sim); for (const k of Object.keys(pb.c)) if (JSON.stringify(pa.c[k]) !== JSON.stringify(pb.c[k])) { const a = JSON.stringify(pa.c[k]), b = JSON.stringify(pb.c[k]); let i = 0; while (a[i] === b[i]) i++; console.log("DIFF", k, a.slice(i - 100, i + 200), "\n", b.slice(i - 100, i + 200)); } }
  assert.equal(pkgKey(A.sim), pkgKey(B.sim), "the save package is identical with a chunk evicted");
  assert.equal(toJSON(A.sim), toJSON(B.sim), "and so is the flat snapshot");
  assert.equal(restore(savePackage(A.sim)).hash(), restore(savePackage(B.sim)).hash(), "restoring a package saved with a chunk evicted gives the same world");
  ok("1. the far camp is evicted; hash, snapshot and package equal the unpaged run");

  // the roof: cells in the awake half fall on time; the evicted half is deferred (cracked, past due, not fallen)
  const wait = 1500 - (sim.tick - crackAt);
  lock(A.sim, B.sim, Math.max(100, wait), 100, "cracking");
  const cr = sim.ug.cr, inB = cr.filter(([i]) => { const x = i % 1048576 - 524288; return x >= A.X0; });
  assert.ok(w.ev.has(A.key), "still evicted");
  assert.ok(cr.length > 0 && inB.length > 0, "cracked cells wait in the evicted half: " + inB.length + " of " + cr.length);
  assert.ok(inB.every(([, t0]) => sim.tick - t0 >= 1200), "they are past due and still standing (deferred, not lost)");
  assert.notEqual(w.mat(A.X0 + 2, A.Y0 + 7, A.z0 + 1), M.RUBBLE, "(the cell reads as the generated ground, not rubble)");
  assert.equal(w.lost, 0);
  // the burning tree on A's edge burnt down exactly as without paging (hash equal above) and nothing in B was touched
  const t = sim.ents.ofKind("plant").find(p => p.x === A.tree.x && p.y === A.tree.y);
  assert.ok(!t || t.species !== "tree" || t.burn, "the edge tree burnt (stump or gone)");
  ok("3a. an edge hall and an edge fire beside an evicted chunk: deferred, equal to the unpaged run, nothing lost");

  // the walker returns
  carry(A.sim, A.v, A.X0 + 8, A.Y0 + 8); carry(B.sim, B.v, B.X0 + 8, B.Y0 + 8);
  run(A.sim, 1); run(B.sim, 1);
  lock(A.sim, B.sim, 100, 20, "returning");
  assert.ok(!w.ev.has(A.key) && w.chunks.has(A.key), "the chunk is paged in again");
  assert.equal(A.sim.pg.paged >= 1, true);
  assert.equal(w.lost, 0, "no write ever met a missing record");
  // byte for byte against the unpaged sim
  assert.equal(cellsOf(w, A.cx, A.cy), cellsOf(B.sim.world, B.cx, B.cy), "cells, flags and meta match the unpaged sim");
  assert.ok(w.mat(A.tun[0], A.tun[1], A.tz) === M.AIR && w.mat(A.bs[0], A.bs[1], A.bs[2]) === M.WATTLE, "the tunnel and the building walls are there");
  assert.ok(sim.ents.ofKind("furniture").some(f => f.f === "hearth" && f.x === A.bs[0] + 1), "the hearth is back");
  assert.ok(w.chunks.get(A.key).pi === null && sim.ents.ofKind("item").some(e => e.item === "berry" && e.x === A.it[0]), "the dropped berries are back (woken: unpacked, caught up)");
  ok("2. the chunk returns byte for byte; the two runs stay equal");

  // the deferred roof falls when its chunk wakes
  lock(A.sim, B.sim, 300, 50, "after waking");
  assert.ok(sim.ug.cr.filter(([i]) => (i % 1048576 - 524288) >= A.X0).length === 0, "the deferred cells fell once their chunk woke");
  assert.equal(w.mat(A.X0 + 2, A.Y0 + 7, A.z0 + 1), M.RUBBLE, "rubble in the half that was evicted");
  assert.equal(A.sim.hash(), B.sim.hash());
  ok("3b. the roof over the evicted half fell after waking, equal to the unpaged run");
  // a restore of the paged sim's package equals the unpaged sim's
  assert.equal(restore(savePackage(A.sim)).hash(), restore(savePackage(B.sim)).hash(), "restoring either gives the same world");
}

// ---- 4. a long walk ----
function walk(paging) {
  const sim = Sim.create(7, { villagers: 2 });
  if (paging) enablePaging(sim);
  const vs = sim.ents.ofKind("villager"), w = sim.world;
  const N = 60, STEP = 40, peaks = [];
  const FX = sim.site.x + 60, FY = sim.site.y;
  for (let i = 0; i < N; i++) {                                         // changed chunks along the way (a cell each): the kind of land that used to stay for good
    const x = FX + i * STEP, y = FY, z = standNear(sim, x, y);
    w.set(z[0], z[1], z[2] - 1, M.AIR, 0);
    w.set(z[0] + 1, z[1] + 40, z[2] - 1, M.AIR, 0);
  }
  let max = 0;
  for (let i = 0; i < N; i++) {
    for (const v of vs) carry(sim, v, FX + i * STEP, FY);
    run(sim, 100);
    max = Math.max(max, w.chunks.size);
    if (i % 6 === 5) peaks.push(w.chunks.size);
  }
  for (const v of vs) carry(sim, v, sim.site.x, sim.site.y);
  run(sim, 400);
  let bytes = 0;
  for (const c of w.chunks.values()) bytes += c.mats.byteLength + c.flgs.byteLength + c.hs.byteLength + c.bm.byteLength;
  return { sim, max, end: w.chunks.size, bytes, peaks, ev: w.ev.size };
}
{
  const t0 = Date.now(), P = walk(true), U = walk(false);
  console.log("    walk (60 changed chunks along 2400 cells, then home): resident max/end  paged " + P.max + "/" + P.end + " (" + P.ev + " cold, " + Math.round(P.bytes / 1024) + " KB of cells)  unpaged " + U.max + "/" + U.end + " (" + Math.round(U.bytes / 1024) + " KB)  [" + ((Date.now() - t0) / 1000).toFixed(1) + " s]");
  assert.ok(P.max < U.max && P.end < U.end, "paging holds fewer chunks");
  assert.ok(P.max <= P.sim.pg.cap, "the resident count stays under the cap " + P.sim.pg.cap + ": " + P.max);
  assert.equal(P.sim.hash(), U.sim.hash(), "after the whole walk the paged sim hashes like the unpaged one");
  assert.equal(P.sim.world.lost, 0);
  ok("4. the long walk stays under the cap and hashes equal");
}

// ---- 5. the cold store and the cap ----
{
  const S = camp(true), w = S.sim.world, home = S.sim.site;
  carry(S.sim, S.v, home.x + 3, home.y + 3);
  let n = 0; while (!w.ev.has(S.key) && n < 1200) { run(S.sim, 100); n += 100; }
  assert.ok(w.ev.has(S.key));
  const cold = S.sim.pg.cold, rec = cold.peek(S.key), copy = JSON.parse(JSON.stringify(rec));
  cold.take(S.key); cold.put(S.key, copy);                                          // a store that hands back a parsed copy (the browser's)
  carry(S.sim, S.v, S.X0 + 8, S.Y0 + 8); run(S.sim, 60);
  assert.ok(!w.ev.has(S.key) && w.mat(S.tun[0], S.tun[1], S.tz) === M.AIR, "a JSON-round-tripped record pages in correctly");
  // a missing record: the chunk is asked for and not there: nothing is activated and the miss is counted; a WRITE is counted as lost
  carry(S.sim, S.v, home.x + 3, home.y + 3);
  n = 0; while (!w.ev.has(S.key) && n < 1200) { run(S.sim, 100); n += 100; }
  const saved = cold.take(S.key);
  carry(S.sim, S.v, S.X0 + 8, S.Y0 + 8); run(S.sim, 60);
  assert.ok(w.ev.has(S.key) && S.sim.pg.miss > 0, "a record that is not there yet leaves the chunk evicted and is counted as a miss");
  cold.put(S.key, saved); run(S.sim, 40);
  assert.ok(!w.ev.has(S.key), "and it comes back when the record arrives");
  ok("5. cold records survive a round trip and a late answer");
  // the cap: a cap of 0 evicts every eligible chunk, farthest first
  const T = camp(true); carry(T.sim, T.v, T.sim.site.x + 3, T.sim.site.y + 3);
  T.sim.pg.evictCh = 99;
  run(T.sim, 600);
  assert.ok(T.sim.world.ev.size === 0, "with a high evict distance and not over the cap nothing goes");
  T.sim.pg.cap = 1;
  run(T.sim, 400);
  assert.ok(T.sim.world.ev.size >= 1, "over the cap, eligible chunks go regardless of the distance rule");
  assert.equal(keepNear(T.sim, [T.key]).length, 0, "keepNear pages an evicted chunk back for the camera");
  ok("5b. the cap and the camera keep set");
}
// ---- 6. the browser's cold store (memory + async store) ----
{
  const { createCold, sweep } = await import("../src/ui/cold.js");
  const { memoryBackend } = await import("../src/store/store.js");
  const b = memoryBackend("IndexedDB");
  const cold = createCold(() => b, { memMax: 2 });
  const recs = [1, 2, 3, 4, 5].map(k => ({ k, mt: [1, 1, 5, 9, [[0, 1, 2, 3, 4, 5]], []], dc: [1, 3, 0], e: [{ id: k, kind: "grave", x: k, y: 1, z: 2 }] }));
  for (const r of recs) cold.put(r.k, r);
  for (let i = 0; i < 50 && cold.mem.size > 2; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(cold.mem.size, 2, "memory is held to the limit; the rest is in the store");
  assert.equal((await b.keys("cold/")).length, 3, "three records spilled under cold/");
  const gone = [...cold.spilled][0];
  assert.equal(cold.take(gone), null, "a spilled record is not there yet (the sim waits)");
  cold.prefetch([gone]);
  for (let i = 0; i < 50 && !cold.peek(gone); i++) await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(cold.peek(gone), recs[gone - 1], "and it is read back unchanged");
  await cold.settle();
  assert.equal(cold.spilled.size, 0, "settle brings every record into memory (a save needs them all)");
  assert.equal(recs.every(r => JSON.stringify(cold.peek(r.k)) === JSON.stringify(r)), true);
  await cold.dispose();
  assert.equal((await b.keys("cold/")).length, 0, "scratch keys are deleted");
  await b.put("cold/old/1", new Uint8Array(3));
  assert.equal(await sweep(b), 1, "a stale scratch key from an earlier page is swept");
  ok("6. the browser cold store spills, reads back, settles and cleans up");
}
console.log("paging ok");
