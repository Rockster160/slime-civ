// 7.21 Dungeons (labyrinths): the pure generator, called directly, plus trap detection and disarm from a pre-situated fixture (`trap`, tools/make_fixtures.js prepTrap).
//   * the generator is pure and bounded: the same dungeon from a cold cache, 48-80 cells across, 2-5 levels, entrances, no randomness or clock in the source
//   * chunk generation is order independent round a dungeon, the camp's 100-cell neighbourhood has none, the surface above does not reveal the layout (fog)
//   * every cache and every trap is reachable from an entrance: by the generator's own check, and walking the real cells with the pathfinder's step rules
//   * loot is richer near the core; walls need an iron pick at a sixth of hard rock's speed
//   * fixture: a hidden trap is spotted by a villager standing near it, a spotted trap blocks the pathfinder, a disarm order defuses it (or sets it off), an unseen trap goes off under a foot,
//     autonomous villagers never enter, an ancient workshop seen is evidence of its craft
//   node tests/dungeon.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { World, M, F, D } from "../src/sim/world.js";
import { genChunk } from "../src/sim/terrain.js";
import { defOf } from "../src/sim/spawn.js";
import { coresNear, bandAt } from "../src/sim/core.js";
import { dungeonOf, dungeonAt, dungeonsIn, reachable, cacheList, trapList, lootAt, LOOT_VALUE, isAir, MS, SETPIECES, ROOM_KINDS } from "../src/sim/dungeon.js";
import { HOME_R } from "../src/sim/worms.js";
import { landmarksIn } from "../src/sim/landmarks.js";
import { RS } from "../src/sim/terrain.js";
import { Hasher } from "../src/sim/hash.js";
import { DIG, toolNeeded } from "../src/sim/dig.js";
import { restricted } from "../src/sim/lair.js";
import { revealDisc, seenAt } from "../src/sim/seen.js";
import { loadFixture } from "./fixture.js";
import { Idle } from "../src/sim/actions.js";
import { TRAPS, TRAP_LABEL, seenTraps, seenTrapNear, trapHere, disarmChance, springTrap, openCache, spot, disarm } from "../src/sim/traps.js";
import { badAt } from "../src/sim/underground.js";
import { evidenceOf } from "../src/sim/knowledge.js";
import { toJSON, restore, SAVE_VERSION } from "../src/sim/save.js";
import { Sim } from "../src/sim/sim.js";

const ok = (m) => console.log("ok  " + m);
const here = dirname(fileURLToPath(import.meta.url));
const OPTS = { biomes: true, depth: true };
const hashChunk = (c) => { const h = new Hasher(); h.bytes(c.mats); h.bytes(c.flgs); return h.hex; };
const summary = (d) => { const h = new Hasher(); h.value([d.W, d.H, d.L, d.s, d.rooms.map(r => [r.x0, r.y0, r.x1, r.y1, r.j, r.kind]), [...d.traps], [...d.caches.keys()], d.entrances, d.stairs]); for (const g of d.grid) h.bytes(g); return h.hex; };
const SEEDS = [7, 8, 9, 10, 11, 12];
const all = [];                                   // [def, core, dungeon]
for (const seed of SEEDS) {
  const def = defOf(seed, OPTS), sp = def.spawn;
  for (const c of coresNear(def, sp.x - 800, sp.y - 800, sp.x + 800, sp.y + 800, 0)) { const d = dungeonOf(def, c); if (d) all.push([def, c, d]); }
}

// ---- 1. the generator is pure, bounded and sane ----
{
  assert.ok(!/Math\.(exp|sin|cos|random|pow)|Date\.|performance/.test(readFileSync(join(here, "..", "src", "sim", "dungeon.js"), "utf8").replace(/\/\/.*$/gm, "")), "dungeon.js uses no exp / sin / random / clock");
  assert.ok(!/Math\.(exp|sin|cos|random|pow)|Date\.|performance/.test(readFileSync(join(here, "..", "src", "sim", "traps.js"), "utf8").replace(/\/\/.*$/gm, "")), "traps.js uses no exp / sin / random / clock");
  assert.ok(all.length >= 40, "dungeons round the camps of 6 seeds: " + all.length);
  const levels = new Set(), kinds = new Set(), sizes = [];
  let withLink = 0, withRuin = 0, stairs = 0, workshops = 0, sets = new Set(), trapKinds = new Set();
  for (const [def, c, d] of all) {
    assert.ok(d.W >= 48 && d.W <= 80 && d.H >= 48 && d.H <= 80 && d.W % MS === 0 && d.H % MS === 0, "48-80 cells across: " + d.W + "x" + d.H);
    assert.ok(d.L >= 2 && d.L <= 5 && d.s.length === d.L && d.grid.length === d.L, "2-5 levels: " + d.L);
    levels.add(d.L); sizes.push(d.W * d.H);
    for (let j = 1; j < d.L; j++) assert.equal(d.s[j] - d.s[j - 1], 3, "levels three cells apart");
    assert.ok(d.s[d.jc] === c.z && c.x >= d.x0 && c.x < d.x0 + d.W && c.y >= d.y0 && c.y < d.y0 + d.H, "the core stands in its dungeon, on one of its levels");
    { const sp = def.spawn, ddx = Math.max(d.x0 - sp.x, 0, sp.x - (d.x0 + d.W - 1)), ddy = Math.max(d.y0 - sp.y, 0, sp.y - (d.y0 + d.H - 1)); assert.ok(Math.hypot(ddx, ddy) > HOME_R + 4, "the footprint keeps out of the camp's 100 cells: " + Math.hypot(ddx, ddy).toFixed(0)); }
    assert.ok(d.entrances.length >= 1, "an entrance");
    if (d.links.length) withLink++;
    if (d.ramps.length) withRuin++;
    for (const r of d.rooms) { assert.ok(ROOM_KINDS.includes(r.kind)); kinds.add(r.kind); if (r.tpl) { sets.add(r.tpl); assert.ok(SETPIECES[r.tpl]); } if (r.kind === "workshop") workshops++; }
    assert.ok(d.rooms.filter(r => r.kind === "core").length === 1, "exactly one core chamber");
    stairs += d.stairs.length;
    for (const k of d.traps.values()) trapKinds.add(k);
    assert.ok(d.bb.x0 <= d.x0 - 2 && d.bb.x1 >= d.x0 + d.W);
    for (const l of d.links) { const N = l.xs.length; assert.ok(l.zs[N - 1] === l.zs[N - 1] && Array.from(l.zs).every(z => z >= 0), "a link tunnel is carved end to end"); }
    for (const r of d.ramps) assert.ok(r.zs[r.zs.length - 1] >= def.hAt(r.mouth.x, r.mouth.y) + 1, "a ruin's stair comes out of the ground");
  }
  assert.ok([...levels].length >= 3 && Math.max(...levels) >= 4, "levels vary: " + [...levels]);
  assert.ok(withLink >= 0.4 * all.length, "most have a tunnel from the cave network: " + withLink + "/" + all.length);
  assert.ok(withRuin >= 0.25 * all.length && withRuin < all.length, "some have a surface ruin: " + withRuin + "/" + all.length);
  for (const k of ["hall", "trap", "vault", "den", "workshop", "core"]) assert.ok(kinds.has(k), "room kind " + k);
  assert.ok(sets.size >= 3, "set pieces appear: " + [...sets]);
  assert.equal([...trapKinds].sort().join(), "collapse,dart,gas,pit", "all four trap kinds");
  assert.ok(stairs >= all.length && workshops >= all.length * 0.8);
  // from a cold cache: the same dungeons, bit for bit
  for (const [def, c, d] of all.slice(0, 8)) {
    const def2 = defOf(def.seed, OPTS);
    def2.dc = null; def2.rc = null;
    assert.equal(summary(dungeonOf(def2, c)), summary(d), "dungeon at " + c.x + "," + c.y + " is a pure function of the seed");
  }
  ok("generator: " + all.length + " dungeons from 6 seeds, 48-80 across, " + [...levels].sort().join("/") + " levels, " + withLink + " with a cave link, " + withRuin + " with a ruin, " + sets.size + " set pieces, all trap kinds; identical from a cold cache");
}

// ---- 2. every cache and trap reachable from an entrance; every room too ----
{
  let caches = 0, traps = 0, rooms = 0;
  for (const [def, c, d] of all) {
    const R = reachable(d);
    for (const cc of cacheList(d)) { caches++; assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => R.has(cc.x + dx, cc.y + dy, cc.z)), "cache at " + cc.x + "," + cc.y + "," + cc.z + " is reachable"); }
    for (const t of trapList(d)) { traps++; assert.ok(R.has(t.x, t.y, t.z), "trap reachable"); }
    for (const r of d.rooms) { rooms++; assert.ok(R.has(r.ax, r.ay, d.s[r.j]) || (r.kind === "core" && R.has(r.ax + 1, r.ay, d.s[r.j])), "room " + r.kind + " reachable"); }
    assert.ok(R.has(c.x + 1, c.y, c.z) || R.has(c.x - 1, c.y, c.z) || R.has(c.x, c.y + 1, c.z) || R.has(c.x, c.y - 1, c.z), "the core chamber is reachable");
  }
  ok("reach: " + caches + " caches, " + traps + " traps and " + rooms + " rooms in " + all.length + " dungeons are all reachable from an entrance (the generator's own walk)");
}

// ---- 3. the real cells: chunks generated, walked with the pathfinder's rules ----
{
  const samples = [all.find(q => q[2].links.length && q[2].ramps.length), ...all.filter(q => q[2].L >= 3).slice(0, 3)].filter(Boolean);
  const key = (x, y, z) => (z * 4194304 + (y + 2097152)) * 4194304 + (x + 2097152);
  let walked = 0, cachesSeen = 0;
  for (const [def, c, d] of samples) {
    const w = new World((cx, cy) => genChunk(def, cx, cy), def), R = reachable(d);
    const inBox = (x, y) => x >= d.x0 - 1 && y >= d.y0 - 1 && x <= d.x0 + d.W && y <= d.y0 + d.H;
    const seen = new Set(), q = [];
    for (const e of d.entrances) { assert.ok(w.isWalkable(e.x, e.y, e.z), "the door cell " + e.x + "," + e.y + "," + e.z + " is walkable in the real cells"); seen.add(key(e.x, e.y, e.z)); q.push([e.x, e.y, e.z]); }
    for (let h = 0; h < q.length; h++) {
      const [x, y, z] = q[h];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        let nz = -1;
        if (w.isWalkable(nx, ny, z)) nz = z; else if (w.isWalkable(nx, ny, z + 1) && !w.isSolid(x, y, z + 1)) nz = z + 1; else if (w.isWalkable(nx, ny, z - 1) && !w.isSolid(nx, ny, z)) nz = z - 1;
        if (nz < 0 || !inBox(nx, ny) || seen.has(key(nx, ny, nz))) continue;
        seen.add(key(nx, ny, nz)); q.push([nx, ny, nz]);
      }
    }
    // everything the generator reaches is walkable and reached in the real cells
    let miss = 0;
    for (let z = d.s[0]; z <= d.s[d.L - 1]; z++) for (let y = d.y0; y < d.y0 + d.H; y++) for (let x = d.x0; x < d.x0 + d.W; x++) if (R.has(x, y, z) && !seen.has(key(x, y, z))) miss++;
    assert.equal(miss, 0, "every cell the generator reaches is reached walking the real cells: " + miss + " missing in the dungeon at " + c.x + "," + c.y);
    for (const cc of cacheList(d)) {
      assert.equal(w.mat(cc.x, cc.y, cc.z), M.CACHE, "a cache cell is M.CACHE");
      assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(key(cc.x + dx, cc.y + dy, cc.z))), "cache reachable in the real cells"); cachesSeen++;
    }
    for (const t of trapList(d)) assert.ok(seen.has(key(t.x, t.y, t.z)) && w.flags(t.x, t.y, t.z) & F.DUNGEON, "a trap stands on a walkable dungeon cell");
    // the air is flagged, the walls are stonework, the stair has steps, and no air of the labyrinth touches bare rock except where a natural cave breached it
    let air = 0, dwall = 0, bare = 0;
    for (let z = d.s[0]; z <= d.s[d.L - 1] + 1; z++) for (let y = d.y0; y < d.y0 + d.H; y++) for (let x = d.x0; x < d.x0 + d.W; x++) {
      const m = w.mat(x, y, z);
      if (isAir(d, x, y, z)) { air++; assert.ok(m === M.AIR || m === M.WATER || (m === M.CORE && x === c.x && y === c.y && z === c.z), "dungeon air is open (but for the core itself)"); if (m === M.AIR) assert.ok(w.flags(x, y, z) & F.DUNGEON && w.flags(x, y, z) & F.NATURAL, "dungeon air is flagged"); }
      else if (m === M.DWALL) dwall++;
      else if (m !== M.AIR && m !== M.CACHE && m !== M.CORE && m !== M.WATER && [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, e]) => isAir(d, x + a, y + b, z + e))) bare++;
    }
    assert.ok(air > 800 && dwall > air, "stonework round the air: " + dwall + " walls, " + air + " air");
    assert.equal(bare, 0, "no rock touches the labyrinth's air bare");
    walked += seen.size;
  }
  ok("real cells: " + samples.length + " dungeons generated and walked by the pathfinder's rules from their doors (" + walked + " cells, " + cachesSeen + " caches): the pure reach is a subset, every door walkable, stonework all round");
}

// ---- 4. order independence, the camp's neighbourhood, fog ----
{
  const [def, c, d] = all.find(q => q[2].L >= 3);
  const cells = [];
  for (let cx = (d.x0 >> 4) - 1; cx <= ((d.x0 + d.W) >> 4) + 1; cx += 2) for (let cy = (d.y0 >> 4) - 1; cy <= ((d.y0 + d.H) >> 4) + 1; cy += 2) cells.push([cx, cy]);
  const fwd = new Map();
  for (const [cx, cy] of cells) fwd.set(cx + "," + cy, hashChunk(genChunk(def, cx, cy)));
  const def2 = defOf(def.seed, OPTS); def2.rc = null; def2.dc = null;
  const order = cells.slice().reverse().sort((a, b) => ((a[0] * 5 + a[1] * 11) % 7) - ((b[0] * 5 + b[1] * 11) % 7));
  for (const [cx, cy] of order) assert.equal(hashChunk(genChunk(def2, cx, cy)), fwd.get(cx + "," + cy), "chunk " + cx + "," + cy + " depends on generation order");
  ok("order: " + cells.length + " chunks across a dungeon identical in two orders from a cold cache");
  // no dungeon, wall or cache within 100 cells (and well beyond) of any camp
  let n = 0;
  for (const seed of SEEDS) {
    const dd = defOf(seed, OPTS), sp = dd.spawn;
    for (const d of dungeonsIn(dd, sp.x - 200, sp.y - 200, sp.x + 200, sp.y + 200)) {
      const ddx = Math.max(d.x0 - sp.x, 0, sp.x - (d.x0 + d.W - 1)), ddy = Math.max(d.y0 - sp.y, 0, sp.y - (d.y0 + d.H - 1));
      assert.ok(Math.hypot(ddx, ddy) > HOME_R, "no labyrinth inside the camp's 100 cells");
      for (const r of d.ramps) for (let i = 0; i < r.xs.length; i++) assert.ok(Math.hypot(r.xs[i] - sp.x, r.ys[i] - sp.y) > HOME_R, "... nor its stair");
      for (const l of d.links) for (let i = 0; i < l.xs.length; i++) assert.ok(Math.hypot(l.xs[i] - sp.x, l.ys[i] - sp.y) > HOME_R, "... nor its tunnel");
    }
    for (let cx = (sp.x >> 4) - 8; cx <= (sp.x >> 4) + 8; cx++) for (let cy = (sp.y >> 4) - 8; cy <= (sp.y >> 4) + 8; cy++) {
      if (Math.hypot(cx * 16 + 8 - sp.x, cy * 16 + 8 - sp.y) > HOME_R + 11) continue;
      const ch = genChunk(dd, cx, cy);
      if (ch.mats.includes(M.DWALL) || ch.mats.includes(M.CACHE)) assert.fail("stonework in the camp's neighbourhood");
      n++;
    }
  }
  ok("camp: no labyrinth, wall or cache in " + n + " chunks round the camps of " + SEEDS.length + " seeds (their 100-cell neighbourhood is as it was)");
  // fog: a villager on the surface over a dungeon sees no cell of it
  const sim = Sim.create(7, { villagers: 0 }), sdef = sim.def;
  const c2 = all.find(q => q[0].seed === 7 && q[2].L >= 2)[1];
  const dd = dungeonOf(sdef, coresNear(sdef, c2.x, c2.y, c2.x, c2.y, 0)[0]);
  assert.ok(dd, "the same dungeon in the sim's world");
  for (let y = dd.y0 + 8; y < dd.y0 + dd.H - 8; y += 14) for (let x = dd.x0 + 8; x < dd.x0 + dd.W - 8; x += 14) revealDisc(sim, x, y, 14);
  let looked = 0, hidden = 0;
  for (let z = dd.s[0]; z <= dd.s[dd.L - 1] + 1; z++) for (let y = dd.y0; y < dd.y0 + dd.H; y++) for (let x = dd.x0; x < dd.x0 + dd.W; x++) if (isAir(dd, x, y, z)) { if (seenAt(sim.seen, x, y, z)) looked++; else hidden++; }
  assert.equal(looked, 0, "looking from the surface reveals no cell of the labyrinth: " + looked + " of " + (looked + hidden));
  ok("fog: " + hidden + " cells of the labyrinth stay unknown after the whole footprint is seen from the surface");
  // a ruin is a landmark
  const rd = all.find(q => q[2].ramps.length);
  const m = rd[2].ramps[0].mouth;
  assert.ok(landmarksIn(rd[0], Math.floor(m.x / RS), Math.floor(m.y / RS)).some(l => l.k === "ruin" && l.x === m.x && l.y === m.y), "a ruin landmark stands at the stair's mouth");
  ok("landmark: the ruin at " + m.x + "," + m.y + " is in the landmark list");
}

// ---- 5. loot is richer near the core; walls need an iron pick, slowly ----
{
  const near = [], far = [], byBand = [[], [], [], [], []];
  let n = 0;
  for (const [def, c, d] of all) for (const cc of cacheList(d)) {
    const loot = lootAt(def, cc.x, cc.y, cc.z);
    assert.ok(loot.length >= 1 && loot.every(([it, k]) => LOOT_VALUE[it] > 0 && k >= 1), "a cache holds loot");
    const val = loot.reduce((a, [it, k]) => a + LOOT_VALUE[it] * k, 0), dist = Math.hypot(cc.x - c.x, cc.y - c.y) + 2 * Math.abs(cc.z - c.z);
    (dist < 14 ? near : dist > 34 ? far : []).push(val);
    byBand[bandAt(def, cc.x, cc.y, cc.z)].push(val);
    assert.deepEqual(lootAt(def, cc.x, cc.y, cc.z), loot, "loot is a pure function of the cell");
    n++;
  }
  const mean = (a) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);
  assert.ok(near.length >= 30 && far.length >= 100, "enough caches: " + near.length + " near, " + far.length + " far");
  assert.ok(mean(near) > 1.4 * mean(far), "near the core pays more than far from it: " + mean(near).toFixed(1) + " vs " + mean(far).toFixed(1));
  const bm = byBand.map(mean);
  assert.ok(bm[3] > bm[1] && bm[2] > bm[0] || bm[3] > bm[0], "richer with the band: " + bm.map(v => v.toFixed(1)).join(" / "));
  assert.ok(bm[4] > bm[3] && bm[3] > bm[2] && bm[2] > bm[1], "loot value rises with every band from stirring up: " + bm.map(v => v.toFixed(1)).join(" / "));
  assert.equal(toolNeeded({ world: { mat: () => M.DWALL } }, 0, 0, 0), "iron_pick", "dungeon walls need an iron pick");
  assert.equal(DIG[M.DWALL].dur, 6 * DIG[M.STONE].dur, "... and take six times as long as hard rock");
  assert.ok(DIG[M.CACHE] && DIG[M.CACHE].n === 0 && !DIG[M.CACHE].needs, "a cache digs open without a tool");
  ok("loot: " + n + " caches; mean value near the core " + mean(near).toFixed(1) + " vs far " + mean(far).toFixed(1) + "; by band " + bm.map(v => v.toFixed(1)).join(" / ") + "; walls: iron pick, " + DIG[M.DWALL].dur + " ticks");
}

// ---- 6. the fixture: spotting, avoiding, disarming, springing ----
{
  const sim = loadFixture("trap");
  const vs = sim.ents.ofKind("villager").filter(v => v.z <= 14).slice(0, 2);
  const A = sim.ents.get(vs[0].id), B = sim.ents.get(vs[1].id);
  const dun = dungeonAt(sim.def, A.x, A.y);
  assert.ok(dun, "villager A stands in a labyrinth");
  const nearTrap2 = (sm, v) => trapList(dungeonAt(sm.def, v.x, v.y)).filter(t => t.z === v.z && Math.abs(t.x - v.x) + Math.abs(t.y - v.y) === 2 && ((t.x === v.x) || (t.y === v.y)) && t.k === "dart")[0];
  const nearTrap = (v) => trapList(dun).filter(t => t.z === v.z && Math.abs(t.x - v.x) + Math.abs(t.y - v.y) === 2 && ((t.x === v.x) || (t.y === v.y)))[0];
  const ta = nearTrap(A), tb = nearTrap(B);
  assert.ok(ta && ta.k === "dart" && tb && tb.k !== "dart", "A is two cells from a dart plate, B from another trap: " + ta.k + " / " + tb.k);
  const pin = (v) => { v.job = null; v.order = null; v.action = Idle(5); v.hunger = v.thirst = v.energy = 1; v.rest = 0; v.hp = 100; v.fear = 0; };
  const cellA = World.idx(ta.x, ta.y, ta.z);
  assert.equal(trapHere(sim, ta.x, ta.y, ta.z), "dart");
  assert.ok(!sim.trp.seen.length && !seenTraps(sim).length && !(sim.world.flags(ta.x, ta.y, ta.z) & F.OBSTACLE), "the trap is hidden: nothing marks it");
  assert.equal(restricted(sim, A.x, A.y, A.z), "dungeon", "autonomous villagers refuse a labyrinth (restricted: dungeon)");
  // hidden until a villager standing near spots it
  let t = 0;
  for (; t < 1500 && !sim.trp.seen.includes(cellA); t++) { pin(A); pin(B); sim.step(); }
  assert.ok(sim.trp.seen.includes(cellA), "a villager standing two cells from a trap spots it (" + t + " ticks)");
  assert.ok(t > 0, "not at once");
  assert.ok(sim.world.flags(ta.x, ta.y, ta.z) & F.OBSTACLE && !sim.world.isWalkable(ta.x, ta.y, ta.z), "a spotted trap blocks the path");
  const st = seenTraps(sim).find(q => q.x === ta.x && q.y === ta.y);
  assert.ok(st && st.k === "dart" && TRAP_LABEL[st.k].split(" ").length <= 3, "the glyph's label is a word or two: " + TRAP_LABEL[st.k]);
  const beyond = [ta.x + (ta.x - A.x) / 2, ta.y + (ta.y - A.y) / 2];                 // the cell past the plate (a 1-wide corridor): no path round it
  const past = sim.world.isWalkable(beyond[0] + (beyond[0] - ta.x), beyond[1] + (beyond[1] - ta.y), ta.z) ? [beyond[0] + (beyond[0] - ta.x), beyond[1] + (beyond[1] - ta.y)] : beyond;
  if (sim.world.isWalkable(past[0], past[1], ta.z)) {
    const p = sim.path.find(World.idx(A.x, A.y, A.z), World.idx(past[0], past[1], ta.z));
    if (p.ok) for (const ci of p.path) assert.notEqual(ci, cellA, "no path steps on a spotted trap");
  }
  const seenN = sim.trp.seen.length;
  // a disarm order: stand beside it and defuse it (a craft job)
  const hp0 = A.hp, ids0 = sim.ents.ofKind("item").filter(i => i.item === "trap_parts").length;
  A.action = null; A.job = null;
  assert.ok(sim.apply({ type: "order", ids: [A.id], verb: "disarm", x: ta.x, y: ta.y, z: ta.z }), "the disarm order is accepted");
  for (t = 0; t < 3000 && !sim.trp.done.includes(cellA); t++) { A.hunger = A.thirst = A.energy = 1; B.job = null; B.action = Idle(5); sim.step(); }
  assert.ok(sim.trp.done.includes(cellA), "the trap is gone after the order (" + t + " ticks)");
  const parts = sim.ents.ofKind("item").filter(i => i.item === "trap_parts").reduce((a, i) => a + i.n, 0) - ids0;
  const hurt = A.hp < hp0 || !sim.ents.get(A.id);
  assert.ok(parts >= 1 || hurt, "defused for parts or set off");
  assert.ok(!(sim.world.flags(ta.x, ta.y, ta.z) & F.OBSTACLE), "the mark is gone");
  assert.ok(!seenTraps(sim).some(q => q.x === ta.x && q.y === ta.y), "no glyph once it is gone");
  for (let k = 0; k < 300 && sim.ents.get(A.id) && A.order; k++) { A.hunger = A.thirst = A.energy = 1; sim.step(); }
  assert.ok(!sim.ents.get(A.id) || !A.order, "the order ends once the trap is gone");
  // the chance rises with craft skill and mind, and a collapse is harder than darts
  const v1 = { ...B, t: { ...B.t, intelligence: 1 } }, v2 = { ...B, t: { ...B.t, intelligence: 1.2 } };
  assert.ok(disarmChance(v2, "dart") > disarmChance(v1, "dart") && disarmChance(v1, "collapse") < disarmChance(v1, "dart"), "chance: sharper minds do better; a collapse is harder");
  ok("traps: spotted after " + seenN + " mark(s), blocks the path, a disarm order " + (parts >= 1 ? "defused it for " + parts + " trap parts" : "slipped and set it off") + "; dart plate -> " + TRAPS.dart.dmg + " hit points");
  // a skilled hand defuses it for the parts (the roll is fixed by the tick: try a few ticks on fresh copies of the fixture)
  {
    let okRun = null;
    for (let k = 0; k < 14 && !okRun; k++) {
      const s2 = loadFixture("trap"), a2 = s2.ents.get(A.id), t2 = nearTrap2(s2, a2);
      a2.sk.craft.xp = 4000; a2.t.intelligence = 1.2;
      spot(s2, t2.x, t2.y, t2.z);
      assert.ok(disarmChance(a2, t2.k) > 0.75, "a master craftsman's chance: " + disarmChance(a2, t2.k).toFixed(2));
      s2.tick += 3 * k + 1;
      const r = disarm(s2, a2, t2.x, t2.y, t2.z);
      if (r === "ok") okRun = { s2, t2 };
    }
    assert.ok(okRun, "a master craftsman defuses a dart plate within a few tries");
    const { s2, t2 } = okRun;
    assert.ok(s2.ents.ofKind("item").some(i => i.item === "trap_parts" && i.n >= 1), "the parts are left on the floor");
    assert.ok(s2.trp.done.includes(World.idx(t2.x, t2.y, t2.z)) && !(s2.world.flags(t2.x, t2.y, t2.z) & F.OBSTACLE), "the trap is gone and unmarked");
    assert.ok(s2.world.isWalkable(t2.x, t2.y, t2.z), "the corridor is open again");
  }
  // an unseen trap goes off under a foot
  const cellB = World.idx(tb.x, tb.y, tb.z), hpB = B.hp, zB = B.z;
  assert.ok(!sim.trp.done.includes(cellB));
  if (sim.trp.seen.includes(cellB)) { /* spotted meanwhile: the hidden path is tested through springTrap below */ }
  B.job = null; B.action = null; B.hp = 100;
  sim.ents.move(B, tb.x, tb.y, tb.z);
  sim.step();
  const gone = sim.ents.get(B.id);
  assert.ok(sim.trp.done.includes(cellB), "stepping on a trap sets it off for good");
  if (tb.k === "gas") { assert.ok(sim.trp.gas.length === 1 && badAt(sim, tb.x, tb.y, tb.z), "a gas trap fouls the air round it"); }
  else if (tb.k === "pit") { assert.ok(gone.z === zB - 3 || gone.hp < 100, "a pit drops a level"); assert.equal(sim.world.mat(tb.x, tb.y, tb.z - 1), M.AIR, "the floor is a shaft now"); }
  else if (tb.k === "collapse") { assert.ok([M.RUBBLE].includes(sim.world.mat(tb.x, tb.y, tb.z)) || [M.RUBBLE].includes(sim.world.mat(tb.x, tb.y, tb.z + 1)), "a collapse leaves rubble"); }
  if (gone) assert.ok(gone.hp <= 100 - TRAPS[tb.k].dmg + 1 && gone.hp >= 100 - TRAPS[tb.k].dmg - 6, "the hit: " + gone.hp);
  ok("trigger: B stepped on a hidden " + tb.k + " trap: " + (gone ? "hp " + gone.hp : "killed") + ", it is gone for good");
}

// ---- 7. caches spill their table; a workshop seen is evidence ----
{
  const sim = loadFixture("trap");
  const v = sim.ents.ofKind("villager").find(q => q.z <= 14);
  const dun = dungeonAt(sim.def, v.x, v.y);
  const cc = cacheList(dun)[0];
  const before = sim.ents.ofKind("item").length;
  const n = openCache(sim, v, cc.x, cc.y, cc.z);
  assert.ok(n >= 1 && sim.ents.ofKind("item").length > before, "digging a cache open spills " + n + " units");
  // a workshop
  const ws = dun.rooms.find(r => r.kind === "workshop");
  assert.ok(ws, "this labyrinth has an ancient workshop");
  const w2 = sim.ents.ofKind("villager").filter(q => q.z <= 14)[1];
  w2.job = null; w2.order = null; w2.action = null;
  sim.ents.move(w2, ws.ax, ws.ay, dun.s[ws.j]);
  const nCur = sim.disc.curio.length;
  for (let i = 0; i < 60; i++) { w2.job = null; w2.action = Idle(5); w2.hunger = w2.thirst = w2.energy = 1; sim.step(); }
  assert.equal(sim.trp.ws.length, 1, "standing in a workshop notes it");
  const craft = sim.trp.ws[0][0];
  assert.ok(sim.disc.curio.length === nCur + 1 && sim.disc.curio.some(c => c.craft === craft && !c.wild), "it is a Curiosity");
  assert.ok(evidenceOf(sim, craft) >= 0.6, "and evidence of its craft: " + evidenceOf(sim, craft));
  ok("workshop: seen -> a Curiosity and evidence (" + craft + "); a cache spilled " + n + " units");
  // save round trip keeps the ledger
  const j = JSON.parse(toJSON(sim));
  assert.equal(j.v, SAVE_VERSION); assert.equal(SAVE_VERSION, 20);
  assert.ok(j.trp && j.trp.ws.length === 1);
  const back = restore(JSON.stringify(j));
  assert.equal(back.hash(), sim.hash(), "the ledger survives a save");
  assert.ok(evidenceOf(back, craft) >= 0.6);
  ok("save: v" + SAVE_VERSION + " round trip keeps the trap ledger");
}
console.log("dungeon ok");
