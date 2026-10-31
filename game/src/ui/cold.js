// The browser's cold store for paged-out chunks (8.26): the object sim/paging.js talks to (put / take / peek), backed by memory plus the async store.
//
//   put(key, record)   the sim evicted a chunk: the record is held in memory, and once more than `memMax` are held the oldest are written (gzip) to the store's primary
//                      backend under  cold/<run>/<key>  and dropped from memory. Only IndexedDB is used for that (localStorage is small; with it records simply stay in memory).
//   take(key)          the sim wants the chunk back: the record if it is in memory; otherwise null, and its read from the store starts. The sim asks again every 20 ticks.
//   peek(key)          the record if it is in memory (saving needs every record: `settle()` reads the spilled ones back first).
//   prefetch(keys)     start reading spilled records that are about to be needed (near the anchors and the camera: ui/paging.js).
// Cold keys are scratch, not saves: they are deleted when the game ends or the page starts again (`sweep`). A save never refers to them.
import { gzip, decodeAny, canGzip } from "../store/codec.js";

const enc = new TextEncoder();
const PREFIX = "cold/";

/** Delete every cold scratch key a previous page left behind. */
export async function sweep(backend) {
  if (!backend) return 0;
  let n = 0;
  try { for (const k of await backend.keys(PREFIX)) { await backend.del(k); n++; } } catch (e) { /* nothing to sweep */ }
  return n;
}

export function createCold(getBackend, { memMax = 48 } = {}) {
  const run = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const mem = new Map(), spilled = new Set(), loading = new Map();
  let writing = false, dead = false;
  const name = (k) => PREFIX + run + "/" + k;
  const disk = () => { const b = getBackend(); return b && b.name === "IndexedDB" && canGzip() ? b : null; };

  async function spill() {
    const b = disk();
    if (writing || !b || mem.size <= memMax) return;
    writing = true;
    try {
      for (let pass = 0; pass < 8 && mem.size > memMax && !dead; pass++) {      // (records put while writing are picked up by the next pass)
        for (const k of [...mem.keys()].slice(0, mem.size - memMax)) {
          const rec = mem.get(k);
          if (!rec || dead) continue;
          await b.put(name(k), await gzip(enc.encode(JSON.stringify(rec))));
          if (mem.get(k) === rec) { mem.delete(k); spilled.add(k); }              // (taken meanwhile: the copy on disk is garbage, removed)
          else { b.del(name(k)).catch(() => {}); }
        }
      }
    } catch (e) { /* the store would not take it: the records stay in memory */ }
    writing = false;
  }
  function load(k) {
    if (loading.has(k)) return loading.get(k);
    const b = disk();
    if (!b) return Promise.resolve();
    const p = (async () => {
      try {
        const v = await b.get(name(k));
        if (v === null) throw new Error("gone");
        const bytes = v instanceof Uint8Array ? v : new Uint8Array(await v.arrayBuffer());
        if (!dead) { mem.set(k, await decodeAny(bytes)); spilled.delete(k); b.del(name(k)).catch(() => {}); }
      } catch (e) { /* stays spilled: the sim asks again */ }
      loading.delete(k);
    })();
    loading.set(k, p);
    return p;
  }
  return {
    mem, spilled,
    put(k, rec) { mem.set(k, rec); spilled.delete(k); if (mem.size > memMax) spill(); },
    take(k) {
      const r = mem.get(k);
      if (r) { mem.delete(k); return r; }
      if (spilled.has(k)) load(k);
      return null;
    },
    peek(k) { return mem.get(k) || null; },
    prefetch(keys) { for (const k of keys) if (spilled.has(k) && !mem.has(k)) load(k); },
    /** Read every spilled record back (a save needs them all). */
    async settle() {
      for (let guard = 0; guard < 4 && [...spilled].some(k => !mem.has(k)); guard++) {
        for (const k of spilled) if (!mem.has(k)) load(k);
        await Promise.all([...loading.values()]);
      }
    },
    /** Called now and then: spill what memory holds beyond the limit. */
    trim() { if (mem.size > memMax) spill(); },
    stats() { return { mem: mem.size, spilled: spilled.size }; },
    async dispose() {
      dead = true;
      const b = disk(), ks = [...spilled]; mem.clear(); spilled.clear();
      if (b) for (const k of ks) { try { await b.del(name(k)); } catch (e) { /* scratch */ } }
    },
  };
}
