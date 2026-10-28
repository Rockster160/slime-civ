// Save / load / new game. Uses sim/save.js unchanged: snapshot to JSON, restore
// to a fresh Sim. Browser storage is wrapped in try/catch (private windows, quota).
import { Sim } from "../sim/sim.js";
import { toJSON, restore } from "../sim/save.js";
import { dateOf, SEASON_NAMES, DAY } from "../sim/clock.js";
import { browserStorage, autosave, listAutos, autosaveDue, loadRefusal, saveRefusal, IRON_KEY } from "./slots.js";

const KEY = "slimeciv.save.1";

export function savedInfo() {
  try {
    const raw = window.localStorage.getItem(KEY + ".meta");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function saveLocal(game) {
  const no = saveRefusal(game.sim); if (no) { game.toast(no, 5000); return false; }
  const { sim } = game, json = toJSON(sim), d = dateOf(sim.tick);
  try {
    window.localStorage.setItem(KEY, json);
    window.localStorage.setItem(KEY + ".meta", JSON.stringify({ tick: sim.tick, seed: sim.seed, label: `Y${d.year} D${d.day} ${SEASON_NAMES[d.season]}, ${sim.ents.ofKind("villager").length} villagers`, kb: Math.round(json.length / 1024) }));
    game.toast("Saved (" + Math.round(json.length / 1024) + " KB) to this browser.");
    return true;
  } catch (e) {
    game.toast("The browser would not store the save (" + Math.round(json.length / 1024) + " KB), so it was downloaded as a file instead.", 7000);
    downloadSave(game, true);
    return false;
  }
}

export function loadLocal(game) {
  const no = loadRefusal(game.sim); if (no) { game.toast(no, 5000); return false; }
  let raw = null;
  try { raw = window.localStorage.getItem(KEY); } catch (e) { /* fall through */ }
  if (!raw) { game.toast("No browser save yet. Shift-S saves one."); return false; }
  return loadJSON(game, raw, "Loaded the browser save.");
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

export function downloadSave(game, quiet = false) {
  const no = saveRefusal(game.sim); if (no) { game.toast(no, 5000); return; }
  const { sim } = game, blob = new Blob([toJSON(sim)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `slime-civ-seed${sim.seed}-tick${sim.tick}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  if (!quiet) game.toast("Save downloaded.");
}

export function loadFile(game, file) {
  const no = loadRefusal(game.sim); if (no) { game.toast(no, 5000); return; }
  const r = new FileReader();
  r.onload = () => loadJSON(game, String(r.result), "Loaded " + file.name + ".");
  r.readAsText(file);
}

/** A fresh world seed (the only place chance enters: the UI picks it, the sim is a pure function of it). */
export function randomSeed() { const a = new Uint32Array(1); (window.crypto || globalThis.crypto).getRandomValues(a); return (a[0] % 999999999) + 1; }
export function newGame(game, seed, { ironman = false } = {}) {
  seed = Math.floor(Number(seed));
  if (!(seed >= 0)) { game.toast("Seed must be a number."); return; }
  game.setSim(Sim.create(seed, { ironman }));
  game.toast(ironman ? "New ironman world, seed " + seed + ": it saves itself once a day into one slot, and cannot be loaded." : "New world, seed " + seed + ". It autosaves once a day.");
}

// ---- autosave (S12): once a game day; a ring of three slots, or the single ironman slot ----
const store = browserStorage();
/** Called every frame: write the autosave when a game day has passed (at most one every few real seconds, so MAX speed does not thrash the browser). */
export function autosaveTick(game, nowMs) {
  const sim = game.sim;
  if (game.lastAutoDay === undefined || game.lastAutoDay < 0) game.lastAutoDay = Math.floor(sim.tick / DAY);
  if (!autosaveDue(sim, game.lastAutoDay) || nowMs - (game.lastAutoMs || 0) < 4000) return false;
  game.lastAutoDay = Math.floor(sim.tick / DAY); game.lastAutoMs = nowMs;
  const json = toJSON(sim), key = autosave(store, sim, json);
  game.lastAutoKey = key;
  if (!key) {                                                  // S17: the browser cannot hold even one slot (a long exploration makes a big save): say so, and hand the player the file
    game.toast("The browser has no room for the autosave (" + Math.round(json.length / 1024) + " KB). " + (sim.ironman ? "Ironman keeps one slot only: free some browser storage." : "A copy was downloaded as a file instead."), 9000);
    if (!sim.ironman && (game.lastAutoDl === undefined || sim.tick - game.lastAutoDl > 3 * DAY)) { game.lastAutoDl = sim.tick; downloadSave(game, true); }
  }
  return !!key;
}
export const autoList = () => listAutos(store);
/** Load an autosave slot (ironman: from a game that is not itself ironman). */
export function continueAuto(game, key) {
  const no = loadRefusal(game.sim); if (no) { game.toast(no, 5000); return false; }
  const raw = store.get(key);
  if (!raw) { game.toast("That autosave is gone.", 4000); return false; }
  return loadJSON(game, raw, key === IRON_KEY ? "Continuing the ironman game." : "Loaded the autosave.");
}
