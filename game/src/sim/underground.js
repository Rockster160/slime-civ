// Underground hazards (GDD §13.6, R20; S12): unsupported spans and bad air. This file only ANSWERS questions (pure functions of
// the world, the furniture and sim.ug); cavein.js is the one that ticks, collapses and plans.
//
// CAVE-IN. A stand cell under natural rock is UNSTABLE when no support stands within SPAN_R cells of it on its level (Chebyshev):
// rock wall, a pillar left in a dug room, a timber support post, rubble. So a tunnel (walls beside it) and a room up to
// 2*SPAN_R = 4 cells wide are fine and a hall wider than that is not. Natural caves, pits open to the sky and built roofs are
// exempt. Unstable cells crack (sim.ug.cr = [[cell, tick first seen cracked]], sorted by cell) and fall CRACK_TICKS later.
//
// BAD AIR. The open cells under rock form an air network. A cell is a source of fresh air when it touches the open (a ramp mouth,
// a shaft) or holds a vent or a bellows. d = steps from the nearest source through the network. A dead end deeper than
// VENT_N (and not a natural cave) goes stale (a sealed hall cut off from every opening has no flow and is left alone); a gas pocket (worldgen: world.geo.gas, cells of rock that release gas when opened,
// plus one cell group at the far end of the cave) fouls everything within 2 cells of it that is farther than POCKET_N from air.
// A vent beside the pocket, a bellows, or a ramp to the surface clears it.
//
// "Known" is the fog: villagers only refuse hazard cells somebody has SEEN (seen.js), so the first sight of bad air costs health.
import { World, M, F } from "./world.js";
import { isSeen } from "./seen.js";
import { isNatural, underground, inLight, lightSources } from "./light.js";

export const SPAN_R = 2;                  // a support must stand within this many cells: halls wider than 4 cave in
export const CRACK_TICKS = 1200;          // from the first crack to the fall (two thirds of a game day; a best guess)
export const COLLAPSE_DMG = 40;           // hit points lost by whoever is under a fall
export const VENT_N = 12;                 // steps of tunnel from fresh air before a dead end goes stale
export const POCKET_N = 4;                // steps from fresh air within which a gas pocket is cleared
export const GAS_R = 2;                   // cells round an opened pocket that its gas fouls
export const AIR_DMG = 90;                // health per game day lost in bad air (worse than starvation, slower than thirst; a best guess)
export const AIR_TIRE = 1.5;              // energy per game day lost in bad air

const idx = World.idx;
export function newUg() { return { cr: [], n: 0 }; }

// ---- the span rule ----------------------------------------------------------------------------------------------------

/** Natural ground over a stand cell within two cells (a one-high tunnel, or a two-high room). `hole` = a Set of cells treated as already dug. */
function roofedAt(w, x, y, z, hole) {
  const m1 = hole && hole.has(idx(x, y, z + 1)) ? M.AIR : w.mat(x, y, z + 1);
  if (isNatural(m1)) return true;
  if (m1 !== M.AIR) return false;
  const m2 = hole && hole.has(idx(x, y, z + 2)) ? M.AIR : w.mat(x, y, z + 2);
  return isNatural(m2);
}
const solidAt = (w, x, y, z, hole) => !(hole && hole.has(idx(x, y, z))) && w.isSolid(x, y, z);

/** Is this cell open air of a natural cave (its own rock vault holds)? S16: the cave cells carry a flag, so every cave in the endless land counts, loaded or not. */
export const isCave = (w, x, y, z) => (w.flags(x, y, z) & F.NATURAL) !== 0;

/** Cell indices of a resident chunk that carry `flag`, ascending (memoised on the chunk: flags of generation never change). */
function flagged(c, flag, key) {
  if (!c[key]) {
    const a = [], X0 = c.cx << 4, Y0 = c.cy << 4;
    for (let i = 0; i < c.flgs.length; i++) if (c.flgs[i] & flag) a.push(World.idx(X0 + (i & 15), Y0 + ((i >> 4) & 15), i >> 8));
    c[key] = a;
  }
  return c[key];
}
/** The natural caves' cells in the resident chunks (derived from the seed; rebuilt when the resident set changes). */
export function caveSet(sim) {
  const k = sim.cache, w = sim.world;
  if (!k.ugc || k.ugcv !== w.resVer) {
    const s = new Set();
    for (const key of w.chunkKeys()) for (const i of flagged(w.chunks.get(key), F.NATURAL, "nat")) s.add(i);
    k.ugc = s; k.ugcv = w.resVer;
  }
  return k.ugc;
}

/** Is a support within SPAN_R of this cell on its level? */
function supported(w, x, y, z, hole) {
  for (let r = 1; r <= SPAN_R; r++) {
    for (let dx = -r; dx <= r; dx++) {
      if (solidAt(w, x + dx, y - r, z, hole) || solidAt(w, x + dx, y + r, z, hole)) return true;
    }
    for (let dy = -r + 1; dy <= r - 1; dy++) {
      if (solidAt(w, x - r, y + dy, z, hole) || solidAt(w, x + r, y + dy, z, hole)) return true;
    }
  }
  return false;
}

/** Is the stand cell (x,y,z) a roofed open cell with nothing holding the roof up near it? `hole`: cells to treat as dug. */
export function unstableAt(sim, x, y, z, hole) {
  const w = sim.world, open = hole && hole.has(idx(x, y, z));
  if (!open && !w.isWalkable(x, y, z)) return false;
  if (open && !solidAt(w, x, y, z - 1, hole)) return false;
  if (!roofedAt(w, x, y, z, hole) || isCave(w, x, y, z)) return false;
  return !supported(w, x, y, z, hole);
}

/** Would digging cell `i` too (after the cells already in `hole`, a Set) leave a roofed cell with no support near it? (mine.js leaves a pillar instead.) */
export function wouldCollapse(sim, hole, i) {
  hole.add(i);
  const [cx, cy, cz] = World.xyz(i);
  let bad = false;
  for (let dy = -SPAN_R; dy <= SPAN_R && !bad; dy++) for (let dx = -SPAN_R; dx <= SPAN_R && !bad; dx++) bad = unstableAt(sim, cx + dx, cy + dy, cz, hole);
  if (bad) hole.delete(i);
  return bad;
}

/** The cracking cells as a Set (derived; rebuilt when sim.ug.cr is replaced). */
export function crSet(sim) {
  const k = sim.cache;
  if (k.crRef !== sim.ug.cr) { k.crRef = sim.ug.cr; k.crs = new Set(sim.ug.cr.map(e => e[0])); }
  return k.crs;
}

// ---- the air network ----------------------------------------------------------------------------------------------------

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** The stand cell reached by one step from (x,y,z) towards (nx,ny): the pathfinder's moves. -1 if none. */
function stepZ(w, x, y, z, nx, ny) {
  if (w.isWalkable(nx, ny, z)) return z;
  if (w.isWalkable(nx, ny, z + 1) && !w.isSolid(x, y, z + 1)) return z + 1;
  if (w.isWalkable(nx, ny, z - 1) && !w.isSolid(nx, ny, z)) return z - 1;
  return -1;
}
/** An open cell in the network: a stand cell under rock (or on the floor of a natural cave). */
function isU(sim, x, y, z) {
  const w = sim.world;
  return w.isWalkable(x, y, z) && (roofedAt(w, x, y, z, null) || isCave(w, x, y, z));
}
/** Every cell that could be in the network: the cave, and every cell that has ever been changed (append-only superset; derived from the delta log). */
function candidates(sim) {
  const k = sim.cache, log = sim.world.log;
  if (!k.ucl) k.ucl = { arr: [], seen: new Set(), n: 0, rv: -1 };
  const c = k.ucl;
  if (c.rv !== sim.world.resVer) { for (const i of caveSet(sim)) if (!c.seen.has(i)) { c.seen.add(i); c.arr.push(i); } c.rv = sim.world.resVer; }
  if (log && log.size !== c.n) {
    for (const i of log) if (!c.seen.has(i)) { c.seen.add(i); c.arr.push(i); }
    c.n = log.size;
  }
  return c.arr;
}
function ventSig(sim) {
  let s = 0, n = 0;
  for (const e of sim.ents.ofKind("furniture")) if (e.f === "vent" || e.f === "bellows") { s = (s * 31 + e.x * 7919 + e.y * 104729 + e.z) | 0; n++; }
  return n + ":" + s;
}

/** {bad:Set, d:Map cell -> steps, cells:[U cells]}: recomputed only when the open network or the vents changed. */
export function airMap(sim) {
  const k = sim.cache, w = sim.world;
  const key = w.version + "|" + ventSig(sim) + "|" + w.resVer;
  if (k.air && k.air.key === key) return k.air;
  // the network
  const cells = [];
  for (const i of candidates(sim)) {
    const [x, y, z] = World.xyz(i);
    if (z >= 1 && isU(sim, x, y, z)) cells.push(i);
  }
  cells.sort((a, b) => a - b);
  const gen = 1, d = new Map(), stm = new Map(), queue = [];                // S16: cells are unbounded, so the scratch is a Map (the network is small)
  const st = { get: (i) => stm.get(i) || 0 }, dget = (i) => d.get(i);
  const open = (i) => { stm.set(i, gen); d.set(i, 0); queue.push(i); };
  for (const i of cells) {                                     // sources: touching the open air
    const [x, y, z] = World.xyz(i);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = stepZ(w, x, y, z, nx, ny);
      if (nz >= 0 && !isU(sim, nx, ny, nz)) { if (stm.get(i) !== gen) open(i); break; }
    }
  }
  for (const e of sim.ents.ofKind("furniture")) {              // a vent or a bellows is a source where it stands
    if (e.f !== "vent" && e.f !== "bellows") continue;
    const i = idx(e.x, e.y, e.z);
    if (stm.get(i) !== gen && isU(sim, e.x, e.y, e.z)) open(i);
  }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h], [x, y, z] = World.xyz(i);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = stepZ(w, x, y, z, nx, ny);
      if (nz < 0) continue;
      const n = idx(nx, ny, nz);
      if (stm.get(n) === gen || !isU(sim, nx, ny, nz)) continue;
      stm.set(n, gen); d.set(n, d.get(i) + 1); queue.push(n);
    }
  }
  const dist = new Map(), bad = new Set();
  for (const i of cells) { if (stm.get(i) === gen) dist.set(i, d.get(i)); if (!isCave(w, ...World.xyz(i)) && stm.get(i) === gen && d.get(i) > VENT_N) bad.add(i); }      // a sealed pocket of open cells has no air flow to speak of: only connected dead ends go stale
  for (const g of gasCells(sim)) {                             // a pocket that has been opened fouls what is near it, unless fresh air is close
    const [gx, gy, gz] = World.xyz(g);
    if (w.mat(gx, gy, gz) !== M.AIR) continue;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -GAS_R; dy <= GAS_R; dy++) for (let dx = -GAS_R; dx <= GAS_R; dx++) {
      const x = gx + dx, y = gy + dy, z = gz + dz, i = idx(x, y, z);
      if (z < 0 || z >= 24 || !(i === g || isU(sim, x, y, z))) continue;
      if (stm.get(i) !== gen || d.get(i) > POCKET_N) bad.add(i);
    }
  }
  return (k.air = { key, bad, d: dist, cells });
}
/** The gas pockets (cells flagged GAS by terrain.js) in the resident chunks, ascending; rebuilt when the resident set changes. */
export function gasCells(sim) {
  const k = sim.cache, w = sim.world;
  if (!k.gasl || k.gasv !== w.resVer) {
    const a = [];
    for (const key of w.chunkKeys()) for (const i of flagged(w.chunks.get(key), F.GAS, "gas")) a.push(i);
    k.gasl = a.sort((p, q) => p - q); k.gasv = w.resVer;
  }
  return k.gasl;
}

export function badAt(sim, x, y, z) { return airMap(sim).bad.has(idx(x, y, z)); }

/** Health (per game day) and energy lost by a villager standing in bad air (villager.js updateNeeds). */
export function airHarm(sim, v) { return badAt(sim, v.x, v.y, v.z) ? AIR_DMG : 0; }

// ---- what autonomy refuses (lair.js restricted) ----------------------------------------------------------------

/** "unstable" (a cracking roof over or beside the cell), "badair" (foul air somebody has seen), or "". */
export function hazardAt(sim, x, y, z) {
  if (sim.ug.cr.length) {
    const cr = crSet(sim);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cr.has(idx(x + dx, y + dy, z))) return "unstable";
  }
  if (isSeen(sim, x, y, z) && badAt(sim, x, y, z)) return "badair";
  return "";
}

/** Plain-language hazard lines for the one standing at (x,y,z) (the possession banner). */
export function hazardLines(sim, x, y, z) {
  const out = [];
  const cr = sim.ug.cr, near = cr.filter(([i]) => { const [a, b, c] = World.xyz(i); return Math.abs(a - x) <= 3 && Math.abs(b - y) <= 3 && Math.abs(c - z) <= 1; });
  if (near.length) {
    const left = Math.max(0, CRACK_TICKS - (sim.tick - Math.min(...near.map(e => e[1])))), s = Math.ceil(left / 20);
    out.push("The roof here is cracking and will fall in about " + s + " seconds: walk out, or post a timber support.");
  }
  if (badAt(sim, x, y, z)) out.push("Bad air here: it is draining health and energy. Walk out, or build a vent or a bellows close by.");
  else if (underground(sim.world, x, y, z) && !isLitHere(sim, x, y, z)) out.push("Dark: work is slower and you cannot see far. Place a torch.");
  return out;
}
const isLitHere = (sim, x, y, z) => inLight(lightSources(sim), x, y, z);
