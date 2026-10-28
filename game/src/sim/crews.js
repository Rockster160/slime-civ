// Crews (GDD §07, §09 R6, S11): the optional NAME of a selection - villagers + a default task. No scoring layer of its own.
//
//   sim.crews = {n, list:[crew]}                          (saved + hashed)
//   crew = {id, name, ids:[villager ids], task, hk, auto, t0}
//   task = null
//        | {t:"order", verb, x,y,z, tid}   given to every member as an ordinary ORDER (class 300); the crew only remembers it
//        | {t:"chore", g}                  g = farm | pen | mine | build | haul: members PREFER that chore group (a bonus inside the standing/demand class)
//        | {t:"keep", item}                members prefer the standing order's jobs (the keep-N for `item`; created with n if it does not exist yet)
//        | {t:"exp", id}                   the crew is out on expedition `id` (expedition.js owns the work; the crew is its named selection)
//   v.cr = the crew a villager belongs to (one crew each). The preference itself is ONE additive term in jobs.js scoreCand (p.crew, next to the
//   preferred-craft term, inside the same within-class clamp); this file only says which candidates match.
//
// Commands: {type:"crew", op:"make", name, ids, hk?} | "rename" {id,name} | "disband" {id} | "add" {id,ids} | "remove" {id,ids}
//           | "task" {id, task} (null clears) | "hotkey" {id, hk 0..9} | "recall" {id} (members drop orders and walk back to camp)
import { isAdult } from "./villager.js";
import { ORDER_COMMANDS } from "./orders.js";
import { ITEMS, stockCapacity } from "./items.js";
import { CAMP } from "./board.js";

export const CHORES = ["farm", "pen", "mine", "build", "haul"];
export const CHORE_LABEL = { farm: "farming", pen: "tending the pens", mine: "mining", build: "building", haul: "hauling" };
export const CREW_PREF = 20;           // points of preference for a candidate that matches the crew's task (a skill preference is 10; the within-class clamp is 45)
export const MAX_CREWS = 24;
export const NAME_MAX = 24;
const ORDER_VERBS = ["forage", "chop", "gather", "haul", "move", "dig", "hunt", "capture"];

export function newCrews() { return { n: 0, list: [] }; }
export const crewOf = (sim, v) => (v.cr ? sim.crews.list.find(c => c.id === v.cr) || null : null);
export const crewById = (sim, id) => sim.crews.list.find(c => c.id === id) || null;
export const crewMembers = (sim, c) => c.ids.map(id => sim.ents.get(id)).filter(Boolean);

/** Which chore group a scored candidate belongs to (null for needs, expeditions, leisure ...). */
export function choreOf(c) {
  if (c.grp === "farm" || c.grp === "pen" || c.grp === "mine") return c.grp;
  if (c.grp === "construct") return "build";
  if (c.kind === "haul" || c.kind === "store") return "haul";
  return null;
}

/** Does candidate `c` match the crew task `t`? Only chore groups and standing orders are preferences; an order task is carried by v.order itself. */
export function taskMatches(t, c) {
  if (!t) return false;
  if (t.t === "chore") return choreOf(c) === t.g;
  if (t.t === "keep") return c.kp === t.item;
  return false;
}

/** The preference a villager's crew gives candidate `c` (0 or CREW_PREF): standing and demand class only, never needs or village emergencies. */
export function crewBonus(task, c) {
  return task && (c.cls === "standing" || c.cls === "demand") && taskMatches(task, c) ? CREW_PREF : 0;
}

/** A readable name of a task: "chop trees near (60, 66)", "farming", "keep 30 log". */
export function taskText(t) {
  if (!t) return "no default task";
  if (t.t === "chore") return CHORE_LABEL[t.g] || t.g;
  if (t.t === "keep") return "keep " + (ITEMS[t.item] ? ITEMS[t.item].label : t.item) + " stocked";
  if (t.t === "exp") return "on an expedition";
  const V = { forage: "forage berries", chop: "chop trees", gather: "gather grass", haul: "haul loose items", move: "go to", dig: "dig", hunt: "hunt hoppers", capture: "capture hoppers" };
  return (V[t.verb] || t.verb) + (t.x !== undefined ? " near (" + t.x + ", " + t.y + ")" : "");
}

function usable(sim, id) { const v = sim.ents.get(id); return v && v.kind === "villager" ? v : null; }
function nameOf(s, def) { const n = String(s === undefined || s === null ? "" : s).trim().slice(0, NAME_MAX); return n || def; }

function release(sim, c) { for (const id of c.ids) { const v = sim.ents.get(id); if (v && v.cr === c.id) delete v.cr; } }

/** Apply a task to the crew's members: an order task becomes ordinary orders (the order command's own rules apply). */
function giveTask(sim, c, task) {
  c.task = task;
  if (task && task.t === "order") ORDER_COMMANDS.order(sim, { ids: c.ids.filter(id => { const v = usable(sim, id); return v && !v.xp; }), verb: task.verb, tid: task.tid || 0, x: task.x, y: task.y, z: task.z });
  sim.board.ep++;                                            // everyone re-plans now: the preference counts at their next decision
}

export const CREW_COMMANDS = {
  crew(sim, c) {
    sim.lastBlocker = "";
    const L = sim.crews, find = () => crewById(sim, c.id);
    if (c.op === "make") {
      const ids = (Array.isArray(c.ids) ? c.ids : []).filter(id => { const v = usable(sim, id); return v && isAdult(sim, v) && !v.poss; });
      if (!ids.length || L.list.length >= MAX_CREWS) return false;
      const id = ++L.n, crew = { id, name: nameOf(c.name, "Crew " + id), ids: [], task: null, hk: 0, auto: c.auto ? 1 : 0, t0: sim.tick };
      for (const vid of ids) {
        const v = sim.ents.get(vid), old = crewOf(sim, v);
        if (old) old.ids = old.ids.filter(q => q !== vid);        // one crew each: moving to a new one leaves the old
        v.cr = id; crew.ids.push(vid);
      }
      if (c.hk >= 1 && c.hk <= 9) { for (const q of L.list) if (q.hk === c.hk) q.hk = 0; crew.hk = c.hk | 0; }
      L.list.push(crew);
      crewTick(sim);                                              // drop crews emptied by the move
      return true;
    }
    const crew = find();
    if (!crew) return false;
    if (c.op === "rename") { crew.name = nameOf(c.name, crew.name); return true; }
    if (c.op === "disband") {
      if (crew.task && crew.task.t === "exp") { /* the expedition stays; it simply loses its name */ }
      release(sim, crew); L.list.splice(L.list.indexOf(crew), 1); sim.board.ep++; return true;
    }
    if (c.op === "add") {
      let n = 0;
      for (const vid of Array.isArray(c.ids) ? c.ids : []) {
        const v = usable(sim, vid);
        if (!v || !isAdult(sim, v) || v.poss || v.cr === crew.id) continue;
        const old = crewOf(sim, v); if (old) old.ids = old.ids.filter(q => q !== vid);
        v.cr = crew.id; crew.ids.push(vid); n++;
        if (crew.task && crew.task.t === "order" && !v.xp) ORDER_COMMANDS.order(sim, { ids: [vid], verb: crew.task.verb, tid: crew.task.tid || 0, x: crew.task.x, y: crew.task.y, z: crew.task.z });
      }
      if (n) { crewTick(sim); sim.board.ep++; }
      return n > 0;
    }
    if (c.op === "remove") {
      const gone = crew.ids.filter(id => (c.ids || []).includes(id));
      for (const id of gone) { const v = sim.ents.get(id); if (v && v.cr === crew.id) delete v.cr; }
      crew.ids = crew.ids.filter(id => !gone.includes(id));
      if (!crew.ids.length) L.list.splice(L.list.indexOf(crew), 1);
      return gone.length > 0;
    }
    if (c.op === "hotkey") {
      const hk = c.hk | 0;
      if (hk < 0 || hk > 9) return false;
      if (hk) for (const q of L.list) if (q.hk === hk) q.hk = 0;
      crew.hk = hk; return true;
    }
    if (c.op === "task") {
      const t = c.task;
      if (t === null || t === undefined) { crew.task = null; sim.board.ep++; return true; }
      if (t.t === "chore" && CHORES.includes(t.g)) { giveTask(sim, crew, { t: "chore", g: t.g }); return true; }
      if (t.t === "keep") {
        if (!ITEMS[t.item]) return false;
        if (!sim.board.keeps.some(k => k.item === t.item)) {       // a crew task may start the standing order it names
          if (!(t.n > 0)) { sim.lastBlocker = "NO_TARGET"; return false; }
          ORDER_COMMANDS.keep(sim, { item: t.item, n: Math.min(Math.floor(t.n), stockCapacity(sim)) });
        }
        giveTask(sim, crew, { t: "keep", item: t.item }); return true;
      }
      if (t.t === "order") {
        if (!ORDER_VERBS.includes(t.verb) || !Number.isInteger(t.x) || !Number.isInteger(t.y)) return false;
        giveTask(sim, crew, { t: "order", verb: t.verb, x: t.x, y: t.y, z: t.z, tid: t.tid || 0 });
        return true;
      }
      return false;
    }
    if (c.op === "recall") {
      const ids = crew.ids.filter(id => { const v = sim.ents.get(id); return v && !v.xp && !v.poss; });
      if (!ids.length) return false;
      ORDER_COMMANDS.cancel(sim, { ids });
      const cp = CAMP(sim.stock);
      ORDER_COMMANDS.order(sim, { ids, verb: "move", x: cp.x, y: cp.y });
      if (crew.task && crew.task.t === "order") crew.task = null;   // its order is gone
      return true;
    }
    return false;
  },
};

/** Every 20 ticks: forget the dead, drop empty crews, and drop a finished expedition task. */
export function crewTick(sim) {
  const L = sim.crews;
  if (!L.list.length) return;
  for (const c of L.list) {
    c.ids = c.ids.filter(id => { const v = sim.ents.get(id); return v && v.cr === c.id; });
    if (c.task && c.task.t === "exp" && !sim.exp.list.some(x => x.id === c.task.id && x.st !== "done")) {
      c.task = null;
      if (c.auto) { release(sim, c); c.ids = []; }                  // an expedition's own crew goes home with it
    }
  }
  const dead = L.list.filter(c => !c.ids.length);
  if (dead.length) { L.list = L.list.filter(c => c.ids.length); sim.board.ep++; }
}
