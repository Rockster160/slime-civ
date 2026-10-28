// Dormant chunks (S17, R22 aggregate LOD): land that people changed but have left far behind stops being simulated and is caught up, in closed
// form, when somebody comes back.
//
//   SLEEP  A changed (mod) active chunk that is farther than DEACT_CH chunks from every anchor goes dormant (chunks.js decides, every 100 ticks):
//          c.dz = the tick it fell asleep (0 = awake). Its plants are PACKED into c.pk (arrays: far smaller than entities, and not ticked or iterated by
//          anything); its wild creatures are removed (they are re-rolled when it wakes). Everything else in it (loose items, hearths, flames, furniture,
//          a tame animal) stays as an entity but is frozen: fireTick, spoilDaily and faunaTick skip dormant ground (World.dormantAt / activeAt).
//          A chunk holding a field, a pen, the cellar, the stockpile or a reserved/unpackable plant never sleeps.
//   WAKE   Somebody is within ACT_CH chunks again. With elapsed = tick - dz:
//            plants   unpacked in their old order (new ids), growth days added season by season, berries refilled (the first frost strips them),
//                     tufts and tubers regrown, stumps sprouted or rotted, saplings grown, the old withered, a burning tree burnt down;
//            fires    flames removed, hearths out (fuel 0);
//            loose food rots by the elapsed days at the open rate (winter days at the winter rate);
//            herds    re-rolled to their equilibrium from a chunk-keyed stream (chunks.js spawnWild, salted by the day).
//          Deterministic: same seed and commands -> same hashes. Nothing here has to equal what a never-dormant chunk would have become.
import { DAY } from "./clock.js";
import { F } from "./world.js";
import { chunkKey } from "./cellkey.js";
import { seasonIdx, berrySeason, dayF, WINTER_START } from "./season.js";
import { GROW_BY_SEASON, BERRY_REGROW, TUBER_YIELD, TREE_REGROW, STUMP_ROT, STUMP_REGROW, SPROUT_PCT, berryCap, stageOf, lifeOf, ageOf, initLife, burnDown } from "./plants.js";
import { ITEMS, inStore } from "./items.js";
import { mix32 } from "./rng.js";

export const SPECIES = ["tree", "sapling", "berry", "tuft", "tuber", "stump"];
const KNOWN = new Set(["id", "kind", "species", "x", "y", "z", "yield", "nx", "rv", "rt", "bt", "gr", "fl", "burn"]);

const packable = (p) => !p.rv && SPECIES.includes(p.species) && Object.keys(p).every(k => KNOWN.has(k));
const nul = (v) => (v === undefined ? null : v);
/** A plant as an array [species, chunk-local column, z, yield, nx, rt, bt, gr, fl, burn], trailing absent fields cut (lossless: null = the field is absent). */
export function packPlant(p) {
  const a = [SPECIES.indexOf(p.species), (p.x & 15) | ((p.y & 15) << 4), p.z, p.yield, p.nx, p.rt, nul(p.bt), nul(p.gr), nul(p.fl), nul(p.burn)];
  while (a.length > 6 && a[a.length - 1] === null) a.pop();
  return a;
}
/** The plant entity (without an id) from packPlant's array, in the chunk (cx, cy). */
export function plantProps(cx, cy, a) {
  const o = { species: SPECIES[a[0]], x: (cx << 4) + (a[1] & 15), y: (cy << 4) + (a[1] >> 4), z: a[2], yield: a[3], nx: a[4], rv: 0, rt: a[5] };
  if (a[6] !== null && a[6] !== undefined) o.bt = a[6];
  if (a[7] !== null && a[7] !== undefined) o.gr = a[7];
  if (a[8] !== null && a[8] !== undefined) o.fl = a[8];
  if (a[9] !== null && a[9] !== undefined) o.burn = a[9];
  return o;
}
export const isPackable = packable;

/** Chunk keys that must stay awake: the ones holding the village's zones. */
export function pinnedChunks(sim) {
  const out = new Set(), add = (z) => {
    if (!z) return;
    for (let cy = z.y0 >> 4; cy <= z.y1 >> 4; cy++) for (let cx = z.x0 >> 4; cx <= z.x1 >> 4; cx++) out.add(chunkKey(cx, cy));
  };
  add(sim.stock);
  if (sim.farm) { add(sim.farm.cellar); for (const f of sim.farm.fields) add(f); for (const p of sim.farm.pens) add(p); }
  return out;
}

/** Put the chunks in `cs` (resident, active, changed, awake) to sleep. Returns how many fell asleep. One pass over the plants and creatures for all of them. */
export function sleepChunks(sim, cs) {
  if (!cs.length) return 0;
  const pin = pinnedChunks(sim), by = new Map(), ok = new Map();
  for (const c of cs) { const k = chunkKey(c.cx, c.cy); if (!pin.has(k)) { by.set(k, []); ok.set(k, true); } }
  if (!by.size) return 0;
  const plants = sim.ents.ofKind("plant");
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i], k = chunkKey(p.x >> 4, p.y >> 4), l = by.get(k);
    if (!l) continue;
    if (!packable(p)) ok.set(k, false); else l.push(p);
  }
  const wild = new Map();
  for (const e of sim.ents.ofKind("fauna")) {
    const k = chunkKey(e.x >> 4, e.y >> 4);
    if (!by.has(k)) continue;
    if (e.wi && !e.tame && e.st !== "held" && !e.rv && e.sp !== "thornback") { if (!wild.has(k)) wild.set(k, []); wild.get(k).push(e.id); }
  }
  let n = 0;
  sim.quiet = true;
  for (const c of cs) {
    const k = chunkKey(c.cx, c.cy);
    if (!ok.get(k)) continue;
    c.pk = by.get(k).map(packPlant);
    for (const p of by.get(k)) sim.ents.remove(p.id);
    for (const id of wild.get(k) || []) sim.ents.remove(id);
    c.dz = sim.tick;
    n++;
  }
  sim.quiet = false;
  if (n) sim.cache.iv++;
  return n;
}

/** Growth, berry time and the first frost over [t0, t1), day by day: one small loop per chunk, shared by its plants. */
function span(t0, t1) {
  const r = { g: 0, frost: false, bd: 0, winterDays: 0, days: 0 };
  for (let t = t0; t < t1; t += DAY) {
    r.days++;
    r.g += GROW_BY_SEASON[seasonIdx(t)];
    if (seasonIdx(t) === 3) r.winterDays++;
    if (Math.floor(dayF(t)) === WINTER_START) { r.frost = true; r.bd = 0; }
    if (berrySeason(t)) r.bd += DAY;
  }
  return r;
}

function unpack(sim, c, a, sp, wake) {
  const t = sim.tick, w = sim.world;
  const p = sim.ents.add("plant", plantProps(c.cx, c.cy, a));
  if (p.bt === undefined && wake) initLife(sim, p);
  if (p.burn) { burnDown(sim, p); return p; }                                  // the tree burnt down while nobody was about
  if (p.species === "stump") {
    if (!p.burn && t >= p.nx) {
      if (p.fl && mix32(p.id, p.nx) % 100 >= SPROUT_PCT) { if (t >= p.nx + STUMP_ROT - STUMP_REGROW) { sim.ents.remove(p.id); return null; } return p; }
      p.species = "sapling"; p.fl = 0; p.bt = p.nx; p.gr = 0; p.nx = p.nx + TREE_REGROW / 2;
    } else return p;
  }
  if (p.species === "sapling") {
    p.gr = (p.gr || 0) + sp.g;
    if (t >= p.nx) {
      if (sim.ents.at(p.x, p.y, p.z).length === 1) { p.species = "tree"; p.yield = 4; w.setFlags(p.x, p.y, p.z, w.flags(p.x, p.y, p.z) | F.OBSTACLE); }
      else p.nx = t + DAY;
    }
    return p;
  }
  p.gr = (p.gr || 0) + sp.g;
  const life = lifeOf(p);
  if (life && ageOf(sim, p) > life) {                                          // withered while nobody was looking
    if (p.species === "tree") w.setFlags(p.x, p.y, p.z, w.flags(p.x, p.y, p.z) & ~F.OBSTACLE);
    sim.ents.remove(p.id);
    return null;
  }
  if (p.species === "berry") {
    const cap = berryCap(stageOf(sim, p)), base = sp.frost ? 0 : p.yield;
    p.yield = Math.min(cap, base + Math.floor(sp.bd / BERRY_REGROW));
    p.nx = t;
  } else if (p.species === "tuft") { if (p.yield === 0 && t >= p.nx) p.yield = 1; }
  else if (p.species === "tuber") { if (p.yield < TUBER_YIELD && t >= p.nx) { p.yield = TUBER_YIELD; p.nx = t; } }
  return p;
}

/** Wake a dormant chunk and catch it up. `spawnWild(sim, c, salt)` re-rolls the herds (chunks.js). */
export function wakeChunks(sim, cs, spawnWild) {
  if (!cs.length) return;
  const t = sim.tick, keys = new Set(cs.map(c => chunkKey(c.cx, c.cy))), inC = (e) => keys.has(chunkKey(e.x >> 4, e.y >> 4));
  sim.quiet = true;
  // fires go out
  for (const f of sim.ents.ofKind("flame").slice()) if (inC(f)) sim.ents.remove(f.id);
  for (const h of sim.ents.ofKind("furniture")) if (h.f === "hearth" && inC(h) && h.lit) { h.fuel = 0; h.lit = 0; h.hl = 0; }
  // loose food and hides rot by the elapsed days
  const sps = new Map();
  for (const c of cs) sps.set(chunkKey(c.cx, c.cy), span(c.dz, t));
  const dead = [], sp = sim.farm.sp;
  for (const s of sim.ents.ofKind("item")) {
    if (!inC(s)) continue;
    const d = ITEMS[s.item];
    if (!d || d.spoil === 0 || inStore(sim, s.x, s.y, s.z)) continue;
    const r = sps.get(chunkKey(s.x >> 4, s.y >> 4));
    const lose = Math.floor(s.sp + s.n * (d.spoil * (r.days - r.winterDays) + d.spoilW * r.winterDays));
    if (lose <= 0) { s.sp += s.n * (d.spoil * (r.days - r.winterDays) + d.spoilW * r.winterDays); continue; }
    s.sp = 0;
    const n = Math.min(lose, s.n);
    s.n -= n; sp.t[s.item] = (sp.t[s.item] || 0) + n;
    if (s.n <= 0) dead.push(s.id);
  }
  for (const id of dead) sim.ents.remove(id);
  // plants, then herds
  for (const c of cs) {
    const r = sps.get(chunkKey(c.cx, c.cy));
    for (const a of c.pk || []) unpack(sim, c, a, r, true);
    c.pk = null; c.dz = 0; c.last = t;
  }
  for (const c of cs) spawnWild(sim, c, 1 + Math.floor(t / DAY));
  sim.quiet = false;
  sim.cache.iv++;
}
