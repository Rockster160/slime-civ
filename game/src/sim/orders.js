// Player commands (sim side). The UI calls sim.apply({type, ...}); each handler
// returns true if it changed anything. Commands are tick-stamped and logged by
// Sim.apply, so a run replays exactly.
//
//   {type:"order", ids:[villagerId...], verb, tid?, x?,y?,z?}
//        verb: forage | chop | gather | haul | move | dig | hunt | capture (S10: catch a wild hopper alive and put it in a finished pen) (S8 hunt: hoppers around the target; the meat is hauled in). For dig, z is the level of the SOLID cell to remove
//        (the stand cell above it is z+1); the order covers a 5x5 patch of columns at that level and yields stone/dirt items.
//        Target = entity id (tid) or a cell (x,y,z). An order is AREA-wide: after
//        the named target the villager keeps working targets within ORDER_AREA
//        cells until none are left. Orders are class 300 and direct only; village-level
//        critical needs and personal needs outrank them (§09).
//   {type:"keep", item, n}   standing order keep-N (refill below 80%, stop at 100%); n capped at stockpile capacity
//   {type:"unkeep", item}
//   {type:"teach", id, pupil}   villager `id` coaches `pupil` (0 stops): when they work the same craft side by side the pupil gains x3 XP and the teacher works at x0.8 (§10)
//   {type:"split", id}          solo split (R16): a clone, at most once per villager per life
//   {type:"cancel", ids?:[...]}   clears orders (all villagers if ids omitted)
import { isAdult } from "./villager.js";
import { ITEMS, stockCapacity } from "./items.js";
import { cancelAction } from "./jobstate.js";
import { setTeach } from "./skills.js";
import { splitSolo } from "./population.js";
import { can } from "./knowledge.js";

const VERBS = ["forage", "chop", "gather", "haul", "move", "dig", "hunt", "capture", "scout"];     // S17: scout = walk to unexplored land and reveal it (scout.js)

export const ORDER_COMMANDS = {
  order(sim, c) {
    if (!VERBS.includes(c.verb) || !Array.isArray(c.ids)) return false;
    if (c.verb === "capture") {                                          // S10: catching a hopper alive needs the craft and a finished pen to put it in
      if (!can(sim, "HUSBANDRY")) { sim.lastBlocker = "UNKNOWN_CRAFT"; return false; }
      if (!sim.farm.pens.some(p => p.built)) { sim.lastBlocker = "NO_PEN"; return false; }
    }
    let x = c.x, y = c.y, z = c.z;
    if (c.tid) {
      const e = sim.ents.get(c.tid);
      if (!e) return false;
      x = e.x; y = e.y; z = e.z;
    }
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (z === undefined) z = Math.max(0, sim.world.standZ(x, y) - (c.verb === "dig" ? 1 : 0));
    let n = 0;
    for (const id of c.ids) {
      const v = sim.ents.get(id);
      if (!v || v.kind !== "villager" || !isAdult(sim, v)) continue;
      const o = v.order;
      if (o && o.verb === c.verb && o.tid === (c.tid || 0) && o.x === x && o.y === y && o.z === z) continue;   // same order again: nothing changes
      v.order = { verb: c.verb, tid: c.tid || 0, x, y, z, t0: sim.tick, done: 0 };
      n++;
    }
    if (n) sim.board.ep++;
    return n > 0;
  },
  keep(sim, c) {
    if (!ITEMS[c.item] || !(c.n >= 0)) return false;
    const n = Math.min(Math.floor(c.n), stockCapacity(sim));       // cap N at storage capacity (§14.5 hoard exploit)
    const k = sim.board.keeps.find(q => q.item === c.item);
    if (k) k.n = n; else sim.board.keeps.push({ item: c.item, n, on: 0 });
    sim.board.ep++;
    return true;
  },
  unkeep(sim, c) {
    const i = sim.board.keeps.findIndex(q => q.item === c.item);
    if (i < 0) return false;
    sim.board.keeps.splice(i, 1); sim.board.ep++;
    return true;
  },
  teach(sim, c) {
    const t = sim.ents.get(c.id), p = c.pupil ? sim.ents.get(c.pupil) : null;
    if (!t || t.kind !== "villager" || !isAdult(sim, t)) return false;
    if (c.pupil && (!p || p.kind !== "villager" || p === t || !isAdult(sim, p))) return false;
    setTeach(sim, t, c.pupil || 0);
    return true;
  },
  split(sim, c) {
    const v = sim.ents.get(c.id);
    return !!(v && v.kind === "villager" && splitSolo(sim, v));
  },
  cancel(sim, c) {
    let n = 0;
    for (const v of sim.ents.ofKind("villager")) {
      if (c.ids && !c.ids.includes(v.id)) continue;
      if (v.order) { v.order = null; n++; if (v.job && v.job.c === "order") cancelAction(sim, v); }
    }
    if (n) sim.board.ep++;
    return n > 0;
  },
};
