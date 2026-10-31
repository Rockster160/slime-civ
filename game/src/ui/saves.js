// Save / load / new game. Uses sim/save.js unchanged: snapshot to JSON, restore
// to a fresh Sim. Browser storage is wrapped in try/catch (private windows, quota).
import { Sim } from "../sim/sim.js";
import { toJSON, restore, cutPackage, sealPackage, hashText } from "../sim/save.js";
import { dateOf, DAY } from "../sim/clock.js";
import { exportSlime, exportCode, importSave, encodeBytes, canGzip, SLIME_EXT } from "../store/codec.js";
import { browserStorage, autosaveDue, loadRefusal, saveRefusal, AUTO_SLOTS } from "./slots.js";
import { Store, openBackends, recordOf } from "../store/store.js";

// ---- the browser store (8.25) ----
// Saves live in the chunked store (src/store/store.js): IndexedDB, else localStorage. Slots are named "auto.0".."auto.2" (the ring), "iron" (the ironman slot)
// and "save.1" (the manual save). The flat-JSON saves of 8.24 and earlier sit in localStorage as "slimeciv.<slot>" (+ ".meta"); they are listed and loaded
// as they were, and replaced by a package the first time their slot is written.
const LEGACY = "slimeciv.", MANUAL = "save.1";
const legacyKey = (slot) => LEGACY + slot;
const ls = browserStorage();
let store = new Store([]);                                  // replaced when the backends have opened
/** Resolves once the backends are open and the slots are read (the Menu works from the cache either way). */
export const storeReady = (async () => {
  try {
    const get = (n) => { try { return window[n] || null; } catch (e) { return null; } };      // (a blocked store throws on access)
    const bs = await openBackends({ indexedDB: get("indexedDB"), localStorage: get("localStorage") });
    store = new Store(bs);
    await store.scan();
  } catch (e) { /* no storage at all: saving falls back to a file */ }
  return store;
})();
export const storeInfo = () => ({ backend: store.primary ? store.primary.name : "none", stats: store.stats, busy: store.busy });
export const getStore = () => store;

const legacyMeta = (slot) => { try { const t = ls.get(legacyKey(slot) + ".meta"); return t && ls.get(legacyKey(slot)) ? JSON.parse(t) : null; } catch (e) { return null; } };
/** Every save on offer, newest first, store and flat-era alike: [{slot, tick, day, pop, seed, iron, bytes, label, legacy}]. */
export function slotList() {
  const out = new Map();
  for (const s of store.slots()) out.set(s.slot, s);
  for (const slot of ["iron", MANUAL, ...Array.from({ length: AUTO_SLOTS }, (_, i) => "auto." + i)]) {
    const m = legacyMeta(slot), cur = out.get(slot);
    if (m && (!cur || m.tick > cur.tick)) out.set(slot, { slot, tick: m.tick, day: m.day, pop: m.pop, seed: m.seed, iron: m.iron ? 1 : 0, bytes: (m.kb || 0) * 1024, label: m.label, legacy: 1 });
  }
  return [...out.values()].sort((a, b) => b.tick - a.tick);
}
export function fmtBytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }

export function savedInfo() {
  const s = slotList().find(x => x.slot === MANUAL);
  return s ? { tick: s.tick, seed: s.seed, label: s.label || ("Day " + s.day + ", " + s.pop + " villagers"), kb: Math.round(s.bytes / 1024), bytes: s.bytes } : null;
}

/** Take the sim's dirty set (it restarts empty; a failed write puts it back). */
/** 8.26: a save holds every chunk, so the evicted ones must all be in memory first (ui/cold.js). */
const settleCold = async (game) => { if (game.cold) await game.cold.settle(); };
const takeDirty = (sim) => { const ks = [...sim.world.dk]; sim.world.dk.clear(); return ks; };
const giveBack = (sim, ks) => { for (const k of ks) sim.world.dk.add(k); };
const dropLegacy = (slot) => { ls.remove(legacyKey(slot)); ls.remove(legacyKey(slot) + ".meta"); };

// 8.27: the cut is one short atomic slice (snapshot + record text); the hashes are computed afterwards in slices of about 3 ms, one per frame, with unchanged records
// (same text as last time) taken from a cache, so the main thread never holds a save for long. The sim keeps running between the slices.
const SLICE_MS = 3, hashCache = new Map();
const nextTurn = () => new Promise((res) => { let done = false; const go = () => { if (!done) { done = true; res(); } }; if (typeof requestAnimationFrame === "function") requestAnimationFrame(go); setTimeout(go, 50); });
async function hashSliced(cut, prof) {
  const hashes = [], seen = new Map();
  let t = performance.now();
  const lap = () => { const d = performance.now() - t; prof.ms += d; if (d > prof.worst) prof.worst = d; prof.n++; };
  for (const x of cut.texts) {
    const c = hashCache.get(x.name);
    let h;
    if (c && c.json === x.json) h = c.hash;
    else {
      h = hashText(x.json);
      if (performance.now() - t > SLICE_MS) { lap(); await nextTurn(); t = performance.now(); }
    }
    seen.set(x.name, { json: x.json, hash: h }); hashes.push(h);
  }
  lap();
  hashCache.clear(); for (const [k, v] of seen) hashCache.set(k, v);
  return hashes;
}

/** Write `slot`. A full browser lets the oldest other normal slot go and tries again. -> {ok, stats?, error?} */
async function writeSlot(game, slot, { makeRoom = true } = {}) {
  await storeReady;
  const sim = game.sim;
  let pkg, recs, cut, dirty = [], err = null;
  const prof = { cut: 0, worst: 0, ms: 0, n: 0 };       // main-thread slices of this save: the cut, then the hash slices
  for (let tries = 0; tries < 3 && !pkg; tries++) {                              // (8.26: the cold records must all be in memory at the moment the package is cut)
    await settleCold(game);
    dirty = takeDirty(sim);
    try {
      const t0 = performance.now();
      cut = cutPackage(sim);
      prof.cut = performance.now() - t0;
      pkg = cut.pkg;
    } catch (e) { pkg = null; giveBack(sim, dirty); err = e; }
  }
  if (pkg) {
    try { const hashes = await hashSliced(cut, prof); sealPackage(cut, hashes); recs = cut.texts.map((x, i) => recordOf(x.name, x.json, hashes[i])); }
    catch (e) { giveBack(sim, dirty); pkg = null; err = e; }
  }
  if (!pkg) return { ok: false, error: err.message };
  for (let attempt = 0; attempt <= AUTO_SLOTS + 1; attempt++) {
    try {
      const stats = await store.save(slot, pkg, { iron: sim.ironman, dirty: dirty.length, recs });
      stats.cut = prof.cut; stats.hash = prof;
      dropLegacy(slot);
      return { ok: true, stats };
    } catch (e) {
      const victim = makeRoom && !sim.ironman ? slotList().filter(s => s.slot !== slot && s.slot !== "iron").pop() : null;
      if (!victim) { giveBack(sim, dirty); return { ok: false, error: e.message }; }
      await store.remove(victim.slot); dropLegacy(victim.slot);                                // the browser is full: the oldest of the others goes
    }
  }
  giveBack(sim, dirty);
  return { ok: false, error: "no room" };
}

export async function saveLocal(game) {
  const no = saveRefusal(game.sim); if (no) { game.toast(no, 5000); return false; }
  const r = await writeSlot(game, MANUAL);
  if (r.ok) { game.toast("Saved (" + fmtBytes(r.stats.total) + ") to this browser."); return true; }
  game.toast("The browser would not store the save, so it was downloaded as a file instead.", 7000);
  downloadSave(game, true);
  return false;
}

export async function loadLocal(game) {
  const no = loadRefusal(game.sim); if (no) { game.toast(no, 5000); return false; }
  return openSlot(game, MANUAL, "Loaded the browser save.", "No browser save yet. Shift-S saves one.");
}

/** Open a slot: the store's package, or the flat JSON a pre-8.25 game left in localStorage. */
async function openSlot(game, slot, okMsg, missing) {
  await storeReady;
  const s = slotList().find(x => x.slot === slot);
  if (!s) { game.toast(missing, 4000); return false; }
  try {
    if (s.legacy) return loadJSON(game, ls.get(legacyKey(slot)), okMsg);
    const pkg = await store.load(slot);
    game.setSim(restore(pkg));
    game.toast(pkg.recovered ? "Newest save damaged. Loaded the one before." : okMsg, pkg.recovered ? 7000 : undefined);        // 8.27: recovery
    return true;
  } catch (e) {
    game.toast("Could not load that save: " + e.message, 8000);
    return false;
  }
}

export function loadJSON(game, text, okMsg) {
  try {
    game.setSim(restore(text));
    game.toast(okMsg || "Loaded.");
    return true;
  } catch (e) {
    game.toast("Could not load that save: " + e.message, 7000);
    return false;
  }
}

/** Load from any accepted form (8.24: a .slime file's bytes, a save code, or legacy JSON text); the async work is the unzip. */
export async function loadAny(game, input, okMsg) {
  try {
    game.setSim(await importSave(input));
    game.toast(okMsg || "Loaded.");
    return true;
  } catch (e) {
    game.toast("Could not load that save: " + e.message, 8000);
    return false;
  }
}

/** Download the world as a .slime file (gzip of the save package); plain .json if the browser cannot compress. */
export async function downloadSave(game, quiet = false) {
  const no = saveRefusal(game.sim); if (no) { game.toast(no, 5000); return; }
  await settleCold(game);
  const { sim } = game, gz = canGzip();
  let bytes;
  try { bytes = gz ? await exportSlime(sim) : null; } catch (e) { bytes = null; }
  const blob = bytes ? new Blob([bytes], { type: "application/gzip" }) : new Blob([toJSON(sim)], { type: "application/json" });
  const d = dateOf(sim.tick), a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `slime-civ-seed${sim.seed}-Y${d.year}D${d.day}` + (bytes ? SLIME_EXT : ".json");
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  if (!quiet) game.toast("Save downloaded (" + Math.round(blob.size / 1024) + " KB).");
}

export function loadFile(game, file) {
  const no = loadRefusal(game.sim); if (no) { game.toast(no, 5000); return; }
  const r = new FileReader();
  r.onload = () => loadAny(game, new Uint8Array(r.result), "Loaded " + file.name + ".");
  r.readAsArrayBuffer(file);
}

/** Copy the save code (base64 of the .slime bytes) to the clipboard; a long game's code is large, and the toast says so. */
export async function copyCode(game) {
  const no = saveRefusal(game.sim); if (no) { game.toast(no, 5000); return; }
  try {
    await settleCold(game);
    const code = await exportCode(game.sim);
    await navigator.clipboard.writeText(code);
    game.toast("Save code copied (" + Math.round(code.length / 1024) + " KB of text). Paste it into Load from save code.", 6000);
  } catch (e) { game.toast("Could not copy the save code: " + e.message + ". Download the .slime file instead.", 7000); }
}
/** Load from a pasted save code (asks with a prompt; the browser's own paste box takes any length). */
export function loadCode(game) {
  const no = loadRefusal(game.sim); if (no) { game.toast(no, 5000); return; }
  const text = window.prompt("Paste a save code:");
  if (text && text.trim()) loadAny(game, text.trim(), "Loaded the save code.");
}

/** A fresh world seed (the only place chance enters: the UI picks it, the sim is a pure function of it). */
export function randomSeed() { const a = new Uint32Array(1); (window.crypto || globalThis.crypto).getRandomValues(a); return (a[0] % 999999999) + 1; }
export function newGame(game, seed, { ironman = false } = {}) {
  seed = Math.floor(Number(seed));
  if (!(seed >= 0)) { game.toast("Seed must be a number."); return; }
  game.setSim(Sim.create(seed, { ironman }));
  if (game.goHome) game.goHome();                          // 6.20: a new world opens on its camp, on the Surface
  game.toast(ironman ? "New ironman world, seed " + seed + ": it saves itself once a day into one slot, and cannot be loaded." : "New world, seed " + seed + ". It autosaves once a day.");
}

// ---- autosave (S12, 8.25): once a game day; a ring of three slots, or the single ironman slot; incremental, async ----
/** Called every frame: start the autosave when a game day has passed (at most one every few real seconds, so MAX speed does not thrash the browser; never while one is in flight). */
let warmAt = 0, warmed = false;
export function autosaveTick(game, nowMs) {
  const sim = game.sim;
  chip(store.busy > 0);
  if (!warmed) {                                    // 8.27: the first cut of a page runs cold code (about 2x slower); do that once, a few seconds in, where no save is in flight, so the first real autosave is a warm one
    if (!warmAt) warmAt = nowMs + 4000;
    else if (nowMs > warmAt) { warmed = true; try { cutPackage(sim); } catch (e) { /* the real save will say */ } }
  }
  if (game.lastAutoDay === undefined || game.lastAutoDay < 0) game.lastAutoDay = Math.floor(sim.tick / DAY);
  if (!autosaveDue(sim, game.lastAutoDay) || nowMs - (game.lastAutoMs || 0) < 4000 || store.busy > 0 || game.autoBusy) return false;
  game.lastAutoDay = Math.floor(sim.tick / DAY); game.lastAutoMs = nowMs;
  const list = slotList();
  const ring = Array.from({ length: AUTO_SLOTS }, (_, i) => "auto." + i);
  const slot = sim.ironman ? "iron" : ring.map(r => ({ r, t: (list.find(s => s.slot === r) || { tick: -1 }).tick })).sort((a, b) => a.t - b.t || (a.r < b.r ? -1 : 1))[0].r;
  game.autoBusy = true;
  writeSlot(game, slot).then((r) => {
    game.autoBusy = false;
    game.lastAutoKey = r.ok ? slot : "";
    if (r.ok) game.autoToast = performance.now();
    else {                                                     // S17: the browser cannot hold even one slot: say so, and hand the player the file
      game.toast("The browser has no room for the autosave. " + (sim.ironman ? "Ironman keeps one slot only: free some browser storage." : "A copy was downloaded as a file instead."), 9000);
      if (!sim.ironman && (game.lastAutoDl === undefined || sim.tick - game.lastAutoDl > 3 * DAY)) { game.lastAutoDl = sim.tick; downloadSave(game, true); }
    }
  });
  chip(true);
  return true;
}
let chipEl = null, chipOn = false;
/** The small "Saving..." chip: shown only while a save is in flight. */
function chip(on) {
  if (on === chipOn) return;
  chipOn = on;
  if (!chipEl) {
    chipEl = document.createElement("div"); chipEl.className = "savechip"; chipEl.dataset.test = "saving-chip"; chipEl.textContent = "Saving\u2026";
    chipEl.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:50;padding:2px 9px;border-radius:10px;font-size:12px;background:rgba(20,24,28,.78);color:#dfe8e0;pointer-events:none;display:none";
    document.body.appendChild(chipEl);
  }
  chipEl.style.display = on ? "block" : "none";
}
// ---- the save browser (8.27): every slot, from the manifests alone ----
const slotName = (slot) => slot === MANUAL ? "Manual" : slot === "iron" ? "Ironman" : /^auto\.\d$/.test(slot) ? "Auto " + (Number(slot.slice(5)) + 1) : slot;
/** Every slot with what the browser shows: [{slot, name, tick, day, year, pop, seed, bytes, iron, legacy, chunks: [chunkKey]}], newest first. Reads the manifests; opens no save. */
export function browserSlots() {
  return slotList().map(s => {
    const man = s.legacy ? null : store.cache.get(s.slot), meta = (man && man.m.meta) || {};
    return { ...s, name: slotName(s.slot), year: meta.year, at: s.at || 0, chunks: man ? man.m.c.map(c => c[0]) : [], prev: man && man.prev ? man.prev.m.tick : 0 };
  });
}
/** Forget a slot (and the records only it held). */
export async function deleteSlot(game, slot) {
  await storeReady;
  await store.remove(slot); dropLegacy(slot);
  game.toast("Deleted " + slotName(slot) + ".");
}
/** Download one slot as a .slime file (a flat-JSON slot as .json), without loading it. */
export async function exportSlot(game, slot) {
  await storeReady;
  const s = slotList().find(x => x.slot === slot);
  if (!s) return;
  try {
    let blob, ext;
    if (s.legacy) { blob = new Blob([ls.get(legacyKey(slot))], { type: "application/json" }); ext = ".json"; }
    else { const pkg = await store.load(slot); const bytes = canGzip() ? await encodeBytes(pkg) : new TextEncoder().encode(JSON.stringify(pkg)); blob = new Blob([bytes], { type: "application/gzip" }); ext = canGzip() ? SLIME_EXT : ".json"; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `slime-civ-seed${s.seed}-${slot.replace(".", "-")}` + ext;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    game.toast("Exported " + slotName(slot) + " (" + fmtBytes(blob.size) + ").");
  } catch (e) { game.toast("Could not export that save: " + e.message, 7000); }
}
/** Open any slot from the browser (the same checks as the Menu's Load). */
export const openFromBrowser = (game, slot) => (slot === MANUAL ? loadLocal(game) : continueAuto(game, slot));

/** The autosaves on offer, newest first: [{key (the slot), day, pop, seed, iron, bytes}]. */
export const autoList = () => slotList().filter(s => s.slot !== MANUAL).map(s => ({ ...s, key: s.slot }));
/** Load an autosave slot (ironman: from a game that is not itself ironman). */
export async function continueAuto(game, slot) {
  const no = loadRefusal(game.sim); if (no) { game.toast(no, 5000); return false; }
  return openSlot(game, slot, slot === "iron" ? "Continuing the ironman game." : "Loaded the autosave.", "That autosave is gone.");
}

// Debug handle for tools/ui_smoke_save.js (reads the store; changes nothing).
if (typeof window !== "undefined") window.__saves = { warmed: () => warmed, storeReady, browserSlots, loadJSON, storeInfo, slotList, getStore, flatJson: (game) => toJSON(game.sim) };
