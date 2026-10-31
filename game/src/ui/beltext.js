// The inspector's "Knows" chips (9.28): what a slime believes, as icon + 1-3 word label + count. Stale beliefs are faded and marked "?". No sentences.
import { isStale } from "../sim/belief.js";
import { DAY } from "../sim/clock.js";
import { CRAFTS, CRAFT_IDS } from "../sim/phenomena.js";
import { ideaOf } from "../sim/knowledge.js";

const ORDER = ["stock", "food", "tree", "water", "bed", "furn", "loose", "site", "plot", "ore", "game", "danger", "need:food", "need:warm", "need:bed"];
const LABEL = { stock: "Larder", food: "Food", tree: "Trees", bed: "Beds", site: "Sites", water: "Water", loose: "Loose", plot: "Plots", ore: "Ore", "need:food": "Hungry", "need:warm": "Cold", "need:bed": "No bed" };
const ICON = { stock: "haul", food: "forage", tree: "chop", bed: "bed", site: "build", danger: "danger", water: "drink", furn: "craft", loose: "haul", plot: "field", ore: "dig", game: "hunt", "need:food": "food", "need:warm": "cold", "need:bed": "bed" };
const SPLIT = new Set(["danger", "furn", "game"]);           // one chip per creature / piece of furniture kind; ore is one chip for every seam
const rankOf = (b) => { const i = ORDER.indexOf(b); return i < 0 ? 99 : i; };         // (a request chip goes last)
const SRC = ["Saw", "Told", "Board"];

/** [{icon, label, n, stale, tip}] in a fixed order: one chip per kind (a danger per creature kind); the larder shows its rations, the rest count patches. */
export function knowChips(v, now) {
  const g = new Map();
  for (const f of v.bel || []) {
    if (f[0] === "stock:mat" || f[0] === "folk" || f[0].startsWith("claim:")) continue;
    const key = f[0].startsWith("ore:") ? "ore" : f[0];
    let c = g.get(key);
    if (!c) {
      const i = key.indexOf(":"), pre = i > 0 ? key.slice(0, i) : "", sp = SPLIT.has(pre), base = sp ? pre : pre === "ore" ? "ore" : key;
      const req = pre === "need" && !LABEL[key];                          // a request it wrote up ("need:stick"): "Needs stick"
      c = { key: pre === "ore" ? "ore" : key, base, icon: req ? "haul" : ICON[base], label: sp ? key[i + 1].toUpperCase() + key.slice(i + 2) : req ? "Needs " + key.slice(i + 1) : LABEL[base] || key, n: 0, stale: true, last: f };
      g.set(key, c);
    }
    c.n += base0(f); if (!isStale(f, now)) c.stale = false;
    if (f[5] > c.last[5]) c.last = f;
  }
  const ideas = [];                                                        // 9.33: an idea of a craft seen but not known: the craft icon, faded, with "?"
  for (const c of CRAFT_IDS) if (ideaOf(v, c) > 0) ideas.push({ icon: "craft", label: CRAFTS[c].short, n: "", stale: true, tip: CRAFTS[c].short });
  return [...g.values()].sort((a, b) => rankOf(a.base) - rankOf(b.base) || (a.key < b.key ? -1 : 1))
    .map(c => ({ icon: c.icon, label: c.label, n: c.n, stale: c.stale, tip: c.label + ": " + SRC[c.last[6]] + ", " + Math.floor((now - c.last[5]) / DAY * 10) / 10 + " days ago" })).concat(ideas);
}
const base0 = (f) => (f[0] === "stock" ? f[4] : 1);

/** The map overlay's mark for one fact (9.32): its icon, or null for facts that are not a place (the larder reading, the head-count, a claim, a request). */
export function factMark(f, now) {
  const k = f[0];
  if (k === "stock" || k === "stock:mat" || k === "folk" || k.startsWith("claim:") || (k.startsWith("need:") && !ICON[k])) return null;
  const i = k.indexOf(":"), base = i > 0 && SPLIT.has(k.slice(0, i)) ? k.slice(0, i) : k.startsWith("ore:") ? "ore" : k;
  const icon = ICON[base];
  return icon ? { icon, stale: isStale(f, now), age: now - f[5] } : null;
}
