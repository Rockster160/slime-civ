// Fog of knowledge (GDD §13.8): which cells has anybody laid eyes on?
//
// sim.seen = {b: Uint8Array(W*H*D) 0/1, log: [idx...] cells seen AFTER generation, ver, known: {mat: [idx...]}, ready}
// Only the log is saved (as run-length pairs): the starting set (the surface and every rock face open to the
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
import { chunkKey } from "./cellkey.js";

export const SIGHT = 3;
export const SURFACE_SIGHT = 14;     // S16: the surface is "seen" this far (a disc) round where a villager has been; the rest of the land is drawn dim as unexplored
export const SPAWN_SIGHT = 40;       // ... and round the spawn from the start
const ORE = new Uint8Array(256);
for (const m of [M.FLINT, M.MALACHITE, M.CLAY, M.IRONORE, M.COAL, M.SALT, M.PEAT, M.HERB]) ORE[m] = 1;
export const isOre = (m) => ORE[m] === 1;
const CELLS = 16 * 16 * D;

/**
 * b: Map chunkKey -> Uint8Array(16*16*D) 0/1 (a chunk's worth of cells is made the first time anything in it is seen); cs: Map chunkKey -> Uint8Array(256), the surface
 * COLUMNS revealed (cols: their cell indices at z 0, in reveal order, saved); log: cells seen by other means after generation; bbox: the explored area.
 */
export function newSeen() { return { b: new Map(), cs: new Map(), cols: [], log: [], ver: 0, known: {}, ready: false, bbox: null }; }

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
  if (s.ready) s.log.push(World.idx(x, y, z));
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
    s.cols.push(World.idx(cx, cy, 0));
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
  look(sim, v.x, v.y, v.z, sightAt(sim, v.x, v.y, v.z, SIGHT));         // S12: in torchlight a tunnel is seen further
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

const rle = (list) => {
  const a = Array.from(new Set(list)).sort((p, q) => p - q), out = [];
  for (let i = 0; i < a.length;) {
    let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    out.push(a[i], j - i + 1); i = j + 1;
  }
  return out;
};
/** {c: revealed surface columns, l: cells seen after generation}, each as [start, length, ...] over the sorted unique indices. */
export function seenRle(sim) { return { c: rle(sim.seen.cols), l: rle(sim.seen.log) }; }
export function loadSeen(sim, data) {
  if (Array.isArray(data)) data = { c: [], l: data };               // (a pre-S16 save: cells only)
  const s = sim.seen, was = s.ready;
  s.ready = false;                                                   // columns: replayed quietly, in index order, from the terrain as generated
  for (let k = 0; k < data.c.length; k += 2) for (let i = data.c[k], e = data.c[k] + data.c[k + 1]; i < e; i++) { const [x, y] = World.xyz(i); revealDisc(sim, x, y, 0); }
  s.ready = was;
  for (let k = 0; k < data.l.length; k += 2) for (let i = data.l[k], e = data.l[k] + data.l[k + 1]; i < e; i++) { const [x, y, z] = World.xyz(i); markSeen(sim, x, y, z); }
}
