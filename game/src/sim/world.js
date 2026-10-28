// The cell grid (GDD §11.3), endless in x and y (S16): signed integer columns, z 0..D-1, stored in 16 x 16 x D chunks, two
// parallel Uint8 arrays per chunk (material, flags). Land is generated on demand by terrain.js (a pure function of the seed), so a
// chunk that nobody changed can be thrown away and regrown; only RESIDENT chunks (the ones the sim activated or changed) are
// authoritative and held for good, everything else lives in a bounded LRU of regrowable chunks.
//
// What is a cell and what is an entity? Terrain and anything that is "just solid" (walls, floors, roofs) are cells. Anything that
// is a thing in the world with its own state - plants, furniture, items, animals, villagers - is an entity (GDD §11.3). Trees are
// therefore entities; they mark their air cell OBSTACLE so pathing treats it as blocked without the pathfinder knowing about
// entities. Material ids are persisted, so only ever APPEND to M.
//
// Saves: terrain is regenerated from the seed, so only cells changed since generation are stored. We log changed cell *indices*
// (a Set) and read the live values when saving; that way a cell changed twice is stored once.
import { cellIdx, cellXyz, chunkKey } from "./cellkey.js";

// One export per line: the bundler only sees the first name in `export const a, b`.
export const D = 24;
export const CHUNK_CACHE = 256;                   // regrowable (pristine) chunks the sim keeps for reading, ~13 KB each

export const M = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5,
  // S4a: built materials (append-only; ids are persisted)
  WATTLE: 6, LOGWALL: 7, STONEWALL: 8, DIRTFLOOR: 9, THATCH: 10, LOGROOF: 11,
  // S6: geology (append-only). STONE (3) is the hard rock of the deep band and of surface outcrops.
  SOFT: 12, FLINT: 13, MALACHITE: 14, CLAY: 15,
  // S9: iron country (hard rock band + deep rock below it) and the shelter ladder's wall materials (append-only)
  IRONORE: 16, COAL: 17, DEEP: 18, HIDEWALL: 19, HIDEROOF: 20, DRESSED: 21, TIMBERWALL: 22, PLANKFLOOR: 23, BRICKWALL: 24,
  // S12: a timber support post (built) and rubble (what a cave-in leaves; digs to stone) (append-only)
  SUPPORT: 25, RUBBLE: 26,
  // S14: world depth. Salt crust (highland and marsh licks), peat (the marsh surface), marsh herb (append-only)
  SALT: 27, PEAT: 28, HERB: 29 };
// ins = insulation for the warmth model (GDD §11.9: wood 0.4-0.6, dry stone and soil 0.6; thatch is a good roof).
export const MAT = [
  { name: "air",   solid: false, color: [0, 0, 0], ins: 0 },
  { name: "grass", solid: true,  color: [90, 155, 74], ins: 0.6 },
  { name: "dirt",  solid: true,  color: [138, 106, 69], ins: 0.6 },
  { name: "hard rock", solid: true, color: [112, 116, 126], ins: 0.6 },
  { name: "sand",  solid: true,  color: [216, 201, 140], ins: 0.3 },
  { name: "water", solid: false, color: [58, 111, 181], ins: 0 },   // not walkable, not stand-on-able
  { name: "wattle wall", solid: true, color: [176, 138, 84], ins: 0.4 },
  { name: "log wall",    solid: true, color: [112, 76, 44], ins: 0.5 },
  { name: "dry-stone wall", solid: true, color: [160, 162, 170], ins: 0.6 },
  { name: "packed-dirt floor", solid: true, color: [150, 118, 80], ins: 0 },
  { name: "thatch roof", solid: true, color: [201, 178, 96], ins: 0.5 },
  { name: "log roof",    solid: true, color: [128, 90, 56], ins: 0.5 },
  { name: "soft rock",   solid: true, color: [176, 160, 130], ins: 0.6 },    // sandstone / limestone class (GDD §11.5): digs with stone tools
  { name: "flint nodule", solid: true, color: [40, 46, 62], ins: 0.6 },       // dark nodules in the soft rock
  { name: "malachite",   solid: true, color: [40, 190, 120], ins: 0.6 },      // green copper stain (§11.5)
  { name: "clay",        solid: true, color: [196, 112, 78], ins: 0.5 },      // stream-bank clay
  // S9. Insulation climbs the shelter ladder (K10): wattle .4 < hide .5 < log/timber .5-.6 < dressed stone .7 < brick .8 (rooms.js reads it).
  { name: "iron ore",    solid: true, color: [150, 78, 56], ins: 0.6 },        // rust-red veins in the hard rock band
  { name: "coal seam",   solid: true, color: [34, 34, 40], ins: 0.6 },         // black seams beside the iron
  { name: "deep rock",   solid: true, color: [78, 80, 94], ins: 0.6 },         // the bottom of the hard rock: only iron tools dig it
  { name: "hide wall",   solid: true, color: [196, 160, 120], ins: 0.5 },      // hide stretched on poles (the teepee)
  { name: "hide roof",   solid: true, color: [184, 144, 104], ins: 0.5 },
  { name: "dressed-stone wall", solid: true, color: [186, 188, 198], ins: 0.7 },
  { name: "timber wall", solid: true, color: [150, 100, 58], ins: 0.6 },       // a framed cabin wall
  { name: "plank floor", solid: true, color: [170, 124, 76], ins: 0.1 },
  { name: "brick wall",  solid: true, color: [182, 84, 60], ins: 0.8 },
  { name: "timber support", solid: true, color: [140, 96, 52], ins: 0.3 },     // S12: a post and cap that holds a roof up
  { name: "rubble",      solid: true, color: [124, 112, 98], ins: 0.4 },        // S12: a fallen roof
  { name: "salt crust",  solid: true, color: [232, 232, 226], ins: 0.5 },        // S14: a salt lick or deposit (highland and marsh)
  { name: "peat",        solid: true, color: [92, 66, 46], ins: 0.5 },           // S14: dark wet marsh turf that dries into fuel
  { name: "marsh herb",  solid: true, color: [112, 150, 62], ins: 0.5 },         // S14: a bed of bitter marsh herb
];
const SOLID = new Uint8Array(256);
MAT.forEach((m, i) => { SOLID[i] = m.solid ? 1 : 0; });

/** Per-cell flag bits. */
export const F = {
  PLAYER: 1,     // placed by the player: the anti-grind rule (§14) must not pay out for these
  OBSTACLE: 2,   // an entity (tree) blocks this air cell for walking
  USED: 4,       // the "virgin" bit, inverted (§10 R17): something was ever placed or built here. Never cleared, so
                 // build/take down/rebuild and place/re-dig loops pay no XP even after PLAYER is cleared
  RIDGE: 8,      // S6: the windy ridge cell suited to a draft furnace (heat.js reads it)
  NATURAL: 16,   // S16: air of a natural cave (its own rock vault holds; cave-in and bad air treat it as the cave)
  GAS: 32,       // S16: rock that releases gas when dug into (a bad-air pocket)
  NOGROW: 64,    // S16: nothing grows here (the cave mouth, a ridge cell, a stain): terrain.js sets it, flora skips it
};

/** Reads cells through a chunk source. World reads its resident chunks then its regrowable cache; the renderer's view reads the same resident chunks then ITS OWN bounded cache, so drawing never touches the sim. */
export class CellReader {
  _get(cx, cy) { throw new Error("abstract"); }

  /** Material at a cell; above or below the world reads as air. */
  mat(x, y, z) {
    if (z < 0 || z >= D) return M.AIR;
    return this._get(x >> 4, y >> 4).mats[(z << 8) | ((y & 15) << 4) | (x & 15)];
  }
  flags(x, y, z) {
    if (z < 0 || z >= D) return 0;
    return this._get(x >> 4, y >> 4).flgs[(z << 8) | ((y & 15) << 4) | (x & 15)];
  }
  isSolid(x, y, z) { return SOLID[this.mat(x, y, z)] === 1; }

  /**
   * A villager stands in an air cell with solid ground below, not blocked by an
   * entity. (Water is neither solid nor air: you cannot stand in or on it.)
   */
  isWalkable(x, y, z) {
    if (z < 1 || z >= D) return false;
    const c = this._get(x >> 4, y >> 4), l = (z << 8) | ((y & 15) << 4) | (x & 15);
    if (c.mats[l] !== M.AIR) return false;
    if (c.flgs[l] & F.OBSTACLE) return false;
    return SOLID[c.mats[l - 256]] === 1;
  }

  /** Highest walkable z in a column, or -1. */
  standZ(x, y) {
    for (let z = D - 1; z >= 1; z--) if (this.isWalkable(x, y, z)) return z;
    return -1;
  }

  /** z of the topmost non-air cell at or below zMax, or -1. */
  topZ(x, y, zMax) {
    const c = this._get(x >> 4, y >> 4), b = ((y & 15) << 4) | (x & 15);
    for (let z = Math.min(zMax, D - 1); z >= 0; z--) if (c.mats[(z << 8) | b] !== M.AIR) return z;
    return -1;
  }

  /** Surface height at generation (the topmost solid cell before anything was built or dug) and the biome of a column. */
  hsAt(x, y) { return this._get(x >> 4, y >> 4).hs[((y & 15) << 4) | (x & 15)]; }
  biomeAt(x, y) { return this._get(x >> 4, y >> 4).bm[((y & 15) << 4) | (x & 15)]; }
}

export class World extends CellReader {
  /** @param gen (cx, cy) -> {cx, cy, mats, flgs, hs, bm}: the pure generator (terrain.js), bound to a seed and a spawn */
  constructor(gen, def = null) {
    super();
    this.gen = gen;
    this.def = def;                 // the generator's definition (seed, options, spawn, stamps): see terrain.js
    this.site = def && def.spawn ? def.spawn : { x: 0, y: 0, z: 13, r: 8 };
    this.geo = def && def.geo ? def.geo : {};      // facts about the spawn region (caves[0] is the thornback's, ridge, ...): a pure function of the seed
    this.chunks = new Map();        // chunkKey -> chunk: RESIDENT (activated or changed): authoritative, never evicted by the cache
    this.gc = new Map();            // chunkKey -> chunk: regrowable, LRU by insertion order, bounded by CHUNK_CACHE
    this.resVer = 0;                // bumps when the resident set changes
    this._cx = 1e9; this._cy = 1e9; this._c = null;
    this.version = 0;      // bumps on every change; path cache keys on it
    this.log = null;       // Set of changed cell indices once logging starts
    this.dirty = [];       // cell indices whose material changed since rooms.js last looked (derived, not saved)
    this.ugd = [];         // S12: the same, for underground.js (which cells to re-check for unstable roofs); derived, not saved
    this.genCount = 0;     // chunks generated so far (tests: the cache must not grow without bound)
  }

  static idx(x, y, z) { return cellIdx(x, y, z); }
  static xyz(i) { return cellXyz(i); }
  /** Only the vertical range is bounded now. */
  static inBounds(x, y, z) { return z >= 0 && z < D; }

  _get(cx, cy) {
    if (cx === this._cx && cy === this._cy) return this._c;
    const k = chunkKey(cx, cy);
    let c = this.chunks.get(k);
    if (!c) {
      c = this.gc.get(k);
      if (c) { this.gc.delete(k); this.gc.set(k, c); }
      else {
        c = this.gen(cx, cy); c.mod = 0; c.act = 0; c.last = 0; this.genCount++;
        this.gc.set(k, c);
        if (this.gc.size > CHUNK_CACHE) this.gc.delete(this.gc.keys().next().value);
      }
    }
    this._cx = cx; this._cy = cy; this._c = c;
    return c;
  }
  /** The resident chunk (made resident now if it is not): the only way to write. */
  _res(cx, cy) {
    const k = chunkKey(cx, cy);
    let c = this.chunks.get(k);
    if (c) return c;
    c = this.gc.get(k);
    if (c) this.gc.delete(k);
    else { c = this.gen(cx, cy); c.mod = 0; c.act = 0; c.last = 0; this.genCount++; }
    this.chunks.set(k, c);
    this.resVer++;
    this._cx = 1e9; this._c = null;
    return c;
  }
  /** Make a chunk resident without changing it (activation). */
  resident(cx, cy) { return this._res(cx, cy); }
  peekResident(cx, cy) { return this.chunks.get(chunkKey(cx, cy)) || null; }
  /** Throw a resident chunk away (only ever a pristine one: sim.js decides). It regrows identically on the next read. */
  drop(cx, cy) {
    if (this.chunks.delete(chunkKey(cx, cy))) { this.resVer++; this._cx = 1e9; this._c = null; this.version++; }
  }
  /** Resident chunk keys, ascending. */
  chunkKeys() { return [...this.chunks.keys()].sort((a, b) => a - b); }
  /** Is the column in an activated chunk? */
  activeAt(x, y) { const c = this.chunks.get(chunkKey(x >> 4, y >> 4)); return !!c && c.act === 1; }

  /** Write a cell. `flags` undefined keeps the existing flags. */
  set(x, y, z, mat, flags) {
    if (z < 0 || z >= D) return;
    const c = this._res(x >> 4, y >> 4), l = (z << 8) | ((y & 15) << 4) | (x & 15);
    c.mats[l] = mat;
    if (flags !== undefined) c.flgs[l] = flags;
    this.version++;
    if (this.log) { const i = cellIdx(x, y, z); this.log.add(i); this.dirty.push(i); this.ugd.push(i); c.mod = 1; }
  }
  /** Tell rooms.js a cell's surroundings changed without a material change (a door entity appeared). */
  markDirty(x, y, z) { this.dirty.push(cellIdx(x, y, z)); }
  setFlags(x, y, z, flags) {
    if (z < 0 || z >= D) return;
    const c = this._res(x >> 4, y >> 4);
    c.flgs[(z << 8) | ((y & 15) << 4) | (x & 15)] = flags;
    this.version++;
    if (this.log) { this.log.add(cellIdx(x, y, z)); c.mod = 1; }
  }
  /** Flags written by generation (a tree's OBSTACLE at activation): not a player-visible change, so not in the delta log and the chunk stays pristine. */
  setFlagsQuiet(x, y, z, flags) {
    const c = this._res(x >> 4, y >> 4);
    c.flgs[(z << 8) | ((y & 15) << 4) | (x & 15)] = flags;
    this.version++;
  }

  // ---- delta log (saves) ----

  /** Call once generation is finished: from here on every change is recorded. */
  beginLog() { this.log = new Set(); }

  /** Flat [idx, mat, flags, idx, mat, flags...] sorted by idx. */
  deltas() {
    const out = [];
    if (!this.log) return out;
    for (const i of [...this.log].sort((a, b) => a - b)) {
      const [x, y, z] = cellXyz(i);
      out.push(i, this.mat(x, y, z), this.flags(x, y, z));
    }
    return out;
  }
  applyDeltas(flat) {
    for (let k = 0; k < flat.length; k += 3) {
      const [x, y, z] = cellXyz(flat[k]);
      this.set(x, y, z, flat[k + 1], flat[k + 2]);
    }
  }

  /** Hash of every resident cell, in chunk order; for tests and debugging. */
  fullHash(hasher) {
    for (const k of this.chunkKeys()) { const c = this.chunks.get(k); hasher.u32(k); hasher.bytes(c.mats); hasher.bytes(c.flgs); }
  }
}
