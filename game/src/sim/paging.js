// Chunk paging (8.26): the memory win. A CHANGED chunk (a dug tunnel, a building, a dropped item) was never unloaded, so a long walk kept every one of them in RAM.
// Now a changed chunk that has fallen asleep (dormant.js) or was never woken, and is far from everyone, is EVICTED: its record goes to a `cold` store and its voxel arrays,
// packed plants and place-bound entities leave memory. Walking back pages it in again, the same way restore does one chunk: regrown from the seed, deltas laid over, entities back.
//
//   COLD      the sim's only view of storage, synchronous and pure:  put(key, record)  take(key) -> record | null  peek(key) -> record | null  (+ optional prefetch)
//             memCold() is the plain Map used by tests and the headless sim; the browser backs the same interface with memory plus the async store (ui/cold.js).
//   RECORD    {mt: the chunk's meta row without the key, dc: its terrain deltas (deltas.js packed form), e: its place-bound entities (the live objects)}.
//             Plants and loose items of a dormant chunk are already packed inside `mt` (c.pk / c.pi).
//   EVICT     every 200 ticks (chunkTick): resident, changed, asleep (or never woken), farther than EVICT_CH chunks from every anchor, not under the camera (pg.keep),
//             not pinned (stockpile, fields, pens, cellar, zones), and holding nothing but items, graves and still furniture that nobody has reserved. Anything else (a villager,
//             a creature, a flame, a lit hearth, a plot, a site, a reserved thing) keeps the chunk where it is. Over the cap (pg.cap) the nearest-to-allowed ones go too, farthest first.
//   READS     an evicted chunk is "unloaded land": cells read as freshly generated and World.dormantAt() is true, so fire, spoilage, creatures and the cave-in check treat it as asleep.
//             The bound is a margin: an anchor activates land 3 chunks out, eviction starts 6 out, so a returning walker has 3 chunks of time for the cold store to answer.
//   WRITES    a World write to an evicted chunk pages it in first (World.pager); if the record is not there the write still happens but world.lost counts it.
//   INVISIBLE the sim hashes and saves exactly as if nothing were evicted: sim.hash(), snapshot() and the package read the cold records through worldDeltas / allEntities /
//             chunkMeta (chunks.js). That is the key invariant (tests/paging.js): eviction on and off give the same hash at every tick.
import { chunkKey, chunkKX, chunkKY } from "./cellkey.js";
import { activateChunk } from "./flora.js";
import { packDeltas, unpackDeltas } from "./deltas.js";
import { pinnedChunks } from "./dormant.js";

export const EVICT_CH = 6;           // chunks (Chebyshev) from every anchor before a changed chunk may leave memory (DEACT_CH 4 + 2: sleep first, then go)
export const RES_CAP = 360;          // resident chunks the sim tries to stay under (a typical village holds 100-250 of its own: 7 x 7 round each anchor)
export const EVICT_PERIOD = 200;
export const EVICT_PHASE = 147;      // (tick % 200; chunkTick runs at tick % 20 === 7)
const PLACED = new Set(["item", "grave", "furniture"]);

/** A plain in-memory cold store: the interface the sim needs. */
export function memCold() {
  const m = new Map();
  return {
    m,
    put(k, rec) { m.set(k, rec); },
    take(k) { const r = m.get(k); if (r === undefined) return null; m.delete(k); return r; },
    peek(k) { return m.get(k) || null; },
    keys() { return [...m.keys()]; },
  };
}

/** Turn paging on for a sim (null cold = a memory store). Runtime only: nothing here is saved or hashed. */
export function enablePaging(sim, cold = memCold(), opts = {}) {
  const pg = sim.pg = { cold, keep: new Set(), cap: opts.cap || RES_CAP, evictCh: opts.evictCh || EVICT_CH, evicted: 0, paged: 0, miss: 0, peak: 0 };
  sim.world.pager = (cx, cy) => pageIn(sim, chunkKey(cx, cy));
  return pg;
}
export function disablePaging(sim) {
  if (!sim.pg) return;
  for (const k of [...sim.world.ev]) pageIn(sim, k);
  sim.world.pager = null; sim.pg = null;
}

/** The chunk meta row (chunks.js chunkMeta): [key, active, changed, lastNear] and, asleep, [.., asleepSince, packedPlants, packedItems]. */
export function metaRow(k, c) { return c.dz ? [k, c.act, c.mod, c.last, c.dz, c.pk, c.pi] : [k, c.act, c.mod, c.last]; }

// ---- the sim's whole-state views (hash, snapshot): resident plus cold, in the order an all-resident sim would give ----

/** [[key, record]] of every evicted chunk, ascending. Throws a plain-text Error if a record is not in memory (the browser's cold store loads them before a save: ui/cold.js settle). */
export function coldRecs(sim) {
  const w = sim.world;
  if (!w.ev.size) return [];
  const out = [];
  for (const k of [...w.ev].sort((a, b) => a - b)) {
    const r = sim.pg && sim.pg.cold.peek(k);
    if (!r) throw new Error("A distant part of the map is still being read back from storage (chunk " + chunkKX(k) + "," + chunkKY(k) + "). Try again in a moment.");
    out.push([k, r]);
  }
  return out;
}
export function coldRows(sim) { return coldRecs(sim).map(([k, r]) => [k, ...r.mt]); }

/** World.deltas() plus the evicted chunks' deltas: flat [idx, mat, flags, ...] ascending by idx. */
export function worldDeltas(sim) {
  const flat = sim.world.deltas();
  if (!sim.world.ev.size) return flat;
  const rows = [];
  for (let k = 0; k < flat.length; k += 3) rows.push([flat[k], flat[k + 1], flat[k + 2]]);
  for (const [, r] of coldRecs(sim)) { const f = unpackDeltas([[r.k, r.dc]]); for (let k = 0; k < f.length; k += 3) rows.push([f[k], f[k + 1], f[k + 2]]); }
  rows.sort((a, b) => a[0] - b[0]);
  return rows.flat();
}

/** The entities {nextId, list} with the evicted chunks' place-bound ones back in, in id order (a new list; the live one is not touched). */
export function allEntities(sim) {
  const j = sim.ents.toJSON();
  if (!sim.world.ev.size) return j;
  const list = j.list.slice();
  for (const [, r] of coldRecs(sim)) for (const e of r.e) list.push(e);
  list.sort((p, q) => p.id - q.id);
  return { nextId: j.nextId, list };
}

// ---- evict ----

const okEntity = (e) => PLACED.has(e.kind) && !e.rv && !(e.kind === "furniture" && (e.lit || e.fuel > 0 || e.burn));

/** Every 200 ticks: move the changed, far, quiet chunks into the cold store. Returns how many went. */
export function evictFar(sim, anchorChunks, oreOf) {
  const pg = sim.pg, w = sim.world;
  if (!pg) return 0;
  const keys = w.chunkKeys();
  if (keys.length > pg.peak) pg.peak = keys.length;
  const anchors = [...anchorChunks].map(k => [chunkKX(k), chunkKY(k)]);
  const over = keys.length > pg.cap;
  const pin = pinnedChunks(sim);
  if (sim.zones) for (const z of sim.zones.list) for (let cy = z.y0 >> 4; cy <= z.y1 >> 4; cy++) for (let cx = z.x0 >> 4; cx <= z.x1 >> 4; cx++) pin.add(chunkKey(cx, cy));
  const cand = [];
  for (const k of keys) {
    const c = w.chunks.get(k);
    if (!c.mod || (c.act && !c.dz) || pg.keep.has(k) || pin.has(k)) continue;
    let d = 1e9;
    for (const [ax, ay] of anchors) d = Math.min(d, Math.max(Math.abs(c.cx - ax), Math.abs(c.cy - ay)));
    if (d < (over ? 5 : pg.evictCh)) continue;
    cand.push([d, k, c]);
  }
  if (!cand.length) return 0;
  cand.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const by = new Map(cand.map(([, k]) => [k, []])), bad = new Set();
  for (const e of sim.ents.list) {
    const k = chunkKey(e.x >> 4, e.y >> 4), l = by.get(k);
    if (!l) continue;
    if (okEntity(e)) l.push(e); else bad.add(k);
  }
  let room = over ? keys.length - pg.cap : Infinity;
  const pick = [];
  for (const [, k, c] of cand) { if (bad.has(k) || room <= 0) continue; pick.push([k, c]); room--; }
  if (!pick.length) return 0;
  const set = new Set(pick.map(p => p[0])), dcs = w.takeDeltas(set), ores = oreOf(sim, set);          // (the ore summary reads the cells: before they leave)
  sim.quiet = true;
  for (const [k, c] of pick) {
    const dc = dcs.has(k) ? packDeltas(dcs.get(k))[0][1] : [], e = by.get(k);
    const rec = { k, mt: metaRow(k, c).slice(1), dc, e };
    if (ores.has(k)) rec.ore = ores.get(k);
    for (const x of e) sim.ents.remove(x.id);
    w.evictChunk(c.cx, c.cy);
    pg.cold.put(k, rec);
  }
  sim.quiet = false;
  sim.cache.iv++;
  pg.evicted += pick.length;
  return pick.length;
}

/** Bring one evicted chunk back: regrown from the seed, its record laid over (restore, for one chunk). False if the record is not available yet. */
export function pageIn(sim, k) {
  const pg = sim.pg, w = sim.world;
  if (!pg || !w.ev.has(k)) return false;
  const rec = pg.cold.take(k);
  if (!rec) { pg.miss++; return false; }
  w.ev.delete(k);
  const cx = chunkKX(k), cy = chunkKY(k), [act, mod, last, dz, pk, pi] = rec.mt;
  if (act) activateChunk(w, null, sim.def, cx, cy, 0); else w.resident(cx, cy);
  const c = w.peekResident(cx, cy);
  c.act = act; c.mod = mod; c.last = last;
  if (dz) { c.dz = dz; c.pk = pk; c.pi = pi; }
  w.putCells(unpackDeltas([[k, rec.dc]]));
  sim.quiet = true;
  for (const e of rec.e) sim.ents.adopt(e);
  sim.quiet = false;
  sim.cache.iv++;
  pg.paged++;
  return true;
}

/** The chunks the UI wants in view (the camera): they are kept out of eviction, and paged in if they are away. Returns the keys still missing (to prefetch). */
export function keepNear(sim, keys) {
  const pg = sim.pg;
  if (!pg) return [];
  pg.keep = new Set(keys);
  const missing = [];
  for (const k of keys) if (sim.world.ev.has(k) && !pageIn(sim, k)) missing.push(k);
  return missing;
}

/** Evicted chunks within `r` chunks of the anchors' chunks: what a cold store should have in memory before the sim asks. */
export function wantedKeys(sim, anchorChunks, r) {
  const out = [];
  for (const k of sim.world.ev) {
    const cx = chunkKX(k), cy = chunkKY(k);
    for (const a of anchorChunks) if (Math.max(Math.abs(cx - chunkKX(a)), Math.abs(cy - chunkKY(a))) <= r) { out.push(k); break; }
  }
  return out;
}
