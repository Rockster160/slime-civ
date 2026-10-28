// Save / load / new game. Uses sim/save.js unchanged: snapshot to JSON, restore
// to a fresh Sim. Browser storage is wrapped in try/catch (private windows, quota).
import { Sim } from "../sim/sim.js";
import { toJSON, restore } from "../sim/save.js";
import { dateOf, SEASON_NAMES } from "../sim/clock.js";

const KEY = "slimeciv.save.1";

export function savedInfo() {
  try {
    const raw = window.localStorage.getItem(KEY + ".meta");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function saveLocal(game) {
  const { sim } = game, json = toJSON(sim), d = dateOf(sim.tick);
  try {
    window.localStorage.setItem(KEY, json);
    window.localStorage.setItem(KEY + ".meta", JSON.stringify({ tick: sim.tick, seed: sim.seed, label: `Y${d.year} D${d.day} ${SEASON_NAMES[d.season]}, ${sim.ents.ofKind("villager").length} villagers`, kb: Math.round(json.length / 1024) }));
    game.toast("Saved (" + Math.round(json.length / 1024) + " KB) to this browser.");
    return true;
  } catch (e) {
    game.toast("The browser would not store the save (" + Math.round(json.length / 1024) + " KB). Use Download save instead.", 7000);
    return false;
  }
}

export function loadLocal(game) {
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

export function downloadSave(game) {
  const { sim } = game, blob = new Blob([toJSON(sim)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `slime-civ-seed${sim.seed}-tick${sim.tick}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  game.toast("Save downloaded.");
}

export function loadFile(game, file) {
  const r = new FileReader();
  r.onload = () => loadJSON(game, String(r.result), "Loaded " + file.name + ".");
  r.readAsText(file);
}

export function newGame(game, seed) {
  seed = Math.floor(Number(seed));
  if (!(seed >= 0)) { game.toast("Seed must be a number."); return; }
  game.setSim(Sim.create(seed));
  game.toast("New world, seed " + seed + ".");
}
