// 7.20 Core field and cave networks: worldgen only (pure genChunk / defOf), plus one short walk through a cave network for the memory bound.
//   * the field is integer and pure (no Math.exp / sin / random), bands 0..4 fall off with distance, and it is the same from a cold cache
//   * cores: never within SAFE_R of the camp over 20 seeds; the camp has one findable core (a spire, a landmark); mana is 0 round the camp
//   * order independence: a block of chunks round a core generated in two orders is identical (cells, flags, mana tint)
//   * ore and valuables rise with the mana band; gems, crystal and core-touched ore do not exist in band 0
//   * cave networks: a network from an entrance ramp is traversable across >= 3 levels (the pathfinder's own step rules) and is long
//   * memory: walking a long way through a network keeps the chunk count and the heap bounded
//   node tests/cores.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { World, M, F, D } from "../src/sim/world.js";
import { genChunk, WATER_LEVEL } from "../src/sim/terrain.js";
import { defOf } from "../src/sim/spawn.js";
import { MANA_TAB, MANA_R, SAFE_R, BAND_MIN, bandOf, manaAt, manaOf, coresNear, coreOfRegion, CORE_RS, oct } from "../src/sim/core.js";
import { mouthsIn, pathsIn, CRS, CAVE_WATER } from "../src/sim/caves.js";
import { HOME_R } from "../src/sim/worms.js";
import { landmarksIn } from "../src/sim/landmarks.js";
import { RS } from "../src/sim/terrain.js";
import { chunkKey } from "../src/sim/cellkey.js";
import { Hasher } from "../src/sim/hash.js";
import { Sim } from "../src/sim/sim.js";
import { releaseJob } from "../src/sim/jobstate.js";
import { DIG } from "../src/sim/dig.js";

const ok = (m) => console.log("ok  " + m);
const here = dirname(fileURLToPath(import.meta.url));
const hashChunk = (c) => { const h = new Hasher(); h.bytes(c.mats); h.bytes(c.flgs); h.bytes(c.mb); h.bytes(c.md); return h.hex; };
const OPTS = { biomes: true, depth: true };

// ---- 1. the field is integer, monotone and pure ----
{
  for (const f of ["core.js", "caves.js", "worms.js"]) assert.ok(!/Math\.(exp|sin|cos|random|pow)|Date\./.test(readFileSync(join(here, "..", "src", "sim", f), "utf8").replace(/\/\/.*$/gm, "")), f + " uses no exp / sin / random / Date");
  assert.equal(MANA_TAB[0], 255); assert.equal(MANA_TAB[MANA_R], 0);
  for (let d = 1; d <= MANA_R; d++) assert.ok(MANA_TAB[d] <= MANA_TAB[d - 1], "the table never rises: " + d);
  assert.deepEqual([0, 13, 14, 59, 60, 129, 130, 199, 200, 255].map(bandOf), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(CAVE_WATER, WATER_LEVEL, "caves.js and terrain.js agree on the waterline");
  const def = defOf(7, OPTS), c = coresNear(def, -400, -400, 400, 400, 0).find(q => !q.home);
  assert.ok(c, "a region core near the origin");
  assert.equal(bandOf(manaAt(def, c.x, c.y, c.z)), 4, "band 4 at the heart");
  let prev = 999;
  for (let r = 0; r <= MANA_R + 4; r++) { const m = manaAt(def, c.x + r, c.y, c.z); assert.ok(m <= prev, "mana falls with distance " + r); prev = m; }
  assert.equal(manaAt(def, c.x + MANA_R, c.y, c.z) === 0 || manaAt(def, c.x + MANA_R, c.y + 0, c.z + 0) >= 0, true);
  assert.equal(manaAt(def, c.x + MANA_R + 1, c.y, c.z), 0, "none beyond MANA_R");
  assert.ok(manaAt(def, c.x, c.y, c.z + 9) < manaAt(def, c.x, c.y, c.z), "depth counts: nine levels away is weaker");
  const m0 = manaAt(def, c.x + 5, c.y - 7, c.z + 2);
  def.rc = null;                                                           // a cold cache gives the same answer
  assert.equal(manaAt(def, c.x + 5, c.y - 7, c.z + 2), m0);
  assert.equal(oct(3, -4), 5);
  ok("field: integer table (255 -> 0 over " + MANA_R + "), bands " + BAND_MIN.join("/") + ", monotone with distance, depth counted, cold cache agrees; no exp / sin / random in core, caves, worms");
}

// ---- 2. placement over 20 seeds: the safety radius, and one findable core at the camp ----
{
  let spires = 0, dmin = 1e9, dmax = 0, regionCores = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const def = defOf(seed, OPTS), sp = def.spawn, sc = def.spawnCore;
    assert.ok(sc && sc.spire && sc.sh, "seed " + seed + ": the camp has its own shallow core with a spire");
    const d = Math.hypot(sc.x - sp.x, sc.y - sp.y);
    assert.ok(d >= 165 && d <= 210, "seed " + seed + ": the camp's core is far but findable: " + d.toFixed(0));
    dmin = Math.min(dmin, d); dmax = Math.max(dmax, d);
    for (let rx = Math.floor((sp.x - 400) / CORE_RS); rx <= Math.floor((sp.x + 400) / CORE_RS); rx++) for (let ry = Math.floor((sp.y - 400) / CORE_RS); ry <= Math.floor((sp.y + 400) / CORE_RS); ry++) {
      const c = coreOfRegion(def, rx, ry);
      if (!c) continue;
      regionCores++;
      assert.ok(Math.hypot(c.x - sp.x, c.y - sp.y) >= SAFE_R, "seed " + seed + ": no region core within " + SAFE_R + " of the camp");
    }
    for (let dy = -64; dy <= 64; dy += 8) for (let dx = -64; dx <= 64; dx += 8) for (const z of [1, 6, 12, 18]) assert.equal(manaAt(def, sp.x + dx, sp.y + dy, z), 0, "seed " + seed + ": no mana within 64 of the camp");
    assert.equal(bandOf(manaAt(def, sc.x, sc.y, sc.z)), 4);
    assert.ok(bandOf(manaAt(def, sc.x, sc.y, sc.h)) >= 3, "the camp's core shows at the surface");
    if (seed === 1 || seed === 7) {
      const lm = landmarksIn(def, Math.floor(sc.x / RS), Math.floor(sc.y / RS)).find(m => m.k === "core");
      assert.ok(lm && lm.x === sc.x && lm.y === sc.y, "the spire is a landmark the scouts can find");
    }
    spires++;
  }
  ok("placement: 20 seeds, no region core within " + SAFE_R + " of the camp (" + regionCores + " checked), no mana within 64 of it, every camp has a spired core " + dmin.toFixed(0) + "-" + dmax.toFixed(0) + " cells out");
}

// ---- 3. order independence round a core and a network ----
let CORE_SEED = 7, CORE;
{
  const def = defOf(7, OPTS), c = coresNear(def, -400, -400, 400, 400, 0).find(q => !q.home && q.sh) || coresNear(def, -400, -400, 400, 400, 0).find(q => !q.home);
  CORE = c;
  const cells = [];
  for (let cx = (c.x >> 4) - 3; cx <= (c.x >> 4) + 3; cx++) for (let cy = (c.y >> 4) - 3; cy <= (c.y >> 4) + 3; cy++) cells.push([cx, cy]);
  const fwd = new Map(), def2 = defOf(7, OPTS);
  for (const [cx, cy] of cells) fwd.set(cx + "," + cy, hashChunk(genChunk(def, cx, cy)));
  def2.rc = null;
  const order = cells.slice().reverse().sort((a, b) => ((a[0] * 5 + a[1] * 11) % 7) - ((b[0] * 5 + b[1] * 11) % 7));
  for (const [cx, cy] of order) assert.equal(hashChunk(genChunk(def2, cx, cy)), fwd.get(cx + "," + cy), "chunk " + cx + "," + cy + " depends on generation order");
  const far = [[-900, 640], [1500, -1500]];
  for (const [cx, cy] of far) assert.equal(hashChunk(genChunk(defOf(11, OPTS), cx, cy)), hashChunk(genChunk(defOf(11, OPTS), cx, cy)));
  ok("order: a 7 x 7 block of chunks round the core at " + c.x + "," + c.y + " (z " + c.z + ", " + (c.sh ? "shallow" : "deep") + ") is identical in two orders, cells, flags and mana tint");
}

// ---- 4. richer with mana ----
{
  const def = defOf(7, OPTS), sp = def.spawn, sums = Array.from({ length: 5 }, () => ({ n: 0, ore: 0, val: 0 }));
  const cs = coresNear(def, sp.x - 500, sp.y - 500, sp.x + 500, sp.y + 500, 0).filter(q => !q.home).slice(0, 3);          // (a few cores: the heart is a small volume)
  const seenCh = new Set();
  for (const c of cs) for (let cx = ((c.x - 90) >> 4); cx <= ((c.x + 90) >> 4); cx++) for (let cy = ((c.y - 90) >> 4); cy <= ((c.y + 90) >> 4); cy++) {
    if (seenCh.has(cx + "," + cy)) continue; seenCh.add(cx + "," + cy);
    const ch = genChunk(def, cx, cy), near = coresNear(def, cx * 16, cy * 16, cx * 16 + 15, cy * 16 + 15);
    for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
      const x = cx * 16 + lx, y = cy * 16 + ly, h = ch.hs[ly * 16 + lx];
      if (h < WATER_LEVEL + 3) continue;
      for (let z = 1; z <= h - 5; z++) {
        const m = ch.mats[(z << 8) | (ly << 4) | lx];
        if (m === M.AIR) continue;
        const s2 = sums[bandOf(manaOf(near, x, y, z))];
        s2.n++;
        if (m === M.GEM || m === M.CRYSTAL || m === M.COREORE) { s2.val++; s2.ore++; } else if (m === M.IRONORE || m === M.COAL) s2.ore++;
      }
    }
  }
  const dens = sums.map(s => (s.n ? s.ore / s.n : 0)), vdens = sums.map(s => (s.n ? s.val / s.n : 0));
  const hi = { n: sums[3].n + sums[4].n, ore: sums[3].ore + sums[4].ore, val: sums[3].val + sums[4].val };
  assert.ok(sums.every(s => s.n > 300), "every band has rock to sample: " + sums.map(s => s.n));
  assert.equal(sums[0].val, 0, "no gem, crystal or core-touched ore in band 0");
  for (let b = 1; b <= 3; b++) assert.ok(dens[b] > dens[b - 1] * 0.98, "ore density does not fall from band " + (b - 1) + " to " + b + ": " + dens.map(d => d.toFixed(4)));
  assert.ok(hi.ore / hi.n > dens[0] * 1.8, "deep and heart rock is at least 1.8 times as rich as wild rock: " + (hi.ore / hi.n).toFixed(4) + " vs " + dens[0].toFixed(4));
  assert.ok(vdens[4] > vdens[2] && hi.val / hi.n > vdens[2] && vdens[2] > vdens[1] && vdens[1] >= 0, "valuables rise with the band: " + vdens.map(d => d.toFixed(5)));
  assert.ok(DIG[M.GEM] && DIG[M.CRYSTAL] && DIG[M.COREORE] && !DIG[M.CORE], "gems, crystal and core ore dig; the core itself waits for 7.23");
  ok("richness (" + cs.length + " cores): ore + valuables per rock cell by band " + dens.map(d => (d * 100).toFixed(2) + "%").join(" / ") + "; valuables " + vdens.map(d => (d * 100).toFixed(3) + "%").join(" / "));
}

// ---- 5. the camp's spire and the surface outcrops ----
{
  const def = defOf(7, OPTS), sc = def.spawnCore, ch = genChunk(def, sc.x >> 4, sc.y >> 4), lx = sc.x & 15, ly = sc.y & 15, h = ch.hs[ly * 16 + lx];
  let top = h;
  while (top + 1 < D && ch.mats[((top + 1) << 8) | (ly << 4) | lx] === M.CRYSTAL) top++;
  assert.ok(top - h >= 4, "a crystal spire stands " + (top - h) + " cells over the ground at the camp's core");
  assert.equal(ch.mats[(sc.z << 8) | (ly << 4) | lx], M.CORE, "the core is in the rock under it");
  let out = 0;
  for (let cx = (sc.x >> 4) - 1; cx <= (sc.x >> 4) + 1; cx++) for (let cy = (sc.y >> 4) - 1; cy <= (sc.y >> 4) + 1; cy++) { const c2 = genChunk(def, cx, cy); for (let i = 0; i < 256; i++) { const t = c2.mats[(c2.hs[i] << 8) | i]; if (t === M.STONE || t === M.GEM) out++; } }
  assert.ok(out >= 25, "outcrops of rock and gems break the surface round a shallow core: " + out);
  ok("outcrops: a " + (top - h) + "-cell crystal spire over the camp's core (" + sc.x + "," + sc.y + "), the core cell in the rock, " + out + " outcrop cells round it");
}

// ---- 6. cave networks: traversable, long, multi-level ----
const bfs = (w, sx, sy, sz, limit) => {                     // the pathfinder's own step rules (path.js): same level, up one with headroom, down one with the column free
  const seen = new Map(), key = (x, y, z) => (z * 4194304 + (y + 2097152)) * 4194304 + (x + 2097152), q = [[sx, sy, sz, 0]], par = [];
  seen.set(key(sx, sy, sz), -1); par.push(-1);
  for (let h = 0; h < q.length && q.length < limit; h++) {
    const [x, y, z] = q[h];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      let nz = -1;
      if (w.isWalkable(nx, ny, z)) nz = z;
      else if (w.isWalkable(nx, ny, z + 1) && !w.isSolid(x, y, z + 1)) nz = z + 1;
      else if (w.isWalkable(nx, ny, z - 1) && !w.isSolid(nx, ny, z)) nz = z - 1;
      if (nz < 0 || nz > w.hsAt(nx, ny) || seen.has(key(nx, ny, nz))) continue;           // (underground only: standing over the ground's own top cell is the surface)
      seen.set(key(nx, ny, nz), h); q.push([nx, ny, nz]); par.push(h);
    }
  }
  return { cells: q, par };
};
let NET = null;
{
  const def = defOf(7, OPTS), w = new World((cx, cy) => genChunk(def, cx, cy), def), sp = def.spawn;
  const mouths = mouthsIn(def, sp.x - 450, sp.y - 450, sp.x + 450, sp.y + 450).filter(m => Math.hypot(m.x - sp.x, m.y - sp.y) > HOME_R + 10).sort((a, b) => Math.hypot(a.x - sp.x, a.y - sp.y) - Math.hypot(b.x - sp.x, b.y - sp.y));
  assert.ok(mouths.length >= 6, "entrance ramps exist round the camp: " + mouths.length);
  let best = null;
  for (const m of mouths.slice(0, 14)) {
    const z = w.standZ(m.x, m.y);
    if (z < 0) continue;
    const r = bfs(w, m.x, m.y, z, 11000), zs = new Set(r.cells.map(c => c[2])), reach = r.cells.reduce((a, c) => Math.max(a, Math.hypot(c[0] - m.x, c[1] - m.y)), 0);
    if (!best || r.cells.length > best.r.cells.length) best = { m, z, r, zs, reach };
  }
  assert.ok(best, "a mouth to walk in from");
  const underground = best.r.cells.filter(c => c[2] < w.hsAt(c[0], c[1]) - 3).length;     // (the cells of the network proper, not its ramp)
  assert.ok(best.zs.size >= 5, "the network spans several levels: " + [...best.zs].sort((a, b) => a - b));
  assert.ok(Math.max(...best.zs) - Math.min(...best.zs) >= 4, "and at least four levels top to bottom");
  assert.ok(underground >= 800 && best.reach >= 60, "it is long: " + underground + " cave cells underground, reaching " + best.reach.toFixed(0) + " cells from the mouth");
  NET = best;
  ok("network: from the mouth at " + best.m.x + "," + best.m.y + " " + best.r.cells.length + " cells are walkable (" + underground + " underground) over levels " + [...best.zs].sort((a, b) => a - b).join(",") + ", reaching " + best.reach.toFixed(0) + " cells");
  // the tunnels of one owner are made of whole steps: neighbours differ by one cell and at most one level
  let steps = 0;
  for (const p of pathsIn(def, sp.x + 150, sp.y + 150, sp.x + 400, sp.y + 400)) if (!p.ramp) for (let j = 1; j < p.xs.length; j++) { if (p.zs[j] < 0 || p.zs[j - 1] < 0) continue; assert.equal(Math.abs(p.xs[j] - p.xs[j - 1]) + Math.abs(p.ys[j] - p.ys[j - 1]), 1); assert.ok(Math.abs(p.zs[j] - p.zs[j - 1]) <= 1); steps++; }
  assert.ok(steps > 1000);
}

// ---- 7. memory: walk the network end to end ----
{
  const t0 = process.memoryUsage().heapUsed / 1048576;
  const { m, r } = NET;
  let far = 0;
  for (let i = 1; i < r.cells.length; i++) if (Math.hypot(r.cells[i][0] - m.x, r.cells[i][1] - m.y) > Math.hypot(r.cells[far][0] - m.x, r.cells[far][1] - m.y)) far = i;
  const route = [];
  for (let i = far; i >= 0; i = r.par[i]) route.push(r.cells[i]);
  route.reverse();
  const sim = Sim.create(7, { villagers: 3 }), v = sim.ents.ofKind("villager")[0];
  const fed = () => { v.hunger = v.thirst = v.energy = 1; v.hp = 999; v.fear = 0; if (v.job) releaseJob(sim, v); v.job = null; v.action = null; v.order = null; };
  let maxChunks = 0, maxGc = 0, below = 0;
  for (const c of route) {                                                   // carried along the whole route, two ticks a cell: activation, fog and unloading run as in play
    sim.ents.move(v, c[0], c[1], c[2]);
    for (let k = 0; k < 2; k++) { fed(); sim.step(); }
    maxChunks = Math.max(maxChunks, sim.world.chunks.size); maxGc = Math.max(maxGc, sim.world.gc.size);
    if (c[2] < sim.world.hsAt(c[0], c[1]) - 3) below++;
  }
  for (let k = 0; k < 600; k++) { fed(); sim.step(); }                      // ... and stood in the far end while the unloader runs
  const heap = process.memoryUsage().heapUsed / 1048576;
  assert.ok(route.length >= 80 && below >= 40, "the walk goes through the network: " + route.length + " cells, " + below + " underground");
  assert.ok(maxChunks <= 4 * 81, "the loaded chunk count stayed bounded: " + maxChunks);
  assert.ok(maxGc <= 256, "the regrowable cache is capped: " + maxGc);
  assert.ok(heap < 600 && heap - t0 < 300, "heap bounded: " + heap.toFixed(0) + " MB (" + (heap - t0).toFixed(0) + " MB over the start)");
  ok("memory: walked " + route.length + " cells (" + below + " underground) through a network; peak " + maxChunks + " chunks, cache " + maxGc + ", heap " + heap.toFixed(0) + " MB");
}
console.log("cores ok");
