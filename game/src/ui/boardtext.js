// The job board as chips (9.31): one icon + count per kind of notice, a claim mark on a claimed one. No sentences; the tooltip names who wrote it and how old it is.
import { DAY } from "../sim/clock.js";
import { STALE } from "../sim/belief.js";

const ICON = { food: "forage", tree: "chop", water: "drink", site: "build", dig: "dig", pen: "pen", wagon: "haul", danger: "danger", "need:food": "food", "need:warm": "warmth", "need:bed": "bed", "need:stick": "chop", "need:log": "chop", "need:grass": "gather" };
const LABEL = { food: "Food", tree: "Trees", water: "Water", site: "Site", dig: "Dig", pen: "Pen", wagon: "Wagon", "need:food": "Hungry", "need:warm": "Cold", "need:bed": "No bed", "need:stick": "Sticks", "need:log": "Logs", "need:grass": "Grass" };
const ORDER = ["need:food", "need:warm", "need:bed", "need:log", "need:stick", "need:grass", "danger", "site", "dig", "pen", "food", "tree", "water", "ore", "wagon", "claim"];
const baseOf = (k) => (k.startsWith("ore:") ? "ore" : k.startsWith("danger:") ? "danger" : k.startsWith("claim:") ? "claim" : k);

/**
 * [{icon, text, label, claimed, tip}] for a board entity: a request shows the amount short ("-12"), a place shows how many places of that kind are written up, `claimed` when a slime has taken it
 * (a claim mark). Claims of a job group are one chip with the number of claimants. `nameOf(id)` -> a slime's name.
 */
export function noticeChips(board, now, nameOf = () => "") {
  const g = new Map();
  for (const n of board.notes || []) {
    const k = baseOf(n[0]);
    let c = g.get(k);
    if (!c) { c = { k, icon: k === "ore" ? "dig" : k === "claim" ? "tool" : ICON[k] || ICON[n[0]] || "note", label: k === "ore" ? "Ore" : k === "claim" ? "Claims" : k === "danger" ? n[0].slice(7).replace(/^./, x => x.toUpperCase()) : LABEL[k] || k, n: 0, req: n[0].startsWith("need:") && k !== "need:food" && k !== "need:warm" && k !== "need:bed", claimed: false, last: n, by: new Set() }; g.set(k, c); }
    c.n += n[0].startsWith("need:") ? n[4] : 1;
    if (n[8] > 0) c.claimed = true;
    if (n[5] > c.last[5]) c.last = n;
    c.by.add(n[7]);
  }
  return [...g.values()].sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k) || (a.k < b.k ? -1 : 1))
    .map(c => ({ icon: c.icon, label: c.label, text: c.req ? "−" + c.n : String(c.n), claimed: c.claimed, who: ((nameOf(c.last[7]) || "") + "").split(" ")[0], old: now - c.last[5] > STALE, tip: c.label + ": " + (nameOf(c.last[7]) || "the player") + ", " + Math.floor((now - c.last[5]) / DAY * 10) / 10 + " days ago" }));
}
