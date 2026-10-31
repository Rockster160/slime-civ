// The job board (GDD §09). One score pass produces BOTH the choice and the
// explanation (v.why), so the Why panel cannot drift from behaviour.
//
//   score  = classBase + clamp(within, -45, +45)
//   within = 30*urgency + 60*skillFit + 10*proximity - pathCost + preferred + temper - switchCost
//
// Classes, high to low: personal critical need 400*u > village critical 350+50*u_v
// > player order 300 > standing order (and jobs derived from it) 200 > village
// demand 100 > leisure 0. Every candidate that cannot run carries a blocker
// enum (build plan rule 4); the top 3 rejected alternatives are kept on the villager.
//
// Villagers plan when idle, on a 200-tick stagger, and at once when the board's
// epoch changes (a critical flag flips, an order arrives) or a personal need
// turns urgent. The job in progress is scored like any other candidate (no
// switch cost for itself), so "keep going" and "switch" are one comparison.
import { DUR_DAY } from "./clock.js";
import { fnv1aStr } from "./hash.js";
import { mix32 } from "./rng.js";
import { clamp, dist3, r1 } from "./util.js";
import { World } from "./world.js";
import { Wander } from "./actions.js";
import { Task, HERE } from "./tasks.js";
import { berrySeason, isNight, tempAt, winterAhead } from "./season.js";
import { readyFrom, standCells, costOf, TIER, UNBUILD_DUR, STATIONS } from "./build.js";
import { RECIPES, missing, loadedFor, heatOk, JAR_CAP } from "./craft.js";
import { dryAir } from "./depth.js";
import { diggable, diggableMarked, toolNeeded } from "./dig.js";
import { DIG } from "./dig.js";
import { PICKS, bestPick } from "./gear.js";
import { standsFor } from "./mine.js";
import { occupants } from "./rooms.js";
import { urgency, SOFT, isAdult, geneMul } from "./villager.js";
import { level, preferred } from "./skills.js";
import { SOC_BONUS, SOC_R } from "./bonds.js";
import { ITEMS, inStore, carryRoom, carryLoad, carryCap, storeCell, survey } from "./items.js";
import { reserve, reservedByOther, cancelAction } from "./jobstate.js";
import { village, findSite, waterEdges, CAMP, BED_COST, RACK_COST } from "./board.js";
import { fireWanted, FUEL_LOW, FUEL_ITEMS } from "./fire.js";
import { can, pressure } from "./knowledge.js";
import { steadfast } from "./possess.js";
import { restricted, unsafeTask } from "./lair.js";
import { seenTrapNear } from "./traps.js";
import { FAUNA, FEAR_AT, FEAR_STOP, threatOf, near1 } from "./fauna.js";
import { expOf, looseTarget } from "./expedition.js";
import { delving } from "./delve.js";
import { crewOf, crewBonus } from "./crews.js";
import { maxHp, fitness, ageDays } from "./villager.js";
import { genFarm, genPens, captureMk } from "./farmjobs.js";
import { sickOnes, SICK_WORK } from "./disease.js";
import { freeWagon, wagonReady, WAGON, WAGON_FAR, BATCH_R, BATCH_MAX } from "./wagon.js";
import { kitchens, cookable, DISHES } from "./kitchen.js";
import { genExplore } from "./explore.js";
import { memBias, candSubjects } from "./memory.js";
import { entsOf, noPlace, stored, waterNear } from "./know.js";
import { flags as belFlags, nearestFact } from "./belief.js";
import { clearTargets, GRUB_DUR, CLEAR_SEE, centreOf } from "./clear.js";
import { genBoard, genLook, genRequests, noteShortages, digGate, digCovers } from "./boardjobs.js";
import { demandOf, foodCap, bedCap, shareCap, pressed as shortOf, handsOn, tally, HAND_SHARE, KEEP_SHARE, CRIT_SHARE } from "./local.js";
import { guard } from "./entities.js";
import { tinkerCandidates, pickCandidate, itchAt, askActive, cdKey, VERB_DUR, TINKER_WORK } from "./discovery.js";

export const GATHER_FIT = 15;       // gathering is skill-less (Appendix B) but everyone is a practised forager: a flat fit worth a 0.25 skill, nudged by speed (D21); forage, gather and sun-drying use it
export const COMMIT = 200;          // ticks a job is protected from switching (§09)
export const SWITCH_COST = 25;
export const WITHIN_CLAMP = 45;
export const SLEEP_DONE = 0.75;      // a started sleep is protected from orders until energy reaches this
const SLEEP_COMMIT = 0.9;
export const FAR_SLEEP = 24;        // beyond this many cells from the bed, an exhausted villager sleeps on the spot
export const MAX_SCAN = 60;         // cells; proximity = 1 - dist/MAX_SCAN
export const TEMPER_SPREAD = 0.2;   // stable lifelong job lean, +/-20% (§08)
export const DIG_AREA = 2;          // a dig order covers a 5x5 patch of columns
export const ORDER_AREA = 10;       // an order covers targets within this many cells of where it was given
// When several needs saturate at u=1 they would tie at 400; break the tie by what kills fastest (thirst, hunger, cold, then sleep).
const NEED_RANK = { flee: -1, defend: 0, drink: 0, eat: 1, huddle: 2, tend_fire: 1.5, sleep: 3, leisure: 4, mend: 5, convalesce: 6 };
const CHILL = 0.55;                // below this air warmth, villagers prefer a warm room to a nearer bed (§08 shelter)
const MOOD_CAP = 349;              // above any order (<= 345), below village-critical (>= 350)
const VCRIT_CAP = 395;              // a saturated personal need (400 - rank) always outranks village-critical (priority order, §09)
const BASE = { need: 0, vcrit: 0, order: 300, standing: 200, demand: 100, leisure: 0 };
const KIND_HASH = {};
const kh = (k) => KIND_HASH[k] ?? (KIND_HASH[k] = fnv1aStr(k));

// ---- context ---------------------------------------------------------------

function makeCtx(sim, v, dry) {
  let w = null;
  if (belFlags.off) {                                                 // the telepathic baseline: every other villager's job, a global O(V) tally per plan
    w = {};
    for (const o of sim.ents.ofKind("villager")) {
      if (o === v || !o.job || !o.action) continue;
      const a = o.job.c + ":" + o.job.g;
      w[a] = (w[a] || 0) + 1;
    }
  }
  const ctx = {
    sim, v, dry, t: sim.tick, b: sim.board, vl: belFlags.off ? village(sim) : null, sv: survey(sim), night: isNight(sim.tick),
    cur: v.job && v.action ? v.job : null, w, pref: preferred(v), cands: [], near: null,
    ctask: v.cr ? (crewOf(sim, v) || {}).task || null : null,         // S11: the crew's default task (a preference, never a class of its own)
    soc: company(sim, v),
    sick: sim.dp && sim.dp.on ? sickOnes(sim) : null,                   // S14: the sick, for the avoid-the-sick bias and the nursing job
  };
  if (!belFlags.off) {                                                // 9.29: the beds and racks a planner may use are the ones this slime believes in. 9.30: no village counts at all (no adults, n, need, sites)
    ctx.vl = { get beds() { return entsOf(ctx, "bed"); }, get racks() { return entsOf(ctx, "furn:rack"); } };
  }
  return ctx;
}
/** S13: friends, partners and rivals who are working right now, with where they are: [{x,y,z,s:+1|-1,id}]. Empty for most villagers. */
function company(sim, v) {
  if (!v.rel || !v.rel.length) return null;
  const out = [];
  for (const r of v.rel) {
    if (r.k === "mentor") continue;
    const o = sim.ents.get(r.o);
    if (o && o.job && o.action && o.slp === 0 && o.job.c !== "leisure") out.push({ x: o.x, y: o.y, z: o.z, s: r.k === "rival" ? -1 : 1, id: o.id });
  }
  return out.length ? out : null;
}
/** S13: +SOC_BONUS for a job next to a friend or partner at work, -SOC_BONUS next to a rival (never both: the sum is capped at +-SOC_BONUS). Needs and village emergencies do not take company into account. */
function socBonus(ctx, c) {
  if (!ctx.soc || !c.tid || c.cls === "need" || c.cls === "vcrit") return 0;
  const e = ctx.sim.ents.get(c.tid);
  if (!e || e.x === undefined) return 0;
  let s = 0;
  for (const o of ctx.soc) if (Math.abs(o.x - e.x) <= SOC_R && Math.abs(o.y - e.y) <= SOC_R && Math.abs(o.z - e.z) <= 2) s += o.s;
  return clamp(s, -1, 1) * SOC_BONUS;
}
const add = (ctx, c) => { c.key = c.key || c.kind + ":" + (c.tid || 0); ctx.cands.push(c); return c; };
const isBad = (v, id, t) => { for (const b of v.bad) if (b[0] === id && b[1] > t) return true; return false; };
const idx = (e) => World.idx(e.x, e.y, e.z);

/** Nearest valid berry / tuft / tuber / tree among the patches this villager believes in (9.29; with beliefs off, among every plant in the world as before). */
function nearPlants(ctx) {
  if (ctx.near) return ctx.near;
  const { sim, v, t } = ctx, season = berrySeason(t);
  const near = { berry: null, tuft: null, tree: null, tuber: null, rsv: { berry: 0, tuft: 0, tree: 0, tuber: 0 } };
  const best = { berry: 1e9, tuft: 1e9, tree: 1e9, tuber: 1e9 };
  for (const plants of [entsOf(ctx, "food"), entsOf(ctx, "tree")]) for (let i = 0; i < plants.length; i++) {
    const p = plants[i], sp = p.species === "berry" ? "berry" : p.species === "tuft" ? "tuft" : p.species === "tree" ? "tree" : p.species === "tuber" ? "tuber" : null;
    if (!sp) continue;
    if (p.burn) continue;                                        // alight: nobody chops it
    if (sp === "berry" && (!season || p.yield <= 0)) continue;
    if ((sp === "tuft" || sp === "tuber") && p.yield <= 0) continue;
    let d = dist3(v.x, v.y, v.z, p.x, p.y, p.z);
    if (d > MAX_SCAN || d >= best[sp] + (p.rv === v.id ? 1000 : 0)) continue;
    if (reservedByOther(sim, p, v.id)) { near.rsv[sp]++; continue; }
    if (isBad(v, p.id, t)) continue;
    if (p.rv === v.id) d -= 1000;                      // keep working the plant I hold
    if (d < best[sp]) { best[sp] = d; near[sp] = p; }
  }
  return (ctx.near = near);
}
const dTo = (ctx, e) => dist3(ctx.v.x, ctx.v.y, ctx.v.z, e.x, e.y, e.z);

/** A cell to stand on to use entity e: its own cell, or (trees) a free neighbour. */
function standFor(ctx, e) {
  const w = ctx.sim.world, v = ctx.v;
  if (e.kind !== "plant" || e.species !== "tree") {
    const own = w.isWalkable(e.x, e.y, e.z) ? { x: e.x, y: e.y, z: e.z } : null;
    if (own && (e.kind !== "item" || reach(ctx, own))) return own;
    if (e.kind !== "item") return null;
    // S16: ore dug out of a wall one level below where the digger stood falls into a hole nobody can step into (the cell above it is still rock): lift it from beside the hole
    let nb = null, nd = 1e9;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dz of [0, 1, -1]) {
      const st = { x: e.x + dx, y: e.y + dy, z: e.z + dz };
      if (!w.isWalkable(st.x, st.y, st.z) || !reach(ctx, st)) continue;
      const d = dist3(v.x, v.y, v.z, st.x, st.y, st.z);
      if (d < nd) { nd = d; nb = st; }
    }
    return nb;
  }
  let best = null, bd = 1e9;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (const dz of [0, 1, -1]) {
      const x = e.x + dx, y = e.y + dy, z = e.z + dz;
      if (!w.isWalkable(x, y, z)) continue;
      const d = dist3(v.x, v.y, v.z, x, y, z);
      if (d < bd) { bd = d; best = { x, y, z }; }
    }
  }
  return best;
}
function reach(ctx, st) {
  const v = ctx.v;
  if (v.x === st.x && v.y === st.y && v.z === st.z) return true;
  return ctx.sim.path.find(World.idx(v.x, v.y, v.z), World.idx(st.x, st.y, st.z)).ok;
}
/** mk() for the common case: one verb on one target entity. */
function oneStep(kind, verb, e, extra) {
  return (ctx) => {
    const st = standFor(ctx, e);
    if (!st || !reach(ctx, st)) return { blocker: "NO_PATH" };
    return { task: Task(kind, [{ v: verb, tid: e.id, ...st, ...extra }]), res: [e] };
  };
}
function capped(ctx, cls, grp, cap) {
  if (!belFlags.off && ctx.cur && ctx.cur.c === cls && ctx.cur.g === grp) return false;      // 9.30: a slime already at this work is never pushed off it by the hands it sees (the cap only turns newcomers away)
  return handsOn(ctx, cls + ":" + grp) >= cap;
}
/** 9.30: loose stacks of an item this slime believes in (the old global `sv.loose` gate) and what it holds of an item: the yard, those stacks, its own hands. */
const looseOf = (ctx, item) => { if (belFlags.off) return ctx.sv.loose[item]; let n = 0; for (const s of entsOf(ctx, "loose")) if (s.item === item) n += s.n; return n; };
const heldOf = (ctx, item) => ctx.sv.stock[item] + looseOf(ctx, item) + (belFlags.off ? ctx.sv.carried[item] : ctx.v.carry && ctx.v.carry.item === item ? ctx.v.carry.n : 0);

// ---- personal needs (class 400*u) -------------------------------------------

function nearestFoodStack(ctx) {
  let best = null, bd = 1e9;
  const items = stored(ctx.sim);                                  // the stockpile: relaxed (OD-56)
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    if (ITEMS[s.item].food === 0) continue;
    const d = dTo(ctx, s);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function genNeeds(ctx) {
  const { v, sim } = ctx;
  const uh = urgency(v.hunger, ...SOFT.hunger);
  if (uh > 0) {
    const c = { kind: "eat", cls: "need", u: uh, grp: "need", d: 0 };
    if (v.carry && ITEMS[v.carry.item].food > 0) {
      c.tid = 0; c.key = "eat:carry"; c.mk = () => ({ task: Task("eat", [{ v: "eat", src: "carry", ...HERE }]), res: [] });
    } else {
      const stack = nearestFoodStack(ctx), bush = nearPlants(ctx).berry;
      const ds = stack ? dTo(ctx, stack) : 1e9, db = bush ? dTo(ctx, bush) : 1e9;
      if (stack && ds <= db + 4) {
        c.d = ds; c.key = "eat:stock";
        c.mk = () => {
          const st = { x: stack.x, y: stack.y, z: stack.z };
          return reach(ctx, st) ? { task: Task("eat", [{ v: "eat", src: "stock", ...st }]), res: [] } : { blocker: "NO_PATH" };
        };
      } else if (bush) {
        c.d = db; c.tid = bush.id; c.mk = oneStep("eat", "eat", bush, { src: "bush" });
      } else { c.blocker = noPlace(ctx, "food"); c.mk = () => ({ blocker: c.blocker }); }
    }
    add(ctx, c);
  }
  const ut = urgency(v.thirst, ...SOFT.thirst);
  if (ut > 0) {
    let best = null, bd = 1e9;
    for (const e of waterNear(ctx, waterEdges(sim))) { const d = dist3(v.x, v.y, v.z, e[0], e[1], e[2]); if (d < bd && !isBad(v, e[0] * 1000 + e[1], ctx.t)) { bd = d; best = e; } }
    let jar = null, jd = 1e9;                                       // S7b: a water jar with water in it, nearer than the stream by a few steps, saves the walk
    for (const f of entsOf(ctx, "furn:waterjar")) if (f.fill >= 6 && !isBad(v, f.id, ctx.t)) { const d = dTo(ctx, f); if (d < jd) { jd = d; jar = f; } }
    const c = { kind: "drink", cls: "need", u: ut, grp: "need", d: bd, key: "drink:0" };
    if (jar && (!best || jd + 6 < bd)) {
      c.d = jd; c.tid = jar.id; c.key = "drink:jar";
      c.mk = () => {
        const st = standNear(ctx, jar);
        if (!st || !reach(ctx, st)) { v.bad.push([jar.id, ctx.t + 600]); return { blocker: "NO_PATH" }; }
        return { task: Task("drink", [{ v: "sip", tid: jar.id, ...st }]), res: [] };
      };
    } else if (!best) { c.blocker = belFlags.off || waterNear(ctx, waterEdges(sim)).length ? "NO_WATER" : "UNKNOWN_PLACE"; c.mk = () => ({ blocker: c.blocker }); }
    else c.mk = () => {
      const st = { x: best[0], y: best[1], z: best[2] };
      if (!reach(ctx, st)) { v.bad.push([best[0] * 1000 + best[1], ctx.t + 600]); return { blocker: "NO_PATH" }; }
      return { task: Task("drink", [{ v: "drink", ...st }]), res: [] };
    };
    add(ctx, c);
  }
  let ue = urgency(v.energy, ctx.night ? 0.9 : 0.4, SOFT.energy[1]);
  // Commitment (§09): once a villager has started to sleep (or is walking to bed to), they finish to SLEEP_DONE. 400 x 0.9 = 360 beats any
  // order (<= 345), so a digger far from his bed is not pulled off a half-slept night (S5's known gap); hunger, thirst and cold
  // above u = 0.9 still win (the need rank breaks ties), and a village emergency still outranks the rest.
  if (ctx.cur && ctx.cur.k === "sleep") ue = Math.max(ue, v.energy < SLEEP_DONE || (ctx.night && v.energy < 0.98) ? SLEEP_COMMIT : 0.35);      // S18b: and a sleep begun at night lasts the night (one sleep a night, not naps broken by the first chore)
  if (ue > 0) addRest(ctx, "sleep", ue);
  let uw = urgency(v.warm, ...SOFT.warm);
  if (ctx.cur && ctx.cur.k === "huddle") uw = Math.max(uw, 0.3);
  if (uw > 0) addRest(ctx, "huddle", uw);
  const um = urgency(v.mood, ...SOFT.mood);
  if (um > 0) add(ctx, { kind: "leisure", cls: "need", u: um, grp: "need", d: 0, key: "leisure:0", mk: () => ({ task: Wander(), res: [] }) });
}

// ---- no food in mind (9.32) ----

const SEARCH_STEP = 8, SEARCH_MAX = 40, SEARCH_GAP = 600;
const SEARCH_DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
/**
 * The fallback that keeps ignorance from starving a village: a slime that believes in no food at all (no patch, no stack in the yard) walks out and looks around. Each trip heads off in
 * one of eight directions (picked from the slime's id and its trip count `v.sf`, so no rng) a little farther than the last (SEARCH_STEP .. SEARCH_MAX cells) and looks at once on arrival,
 * which writes whatever food it sees into its beliefs; the next plan then forages. Hungry: a NEED (it outranks everything but what outranks eating); not hungry: a leisure errand, one per SEARCH_GAP.
 */
/** The cell of search trip number n: a little farther each time (SEARCH_STEP .. SEARCH_MAX) in one of eight directions picked from the slime's id (no rng), or null when every try is not standable. */
function tripTarget(ctx, n) {
  const { v, sim } = ctx, dir = SEARCH_DIRS[mix32(v.id, n) % 8];
  let tg = null;
  for (let d = Math.min(SEARCH_MAX, SEARCH_STEP * (1 + (n >> 3))), k = 0; k < 4 && !tg; k++, d >>= 1) {
    const x = v.x + dir[0] * d, y = v.y + dir[1] * d, z = sim.world.standZ(x, y);
    if (z >= 0) tg = { x, y, z };
  }
  return tg;
}
function genSearchFood(ctx) {
  const { v, sim, t } = ctx;
  if (belFlags.off || (v.fear || 0) > 0.1 || !v.bel) return;
  const going = !!(ctx.cur && ctx.cur.k === "search_food");
  const uh = urgency(v.hunger, ...SOFT.hunger);
  if (!going && uh <= 0 && t - (v.sfT === undefined ? -1e9 : v.sfT) < SEARCH_GAP) return;
  if (v.carry && ITEMS[v.carry.item].food > 0) return;
  if (entsOf(ctx, "food").length || nearestFoodStack(ctx)) return;
  const n = v.sf || 0, tg = tripTarget(ctx, n);
  if (!tg) return;
  const c = { kind: "search_food", cls: uh > 0 ? "need" : "leisure", u: uh, urg: 0.7, grp: "search", d: 0, tid: 0, key: "search_food:" + n, mk: () => {
    if (!reach(ctx, tg)) { v.sf = n + 1; return { blocker: "NO_PATH" }; }       // that way is shut: the next trip goes another way
    return { task: Task("search_food", [{ v: "survey", sf: 1, ...tg }]), res: [] };
  } };
  add(ctx, c);
}

/** Sleep/huddle: my bed, else a free bed, else the ground at camp (worse rest, colder). When it is cold, a warm room beats all of these (S4a). */
function addRest(ctx, kind, u) {
  const { v, sim, vl } = ctx;
  const chill = tempAt(ctx.t) < CHILL;
  const warmRoom = (b) => { const r = sim.rooms.at(b.x, b.y, b.z); return r && r.enclosed ? r : null; };
  let bed = v.bed ? sim.ents.get(v.bed) : null;
  if (bed && bed.owner !== v.id) bed = null;
  if (chill && vl.beds.some(warmRoom)) {
    let bc = 1e9, pick = null;
    for (const b of vl.beds) {
      if (b.owner && b.owner !== v.id) continue;
      const c = dTo(ctx, b) - (warmRoom(b) ? 60 : 0) - (b.owner === v.id ? 10 : 0);
      if (c < bc) { bc = c; pick = b; }
    }
    if (pick) bed = pick;
  } else if (!bed) {
    let bd = 1e9;
    for (const b of vl.beds) if (!b.owner) { const d = dTo(ctx, b); if (d < bd) { bd = d; bed = b; } }
  }
  if (!bed) for (const pid of v.par) {            // a child without a bed shares a parent's
    const b = pid ? vl.beds.find(q => q.owner === pid) : null;
    if (b && !isAdult(sim, v)) { bed = b; break; }
  }
  if (!bed && v.mate) bed = vl.beds.find(q => q.owner === v.mate) || null;       // S13: a partner without a bed of their own shares the partner's
  if (v.mate) bed = shareBedroom(ctx, bed);
  let st, tid = 0;
  // Exhausted and far from camp: collapse where you stand (ground sleep) rather than walk 100+ ticks home.
  const fire = kind === "huddle" && chill ? firesideSpot(ctx) : null;          // S7a: when it is cold, huddle beside a lit fire, not in a bed
  if (fire) st = fire;
  else {
    const far = kind === "sleep" && (u > 0.5 || (ctx.cur && ctx.cur.k === "sleep" && !ctx.cur.tid)) && bed && dist3(v.x, v.y, v.z, bed.x, bed.y, bed.z) > FAR_SLEEP;
    if (far) { st = { x: v.x, y: v.y, z: v.z }; bed = null; }
    else if (bed && !(chill && !warmRoom(bed) && (st = warmFloor(ctx)))) { st = { x: bed.x, y: bed.y, z: bed.z }; tid = bed.id; }   // cold: a warm room's floor beats a bed out in the wind
    else if (st) { /* warmFloor found a spot above */ }
    else {
      const spot = chill ? warmFloor(ctx) : null;
      if (spot) st = spot;
      else {
        const c = CAMP(sim.stock);
        const gx = c.x + (v.id % 5) - 2, gy = c.y + ((v.id >> 3) % 5) - 2, gz = sim.world.standZ(gx, gy);
        st = gz >= 0 ? { x: gx, y: gy, z: gz } : { x: v.x, y: v.y, z: v.z };
      }
    }
  }
  const cand = { kind, cls: "need", u, grp: "need", tid, d: dist3(v.x, v.y, v.z, st.x, st.y, st.z), key: kind + ":" + tid };
  cand.mk = () => reach(ctx, st) ? { task: Task(kind, [{ v: kind, tid, ...st }]), res: [] } : { blocker: "NO_PATH" };
  add(ctx, cand);
}

/** S15: partners share a Bedroom. If my partner's bed stands in a closed Bedroom, take a free bed in that room (nearest the partner's) rather than one elsewhere. */
function shareBedroom(ctx, bed) {
  const { v, sim, vl } = ctx, o = sim.ents.get(v.mate), mb = o && o.bed ? sim.ents.get(o.bed) : null;
  const R = mb ? sim.rooms.at(mb.x, mb.y, mb.z) : null;
  if (!R || R.purpose !== "bedroom" || !R.enclosed) return bed;
  if (bed && sim.rooms.at(bed.x, bed.y, bed.z) === R) return bed;
  let best = null, bd = 1e9;
  for (const b of vl.beds) {
    if (sim.rooms.at(b.x, b.y, b.z) !== R || (b.owner && b.owner !== v.id && b.owner !== v.mate)) continue;
    const d = Math.abs(b.x - mb.x) + Math.abs(b.y - mb.y) + (b.owner === v.mate ? 0 : 1);
    if (d < bd) { bd = d; best = b; }
  }
  return best || bed;
}

/** A free cell 1-2 steps from the nearest lit hearth, chosen by villager id so they do not all stand on one cell; null if no fire is lit. */
function firesideSpot(ctx) {
  const { v, sim } = ctx;
  let h = null, bd = 1e9;
  for (const f of entsOf(ctx, "furn:hearth")) {
    if (!f.lit) continue;
    const d = dTo(ctx, f);
    if (d < bd && d <= 60) { bd = d; h = f; }
  }
  if (!h) return null;
  const ring = [];
  for (const r of [1, 2]) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (sim.world.isWalkable(h.x + dx, h.y + dy, h.z)) ring.push({ x: h.x + dx, y: h.y + dy, z: h.z });
  }
  return ring.length ? ring[(v.id * 7) % ring.length] : null;
}

/** No bed free: a free floor cell in the nearest warm room that is not yet crowded (half its cells). */
function warmFloor(ctx) {
  const { v, sim } = ctx;
  let best = null, bd = 1e9;
  for (const r of sim.rooms.all()) {
    if (!r.enclosed || r.n < 4 || occupants(sim, r) >= (r.n >> 1)) continue;
    const [cx, cy] = World.xyz(r.cells[0]);
    const d = dist3(v.x, v.y, v.z, cx, cy, r.z);
    if (d < bd) { bd = d; best = r; }
  }
  if (!best) return null;
  for (let k = 0; k < best.n; k++) {
    const [x, y, z] = World.xyz(best.cells[(v.id * 7 + k) % best.n]);
    if (!sim.ents.at(x, y, z).length || sim.ents.at(x, y, z).every(id => sim.ents.get(id).kind === "villager" && id === v.id)) return { x, y, z };
  }
  return null;
}

// ---- fear, wounds and the hunt (S8) ----------------------------------------------------------------------------------

const RING8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
/** Somewhere safer to run to: camp first (company, and away from the lair), else a spot well away from the threat. null when cornered. */
function fleeSpot(ctx, th) {
  const { v, sim } = ctx, w = sim.world, c = CAMP(sim.stock);
  const ox = th ? th.x : v.x, oy = th ? th.y : v.y, d0 = th ? Math.max(Math.abs(v.x - th.x), Math.abs(v.y - th.y)) : 0;
  const cands = [{ x: c.x + (v.id % 5) - 2, y: c.y + ((v.id >> 3) % 5) - 2 }];
  for (const r of [9, 16]) for (const [dx, dy] of RING8) cands.push({ x: v.x + dx * r, y: v.y + dy * r });
  const spots = [];
  cands.forEach((k, i) => {
    const z = w.standZ(k.x, k.y);
    if (z < 0 || restricted(sim, k.x, k.y, z) || (k.x === v.x && k.y === v.y)) return;
    const d = Math.max(Math.abs(k.x - ox), Math.abs(k.y - oy));
    if (d >= d0 + 4) spots.push({ x: k.x, y: k.y, z, d: i === 0 ? 1e6 : d });        // camp first
  });
  spots.sort((a, b) => b.d - a.d || a.x - b.x || a.y - b.y);
  for (const s of spots.slice(0, 3)) if (reach(ctx, s)) return { x: s.x, y: s.y, z: s.z };
  return null;
}

/**
 * Fear (§13.7): above FEAR_AT an autonomous villager drops what they do and runs - personal-critical class, so nothing outranks it (the
 * flee job kind, Appendix B) - and keeps running until fear is down to FEAR_STOP. A guided villager is Steadfast and never gets this
 * candidate. Cornered (nowhere farther to run) or with a hostile beast at their elbow they fight back instead ("defend"): the AI fights only in
 * self-defence.
 */
function genFlee(ctx) {
  const { v, sim } = ctx, fear = v.fear || 0;
  if (steadfast(v)) return;
  const th = threatOf(sim, v), running = ctx.cur && ctx.cur.k === "flee";
  const camp = CAMP(sim.stock), farFromCamp = Math.abs(v.x - camp.x) + Math.abs(v.y - camp.y) > 8;
  if (fear > (running ? FEAR_STOP : FEAR_AT) && (th || farFromCamp)) {
    add(ctx, { kind: "flee", cls: "need", u: 1, grp: "need", d: 0, key: "flee:0", tid: th ? th.id : 0, mk: () => {
      const dest = fleeSpot(ctx, th);
      return dest ? { task: Task("flee", [{ v: "goto", ...dest }]), res: [] } : { blocker: "NO_PATH" };
    } });
  }
  if (th && FAUNA[th.sp].hostile && near1(v, th)) {
    add(ctx, { kind: "defend", cls: "need", u: 0.97, grp: "need", d: 0, key: "defend:" + th.id, tid: th.id, mk: () => ({ task: Task("defend", [{ v: "strike", tid: th.id, ...HERE }]), res: [] }) });
  }
}

/** A wound (below half health) makes rest a personal need: rest, and the body mends faster (villager.js). Kept up until nearly healed. */
function genMend(ctx) {
  const { v, sim } = ctx, r = v.hp / maxHp(v, fitness(v, ageDays(sim, v)));
  const mending = ctx.cur && ctx.cur.k === "mend";
  if (r >= 0.5 && !(mending && r < 0.85)) return;
  const u = 0.55 + 0.45 * clamp((0.5 - r) / 0.5, 0, 1);
  add(ctx, { kind: "mend", cls: "need", u, grp: "need", d: 0, key: "mend:0", mk: () => {
    const c = CAMP(sim.stock), steps = [];
    if (Math.abs(v.x - c.x) + Math.abs(v.y - c.y) > 10 && !threatOf(sim, v)) {
      const z = sim.world.standZ(c.x + (v.id % 5) - 2, c.y + ((v.id >> 3) % 5) - 2), st = { x: c.x + (v.id % 5) - 2, y: c.y + ((v.id >> 3) % 5) - 2, z };
      if (z >= 0 && reach(ctx, st)) steps.push({ v: "goto", ...st });
    }
    steps.push({ v: "mend", ...HERE });
    return { task: Task("mend", steps), res: [] };
  } });
}

// ---- illness (S14, disease.js) -------------------------------------------------------------------------------------

export const ILL_AVOID = 20, ILL_AVOID_R = 3;
/** Well villagers prefer work away from the sick (a penalty inside the within-class clamp; needs, village emergencies and nursing are exempt). */
function illBias(ctx, c) {
  if (!ctx.sick || !ctx.sick.length || ctx.v.ill || c.cls === "need" || c.cls === "vcrit" || c.kind === "tend_sick" || !c.tid) return 0;
  const e = ctx.sim.ents.get(c.tid);
  if (!e || e.x === undefined) return 0;
  for (const s of ctx.sick) if (Math.abs(s.x - e.x) <= ILL_AVOID_R && Math.abs(s.y - e.y) <= ILL_AVOID_R && Math.abs(s.z - e.z) <= 2) return -ILL_AVOID;
  return 0;
}

/**
 * A sick villager rests (personal need, kind convalesce: in their bed, else a warm room's floor, else the camp ground) until it passes. A well adult may nurse a sick villager
 * (standing class, kind tend_sick): sit with them, and give them a herbal remedy from the stockpile if there is one. At most two nurses at a time, and never a sick one.
 */
function genSick(ctx) {
  const { v, sim } = ctx;
  if (!ctx.sick || !ctx.sick.length) return;
  if (v.ill) {
    const u = 0.55 + 0.25 * v.ill.s;
    const bed = v.bed ? sim.ents.get(v.bed) : null;
    let st = bed && bed.owner === v.id ? { x: bed.x, y: bed.y, z: bed.z } : null, tid = st ? bed.id : 0;
    if (!st) { const c = CAMP(sim.stock), gz = sim.world.standZ(c.x + (v.id % 5) - 2, c.y + ((v.id >> 3) % 5) - 2); st = gz >= 0 ? { x: c.x + (v.id % 5) - 2, y: c.y + ((v.id >> 3) % 5) - 2, z: gz } : { x: v.x, y: v.y, z: v.z }; }
    add(ctx, { kind: "convalesce", cls: "need", u, grp: "need", tid, d: dist3(v.x, v.y, v.z, st.x, st.y, st.z), key: "convalesce:" + tid,
      mk: () => reach(ctx, st) ? { task: Task("convalesce", [{ v: "convalesce", tid, ...st }]), res: [] } : { blocker: "NO_PATH" } });
    return;
  }
  if (!isAdult(sim, v)) return;
  let best = null, bd = 1e9;
  for (const p of ctx.sick) {
    if (p.id === v.id || (sim.tick - ((p.ill && p.ill.tc) || 0) < 300) || isBad(v, p.id, ctx.t)) continue;
    const d = dTo(ctx, p);
    if (d < bd && d <= MAX_SCAN) { bd = d; best = p; }
  }
  if (!best) return;
  const hold = v.carry && v.carry.item === "herbal_remedy";
  const c = { cls: "standing", urg: clamp(best.ill.s, 0, 1), grp: "care", skill: null, kind: "tend_sick", tid: best.id, d: bd, key: "tend_sick:" + best.id };
  if (reservedByOther(sim, best, v.id)) c.blocker = "RESERVED";
  else if (capped(ctx, "standing", "care", 2)) c.blocker = "MAX_WORKERS";
  else if (v.carry && !hold) c.blocker = "NO_CAPACITY";
  if (c.blocker) c.mk = () => ({ blocker: c.blocker });
  else c.mk = () => {
    const st = standAdj(ctx, best);
    if (!st || !reach(ctx, st)) { v.bad.push([best.id, ctx.t + 600]); return { blocker: "NO_PATH" }; }
    const steps = [];
    if (!hold && !best.ill.rm && ctx.sv.stock.herbal_remedy > 0) {
      const stack = stockStack(ctx, "herbal_remedy");
      if (stack && reach(ctx, stack)) steps.push({ v: "take", item: "herbal_remedy", n: 1, ...stack });
    }
    steps.push({ v: "tend", tid: best.id, ...st });
    return { task: Task("tend_sick", steps), res: [best] };
  };
  add(ctx, c);
}

/** A cardinal neighbour of a creature to stand on, nearest first. */
function standAdj(ctx, e) {
  const w = ctx.sim.world, v = ctx.v;
  let best = null, bd = 1e9;
  for (const [dx, dy] of RING8.slice(0, 4)) for (const dz of [0, 1, -1]) {
    const x = e.x + dx, y = e.y + dy, z = e.z + dz;
    if (!w.isWalkable(x, y, z)) continue;
    const d = dist3(v.x, v.y, v.z, x, y, z);
    if (d < bd) { bd = d; best = { x, y, z }; }
  }
  return best;
}
/** mk() for hunting a creature: a spear from the stockpile if there is one, then walk beside it and strike (the shared melee verb). */
function huntMk(ctx, e) {
  return () => {
    const st = standAdj(ctx, e);
    if (!st || !reach(ctx, st)) return { blocker: "NO_PATH" };
    return { task: Task("hunt", [...equipSteps(ctx, "copper_spear"), { v: "strike", tid: e.id, ...st }]), res: [e] };
  };
}
/** Hunting hoppers as a demand-class job while the village is short of food (a few hunters at most). */
function genHunt(ctx) {
  const { sim, v, t } = ctx;
  let best = null, bd = 1e9;
  for (const e of entsOf(ctx, "game*")) {
    const fr = FAUNA[e.sp];
    if (!fr.huntable || (fr.huntable === 2 && (fr.hostile || !(ctx.sv.stock.copper_spear > 0 || (v.eq && v.eq.item === "copper_spear")))) || e.tame || e.st === "held" || reservedByOther(sim, e, v.id) || isBad(v, e.id, t)) continue;       // S14: big dangerous game is hunted unprompted only with a spear to hand, and a wolf never
    const d = dTo(ctx, e) - (e.rv === v.id ? 1000 : 0);
    if (d < bd && d <= MAX_SCAN) { bd = d; best = e; }
  }
  if (!best) return;
  const c = { cls: "demand", urg: Math.min(1, demandOf(ctx).food), grp: "hunt", pull: true, kind: "hunt", skill: null, tid: best.id, d: bd, key: "hunt:" + best.id };
  if (capped(ctx, "demand", "hunt", 2)) c.blocker = "MAX_WORKERS";
  c.mk = c.blocker ? () => ({ blocker: c.blocker }) : huntMk(ctx, best);
  add(ctx, c);
}

/** An expedition member (§13.4): ORDER-class work for the crew. Out: dig the crew's search. Home: carry the sample to the stockpile, then walk to camp. */
function genExpedition(ctx) {
  const { v, sim, t } = ctx, x = expOf(sim, v);
  if (!x) return;
  if (x.st === "work") {
    const k = Math.max(0, x.ids.indexOf(v.id)), d = sim.mine.list.find(q => q.id === x.dids[k % x.dids.length]);
    if (d && !d.done) genMine(ctx, d);
    return;
  }
  const base = { cls: "order", urg: 0.5, grp: "exp", skill: null };
  if (v.carry) {
    const cell = storeCell(sim, v.carry.item, v.x, v.y);
    const c = { ...base, kind: "store", key: "store:0", d: cell ? dist3(v.x, v.y, v.z, cell[0], cell[1], cell[2]) : 0 };
    if (!cell) { c.blocker = "NO_STORAGE"; c.mk = () => ({ blocker: "NO_STORAGE" }); }
    else c.mk = () => { const st = { x: cell[0], y: cell[1], z: cell[2] }; return reach(ctx, st) ? { task: Task("store", [{ v: "drop", ...st }]), res: [] } : { blocker: "NO_PATH" }; };
    add(ctx, c);
    return;
  }
  const s = looseTarget(sim, x, v, (q) => reservedByOther(sim, q, v.id) || isBad(v, q.id, t), entsOf(ctx, "loose"));
  if (s && carryRoom(v, s.item) > 0) { add(ctx, { ...base, kind: "haul", tid: s.id, d: dTo(ctx, s), mk: oneStep("haul", "pickup", s) }); return; }
  const cp = CAMP(sim.stock), gx = cp.x + (v.id % 5) - 2, gy = cp.y + ((v.id >> 3) % 5) - 2, gz = sim.world.standZ(gx, gy);
  if (gz >= 0 && Math.abs(v.x - cp.x) + Math.abs(v.y - cp.y) > 5) {
    const st = { x: gx, y: gy, z: gz };
    add(ctx, { ...base, kind: "goto", key: "goto:0", d: dTo(ctx, st), mk: () => (reach(ctx, st) ? { task: Task("goto", [{ v: "goto", ...st }]), res: [] } : { blocker: "NO_PATH" }) });
  }
}

// ---- chains: food and shelter, reused by every class ------------------------

/**
 * Food jobs at class `cls`: dry fresh food on a rack, forage, and (o.rack) build the rack.
 * o = {uv?, urg, cap, grp, kp?, dry:bool, forage:bool}
 */
function foodChain(ctx, cls, o) {
  const { v, sv, vl } = ctx, base = { cls, uv: o.uv, urg: o.urg, grp: o.grp, kp: o.kp, pull: o.pull };
  const full = capped(ctx, cls, o.grp, o.cap);
  if (o.forage !== false) {
    const near = nearPlants(ctx), bush = near.berry;
    const c = { ...base, kind: "forage", skill: null, gather: true };
    if (carryRoom(v, "berry") <= 0) { c.blocker = "NO_CAPACITY"; c.mk = () => ({ blocker: "NO_CAPACITY" }); }
    else if (!bush) {
      c.blocker = !berrySeason(ctx.t) ? "NO_SEASON" : near.rsv.berry ? "RESERVED" : noPlace(ctx, "food"); c.mk = () => ({ blocker: c.blocker });
    } else { c.tid = bush.id; c.d = dTo(ctx, bush); c.mk = oneStep("forage", "pick", bush); }
    const tb = near.tuber;                                       // S6: tubers are food all year (they live under the frost); a bush in season wins when it is nearer
    if (tb && carryRoom(v, "tuber") > 0 && (!bush || !berrySeason(ctx.t) || dTo(ctx, tb) < dTo(ctx, bush) - 6)) {
      c.blocker = null; c.tid = tb.id; c.d = dTo(ctx, tb); c.key = "forage:" + tb.id; c.mk = oneStep("forage", "tuber", tb);
    } else if (!berrySeason(ctx.t) && carryRoom(v, "berry") > 0) {      // winter forage (§11.17): dig roots at a grass tuft, ~1/3 of a summer forager-day
      const t = near.tuft;
      if (t) { c.blocker = null; c.tid = t.id; c.d = dTo(ctx, t); c.key = "forage:" + t.id; c.mk = oneStep("forage", "root", t); }
      else { c.blocker = near.rsv.tuft ? "RESERVED" : noPlace(ctx, "food"); c.mk = () => ({ blocker: c.blocker }); }
    }
    if (full && !c.blocker) c.blocker = "MAX_WORKERS";
    add(ctx, c);
  }
  if (o.dry !== false && vl.racks.length) {
    let rack = null, bd = 1e9;
    for (const r of vl.racks) if (!reservedByOther(ctx.sim, r, v.id)) { const d = dTo(ctx, r); if (d < bd) { bd = d; rack = r; } }
    const c = { ...base, kind: "dry", skill: "craft", gather: true, urg: o.urgDry ?? o.urg };
    if (!rack) c.blocker = "RESERVED";
    else if (sv.stock.berry < 5) c.blocker = "NO_MATERIAL";
    else if (v.carry && !(v.carry.item === "berry" && v.carry.n >= 5)) c.blocker = "NO_CAPACITY";
    if (full && !c.blocker) c.blocker = "MAX_WORKERS";
    if (c.blocker) c.mk = () => ({ blocker: c.blocker });
    else {
      c.tid = rack.id; c.d = bd; c.key = "dry:0";
      c.mk = () => {
        const steps = [];
        if (!(v.carry && v.carry.item === "berry" && v.carry.n >= 5)) {
          const stack = stockStack(ctx, "berry");
          if (!stack || !reach(ctx, stack)) return { blocker: "NO_MATERIAL" };
          steps.push({ v: "take", item: "berry", n: 5, ...stack });
        }
        const st = { x: rack.x, y: rack.y, z: rack.z };
        if (!reach(ctx, st)) return { blocker: "NO_PATH" };
        steps.push({ v: "dry", tid: rack.id, ...st });
        return { task: Task("dry", steps), res: [rack] };
      };
    }
    add(ctx, c);
  }
}
/** Stockpile cell holding `item`, nearest first. */
function stockStack(ctx, item) {
  let best = null, bd = 1e9;
  const items = stored(ctx.sim);                                  // the stockpile: relaxed (OD-56)
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    if (s.item !== item) continue;
    const d = dTo(ctx, s);
    if (d < bd) { bd = d; best = { x: s.x, y: s.y, z: s.z }; }
  }
  return best;
}

/**
 * Build a bed or rack at class `cls`: take materials from the stockpile, walk to a
 * fresh site, work. When materials are short, emit the derived gather job instead
 * (a bed needs grass, a rack needs sticks) at the same class and group.
 */
function buildChain(ctx, cls, what, o) {
  const { v, sv, sim } = ctx, cost = what === "bed" ? BED_COST : RACK_COST;
  const base = { cls, uv: o.uv, urg: o.urg, grp: o.grp, kp: o.kp, pull: o.pull };
  const full = capped(ctx, cls, o.grp, o.cap);
  const holds = v.carry && v.carry.item === cost.item && v.carry.n >= cost.n;
  const c = { ...base, kind: "build_" + what, skill: "craft", key: "build_" + what + ":0" };
  const wasted = !holds && !belFlags.off && v.lf && v.lf[0] === c.kind && v.lf[1] === "NO_MATERIAL" && ctx.t - v.lf[2] < SHORT_FELT;     // 9.30: it walked to the yard for this and found none: it remembers (several slimes see the same full yard at once and all go)
  if (!holds && v.carry) c.blocker = "NO_CAPACITY";
  else if (!holds && (sv.stock[cost.item] < cost.n || wasted)) { c.blocker = "NO_MATERIAL"; c.short = cost.item; c.sn = Math.max(1, cost.n - sv.stock[cost.item]); }     // 9.31: what is short (the board's request says it)
  else if (full) c.blocker = "MAX_WORKERS";
  if (c.blocker) c.mk = () => ({ blocker: c.blocker });
  else {
    c.d = 0;
    c.mk = () => {
      const site = findSite(sim, what);
      if (!site) return { blocker: "NO_SITE" };
      const steps = [];
      if (!holds) {
        const stack = stockStack(ctx, cost.item);
        if (!stack || !reach(ctx, stack)) return { blocker: "NO_MATERIAL" };
        steps.push({ v: "take", item: cost.item, n: cost.n, ...stack });
      }
      if (!sim.path.find(World.idx(v.x, v.y, v.z), World.idx(site[0], site[1], site[2])).ok) return { blocker: "NO_PATH" };
      const s = sim.ents.add("site", { what, x: site[0], y: site[1], z: site[2], rv: 0, rt: 0 });
      sim.cache.iv++;
      steps.push({ v: "build", tid: s.id, x: site[0], y: site[1], z: site[2], item: cost.item, n: cost.n, dur: what === "bed" ? 240 : 360 });
      return { task: Task("build_" + what, steps), res: [s] };
    };
  }
  add(ctx, c);
  // Materials lying loose outside the stockpile: haul them in at the consumer's class (§09 priority inversion rule).
  if (sv.stock[cost.item] < cost.n && looseOf(ctx, cost.item) > 0) looseCand(ctx, base, cost.item, full);
  // Derived gather: only while materials are short in total (in stock, loose as this slime believes, or in hands).
  const have = heldOf(ctx, cost.item);
  if (have < cost.n || wasted) {
    const near = nearPlants(ctx);
    if (cost.item === "grass") {
      const t = near.tuft;
      const g = { ...base, kind: "cut", skill: null, gather: true, key: "cut:" + (t ? t.id : 0) };
      if (carryRoom(v, "grass") <= 0) { g.blocker = "NO_CAPACITY"; g.mk = () => ({ blocker: "NO_CAPACITY" }); }
      else if (!t) { g.blocker = near.rsv.tuft ? "RESERVED" : noPlace(ctx, "food"); g.mk = () => ({ blocker: g.blocker }); }
      else { g.tid = t.id; g.d = dTo(ctx, t); g.mk = oneStep("cut", "cut", t); }
      if (full && !g.blocker) g.blocker = "MAX_WORKERS";
      add(ctx, g);
    } else chopCand(ctx, base, full);
  }
}
/** Nearest loose stack of `item` I can lift, as a haul job at the caller's class. */
function looseCand(ctx, base, item, full) {
  const { sim, v } = ctx;
  let best = null, bd = 1e9;
  const items = entsOf(ctx, "loose");
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    if (s.item !== item || reservedByOther(sim, s, v.id) || isBad(v, s.id, ctx.t)) continue;
    const d = dTo(ctx, s);
    if (d < bd && d <= MAX_SCAN) { bd = d; best = s; }
  }
  const c = { ...base, kind: "haul", skill: null };
  if (!best) { c.blocker = noPlace(ctx, "loose"); c.mk = () => ({ blocker: c.blocker }); }
  else if (carryRoom(v, item) <= 0) { c.blocker = "NO_CAPACITY"; c.mk = () => ({ blocker: "NO_CAPACITY" }); c.tid = best.id; }
  else { c.tid = best.id; c.d = bd; c.mk = oneStep("haul", "pickup", best); }
  if (full && !c.blocker) c.blocker = "MAX_WORKERS";
  add(ctx, c);
}
function chopCand(ctx, base, full) {
  const near = nearPlants(ctx), t = near.tree, v = ctx.v;
  const g = { ...base, kind: "chop", skill: null };
  if (v.carry) { g.blocker = "NO_CAPACITY"; g.mk = () => ({ blocker: "NO_CAPACITY" }); }
  else if (!t) { g.blocker = near.rsv.tree ? "RESERVED" : noPlace(ctx, "tree"); g.mk = () => ({ blocker: g.blocker }); }
  else { g.tid = t.id; g.d = dTo(ctx, t); g.mk = oneStep("chop", "chop", t); }
  if (full && !g.blocker) g.blocker = "MAX_WORKERS";
  add(ctx, g);
}
function gatherCand(ctx, base, full) {
  const near = nearPlants(ctx), t = near.tuft, v = ctx.v;
  const g = { ...base, kind: "cut", skill: null, gather: true };
  if (carryRoom(v, "grass") <= 0) { g.blocker = "NO_CAPACITY"; g.mk = () => ({ blocker: "NO_CAPACITY" }); }
  else if (!t) { g.blocker = near.rsv.tuft ? "RESERVED" : noPlace(ctx, "food"); g.mk = () => ({ blocker: g.blocker }); }
  else { g.tid = t.id; g.d = dTo(ctx, t); g.mk = oneStep("cut", "cut", t); }
  if (full && !g.blocker) g.blocker = "MAX_WORKERS";
  add(ctx, g);
}

// ---- hauling baseline (§09 R21) ------------------------------------------------

const SHORT_FELT = 900;                                         // ticks a slime remembers that the yard had none of what a job needed (a flat constant)
const USES_CARRY = new Set(["build_bed", "build_rack", "build_site", "craft_site", "dry"]);     // jobs whose first step takes (or whose hands already hold) the very load they then use
function genHaul(ctx, clsFor) {
  const { v, sim } = ctx;
  if (v.wg && ctx.cur && ctx.cur.k === "haul_wagon") {            // S15: a wagon trip under way is one job: it stays a candidate (same key) so a re-plan does not cut it short and strand the wagon
    const j = ctx.cur;
    add(ctx, { kind: "haul_wagon", cls: j.c, kp: j.kp, grp: j.g, urg: 1, tid: j.tid, d: 0, key: j.key, mk: () => ({ blocker: "GONE" }) });
    return;
  }
  if (v.carry && !(ctx.cur && USES_CARRY.has(ctx.cur.k))) {            // (9.30: a slime on its way to build with what it holds is not pulled off it to set the load down: with the village-critical class gone it was a loop)
    const cap = carryCap(v);
    const cls = clsFor(v.carry.item);
    const c = { kind: "store", cls: cls.cls, kp: cls.kp, grp: cls.kp ? "kp:" + cls.kp : "haul", urg: Math.max(0.2, carryLoad(v) / cap), d: 0, key: "store:0" };
    const cell = storeCell(sim, v.carry.item, v.x, v.y);
    if (!cell && (ITEMS[v.carry.item].food === 0 || v.hunger > 0.8)) {                  // the food-only cells are all that is left: set the load down rather than stand there with full hands
      c.d = 0; c.key = "store:dump"; c.cls = "vcrit"; c.uv = 0; c.grp = "dump";     // full hands also block foraging, so setting the load down is as urgent as the food chain
      c.mk = () => ({ task: Task("store", [{ v: "dump", ...HERE }]), res: [] });
    } else if (!cell) { c.blocker = "NO_STORAGE"; c.mk = () => ({ blocker: "NO_STORAGE" }); }
    else {
      c.d = dist3(v.x, v.y, v.z, cell[0], cell[1], cell[2]);
      c.mk = () => {
        const st = { x: cell[0], y: cell[1], z: cell[2] };
        return reach(ctx, st) ? { task: Task("store", [{ v: "drop", ...st }]), res: [] } : { blocker: "NO_PATH" };
      };
    }
    add(ctx, c);
  }
  // Loose stacks outside the zone: nearest one I can lift.
  const canStore = {};
  let best = null, bd = 1e9, rsv = 0;
  const items = entsOf(ctx, "loose");
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    if (carryRoom(v, s.item) <= 0) continue;
    if (!(s.item in canStore)) canStore[s.item] = storeCell(sim, s.item, v.x, v.y) !== null;
    if (!canStore[s.item]) continue;                                 // nowhere to put it: leave it where it lies
    if (reservedByOther(sim, s, v.id)) { rsv++; continue; }
    if (isBad(v, s.id, ctx.t)) continue;
    const d = dTo(ctx, s);
    if (d < bd && d <= MAX_SCAN) { bd = d; best = s; }
  }
  if (best) {
    const cls = clsFor(best.item);
    const h = { kind: "haul", cls: cls.cls, kp: cls.kp, grp: cls.kp ? "kp:" + cls.kp : "haul", urg: 0.6, tid: best.id, d: bd, mk: oneStep("haul", "pickup", best) };
    add(ctx, h);
    if (!v.carry) wagonHaul(ctx, best, cls);
  }
}

/**
 * S15 (GDD §14.7): a long haul (the stack is WAGON_FAR or more from the nearest place to store it) with a free wagon or ready cart in reach becomes one trip with the wagon:
 * hitch it, pick up the loose stacks of the same item round the first (up to its capacity), drop them in the store, leave the wagon there. It scores a little above the
 * plain haul, and falls back to it when the wagon cannot be used.
 */
function wagonHaul(ctx, first, cls) {
  const { sim, v } = ctx;
  const was = guard.scope;
  const known = entsOf(ctx, "wagon");                                      // 9.31: the wagons and carts this slime has seen or heard of
  if (!known.length) return;
  const cell0 = storeCell(sim, first.item, first.x, first.y);
  if (!cell0 || Math.abs(cell0[0] - first.x) + Math.abs(cell0[1] - first.y) < WAGON_FAR) return;
  guard.scope = "wagonHaul";
  const w = freeWagon(sim, v, reservedByOther, known);
  guard.scope = was;
  if (!w) return;
  const c = { kind: "haul_wagon", cls: cls.cls, kp: cls.kp, grp: cls.kp ? "kp:" + cls.kp : "haul", urg: 0.66, tid: first.id, d: dTo(ctx, first), key: "haul_wagon:" + first.id };
  c.mk = () => {
    const item = first.item, per = ITEMS[item].load, room = Math.floor(Math.max(carryCap(v), WAGON[w.t].cap) / per);
    const near = [];
    for (const s of entsOf(ctx, "loose")) {                                // the other stacks round the first that this slime knows of
      if (s.item !== item || s === first || reservedByOther(sim, s, v.id) || isBad(v, s.id, ctx.t)) continue;
      if (Math.max(Math.abs(s.x - first.x), Math.abs(s.y - first.y)) <= BATCH_R && Math.abs(s.z - first.z) <= 1) near.push(s);
    }
    near.sort((a, b) => (Math.abs(a.x - first.x) + Math.abs(a.y - first.y)) - (Math.abs(b.x - first.x) + Math.abs(b.y - first.y)) || a.id - b.id);
    const stacks = [first];
    let total = first.n;
    for (const s of near) { if (total >= room || stacks.length >= BATCH_MAX) break; stacks.push(s); total += s.n; }
    const wst = { x: w.x, y: w.y, z: w.z };
    if (!reach(ctx, wst) || !sim.world.isWalkable(first.x, first.y, first.z)) return { blocker: "NO_PATH" };
    const last = stacks[stacks.length - 1], drop = storeCell(sim, item, last.x, last.y);
    if (!drop) return { blocker: "NO_STORAGE" };
    const steps = [{ v: "hitch", tid: w.id, ...wst }];
    for (const s of stacks) steps.push({ v: "pickup", tid: s.id, x: s.x, y: s.y, z: s.z });
    steps.push({ v: "drop", x: drop[0], y: drop[1], z: drop[2] }, { v: "unhitch", tid: w.id, ...HERE });
    return { task: Task("haul_wagon", steps), res: [w, ...stacks] };
  };
  add(ctx, c);
}

// ---- the kitchen (S15) ------------------------------------------------------------------------------------------------

/**
 * Cook (standing class): raw meat or tubers in the stockpile and a closed Kitchen with a fire ring in it. Take a batch, work it at the lit ring, and the dishes come out in the
 * hands for the baseline store. At most one cook at a time. A cold ring is fed by the tend-fire job (genTendFire wants the fire while there is food to cook).
 */
function genCook(ctx) {
  const { sim, v, sv } = ctx;
  if (!sim.rooms.list.size) return;
  const ks = kitchens(sim, entsOf(ctx, "furn:hearth"));
  if (!ks.length) return;
  const dishes = cookable(sv);
  if (!dishes.length) return;
  const dish = dishes[0], D = DISHES[dish];
  let best = null, bd = 1e9;
  for (const k of ks) {
    if (reservedByOther(sim, k.hearth, v.id) || isBad(v, k.hearth.id, ctx.t)) continue;
    const d = dTo(ctx, k.hearth);
    if (d < bd) { bd = d; best = k.hearth; }
  }
  const c = { cls: "standing", urg: 0.5, grp: "cook", skill: "craft", kind: "cook", key: "cook:" + (best ? best.id : 0), tid: best ? best.id : 0, d: bd < 1e9 ? bd : 0 };
  if (!best) c.blocker = "RESERVED";
  else if (!best.lit) c.blocker = "TOO_COLD";
  else if (capped(ctx, "standing", "cook", 1)) c.blocker = "MAX_WORKERS";
  else if (v.carry && !(v.carry.item === D.from && v.carry.n >= D.n)) c.blocker = "NO_CAPACITY";
  else if (carryRoom(v, D.from) < D.n && !(v.carry && v.carry.item === D.from)) c.blocker = "NO_CAPACITY";
  if (c.blocker) c.mk = () => ({ blocker: c.blocker });
  else c.mk = () => {
    const stand = standNear(ctx, best);
    if (!stand || !reach(ctx, stand)) { v.bad.push([best.id, ctx.t + 600]); return { blocker: "NO_PATH" }; }
    const steps = [];
    if (!(v.carry && v.carry.item === D.from && v.carry.n >= D.n)) {
      const stack = stockStack(ctx, D.from);
      if (!stack || !reach(ctx, stack)) return { blocker: "NO_MATERIAL" };
      steps.push({ v: "take", item: D.from, n: D.n, ...stack });
    }
    steps.push({ v: "cook", tid: best.id, dish, ...stand });
    return { task: Task("cook", steps), res: [best] };
  };
  add(ctx, c);
}

// ---- construction: derived build jobs at STANDING class (§09, §12.6) ----------------

/** The next ghost to work, its materials fetched from the stockpile, delivered, then finished. */
const CRAFT_PIECES = new Set(["bed", "rack", "hearth", "shelf", "board", ...STATIONS]);       // furniture is craft work; walls, floors, roofs and doors are building
function genConstruct(ctx) {
  const rs = readyFrom(ctx.sim, entsOf(ctx, "site").filter(e => e.kind === "csite"));          // the ghosts this slime knows of (build.js readySites is the same rule over all of them)
  if (!rs.total) return;
  genSites(ctx, rs, "build");
  genSites(ctx, rs, "craft");
}
/** Two candidates from one plan: the next piece of building and the next piece of crafting, so a villager's skills can pull them one way (K6). */
function genSites(ctx, rs, group) {
  const { sim, v, sv } = ctx, mine = (s) => CRAFT_PIECES.has(s.w) === (group === "craft");
  const ready = rs.ready.filter(mine), total = rs.all.filter(mine).length;
  if (!total) return;
  const cap = shareCap(demandOf(ctx), HAND_SHARE);
  const base = { cls: "standing", urg: 0.5, grp: "construct", skill: group };
  const full = capped(ctx, "standing", "construct", cap);
  let best = null, bk = 1e9, rsv = 0;
  for (const s of ready) {
    if (reservedByOther(sim, s, v.id)) { rsv++; continue; }
    if (isBad(v, s.id, ctx.t)) continue;
    const k = TIER[s.w] * 1000 + dTo(ctx, s) - (s.rv === v.id ? 5000 : 0);
    if (k < bk) { bk = k; best = s; }
  }
  const kind = group + "_site", c = { ...base, kind, key: kind + ":" + (best ? best.id : 0) };
  if (!best) {
    c.blocker = ready.length === 0 && total ? "UNSUPPORTED" : rsv ? "RESERVED" : "NO_PATH";
    c.mk = () => ({ blocker: c.blocker }); add(ctx, c); return;
  }
  const cost = costOf(best.w, best.m), need = Math.max(0, cost.n - best.got);
  const holds = need === 0 || (v.carry && v.carry.item === cost.item && v.carry.n >= need);
  c.tid = best.id; c.d = dTo(ctx, best);
  if (!holds && v.carry) c.blocker = "NO_CAPACITY";
  else if (!holds && sv.stock[cost.item] < need) c.blocker = "NO_MATERIAL";
  else if (full) c.blocker = "MAX_WORKERS";
  if (c.blocker) c.mk = () => ({ blocker: c.blocker });
  else c.mk = () => {
    let stand = null, sd = 1e9;
    for (const [x, y, z] of standCells(sim, best)) { const d = dist3(v.x, v.y, v.z, x, y, z); if (d < sd) { sd = d; stand = { x, y, z }; } }
    if (!stand || !reach(ctx, stand)) return { blocker: "NO_PATH" };
    const steps = [];
    if (!holds) {
      const stack = stockStack(ctx, cost.item);
      if (!stack || !reach(ctx, stack)) return { blocker: "NO_MATERIAL" };
      steps.push({ v: "take", item: cost.item, n: need, ...stack });
    }
    if (need > 0) steps.push({ v: "deliver", tid: best.id, item: cost.item, n: need, ...stand });
    steps.push({ v: "construct", tid: best.id, dur: cost.dur, sk: group, ...stand });
    return { task: Task(kind, steps), res: [best] };
  };
  add(ctx, c);
  if (c.blocker === "NO_MATERIAL") {
    c.short = cost.item; c.sn = Math.max(1, need - sv.stock[cost.item]);        // the Why panel says which one; 9.31: and how many are short
    const pb = { ...base, pull: true };                      // 9.30: a shortage this slime saw is picked up by a slime between jobs, never by a busy one
    if (looseOf(ctx, cost.item) > 0) looseCand(ctx, pb, cost.item, full);
    if (heldOf(ctx, cost.item) < need) {
      if (cost.item === "grass") gatherCand(ctx, pb, full);
      else if (cost.item === "stick" || cost.item === "log") chopCand(ctx, pb, full);
      // stone and dirt come only from digging, which is the player's order (R8: no autonomous quarrying)
    }
  }
}


// ---- area mining: designated cells dug as a STANDING-class derived job (§13.3, R27) ----------------------

/** Workers allowed on mining at once: 70% of the adults, but only 20% while the village is short of food/beds/racks (as keep-N, so food demand still gets hands). */
function mineCap(ctx) {
  const d = demandOf(ctx);                                                    // 9.30: miners in view, a share of the slimes it knows of, fewer while it believes food, beds or racks are short
  return shortOf(d) ? Math.max(1, Math.floor(KEEP_SHARE * d.heads)) : shareCap(d, HAND_SHARE);
}

/** The nearest queued cell of any designation that nobody else is digging and I can stand beside; one candidate per plan. */
function genMine(ctx, only) {
  const { sim, v, t } = ctx, md = sim.mine;
  if (!md.list.length) return;
  const taken = new Set();
  for (const o of sim.ents.ofKind("villager")) {
    if (o === v || !o.job || o.job.k !== "mine" || !o.action || !o.action.steps) continue;
    const s = o.action.steps[o.action.si];
    if (s && s.cx !== undefined) taken.add(World.idx(s.cx, s.cy, s.cz));
  }
  let best = null, bd = 1e9, any = false, noTool = "";
  const gate = only || (v.job && v.job.k === "mine") ? null : digGate(ctx);       // 9.31: a designation is worked by the slimes that know of it (the board's notice, a friend, a dig they are already on)
  for (const d of md.list) {
    if (only ? d !== only : d.exp) continue;                   // S8: an expedition's search belongs to its crew (an ORDER-class job for them), nobody else
    for (const i of d.q) {
      const [x, y, z] = World.xyz(i);
      if (gate && !digCovers(gate, x, y, d)) continue;
      if (taken.has(i) || !diggableMarked(sim, x, y, z) || isBad(v, DIG_BAD + i, t)) continue;
      if (!toolFor(ctx, toolNeeded(sim, x, y, z))) { noTool = toolNeeded(sim, x, y, z); continue; }          // S9: deep rock waits for an iron pick
      any = true;
      const dd = dist3(v.x, v.y, v.z, x, y, z) - (v.job && v.job.k === "mine" && v.action && v.action.steps && v.action.steps[0].cx === x && v.action.steps[0].cy === y && v.action.steps[0].cz === z ? 1000 : 0);
      if (dd < bd) { bd = dd; best = { d, x, y, z, i }; }
    }
  }
  const c = { cls: only ? "order" : "standing", urg: 0.5, grp: only ? "exp" : "mine", kind: "mine", skill: "dig", key: "mine:" + (best ? best.i : 0) };
  if (!best) {
    const stuck = only ? only.why && only : md.list.find(q => q.why && !q.exp);
    c.blocker = noTool && !any ? "NO_TOOL" : any || !stuck ? (only ? "NO_TARGET" : "RESERVED") : stuck.why;
    c.mk = () => ({ blocker: c.blocker }); add(ctx, c); return;
  }
  c.d = bd; c.cell = [best.x, best.y, best.z];
  if (!only && capped(ctx, "standing", "mine", mineCap(ctx))) c.blocker = "MAX_WORKERS";
  if (c.blocker) c.mk = () => ({ blocker: c.blocker });
  else c.mk = () => {
    let stand = null, sd = 1e9;
    for (const [x, y, z] of standsFor(sim.world, best.x, best.y, best.z)) { const d = dist3(v.x, v.y, v.z, x, y, z); if (d < sd) { sd = d; stand = { x, y, z }; } }
    if (!stand || !reach(ctx, stand)) { v.bad.push([DIG_BAD + best.i, ctx.t + 600]); return { blocker: "NO_PATH" }; }
    const info = DIG[sim.world.mat(best.x, best.y, best.z)], need = toolNeeded(sim, best.x, best.y, best.z);
    if (need && v.carry) return { blocker: "NO_CAPACITY" };
    return { task: Task("mine", [...(need ? equipSteps(ctx, need, true) : equipSteps(ctx)), { v: "dig", cx: best.x, cy: best.y, cz: best.z, did: best.d.id, dur: info.dur, ...stand }]), res: [] };
  };
  add(ctx, c);
}

// ---- fire and discovery (S7a) ----------------------------------------------------------------------------------------

const FIRE_WORKERS = 2;
/** A free walkable cell next to (or at) an entity's cell, nearest first; null if none. */
function standNear(ctx, e) {
  const w = ctx.sim.world, v = ctx.v;
  let best = null, bd = 1e9;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    for (const dz of [0, 1, -1]) {
      const x = e.x + dx, y = e.y + dy, z = e.z + dz;
      if (!w.isWalkable(x, y, z)) continue;
      const d = dist3(v.x, v.y, v.z, x, y, z);
      if (d < bd) { bd = d; best = { x, y, z }; }
    }
  }
  return best;
}
const fuelStock = (sv, k) => sv.stock[k];

/**
 * Tend fire (standing class, Appendix B job kind): a hearth below FUEL_LOW burning time, while a fire is wanted, gets sticks or logs
 * from the stockpile. If there is no fuel it asks for it the usual derived way (haul what lies loose, else chop). Needs a living
 * knower of FIRE_TENDING (blocker UNKNOWN_CRAFT: nobody remembers how, after the last holder died).
 */
function genTendFire(ctx) {
  const { sim, v, sv } = ctx, hs = entsOf(ctx, "furn:hearth");
  const kfire = hs.length && !fireWanted(sim) && sim.rooms.list.size > 0 && cookable(sv).length > 0 ? kitchens(sim, hs) : null;       // S15: there is food to cook: the kitchen fire is wanted even in summer
  if (!hs.length || (!fireWanted(sim) && !(kfire && kfire.length))) return;
  let best = null, bd = 1e9, rsv = 0;
  for (const h of hs) {
    if (h.fuel >= FUEL_LOW) continue;
    if (kfire && !kfire.some(k => k.hearth === h)) continue;
    if (reservedByOther(sim, h, v.id)) { rsv++; continue; }
    if (isBad(v, h.id, ctx.t)) continue;
    const d = dTo(ctx, h) - (h.rv === v.id ? 1000 : 0);
    if (d < bd) { bd = d; best = h; }
  }
  const base = { cls: "standing", urg: Math.max(0.3, pressure(sim, "warm")), grp: "fire", skill: null };
  const c = { ...base, kind: "tend_fire", key: "tend_fire:" + (best ? best.id : 0) };
  if (!best) {
    if (!rsv) return;                                                   // every hearth is full: nothing to do, nothing to say
    c.blocker = "RESERVED"; c.mk = () => ({ blocker: "RESERVED" }); add(ctx, c); return;
  }
  c.tid = best.id; c.d = bd;
  const holds = v.carry && FUEL_ITEMS.includes(v.carry.item) && v.carry.item !== "grass";
  const fuel = fuelStock(sv, "log") > 0 ? "log" : fuelStock(sv, "stick") > 0 ? "stick" : fuelStock(sv, "dried_peat") > 0 ? "dried_peat" : null;       // S14: dried peat when the wood has run short
  if (!can(sim, "FIRE_TENDING")) c.blocker = "UNKNOWN_CRAFT";
  else if (capped(ctx, "standing", "fire", FIRE_WORKERS)) c.blocker = "MAX_WORKERS";
  else if (!holds && v.carry) c.blocker = "NO_CAPACITY";
  else if (!holds && !fuel) c.blocker = "NO_MATERIAL";
  const uc = urgency(v.warm, ...SOFT.warm);
  if (!c.blocker && uc > 0) { c.cls = "need"; c.u = uc; c.grp = "need"; }         // 10.1: a cold slime with wood in the yard and a dead hearth lights the fire (a need, just above huddling): huddling beside a fire that is out only froze them
  if (c.blocker) c.mk = () => ({ blocker: c.blocker });
  else c.mk = () => {
    const stand = standNear(ctx, best);
    if (!stand || !reach(ctx, stand)) { v.bad.push([best.id, ctx.t + 600]); return { blocker: "NO_PATH" }; }
    const steps = [];
    if (!holds) {
      const stack = stockStack(ctx, fuel);
      if (!stack || !reach(ctx, stack)) return { blocker: "NO_MATERIAL" };
      steps.push({ v: "take", item: fuel, n: Math.min(sv.stock[fuel], carryRoom(v, fuel), fuel === "log" ? 2 : fuel === "dried_peat" ? 3 : 4), ...stack });
    }
    steps.push({ v: "feed", tid: best.id, ...stand });
    return { task: Task("tend_fire", steps), res: [best] };
  };
  add(ctx, c);
  if (c.blocker === "NO_MATERIAL") {
    c.short = "stick";
    const have = heldOf(ctx, "log") + heldOf(ctx, "stick");
    if (looseOf(ctx, "log") > 0) looseCand(ctx, base, "log", false);
    else if (looseOf(ctx, "stick") > 0) looseCand(ctx, base, "stick", false);
    if (have < 2) chopCand(ctx, base, capped(ctx, "standing", "fire", FIRE_WORKERS));
  }
}

// ---- stations and recipes (S7b) --------------------------------------------------------------------------------------

/**
 * Steps that put a tool in hand before the work ahead: with no `item`, the best pick in the stockpile (if it beats what I hold; a spear in hand stays), with an
 * `item` that one (`swap`: even if I hold another tool, which is set down: deep rock wants the iron pick). Only if my hands are empty.
 */
function equipSteps(ctx, item = "", swap = false) {
  const { v, sv } = ctx;
  if (v.carry) return [];
  let want = item;
  if (!want) {
    want = bestPick(ctx.sim);
    if (!want) return [];
    if (v.eq && (!PICKS[v.eq.item] || PICKS[v.eq.item].tier >= PICKS[want].tier)) return [];
  } else if (v.eq && (v.eq.item === want || !swap)) return [];
  if (!(sv.stock[want] > 0)) return [];
  const stack = stockStack(ctx, want);
  return stack && reach(ctx, stack) ? [{ v: "equip", item: want, ...stack }] : [];
}
/** Can this villager have the tool the cell needs (in hand, or one to take from the stockpile)? */
const toolFor = (ctx, need) => !need || (ctx.v.eq && ctx.v.eq.item === need) || ctx.sv.stock[need] > 0;

/**
 * Craft jobs (Appendix B: "craft, burn charcoal, smelt"), derived STANDING-class, one candidate per asked-for product. They exist only
 * while a keep-N on the product is refilling (the player's request) or a keep-N on something that needs it is short of it (copper needs charcoal,
 * a copper pick needs copper: depth-1 expansion). Digging, hauling clay, and any other quarrying stay the player's orders (R8).
 */
function genCraft(ctx) {
  const { sim } = ctx, asked = new Set();
  for (const k of ctx.b.keeps) if (k.on && RECIPES[k.item]) asked.add(k.item);
  if (sim.dp && sim.dp.on && ctx.sick && ctx.sick.length && can(sim, "HERBAL") && heldOf(ctx, "herbal_remedy") < 2) asked.add("herbal_remedy");     // S14: while anyone is sick the village makes remedies without being asked
  if (!asked.size) return;
  const seen = new Set();
  const visit = (product, urg) => {
    if (seen.has(product)) return;
    seen.add(product);
    const rc = RECIPES[product], short = craftCand(ctx, product, rc, urg);
    if (short && RECIPES[short] && sim.board.keeps.some(q => q.on) && heldOf(ctx, short) < rc.inputs[short]) visit(short, 0.5);
  };
  for (const p of RECIPE_ORDER) if (asked.has(p)) {
    const k = sim.board.keeps.find(q => q.item === p) || { n: 2 };
    visit(p, clamp(1 - heldOf(ctx, p) / Math.max(1, k.n), 0, 1));
  }
}
const RECIPE_ORDER = ["iron_pick", "iron_axe", "iron", "cast_pick", "copper_axe", "mould", "fitting", "sheet", "copper_pick", "copper_spear", "copper", "charcoal", "jar", "brick", "fired_clay",
  "cart", "wagon", "wheel", "backpack", "basket", "leather", "cordage", "timber", "stone_axe", "block", "smoked_meat",
  "herbal_remedy", "salted_meat", "dried_meat", "dried_peat", "bone_axe"];

/** One craft candidate. Returns the name of a missing input that another recipe makes (so the caller can derive that job), else null. */
function craftCand(ctx, product, rc, urg) {
  const { sim, v, sv } = ctx;
  const c = { cls: "standing", urg, grp: "craft:" + product, skill: "craft", kind: rc.job, key: rc.job + ":" + product + ":0", kp: "" };
  const sts = entsOf(ctx, "furn:" + rc.station);
  const mine = sts.filter(st => !isBad(v, st.id, ctx.t) && !(st.bn > 0) && loadedFor(st, product, ctx.t) && !reservedByOther(sim, st, v.id));
  // the hottest-fitting free station first (a smelt wants the one that reaches level 4), then the one already holding some of the load, then the nearest
  let best = null, bk = 1e9;
  for (const st of mine) {
    const k = (heatOk(sim, st, rc) ? 100000 : 0) + (st.rcp === product ? -5000 : 0) + dTo(ctx, st) - (st.rv === v.id ? 3000 : 0);
    if (k < bk) { bk = k; best = st; }
  }
  let shortItem = null;
  if (best) { c.key = rc.job + ":" + product + ":" + best.id; c.tid = best.id; c.d = dTo(ctx, best); }
  const need = best ? missing(best, rc) : rc.inputs;
  for (const k of Object.keys(need)) if (sv.stock[k] < need[k]) { shortItem = k; break; }
  if (!shortItem && rc.tool && !rc.tool.some(t => sv.stock[t] > 0)) shortItem = rc.tool[0];                // S9: framing wants an axe in the village (not used up)
  if (!can(sim, rc.craft)) c.blocker = "UNKNOWN_CRAFT";
  else if (!sts.length) c.blocker = belFlags.off ? "NO_STATION" : noPlace(ctx, "furn:" + rc.station);
  else if (!best) c.blocker = "STATION_BUSY";
  else if (heatOk(sim, best, rc)) c.blocker = "TOO_COLD";
  else if (rc.air && !dryAir(sim, best)) c.blocker = "NO_SEASON";
  else if (shortItem) { c.blocker = "NO_MATERIAL"; c.short = shortItem; }
  else if (capped(ctx, "standing", c.grp, 1)) c.blocker = "MAX_WORKERS";
  else if (v.carry) c.blocker = "NO_CAPACITY";
  if (c.blocker) { c.mk = () => ({ blocker: c.blocker }); add(ctx, c); return c.blocker === "NO_MATERIAL" ? shortItem : null; }
  c.mk = () => {
    const stand = standNear(ctx, best);
    if (!stand || !reach(ctx, stand)) { v.bad.push([best.id, ctx.t + 600]); return { blocker: "NO_PATH" }; }
    const steps = [], miss = missing(best, rc);
    for (const item of Object.keys(rc.inputs)) {
      let rem = miss[item] || 0;
      while (rem > 0) {
        const n = Math.min(rem, carryRoom(v, item));
        if (n <= 0) return { blocker: "NO_CAPACITY" };
        const stack = stockStack(ctx, item);
        if (!stack || !reach(ctx, stack)) return { blocker: "NO_MATERIAL" };
        steps.push({ v: "take", item, n, ...stack }, { v: "load", tid: best.id, item, n, rcp: product, cr: rc.craft, ...stand });
        rem -= n;
      }
    }
    steps.push(rc.work ? { v: "make", tid: best.id, rcp: product, cr: rc.craft, dur: rc.dur, ...stand } : { v: "light", tid: best.id, rcp: product, cr: rc.craft, ...stand });
    return { task: Task(rc.job, steps), res: [best] };
  };
  add(ctx, c);
  return null;
}

/**
 * Fetch water (demand class): a water jar below half full gets filled from the stream, so the people working far from the shore have
 * somewhere to drink. A jar of water by the work cuts the thirst trips (GDD "carry_water").
 */
function genFetchWater(ctx) {
  const { sim, v } = ctx;
  let jar = null, jf = 1e9;
  for (const f of entsOf(ctx, "furn:waterjar")) if (f.fill < JAR_CAP / 2 && !isBad(v, f.id, ctx.t) && !reservedByOther(sim, f, v.id)) { const k = f.fill + dTo(ctx, f) * 0.1; if (k < jf) { jf = k; jar = f; } }
  if (!jar) return;
  const c = { cls: "demand", urg: clamp(1 - jar.fill / JAR_CAP, 0, 1), grp: "water", kind: "fetch_water", skill: null, tid: jar.id, d: dTo(ctx, jar), key: "fetch_water:" + jar.id };
  if (capped(ctx, "demand", "water", 1)) c.blocker = "MAX_WORKERS";
  if (c.blocker) { c.mk = () => ({ blocker: c.blocker }); add(ctx, c); return; }
  c.mk = () => {
    let best = null, bd = 1e9;
    for (const e of waterNear(ctx, waterEdges(sim))) { const d = Math.abs(e[0] - jar.x) + Math.abs(e[1] - jar.y); if (d < bd && !isBad(v, e[0] * 1000 + e[1], ctx.t)) { bd = d; best = e; } }
    const stand = standNear(ctx, jar);
    if (!best) return { blocker: belFlags.off ? "NO_WATER" : "UNKNOWN_PLACE" };
    const st = { x: best[0], y: best[1], z: best[2] };
    if (!stand || !reach(ctx, st) || !reach(ctx, stand)) { v.bad.push([jar.id, ctx.t + 600]); return { blocker: "NO_PATH" }; }
    return { task: Task("fetch_water", [{ v: "fill", ...st }, { v: "pour", tid: jar.id, ...stand }]), res: [jar] };
  };
  add(ctx, c);
}

/**
 * Tinker (GDD §15.4): an experiment with what is in reach. Leisure class normally; standing when the player asked this villager to
 * investigate. Only offered while something nags at the village (an itch) and there is something new to try; the Why panel says why not.
 */
export const TINKER = { share: 20 };  // 10.1 (a test sets share 100: the mood roll is a deliberate gate)
export const TINKER_SHARE = 20;       // 10.1: percent of spans in which an idle slime, nobody having asked, is in the mood to experiment (was every span: autonomous discovery drove steady progress)
export const TINKER_SPAN = 6000;      // ticks: one mood lasts this long (a flat constant)
export const TINKER_HANDS = 1;        // unasked experimenters it tolerates in view (was 3; "Investigate" still allows 3)
function genTinker(ctx) {
  const { sim, v, sv } = ctx;
  const ask = askActive(sim), asked = !!(ask && ask.ids.includes(v.id));
  if (!asked && !itchAt(sim)) return;
  if (!asked && mix32(v.id, Math.floor(ctx.t / TINKER_SPAN)) % 100 >= TINKER.share) return;       // 10.1: unasked, a slime is in a tinkering mood only a share of the time (its own roll per span)
  const cls = asked ? "standing" : "leisure";
  const c = { kind: "tinker", cls, urg: asked ? 0.6 : 1, grp: "tinker", skill: null, key: "tinker:0" };
  const all = tinkerCandidates(sim);
  const cooled = (k) => ctx.t - (sim.disc.cd[cdKey(k.site, k.item)] ?? -1e9) >= DUR_DAY;      // S18b: a retry of the same experiment waits a game day (it was 1800 ticks = 1 day)
  const mine = v.carry ? v.carry.item : "";                             // already holding the material (taken for this experiment): carry on with it
  let ready = all.filter(k => (asked || k.nov) && cooled(k) && (k.item === "deadwood" || sv.stock[k.item] > 0 || k.item === mine) && (!k.with || sv.stock[k.with] > 0));
  if (mine) ready = ready.filter(k => k.item === mine);
  if (!all.length) c.blocker = "NO_CANDIDATE";
  else if (!ready.length) c.blocker = v.carry ? "NO_CAPACITY" : all.some(k => !cooled(k)) ? "COOLDOWN" : "NO_CANDIDATE";
  else if (capped(ctx, cls, "tinker", asked ? 3 : TINKER_HANDS)) c.blocker = "MAX_WORKERS";
  if (c.blocker) { c.mk = () => ({ blocker: c.blocker }); add(ctx, c); return; }
  const top = ready[0];
  c.d = dTo(ctx, top.site);
  c.mk = () => {
    const k = pickCandidate(sim, ready, false, v);
    const s = k.site;
    let stand = s.kind === "camp" ? (sim.world.isWalkable(s.x, s.y, s.z) ? { x: s.x, y: s.y, z: s.z } : standNear(ctx, s)) : standNear(ctx, s);
    if (!stand || !reach(ctx, stand)) return { blocker: "NO_PATH" };
    const steps = [];
    if (k.item !== "deadwood" && k.item !== mine) {
      const stack = stockStack(ctx, k.item);
      if (!stack || !reach(ctx, stack)) return { blocker: "NO_MATERIAL" };
      steps.push({ v: "take", item: k.item, n: 1, ...stack });
    }
    steps.push({ v: "tinker", item: k.item, with: k.with || "", fuel: k.fuel || "", verb: k.verb, site: s, dur: Math.min(VERB_DUR[k.verb], TINKER_WORK), ...stand });      // a long "leave" is set up in a few minutes and left to its time (the attempt is judged on the full duration)
    return { task: Task("tinker", steps), res: [] };
  };
  add(ctx, c);
}

/** Marked pieces (S4b): take the nearest one down. Same standing class and hand cap as building. */
function genDeconstruct(ctx) {
  const { sim, v } = ctx, ds = entsOf(ctx, "site").filter(e => e.kind === "dsite");
  if (!ds.length) return;
  const cap = shareCap(demandOf(ctx), HAND_SHARE);
  let best = null, bd = 1e9, rsv = 0;
  for (const d of ds) {
    if (reservedByOther(sim, d, v.id)) { rsv++; continue; }
    if (isBad(v, d.id, ctx.t)) continue;
    const dd = dTo(ctx, d) - (d.rv === v.id ? 1000 : 0);
    if (dd < bd) { bd = dd; best = d; }
  }
  const c = { cls: "standing", urg: 0.4, grp: "construct", kind: "deconstruct", skill: null, key: "deconstruct:" + (best ? best.id : 0) };
  if (!best) { c.blocker = rsv ? "RESERVED" : "NO_PATH"; c.mk = () => ({ blocker: c.blocker }); add(ctx, c); return; }
  c.tid = best.id; c.d = dTo(ctx, best);
  if (capped(ctx, "standing", "construct", cap)) c.blocker = "MAX_WORKERS";
  if (c.blocker) c.mk = () => ({ blocker: c.blocker });
  else c.mk = () => {
    let stand = null, sd = 1e9;
    const solid = best.w === "wall";                       // a wall's own cell is filled: stand beside it
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (solid && dx === 0 && dy === 0) continue;
      const x = best.x + dx, y = best.y + dy;
      if (!sim.world.isWalkable(x, y, best.z)) continue;
      const d = dist3(v.x, v.y, v.z, x, y, best.z);
      if (d < sd) { sd = d; stand = { x, y, z: best.z }; }
    }
    if (!stand || !reach(ctx, stand)) { v.bad.push([best.id, ctx.t + 600]); return { blocker: "NO_PATH" }; }
    return { task: Task("deconstruct", [{ v: "unbuild", tid: best.id, dur: UNBUILD_DUR[best.w], ...stand }]), res: [best] };
  };
  add(ctx, c);
}

// ---- village-level critical, standing, demand, orders ------------------------------

function genVillage(ctx) {
  const d = demandOf(ctx);                                                    // 9.30: critical as THIS slime reads it (its larder reading, the neighbours it saw), not the board's flags
  if (d.fc) foodChain(ctx, "vcrit", { uv: d.uvf, urg: 1, cap: shareCap(d, CRIT_SHARE), grp: "food", urgDry: 1 });
  if (d.sc) buildChain(ctx, "vcrit", "bed", { uv: d.uvs, urg: 1, cap: bedCap(d), grp: "shelter" });
  // food-critical with too few racks (none, or fresh food piling up unsaved): a rack is part of the cure (derived, same class)
  if (d.fc && d.rack > 0 && (!ctx.vl.racks.length || ctx.sv.stock.berry >= 8)) buildChain(ctx, "vcrit", "rack", { uv: 1, urg: 1, cap: 1, grp: "rack" });     // no rack = no banking: ahead of foraging
}

// Keep-N for non-food items must not eat the village's hands (S4b playtest fix, GDD §09 hand cap). 9.30: judged by the hands this slime can SEE on non-food keep-N
// work (HAND_SHARE of the slimes it knows of, KEEP_SHARE while it believes food, beds or racks are short), not by a share of the village's adults.
const FOOD_KP = new Set(["berry", "dried"]);

/** Are the non-food keep-N jobs (chop, gather, haul of kept items) already using their share of the hands? */
function keepFull(ctx) {
  const w = tally(ctx);
  let kw = 0;                                                    // other slimes in view already on non-food keep-N work
  for (const k in w) if (k.startsWith("standing:kp:") && !FOOD_KP.has(k.slice(12))) kw += w[k];
  const d = demandOf(ctx);
  return kw >= (shortOf(d) ? Math.max(1, Math.floor(KEEP_SHARE * d.heads)) : shareCap(d, HAND_SHARE));     // this slime believes food, beds or racks are short: their hands go there first
}

function genStanding(ctx) {
  const b = ctx.b, kfull = keepFull(ctx);
  for (const k of b.keeps) {
    if (!k.on) continue;
    const have = heldOf(ctx, k.item);
    const base = { cls: "standing", urg: clamp(1 - have / k.n, 0, 1), grp: "kp:" + k.item, kp: k.item };
    const food = FOOD_KP.has(k.item);
    const full = capped(ctx, "standing", base.grp, 3) || (!food && kfull);     // maxWorkers per standing order (§09 default 3)
    if (k.item === "berry") foodChain(ctx, "standing", { urg: base.urg, cap: 3, grp: base.grp, kp: k.item, dry: false });
    else if (k.item === "dried") { foodChain(ctx, "standing", { urg: base.urg, cap: 3, grp: base.grp, kp: k.item }); }
    else if (k.item === "grass") gatherCand(ctx, base, full);
    else if (RECIPES[k.item] || !(k.item === "stick" || k.item === "log")) continue;         // S7b: made things (and dug things) have their own jobs (genCraft); only wood is chopped
    else chopCand(ctx, base, full);                              // stick, log
  }
}

function genDemand(ctx) {
  const d = demandOf(ctx);                                                    // 9.30: this slime's own demand (belief-fed); the idle pull: a slime between jobs takes the matching work
  if (d.food > 0) foodChain(ctx, "demand", { urg: d.food, urgDry: Math.max(d.preserve, d.food), cap: foodCap(d, d.food), grp: "food", pull: true });
  else if (d.preserve > 0) foodChain(ctx, "demand", { urg: d.preserve, cap: 2, grp: "food", forage: false, pull: true });
  const run = ctx.cur ? ctx.cur.k : "";                                       // a bed or rack under way stays a candidate: others' sites coming up must not make it drop the work in its hands
  if (d.shelter > 0 || run === "build_bed") buildChain(ctx, "demand", "bed", { urg: Math.max(d.shelter, 0.1), cap: bedCap(d), grp: "shelter", pull: true });
  if (d.rack > 0 || run === "build_rack") buildChain(ctx, "demand", "rack", { urg: Math.max(d.rack, 0.1), cap: 1, grp: "rack", pull: true });
  genWoodBank(ctx);
}

export const WOOD_BANK = 80;           // 10.1: logs per hearth a slime wants in the yard by midwinter (it wants WOOD_BANK * winterAhead; a log is about 1300 ticks of fire). The fire was only fed when the yard ran dry, so a village with an empty yard froze through the end of winter
export const WOOD_HANDS = 2;           // choppers it tolerates in view while it banks wood
/** Autumn wood for the winter fire: a slime that knows a hearth, and sees the yard short of wood for the coming cold, chops (an idle pull, like the other shortages). */
function genWoodBank(ctx) {
  const { sim, v, sv } = ctx, wa = winterAhead(ctx.t);
  if (wa <= 0 || belFlags.off || !can(sim, "FIRE_TENDING")) return;
  const hs = entsOf(ctx, "furn:hearth").length;
  if (!hs) return;
  const want = hs * WOOD_BANK * wa, have = sv.stock.log + sv.stock.stick / 2 + heldOf(ctx, "log");
  if (have >= want) return;
  const base = { cls: "demand", urg: clamp((want - have) / want, 0, 1), grp: "wood", pull: true };
  chopCand(ctx, base, capped(ctx, "demand", "wood", WOOD_HANDS));
}

const ORDER_SKILL = { move: null, dig: "dig", clear: null, capture: null, scout: null, disarm: "craft", clear_area: null };

/** The entities of one kind inside an order's area (ORDER_AREA round where it was given, five levels either way), found cell by cell, in id order. With beliefs off: the old world scan. */
function inArea(sim, o, kind) {
  if (belFlags.off) return sim.ents.ofKind(kind);
  const out = [];
  const w = sim.world;
  for (let x = o.x - ORDER_AREA; x <= o.x + ORDER_AREA; x++) for (let y = o.y - ORDER_AREA; y <= o.y + ORDER_AREA; y++) {
    const g = w.standZ(x, y), lo = g >= 0 ? Math.min(o.z - 5, g - 2) : o.z - 5, hi = g >= 0 ? Math.max(o.z + 5, g + 2) : o.z + 5;      // the order's level, and the ground of the column (an order given on a tree cell has no stand level of its own)
    for (let z = lo; z <= hi; z++) for (const id of sim.ents.at(x, y, z)) { const e = sim.ents.get(id); if (e && e.kind === kind) out.push(e); }
  }
  return out.sort((a, b) => a.id - b.id);
}
/** Targets of an area order (clear a den, capture): its named entity if still valid, else the nearest valid one within ORDER_AREA. */
function orderTarget(ctx, o) {
  const { sim, v, t } = ctx;
  let best = null, bd = 1e9, any = false, rsv = 0;
  const consider = (e) => {
    if (e.burn) return;
    if (Math.abs(e.x - o.x) > ORDER_AREA || Math.abs(e.y - o.y) > ORDER_AREA) return;
    any = true;
    if (reservedByOther(sim, e, v.id)) { rsv++; return; }
    if (isBad(v, e.id, t)) return;
    const d = dTo(ctx, e) - (e.id === o.tid ? 1000 : 0);
    if (d < bd) { bd = d; best = e; }
  };
  // A player's order names the AREA it covers (OD-58: an order is delivered to the slimes it targets, so it may be telepathic in what it commands): the area's own cells are read with the grid, never the whole world.
  if (o.verb === "clear") {                                       // 7.22: spear crews clear a den of its monsters (never the core guardian: that fight is for a guided villager)
    for (const f of inArea(sim, o, "fauna")) if (FAUNA[f.sp].mon && !FAUNA[f.sp].boss) consider(f);
  } else if (o.verb === "capture") {
    for (const f of inArea(sim, o, "fauna")) if (FAUNA[f.sp].tamable && !f.tame && (f.st !== "held" || f.by === v.id)) consider(f);     // (the one I am carrying stays my target until it is let go in the pen)
  }
  return { e: best, any, rsv };
}

/** Dig order: the diggable cells at the ordered level inside a small patch; stand beside one and take it out. */
function genDig(ctx, base) {
  const { sim, v, t } = ctx, o = v.order, w = sim.world;
  let best = null, bd = 1e9;
  for (let dy = -DIG_AREA; dy <= DIG_AREA; dy++) for (let dx = -DIG_AREA; dx <= DIG_AREA; dx++) {
    const x = o.x + dx, y = o.y + dy;
    if (!diggable(sim, x, y, o.z) || isBad(v, DIG_BAD + World.idx(x, y, o.z), t)) continue;
    if (!toolFor(ctx, toolNeeded(sim, x, y, o.z))) continue;                    // S9: deep rock waits for an iron pick
    const d = dist3(v.x, v.y, v.z, x, y, o.z);
    if (d < bd) { bd = d; best = [x, y, o.z]; }
  }
  if (!best) {
    let any = false;
    for (let dy = -DIG_AREA; dy <= DIG_AREA && !any; dy++) for (let dx = -DIG_AREA; dx <= DIG_AREA; dx++) if (diggable(sim, o.x + dx, o.y + dy, o.z)) { any = true; break; }
    if (!any) { if (!ctx.dry) { v.order = null; ctx.b.ep++; } return; }     // nothing left to dig here: order complete
    add(ctx, { ...base, kind: "dig", blocker: "NO_PATH", mk: () => ({ blocker: "NO_PATH" }) });
    return;
  }
  const [cx, cy, cz] = best, bad = DIG_BAD + World.idx(cx, cy, cz);
  const c = { ...base, kind: "dig", key: "dig:" + bad, d: bd };
  c.mk = () => {
    let stand = null, sd = 1e9;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dz of [1, 0]) {
      const x = cx + dx, y = cy + dy, z = cz + dz;
      if (!w.isWalkable(x, y, z)) continue;
      const d = dist3(v.x, v.y, v.z, x, y, z);
      if (d < sd) { sd = d; stand = { x, y, z }; }
    }
    if (!stand || !reach(ctx, stand)) { v.bad.push([bad, ctx.t + 600]); return { blocker: "NO_PATH" }; }
    const need = toolNeeded(sim, cx, cy, cz);
    if (need && v.carry) return { blocker: "NO_CAPACITY" };
    return { task: Task("dig", [...(need ? equipSteps(ctx, need, true) : equipSteps(ctx)), { v: "dig", cx, cy, cz, dur: DIG[w.mat(cx, cy, cz)].dur, ...stand }]), res: [] };
  };
  add(ctx, c);
}
const DIG_BAD = 10000000;           // "bad target" ids for cells live above any entity id

/** 7.21 disarm order: stand beside the spotted trap at the ordered cell and defuse it (a craft job). The order ends when the trap is gone. */
function genDisarm(ctx, base) {
  const { sim, v } = ctx, o = v.order, w = sim.world;
  const tr = seenTrapNear(sim, o.x, o.y, o.z);
  if (!tr) { if (!ctx.dry) { v.order = null; ctx.b.ep++; } return; }
  const c = { ...base, kind: "disarm", key: "disarm:" + World.idx(tr.x, tr.y, tr.z), d: dist3(v.x, v.y, v.z, tr.x, tr.y, tr.z) };
  c.mk = () => {
    let stand = null, sd = 1e9;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = tr.x + dx, y = tr.y + dy;
      if (!w.isWalkable(x, y, tr.z)) continue;
      const d = dist3(v.x, v.y, v.z, x, y, tr.z);
      if (d < sd) { sd = d; stand = { x, y, z: tr.z }; }
    }
    if (!stand || !reach(ctx, stand)) return { blocker: "NO_PATH" };
    return { task: Task("disarm", [{ v: "disarm", tx: tr.x, ty: tr.y, tz: tr.z, ...stand }]), res: [] };
  };
  add(ctx, c);
}

/** S17 scout: walk toward unexplored land in hops of SCOUT_HOP cells (a path to a goal 150 cells away would only read BUDGET); the order ends when they stand there. */
const SCOUT_HOP = 20;
function genScout(ctx, base) {
  const { v, sim } = ctx, o = v.order, dx = o.x - v.x, dy = o.y - v.y, far = Math.max(Math.abs(dx), Math.abs(dy));
  if (far <= 3) { if (!ctx.dry) { v.order = null; ctx.b.ep++; } return; }
  const hop = Math.min(far, SCOUT_HOP), tx = v.x + Math.round((dx * hop) / far), ty = v.y + Math.round((dy * hop) / far);
  const c = { ...base, kind: "scout", key: "scout:" + tx + "," + ty, d: far };
  c.mk = () => {
    let st = null;
    for (let r = 0; r <= 6 && !st; r++) for (let l = -r; l <= r && !st; l++) for (const [a, b] of r === 0 ? [[0, 0]] : [[l, -r], [l, r], [-r, l], [r, l]]) {
      const x = tx + a, y = ty + b, z = sim.world.standZ(x, y);
      if (z >= 0 && !sim.ents.at(x, y, z).some(id => sim.ents.get(id).kind !== "item" && sim.ents.get(id).kind !== "villager") && (Math.abs(x - o.x) + Math.abs(y - o.y) < Math.abs(v.x - o.x) + Math.abs(v.y - o.y)) && reach(ctx, { x, y, z })) { st = { x, y, z }; break; }
    }
    if (!st) { o.fail = (o.fail || 0) + 1; if (o.fail > 6 && !ctx.dry) { v.order = null; ctx.b.ep++; } return { blocker: "NO_PATH" }; }
    return { task: Task("scout", [{ v: "goto", ...st }]), res: [] };
  };
  add(ctx, c);
}

function genOrder(ctx) {
  const { v, sim, t } = ctx, o = v.order;
  if (!o) return;
  const base = { cls: "order", urg: clamp((t - o.t0) / 900, 0, 1), grp: "order", skill: ORDER_SKILL[o.verb] };
  if (o.verb === "clear_area") return;                              // (genClear works it)
  if (o.verb === "dig") { genDig(ctx, base); return; }
  if (o.verb === "scout") { genScout(ctx, base); return; }
  if (o.verb === "disarm") { genDisarm(ctx, base); return; }
  if (o.verb === "move") {
    const c = { ...base, kind: "goto", key: "goto:0", d: dist3(v.x, v.y, v.z, o.x, o.y, o.z) };
    c.mk = () => {
      const st = { x: o.x, y: o.y, z: o.z };
      if (!sim.world.isWalkable(st.x, st.y, st.z)) return { blocker: "NO_PATH" };
      return reach(ctx, st) ? { task: Task("goto", [{ v: "goto", ...st }]), res: [] } : { blocker: "NO_PATH" };
    };
    add(ctx, c);
    return;
  }
  const kind = o.verb === "clear" ? "hunt" : "capture";
  const { e, any, rsv } = orderTarget(ctx, o);
  const c = { ...base, kind };
  if (!e) {
    if (!any) { v.order = null; ctx.b.ep++; return; }                                                // the area is empty: the order is complete
    c.blocker = rsv ? "RESERVED" : "NO_TARGET";
    c.mk = () => ({ blocker: c.blocker });
  } else {
    c.tid = e.id; c.d = dTo(ctx, e);
    if (o.verb === "clear") {
      c.clr = 1;
      const hm = huntMk(ctx, e);
      c.mk = () => ctx.v.eq && ctx.v.eq.item === "copper_spear" || ctx.sv.stock.copper_spear > 0 ? hm() : { blocker: "NO_MATERIAL" };      // a den is cleared with spears, never bare-handed
    } else c.mk = captureMk(ctx, HELP, e);
  }
  add(ctx, c);
}

// ---- assignments (9.34, D58): a role the slime keeps ----------------------------------------------------------------------------------------------------------------------

const ASSIGN_BK = { chop: "tree", forage: "food", gather: "food", hunt: "game*", haul: "loose" };
const ASSIGN_KIND = { chop: "chop", forage: "forage", gather: "cut", hunt: "hunt", haul: "haul" };
const ASSIGN_STEP = { chop: "chop", forage: "pick", gather: "cut", haul: "pickup" };
/** Is this thing one the role works right now? */
function assignable(ctx, task, e) {
  const { sim, v, t } = ctx;
  if (e.burn) return false;
  if (task === "hunt") return e.kind === "fauna" && FAUNA[e.sp].huntable && !e.tame && e.st !== "held";
  if (task === "haul") return e.kind === "item" && !inStore(sim, e.x, e.y, e.z) && carryRoom(v, e.item) > 0;
  if (e.kind !== "plant") return false;
  if (task === "chop") return e.species === "tree";
  if (task === "forage") return e.species === "berry" && e.yield > 0 && berrySeason(t);
  return e.species === "tuft" && e.yield > 0;
}
/**
 * A slime's assignment (`v.as`): the named thing first, then the nearest thing of its kind that the slime BELIEVES in (entsOf: nothing it has not seen or heard of) to where it last worked, for good.
 * Nothing believed: it walks to the spot it was sent to, then to the patch it remembers that has gone, then out on search trips (the 9.32 trip) until its look finds some. Class 300, so needs and
 * flight outrank it; being the slime's own job it takes no request and no pull. A direct order of another kind (move, dig ...) goes first and the assignment resumes afterwards.
 */
function genAssign(ctx) {
  const { sim, v, t } = ctx, a = v.as;
  if (!a || v.order) return;
  const task = a.task, kind = ASSIGN_KIND[task], bk = ASSIGN_BK[task];
  const base = { cls: "order", urg: 0.3, grp: "assign", skill: null };
  let best = null, bd = 1e9, rsv = 0;
  const consider = (e, bonus) => {
    if (!assignable(ctx, task, e)) return;
    if (reservedByOther(sim, e, v.id)) { rsv++; return; }
    if (isBad(v, e.id, t)) return;
    const d = Math.abs(e.x - a.x) + Math.abs(e.y - a.y) - bonus;
    if (d < bd || d === bd && best && e.id < best.id) { bd = d; best = e; }
  };
  const named = a.tid ? sim.ents.get(a.tid) : null;
  const pool = entsOf(ctx, bk);
  for (const e of pool) consider(e, e === named ? 1000 : 0);
  if (named && !pool.includes(named)) consider(named, 1000);               // (the player pointed at it)
  if (best) {
    const e = best, c = { ...base, kind, tid: e.id, d: dTo(ctx, e), key: kind + ":" + e.id };
    const carryOk = task === "chop" ? !v.carry : task === "haul" || task === "hunt" ? true : carryRoom(v, task === "forage" ? "berry" : "grass") > 0;
    if (!carryOk) { c.blocker = "NO_CAPACITY"; c.mk = () => ({ blocker: c.blocker }); }
    else c.mk = task === "hunt" ? huntMk(ctx, e) : oneStep(kind, ASSIGN_STEP[task], e);
    add(ctx, c);
    return;
  }
  if (task === "forage" && !berrySeason(t)) { add(ctx, { ...base, kind, blocker: "NO_SEASON", mk: () => ({ blocker: "NO_SEASON" }) }); return; }
  if (rsv) { add(ctx, { ...base, kind, blocker: "RESERVED", mk: () => ({ blocker: "RESERVED" }) }); return; }
  // nothing it believes in: go and look (the spot it was sent to, then the patch it remembers, then the search trips)
  const n = v.sf || 0, gz = sim.world.standZ(a.x, a.y);
  const f = bk.endsWith("*") ? null : nearestFact(v, bk, a.x, a.y, t), fz = f ? sim.world.standZ(f[1], f[2]) : -1;
  const tg = a.go && gz >= 0 ? { x: a.x, y: a.y, z: gz } : f && fz >= 0 && Math.abs(f[1] - v.x) + Math.abs(f[2] - v.y) > 2 ? { x: f[1], y: f[2], z: fz } : tripTarget(ctx, n);
  if (!tg) { const b = noPlace(ctx, bk); add(ctx, { ...base, kind, blocker: b, mk: () => ({ blocker: b }) }); return; }
  const c = { ...base, kind: "search", d: 0, key: "search:" + tg.x + "," + tg.y };
  c.mk = () => {
    if (!reach(ctx, tg)) { v.sf = n + 1; return { blocker: "NO_PATH" }; }
    return { task: Task("search", [{ v: "survey", sf: 1, ag: 1, ...tg }]), res: [] };
  };
  add(ctx, c);
}

/** Clear area (clear.js): the rectangle's trees, bushes and tufts, one at a time. An ordered slime works only its own rectangle and the order ends with it; any other works the rectangles it has read of (a chore for a slime between jobs). */
function genClear(ctx) {
  const { sim, v, t } = ctx, L = sim.clr;
  if (!L || !L.list.length) return;
  const o = v.order && v.order.verb === "clear_area" ? v.order : null;
  const going = !!(v.job && v.job.k === "grub");
  let gate = null;
  if (!o && !going && !belFlags.off && v.bel) { gate = []; for (const f of v.bel) if (f[0] === "clear") gate.push(f); if (!gate.length) return; }
  let best = null, bd = 1e9, any = false, rsv = 0;
  for (const r of L.list) {
    if (o) { if (r.id !== o.cid) continue; }
    else if (gate) { const m = centreOf(r); if (!gate.some(f => Math.abs(f[1] - m.x) <= CLEAR_SEE && Math.abs(f[2] - m.y) <= CLEAR_SEE)) continue; }
    for (const e of clearTargets(sim, r)) {
      any = true;
      if (reservedByOther(sim, e, v.id)) { rsv++; continue; }
      if (isBad(v, e.id, t)) continue;
      const d = dTo(ctx, e) - (going && v.job.tid === e.id ? 1000 : 0);
      if (d < bd) { bd = d; best = e; }
    }
  }
  if (o && !any) { if (!ctx.dry) { v.order = null; ctx.b.ep++; } return; }
  const base = o ? { cls: "order", urg: clamp((t - o.t0) / 900, 0, 1), grp: "order", skill: null } : { cls: "standing", urg: 0.5, grp: "clear", skill: null, pull: true };
  if (!best) { if (any) add(ctx, { ...base, kind: "grub", blocker: rsv ? "RESERVED" : "NO_TARGET", mk: () => ({ blocker: rsv ? "RESERVED" : "NO_TARGET" }) }); return; }
  const c = { ...base, kind: "grub", tid: best.id, d: bd, key: "grub:" + best.id };
  if (!o && capped(ctx, "standing", "clear", mineCap(ctx))) { c.blocker = "MAX_WORKERS"; c.mk = () => ({ blocker: c.blocker }); }
  else c.mk = oneStep("grub", "grub", best, { dur: GRUB_DUR[best.species] });
  add(ctx, c);
}

// ---- scoring -----------------------------------------------------------------

function temper(v, kind) { return mix32(v.id, kh(kind)) / 4294967296; }     // 0..1; term = 5*(2h-1) = +/-5

function scoreCand(ctx, c) {
  const { v } = ctx;
  const base = c.cls === "need" ? 400 * c.u - (NEED_RANK[c.kind] || 0) : c.cls === "vcrit" ? 350 + 50 * (c.uv || 0) : BASE[c.cls];
  const d = c.d || 0;
  const p = {
    base,
    urg: c.cls === "need" || c.cls === "vcrit" ? 0 : 30 * (c.urg || 0),     // classBase already carries the urgency of a critical job
    fit: Math.max(c.skill ? 60 * level(v, c.skill) : 0, c.gather ? GATHER_FIT * geneMul(v.t.speed) : 0),     // sun-drying is craft XP but also start knowledge, so it keeps the forager's flat fit
    prox: c.cls === "need" ? 0 : 10 * clamp(1 - d / MAX_SCAN, 0, 1),         // needs: distance is n/a (a thirsty villager walks as far as it must)
    path: c.cls === "need" ? 0 : -Math.min(20, d * 0.2),
    pref: c.skill && c.skill === ctx.pref ? 10 : 0,
    ill: illBias(ctx, c),                                                    // S14: well villagers keep clear of the sick when they can
    soc: socBonus(ctx, c),                                                  // S13: friends work beside each other, rivals keep apart
    crew: crewBonus(ctx.ctask, c),                                        // S11 (R6): the crew's default task is a preference like the preferred craft: inside the within-class clamp, standing/demand class only
    tmp: c.cls === "standing" || c.cls === "demand" || c.cls === "leisure" ? 5 * (2 * temper(v, c.kind) - 1) : 0,   // orders bypass temper (R5)
    sw: 0,
  };
  if (c.cls !== "need" && c.cls !== "vcrit" && v.mem && v.mem.length) { const m = memBias(v, candSubjects(ctx.sim, c)); if (m) p.mem = m; }      // experiment: what the slime has lived through (memory.js), +-20, inside the clamp; absent for an empty memory
  const cur = ctx.cur;
  if (cur && c.key !== cur.key && ctx.t - cur.t0 < COMMIT && c.cls !== "vcrit" && !(c.cls === "need" && c.u > 0.5)) p.sw = -SWITCH_COST;
  const within = clamp(p.urg + p.fit + p.prox + p.path + p.pref + p.soc + p.ill + p.crew + p.tmp + p.sw + (p.mem || 0), -WITHIN_CLAMP, WITHIN_CLAMP);
  c.parts = p; c.score = c.cls === "vcrit" ? Math.min(VCRIT_CAP, base + within) : base + within;
  // Low mood pre-empts orders (§08) but not a hungry village: leisure may not outrank village-critical.
  if (c.cls === "need" && c.kind === "leisure") c.score = Math.min(c.score, MOOD_CAP);
}

// ---- the decision -------------------------------------------------------------

/**
 * Score everything, take the best candidate that can actually run, and record
 * why. With replan=true, keeps the running action when it is still the best.
 * Returns true if a (new) action was assigned.
 */
export function plan(sim, v, replan, probe, dry) {
  if (!guard.on) return planWith(sim, v, replan, probe, dry);
  guard.in++; guard.scope = "makeCtx";                    // dev guard (entities.js): a whole-world ofKind from here on is a planner reading the world
  try { return planWith(sim, v, replan, probe, dry); } finally { guard.in--; }
}
/** Run one candidate generator under its own guard scope (the scope names the planner in a guard hit). */
const gen = (name, f, ctx, a, b) => { if (guard.in) guard.scope = name; return f(ctx, a, b); };
function planWith(sim, v, replan, probe, dry) {
  const ctx = makeCtx(sim, v, dry);
  const adult = isAdult(sim, v);
  gen("genNeeds", genNeeds, ctx); gen("genSearchFood", genSearchFood, ctx); gen("genFlee", genFlee, ctx); gen("genMend", genMend, ctx); gen("genSick", genSick, ctx);
  if (adult) {
    gen("genVillage", genVillage, ctx); gen("genOrder", genOrder, ctx); gen("genAssign", genAssign, ctx); gen("genClear", genClear, ctx); gen("genExpedition", genExpedition, ctx); gen("genStanding", genStanding, ctx); gen("genFarm", genFarm, ctx, HELP); gen("genPens", genPens, ctx, HELP);
    gen("genConstruct", genConstruct, ctx); gen("genMine", genMine, ctx); gen("genDeconstruct", genDeconstruct, ctx); gen("genTendFire", genTendFire, ctx); gen("genCook", genCook, ctx); gen("genCraft", genCraft, ctx);
    gen("genFetchWater", genFetchWater, ctx); gen("genDemand", genDemand, ctx); if (demandOf(ctx).food > 0) gen("genHunt", genHunt, ctx);
    gen("genHaul", genHaul, ctx, (item) => {
      const k = sim.board.keeps.find(q => q.item === item && q.on);
      return k ? { cls: "standing", kp: item } : { cls: "demand", kp: "" };
    });
  }
  if (adult) { gen("genTinker", genTinker, ctx); gen("genExplore", genExplore, ctx, HELP); gen("genRequests", genRequests, ctx, HELP); gen("genBoard", genBoard, ctx, HELP); gen("genLook", genLook, ctx, HELP); }     // 9.31: the request it took at the board; the walk to the board
  if (guard.in) guard.scope = "plan";
  add(ctx, { kind: "leisure", cls: "leisure", urg: (1 - v.mood) * 0.5, grp: "leisure", d: 0, key: "leisure:0", mk: () => ({ task: Wander(), res: [] }) });

  noteShortages(ctx);                                       // 9.31: a job that failed for lack of material writes the shortage into its own beliefs (it reaches the board when the slime posts)
  // 9.30: the idle pull. Shortage work (the demand chains, derived gathers for a stalled site, hunting) is taken by a slime between jobs or at leisure;
  // a slime busy at anything else keeps its job (the candidate that IS its job stays so a replan can keep it).
  const cur = ctx.cur;
  if (cur && cur.c !== "leisure" && cur.k !== "leisure" && !belFlags.off) ctx.cands = ctx.cands.filter(c => !c.pull || c.key === cur.key);
  for (const c of ctx.cands) scoreCand(ctx, c);
  if (probe) probe(ctx.cands);                      // tests/debugging: see every scored candidate
  const ready = ctx.cands.filter(c => !c.blocker).sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  const rej = ctx.cands.filter(c => c.blocker);

  let chosen = null, made = null, tries = 0;
  if (dry) chosen = ready[0];                       // a preview picks the best-scored runnable job without building anything
  else for (const c of ready) {
    if (replan && ctx.cur && c.key === ctx.cur.key) { chosen = c; made = null; break; }
    if (++tries > 6) break;
    let r = c.mk(ctx);
    if (r.task && !steadfast(v)) {                                   // S8: autonomy refuses the thornback's ground and unmapped cave (a guided villager does not, K7)
      if (guard.in) guard.scope = "unsafeTask";
      let why = unsafeTask(sim, r.task);
      if (guard.in) guard.scope = "plan";
      if ((c.kind === "disarm" || c.clr || delving(sim, v)) && why === "dungeon") why = "";             // 7.21: the one job the player can send into a labyrinth by order; 7.23: and a delve party goes where its orders say
      if (c.kind === "explore" && c.scout && why === "unmapped") why = "";                  // experiment: a scout (memory.js) maps unmapped cave; labyrinth, bad air, unstable ground and the lair stay forbidden
      if (c.kind === "build_site") {                                    // S12: shoring a cracking roof and fitting a vent in foul air are the only jobs allowed there
        const st = sim.ents.get(c.tid);
        if (st && ((why === "unstable" && st.w === "wall" && st.m === "support") || (why === "badair" && st.w === "vent"))) why = "";
      }
      if (why) {
        r = { blocker: "UNSAFE" };
        v.lf = [c.kind, "UNSAFE", sim.tick];
        const bad = c.kind === "mine" ? DIG_BAD + Number(c.key.slice(5)) : c.tid;
        if (bad) { v.bad.push([bad, sim.tick + 600]); if (v.bad.length > 8) v.bad.shift(); }
      }
    }
    if (r.blocker) { c.blocker = r.blocker; rej.push(c); continue; }
    chosen = c; made = r; break;
  }
  if (!chosen) { chosen = ready[ready.length - 1]; made = { task: Wander(), res: [] }; }   // leisure is always last resort

  // Alternatives that lost: blocked ones keep their blocker, outscored ones say why.
  const crit = chosen.cls === "need" || chosen.cls === "vcrit";
  // (9.32: the lost alternatives are references plus a parallel blocker list, not a copy of every candidate; only the top three distinct kinds are turned into objects)
  const alts = rej.slice(), altB = rej.map(c => c.blocker);
  for (const c of ready) if (c !== chosen) { alts.push(c); altB.push(crit && c.cls !== "need" && c.cls !== "vcrit" ? "NEED_CRITICAL" : "LOWER_SCORE"); }
  const ix = alts.map((_, i) => i).sort((p, q) => alts[q].score - alts[p].score || (alts[p].key === alts[q].key ? p - q : alts[p].key < alts[q].key ? -1 : 1));
  const seen = new Set(), top = [];
  for (const i of ix) { const a = alts[i]; if (seen.has(a.kind)) continue; seen.add(a.kind); top.push({ job: a.kind, cls: a.cls, score: r1(a.score), blocker: altB[i], item: a.short || "" }); if (top.length === 3) break; }
  const pr = {}; for (const k in chosen.parts) pr[k] = r1(chosen.parts[k]);
  const why = { job: chosen.kind, cls: chosen.cls, score: r1(chosen.score), parts: pr, rej: top, lf: v.lf, t: sim.tick, tid: chosen.tid || 0 };
  if (dry) return why;
  v.why = why;

  if (!made) return false;                                     // keep the current action
  if (replan) cancelAction(sim, v);
  v.job = { k: chosen.kind, c: chosen.cls, key: chosen.key, t0: sim.tick, tid: chosen.tid || 0, g: chosen.grp || "", kp: chosen.kp || "", rq: chosen.rq || "", res: [], ...(chosen.parts.crew > 0 ? { cw: 1 } : {}) };
  for (const e of made.res) reserve(sim, v, e);
  v.action = made.task;
  return true;
}

/** The helper bag farmjobs.js builds its candidates with (it cannot import this file: the bundler allows no import cycles). */
const HELP = { add, reach, dTo, isBad, capped, stockStack, standAdj, looseCand, chopCand, gatherCand, looseOf, heldOf, oneStep };
