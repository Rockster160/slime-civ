// Possession (GDD §07, K7/R9) - the PlayerController.
//
// Purpose first: a possessed villager is Steadfast and can reach risks the AI
// avoids. Minimal form: the player moves it one step at a time and interacts with
// what is next to it. NOTHING here moves a villager or changes the world itself:
// the player's intent becomes the SAME Move step and the SAME Task verbs the job
// board builds (chop, pick, cut, pickup, eat, drink, sleep, dig, take, deliver,
// construct, drop, dry), and the one runner in actions.js executes them. Needs
// drain normally and nothing relieves them automatically.
//
// State lives on the villager entity (saved + hashed for free):
//   v.poss = {since, hold:[entityIds], fb:[blocker, tick]}   present only while possessed
//   v.pin  = {dx, dy, tid, verb, x, y, z}                    latest player intent; dx/dy persist until changed
// Commands (all through sim.apply, so they are in the command log):
//   possess {id}   release {}   pinput {id, dx, dy, tid, verb, x, y, z}
import { World, M } from "./world.js";
import { Move } from "./actions.js";
import { Task, HERE, diggable, stockCount } from "./tasks.js";
import { cancelAction, reserve } from "./jobstate.js";
import { INSPIRE } from "./inspire.js";
import { isAdult, ageDays, fitness, maxHp } from "./villager.js";
import { inZone, ITEMS } from "./items.js";
import { costOf, checkPlace, placeGhosts, csiteAt } from "./build.js";
import { log } from "./chronicle.js";

export const COLLAPSE_HP = 0.10;      // below this share of max health the body gives out and the guidance ends

/** The villager being guided, or null. */
export function possessed(sim) {
  for (const v of sim.ents.ofKind("villager")) if (v.poss) return v;
  return null;
}
/**
 * Steadfast (§07, K7): a guided villager does not flee or panic, and may go where autonomy refuses (the thornback's territory,
 * unmapped cave: blocker UNSAFE). jobs.js tests it before it offers the flee job and before it refuses a restricted cell.
 */
export function steadfast(v) { return !!v.poss; }

// ---- commands ----

export const POSSESS_COMMANDS = {
  possess(sim, c) {
    const v = sim.ents.get(c.id);
    if (!v || v.kind !== "villager" || !isAdult(sim, v) || v.poss) return false;
    const old = possessed(sim);
    if (old) stop(sim, old);
    // Reservations the villager held keep for the grace period, then the village takes them back (§09).
    const hold = [];
    if (v.job && v.job.res) for (const id of v.job.res) { const e = sim.ents.get(id); if (e && e.kind !== "site") hold.push(id); }
    if (v.job) v.job.res = v.job.res.filter(id => !hold.includes(id));
    cancelAction(sim, v);
    v.job = null; v.why = null;
    v.poss = { since: sim.tick, hold, fb: ["", 0] };
    v.pin = { dx: 0, dy: 0, tid: 0, verb: "", x: 0, y: 0, z: 0 };
    sim.board.ep++;
    return true;
  },
  release(sim) {
    const v = possessed(sim);
    if (!v) return false;
    stop(sim, v);
    return true;
  },
  pinput(sim, c) {
    const v = sim.ents.get(c.id);
    if (!v || !v.poss) return false;
    const i = (n) => (Number.isInteger(n) ? n : 0);
    v.pin = { dx: Math.sign(i(c.dx)), dy: Math.sign(i(c.dy)), tid: i(c.tid), verb: typeof c.verb === "string" ? c.verb : "", x: i(c.x), y: i(c.y), z: i(c.z) };
    return true;
  },
};

function stop(sim, v) {
  freeHold(sim, v);
  cancelAction(sim, v);
  v.job = null;
  delete v.poss; delete v.pin;
  v.ep = 0;                                   // the job board plans afresh
  sim.board.ep++;
}
function freeHold(sim, v) {
  for (const id of v.poss.hold) { const e = sim.ents.get(id); if (e && e.rv === v.id) e.rv = 0; }
  v.poss.hold = [];
}

// ---- the controller (controller.control calls this each tick for a possessed villager) ----

export function playerStep(sim, v) {
  const p = v.poss, pin = v.pin, t = sim.tick;
  if (p.hold.length) {
    if (t - p.since >= INSPIRE.grace) freeHold(sim, v);
    else if (t % 10 === 0) for (const id of p.hold) { const e = sim.ents.get(id); if (e && e.rv === v.id) e.rt = t; }
  }
  if (pin.tid || pin.verb) {
    const verb = pin.verb, tid = pin.tid, cell = [pin.x, pin.y, pin.z];
    pin.tid = 0; pin.verb = "";
    const r = interact(sim, v, tid, verb, cell);
    if (r.blocker) { p.fb = [r.blocker, t]; return; }
    if (v.action) cancelAction(sim, v);
    v.job = { k: r.task.k, c: "player", key: "player:" + r.task.k, t0: t, tid, g: "", kp: "", res: [] };
    for (const e of r.res) reserve(sim, v, e);
    v.action = r.task;
    return;
  }
  if (pin.dx || pin.dy) {
    if (v.action && v.action.type !== "Move") cancelAction(sim, v);     // pressing a direction stops the work
    if (!v.action) {
      const c = stepCell(sim, v, pin.dx, pin.dy);
      if (c) v.action = Move(c[0], c[1], c[2], [World.idx(c[0], c[1], c[2])], v.mv);
    }
  }
}

/** The neighbouring stand cell one step in (dx,dy): same level, or up/down one (the pathfinder's rule). */
export function stepCell(sim, v, dx, dy) {
  if (dx && dy) dy = 0;                       // cardinal moves only
  const w = sim.world, nx = v.x + dx, ny = v.y + dy;
  if (w.isWalkable(nx, ny, v.z)) return [nx, ny, v.z];
  if (w.isWalkable(nx, ny, v.z + 1) && !w.isSolid(v.x, v.y, v.z + 1)) return [nx, ny, v.z + 1];
  if (w.isWalkable(nx, ny, v.z - 1) && !w.isSolid(nx, ny, v.z)) return [nx, ny, v.z - 1];
  return null;
}

const near1 = (v, e) => Math.abs(e.x - v.x) + Math.abs(e.y - v.y) <= 1 && Math.abs(e.z - v.z) <= 1;
const here = (v) => ({ x: v.x, y: v.y, z: v.z });
const isWaterEdge = (sim, v) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
  sim.world.mat(v.x + dx, v.y + dy, v.z - 1) === M.WATER || sim.world.mat(v.x + dx, v.y + dy, v.z - 2) === M.WATER);

/**
 * Turn an interaction into a Task - the same objects the job board builds. -> {task, res} | {blocker}.
 * `verb` "" = the sensible default for the target (what right-click would order).
 */
export function interact(sim, v, tid, verb, cell) {
  const e = tid ? sim.ents.get(tid) : null;
  const one = (k, step, res = []) => ({ task: Task(k, [step]), res });
  if (verb === "drink") return isWaterEdge(sim, v) ? one("drink", { v: "drink", ...here(v) }) : { blocker: "NO_WATER" };
  if (verb === "drop") return v.carry && inZone(sim.stock, v.x, v.y) ? one("store", { v: "drop", ...here(v) }) : { blocker: "NO_STORAGE" };
  if (verb === "eat") {
    if (v.carry && ITEMS[v.carry.item].food > 0) return one("eat", { v: "eat", src: "carry", ...HERE });
    if (e && e.kind === "plant" && e.species === "berry" && near1(v, e) && e.yield > 0) return one("eat", { v: "eat", src: "bush", tid, ...here(v) });
    if (inZone(sim.stock, v.x, v.y)) return one("eat", { v: "eat", src: "stock", ...here(v) });
    return { blocker: "NO_MATERIAL" };
  }
  if (verb === "sleep") {
    const bed = e && e.kind === "furniture" && e.f === "bed" && near1(v, e) ? e : null;
    if (e && !bed) return { blocker: "TOO_FAR" };
    return one("sleep", { v: "sleep", tid: bed ? bed.id : 0, ...(bed ? { x: bed.x, y: bed.y, z: bed.z } : here(v)) });
  }
  if (verb === "equip") {                       // S8: take the spear (or pick) from the stockpile in hand
    const item = stockCount(sim, "copper_spear") > 0 ? "copper_spear" : "copper_pick";
    return inZone(sim.stock, v.x, v.y) && stockCount(sim, item) > 0 && !v.eq && !v.carry ? one("equip", { v: "equip", item, ...here(v) }) : { blocker: v.eq || v.carry ? "NO_CAPACITY" : stockCount(sim, item) > 0 ? "TOO_FAR" : "NO_MATERIAL" };
  }
  if (verb === "dig") {
    const [cx, cy, cz] = cell;
    if (!diggable(sim, cx, cy, cz)) return { blocker: "GONE" };
    const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cx + dx === v.x && cy + dy === v.y && (cz + 1 === v.z || cz === v.z));
    return adj ? one("dig", { v: "dig", cx, cy, cz, ...here(v) }) : { blocker: "TOO_FAR" };
  }
  if (verb === "torch" || verb === "lamp" || verb === "support") {      // S12: light and timber in the dark, through the same ghost pipeline the village builds from
    const [cx, cy, cz] = cell, w = verb === "support" ? "wall" : verb, m = verb === "support" ? "support" : "";
    let site = csiteAt(sim, cx, cy, cz, w);
    if (!(site && site.m === m)) {
      const why = checkPlace(sim, w, m, cx, cy, cz);
      if (why) return { blocker: why === "unknown" ? "UNKNOWN_CRAFT" : "BLOCKED" };
      placeGhosts(sim, [{ w, m, x: cx, y: cy, z: cz }], ++sim.board.sg);
      site = csiteAt(sim, cx, cy, cz, w);
    }
    return site ? siteTask(sim, v, site) : { blocker: "BLOCKED" };
  }
  if (!e) return { blocker: "GONE" };
  if (e.kind === "fauna") return near1(v, e) ? one("strike", { v: "strike", tid, ...here(v) }) : { blocker: "TOO_FAR" };     // S8: the shared melee verb
  if (e.kind === "plant") {
    if (!near1(v, e)) return { blocker: "TOO_FAR" };
    if (e.species === "tree") return one("chop", { v: "chop", tid, ...here(v) }, [e]);
    if (e.species === "berry") return one("forage", { v: "pick", tid, ...here(v) }, [e]);
    if (e.species === "tuft") return one("cut", { v: "cut", tid, ...here(v) }, [e]);
    return { blocker: "GONE" };
  }
  if (e.kind === "item") {
    if (!near1(v, e)) return { blocker: "TOO_FAR" };
    if (!inZone(sim.stock, e.x, e.y)) return one("haul", { v: "pickup", tid, x: e.x, y: e.y, z: e.z }, [e]);
    return ITEMS[e.item].food > 0 ? interact(sim, v, 0, "eat", cell) : { blocker: "NO_MATERIAL" };   // stock: only food is for the taking by hand
  }
  if (e.kind === "csite") return siteTask(sim, v, e);
  if (e.kind === "furniture") {
    if (!near1(v, e)) return { blocker: "TOO_FAR" };
    if (e.f === "bed") return interact(sim, v, tid, "sleep", cell);
    if (e.f === "rack" && v.carry && v.carry.item === "berry" && v.carry.n >= 5) return one("dry", { v: "dry", tid, x: e.x, y: e.y, z: e.z }, [e]);
  }
  return { blocker: "GONE" };
}

/** A planned piece: deliver what I carry if it fits, take from the stockpile if I stand in it, then finish it. */
function siteTask(sim, v, s) {
  const dx = Math.abs(s.x - v.x), dy = Math.abs(s.y - v.y);
  if (dx > 1 || dy > 1 || Math.abs(s.z - v.z) > 1 || (s.w === "wall" && dx === 0 && dy === 0)) return { blocker: "TOO_FAR" };
  const cost = costOf(s.w, s.m), need = Math.max(0, cost.n - s.got);
  const steps = [], at = here(v);
  const holds = need === 0 || (v.carry && v.carry.item === cost.item && v.carry.n >= need);
  if (!holds) {
    if (v.carry) return { blocker: "NO_CAPACITY" };
    if (!inZone(sim.stock, v.x, v.y) || stockCount(sim, cost.item) < need) return { blocker: "NO_MATERIAL" };
    steps.push({ v: "take", item: cost.item, n: need, ...at });
  }
  if (need > 0) steps.push({ v: "deliver", tid: s.id, item: cost.item, n: need, ...at });
  steps.push({ v: "construct", tid: s.id, dur: cost.dur, sk: s.w === "bed" || s.w === "rack" || s.w === "hearth" ? "craft" : "build", ...at });
  return { task: Task(s.w === "bed" || s.w === "rack" || s.w === "hearth" ? "craft_site" : "build_site", steps), res: [s] };
}

/** Called after needs update: a body that gives out ends the guidance (§07 collapse). Death removes the entity, which ends it too. */
export function collapseCheck(sim, v) {
  if (!v.poss) return;
  const mh = maxHp(v, fitness(v, ageDays(sim, v)));
  if (v.hp < COLLAPSE_HP * mh) {
    log(sim, "DISASTER", v.name + " collapsed; the guiding spirit let go.", [v.id], {}, 1);
    stop(sim, v);
  }
}
