// Expeditions (GDD §13.4, §13.5; S8): ONE type, "find X", with the two-predicate recall rule and a manual Recall.
//
//   sim.exp = {n, list:[expedition]}          (saved + hashed)
//   expedition = {id, ids:[villager ids], item (asked: flint|clay|malachite|any), want (resolved), did (the seek designation), t0, deadline,
//                 st "work" | "home" | "done", why (recall reason), t1, got, depth, stall (a blocker enum or ""), s0 (stock at start), rep (report text)}
//
// A crew is a named selection (v.xp = expedition id on each member). While st is "work" its members run the seek designation as an
// ORDER-class job (jobs.js genMine(ctx, d)): S6's seek and mine logic, restricted to this crew and to rock at least EXP_DEPTH under the surface
// ("dig toward material X to depth N"), which also reveals the fog and puts new things seen into the Curiosities. They are ordinary
// autonomous villagers: they flee the thornback (fear > 0.6) and refuse its territory (UNSAFE), so they carry on around it.
//
// Recall (§13.4): turn back when the target is found (the sample is in hand) or when a member is wounded below half, or food or time runs
// out - plus the player's Recall button. In "home" phase they carry what lay loose at the dig back to the stockpile and walk to camp.
// Autonomy never starts an expedition (R8): only the "expedition" command does.
import { MINE_COMMANDS, ITEM_MAT, SEEK_ITEMS } from "./mine.js";
import { isAdult, maxHp, fitness, ageDays } from "./villager.js";
import { survey, ITEMS } from "./items.js";
import { log } from "./chronicle.js";
import { CAMP } from "./board.js";
import { cancelAction } from "./jobstate.js";
import { DUR_DAY } from "./clock.js";
import { World } from "./world.js";
import { crewById, crewOf, CREW_COMMANDS } from "./crews.js";
import { delveTarget, delveStep, finishDelve, DELVE_TIME, DELVE_LIGHT } from "./delve.js";

export const EXP_ITEMS = [...SEEK_ITEMS, "any"];
export const EXP_N = 2;              // units to bring back: one cell's worth (a sample; the player can send them again for more)
export const EXP_DEPTH = 3;          // the find must lie at least this far below the surface (a non-surface resource)
export const EXP_TIME = 4500;     // time runs out: 4500 ticks [225 s at 1x]. S18b: kept as ticks (it was 2.5 days of 1800), the walk and the pack are real-time; the food packed is per game day, so it lasts longer
export const RECALL_HP = 0.5;        // anyone below this share of their health -> turn back
export const RECALL_FOOD = 0.3;      // anyone this hungry -> turn back (food at half the provisions, §13.4, in the village's terms)
export const HOME_TIME = 1500;       // ticks to get back before the report is written anyway
const HOME_R = 7;
const ANCHORS = [[0, 0], [8, 6], [-8, -6]];

export function newExp() { return { n: 0, list: [] }; }
export const activeExp = (sim) => sim.exp.list.filter(x => x.st !== "done");
export function expOf(sim, v) { return v.xp ? sim.exp.list.find(x => x.id === v.xp && x.st !== "done") || null : null; }
export const WANT_LABEL = { flint: "flint", clay: "clay", malachite: "malachite", any: "anything new" };

/** "Anything new": the ore the village has the least of (ties in table order). */
export function newestWant(sim) {
  const sv = survey(sim);
  let best = SEEK_ITEMS[0], bn = 1e9;
  for (const k of SEEK_ITEMS) { const n = sv.stock[k] + sv.loose[k] + sv.carried[k]; if (n < bn) { bn = n; best = k; } }
  return best;
}

export const EXP_COMMANDS = {
  /**
   * {type:"expedition", op:"start", ids:[...], item: flint|clay|malachite|any}   op "recall": {id?} (all active if omitted)
   * A rejection leaves a blocker enum in sim.lastBlocker.
   */
  expedition(sim, c) {
    sim.lastBlocker = "";
    const fail = (b) => { sim.lastBlocker = b; return false; };
    const e = sim.exp;
    if (c.op === "recall") {
      let n = 0;
      for (const x of activeExp(sim)) if ((c.id === undefined || c.id === x.id) && (c.crew === undefined || c.crew === x.cr) && x.st === "work") { goHome(sim, x, "recall"); n++; }
      return n > 0 || fail("NO_TARGET");
    }
    if (c.op !== "start") return fail("NO_TARGET");
    if (c.kind === "delve") return startDelve(sim, c, fail);
    if (!EXP_ITEMS.includes(c.item)) return fail("UNKNOWN_ITEM");
    const cw = c.crew ? crewById(sim, c.crew) : null;               // S11: "send this crew": its members are the party
    const ids = Array.isArray(cw ? cw.ids : c.ids) ? (cw ? cw.ids : c.ids).filter(id => { const v = sim.ents.get(id); return v && v.kind === "villager" && isAdult(sim, v) && !v.xp && !v.poss; }) : [];
    if (!ids.length) return fail("NO_TARGET");
    const want = c.item === "any" ? newestWant(sim) : c.item;
    const id = e.n + 1, dids = [], cp = CAMP(sim.stock);
    for (let k = 0; k < Math.min(ids.length, ANCHORS.length); k++) {          // one search per member (up to three), each from its own side of camp: a single-file tunnel cannot be dug by three at once
      if (MINE_COMMANDS.mine(sim, { op: "seek", item: want, n: EXP_N, exp: id, deep: EXP_DEPTH, x: cp.x + ANCHORS[k][0], y: cp.y + ANCHORS[k][1] })) dids.push(sim.mine.list[sim.mine.list.length - 1].id);
    }
    if (!dids.length) return fail(sim.lastBlocker || "NO_ROUTE");
    e.n++;
    const x = { id, ids: ids.slice(), item: c.item, want, did: dids[0], dids, t0: sim.tick, deadline: sim.tick + EXP_TIME, st: "work", why: "", t1: 0, got: 0, depth: 0, stall: "", s0: survey(sim).stock[want], k0: {}, rep: "" };
    for (const m of SEEK_ITEMS) x.k0[m] = (sim.seen.known[ITEM_MAT[m]] || []).length;
    e.list.push(x);
    linkCrew(sim, x, cw);
    for (const vid of ids) { const v = sim.ents.get(vid); v.xp = id; v.order = null; cancelAction(sim, v); v.job = null; v.rp = 0; v.ep = 0; }
    sim.board.ep++;
    log(sim, "MILESTONE", "An expedition set out to find " + WANT_LABEL[c.item] + (c.item === "any" ? " (" + want + ")" : "") + ": " + ids.map(i => sim.ents.get(i).name).join(", ") + ".", ids, { exp: id, want }, 1);
    return true;
  },
};

/** 7.23: a delve ({kind:"delve", crew|ids, core?}): the party is sent into a labyrinth (delve.js drives it). */
function startDelve(sim, c, fail) {
  const cw = c.crew ? crewById(sim, c.crew) : null;
  const ids = Array.isArray(cw ? cw.ids : c.ids) ? (cw ? cw.ids : c.ids).filter(id => { const v = sim.ents.get(id); return v && v.kind === "villager" && isAdult(sim, v) && !v.xp && !v.poss; }) : [];
  if (!ids.length) return fail("NO_TARGET");
  const tg = delveTarget(sim, c, sim.ents.get(ids[0]));
  if (!tg) return fail("NO_DUNGEON");
  const id = sim.exp.n + 1;
  const x = { id, kind: "delve", ids: ids.slice(), item: "delve", want: "the labyrinth", did: 0, dids: [], t0: sim.tick, deadline: sim.tick + DELVE_TIME, st: "work", why: "", t1: 0, got: 0, depth: 0, stall: "", s0: 0, k0: {}, rep: "",
    core: tg.core, name: tg.name, ent: tg.ent, light: DELVE_LIGHT, vis: [], skip: [], pos: {}, cw: {}, dp: {}, dn: [], idle: 0, loot: {}, opened: 0, disarmed: 0, rooms: tg.dun.rooms.length, mapped: 0 };
  sim.exp.n++; sim.exp.list.push(x);
  linkCrew(sim, x, cw);
  for (const vid of ids) { const v = sim.ents.get(vid); v.xp = id; v.order = null; cancelAction(sim, v); v.job = null; v.rp = 0; v.ep = 0; v.br = 1; }
  sim.board.ep++;
  log(sim, "MILESTONE", "A party set out to delve into the labyrinth of " + tg.name + ": " + ids.map(i => sim.ents.get(i).name).join(", ") + ".", ids, { exp: id, core: tg.core }, 1);
  return true;
}

function goHome(sim, x, why) {
  x.st = "home"; x.why = why; x.t1 = sim.tick;
  for (const id of x.ids) { const v = sim.ents.get(id); if (v) { v.rp = 1; if (x.kind === "delve") { v.order = null; cancelAction(sim, v); } } }
  sim.board.ep++;
  const text = { found: "found what they came for", nothing: "found nothing", wounded: "someone was badly hurt", food: "someone ran short of food", time: "time ran out", recall: "the player called them back", lost: "the crew was lost", light: "the brands burned low", mapped: "the labyrinth was mapped" }[why] || why;
  log(sim, "MILESTONE", (x.kind === "delve" ? "The delve into the labyrinth of " + x.name : "The expedition for " + x.want) + " turned back: " + text + ".", x.ids, { exp: x.id, why }, 1);
}

/** Every 20 ticks (just before mineTick): drop the dead, read the search, apply the recall rule, write the stall summary, notice new things. */
export function expeditionTick(sim) {
  if (!sim.exp.list.length) return;
  for (const x of sim.exp.list) {
    if (x.st === "done") continue;
    const dead = x.ids.filter(id => !sim.ents.get(id));
    if (dead.length) x.lost = (x.lost || 0) + dead.length;
    x.ids = x.ids.filter(id => sim.ents.get(id));
    const vs = x.ids.map(id => sim.ents.get(id));
    if (!vs.length) { x.why = "lost"; finish(sim, x); continue; }
    if (x.kind === "delve") {                                           // 7.23: a delve is driven by orders, not a search (delve.js)
      const r = delveStep(sim, x, vs);
      if (x.st === "work" && r) goHome(sim, x, r); else if (x.st === "home" && r === "done") finish(sim, x);
      continue;
    }
    const ds = x.dids.map(i => sim.mine.list.find(q => q.id === i)).filter(Boolean);
    x.got = Math.max(x.got, ...ds.map(q => q.got)); x.depth = Math.max(x.depth, ...ds.map(q => q.depth || 0));
    const won = ds.find(q => q.done && !q.fail);
    noticeNew(sim, x, vs);
    if (x.st === "work") {
      x.stall = "";
      if (ds.length && ds.every(q => !q.q.length && !q.done)) x.stall = ds.find(q => q.why) ? ds.find(q => q.why).why : "NO_TARGET";
      if (vs.some(v => (v.fear || 0) > 0.6)) x.stall = "UNSAFE";
      let why = "";
      if (won || !ds.length) why = "found";
      else if (ds.every(q => q.done)) why = "nothing";
      else if (vs.some(v => v.hp < RECALL_HP * maxHp(v, fitness(v, ageDays(sim, v))))) why = "wounded";
      else if (vs.some(v => v.hunger < RECALL_FOOD)) why = "food";
      else if (sim.tick >= x.deadline) why = "time";
      if (why) goHome(sim, x, why);
    } else {
      x.stall = "";
      const c = CAMP(sim.stock);
      const back = vs.every(v => !v.carry && Math.abs(v.x - c.x) <= HOME_R && Math.abs(v.y - c.y) <= HOME_R);
      const loose = looseTarget(sim, x, vs[0]);
      if ((back && !loose) || sim.tick - x.t1 > HOME_TIME) finish(sim, x);
    }
  }
}

/** Ore the crew dug that lies loose somewhere out of the stockpile, nearest to `v` (for the carry-home leg). Resolved by the jobs, read here. */
export function looseTarget(sim, x, v) {
  let best = null, bd = 1e9;
  const z = sim.stock;
  for (const s of sim.ents.ofKind("item")) {
    if (s.item !== x.want || (s.x >= z.x0 && s.x <= z.x1 && s.y >= z.y0 && s.y <= z.y1) || s.rv) continue;
    const d = Math.abs(s.x - v.x) + Math.abs(s.y - v.y) + 2 * Math.abs(s.z - v.z);
    if (d < bd && d <= 60) { bd = d; best = s; }
  }
  return best;
}

function finish(sim, x) {
  if (x.kind === "delve") { finishDelve(sim, x); return; }
  const have = survey(sim).stock[x.want], brought = Math.max(0, have - x.s0);
  x.st = "done";
  const names = x.ids.map(id => sim.ents.get(id)).filter(Boolean).map(v => v.name);
  x.rep = "The expedition for " + x.want + " is over (" + ({ found: "found it", nothing: "found nothing", wounded: "turned back, someone hurt", food: "turned back, short of food", time: "out of time", recall: "recalled", lost: "lost" }[x.why] || x.why) + "): "
    + (brought ? brought + " " + (ITEMS[x.want].label) + " brought home" : "nothing brought home") + (x.depth ? ", found " + x.depth + " levels down" : "") + (x.lost ? ". Lost: " + x.lost + (x.lost === 1 ? " villager" : " villagers") : "") + (names.length ? ". Back: " + names.join(", ") : "") + ".";
  log(sim, "MILESTONE", x.rep, x.ids, { exp: x.id, brought, lost: x.lost || 0 }, 2);
  for (const id of x.ids) { const v = sim.ents.get(id); if (v) { delete v.xp; v.rp = 1; } }
  sim.mine.list = sim.mine.list.filter(q => !x.dids.includes(q.id));
  sim.board.ep++;
  // keep only the latest finished expedition for the report card
  const done = sim.exp.list.filter(q => q.st === "done");
  while (done.length > 1) sim.exp.list.splice(sim.exp.list.indexOf(done.shift()), 1);
}

/** New things seen in the wild enter the Curiosities (R27): ore nobody had seen before, found by a crew member. */
const ORE_TEXT = {
  malachite: "Green-stained rock deep underground. Where there is green stain there may be something worth smelting.",
  flint: "Dark nodules in the rock down here, hard and edged. Good for edges.",
  clay: "Grey-red mud in the bank that holds a shape when squeezed.",
};
function noticeNew(sim, x, vs) {
  const d = sim.disc;
  for (const m of SEEK_ITEMS) {
    const known = sim.seen.known[ITEM_MAT[m]] || [], id = "wild:" + m;
    if (known.length <= x.k0[m] || d.curio.some(c => c.id === id)) continue;
    const [cx, cy, cz] = World.xyz(known[known.length - 1]);
    d.curio.push({ id, row: "", craft: "", wild: 1, t: sim.tick, x: cx, y: cy, z: cz, text: ORE_TEXT[m] });
  }
}

/** S11: an expedition IS a crew with an expedition task (R6: "five on lumber" and an expedition party are one object). Use the crew sent, else the one all members share, else name a new one. */
function linkCrew(sim, x, cw) {
  if (!cw) {
    const first = sim.ents.get(x.ids[0]), shared = first && crewOf(sim, first);
    if (shared && x.ids.every(id => sim.ents.get(id).cr === shared.id)) cw = shared;
    else if (x.ids.every(id => !sim.ents.get(id).cr)) {
      CREW_COMMANDS.crew(sim, { op: "make", name: "Expedition " + x.id, ids: x.ids, auto: 1 });
      cw = crewById(sim, sim.crews.n);
    }
  }
  if (!cw) return;
  cw.task = { t: "exp", id: x.id }; x.cr = cw.id;
}
