// 8.25: the chunked store and incremental autosave. Node only (a fake in-memory backend and a fake localStorage); the real IndexedDB is exercised by tools/ui_smoke_save.js.
//   node tests/store.js      about 10 s
// Covers: incremental save == full save (decoded and compared), an interrupted save leaves the previous one loadable, only changed chunks are rewritten (writes counted),
// the dirty set covers every chunk whose record changed, records are shared between slots and collected when nothing refers to them, a full backend fails cleanly,
// the localStorage fallback (IDB missing, throwing, or erroring) and the base64 round trip.
import "./legacy.js";
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { savePackage, fromPackage, restore } from "../src/sim/save.js";
import { M } from "../src/sim/world.js";
import { Store, memoryBackend, localBackend, openBackends, recordsOf, REC, MAN } from "../src/store/store.js";

const ok = (m) => console.log("ok  " + m);
const T0 = Date.now();
const fakeLS = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
const chunkKeysOf = (pkg) => Object.keys(pkg.c);
const recs = (pkg) => new Map(pkg.m.c.map(([k, h]) => [k, h]));
const changed = (a, b) => { const A = recs(a), B = recs(b), out = []; for (const [k, h] of B) if (A.get(k) !== h) out.push(k); for (const k of A.keys()) if (!B.has(k)) out.push(k); return out; };
const nChunkRecs = (be) => [...be.m.keys()].filter(k => /^rec\/c/.test(k)).length;

// ---- 1. incremental save equals a full save, decoded and compared ----
{
  const sim = loadFixture("settled"), be = memoryBackend(), st = new Store([be]);
  for (let i = 0; i < 700; i++) sim.step();                                                    // (an old fixture's plants take their birth ticks on the first growth pass: that is a one-off, so let it pass)
  const p1 = savePackage(sim);
  const s1 = await st.save("auto.0", p1);
  assert.equal(s1.reused, 0, "the first save writes everything");
  assert.equal(s1.wrote, recordsOf(p1).length);
  const full = (await st.load("auto.0"));
  assert.equal(restore(full).hash(), sim.hash(), "the first save loads to the same world");
  sim.world.dk.clear();
  sim.world.set(sim.site.x + 2, sim.site.y + 2, sim.site.z, M.SOFT, 0);                       // change one cell
  for (let i = 0; i < 300; i++) sim.step();
  const p2 = savePackage(sim), s2 = await st.save("auto.0", p2, { dirty: sim.world.dk.size });
  assert.ok(s2.wrote < recordsOf(p2).length, "an incremental save writes fewer records than a full one (" + s2.wrote + " of " + recordsOf(p2).length + ")");
  assert.equal(s2.wrote + s2.reused, recordsOf(p2).length);
  const inc = await st.load("auto.0");
  const fresh = new Store([memoryBackend()]); await fresh.save("auto.0", p2);                   // a full save of the same state, in an empty store
  assert.deepEqual(JSON.parse(JSON.stringify(inc)), JSON.parse(JSON.stringify(await fresh.load("auto.0"))), "incremental and full saves decode to the same package");
  assert.deepEqual(JSON.parse(JSON.stringify(fromPackage(inc))), JSON.parse(JSON.stringify(fromPackage(p2))));
  assert.equal(restore(inc).hash(), sim.hash(), "the incremental save loads to the running world");
  ok("incremental == full: " + s2.wrote + " of " + recordsOf(p2).length + " records written, " + s2.bytes + " B vs " + s1.bytes + " B for the first");

  // ---- 2. an interrupted save leaves the previous one loadable ----
  const keep = (await st.load("auto.0")).m.tick, before = restore(await st.load("auto.0")).hash();
  for (let i = 0; i < 200; i++) sim.step();
  const p3 = savePackage(sim);
  let n = 1;
  for (; ; n++) {                                                                              // fail the n-th write, for every n up to the last (the manifest)
    be.failAt(n);
    let threw = true;
    try { await st.save("auto.0", p3); threw = false; } catch (e) { assert.match(e.message, /injected/); }
    be.failAt(0);
    if (!threw) break;
    const back = await st.load("auto.0");
    assert.equal(back.m.tick, keep, "after a failure at write " + n + " the previous save is still the slot");
    assert.equal(restore(back).hash(), before, "and it loads to the world it was");
  }
  assert.ok(n > 3, "a save is several writes (" + (n - 1) + ")");
  be.failKey(MAN);                                                                             // and a save whose records all land but whose manifest does not
  sim.world.set(sim.site.x + 3, sim.site.y, sim.site.z, M.SOFT, 0); sim.step();
  const keep2 = (await st.load("auto.0")).m.tick;
  await assert.rejects(st.save("auto.0", savePackage(sim)), /injected/);
  be.failKey("");
  assert.equal(be.failedKey, MAN + "auto.0");
  assert.equal((await st.load("auto.0")).m.tick, keep2, "records written but no manifest: the slot is still the previous save");
  await st.save("auto.0", savePackage(sim)); 
  assert.equal(restore(await st.load("auto.0")).hash(), sim.hash(), "the save that finally landed is the new world");
  { const man = JSON.parse(be.m.get(MAN + "auto.0")), refs = new Set([...Object.keys(man.rs), ...Object.keys((man.prev || {}).rs || {})]);      // (8.27: the generation before is kept whole, so its records are referenced too)
    assert.deepEqual([...be.m.keys()].filter(k => k.startsWith(REC)).sort(), [...refs].sort(), "afterwards nothing but the referenced records is left (orphans collected)"); }
  ok("interrupted save: " + (n - 1) + " failure points (each record, then the manifest) leave the previous save intact; the retry collects the orphans");

  // ---- 3. only changed chunks are rewritten (writes counted) ----
  const sim2 = loadFixture("settled"), be2 = memoryBackend(), st2 = new Store([be2]);
  await st2.save("auto.0", savePackage(sim2));
  const w0 = be2.writes.length;
  await st2.save("auto.1", savePackage(sim2));                                                 // nothing changed: only the second slot's manifest (records are shared)
  assert.equal(be2.writes.length - w0, 1, "an unchanged world writes only a manifest into a new slot");
  sim2.world.dk.clear();
  sim2.world.set(sim2.site.x, sim2.site.y, sim2.site.z + 1, M.SOFT, 0);
  assert.equal(sim2.world.dk.size, 1, "world.set marks exactly its chunk dirty");
  const p = savePackage(sim2), w1 = be2.writes.length;
  await st2.save("auto.0", p);
  const wr = be2.writes.slice(w1);
  assert.equal(wr.filter(k => /^rec\/c/.test(k)).length, 1, "one chunk record rewritten");
  assert.equal(wr.length, 2, "the changed chunk, then the manifest (the village record is unchanged at the same tick): " + wr.join(", "));
  assert.equal(wr[wr.length - 1], MAN + "auto.0");
  ok("only dirty chunks rewritten: " + wr.length + " writes for one changed cell (" + nChunkRecs(be2) + " chunk records held); manifest last");

  // ---- 4. records are shared and collected ----
  const refs = new Set(); for (const s of ["auto.0", "auto.1"]) { const mn = JSON.parse(await be2.get(MAN + s)); for (const k of [...Object.keys(mn.rs), ...Object.keys((mn.prev || {}).rs || {})]) refs.add(k); }
  assert.equal([...be2.m.keys()].filter(k => k.startsWith(REC)).length, refs.size, "exactly the referenced records are stored");
  await st2.remove("auto.1");
  const left = new Set(); { const mn = JSON.parse(await be2.get(MAN + "auto.0")); for (const k of [...Object.keys(mn.rs), ...Object.keys((mn.prev || {}).rs || {})]) left.add(k); }
  assert.deepEqual([...be2.m.keys()].filter(k => k.startsWith(REC)).sort(), [...left].sort(), "removing a slot collects the records only it used");
  assert.equal(restore(await st2.load("auto.0")).hash(), sim2.hash());
  ok("records shared between slots; removing a slot collects only what nothing else uses");

  // ---- 5. a full backend fails cleanly ----
  const be3 = memoryBackend(), st3 = new Store([be3]);
  await st3.save("auto.0", savePackage(sim2));
  const used = [...be3.m.values()].reduce((a, v) => a + (v.length ?? v.size), 0);
  be3.setQuota(used + 200);
  sim2.step(); sim2.world.set(sim2.site.x + 1, sim2.site.y, sim2.site.z + 1, M.SOFT, 0);
  await assert.rejects(st3.save("auto.0", savePackage(sim2)), /Quota/);
  be3.setQuota(Infinity);
  assert.ok(restore(await st3.load("auto.0")), "the slot written before the quota failure still loads");
  ok("a full backend rejects the write and leaves the slot loadable");
}

// ---- 6. the dirty set covers every chunk whose record changed (a bounded run from a fixture) ----
{
  const sim = loadFixture("settled");
  const a = savePackage(sim);
  sim.world.dk.clear();
  for (let i = 0; i < 1500; i++) sim.step();
  const b = savePackage(sim), ch = changed(a, b).map(Number), dk = sim.world.dk;
  const missed = ch.filter(k => !dk.has(k));
  assert.deepEqual(missed, [], "chunks whose record changed but were never marked dirty: " + missed.join(","));
  ok("dirty set covers all changes: " + ch.length + " chunk records changed, " + dk.size + " marked dirty, 0 missed (1500 ticks)");
}

// ---- 7. the fallback: IDB missing, throwing, or erroring -> localStorage; the base64 round trip ----
{
  const sim = loadFixture("settled"), pkg = savePackage(sim);
  const throwing = { open() { throw new Error("SecurityError"); } };
  const erroring = { open() { const r = {}; setTimeout(() => { r.error = new Error("blocked"); r.onerror(); }, 0); return r; } };
  for (const [name, idb] of [["missing", undefined], ["throwing", throwing], ["erroring", erroring]]) {
    const ls = fakeLS(), bs = await openBackends({ indexedDB: idb, localStorage: ls });
    assert.deepEqual(bs.map(b => b.name), ["localStorage"], "IDB " + name + " falls back to localStorage");
    const st = new Store(bs);
    await st.save("save.1", pkg);
    const stored = [...ls.m.entries()].filter(([k]) => k.startsWith("slimeciv.s.rec/"));
    assert.ok(stored.length && stored.every(([, v]) => typeof v === "string" && /^[A-Za-z0-9+/=]+$/.test(v)), "records are base64 strings");
    const st2 = new Store(await openBackends({ indexedDB: idb, localStorage: ls }));              // a new page: scan, then load
    await st2.scan();
    assert.equal(st2.slots()[0].slot, "save.1");
    assert.equal(restore(await st2.load("save.1")).hash(), sim.hash(), "loads from localStorage");
  }
  const none = await openBackends({});
  assert.equal(none.length, 0);
  await assert.rejects(new Store(none).save("auto.0", pkg), /nowhere/);
  // a save made while IDB was unavailable is still found once it is back: reads look in every backend
  const lsb = localBackend(fakeLS()), idbLike = memoryBackend("IndexedDB");
  const a = new Store([lsb]); await a.save("auto.1", pkg);
  const b = new Store([idbLike, lsb]); await b.scan();
  assert.equal(b.slots().length, 1); assert.equal(restore(await b.load("auto.1")).hash(), sim.hash());
  ok("fallback: IDB missing / throwing / erroring -> localStorage (base64), reloadable; no storage at all fails in plain words; a fallback save is found when IDB returns");
}
// ---- 8. recovery (8.27): a damaged newest generation falls back to the one before; a delete frees its records; the manifest alone lists the slots ----
{
  const sim = loadFixture("settled"), be = memoryBackend(), st = new Store([be]);
  for (let i = 0; i < 300; i++) sim.step();
  const p1 = savePackage(sim); const h1 = sim.hash();
  await st.save("auto.0", p1);
  const cell = () => { sim.world.set(sim.site.x + 2, sim.site.y, sim.site.z, M.SOFT, 0); };
  cell(); sim.step();
  const p2 = savePackage(sim), h2 = sim.hash();
  await st.save("auto.0", p2);
  const man = JSON.parse(be.m.get(MAN + "auto.0"));
  assert.equal(man.prev.gen, 1, "the manifest keeps the generation before");
  assert.equal(restore(await st.load("auto.0")).hash(), h2, "undamaged: the newest loads, nothing recovered");
  assert.ok(!(await st.load("auto.0")).recovered);
  const fresh = Object.keys(man.rs).filter(k => !man.prev.rs[k]);
  assert.ok(fresh.length >= 2, "the newest generation has records of its own (" + fresh.length + ")");
  // (a) a record missing
  const saved = be.m.get(fresh[0]); be.m.delete(fresh[0]);
  let pkg = await st.load("auto.0");
  assert.ok(pkg.recovered && pkg.recovered.gen === 1, "a missing record: the previous generation loads"); assert.equal(restore(pkg).hash(), h1);
  // (b) a record that will not decompress
  be.m.set(fresh[0], new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  pkg = await st.load("auto.0"); assert.ok(pkg.recovered, "garbage bytes: recovered"); assert.equal(restore(pkg).hash(), h1);
  // (c) a record that decodes but is not what the checksum says (another record's bytes under this key)
  const other = Object.keys(man.rs).find(k => man.prev.rs[k] && k.includes("/c"));
  be.m.set(fresh[0], be.m.get(other));
  pkg = await st.load("auto.0"); assert.ok(pkg.recovered, "a wrong record: recovered"); assert.equal(restore(pkg).hash(), h1);
  be.m.set(fresh[0], saved);
  assert.ok(!(await st.load("auto.0")).recovered, "put back: the newest loads again");
  // both damaged: a plain error
  be.m.delete(fresh[0]); for (const k of Object.keys(man.prev.rs)) if (!man.rs[k]) be.m.delete(k);
  await assert.rejects(st.load("auto.0"), /damaged/);
  be.m.set(fresh[0], saved);
  // delete frees what only that slot held
  await st.remove("auto.0");
  assert.equal([...be.m.keys()].filter(k => k.startsWith(REC)).length, 0, "deleting the only slot frees every record");
  ok("recovery: a missing, garbage or mismatching record in the newest generation falls back to the previous one; both gone is a plain error; delete frees the records");
}

console.log("store tests passed (" + ((Date.now() - T0) / 1000).toFixed(1) + " s)");
