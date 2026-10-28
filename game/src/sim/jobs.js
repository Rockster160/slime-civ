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
import { fnv1aStr } from "./hash.js";
import { mix32 } from "./rng.js";
import { clamp, dist3, r1 } from "./util.js";
import { World } from "./world.js";
import { Wander } from "./actions.js";
import { Task, HERE } from "./tasks.js";
import { berrySeason, isNight, tempAt } from "./season.js";
import { readySites, standCells, costOf, TIER, UNBUILD_DUR } from "./build.js";
import { diggable } from "./tasks.js";
import { occupants } from "./rooms.js";
import { urgency, SOFT, isAdult } from "./villager.js";
import { level, preferred } from "./skills.js";
import { ITEMS, inZone, carryRoom, carryLoad, carryCap, storeCell, survey } from "./items.js";
import { reserve, reservedByOther, cancelAction } from "./jobstate.js";
import { village, findSite, waterEdges, CAMP, BED_COST, RACK_COST } from "./board.js";

export const COMMIT = 200;          // ticks a job is protected from switching (§09)
export const SWITCH_COST = 25;
export const WITHIN_CLAMP = 45;
export const FAR_SLEEP = 24;        // beyond this many cells from the bed, an exhausted villager sleeps on the spot
export const MAX_SCAN = 60;         // cells; proximity = 1 - dist/MAX_SCAN
export const TEMPER_SPREAD = 0.2;   // stable lifelong job lean, +/-20% (§08)
export const DIG_AREA = 2;          // a dig order covers a 5x5 patch of columns
export const HAND_CAP = 0.7;        // derived build jobs may use at most 70% of the adults (§09 K4)
export const ORDER_AREA = 10;       // an order covers targets within this many cells of where it was given
const FOOD_WORKERS = 0.6;           // demand: share of adults that may forage at once
// When several needs saturate at u=1 they would tie at 400; break the tie by what kills fastest (thirst, hunger, cold, then sleep).
const NEED_RANK = { drink: 0, eat: 1, huddle: 2, sleep: 3, leisure: 4 };
const CHILL = 0.55;                // below this air warmth, villagers prefer a warm room to a nearer bed (§08 shelter)
const MOOD_CAP = 349;              // above any order (<= 345), below village-critical (>= 350)
const VCRIT_CAP = 395;              // a saturated personal need (400 - rank) always outranks village-critical (priority order, §09)
const BASE = { need: 0, vcrit: 0, order: 300, standing: 200, demand: 100, leisure: 0 };
const KIND_HASH = {};
const kh = (k) => KIND_HASH[k] ?? (KIND_HASH[k] = fnv1aStr(k));

// ---- context ---------------------------------------------------------------

function makeCtx(sim, v, dry) {
  const w = {};
  for (const o of sim.ents.ofKind("villager")) {
    if (o === v || !o.job || !o.action) continue;
    const a = o.job.c + ":" + o.job.g;
    w[a] = (w[a] || 0) + 1;
  }
  return {
    sim, v, dry, t: sim.tick, b: sim.board, vl: village(sim), sv: survey(sim), night: isNight(sim.tick),
    cur: v.job && v.action ? v.job : null, w, pref: preferred(v), cands: [], near: null,
  };
}
const add = (ctx, c) => { c.key = c.key || c.kind + ":" + (c.tid || 0); ctx.cands.push(c); return c; };
const isBad = (v, id, t) => { for (const b of v.bad) if (b[0] === id && b[1] > t) return true; return false; };
const idx = (e) => World.idx(e.x, e.y, e.z);

/** Nearest valid berry / tuft / tree for this villager in one pass over the plants. */
function nearPlants(ctx) {
  if (ctx.near) return ctx.near;
  const { sim, v, t } = ctx, season = berrySeason(t);
  const near = { berry: null, tuft: null, tree: null, rsv: { berry: 0, tuft: 0, tree: 0 } };
  const best = { berry: 1e9, tuft: 1e9, tree: 1e9 };
  const plants = sim.ents.ofKind("plant");
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i], sp = p.species === "berry" ? "berry" : p.species === "tuft" ? "tuft" : p.species === "tree" ? "tree" : null;
    if (!sp) continue;
    if (sp === "berry" && (!season || p.yield <= 0)) continue;
    if (sp === "tuft" && p.yield <= 0) continue;
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
  if (e.kind !== "plant" || e.species !== "tree") return w.isWalkable(e.x, e.y, e.z) ? { x: e.x, y: e.y, z: e.z } : null;
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
function capped(ctx, cls, grp, cap) { return (ctx.w[cls + ":" + grp] || 0) >= cap; }

// ---- personal needs (class 400*u) -------------------------------------------

function nearestFoodStack(ctx) {
  let best = null, bd = 1e9;
  const items = ctx.sim.ents.ofKind("item");
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    if (ITEMS[s.item].food === 0 || !inZone(ctx.sim.stock, s.x, s.y)) continue;
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
      } else { c.blocker = "NO_MATERIAL"; c.mk = () => ({ blocker: "NO_MATERIAL" }); }
    }
    add(ctx, c);
  }
  const ut = urgency(v.thirst, ...SOFT.thirst);
  if (ut > 0) {
    let best = null, bd = 1e9;
    for (const e of waterEdges(sim)) { const d = dist3(v.x, v.y, v.z, e[0], e[1], e[2]); if (d < bd && !isBad(v, e[0] * 1000 + e[1], ctx.t)) { bd = d; best = e; } }
    const c = { kind: "drink", cls: "need", u: ut, grp: "need", d: bd, key: "drink:0" };
    if (!best) { c.blocker = "NO_WATER"; c.mk = () => ({ blocker: "NO_WATER" }); }
    else c.mk = () => {
      const st = { x: best[0], y: best[1], z: best[2] };
      if (!reach(ctx, st)) { v.bad.push([best[0] * 1000 + best[1], ctx.t + 600]); return { blocker: "NO_PATH" }; }
      return { task: Task("drink", [{ v: "drink", ...st }]), res: [] };
    };
    add(ctx, c);
  }
  let ue = urgency(v.energy, ctx.night ? 0.9 : 0.4, SOFT.energy[1]);
  if (ctx.cur && ctx.cur.k === "sleep") ue = Math.max(ue, 0.35);        // finish the night's sleep unless something is truly urgent
  if (ue > 0) addRest(ctx, "sleep", ue);
  let uw = urgency(v.warm, ...SOFT.warm);
  if (ctx.cur && ctx.cur.k === "huddle") uw = Math.max(uw, 0.3);
  if (uw > 0) addRest(ctx, "huddle", uw);
  const um = urgency(v.mood, ...SOFT.mood);
  if (um > 0) add(ctx, { kind: "leisure", cls: "need", u: um, grp: "need", d: 0, key: "leisure:0", mk: () => ({ task: Wander(), res: [] }) });
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
  let st, tid = 0;
  // Exhausted and far from camp: collapse where you stand (ground sleep) rather than walk 100+ ticks home.
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
  const cand = { kind, cls: "need", u, grp: "need", tid, d: dist3(v.x, v.y, v.z, st.x, st.y, st.z), key: kind + ":" + tid };
  cand.mk = () => reach(ctx, st) ? { task: Task(kind, [{ v: kind, tid, ...st }]), res: [] } : { blocker: "NO_PATH" };
  add(ctx, cand);
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

// ---- chains: food and shelter, reused by every class ------------------------

/**
 * Food jobs at class `cls`: dry fresh food on a rack, forage, and (o.rack) build the rack.
 * o = {uv?, urg, cap, grp, kp?, dry:bool, forage:bool}
 */
function foodChain(ctx, cls, o) {
  const { v, sv, vl } = ctx, base = { cls, uv: o.uv, urg: o.urg, grp: o.grp, kp: o.kp };
  const full = capped(ctx, cls, o.grp, o.cap);
  if (o.forage !== false) {
    const near = nearPlants(ctx), bush = near.berry;
    const c = { ...base, kind: "forage", skill: "gather" };
    if (carryRoom(v, "berry") <= 0) { c.blocker = "NO_CAPACITY"; c.mk = () => ({ blocker: "NO_CAPACITY" }); }
    else if (!bush) {
      c.blocker = !berrySeason(ctx.t) ? "NO_SEASON" : near.rsv.berry ? "RESERVED" : "NO_MATERIAL"; c.mk = () => ({ blocker: c.blocker });
    } else { c.tid = bush.id; c.d = dTo(ctx, bush); c.mk = oneStep("forage", "pick", bush); }
    if (!berrySeason(ctx.t) && carryRoom(v, "berry") > 0) {      // winter forage (§11.17): dig roots at a grass tuft, ~1/3 of a summer forager-day
      const t = near.tuft;
      if (t) { c.blocker = null; c.tid = t.id; c.d = dTo(ctx, t); c.key = "forage:" + t.id; c.mk = oneStep("forage", "root", t); }
      else { c.blocker = near.rsv.tuft ? "RESERVED" : "NO_MATERIAL"; c.mk = () => ({ blocker: c.blocker }); }
    }
    if (full && !c.blocker) c.blocker = "MAX_WORKERS";
    add(ctx, c);
  }
  if (o.dry !== false && vl.racks.length) {
    let rack = null, bd = 1e9;
    for (const r of vl.racks) if (!reservedByOther(ctx.sim, r, v.id)) { const d = dTo(ctx, r); if (d < bd) { bd = d; rack = r; } }
    const c = { ...base, kind: "dry", skill: "gather", urg: o.urgDry ?? o.urg };
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
  const items = ctx.sim.ents.ofKind("item");
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    if (s.item !== item || !inZone(ctx.sim.stock, s.x, s.y)) continue;
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
  const base = { cls, uv: o.uv, urg: o.urg, grp: o.grp, kp: o.kp };
  const full = capped(ctx, cls, o.grp, o.cap);
  const holds = v.carry && v.carry.item === cost.item && v.carry.n >= cost.n;
  const c = { ...base, kind: "build_" + what, skill: "build", key: "build_" + what + ":0" };
  if (!holds && v.carry) c.blocker = "NO_CAPACITY";
  else if (!holds && sv.stock[cost.item] < cost.n) c.blocker = "NO_MATERIAL";
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
  if (sv.stock[cost.item] < cost.n && sv.loose[cost.item] > 0) looseCand(ctx, base, cost.item, full);
  // Derived gather: only while materials are short in total (in stock, loose or in hands).
  const have = sv.stock[cost.item] + sv.loose[cost.item] + sv.carried[cost.item];
  if (have < cost.n) {
    const near = nearPlants(ctx);
    if (cost.item === "grass") {
      const t = near.tuft;
      const g = { ...base, kind: "cut", skill: "gather", key: "cut:" + (t ? t.id : 0) };
      if (carryRoom(v, "grass") <= 0) { g.blocker = "NO_CAPACITY"; g.mk = () => ({ blocker: "NO_CAPACITY" }); }
      else if (!t) { g.blocker = near.rsv.tuft ? "RESERVED" : "NO_MATERIAL"; g.mk = () => ({ blocker: g.blocker }); }
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
  const items = sim.ents.ofKind("item");
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    if (s.item !== item || inZone(sim.stock, s.x, s.y) || reservedByOther(sim, s, v.id) || isBad(v, s.id, ctx.t)) continue;
    const d = dTo(ctx, s);
    if (d < bd && d <= MAX_SCAN) { bd = d; best = s; }
  }
  const c = { ...base, kind: "haul", skill: null };
  if (!best) { c.blocker = "NO_MATERIAL"; c.mk = () => ({ blocker: "NO_MATERIAL" }); }
  else if (carryRoom(v, item) <= 0) { c.blocker = "NO_CAPACITY"; c.mk = () => ({ blocker: "NO_CAPACITY" }); c.tid = best.id; }
  else { c.tid = best.id; c.d = bd; c.mk = oneStep("haul", "pickup", best); }
  if (full && !c.blocker) c.blocker = "MAX_WORKERS";
  add(ctx, c);
}
function chopCand(ctx, base, full) {
  const near = nearPlants(ctx), t = near.tree, v = ctx.v;
  const g = { ...base, kind: "chop", skill: "chop" };
  if (v.carry) { g.blocker = "NO_CAPACITY"; g.mk = () => ({ blocker: "NO_CAPACITY" }); }
  else if (!t) { g.blocker = near.rsv.tree ? "RESERVED" : "NO_MATERIAL"; g.mk = () => ({ blocker: g.blocker }); }
  else { g.tid = t.id; g.d = dTo(ctx, t); g.mk = oneStep("chop", "chop", t); }
  if (full && !g.blocker) g.blocker = "MAX_WORKERS";
  add(ctx, g);
}
function gatherCand(ctx, base, full) {
  const near = nearPlants(ctx), t = near.tuft, v = ctx.v;
  const g = { ...base, kind: "cut", skill: "gather" };
  if (carryRoom(v, "grass") <= 0) { g.blocker = "NO_CAPACITY"; g.mk = () => ({ blocker: "NO_CAPACITY" }); }
  else if (!t) { g.blocker = near.rsv.tuft ? "RESERVED" : "NO_MATERIAL"; g.mk = () => ({ blocker: g.blocker }); }
  else { g.tid = t.id; g.d = dTo(ctx, t); g.mk = oneStep("cut", "cut", t); }
  if (full && !g.blocker) g.blocker = "MAX_WORKERS";
  add(ctx, g);
}

// ---- hauling baseline (§09 R21) ------------------------------------------------

function genHaul(ctx, clsFor) {
  const { v, sim } = ctx;
  if (v.carry) {
    const cap = carryCap(v);
    const cls = clsFor(v.carry.item);
    const c = { kind: "store", cls: cls.cls, kp: cls.kp, grp: cls.kp ? "kp:" + cls.kp : "haul", urg: Math.max(0.2, carryLoad(v) / cap), d: 0, key: "store:0" };
    const cell = storeCell(sim, v.carry.item, v.x, v.y);
    if (!cell && ITEMS[v.carry.item].food === 0) {                  // the food-only cells are all that is left: set the load down rather than stand there with full hands
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
  const items = sim.ents.ofKind("item");
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    if (inZone(sim.stock, s.x, s.y) || carryRoom(v, s.item) <= 0) continue;
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
  }
}

// ---- construction: derived build jobs at STANDING class (§09, §12.6) ----------------

/** The next ghost to work, its materials fetched from the stockpile, delivered, then finished. */
function genConstruct(ctx) {
  const { sim, v, sv } = ctx, rs = readySites(sim);
  if (!rs.total) return;
  const cap = Math.max(1, Math.ceil(HAND_CAP * ctx.vl.adults));
  const base = { cls: "standing", urg: 0.5, grp: "construct", skill: "build" };
  const full = capped(ctx, "standing", "construct", cap);
  let best = null, bk = 1e9, rsv = 0;
  for (const s of rs.ready) {
    if (reservedByOther(sim, s, v.id)) { rsv++; continue; }
    if (isBad(v, s.id, ctx.t)) continue;
    const k = TIER[s.w] * 1000 + dTo(ctx, s) - (s.rv === v.id ? 5000 : 0);
    if (k < bk) { bk = k; best = s; }
  }
  const c = { ...base, kind: "build_site", key: "build_site:" + (best ? best.id : 0) };
  if (!best) {
    c.blocker = rs.ready.length === 0 && rs.waiting ? "UNSUPPORTED" : rsv ? "RESERVED" : "NO_PATH";
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
    steps.push({ v: "construct", tid: best.id, dur: cost.dur, ...stand });
    return { task: Task("build_site", steps), res: [best] };
  };
  add(ctx, c);
  if (c.blocker === "NO_MATERIAL") {
    c.short = cost.item;                                     // the Why panel says which one
    if (sv.loose[cost.item] > 0) looseCand(ctx, base, cost.item, full);
    if (sv.stock[cost.item] + sv.loose[cost.item] + sv.carried[cost.item] < need) {
      if (cost.item === "grass") gatherCand(ctx, base, full);
      else if (cost.item === "stick" || cost.item === "log") chopCand(ctx, base, full);
      // stone and dirt come only from digging, which is the player's order (R8: no autonomous quarrying)
    }
  }
}

/** Marked pieces (S4b): take the nearest one down. Same standing class and hand cap as building. */
function genDeconstruct(ctx) {
  const { sim, v } = ctx, ds = sim.ents.ofKind("dsite");
  if (!ds.length) return;
  const cap = Math.max(1, Math.ceil(HAND_CAP * ctx.vl.adults));
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
  const b = ctx.b;
  if (b.fc) foodChain(ctx, "vcrit", { uv: b.uvf, urg: 1, cap: b.fneed, grp: "food", urgDry: 1 });
  if (b.sc) buildChain(ctx, "vcrit", "bed", { uv: b.uvs, urg: 1, cap: Math.max(1, b.sneed), grp: "shelter" });
  // food-critical with too few racks (none, or fresh food piling up unsaved): a rack is part of the cure (derived, same class)
  if (b.fc && b.dem.rack > 0 && (!ctx.vl.racks.length || ctx.sv.stock.berry >= 8)) buildChain(ctx, "vcrit", "rack", { uv: 1, urg: 1, cap: 1, grp: "rack" });     // no rack = no banking: ahead of foraging
}

// Keep-N for non-food items must not eat the village's hands (S4b playtest fix, GDD §09 hand cap):
// derived keep-N jobs use at most HAND_CAP of the adults, and while food is short (demand above
// KEEP_FOOD_DEM, i.e. the larder is under the season's look-ahead target, or beds/racks are wanted) at most KEEP_FOOD_SHARE of them,
// so foraging at demand class keeps getting workers even though a standing order outranks it.
const KEEP_FOOD_DEM = 0.0;
const KEEP_FOOD_SHARE = 0.2;
const FOOD_KP = new Set(["berry", "dried"]);

/** Are the non-food keep-N jobs (chop, gather, haul of kept items) already using their share of the hands? */
function keepFull(ctx) {
  const b = ctx.b, adults = Math.max(1, ctx.vl.adults);
  let kw = 0;                                                    // other villagers already on non-food keep-N work
  for (const k in ctx.w) if (k.startsWith("standing:kp:") && !FOOD_KP.has(k.slice(12))) kw += ctx.w[k];
  const pressed = b.dem.food > KEEP_FOOD_DEM || b.dem.shelter > 0 || b.dem.rack > 0;     // the village has its own work to do
  return kw >= Math.max(1, Math.floor((pressed ? KEEP_FOOD_SHARE : HAND_CAP) * adults));
}

function genStanding(ctx) {
  const b = ctx.b, kfull = keepFull(ctx);
  for (const k of b.keeps) {
    if (!k.on) continue;
    const have = ctx.sv.stock[k.item] + ctx.sv.loose[k.item] + ctx.sv.carried[k.item];
    const base = { cls: "standing", urg: clamp(1 - have / k.n, 0, 1), grp: "kp:" + k.item, kp: k.item };
    const food = FOOD_KP.has(k.item);
    const full = capped(ctx, "standing", base.grp, 3) || (!food && kfull);     // maxWorkers per standing order (§09 default 3)
    if (k.item === "berry") foodChain(ctx, "standing", { urg: base.urg, cap: 3, grp: base.grp, kp: k.item, dry: false });
    else if (k.item === "dried") { foodChain(ctx, "standing", { urg: base.urg, cap: 3, grp: base.grp, kp: k.item }); }
    else if (k.item === "grass") gatherCand(ctx, base, full);
    else chopCand(ctx, base, full);                              // stick, log
  }
}

function genDemand(ctx) {
  const { b, vl } = ctx, adults = Math.max(1, vl.adults);
  if (b.dem.food > 0) {
    const cap = Math.max(1, Math.ceil(b.dem.food * Math.max(1, FOOD_WORKERS * adults)));
    foodChain(ctx, "demand", { urg: b.dem.food, urgDry: Math.max(b.dem.preserve, b.dem.food), cap, grp: "food" });
  } else if (b.dem.preserve > 0) foodChain(ctx, "demand", { urg: b.dem.preserve, cap: 2, grp: "food", forage: false });
  if (b.dem.shelter > 0) buildChain(ctx, "demand", "bed", { urg: b.dem.shelter, cap: Math.max(1, Math.min(2, b.sneed)), grp: "shelter" });
  if (b.dem.rack > 0) buildChain(ctx, "demand", "rack", { urg: b.dem.rack, cap: 1, grp: "rack" });
}

const ORDER_SKILL = { forage: "gather", chop: "chop", gather: "gather", haul: null, move: null, dig: null };
const ORDER_SPECIES = { forage: "berry", chop: "tree", gather: "tuft" };

/** Targets of an area order: its named entity if still valid, else the nearest valid one within ORDER_AREA. */
function orderTarget(ctx, o) {
  const { sim, v, t } = ctx;
  const season = berrySeason(t);
  const want = ORDER_SPECIES[o.verb];
  let best = null, bd = 1e9, any = false, rsv = 0;
  const ok = (e) => want === "berry" ? e.yield > 0 && season : want === "tuft" ? e.yield > 0 : true;
  const consider = (e) => {
    if (Math.abs(e.x - o.x) > ORDER_AREA || Math.abs(e.y - o.y) > ORDER_AREA) return;
    any = true;
    if (reservedByOther(sim, e, v.id)) { rsv++; return; }
    if (isBad(v, e.id, t)) return;
    const d = dTo(ctx, e) - (e.id === o.tid ? 1000 : 0);
    if (d < bd) { bd = d; best = e; }
  };
  if (o.verb === "haul") {
    for (const s of sim.ents.ofKind("item")) if (!inZone(sim.stock, s.x, s.y) && carryRoom(v, s.item) > 0) consider(s);
  } else {
    for (const p of sim.ents.ofKind("plant")) if (p.species === want && ok(p)) consider(p);
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
    return { task: Task("dig", [{ v: "dig", cx, cy, cz, ...stand }]), res: [] };
  };
  add(ctx, c);
}
const DIG_BAD = 10000000;           // "bad target" ids for cells live above any entity id

function genOrder(ctx) {
  const { v, sim, t } = ctx, o = v.order;
  if (!o) return;
  const base = { cls: "order", urg: clamp((t - o.t0) / 900, 0, 1), grp: "order", skill: ORDER_SKILL[o.verb] };
  if (o.verb === "dig") { genDig(ctx, base); return; }
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
  const kind = o.verb === "forage" ? "forage" : o.verb === "chop" ? "chop" : o.verb === "gather" ? "cut" : "haul";
  const { e, any, rsv } = orderTarget(ctx, o);
  const c = { ...base, kind };
  const carryOk = o.verb === "chop" ? !v.carry : o.verb === "haul" ? true : carryRoom(v, ORDER_SPECIES[o.verb] === "berry" ? "berry" : "grass") > 0;
  if (!e) {
    if (!any && (o.verb !== "forage" || berrySeason(t))) { v.order = null; ctx.b.ep++; return; }     // area exhausted: order complete
    c.blocker = o.verb === "forage" && !berrySeason(t) ? "NO_SEASON" : rsv ? "RESERVED" : "NO_TARGET";
    c.mk = () => ({ blocker: c.blocker });
  } else if (!carryOk) { c.blocker = "NO_CAPACITY"; c.mk = () => ({ blocker: c.blocker }); c.tid = e.id; }
  else {
    c.tid = e.id; c.d = dTo(ctx, e);
    c.mk = oneStep(kind, o.verb === "forage" ? "pick" : o.verb === "chop" ? "chop" : o.verb === "gather" ? "cut" : "pickup", e);
  }
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
    fit: c.skill ? 60 * level(v, c.skill) : 0,
    prox: c.cls === "need" ? 0 : 10 * clamp(1 - d / MAX_SCAN, 0, 1),         // needs: distance is n/a (a thirsty villager walks as far as it must)
    path: c.cls === "need" ? 0 : -Math.min(20, d * 0.2),
    pref: c.skill && c.skill === ctx.pref ? 10 : 0,
    tmp: c.cls === "standing" || c.cls === "demand" || c.cls === "leisure" ? 5 * (2 * temper(v, c.kind) - 1) : 0,   // orders bypass temper (R5)
    sw: 0,
  };
  const cur = ctx.cur;
  if (cur && c.key !== cur.key && ctx.t - cur.t0 < COMMIT && c.cls !== "vcrit" && !(c.cls === "need" && c.u > 0.5)) p.sw = -SWITCH_COST;
  const within = clamp(p.urg + p.fit + p.prox + p.path + p.pref + p.tmp + p.sw, -WITHIN_CLAMP, WITHIN_CLAMP);
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
  const ctx = makeCtx(sim, v, dry);
  const adult = isAdult(sim, v);
  genNeeds(ctx);
  if (adult) {
    genVillage(ctx); genOrder(ctx); genStanding(ctx); genConstruct(ctx); genDeconstruct(ctx); genDemand(ctx);
    genHaul(ctx, (item) => {
      const k = sim.board.keeps.find(q => q.item === item && q.on);
      return k ? { cls: "standing", kp: item } : { cls: "demand", kp: "" };
    });
  }
  add(ctx, { kind: "leisure", cls: "leisure", urg: (1 - v.mood) * 0.5, grp: "leisure", d: 0, key: "leisure:0", mk: () => ({ task: Wander(), res: [] }) });

  for (const c of ctx.cands) scoreCand(ctx, c);
  if (probe) probe(ctx.cands);                      // tests/debugging: see every scored candidate
  const ready = ctx.cands.filter(c => !c.blocker).sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  const rej = ctx.cands.filter(c => c.blocker);

  let chosen = null, made = null, tries = 0;
  if (dry) chosen = ready[0];                       // a preview picks the best-scored runnable job without building anything
  else for (const c of ready) {
    if (replan && ctx.cur && c.key === ctx.cur.key) { chosen = c; made = null; break; }
    if (++tries > 6) break;
    const r = c.mk(ctx);
    if (r.blocker) { c.blocker = r.blocker; rej.push(c); continue; }
    chosen = c; made = r; break;
  }
  if (!chosen) { chosen = ready[ready.length - 1]; made = { task: Wander(), res: [] }; }   // leisure is always last resort

  // Alternatives that lost: blocked ones keep their blocker, outscored ones say why.
  const crit = chosen.cls === "need" || chosen.cls === "vcrit";
  const alts = rej.slice();
  for (const c of ready) if (c !== chosen) alts.push({ ...c, blocker: crit && c.cls !== "need" && c.cls !== "vcrit" ? "NEED_CRITICAL" : "LOWER_SCORE" });
  alts.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  const seen = new Set(), top = [];
  for (const a of alts) { if (seen.has(a.kind)) continue; seen.add(a.kind); top.push({ job: a.kind, cls: a.cls, score: r1(a.score), blocker: a.blocker, item: a.short || "" }); if (top.length === 3) break; }
  const pr = {}; for (const k in chosen.parts) pr[k] = r1(chosen.parts[k]);
  const why = { job: chosen.kind, cls: chosen.cls, score: r1(chosen.score), parts: pr, rej: top, lf: v.lf, t: sim.tick, tid: chosen.tid || 0 };
  if (dry) return why;
  v.why = why;

  if (!made) return false;                                     // keep the current action
  if (replan) cancelAction(sim, v);
  v.job = { k: chosen.kind, c: chosen.cls, key: chosen.key, t0: sim.tick, tid: chosen.tid || 0, g: chosen.grp || "", kp: chosen.kp || "", res: [] };
  for (const e of made.res) reserve(sim, v, e);
  v.action = made.task;
  return true;
}
