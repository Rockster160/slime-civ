// The cell grid (GDD §11.3): 128x128x24 integer cells in 16^3 chunks, two
// parallel Uint8 arrays per chunk (material, flags).
//
// What is a cell and what is an entity? Terrain and anything that is "just
// solid" (walls, floors, roofs, later planks / wood blocks) are cells.
// Anything that is a thing in the world with its own state - plants, furniture,
// items, animals, villagers - is an entity (GDD §11.3). Trees are therefore
// entities; they mark their air cell OBSTACLE so pathing treats it as blocked
// without the pathfinder knowing about entities. Wood/plank/leaf-bed arrive in
// S2/S4 as either: planks as a cell material (add to M), a leaf bed as a
// furniture entity. Material ids are persisted, so only ever APPEND to M.
//
// Saves: terrain is regenerated from the seed, so only cells changed since
// generation are stored. We log changed cell *indices* (a Set) and read the
// live values when saving; that way a cell changed twice is stored once.

// One export per line: the bundler only sees the first name in `export const a, b`.
export const W = 128;
export const H = 128;
export const D = 24;
const CX = W >> 4, CY = H >> 4;                   // 8 x 8 chunks per layer
const CZN = Math.ceil(D / 16);                     // 2 layers; the top one is half empty

export const M = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5,
  // S4a: built materials (append-only; ids are persisted)
  WATTLE: 6, LOGWALL: 7, STONEWALL: 8, DIRTFLOOR: 9, THATCH: 10, LOGROOF: 11 };
// ins = insulation for the warmth model (GDD §11.9: wood 0.4-0.6, dry stone and soil 0.6; thatch is a good roof).
export const MAT = [
  { name: "air",   solid: false, color: [0, 0, 0], ins: 0 },
  { name: "grass", solid: true,  color: [90, 155, 74], ins: 0.6 },
  { name: "dirt",  solid: true,  color: [138, 106, 69], ins: 0.6 },
  { name: "stone", solid: true,  color: [125, 128, 136], ins: 0.6 },
  { name: "sand",  solid: true,  color: [216, 201, 140], ins: 0.3 },
  { name: "water", solid: false, color: [58, 111, 181], ins: 0 },   // not walkable, not stand-on-able
  { name: "wattle wall", solid: true, color: [176, 138, 84], ins: 0.4 },
  { name: "log wall",    solid: true, color: [112, 76, 44], ins: 0.5 },
  { name: "dry-stone wall", solid: true, color: [160, 162, 170], ins: 0.6 },
  { name: "packed-dirt floor", solid: true, color: [150, 118, 80], ins: 0 },
  { name: "thatch roof", solid: true, color: [201, 178, 96], ins: 0.5 },
  { name: "log roof",    solid: true, color: [128, 90, 56], ins: 0.5 },
];
const SOLID = new Uint8Array(256);
MAT.forEach((m, i) => { SOLID[i] = m.solid ? 1 : 0; });

/** Per-cell flag bits. */
export const F = {
  PLAYER: 1,     // placed by the player: the anti-grind rule (§14) must not pay out for these
  OBSTACLE: 2,   // an entity (tree) blocks this air cell for walking
};

export class World {
  constructor() {
    this.mats = [];
    this.flgs = [];
    for (let i = 0; i < CX * CY * CZN; i++) {
      this.mats.push(new Uint8Array(4096));
      this.flgs.push(new Uint8Array(4096));
    }
    this.version = 0;      // bumps on every change; path cache keys on it
    this.log = null;       // Set of changed cell indices once logging starts
    this.dirty = [];       // cell indices whose material changed since rooms.js last looked (derived, not saved)
  }

  static idx(x, y, z) { return (z * H + y) * W + x; }
  static xyz(i) { return [i % W, Math.floor(i / W) % H, Math.floor(i / (W * H))]; }
  static inBounds(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D; }

  _c(x, y, z) { return ((z >> 4) * CY + (y >> 4)) * CX + (x >> 4); }
  _l(x, y, z) { return ((z & 15) << 8) | ((y & 15) << 4) | (x & 15); }

  /** Material at a cell; out of bounds reads as air. */
  mat(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) return M.AIR;
    return this.mats[this._c(x, y, z)][this._l(x, y, z)];
  }
  flags(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) return 0;
    return this.flgs[this._c(x, y, z)][this._l(x, y, z)];
  }

  /** Write a cell. `flags` undefined keeps the existing flags. */
  set(x, y, z, mat, flags) {
    const c = this._c(x, y, z), l = this._l(x, y, z);
    this.mats[c][l] = mat;
    if (flags !== undefined) this.flgs[c][l] = flags;
    this._changed(x, y, z);
    if (this.log) this.dirty.push(World.idx(x, y, z));
  }
  /** Tell rooms.js a cell's surroundings changed without a material change (a door entity appeared). */
  markDirty(x, y, z) { this.dirty.push(World.idx(x, y, z)); }
  setFlags(x, y, z, flags) {
    this.flgs[this._c(x, y, z)][this._l(x, y, z)] = flags;
    this._changed(x, y, z);
  }
  _changed(x, y, z) {
    this.version++;
    if (this.log) this.log.add(World.idx(x, y, z));
  }

  isSolid(x, y, z) { return SOLID[this.mat(x, y, z)] === 1; }

  /**
   * A villager stands in an air cell with solid ground below, not blocked by an
   * entity. (Water is neither solid nor air: you cannot stand in or on it.)
   */
  isWalkable(x, y, z) {
    if (x < 0 || y < 0 || z < 1 || x >= W || y >= H || z >= D) return false;
    const mats = this.mats[this._c(x, y, z)], l = this._l(x, y, z);
    if (mats[l] !== M.AIR) return false;
    if (this.flgs[this._c(x, y, z)][l] & F.OBSTACLE) return false;
    return SOLID[this.mat(x, y, z - 1)] === 1;
  }

  /** Highest walkable z in a column, or -1. */
  standZ(x, y) {
    for (let z = D - 1; z >= 1; z--) if (this.isWalkable(x, y, z)) return z;
    return -1;
  }

  /** z of the topmost non-air cell at or below zMax, or -1. */
  topZ(x, y, zMax) {
    for (let z = Math.min(zMax, D - 1); z >= 0; z--) if (this.mat(x, y, z) !== M.AIR) return z;
    return -1;
  }

  // ---- delta log (saves) ----

  /** Call once generation is finished: from here on every change is recorded. */
  beginLog() { this.log = new Set(); }

  /** Flat [idx, mat, flags, idx, mat, flags...] sorted by idx. */
  deltas() {
    const out = [];
    if (!this.log) return out;
    for (const i of [...this.log].sort((a, b) => a - b)) {
      const [x, y, z] = World.xyz(i);
      out.push(i, this.mat(x, y, z), this.flags(x, y, z));
    }
    return out;
  }
  applyDeltas(flat) {
    for (let k = 0; k < flat.length; k += 3) {
      const [x, y, z] = World.xyz(flat[k]);
      this.set(x, y, z, flat[k + 1], flat[k + 2]);
    }
  }

  /** Hash of every cell; slow (about 400k cells), for tests and debugging. */
  fullHash(hasher) {
    for (const a of this.mats) hasher.bytes(a);
    for (const a of this.flgs) hasher.bytes(a);
  }
}
