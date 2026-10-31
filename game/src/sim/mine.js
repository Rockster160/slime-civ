// Area mining (GDD §13.3, R27): the player marks a region, a shaft, a vein or an item to find, and villagers dig it
// as a derived STANDING-class job (jobs.js genMine). Nothing here is per-block clicking.
//
//   sim.mine = {n, list:[designation]}   (saved + hashed)
//   designation = {id, kind:"region"|"depth"|"vein"|"seek", t0, got, done, why, q:[cell idx...], ...kind fields}
//     region: x0,y0,x1,y1, zt, zb   solid-cell levels zt (top) down to zb. Each layer below the top is inset one cell on
//                                   the x0 side, so the box is stepped like a stair and villagers can climb out of it (D22)
//     depth:  cells:[idx]           the ramp, computed once: a straight stair, 2 cells dug per level (stand + headroom)
//     vein:   mat, sx,sy,sz, cells  every connected SEEN cell of one material from the clicked one; grows as digging shows more
//     seek:   item, mat, n, ax,ay, wp:[[x,y]], wi, bad:[idx]   dig toward the nearest SEEN source of `item`; none seen -> a
//                                   square spiral of tunnels at the soft-rock depth around the anchor until it is sighted
// `q` is the short ordered list of cells to dig next. mineTick() rebuilds it every 20 ticks (never inside plan(), so a
// "Why" preview cannot change the sim); jobs.js just reads it. Tunnels to reach a cell are planned with a Dijkstra/A*
// over stand cells where existing open cells are free and each dug cell costs (tunnelPlan).
import { World, M, F, D } from "./world.js";
import { DIG } from "./dig.js";
import { diggableMarked as diggable } from "./dig.js";
import { push, pop } from "./path.js";
import { isOre, isSeen } from "./seen.js";
import { inZone, stockZoneAt } from "./items.js";
import { log } from "./chronicle.js";
import { designate } from "./notices.js";
import { WATER_LEVEL } from "./terrain.js";
import { inTerritory } from "./lair.js";
import { toolAround } from "./gear.js";
import { wouldCollapse } from "./underground.js";

export const MINE_Q = 24;               // cells in a designation's queue
export const MAX_REGION = 40;           // columns per side of a region
export const MAX_LEVELS = 12;
export const ITEM_MAT = { flint: M.FLINT, malachite: M.MALACHITE, clay: M.CLAY, iron_ore: M.IRONORE, coal: M.COAL, salt: M.SALT, peat: M.PEAT, herb: M.HERB };
/** Rock depth (cells below the surface) of the first hard layer: the iron band. A seek for iron or coal digs its search tunnels there. */
export const IRON_BAND = 10;
export const SEEK_ITEMS = ["flint", "malachite", "clay"];            // what an expedition may look for
export const SEEK_ALL = Object.keys(ITEM_MAT);                         // what the player may order sought (S9: + iron ore and coal, deep in the hard rock)
const SEEK_N = 6;                       // units a seek wants before it calls itself done (3 cells' worth)
const SPIRAL_R = 24, SPIRAL_STEP = 3, BAND_DEPTH = 5;     // the search pattern: rows 3 apart, 5 cells below the surface stand (the soft-rock band)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function newMine() { return { n: 0, list: [] }; }
const idx = World.idx;

/** Cells a villager could stand on to dig (cx,cy,cz): beside it (one up, level, one down) or directly below. */
export function standsFor(w, cx, cy, cz) {
  const out = [];
  for (const [dx, dy] of DIRS) for (const dz of [1, 0, -1]) if (w.isWalkable(cx + dx, cy + dy, cz + dz)) out.push([cx + dx, cy + dy, cz + dz]);
  if (w.isWalkable(cx, cy, cz - 1)) out.push([cx, cy, cz - 1]);
  return out;
}

// ---- reachability: which stand cells can the village actually walk to? ----------------
// A cell with a walkable neighbour is not necessarily digable: the neighbour may be in a sealed pocket. So queues are built
// from a flood fill (the pathfinder's moves) from the camp, bounded to a window around the camp and the marked areas, and
// rebuilt only when the world has changed (derived data, a pure function of the cells; never saved).
function reachWindow(sim) {
  const [sx, sy] = campStand(sim);
  let x0 = sx, y0 = sy, x1 = sx, y1 = sy;
  const grow = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const d of sim.mine.list) {
    if (d.kind === "region") { grow(d.x0, d.y0); grow(d.x1, d.y1); }
    else if (d.kind === "seek") { grow(d.ax - SPIRAL_R - 4, d.ay - SPIRAL_R - 4); grow(d.ax + SPIRAL_R + 4, d.ay + SPIRAL_R + 4); }
    else if (d.cells) for (const i of d.cells) { const [a, b] = World.xyz(i); grow(a, b); }
    for (const i of d.q) { const [a, b] = World.xyz(i); grow(a, b); }
  }
  return [x0 - 8, y0 - 8, x1 + 8, y1 + 8];
}
export function reachMap(sim) {
  const c = sim.cache, w = sim.world, win = reachWindow(sim);
  let r = c.rm;
  if (!r) r = c.rm = { stamp: new Map(), gen: 0, ver: -1, win: null };      // S16: cells are unbounded, so the reach stamps are a Map cell -> generation
  if (r.ver === w.version && r.win && win[0] >= r.win[0] && win[1] >= r.win[1] && win[2] <= r.win[2] && win[3] <= r.win[3]) return r;
  r.gen++; r.ver = w.version; r.win = win; r.stamp.clear();
  const [sx, sy, sz] = campStand(sim);
  if (sz < 0) return r;
  const q = [idx(sx, sy, sz)];
  r.stamp.set(q[0], r.gen);
  for (let h = 0; h < q.length; h++) {
    const [x, y, z] = World.xyz(q[h]);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < win[0] || nx > win[2] || ny < win[1] || ny > win[3]) continue;
      let nz = -1;
      if (w.isWalkable(nx, ny, z)) nz = z;
      else if (w.isWalkable(nx, ny, z + 1) && !w.isSolid(x, y, z + 1)) nz = z + 1;
      else if (w.isWalkable(nx, ny, z - 1) && !w.isSolid(nx, ny, z)) nz = z - 1;
      if (nz < 0) continue;
      const n = idx(nx, ny, nz);
      if (r.stamp.get(n) !== r.gen) { r.stamp.set(n, r.gen); q.push(n); }
    }
  }
  return r;
}
/** Can a villager walk to some cell from which (cx,cy,cz) can be dug? */
function hasReach(sim, rm, cx, cy, cz) {
  const w = sim.world;
  for (const [dx, dy] of DIRS) for (const dz of [1, 0, -1]) if (w.isWalkable(cx + dx, cy + dy, cz + dz) && rm.stamp.get(idx(cx + dx, cy + dy, cz + dz)) === rm.gen) return true;
  return w.isWalkable(cx, cy, cz - 1) && rm.stamp.get(idx(cx, cy, cz - 1)) === rm.gen;
}

// ---- commands -------------------------------------------------------------

/** The cells of a region designation, top layer first, each layer inset one cell further on the x0 side. */
export function regionCells(d) {
  const out = [];
  for (let z = d.zt; z >= d.zb; z--) {
    const k = d.zt - z;
    for (let y = d.y0; y <= d.y1; y++) for (let x = d.x0 + k; x <= d.x1; x++) out.push(idx(x, y, z));
  }
  return out;
}

/** The ramp for "dig to depth": from the stand cell (x,y,z0) going `levels` down, one column per level. null if it hits water or built ground. */
export function rampCells(sim, x, y, z0, levels, dir) {
  const w = sim.world, [dx, dy] = dir, cells = [];
  if (z0 - levels < 1) return null;
  for (let i = 1; i <= levels; i++) {
    const cx = x + dx * i, cy = y + dy * i;
    for (const cz of [z0 - i + 1, z0 - i]) {
      const m = w.mat(cx, cy, cz);
      if (m === M.AIR) continue;
      if (!DIG[m] || (w.flags(cx, cy, cz) & F.PLAYER) || (sim.stock && (stockZoneAt(sim, cx, cy, cz + 1) || stockZoneAt(sim, cx, cy, cz) || stockZoneAt(sim, cx, cy, cz - 1) || stockZoneAt(sim, cx, cy, cz - 2)))) return null;
      cells.push(idx(cx, cy, cz));
    }
    if (!w.isSolid(cx, cy, z0 - i - 1)) return null;           // the foot of every step needs rock to stand on
  }
  return cells;
}

export const MINE_COMMANDS = {
  /**
   * {type:"mine", op, ...}   (a rejection leaves a blocker enum in sim.lastBlocker for the UI)
   *   op "region": x0,y0,x1,y1, z (level of the top layer of solid cells), layers (1..12)
   *   op "depth":  x,y (a stand column), levels (1..12), z? (the stand level; default the surface), dir? [dx,dy]
   *   op "vein":   x,y,z  a SEEN ore or clay cell
   *   op "seek":   item "flint"|"malachite"|"clay", x?,y? anchor of the search (default: the camp)
   *   op "cancel": id? (all designations if omitted)
   */
  mine(sim, c) {
    sim.lastBlocker = "";
    const fail = (b) => { sim.lastBlocker = b; return false; };
    const m = sim.mine, w = sim.world, int = Number.isInteger;
    if (c.op === "cancel") {
      const n0 = m.list.length;
      m.list = m.list.filter(d => c.id !== undefined && d.id !== c.id);
      return m.list.length !== n0 || fail("NOTHING_TO_DIG");
    }
    const base = { id: m.n + 1, t0: sim.tick, got: 0, done: 0, why: "", q: [] };
    let d = null;
    if (c.op === "region") {
      if (![c.x0, c.y0, c.x1, c.y1, c.z].every(int)) return fail("NOTHING_TO_DIG");
      const x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1), y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1);
      const layers = Math.max(1, Math.min(MAX_LEVELS, c.layers || 1));
      if (x1 - x0 + 1 > MAX_REGION || y1 - y0 + 1 > MAX_REGION) return fail("TOO_BIG");
      d = { ...base, kind: "region", x0, y0, x1, y1, zt: Math.min(D - 2, c.z), zb: Math.max(1, c.z - layers + 1) };
      if (!regionCells(d).some(i => DIG[w.mat(...World.xyz(i))])) return fail("NOTHING_TO_DIG");
    } else if (c.op === "depth") {
      if (!int(c.x) || !int(c.y)) return fail("NO_ROUTE");
      const z0 = c.z ?? w.standZ(c.x, c.y), levels = Math.max(1, Math.min(MAX_LEVELS, c.levels || 6));
      if (z0 < 0) return fail("NO_ROUTE");
      let cells = null, dir = null;
      for (const dr of c.dir ? [c.dir] : [[1, 0], [-1, 0], [0, 1], [0, -1]]) { cells = rampCells(sim, c.x, c.y, z0, levels, dr); if (cells) { dir = dr; break; } }
      if (!cells) return fail("NO_ROUTE");
      if (!cells.length) return fail("NOTHING_TO_DIG");
      d = { ...base, kind: "depth", x: c.x, y: c.y, z0, levels, dir, cells };
    } else if (c.op === "vein") {
      const mat = int(c.x) && int(c.y) && int(c.z) ? w.mat(c.x, c.y, c.z) : -1;
      if (!isOre(mat) || !isSeen(sim, c.x, c.y, c.z)) return fail("NOT_ORE");
      d = { ...base, kind: "vein", mat, sx: c.x, sy: c.y, sz: c.z, cells: [idx(c.x, c.y, c.z)] };
    } else if (c.op === "seek") {
      if (!ITEM_MAT[c.item]) return fail("UNKNOWN_ITEM");
      const ax = int(c.x) ? c.x : sim.stock.x0 + ((sim.stock.x1 - sim.stock.x0) >> 1), ay = int(c.y) ? c.y : sim.stock.y0 + ((sim.stock.y1 - sim.stock.y0) >> 1);
      if (!World.inBounds(ax, ay, 1)) return fail("NO_ROUTE");
      d = { ...base, kind: "seek", item: c.item, mat: ITEM_MAT[c.item], n: c.n || SEEK_N, ax, ay, wp: spiral(ax, ay), wi: 0, bad: [], tgt: -1, fail: 0, exp: c.exp || 0, deep: c.deep || 0 };
    } else return fail("NOTHING_TO_DIG");
    m.n++; m.list.push(d);
    const at = d.kind === "region" ? [(d.x0 + d.x1) >> 1, (d.y0 + d.y1) >> 1, d.zt] : d.kind === "depth" ? [d.x, d.y, d.z0] : d.kind === "vein" ? [d.sx, d.sy, d.sz] : [d.ax, d.ay, sim.stock.z];
    designate(sim, "dig", at[0], at[1], at[2], 1);          // 9.31 (OD-58): the designation is written on the board; slimes that are not told learn of it by reading it or from a friend
    return true;
  },
};

/** Corners of a square spiral around (ax,ay), rows SPIRAL_STEP apart, out to SPIRAL_R. */
function spiral(ax, ay) {
  const out = [[ax, ay]], dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let x = ax, y = ay, len = 1, di = 0;
  while (Math.max(Math.abs(x - ax), Math.abs(y - ay)) <= SPIRAL_R) {
    for (let k = 0; k < 2; k++) { x += dirs[di][0] * len * SPIRAL_STEP; y += dirs[di][1] * len * SPIRAL_STEP; out.push([x, y]); di = (di + 1) % 4; }
    len++;
  }
  return out;
}

// ---- the planner: tunnels from the open network to a goal ---------------------------

const DIG_COST = 10, HARD_COST = 5, STEP_COST = 1;
/** Cost of making cell (x,y,z) open: 0 if it already is, -1 if it cannot be, else DIG_COST (+ hard-rock extra). */
function openCost(sim, x, y, z) {
  const w = sim.world, m = w.mat(x, y, z);
  if (m === M.AIR) return (w.flags(x, y, z) & F.OBSTACLE) ? -1 : 0;
  if (!DIG[m] || (w.flags(x, y, z) & F.PLAYER)) return -1;
  if (sim.stock && (stockZoneAt(sim, x, y, z + 1) || stockZoneAt(sim, x, y, z) || stockZoneAt(sim, x, y, z - 1))) return -1;
  if (DIG[m].needs && !toolAround(sim, DIG[m].needs)) return -1;   // S9: deep rock waits for an iron pick (nobody plans a tunnel through it)
  if (!diggable(sim, x, y, z)) return -1;                       // S8: a bed, a bench or a villager on top of it: plan the tunnel round it, not through it
  return DIG_COST + (DIG[m].hard ? HARD_COST : 0);
}
/** The stand cell the village starts from: the middle of the stockpile. */
function campStand(sim) {
  const z = sim.stock, x = z.x0 + ((z.x1 - z.x0) >> 1), y = z.y0 + ((z.y1 - z.y0) >> 1);
  return [x, y, sim.world.standZ(x, y)];
}

/**
 * Cheapest way to get a villager to a goal: states are stand cells, moves are the pathfinder's (a step up or down needs
 * headroom), and making a solid cell open costs DIG_COST. Returns the cells to dig in order (possibly none: already open)
 * or null. `isGoal(x,y,z)` and `h(x,y,z)` (an admissible estimate) define the goal.
 */
function tunnelPlan(sim, isGoal, h, box) {
  const w = sim.world, [sx, sy, sz] = campStand(sim);
  if (sz < 0) return null;
  // S16: cells are unbounded, so nodes are numbered as they are met (a Map cell -> node) and g / from / closed are plain arrays by node
  const ids = new Map(), cells = [], g = [], from = [], closed = [], heap = [];
  const key = (f, n) => f * 1048576 + n;
  const s0 = 0; ids.set(idx(sx, sy, sz), 0); cells.push(idx(sx, sy, sz)); g.push(0); from.push(-1); closed.push(0);
  push(heap, key(h(sx, sy, sz), s0));
  let expanded = 0;
  while (heap.length) {
    const cur = pop(heap) % 1048576;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const [x, y, z] = World.xyz(cells[cur]);
    if (isGoal(x, y, z)) {
      const out = [], seenCell = new Set();
      const add = (a, b, c) => { const i = idx(a, b, c); if (w.mat(a, b, c) !== M.AIR && !seenCell.has(i)) { seenCell.add(i); out.push(i); } };
      const path = []; for (let n = cur; n !== -1; n = from[n]) path.push(cells[n]); path.reverse();
      for (let k = 1; k < path.length; k++) {
        const [ax, ay, az] = World.xyz(path[k - 1]), [bx, by, bz] = World.xyz(path[k]);
        if (bz > az) add(ax, ay, az + 1);                            // headroom over where they stand
        else if (bz < az) add(bx, by, az);                           // headroom over the lower cell
        add(bx, by, bz);
      }
      return out;
    }
    if (++expanded > 80000) return null;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < box[0] || nx > box[2] || ny < box[1] || ny > box[3]) continue;
      for (const dz of [0, 1, -1]) {
        const nz = z + dz;
        if (nz < 1 || nz >= D - 2) continue;
        let cost = STEP_COST + (dz ? 1 : 0);
        const cb = openCost(sim, nx, ny, nz);
        if (cb < 0 || !w.isSolid(nx, ny, nz - 1)) continue;          // the new cell can be opened and has rock to stand on
        cost += cb;
        if (dz === 1) { const ch = openCost(sim, x, y, z + 1); if (ch < 0) continue; cost += ch; }
        else if (dz === -1) { const ch = openCost(sim, nx, ny, z); if (ch < 0) continue; cost += ch; }
        const cell = idx(nx, ny, nz), ng = g[cur] + cost;
        let n = ids.get(cell);
        if (n !== undefined && (closed[n] || ng >= g[n])) continue;
        if (n === undefined) { n = cells.length; ids.set(cell, n); cells.push(cell); g.push(ng); from.push(cur); closed.push(0); }
        else { g[n] = ng; from[n] = cur; }
        push(heap, key(ng + h(nx, ny, nz), n));
      }
    }
  }
  return null;
}
const boxOf = (sim, ax, ay, bx, by, pad = 10) => [Math.min(ax, bx) - pad, Math.min(ay, by) - pad, Math.max(ax, bx) + pad, Math.max(ay, by) + pad];

/** Cells to dig to be able to dig (tx,ty,tz): the tunnel, then the cell itself. */
export function accessPlan(sim, tx, ty, tz) {
  if (hasReach(sim, reachMap(sim), tx, ty, tz)) return [idx(tx, ty, tz)];
  const [sx, sy] = campStand(sim);
  const isGoal = (x, y, z) => (Math.abs(x - tx) + Math.abs(y - ty) === 1 && z >= tz - 1 && z <= tz + 1) || (x === tx && y === ty && z === tz - 1);
  const h = (x, y) => Math.max(0, Math.abs(x - tx) + Math.abs(y - ty) - 1) * STEP_COST;
  const p = tunnelPlan(sim, isGoal, h, boxOf(sim, sx, sy, tx, ty));
  return p ? p.concat([idx(tx, ty, tz)]) : null;
}
/** Cells to dig to open the stand cell (gx,gy,gz) exactly (an exploration corner). */
export function cornerPlan(sim, gx, gy, gz) {
  const [sx, sy] = campStand(sim);
  return tunnelPlan(sim, (x, y, z) => x === gx && y === gy && z === gz, (x, y) => (Math.abs(x - gx) + Math.abs(y - gy)) * STEP_COST, boxOf(sim, sx, sy, gx, gy));
}

// ---- the tick: rebuild each designation's queue ----------------------------------

const live = (sim, i) => { const [x, y, z] = World.xyz(i); return diggableMat(sim, x, y, z); };
const diggableMat = (sim, x, y, z) => !!DIG[sim.world.mat(x, y, z)] && !(sim.world.flags(x, y, z) & F.PLAYER);
const cellDist = (i, x, y, z) => { const [a, b, c] = World.xyz(i); return Math.abs(a - x) + Math.abs(b - y) + 2 * Math.abs(c - z); };

/** Every 20 ticks (sim.js): refresh queues, retire finished designations. */
export function mineTick(sim) {
  const m = sim.mine;
  if (!m.list.length) return;
  for (const d of m.list) {
    d.q = d.q.filter(i => live(sim, i));
    REFRESH[d.kind](sim, d);
  }
  const keep = [];
  for (const d of m.list) {
    if (!d.done || d.exp) { keep.push(d); continue; }      // an expedition retires its own search (expedition.js), after reading the result
    if (d.kind === "seek") log(sim, "MILESTONE", d.fail ? "The search for " + d.item + " came up empty." : "The search for " + d.item + " ended: " + d.got + " found.", [], { item: d.item, got: d.got }, 0);
  }
  m.list = keep;
}

/** A designation's accessible cells first, else a tunnel to the first one that is not. */
function queueFrom(sim, d, cells) {
  const rm = reachMap(sim), out = [], hole = new Set(d.q.filter(i => live(sim, i)));
  for (const i of cells) {
    const [x, y, z] = World.xyz(i);
    if (!diggable(sim, x, y, z) || !hasReach(sim, rm, x, y, z)) continue;
    // S12 (cave-in, §13.6): a cell whose removal would leave a roofed span with no support within 2 cells stays standing, as a pillar, for good
    if (!hole.has(i) && wouldCollapse(sim, hole, i)) { if (!d.pil) d.pil = []; d.pil.push(i); continue; }
    out.push(i);
    if (out.length >= MINE_Q) break;
  }
  if (out.length) { d.q = out; d.why = ""; return; }
  if (!d.q.length && cells.length) {
    const p = accessPlan(sim, ...World.xyz(cells[0]));
    if (p) { d.q = p.slice(0, MINE_Q); d.why = ""; } else d.why = "NO_PATH";
  }
}

const REFRESH = {
  region(sim, d) {
    const pil = d.pil ? new Set(d.pil) : null;
    const cells = regionCells(d).filter(i => live(sim, i) && !(pil && pil.has(i)));
    if (!cells.length) { d.done = 1; return; }
    const [cx, cy, cz] = campStand(sim);
    cells.sort((a, b) => World.xyz(b)[2] - World.xyz(a)[2] || cellDist(a, cx, cy, cz) - cellDist(b, cx, cy, cz) || a - b);   // top layer first, near the camp first
    queueFrom(sim, d, cells);
  },
  depth(sim, d) {
    const left = d.cells.filter(i => live(sim, i));
    if (!left.length) { d.done = 1; return; }
    const rm = reachMap(sim), out = [];
    for (const i of left) {                                       // in order: a step is only reachable after the one before it
      const [x, y, z] = World.xyz(i);
      if (hasReach(sim, rm, x, y, z) && diggable(sim, x, y, z)) out.push(i); else break;
      if (out.length >= 4) break;
    }
    d.q = out; d.why = out.length ? "" : "NO_PATH";
  },
  vein(sim, d) {
    const w = sim.world, have = new Set(d.cells);
    for (let k = 0; k < d.cells.length && d.cells.length < 800; k++) {
      const [x, y, z] = World.xyz(d.cells[k]);
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (!World.inBounds(nx, ny, nz) || w.mat(nx, ny, nz) !== d.mat || !isSeen(sim, nx, ny, nz)) continue;
        const i = idx(nx, ny, nz);
        if (!have.has(i)) { have.add(i); d.cells.push(i); }
      }
    }
    const pil = d.pil ? new Set(d.pil) : null;
    const left = d.cells.filter(i => w.mat(...World.xyz(i)) === d.mat && live(sim, i) && !(pil && pil.has(i)));
    if (!left.length) { d.done = 1; return; }
    left.sort((a, b) => cellDist(a, d.sx, d.sy, d.sz) - cellDist(b, d.sx, d.sy, d.sz) || a - b);
    queueFrom(sim, d, left);
  },
  seek(sim, d) {
    if (d.got >= d.n) { d.done = 1; return; }
    if (d.q.length && !diggable(sim, ...World.xyz(d.q[0]))) {      // S8: a bed or a bench went up on the head of the tunnel: plan it again, round that
      d.q = [];
      if (d.tgt < 0 && d.wi > 0) d.wi--;
    }
    const w = sim.world, known = sim.seen.known[d.mat] || [];
    const h0 = w.hsAt(d.ax, d.ay) - (d.mat === M.IRONORE || d.mat === M.COAL ? IRON_BAND - BAND_DEPTH : 0);
    let best = -1, bd = 1e9;
    for (const i of known) {                                      // only what has been SEEN: the sim does not look at unseen rock
      const [kx, ky, kz] = World.xyz(i);
      if (w.mat(kx, ky, kz) !== d.mat || d.bad.includes(i)) continue;
      if (d.deep && w.hsAt(kx, ky) - kz < d.deep) continue;         // an expedition wants rock well below the surface (S8)
      if (d.exp && inTerritory(sim, kx, ky, kz)) continue;                   // ... and a delegated crew will not dig in the thornback's ground (UNSAFE), so it looks elsewhere
      const dd = cellDist(i, d.ax, d.ay, h0);
      if (dd < bd || (dd === bd && i < best)) { bd = dd; best = i; }       // (ties go to the lower index: the order cells were seen in differs after a load)
    }
    if (best >= 0 && (d.tgt !== best || !d.q.length)) {            // a source is in sight: drop the search pattern and go for it
      const p = accessPlan(sim, ...World.xyz(best));
      if (p) { d.q = p.slice(0, MINE_Q); d.tgt = best; d.why = ""; } else { d.bad.push(best); if (d.bad.length > 40) d.bad.shift(); }
      return;
    }
    if (d.q.length) return;
    d.tgt = -1;
    while (d.wi < d.wp.length && !d.q.length) {                    // no source seen yet: carry on with the spiral
      const [wx, wy] = d.wp[d.wi++];
      const hh = w.hsAt(wx, wy);
      if (hh <= WATER_LEVEL + 1) continue;                                   // lake and stream banks: nothing to find under water
      const p = cornerPlan(sim, wx, wy, Math.max(2, hh - (d.mat === M.IRONORE || d.mat === M.COAL ? IRON_BAND : BAND_DEPTH)));
      if (p && p.length) d.q = p.slice(0, MINE_Q);
    }
    if (!d.q.length && d.wi >= d.wp.length) { d.done = 1; d.fail = d.got < 1 ? 1 : 0; }
  },
};

/** Called by the dig verb when a cell designated by `did` has been removed. */
export function mineDug(sim, did, mat, n, x, y, z) {
  const d = sim.mine.list.find(q => q.id === did);
  if (d && (d.kind === "seek" || d.kind === "vein") && mat === d.mat) {
    d.got += n;
    if (d.exp) d.depth = Math.max(d.depth || 0, sim.world.hsAt(x, y) - z);       // how far down the sample came from (S8 report)
  }
}

/** Is any designation marking this solid cell? (renderer + inspector) */
export function marked(sim, x, y, z) {
  const i = idx(x, y, z);
  for (const d of sim.mine.list) {
    if (d.q.includes(i)) return d;
    if (d.kind === "region" && x >= d.x0 + (d.zt - z) && x <= d.x1 && y >= d.y0 && y <= d.y1 && z <= d.zt && z >= d.zb) return d.pil && d.pil.includes(i) ? null : d;      // a pillar is left standing
    if (d.kind === "depth" && d.cells.includes(i)) return d;
    if (d.kind === "vein" && d.cells.includes(i)) return d;
  }
  return null;
}
