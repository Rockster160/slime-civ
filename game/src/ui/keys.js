// Remappable keys (S12, GDD §22 accessibility): every action the keyboard drives, with its default keys, in one table. The player's changes live in the
// browser (localStorage "slimeciv.keys"), never in the save; the help overlay and the Controls panel read the same table, so they cannot disagree.
//
//   ctx   "global" (works everywhere) | "map" (select and build modes) | "pan" (held: walks the camera, or the guided villager) | "guide" (while guiding a villager)
//   A key id is the lower-cased character ("w", "?", "[") or the name of a special key ("Tab", "PageUp", "ArrowLeft", "Space"), with "shift+" before Tab.
// Fixed, not remappable: Esc, the number row (speeds), Ctrl/Alt+1..9 (crews), Shift-S / Shift-O (browser save and load).
import { remember } from "./dom.js";

export const ACTIONS = [
  { id: "pause", label: "Pause", keys: ["Space"], ctx: "global", note: "pause or resume" },
  { id: "help", label: "Help", keys: ["h", "?"], ctx: "global", note: "show or hide the help" },
  { id: "panels", label: "Hide panels", keys: ["p"], ctx: "global", note: "hide or show every panel" },
  { id: "book", label: "Book", keys: ["k"], ctx: "global", note: "the story, what the village knows, its people, the keys" },
  { id: "next", label: "Next villager", keys: ["Tab"], ctx: "map" },
  { id: "prev", label: "Previous villager", keys: ["shift+Tab"], ctx: "map" },
  { id: "follow", label: "Follow", keys: ["f"], ctx: "map", note: "follow the selected villager" },
  { id: "build", label: "Build mode", keys: ["b"], ctx: "map" },
  { id: "possess", label: "Possess", keys: ["q"], ctx: "map", note: "guide the selected villager" },
  { id: "cancel", label: "Cancel orders", keys: ["x"], ctx: "map" },
  { id: "zones", label: "Stockpile overlay", keys: ["z"], ctx: "map" },
  { id: "jobs", label: "Job lines overlay", keys: ["l"], ctx: "map" },
  { id: "warmth", label: "Warmth overlay", keys: ["t"], ctx: "map" },
  { id: "levelDown", label: "Level down", keys: ["[", "PageDown"], ctx: "map", note: "view (and build on) one level lower" },
  { id: "levelUp", label: "Level up", keys: ["]", "PageUp"], ctx: "map" },
  { id: "fit", label: "Fit the explored area", keys: ["0"], ctx: "map" },
  { id: "home", label: "Home", keys: ["Home"], ctx: "map", note: "centre the view on the camp" },
  { id: "rotate", label: "Rotate (build)", keys: ["r"], ctx: "map", note: "rotate a stamp in build mode" },
  { id: "erase", label: "Erase (build)", keys: ["e"], ctx: "map", note: "the erase tool in build mode" },
  { id: "panLeft", label: "Move left", keys: ["a", "ArrowLeft"], ctx: "pan", note: "pan the camera, or walk the guided villager" },
  { id: "panRight", label: "Move right", keys: ["d", "ArrowRight"], ctx: "pan" },
  { id: "panUp", label: "Move up", keys: ["w", "ArrowUp"], ctx: "pan" },
  { id: "panDown", label: "Move down", keys: ["s", "ArrowDown"], ctx: "pan" },
  { id: "use", label: "Use what is next to you", keys: ["e"], ctx: "guide", note: "chop, pick, dig, strike, build" },
  { id: "eat", label: "Eat", keys: ["c"], ctx: "guide" },
  { id: "drink", label: "Drink", keys: ["v"], ctx: "guide" },
  { id: "sleep", label: "Sleep", keys: ["n"], ctx: "guide" },
  { id: "drop", label: "Put down", keys: ["g"], ctx: "guide" },
  { id: "tool", label: "Take the spear or pick", keys: ["t"], ctx: "guide" },
  { id: "torch", label: "Set a torch", keys: ["o"], ctx: "guide", note: "a torch on the cell you face (needs a stick in hand)" },
  { id: "support", label: "Post a timber support", keys: ["u"], ctx: "guide", note: "a support on the cell you face (needs timber in hand)" },
  { id: "release", label: "Let go", keys: ["q"], ctx: "guide" },
  // S18 first-person view (guiding a villager is always first person): keyboard turning for when the mouse is not captured (the mouse look is fixed: it is the pointer)
  { id: "turnLeft", label: "Turn left (first person)", keys: [",", "ArrowLeft"], ctx: "guide", note: "a 90 degree turn" },
  { id: "turnRight", label: "Turn right (first person)", keys: [".", "ArrowRight"], ctx: "guide", note: "a 90 degree turn" },
];
export const PAN_IDS = ACTIONS.filter(a => a.ctx === "pan").map(a => a.id);
/** Actions that stay on while their key is held (walking; S18 turning). */
export const HELD_IDS = ACTIONS.filter(a => a.ctx === "pan" || a.held).map(a => a.id);
const GUIDE_FIRST = [...ACTIONS.filter(a => a.ctx === "guide"), ...ACTIONS.filter(a => a.ctx !== "guide")];
const BY = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
/** Contexts that are live together: while guiding, the guide keys, the walking keys and the global ones; otherwise the map keys, panning and the global ones. */
const LIVE = { guide: ["guide", "pan", "global"], map: ["map", "pan", "global"] };

/** The key id of a keydown event. */
export function keyId(e) {
  const k = e.key;
  if (k === " ") return "Space";
  if (k.length === 1) return k.toLowerCase();
  return (e.shiftKey && k === "Tab" ? "shift+" : "") + k;
}
const NAMES = { Space: "Space", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", PageUp: "Page Up", PageDown: "Page Down", Tab: "Tab", "shift+Tab": "Shift-Tab" };
/** How a key id reads to a person ("w" -> "W"). */
export const keyName = (k) => NAMES[k] || (k.length === 1 ? k.toUpperCase() : k);

export function createKeymap(storage = null) {
  const km = { actions: ACTIONS, version: 0, custom: {}, listeners: [] };
  const load = () => {
    let raw = null;
    try { raw = storage ? storage.get("keys") : remember("keys"); } catch (e) { raw = null; }
    try { const o = raw ? JSON.parse(raw) : {}; for (const id of Object.keys(o)) if (BY[id] && Array.isArray(o[id]) && o[id].every(x => typeof x === "string")) km.custom[id] = o[id]; } catch (e) { km.custom = {}; }
  };
  const save = () => { km.version++; const s = JSON.stringify(km.custom); try { if (storage) storage.set("keys", s); else remember("keys", s); } catch (e) { /* private window: the change lasts this session */ } for (const f of km.listeners) f(); };
  /** The keys an action answers to (the player's, else the defaults). */
  km.keysOf = (id) => km.custom[id] || BY[id].keys;
  km.isCustom = (id) => !!km.custom[id];
  /** "W / ←" */
  km.label = (id) => km.keysOf(id).map(keyName).join(" / ") || "(no key)";
  /** The action a key does in this mode ("guide" | "map"), or "". */
  km.actionOf = (kid, mode) => { for (const a of mode === "guide" ? GUIDE_FIRST : ACTIONS) if (LIVE[mode].includes(a.ctx) && km.keysOf(a.id).includes(kid)) return a.id; return ""; };      // (guiding: the guide keys win a shared key, so the arrows turn in first person and still pan the map)
  /** Who else, among the actions live at the same time as `id`, already uses this key? -> label or "". */
  km.clash = (id, kid) => {
    const a = BY[id], modes = a.ctx === "guide" ? ["guide"] : a.ctx === "map" ? ["map"] : ["map", "guide"];
    for (const m of modes) { const o = km.actionOf(kid, m); if (o && o !== id) return BY[o].label; }
    return "";
  };
  /** Give an action exactly one key. -> "" on success, else why not (a plain sentence). */
  km.set = (id, kid) => {
    if (!BY[id]) return "No such action.";
    if (["Escape"].includes(kid) || /^[1-9]$/.test(kid)) return keyName(kid) + " is fixed (Esc stops, the number row sets the speed).";
    const c = km.clash(id, kid);
    if (c) return keyName(kid) + " already does \"" + c + "\". Change that one first.";
    km.custom[id] = [kid]; save();
    return "";
  };
  km.clear = (id) => { km.custom[id] = []; save(); };
  km.reset = (id) => { if (id) delete km.custom[id]; else km.custom = {}; save(); };
  km.onChange = (f) => km.listeners.push(f);
  load();
  return km;
}
