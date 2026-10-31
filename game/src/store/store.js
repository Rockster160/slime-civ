// The chunked store (8.25): where saves live in the browser. Async, binary, off the sim.
//
//   RECORDS   every piece of a save package (sim/save.js toPackage: the village record `g`, one record per chunk `c<key>`, the command log `x`) is its own
//             gzip blob, stored under a CONTENT-ADDRESSED key  rec/<name>.<hash>.<len>  (the mix32 hash the manifest already carries). A record that did not change
//             therefore already exists and is simply not written again: an autosave writes the changed chunks, the village record and the manifest, nothing else.
//             Records are shared by every slot (the three autosaves, the manual save), so saving by hand right after an autosave writes almost nothing.
//   MANIFEST  one small JSON per slot (man/<slot>): the package manifest plus {slot, gen, bytes, rs: {recordKey: bytes}}. It is WRITTEN LAST and is the commit:
//             until it lands the slot still names the previous generation's records, which are never overwritten (a new key per content), so an interrupted
//             save (tab closed, quota, a failed write) leaves the last good save whole. Afterwards unreferenced records are collected (gc).
//   BACKENDS  IndexedDB first (raw gzip Blobs, hundreds of MB of quota); localStorage (base64 text) when IDB is missing, blocked or does not answer (file:// in
//             some browsers, private windows). Reads look in every backend and take the newest manifest, so a save made while IDB was unavailable is not lost.
//
// A backend is {name, get(key), put(key, value), del(key), keys(prefix)}, all async; values are strings (manifests) or Uint8Array / Blob (records).
// Nothing in sim/ imports this; the sim only hands over plain package objects and exposes `world.dk` (the dirty chunk keys).
import { canGzip, gzip, decodeAny, toB64 } from "./codec.js";
import { verifyPackage } from "../sim/save.js";

export const REC = "rec/", MAN = "man/";
const enc = new TextEncoder();
const hex = (h) => (h >>> 0).toString(16);

// ---- backends ----

/** In-memory backend with failure injection, for tests. `failAt(n)`: the n-th put from now throws (1 = the next one). */
export function memoryBackend(name = "memory") {
  const m = new Map();
  let puts = 0, failAt = 0, quota = Infinity, failKey = "";
  const size = () => { let n = 0; for (const v of m.values()) n += v.length !== undefined ? v.length : v.size; return n; };
  return {
    name, m, writes: [],
    failAt(n) { puts = 0; failAt = n; }, failKey(prefix) { failKey = prefix; }, setQuota(n) { quota = n; },
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) {
      puts++;
      if (failKey && k.startsWith(failKey)) { this.failedKey = k; throw new Error("injected write failure"); }
      if (failAt && puts === failAt) { this.failedKey = k; throw new Error("injected write failure"); }
      const old = m.has(k) ? (m.get(k).length ?? m.get(k).size) : 0;
      if (size() - old + (v.length ?? v.size) > quota) throw new Error("QuotaExceededError");
      m.set(k, v); this.writes.push(k);
    },
    async del(k) { m.delete(k); },
    async keys(prefix) { return [...m.keys()].filter(k => k.startsWith(prefix)); },
  };
}

/** localStorage backend: strings only, so records are base64. `ls` is anything with getItem / setItem / removeItem / key / length. */
export function localBackend(ls, prefix = "slimeciv.s.") {
  return {
    name: "localStorage",
    async get(k) { const t = ls.getItem(prefix + k); return t === null ? null : t; },
    async put(k, v) {
      const t = typeof v === "string" ? v : toB64(v instanceof Uint8Array ? v : new Uint8Array(await v.arrayBuffer()));
      ls.setItem(prefix + k, t);
    },
    async del(k) { ls.removeItem(prefix + k); },
    async keys(p) { const out = []; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(prefix + p)) out.push(k.slice(prefix.length)); } return out; },
  };
}

/** IndexedDB backend: raw bytes as Blobs. Rejects if the database cannot be opened (or does not answer within `ms`). */
export function idbBackend(factory, ms = 3000, dbName = "slimeciv") {
  return new Promise((resolve, reject) => {
    let done = false;
    const fail = (e) => { if (!done) { done = true; reject(e instanceof Error ? e : new Error("IndexedDB unavailable")); } };
    const timer = setTimeout(() => fail(new Error("IndexedDB did not answer")), ms);
    let req;
    try { req = factory.open(dbName, 1); } catch (e) { clearTimeout(timer); return fail(e); }
    req.onupgradeneeded = () => { try { req.result.createObjectStore("r"); } catch (e) { /* exists */ } };
    req.onerror = () => { clearTimeout(timer); fail(req.error); };
    req.onblocked = () => { clearTimeout(timer); fail(new Error("IndexedDB blocked")); };
    req.onsuccess = () => {
      clearTimeout(timer);
      if (done) { req.result.close(); return; }
      done = true;
      const db = req.result;
      const run = (mode, fn) => new Promise((res, rej) => {
        let tx, out;
        try { tx = db.transaction("r", mode); out = fn(tx.objectStore("r")); } catch (e) { return rej(e); }
        tx.oncomplete = () => res(out && "result" in out ? out.result : undefined);
        tx.onerror = () => rej(tx.error || new Error("IndexedDB write failed"));
        tx.onabort = () => rej(tx.error || new Error("IndexedDB write aborted"));
      });
      resolve({
        name: "IndexedDB",
        get: (k) => run("readonly", (s) => s.get(k)).then(v => (v === undefined ? null : v)),
        put: (k, v) => run("readwrite", (s) => s.put(v, k)),
        del: (k) => run("readwrite", (s) => s.delete(k)),
        keys: (p) => run("readonly", (s) => s.getAllKeys()).then(a => a.filter(k => typeof k === "string" && k.startsWith(p))),
      });
    };
  });
}

/** Pick the backends in order: IndexedDB if it opens, localStorage always after it (the fallback, and where flat-era saves are looked for). -> [primary, ...others] */
export async function openBackends({ indexedDB, localStorage } = {}) {
  const out = [];
  if (indexedDB) { try { out.push(await idbBackend(indexedDB)); } catch (e) { /* missing or blocked: fall back */ } }
  if (localStorage) out.push(localBackend(localStorage));
  return out;
}

// ---- records ----

const nameOf = (k) => (k === "g" || k === "x" ? k : "c" + k);
/** The storage key of every record of a package: [[key, name, json]] (the village record, the command log if any, then the chunks ascending). */
export const recordOf = (name, json, hash) => ({ key: REC + name + "." + hex(hash) + "." + json.length, name, json });
export function recordsOf(pkg) {
  const m = pkg.m, out = [];
  const add = (name, rec, hash) => out.push(recordOf(name, JSON.stringify(rec), hash));
  add("g", pkg.g, m.g);
  if (pkg.cmds) add("x", pkg.cmds, m.x);
  for (const [k, h] of m.c) add(nameOf(k), pkg.c[k], h);
  return out;
}

async function pack(json) {
  const raw = enc.encode(json);
  return canGzip() ? gzip(raw) : raw;
}

const slotOk = (s) => /^[a-z]+(\.\d+)?$/.test(s);

export class Store {
  /** @param backends [primary, ...fallbacks]  @param knownSlots slot ids gc must keep manifests for (any manifest found under man/ is kept regardless) */
  constructor(backends) {
    this.bs = backends;
    this.busy = 0;                  // saves in flight (the "Saving..." chip)
    this.queue = Promise.resolve();
    this.stats = null;              // the last save: {slot, gen, wrote, reused, bytes, dirty, ms}
    this.cache = new Map();         // slot -> manifest (the Menu reads this synchronously)
  }
  get primary() { return this.bs[0]; }

  /** Every manifest in every backend, newest per slot. -> Map slot -> {man, b (backend)} */
  async scan() {
    const best = new Map();
    for (const b of this.bs) {
      let ks = []; try { ks = await b.keys(MAN); } catch (e) { continue; }
      for (const k of ks) {
        const slot = k.slice(MAN.length);
        try {
          const man = JSON.parse(await b.get(k));
          const cur = best.get(slot);
          if (man && man.m && (!cur || man.m.tick > cur.man.m.tick || (man.m.tick === cur.man.m.tick && man.gen > cur.man.gen))) best.set(slot, { man, b });
        } catch (e) { /* a manifest that cannot be read is no slot */ }
      }
    }
    this.cache = new Map([...best].map(([s, v]) => [s, v.man]));
    return best;
  }

  /** The slots on offer, newest first: [{slot, tick, day, pop, seed, iron, bytes, label}]. Run `scan` first; this reads its cache. */
  slots() {
    return [...this.cache].map(([slot, man]) => ({ slot, tick: man.m.tick, seed: man.m.seed, day: (man.m.meta || {}).day, pop: (man.m.meta || {}).pop, label: (man.m.meta || {}).label, iron: man.iron ? 1 : 0, bytes: man.bytes, at: man.at || 0 })).sort((a, b) => b.tick - a.tick);
  }

  /**
   * Save `pkg` (a package from sim/save.js) into `slot`. Serialised: one save at a time. Writes the records the store does not hold yet, then the manifest last, then
   * collects what no slot refers to. `dirty` (the sim's dirty set, cleared by the caller) is reported in the stats only: the content hashes decide what is written.
   * -> the stats, or throws a plain-text Error (the previous save of the slot is intact).
   */
  save(slot, pkg, { iron = false, dirty = 0, recs = null } = {}) {
    if (!slotOk(slot)) throw new Error("bad slot " + slot);
    this.busy++;
    const run = this.queue.then(() => this._save(slot, pkg, iron, dirty, recs));
    this.queue = run.catch(() => {});
    return run.finally(() => { this.busy--; });
  }
  async _save(slot, pkg, iron, dirty, cut) {
    const t0 = Date.now(), b = this.primary;
    if (!b) throw new Error("This browser has nowhere to keep saves.");
    const sync = { ms: 0, max: 0, n: 0 };                          // main-thread time of this save's synchronous slices (8.27: the perf budget)
    const lap = (t) => { const d = performance.now() - t; sync.ms += d; sync.n++; if (d > sync.max) sync.max = d; };
    const recs = cut || recordsOf(pkg), rs = {};
    const have = new Set(await b.keys(REC));
    let wrote = 0, bytes = 0;
    const prev = await this._manifest(slot, b);
    for (const r of recs) {
      if (have.has(r.key)) { rs[r.key] = (prev && prev.rs && prev.rs[r.key]) || await this._sizeOf(b, r.key); continue; }
      const t1 = performance.now();
      const packing = pack(r.json); lap(t1);
      const blob = await packing;
      await b.put(r.key, blob);
      rs[r.key] = blob.length; wrote++; bytes += blob.length;
    }
    const total = Object.values(rs).reduce((a, n) => a + n, 0);
    const man = { slot, gen: ((prev && prev.gen) || 0) + 1, iron: iron ? 1 : 0, bytes: total, at: t0, rs, m: pkg.m };
    if (prev && prev.rs && prev.m) man.prev = { gen: prev.gen, bytes: prev.bytes, rs: prev.rs, m: prev.m };      // 8.27: the generation before stays whole, for recovery
    const t2 = performance.now(), text = JSON.stringify(man); lap(t2);
    await b.put(MAN + slot, text);                                  // the commit
    bytes += text.length;
    this.cache.set(slot, man);
    const reused = recs.length - wrote;
    const dropped = await this.gc().catch(() => 0);
    this.stats = { slot, gen: man.gen, wrote, reused, bytes, total, dirty, dropped, backend: b.name, ms: Date.now() - t0, sync };
    return this.stats;
  }
  async _sizeOf(b, key) { const v = await b.get(key); return v ? (v.length ?? v.size ?? 0) : 0; }
  async _manifest(slot, b) { try { const t = await b.get(MAN + slot); return t ? JSON.parse(t) : null; } catch (e) { return null; } }

  /** Delete every record no manifest refers to. -> how many went. */
  async gc() {
    const b = this.primary, refs = new Set();
    for (const k of await b.keys(MAN)) { const man = await this._manifest(k.slice(MAN.length), b); if (man) { for (const r of Object.keys(man.rs || {})) refs.add(r); if (man.prev) for (const r of Object.keys(man.prev.rs || {})) refs.add(r); } else refs.add("*unreadable*"); }
    if (refs.has("*unreadable*")) return 0;                         // never collect while a manifest cannot be read
    let n = 0;
    for (const k of await b.keys(REC)) if (!refs.has(k)) { await b.del(k); n++; }
    return n;
  }

  /** Forget a slot (a full browser makes room, or the player deletes it). Its records go at the next gc. */
  async remove(slot) {
    for (const b of this.bs) { try { await b.del(MAN + slot); } catch (e) { /* nothing to remove */ } }
    this.cache.delete(slot);
    await this.gc().catch(() => 0);
  }

  /**
   * Read a slot back into a package (verified: every record against its checksum). If the newest generation is damaged (a record missing, unreadable or not matching its
   * hash) the generation before it is tried (8.27); the result says so in `recovered`. Throws a plain-text Error when neither will do.
   */
  async load(slot) {
    const hit = (await this.scan()).get(slot);
    if (!hit) throw new Error("That save is gone.");
    const { man, b } = hit;
    try { return await this._read(man, b); } catch (e) {
      if (!man.prev) throw e;
      try { const pkg = await this._read({ ...man.prev, slot }, b); pkg.recovered = { gen: man.prev.gen, lost: man.m.tick - man.prev.m.tick, why: e.message }; return pkg; } catch (e2) { throw e; }
    }
  }
  async _read(man, b) {
    const pkg = { v: man.m.v, m: man.m, g: null, c: {} };
    for (const key of Object.keys(man.rs)) {
      const v = await b.get(key);
      if (v === null) throw new Error("This save is damaged: a piece of it (" + key.slice(REC.length).split(".")[0] + ") is missing from this browser.");
      const bytes = typeof v === "string" ? v : v instanceof Uint8Array ? v : new Uint8Array(await v.arrayBuffer());
      const rec = await decodeAny(bytes);
      const name = key.slice(REC.length).split(".")[0];
      if (name === "g") pkg.g = rec; else if (name === "x") pkg.cmds = rec; else pkg.c[Number(name.slice(1))] = rec;
    }
    const bad = verifyPackage(pkg);
    if (bad) throw new Error(bad);
    return pkg;
  }
}
