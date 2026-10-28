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

const key = (x, y, z) => x + 1024 * (y + 1024 * z);

export class Entities {
  constructor() {
    this.nextId = 1;
    this.byId = new Map();
    this.list = [];            // id order
    this.cells = new Map();    // key -> ascending id array
    this.kinds = new Map();    // kind -> entities of that kind, id order (derived; rebuilt on load)
  }

  add(kind, props) {
    const e = { id: this.nextId++, kind, ...props };
    this.byId.set(e.id, e);
    this.list.push(e);         // ids only grow, so push keeps id order
    this._index(e);
    this._kind(e.kind).push(e);
    return e;
  }

  get(id) { return this.byId.get(id); }

  remove(id) {
    const e = this.byId.get(id);
    if (!e) return false;
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
    this._unindex(e);
    e.x = x; e.y = y; e.z = z;
    this._index(e);
  }

  /** Entities standing in a cell, in id order (do not mutate the result). */
  at(x, y, z) { return this.cells.get(key(x, y, z)) || EMPTY; }

  /**
   * Entities of one kind, in id order. This is the live per-kind list: do not
   * mutate it, and if the loop body may add/remove entities of that kind,
   * index into it (adds append) or defer removals until after the loop.
   */
  ofKind(kind) { return this._kind(kind); }
  _kind(kind) { let a = this.kinds.get(kind); if (!a) { a = []; this.kinds.set(kind, a); } return a; }

  _index(e) {
    const k = key(e.x, e.y, e.z);
    let a = this.cells.get(k);
    if (!a) { a = []; this.cells.set(k, a); }
    let i = a.length;
    while (i > 0 && a[i - 1] > e.id) i--;      // keep ascending
    a.splice(i, 0, e.id);
  }
  _unindex(e) {
    const k = key(e.x, e.y, e.z);
    const a = this.cells.get(k);
    if (!a) return;
    a.splice(a.indexOf(e.id), 1);
    if (!a.length) this.cells.delete(k);
  }

  toJSON() { return { nextId: this.nextId, list: this.list }; }

  /** Replace everything from a saved form (objects are adopted, not copied). */
  load(data) {
    this.nextId = data.nextId;
    this.byId.clear(); this.cells.clear(); this.kinds.clear(); this.list = [];
    for (const e of data.list) {
      this.byId.set(e.id, e); this.list.push(e); this._index(e); this._kind(e.kind).push(e);
    }
  }
}
const EMPTY = Object.freeze([]);
