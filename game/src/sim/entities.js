// Entity store: villagers, plants, later items and furniture.
//
// Determinism: ids are allocated from one counter and `list` is always kept in
// id order, so "for each entity" is the same order on every machine and after
// a save/load. Never iterate `byId` (a Map) for anything that affects the sim.
//
// Entities are plain JSON-able objects: {id, kind, x, y, z, ...}. No class
// instances, no undefined values (they would vanish in a save and change the
// hash). Anything with behaviour lives in a module that switches on `kind`.
//
// A cell index (`at`) answers "what stands here?" cheaply. Positions must be
// changed through move() so the index stays right.

import { cellIdx } from "./cellkey.js";

const key = cellIdx;
// 9.32: an occupancy table in front of the cell Map. Most cells a look or a patch lookup asks about are empty; a counted hash of (x, y, z) answers that with one typed-array read (a false hit just falls through to the Map).
const OCC = 1 << 18, OMASK = OCC - 1;
const occ = (x, y, z) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & OMASK;       // S17: the old x + 1024 * (y + 1024 * z) collided for any |x| >= 1024 (the world is endless now)

/**
 * Dev guard (Phase 9.29, OD-62): while `guard.in` is above 0 (jobs.js `plan()` raises it when `guard.on`), a whole-world `ofKind` of anything but the villagers is a planner
 * reading the world instead of its beliefs. It is recorded in `guard.hits` (and thrown when `guard.throws`), except inside a scope listed in `guard.defer` (planners that
 * 9.30 / 9.31 still convert), whose reads are only counted in `guard.deferred`. Off in play: one integer test on the hot path.
 */
export const guard = { on: false, in: 0, scope: "", throws: false, hits: [], defer: new Set(), deferred: {} };
/** Planner scopes that still read the world, and why (each is a seam; README "Planners read beliefs (9.29)"). */
export const DEFERRED = {
  makeCtx: "survey(): the yard's stock by item (OD-56, relaxed; kept in 9.32: ~40 call sites read it, the stock facts hold two totals). 9.30 removed the demand, worker-tally and village() reads (local.js)",
  genFlee: "threatOf: the creature within FEAR_R of the slime itself is seen, perception not planning (kept)",
  genPens: "husbandry: pen animals and the slaughter pick read the fauna list (a pen itself is only worked by slimes that saw it or read its notice, 9.31)",
  genTinker: "discovery.js: the experiment sites (sitesOf, shared with the discovery tick) and stock; kept in 9.32 (filtering by belief shifts discovery pacing: a balance-pass change)",
  genMine: "the queued cells of a designation in sim.mine are read directly, but only inside a dig notice the slime knows of (9.31); the villager list (taken cells) is exempt",
  genExpedition: "the crew's own search is a designation (9.31)",
  wagonHaul: "9.32: a cart's grazer is found in the finished pens cell by cell (no creature scan); only the list of the village's own carts (which already have an animal) is read, a handful of entities",
  unsafeTask: "lair.js / underground.js: the air and cave hazard model reads vents (terrain, relaxed by OD-56)",
};
for (const k of Object.keys(DEFERRED)) guard.defer.add(k);
/**
 * 9.30 dev guard: turn the board's village-wide demand numbers (dem, fc, sc, fneed, sneed, uvf, uvs) into accessors that record a hit when read while a plan is running.
 * The planners read demandOf(ctx) (local.js); board.js still writes these for the HUD, which reads them outside plan(). Test-only; sets/JSON are unchanged.
 */
export function guardBoard(board) {
  for (const k of ["dem", "fc", "sc", "fneed", "sneed", "uvf", "uvs"]) {
    let val = board[k];
    Object.defineProperty(board, k, {
      enumerable: true, configurable: true,
      get() { if (guard.in > 0) { guard.hits.push(guard.scope + ":board." + k); if (guard.throws) throw new Error("planner read the village demand: board." + k + " in " + guard.scope); } return val; },
      set(x) { val = x; },
    });
  }
}
function guardHit(kind) {
  if (kind === "villager") return;
  const k = guard.scope + ":" + kind;
  if (guard.defer.has(guard.scope)) { guard.deferred[k] = (guard.deferred[k] || 0) + 1; return; }
  guard.hits.push(k);
  if (guard.throws) throw new Error("planner read the world: ofKind(" + kind + ") in " + guard.scope);
}

export class Entities {
  constructor() {
    this.nextId = 1;
    this.byId = new Map();
    this.list = [];            // id order
    this.cells = new Map();    // key -> ascending id array
    this.oc = new Uint16Array(OCC);   // occupancy counts by hashed cell (derived, never saved)
    this.kinds = new Map();    // kind -> entities of that kind, id order (derived; rebuilt on load)
    this.gv = 0;               // 9.32: grid version: bumped when anything but a villager is indexed, unindexed or moved (belief.js caches patch lookups by it; never saved)
    this.dk = null;            // 8.25: the world's dirty-chunk set (sim.js wires it): every add, remove and chunk-crossing move of a placed thing marks the chunk(s)
    this.hook = null;          // S16: (e, op) called after an add (1), before a remove (0) and after a move (2): chunks.js marks a chunk the people have changed
  }

  add(kind, props) {
    const e = { id: this.nextId++, kind, ...props };
    this.byId.set(e.id, e);
    this.list.push(e);         // ids only grow, so push keeps id order
    this._index(e);
    this._kind(e.kind).push(e);
    if (this.dk && e.kind !== "villager" && e.kind !== "fauna") this.dk.add(((e.x >> 4) + 32768) * 65536 + (e.y >> 4) + 32768);
    if (this.hook) this.hook(e, 1);
    return e;
  }

  /** 8.26: put back an entity that paging.js took out (same object, same id): list and per-kind list stay in id order. No hook (the caller holds sim.quiet). */
  adopt(e) {
    this.byId.set(e.id, e);
    insertById(this.list, e);
    this._index(e);
    insertById(this._kind(e.kind), e);
    if (this.dk && e.kind !== "villager" && e.kind !== "fauna") this.dk.add(((e.x >> 4) + 32768) * 65536 + (e.y >> 4) + 32768);
    if (this.hook) this.hook(e, 1);
  }

  get(id) { return this.byId.get(id); }

  remove(id) {
    const e = this.byId.get(id);
    if (!e) return false;
    if (this.dk && e.kind !== "villager" && e.kind !== "fauna") this.dk.add(((e.x >> 4) + 32768) * 65536 + (e.y >> 4) + 32768);
    if (this.hook) this.hook(e, 0);
    this._unindex(e);
    this.byId.delete(id);
    let lo = 0, hi = this.list.length - 1;     // binary search by id
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.list[mid].id < id) lo = mid + 1; else hi = mid; }
    this.list.splice(lo, 1);
    const ks = this._kind(e.kind);
    lo = 0; hi = ks.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ks[mid].id < id) lo = mid + 1; else hi = mid; }
    ks.splice(lo, 1);
    return true;
  }

  move(e, x, y, z) {
    if (this.byId.get(e.id) !== e) { e.x = x; e.y = y; e.z = z; return; }      // S18b: an entity that has been removed (killed earlier in the same tick, still referenced by a loop that holds it) must never be put back in the cell index: its stale id made at() hand out an id with no entity (the flora sprout / localCount crash 6.18 saw once)
    this._unindex(e);
    const cx = e.x >> 4, cy = e.y >> 4;
    e.x = x; e.y = y; e.z = z;
    this._index(e);
    if (this.dk && e.kind !== "villager" && e.kind !== "fauna") { this.dk.add(((cx) + 32768) * 65536 + cy + 32768); this.dk.add(((x >> 4) + 32768) * 65536 + (y >> 4) + 32768); }
    if (this.hook && ((x >> 4) !== cx || (y >> 4) !== cy)) this.hook(e, 2);
  }

  /** Entities standing in a cell, in id order (do not mutate the result). */
  at(x, y, z) { return this.oc[occ(x, y, z)] === 0 ? EMPTY : this.cells.get(key(x, y, z)) || EMPTY; }

  /**
   * Entities of one kind, in id order. This is the live per-kind list: do not
   * mutate it, and if the loop body may add/remove entities of that kind,
   * index into it (adds append) or defer removals until after the loop.
   */
  ofKind(kind) { if (guard.in > 0) guardHit(kind); return this._kind(kind); }
  _kind(kind) { let a = this.kinds.get(kind); if (!a) { a = []; this.kinds.set(kind, a); } return a; }

  _index(e) {
    if (e.kind !== "villager") this.gv++;
    const k = key(e.x, e.y, e.z);
    this.oc[occ(e.x, e.y, e.z)]++;
    let a = this.cells.get(k);
    if (!a) { a = []; this.cells.set(k, a); }
    let i = a.length;
    while (i > 0 && a[i - 1] > e.id) i--;      // keep ascending
    a.splice(i, 0, e.id);
  }
  _unindex(e) {
    if (e.kind !== "villager") this.gv++;
    const k = key(e.x, e.y, e.z);
    const a = this.cells.get(k);
    if (!a) return;
    this.oc[occ(e.x, e.y, e.z)]--;
    a.splice(a.indexOf(e.id), 1);
    if (!a.length) this.cells.delete(k);
  }

  toJSON() { return { nextId: this.nextId, list: this.list }; }

  /** Replace everything from a saved form (objects are adopted, not copied). */
  load(data) {
    this.nextId = data.nextId;
    this.byId.clear(); this.cells.clear(); this.oc.fill(0); this.kinds.clear(); this.list = [];
    for (const e of data.list) {
      this.byId.set(e.id, e); this.list.push(e); this._index(e); this._kind(e.kind).push(e);
    }
  }
}
const EMPTY = Object.freeze([]);
function insertById(a, e) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid].id < e.id) lo = mid + 1; else hi = mid; }
  a.splice(lo, 0, e);
}
