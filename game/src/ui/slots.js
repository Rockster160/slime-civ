// Autosave slots and the ironman rule (S12, GDD §20/§22, OD-12). Pure over a `storage` object ({get, set, remove}, a thin wrapper over localStorage), so
// the rotation and the ironman flow can be tested headless (tests/ui_s12.js).
//
//   normal game   an autosave every game day, into a ring of AUTO_SLOTS slots (the oldest is overwritten); manual saves and loads are free
//   ironman game  ONE autosave slot, overwritten every game day; no manual save, no load (the only way back is Continue, from a fresh page)
import { DAY } from "../sim/clock.js";

export const AUTO_SLOTS = 3;
export const AUTO_KEY = "slimeciv.auto.";
export const IRON_KEY = "slimeciv.iron";

/** Wrap window.localStorage (null if the browser will not give it). */
export function browserStorage() {
  let ls = null;
  try { ls = window.localStorage; } catch (e) { ls = null; }
  return {
    get: (k) => { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } },
    set: (k, v) => { if (!ls) return false; try { ls.setItem(k, v); return true; } catch (e) { return false; } },
    remove: (k) => { try { if (ls) ls.removeItem(k); } catch (e) { /* nothing to remove */ } },
  };
}
/** The in-memory storage tests use. `limit`: refuse a write that would take the total past this many characters (a full browser). */
export function memoryStorage(limit = Infinity) {
  const m = new Map();
  const total = () => { let n = 0; for (const v of m.values()) n += v.length; return n; };
  return { m, get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { const old = m.has(k) ? m.get(k).length : 0; if (total() - old + v.length > limit) return false; m.set(k, v); return true; }, remove: (k) => { m.delete(k); } };
}

const meta = (sim, json) => JSON.stringify({ tick: sim.tick, seed: sim.seed, day: Math.floor(sim.tick / DAY), pop: sim.ents.ofKind("villager").length, kb: Math.round(json.length / 1024), iron: sim.ironman ? 1 : 0 });
const readMeta = (st, key) => { try { const t = st.get(key + ".meta"); return t ? JSON.parse(t) : null; } catch (e) { return null; } };

/** Is an autosave due? (the first whole game day after `lastDay`) */
export const autosaveDue = (sim, lastDay) => Math.floor(sim.tick / DAY) > lastDay;

/**
 * Write the autosave for `sim` (`json` is its save text). An ironman game always uses the one slot; a normal game the ring slot holding the oldest
 * save (an empty one first). If the browser is full, the other normal slots are dropped one at a time (oldest first) until it fits. -> the key written, or "".
 */
export function autosave(st, sim, json) {
  const m = meta(sim, json);
  if (sim.ironman) return st.set(IRON_KEY, json) && st.set(IRON_KEY + ".meta", m) ? IRON_KEY : "";
  const slots = Array.from({ length: AUTO_SLOTS }, (_, i) => ({ key: AUTO_KEY + i, m: readMeta(st, AUTO_KEY + i) }));
  slots.sort((a, b) => (a.m ? a.m.tick : -1) - (b.m ? b.m.tick : -1) || (a.key < b.key ? -1 : 1));
  for (let attempt = 0; attempt <= AUTO_SLOTS; attempt++) {
    const target = slots[0];
    if (st.set(target.key, json) && st.set(target.key + ".meta", m)) return target.key;
    const victim = slots.slice().reverse().find(s => s.m && s.key !== target.key);          // the browser is full: let the oldest of the others go
    if (!victim) return "";
    st.remove(victim.key); st.remove(victim.key + ".meta"); victim.m = null;
    slots.sort((a, b) => (a.m ? a.m.tick : -1) - (b.m ? b.m.tick : -1) || (a.key < b.key ? -1 : 1));
  }
  return "";
}
/** The autosaves on offer, newest first: [{key, tick, day, pop, kb, iron}]. */
export function listAutos(st) {
  const out = [];
  for (const key of [IRON_KEY, ...Array.from({ length: AUTO_SLOTS }, (_, i) => AUTO_KEY + i)]) { const m = readMeta(st, key); if (m && st.get(key)) out.push({ key, ...m }); }
  return out.sort((a, b) => b.tick - a.tick);
}
/** May the player load this? An ironman game can never load (it ends or it is abandoned); anything else may. -> "" or the plain reason. */
export function loadRefusal(sim) {
  return sim && sim.ironman ? "Ironman: one autosave, no loading. Finish this life, or start a new game." : "";
}
/** May the player save by hand (browser slot or download)? */
export function saveRefusal(sim) {
  return sim && sim.ironman ? "Ironman: the game saves itself once a day into a single slot; there is no manual save." : "";
}
