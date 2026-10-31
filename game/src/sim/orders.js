// Player commands (sim side). The UI calls sim.apply({type, ...}); each handler
// returns true if it changed anything. Commands are tick-stamped and logged by
// Sim.apply, so a run replays exactly.
//
//   {type:"assign", ids:[villagerId...], task, tid? | x,y}   (9.34, D58) task: chop | forage | gather | hunt | haul. A ROLE, not an area: the slime goes to the named thing or spot, works it,
//        then keeps picking the nearest thing of that kind it BELIEVES in to where it last worked, for as long as it lives (or until cancelled); with nothing believed it goes looking.
//        Class 300 (a direct order), so needs and flight outrank it and it resumes afterwards. {type:"order", verb: chop|forage|gather|hunt|haul} is the same command (crews).
//   {type:"order", ids:[villagerId...], verb, tid?, x?,y?,z?}   the one-off orders:
//        verb: clear (7.22: spear crews kill the monsters round the target, a den; never the guardian) | disarm (7.21: defuse the spotted trap at x,y,z; a craft job) | move | dig | capture (S10: catch a wild hopper alive and put it in a finished pen) | scout.
//        For dig, z is the level of the SOLID cell to remove (the stand cell above it is z+1); the order covers a 5x5 patch of columns at that level and yields stone/dirt items.
//        Target = entity id (tid) or a cell (x,y,z). clear and capture still cover ORDER_AREA cells round the target (a den's monsters, the hoppers near a pen are genuinely an area).
//        Orders are class 300 and direct only; village-level critical needs and personal needs outrank them (§09).
//   {type:"clearArea", x0,y0,x1,y1,z, ids?}   (clear.js) mark a rectangle of trees, bushes and tufts for removal; the ids are ordered to work it and it is posted on the board.
//   {type:"keep", item, n}   standing order keep-N (refill below 80%, stop at 100%); n capped at stockpile capacity
//   {type:"unkeep", item}
//   {type:"teach", id, pupil}   villager `id` coaches `pupil` (0 stops): when they work the same craft side by side the pupil gains x3 XP and the teacher works at x0.8 (§10)
//   {type:"split", id}          split into 2-5 selves; the original is gone (split.js)
//   {type:"cancel", ids?:[...]}   clears orders (all villagers if ids omitted)
import { isAdult } from "./villager.js";
import { ITEMS, stockCapacity } from "./items.js";
import { cancelAction } from "./jobstate.js";
import { setTeach } from "./skills.js";
import { splitSlime } from "./split.js";
import { can } from "./knowledge.js";
import { noteSeen } from "./belief.js";

/** 9.34 (D58): the gather verbs are ASSIGNMENTS (a role), not area orders. Each is a job for the slime to keep doing: `v.as = {task, tid, x, y, z, t0, done, go}`.
 *  (x, y, z) is where it last worked (or the spot it was sent to); the next target is the nearest one it BELIEVES in to there. `go` = 1 until it has walked to a spot with nothing known on it. */
export const ASSIGN_VERBS = ["chop", "forage", "gather", "hunt", "haul"];
export const ROLE = { chop: { name: "Lumberjack", icon: "chop" }, forage: { name: "Forager", icon: "forage" }, gather: { name: "Gatherer", icon: "gather" }, hunt: { name: "Hunter", icon: "hunt" }, haul: { name: "Hauler", icon: "haul" } };
const VERBS = ["move", "dig", "clear", "capture", "scout", "disarm"];     // S17: scout = walk to unexplored land and reveal it (scout.js)

export const ORDER_COMMANDS = {
  /** {type:"assign", ids, task: chop|forage|gather|hunt|haul, tid? | x,y}: the slimes take the role (see ASSIGN_VERBS). A named thing is theirs to start with (the player pointed at it); a bare spot is walked to and looked at. Capture stays an area order. */
  assign(sim, c) {
    if (!ASSIGN_VERBS.includes(c.task) || !Array.isArray(c.ids)) return false;
    const e = c.tid ? sim.ents.get(c.tid) : null;
    if (c.tid && !e) return false;
    const x = e ? e.x : c.x, y = e ? e.y : c.y;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    let z = e ? e.z : c.z;
    if (z === undefined) { const sz = sim.world.standZ(x, y); z = sz >= 0 ? sz : Math.max(0, sim.world.topZ(x, y, 127) + 1); }
    let n = 0;
    for (const id of c.ids) {
      const v = sim.ents.get(id);
      if (!v || v.kind !== "villager" || !isAdult(sim, v) || v.xp) continue;
      const a = v.as;
      if (a && a.task === c.task && a.tid === (c.tid || 0) && a.x === x && a.y === y && !v.order) continue;     // the same assignment again: nothing changes
      v.as = { task: c.task, tid: c.tid || 0, x, y, z, t0: sim.tick, done: a && a.task === c.task ? a.done : 0, go: e ? 0 : 1 };
      v.order = null; v.rp = 1;
      if (e) noteSeen(sim, v, e);
      n++;
    }
    if (n) sim.board.ep++;
    return n > 0;
  },
  order(sim, c) {
    if (ASSIGN_VERBS.includes(c.verb)) return ORDER_COMMANDS.assign(sim, { ids: c.ids, task: c.verb, tid: c.tid, x: c.x, y: c.y, z: c.z });      // crews and old callers: a gather order is an assignment
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
    if (z === undefined) {
      const sz = sim.world.standZ(x, y);
      z = sz >= 0 || c.verb === "dig" ? Math.max(0, sz - (c.verb === "dig" ? 1 : 0)) : Math.max(0, sim.world.topZ(x, y, 127) + 1);      // a cell a tree or rock stands in has no stand level: the one above its ground (9.30: the order's area is read cell by cell)
    }
    let n = 0;
    for (const id of c.ids) {
      const v = sim.ents.get(id);
      if (!v || v.kind !== "villager" || !isAdult(sim, v)) continue;
      const o = v.order;
      if (o && o.verb === c.verb && o.tid === (c.tid || 0) && o.x === x && o.y === y && o.z === z) continue;   // same order again: nothing changes
      v.order = { verb: c.verb, tid: c.tid || 0, x, y, z, t0: sim.tick, done: 0 };
      v.rp = 1;                                                          // 9.30: the order is for this slime: it replans now (no village broadcast)
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
    return !!(v && v.kind === "villager" && splitSlime(sim, v));
  },
  cancel(sim, c) {
    let n = 0;
    for (const v of sim.ents.ofKind("villager")) {
      if (c.ids && !c.ids.includes(v.id)) continue;
      if (v.order || v.as) { v.order = null; delete v.as; n++; v.rp = 1; if (v.job && v.job.c === "order") cancelAction(sim, v); }
    }
    if (n) sim.board.ep++;
    return n > 0;
  },
};
