// Fog of knowledge (GDD §13.8): which cells has anybody laid eyes on?
//
// sim.seen = {b: Map chunk -> Uint8Array 0/1, cs: revealed surface columns, log: [idx...] cells seen AFTER generation, lm: landmarks, ver, known: {mat: [idx...]}, ready}
// Saved compactly (see the end of this file): the starting set (the surface and every rock face open to the
// air) is rebuilt from the terrain by initSeen. `known` is derived: ore and clay cells that are seen, so seek-X
// can ask "where have we seen malachite?" without reading the map (it must not know about unseen ore).
//
// Sight rule (cheap, deterministic; D22): a villager marks the 3x3x3 block around the cell they stand in
// (everything adjacent to an open cell they have stood in), and, when underground, the cells along 24 short
// rays at their own level up to SIGHT cells until a solid cell stops each ray (a cave hall is seen as you walk
// through it). The GDD's "radius 1 without a torch" is widened to 3; torches and lamps (light.js, S12) widen it to their radius.
// v.lk on each villager (saved) is the cell they last looked from.
// A dug cell also shows its neighbours (the digger looks into the hole), so a vein can be followed.
import { D, M, World } from "./world.js";
import { sightAt } from "./light.js";
import { chunkKey, chunkKX, chunkKY } from "./cellkey.js";
import { exposure } from "./memory.js";
import { coldRecs } from "./paging.js";

export const SIGHT = 3;
export const SURFACE_SIGHT = 14;     // S16: the surface is "seen" this far (a disc) round where a villager has been; the rest of the land is drawn dim as unexplored
export const SPAWN_SIGHT = 40;       // ... and round the spawn from the start
const ORE = new Uint8Array(256);
for (const m of [M.FLINT, M.MALACHITE, M.CLAY, M.IRONORE, M.COAL, M.SALT, M.PEAT, M.HERB, M.GEM, M.CRYSTAL, M.COREORE, M.CORE]) ORE[m] = 1;
export const isOre = (m) => ORE[m] === 1;
const CELLS = 16 * 16 * D;

/**
 * b: Map chunkKey -> Uint8Array(16*16*D) 0/1 (a chunk's worth of cells is made the first time anything in it is seen); cs: Map chunkKey -> Uint8Array(256), the surface
 * COLUMNS revealed (ncols: how many; saved as per-chunk bitsets); lm: landmarks seen [[kind, x, y]] (scout.js); log: cells seen by other means after generation; bbox: the explored area.
 */
export function newSeen() { return { b: new Map(), cs: new Map(), x: new Map(), ncols: 0, log: [], lm: [], ver: 0, known: {}, ready: false, bbox: null, pk: null }; }
/** 8.24: the newest cells seen are all that explore.js reads (LOG_SCAN); the list is trimmed to a bounded tail (it used to grow for ever and was saved whole). */
export const LOG_TAIL = 500;

/** 1 if the cell has been seen. */
export function seenAt(s, x, y, z) {
  const a = s.b.get(chunkKey(x >> 4, y >> 4));
  return a && z >= 0 && z < D ? a[(z << 8) | ((y & 15) << 4) | (x & 15)] : 0;
}
export function markSeen(sim, x, y, z) {
  if (z < 0 || z >= D) return;
  const s = sim.seen, k = chunkKey(x >> 4, y >> 4);
  let a = s.b.get(k);
  if (!a) { a = new Uint8Array(CELLS); s.b.set(k, a); }
  const l = (z << 8) | ((y & 15) << 4) | (x & 15);
  if (a[l]) return;
  a[l] = 1; s.ver++;
  let xa = s.x.get(k);                                  // 8.24: the cells seen by other means than a revealed surface column, as a per-chunk bitset (what the old log was, without its order and its growth)
  if (!xa) { xa = new Uint8Array(CELLS); s.x.set(k, xa); }
  xa[l] = 1;
  if (s.ready) { s.log.push(World.idx(x, y, z)); if (s.log.length > 2 * LOG_TAIL) s.log.splice(0, s.log.length - LOG_TAIL); }
  const m = sim.world.mat(x, y, z);
  if (ORE[m]) (s.known[m] || (s.known[m] = [])).push(World.idx(x, y, z));
}
export function isSeen(sim, x, y, z) { return seenAt(sim.seen, x, y, z) === 1; }

/** The z of the top of a column as generated: the water surface over a lake, else the topmost solid cell. */
const topOf = (w, x, y) => Math.max(w.hsAt(x, y), w.hsAt(x, y) <= 11 ? 11 : 0);
/** Reveal one surface column: its top, and every cell from the lowest neighbouring top up (the faces open to the air), quietly (the column list is what is saved, not the cells). */
function revealColumn(sim, x, y) {
  const s = sim.seen, w = sim.world, top = topOf(w, x, y), k = chunkKey(x >> 4, y >> 4);
  let lo = top;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nt = topOf(w, x + dx, y + dy); if (nt < lo) lo = nt; }
  let a = s.b.get(k);
  if (!a) { a = new Uint8Array(CELLS); s.b.set(k, a); }
  const ch = w._get(x >> 4, y >> 4), col = ((y & 15) << 4) | (x & 15);
  const mark = (z) => {
    const l = (z << 8) | col;
    if (a[l]) return;
    a[l] = 1; s.ver++;
    const m = ch.mats[l];
    if (ORE[m]) (s.known[m] || (s.known[m] = [])).push(World.idx(x, y, z));
  };
  for (let z = Math.max(0, lo + 1); z < D; z++) mark(z);
  if (top >= 0) mark(top);
}
/** Reveal the surface within a disc of radius r round (x, y); each column once. */
export function revealDisc(sim, x, y, r) {
  const s = sim.seen, r2 = r * r;
  let lastK = -1, cs = null;
  for (let cy = y - r; cy <= y + r; cy++) for (let cx = x - r; cx <= x + r; cx++) {
    if ((cx - x) * (cx - x) + (cy - y) * (cy - y) > r2) continue;
    const k = chunkKey(cx >> 4, cy >> 4);
    if (k !== lastK) { cs = s.cs.get(k); if (!cs) { cs = new Uint8Array(256); s.cs.set(k, cs); } lastK = k; }
    const c = ((cy & 15) << 4) | (cx & 15);
    if (cs[c]) continue;
    cs[c] = 1;
    s.ncols++; s.ver++;
    revealColumn(sim, cx, cy);
    const bb = s.bbox;
    if (!bb) s.bbox = { x0: cx, y0: cy, x1: cx, y1: cy };
    else { if (cx < bb.x0) bb.x0 = cx; if (cx > bb.x1) bb.x1 = cx; if (cy < bb.y0) bb.y0 = cy; if (cy > bb.y1) bb.y1 = cy; }
  }
}
/** Has the surface column been revealed (the land is "explored" there)? */
export function exploredAt(s, x, y) { const cs = s.cs.get(chunkKey(x >> 4, y >> 4)); return !!cs && cs[((y & 15) << 4) | (x & 15)] === 1; }

/** The starting knowledge: the surface round the spawn, and the solid faces open to the air at the sides. */
export function initSeen(sim) {
  const st = sim.world.site;
  revealDisc(sim, st.x, st.y, SPAWN_SIGHT);
  sim.seen.ready = true;
}

/** The 3x3x3 block around a cell. */
export function reveal(sim, x, y, z) {
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) markSeen(sim, x + dx, y + dy, z + dz);
}

// the ray ends on the ring at Chebyshev distance r (24 of them for the dark default SIGHT; a torch's wider ring has more), made once per radius
const RAY_SETS = {};
function raysFor(r) {
  if (RAY_SETS[r]) return RAY_SETS[r];
  const out = [];
  for (let i = -r; i <= r; i++) { out.push([r, i], [-r, i]); if (i > -r && i < r) out.push([i, r], [i, -r]); }
  return (RAY_SETS[r] = out);
}

/** Called each tick for every villager: look around when they have moved. v.lk (the cell last looked from) is saved with the villager, so a loaded sim looks exactly when the original would. */
export function watch(sim, v) {
  const i = World.idx(v.x, v.y, v.z);
  if (v.lk === i) return;
  const old = v.lk === undefined || v.lk === null ? null : World.xyz(v.lk);
  v.lk = i;
  if (!old || (old[0] >> 2) !== (v.x >> 2) || (old[1] >> 2) !== (v.y >> 2)) revealDisc(sim, v.x, v.y, SURFACE_SIGHT);     // S16: the land round where they have been becomes known
  const ver0 = sim.seen.ver;
  look(sim, v.x, v.y, v.z, sightAt(sim, v.x, v.y, v.z, SIGHT, v));         // S12: in torchlight a tunnel is seen further
  if (sim.seen.ver - ver0 >= 6) exposure(sim, v, sim.seen.ver - ver0);      // experiment: new cave cells seen is an exposure to caves (memory.js), at most one per few ticks
}

/** The edge of what is known (S8's "restricted cells"): an unseen cell with a seen 4-neighbour at the same level. */
export function isFrontier(sim, x, y, z) {
  if (isSeen(sim, x, y, z)) return false;
  return isSeen(sim, x + 1, y, z) || isSeen(sim, x - 1, y, z) || isSeen(sim, x, y + 1, z) || isSeen(sim, x, y - 1, z);
}
export function look(sim, x, y, z, sight = SIGHT) {
  reveal(sim, x, y, z);
  const w = sim.world;
  let under = false;
  for (let k = 1; k <= 4 && !under; k++) under = w.isSolid(x, y, z + k);
  if (!under) return;                                  // the open air sees the surface, which is known from the start
  for (const [ex, ey] of raysFor(sight)) {
    for (let s = 1; s <= sight; s++) {
      const cx = x + Math.floor((ex * s) / sight + 0.5), cy = y + Math.floor((ey * s) / sight + 0.5);
      markSeen(sim, cx, cy, z);
      if (w.isSolid(cx, cy, z)) break;                 // a rock face stops the ray (and is itself seen)
      markSeen(sim, cx, cy, z - 1);                    // the floor of an open cell
    }
  }
}

// ---- save / hash ----
// S17: compact. Revealed surface columns are per-chunk bitsets (a chunk is 256 columns): 1 = all of them, else the shorter of a 64-digit hex string and
// a run list [start, length, ...] in chunk-local numbers. 8.24: cells seen by other means (underground) are per-chunk bitsets too, packed as run lists of
// local cell numbers, column-major (column * D + z, column = y << 4 | x) and gap-coded; the per-cell `log` is gone (only its bounded tail `rc` is kept, for explore.js). All ascending by chunk key,
// so the form is canonical (it is also what the state hash reads). The pack is cached on `ver`, which moves with every new cell and column.

const runs = (a) => { const out = []; for (let i = 0; i < a.length;) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; out.push(a[i], j - i + 1); i = j + 1; } return out; };
const HEX = "0123456789abcdef";
function colsOf(bits) {
  const on = []; let n = 0;
  for (let i = 0; i < 256; i++) if (bits[i]) { on.push(i); n++; }
  if (n === 256) return 1;
  const r = runs(on);
  if (r.length * 3.2 < 64) return r;
  let h = "";
  for (let i = 0; i < 256; i += 4) h += HEX[bits[i] | (bits[i + 1] << 1) | (bits[i + 2] << 2) | (bits[i + 3] << 3)];
  return h;
}
function colsTo(rep, bits) {
  if (rep === 1) bits.fill(1);
  else if (typeof rep === "string") for (let i = 0; i < 64; i++) { const v = parseInt(rep[i], 16); for (let b = 0; b < 4; b++) bits[i * 4 + b] = (v >> b) & 1; }
  else for (let k = 0; k < rep.length; k += 2) for (let i = rep[k], e = rep[k] + rep[k + 1]; i < e; i++) bits[i] = 1;
}
/** {c: [[chunkKey, columns]], x: [[chunkKey, runs of local cells]], rc: the newest cells seen (cell indices, oldest first), lm: landmarks}. */
export function seenRle(sim) {
  const s = sim.seen;
  if (!s.pk || s.pk.ver !== s.ver) {
    const c = [], x = [];
    for (const k of [...s.cs.keys()].sort((a, b) => a - b)) { const bits = s.cs.get(k); if (bits.some(v => v)) c.push([k, colsOf(bits)]); }
    for (const k of [...s.x.keys()].sort((a, b) => a - b)) {
      const bits = s.x.get(k), on = [];
      for (let col = 0; col < 256; col++) for (let z = 0; z < D; z++) if (bits[(z << 8) | col]) on.push(col * D + z);      // column-major: a ribbon of cells under a walker is one short run per column, not one per level
      if (on.length) { const r = runs(on), d = []; let prev = 0; for (let q = 0; q < r.length; q += 2) { d.push(r[q] - prev, r[q + 1]); prev = r[q] + r[q + 1]; } x.push([k, d]); }      // [gap since the last run's end, length, ...]: the gaps repeat, so gzip loves it
    }
    s.pk = { ver: s.ver, c, x };
  }
  return { c: s.pk.c, x: s.pk.x, rc: s.log.slice(-LOG_TAIL), lm: (s.lm || []).map(m => m.slice()) };
}
/**
 * Rebuild the knowledge from a pack. The columns are replayed quietly on the terrain as generated (this makes the surface cells and the `known` ore);
 * the other cells are set straight into the per-chunk bitsets (8.24), so the loaded sim holds exactly the cells the saved one did. A pre-8.24 save
 * (`l`: run lists of every cell seen by other means, or a bare run list of cell indices) goes through markSeen as before.
 */
export function loadSeen(sim, data) {
  if (Array.isArray(data)) data = { c: [], l: data };               // (a pre-S16 save: cells only)
  const s = sim.seen, was = s.ready;
  s.ready = false;                                                   // columns: replayed quietly, in index order, from the terrain as generated
  if (data.c.length && typeof data.c[0] === "number") {            // the S16 form: runs of cell indices
    for (let k = 0; k < data.c.length; k += 2) for (let i = data.c[k], e = data.c[k] + data.c[k + 1]; i < e; i++) { const [x, y] = World.xyz(i); revealDisc(sim, x, y, 0); }
  } else {
    const bits = new Uint8Array(256);
    for (const [k, rep] of data.c) {
      bits.fill(0); colsTo(rep, bits);
      const X0 = chunkKX(k) << 4, Y0 = chunkKY(k) << 4;
      for (let i = 0; i < 256; i++) if (bits[i]) revealDisc(sim, X0 + (i & 15), Y0 + (i >> 4), 0);
    }
  }
  if (data.x) {
    for (const [k, rr] of data.x) {
      const cx = chunkKX(k), cy = chunkKY(k), X0 = cx << 4, Y0 = cy << 4;
      let a = s.b.get(k); if (!a) { a = new Uint8Array(CELLS); s.b.set(k, a); }
      let xa = s.x.get(k); if (!xa) { xa = new Uint8Array(CELLS); s.x.set(k, xa); }
      const mats = sim.world._get(cx, cy).mats;
      let at = 0;
      for (let q = 0; q < rr.length; q += 2) for (let n = (at += rr[q]), e = (at += rr[q + 1]); n < e; n++) {
        const l = ((n % D) << 8) | ((n / D) | 0);
        xa[l] = 1;
        if (a[l]) continue;
        a[l] = 1; s.ver++;
        const m = mats[l];
        if (ORE[m]) (s.known[m] || (s.known[m] = [])).push(World.idx(X0 + (l & 15), Y0 + ((l >> 4) & 15), l >> 8));
      }
    }
    s.log = (data.rc || []).slice();
  } else {
    s.ready = true;
    const l = data.l || [];
    if (l.length && typeof l[0] === "number") {
      for (let k = 0; k < l.length; k += 2) for (let i = l[k], e = l[k] + l[k + 1]; i < e; i++) { const [x, y, z] = World.xyz(i); markSeen(sim, x, y, z); }
    } else {
      for (const [k, rr] of l) {
        const X0 = chunkKX(k) << 4, Y0 = chunkKY(k) << 4;
        for (let q = 0; q < rr.length; q += 2) for (let i = rr[q], e = rr[q] + rr[q + 1]; i < e; i++) markSeen(sim, X0 + (i & 15), Y0 + ((i >> 4) & 15), i >> 8);
      }
    }
  }
  s.ready = was;
  s.lm = (data.lm || []).map(m => m.slice());
}

/**
 * A rough picture of the ore a chunk is known to hold, for a chunk that is not in memory: {mat: [count, mean x, mean y]} over the ore cells somebody has
 * seen and that are still ore (8.24; the exact lists are derived again on load). Chunk key -> summary; chunks with no seen ore are left out.
 */
export function oreSummary(sim, only = null) {
  const w = sim.world, by = new Map(), cold = w.ev.size > 0;
  for (const m of Object.keys(sim.seen.known).sort((a, b) => a - b)) {
    for (const i of sim.seen.known[m]) {
      const [x, y, z] = World.xyz(i);
      if (w.mat(x, y, z) !== Number(m)) continue;
      const k = chunkKey(x >> 4, y >> 4);
      if (only ? !only.has(k) : (cold && w.ev.has(k))) continue;                 // (8.26: an evicted chunk's summary was taken when it left: its record)
      let o = by.get(k); if (!o) by.set(k, o = {});
      const e = o[m] || (o[m] = [0, 0, 0]);
      e[0]++; e[1] += x; e[2] += y;
    }
  }
  for (const o of by.values()) for (const e of Object.values(o)) { e[1] = Math.round(e[1] / e[0]); e[2] = Math.round(e[2] / e[0]); }
  if (cold && !only) for (const [k, r] of coldRecs(sim)) if (r.ore) by.set(k, r.ore);
  return by;
}
