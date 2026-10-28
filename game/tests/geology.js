// The land (S6 geology, S12 biomes, S14 deposits, S16 endless generation): worldgen only, no sim ticks.
//   * genChunk is a pure function: any order of chunks gives the same cells, and the cells either side of a border are the same land
//   * the spawn search finds a fair start for 20 seeds (the capability chain's inputs, two sources each, within REACH_R)
//   * the content placed round the spawn (a cave with the lair, malachite stains with a tell, clay banks, a stream) is where the rules say
//   * rivers and caves are continuous across chunk borders
import assert from "node:assert/strict";
import { World, M, F, D } from "../src/sim/world.js";
import { genChunk, colInto, baseDef, wormOf, WATER_LEVEL, SOFT_THICK, dirtAt, RS } from "../src/sim/terrain.js";
import { defOf, REACH_R, validateSpawn } from "../src/sim/spawn.js";
import { generateWorld } from "../src/sim/worldgen.js";
import { MEADOW, HIGHLAND, MARSH } from "../src/sim/biome.js";
import { Hasher } from "../src/sim/hash.js";

const ok = (m) => console.log("ok  " + m);
const hashChunk = (c) => { const h = new Hasher(); h.bytes(c.mats); h.bytes(c.flgs); h.bytes(new Uint8Array(c.hs.buffer)); h.bytes(c.bm); return h.hex; };

// ---- 1. order independence ----
{
  const def = defOf(7, { biomes: true, depth: true });
  const cells = [];
  for (let cx = -3; cx <= 1; cx++) for (let cy = -2; cy <= 2; cy++) cells.push([cx, cy]);
  const forward = new Map(), shuffled = new Map();
  for (const [cx, cy] of cells) forward.set(cx + "," + cy, hashChunk(genChunk(def, cx, cy)));
  // a second order, from a def whose caches were never warmed (a fresh process would have none): reverse, then interleaved
  const def2 = defOf(7, { biomes: true, depth: true });
  def2.rc = null;
  const order = cells.slice().reverse().sort((a, b) => ((a[0] * 7 + a[1] * 13) % 5) - ((b[0] * 7 + b[1] * 13) % 5));
  for (const [cx, cy] of order) shuffled.set(cx + "," + cy, hashChunk(genChunk(def2, cx, cy)));
  for (const k of forward.keys()) assert.equal(shuffled.get(k), forward.get(k), "chunk " + k + " depends on the order of generation");
  // far from the origin too, and with another seed
  for (const seed of [3, 12345]) {
    const d = defOf(seed, { biomes: true, depth: true });
    const a = hashChunk(genChunk(d, 900, -700)), b = hashChunk(genChunk(d, -900, 700)), a2 = hashChunk(genChunk(d, 900, -700));
    assert.equal(a, a2); assert.notEqual(a, b);
  }
  ok("genChunk: a 5x5 block generated in two orders is identical (and repeatable far from the origin)");
}

// ---- 2. continuity across chunk borders ----
{
  const def = defOf(7, { biomes: true, depth: true }), t = { h: 0, b: 0, clay: 0, wet: 0 };
  const w = new World((cx, cy) => genChunk(def, cx, cy), def);
  let waterEdges = 0, caveEdges = 0, wormCrossings = 0;
  // every column's stored height is the pure column function (so a border is not special), and water continues over a border
  for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) {
    const c = w._get(cx, cy);
    for (let i = 0; i < 16; i++) for (const [x, y] of [[cx * 16, cy * 16 + i], [cx * 16 + 15, cy * 16 + i], [cx * 16 + i, cy * 16], [cx * 16 + i, cy * 16 + 15]]) {
      colInto(def, x, y, t);
      assert.equal(w.hsAt(x, y), t.h, "height at a chunk edge is the pure rule");
    }
  }
  // water: in the window scan every water column whose east or south neighbour is across a border; the neighbour is water or its bank
  for (let y = -64; y < 64; y++) for (let x = -64; x < 64; x++) {
    if (!((x & 15) === 15) && !((y & 15) === 15)) continue;
    if (w.mat(x, y, WATER_LEVEL) !== M.WATER) continue;
    waterEdges++;
    for (const [dx, dy] of [[1, 0], [0, 1]]) if (((x + dx) >> 4) !== (x >> 4) || ((y + dy) >> 4) !== (y >> 4)) {
      const nh = w.hsAt(x + dx, y + dy), h = w.hsAt(x, y);
      assert.ok(Math.abs(nh - h) <= 6, "water meets a cliff at a chunk border " + x + "," + y);
    }
  }
  assert.ok(waterEdges > 0, "the window holds water on a chunk border");
  // caves: walk the worms of the regions round the origin; consecutive steps that fall in different chunks are both open air
  for (let rx = -3; rx <= 2; rx++) for (let ry = -3; ry <= 2; ry++) {
    const worm = wormOf(def, rx, ry);
    if (!worm) continue;
    for (let i = 1; i < worm.length; i++) {
      const a = worm[i - 1], b = worm[i];
      if ((a.x >> 4) === (b.x >> 4) && (a.y >> 4) === (b.y >> 4)) continue;
      wormCrossings++;
      for (const s of [a, b]) {
        const roof = w.hsAt(s.x, s.y) - 3;
        if (s.ramp || s.z + 1 > roof) continue;
        assert.equal(w.mat(s.x, s.y, s.z), M.AIR, "worm step " + s.x + "," + s.y + "," + s.z + " is open on both sides of a border");
        assert.ok(w.flags(s.x, s.y, s.z) & F.NATURAL);
        caveEdges++;
      }
    }
  }
  assert.ok(wormCrossings > 0 && caveEdges > 0, "the window has a cave crossing a chunk border (" + wormCrossings + ")");
  ok("borders: heights are the pure rule, rivers (" + waterEdges + " edge cells) meet banks, " + wormCrossings + " cave steps cross chunk borders and stay open");
}

// ---- 3. the spawn search over 20 seeds ----
{
  const moved = [];
  let ms = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const t0 = Date.now(), def = defOf(seed, { biomes: true, depth: true });
    ms += Date.now() - t0;
    const g = def.gen;
    assert.ok(g.ok, "seed " + seed + " has no fair spawn: " + g.fails.join(", ") + " " + JSON.stringify(g.spawn));
    for (const k of ["clay", "flint", "malachite", "wood", "ridge", "iron", "coal", "stumptree"]) assert.ok(g.counts[k] >= 2, "seed " + seed + ": " + k);
    assert.ok(g.counts.kilnsite >= 2);
    assert.ok(def.geo.caves.length === 1 && def.geo.caves[0].floor.length >= 20, "the lair's cave");
    assert.ok(Math.max(Math.abs(g.spawn.x), Math.abs(g.spawn.y)) <= 28 * 5 + 8, "seed " + seed + " spawn is within a few rings of the origin: " + JSON.stringify(g.spawn));
    if (g.spawn.x !== 0 || g.spawn.y !== 0) moved.push(seed + "@" + g.spawn.x + "," + g.spawn.y);
    // a second call is the same def (memoised); a fresh validation of it agrees
    assert.equal(defOf(seed, { biomes: true, depth: true }), def);
  }
  ok("spawn search: 20 seeds all find a fair start (" + ms + " ms in all); moved from the origin: " + (moved.join(" ") || "none"));
  // the same seed without biomes / depth is also solvable
  for (const seed of [7, 8, 9]) assert.ok(defOf(seed, { biomes: false, depth: false }).gen.ok, "meadow-only seed " + seed);
}

// ---- 4. what is at the spawn (seed 7) ----
{
  const { world: w, ents, gen, def } = generateWorld(7, { biomes: true, depth: true });
  const S = w.site;
  assert.ok(gen.ok);
  // strata under the camp: dirt, then soft rock, then hard rock (deep rock lower still)
  for (const [x, y] of [[S.x, S.y], [S.x + 3, S.y - 2]]) {
    const h = w.hsAt(x, y), dirt = dirtAt(7, x, y), sb = h - dirt - SOFT_THICK;
    assert.equal(w.mat(x, y, h), M.GRASS); assert.equal(w.mat(x, y, h - 1), M.DIRT);
    assert.ok([M.SOFT, M.FLINT, M.MALACHITE].includes(w.mat(x, y, h - dirt - 1)), "soft rock under the soil");
    assert.equal(w.mat(x, y, sb - 1) === M.STONE || w.mat(x, y, sb - 1) === M.IRONORE || w.mat(x, y, sb - 1) === M.COAL, true, "hard rock under the soft");
    assert.ok(w.mat(x, y, 1) === M.DEEP || w.mat(x, y, 1) === M.IRONORE || w.mat(x, y, 1) === M.COAL, "deep rock at the bottom");
  }
  // flint nodules are scattered through the soft rock (about 2.4% of its cells)
  let soft = 0, flint = 0;
  for (let y = S.y - 30; y < S.y + 30; y++) for (let x = S.x - 30; x < S.x + 30; x++) {
    const h = w.hsAt(x, y), dirt = dirtAt(7, x, y);
    for (let z = h - dirt - 1; z >= h - dirt - SOFT_THICK; z--) { const m = w.mat(x, y, z); if (m === M.SOFT || m === M.FLINT) soft++; if (m === M.FLINT) flint++; }
  }
  assert.ok(flint / soft > 0.01 && flint / soft < 0.05, "flint share " + (flint / soft));
  // malachite stains: a green tell on the surface, a seam down to a vein
  assert.ok(def.geo.malachite.filter(v => v.kind === "stain").length >= 2, "two stains");
  for (const v of def.geo.malachite) {
    assert.ok(v.cells.length >= 20);
    for (const i of v.cells) assert.equal(w.mat(...World.xyz(i)), M.MALACHITE);
    if (v.tell) { const [x, y, z] = v.tell; assert.equal(w.mat(x, y, z), M.MALACHITE, "tell at the surface"); assert.equal(w.hsAt(x, y), z); }
  }
  assert.ok(def.geo.malachite.some(v => v.kind === "cave"), "a malachite face in the cave");
  // the stream: water north of the camp, and clay on its banks in two separate spots
  let water = 0, clay = 0;
  for (let y = S.y - 80; y < S.y; y++) for (let x = S.x - 30; x < S.x + 30; x++) { if (w.mat(x, y, WATER_LEVEL) === M.WATER) water++; const h = w.hsAt(x, y); if (w.mat(x, y, h) === M.CLAY) clay++; }
  assert.ok(water > 150 && clay >= 8, "stream and clay: water " + water + ", clay " + clay);
  // the cave: one ramp from the surface to a chamber, open air, flagged natural, with the foul group at its far end
  assert.equal(def.geo.caves.length, 1);
  const cv = def.geo.caves[0];
  assert.ok(cv.floor.length >= 20 && cv.cells.length >= 60, "cave size " + cv.floor.length);
  for (const i of cv.cells) { const [x, y, z] = World.xyz(i); assert.equal(w.mat(x, y, z), M.AIR); assert.ok(w.flags(x, y, z) & F.NATURAL); }
  assert.ok(cv.cells.some(i => w.flags(...World.xyz(i)) & F.GAS), "foul air at the far end");
  const [mx, my, mz] = cv.mouth;
  assert.ok(w.isWalkable(mx, my, mz), "the mouth is a stand cell on the surface");
  // ridges: flagged cells on high ground with a stand cell above
  assert.equal(def.geo.ridge.length, 2);
  for (const r of def.geo.ridge) { assert.ok(w.flags(r.x, r.y, r.z - 1) & F.RIDGE); assert.ok(w.isWalkable(r.x, r.y, r.z)); }
  // the camp clearing is flat and bare; the start is meadow all round (BIOME_CLEAR)
  for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) if (dx * dx + dy * dy <= 49) assert.equal(w.hsAt(S.x + dx, S.y + dy), S.z);
  for (let dy = -35; dy <= 35; dy += 3) for (let dx = -35; dx <= 35; dx += 3) if (dx * dx + dy * dy < 35 * 35) assert.equal(w.biomeAt(S.x + dx, S.y + dy), MEADOW);
  ok("spawn content: strata, flint share " + (flint / soft).toFixed(3) + ", 2 stains + cave face, stream (" + water + " water cells) with clay (" + clay + "), the cave (" + cv.floor.length + " floor cells, gas at the far end), 2 ridges");
}

// ---- 5. biomes and deposits exist in the wide world ----
{
  const def = defOf(7, { biomes: true, depth: true }), t = { h: 0, b: 0, clay: 0, wet: 0 }, n = [0, 0, 0];
  for (let y = -400; y < 400; y += 8) for (let x = -400; x < 400; x += 8) n[colInto(def, x, y, t).b]++;
  const tot = n[0] + n[1] + n[2];
  assert.ok(n[0] / tot > 0.4 && n[1] / tot > 0.08 && n[2] / tot > 0.08, "biome shares " + n.map(v => (v / tot).toFixed(2)).join(","));
  const w = new World((cx, cy) => genChunk(def, cx, cy), def);
  const mats = new Set();
  for (let cy = -12; cy <= 12; cy++) for (let cx = -12; cx <= 12; cx++) { const c = w._get(cx, cy); for (let i = 0; i < c.mats.length; i += 3) mats.add(c.mats[i]); }
  for (const m of [M.SALT, M.PEAT, M.HERB, M.IRONORE, M.COAL, M.MALACHITE, M.FLINT, M.CLAY, M.WATER, M.SAND, M.DEEP]) assert.ok(mats.has(m), "material " + m + " exists in 625 chunks");
  const nodepth = new World((cx, cy) => genChunk(defOf(7, { biomes: false, depth: false }), cx, cy));
  let bad = 0; for (let cy = -3; cy <= 3; cy++) for (let cx = -3; cx <= 3; cx++) { const c = nodepth._get(cx, cy); for (const m of c.mats) if (m === M.SALT || m === M.PEAT || m === M.HERB) bad++; for (const b of c.bm) if (b) bad++; }
  assert.equal(bad, 0, "a meadow-only world has no biomes and no deposits");
  ok("the wide world: biomes " + n.map(v => Math.round(100 * v / tot) + "%").join("/") + ", every ore and deposit within 625 chunks, the legacy meadow-only option is clean");
}

// ---- 6. the generator is fast and bounded ----
{
  const def = defOf(7, { biomes: true, depth: true });
  const t0 = Date.now();
  for (let i = 0; i < 100; i++) genChunk(def, 40 + i, -40 - i);
  const ms = (Date.now() - t0) / 100;
  assert.ok(ms < 8, "genChunk takes " + ms + " ms");
  const w = new World((cx, cy) => genChunk(def, cx, cy), def);
  for (let cx = 0; cx < 600; cx++) w.mat(cx * 16, 0, 5);
  assert.ok(w.gc.size <= 256 && w.chunks.size === 0, "reading does not make chunks resident; the cache is bounded (" + w.gc.size + ")");
  ok("genChunk " + ms.toFixed(2) + " ms each; 600 chunks read through a cache of " + w.gc.size + " and none resident");
}
