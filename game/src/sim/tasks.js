// Task: the action every job becomes. A Task is plain data - a list of STEPS
// (walk to a place, then do one verb there) - run by the same runner as Move
// and Wander (actions.js). The job board (jobs.js) only decides which steps;
// this module is the only place that knows what a verb does to the world.
//
//   step = {v: verb, tid: target entity id, x,y,z: where to stand (x = -1: nowhere), ...verb args}
//   verb = { dur, skill, check(sim,v,s) -> blocker|null  (on arrival)
//            work(sim,v,s,a) -> "more" | "done" | blocker  (after each `dur` ticks of effort) }
//
// Work progress is `rate` per tick (fitness, mood, skill effect, trait), so
// better workers finish sooner. XP is awarded here, from real output (§10).
import { ACTIONS, Move, ST } from "./actions.js";
import { fitness, ageDays, workFactor, maturity } from "./villager.js";
import { ITEMS, RATION, carryRoom, carryAdd, carryTake, dropLoose, putStack, storeCell, takeFromStack, inZone } from "./items.js";
import { fellTree, BERRY_REGROW, TUFT_REGROW, ROOT_REGROW } from "./plants.js";
import { award, noteWork, effect, novel, VALUE } from "./skills.js";
import { untilDawn, isNight } from "./season.js";
import { once } from "./chronicle.js";
import { costOf, finishSite, unbuild, UNBUILD_DUR } from "./build.js";
import { M, F } from "./world.js";
import { INSPIRE } from "./inspire.js";

export function Task(k, steps) { return { type: "Task", k, steps, si: 0, ph: 0, mv: null, p: 0, blocker: null }; }
export const AT = (x, y, z) => ({ x, y, z });
export const HERE = { x: -1, y: -1, z: -1 };

const E = (sim, s) => sim.ents.get(s.tid);

export function rate(sim, v, skill) {
  const fit = fitness(v, ageDays(sim, v));
  let r = workFactor(v, fit);
  if (skill) r *= effect(v, skill) * (skill === "gather" ? v.t.speed : v.t.strength);
  return v.poss ? r * (1 + INSPIRE.speed) : r;       // divine inspiration (§07); the only difference from an AI villager
}

const VERBS = {
  goto: { dur: 1, skill: null, check: () => null, work: () => "done" },

  pick: {   // take a berry from a bush
    dur: 25, skill: "gather",
    check(sim, v, s) { const p = E(sim, s); return p && p.species === "berry" && p.yield > 0 && carryRoom(v, "berry") > 0 ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s);
      if (!p || p.yield <= 0) return "done";
      p.yield--; if (p.yield === 0) p.nx = sim.tick + BERRY_REGROW;
      carryAdd(sim, v, "berry", 1);
      award(v, "gather", VALUE.berry, novel(sim, p.x, p.y, p.z));
      return p.yield > 0 && carryRoom(v, "berry") > 0 ? "more" : "done";
    },
  },
  root: {   // winter forage (§11.17): dig edible roots/grubs where a grass tuft stood. 3 rations per ~240 ticks of work (a patch holds a few), about 1/3 of berry picking
    dur: 240, skill: "gather",
    check(sim, v, s) { const p = E(sim, s); return p && p.species === "tuft" && p.yield > 0 && carryRoom(v, "berry") > 0 ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s);
      p.yield = 0; p.nx = sim.tick + ROOT_REGROW;
      carryAdd(sim, v, "berry", Math.min(3, carryRoom(v, "berry")));      // roots store as the same food item (spoils 3%/day in winter)
      award(v, "gather", 3 * VALUE.berry, novel(sim, p.x, p.y, p.z));
      return "done";
    },
  },
  cut: {    // gather a grass tuft
    dur: 30, skill: "gather",
    check(sim, v, s) { const p = E(sim, s); return p && p.species === "tuft" && p.yield > 0 && carryRoom(v, "grass") > 0 ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s);
      p.yield = 0; p.nx = sim.tick + TUFT_REGROW;
      carryAdd(sim, v, "grass", 1);
      award(v, "gather", VALUE.grass, novel(sim, p.x, p.y, p.z));
      return "done";
    },
  },
  chop: {   // fell a tree: 2 logs + 4 sticks fall loose at its cell; it becomes a sapling
    dur: 360, skill: "chop",
    check(sim, v, s) { const p = E(sim, s); return p && p.species === "tree" ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s);
      fellTree(sim, p);
      dropLoose(sim, "log", 2, p.x, p.y, p.z);
      dropLoose(sim, "stick", 4, p.x, p.y, p.z);
      award(v, "chop", 2 * VALUE.log + 4 * VALUE.stick, novel(sim, p.x, p.y, p.z));
      return "done";
    },
  },
  take: {   // withdraw `n` of `item` from the stockpile into my hands
    dur: 15, skill: null,
    check(sim, v, s) { return v.carry === null && stockCount(sim, s.item) >= s.n ? null : "NO_MATERIAL"; },
    work(sim, v, s) {
      let need = s.n;
      const items = sim.ents.ofKind("item");
      for (let i = 0; i < items.length && need > 0; i++) {
        const st = items[i];
        if (st.item !== s.item || !inZone(sim.stock, st.x, st.y)) continue;
        const k = Math.min(need, st.n);
        takeFromStack(sim, st, k); i--;                   // the list shrinks when a stack empties
        carryAdd(sim, v, s.item, k); need -= k;
      }
      return need > 0 ? "NO_MATERIAL" : "done";
    },
  },
  drop: {   // put what I carry into the stockpile
    dur: 15, skill: null,
    check(sim, v) { return v.carry ? null : "GONE"; },
    work(sim, v) {
      while (v.carry) {
        const c = storeCell(sim, v.carry.item, v.x, v.y);
        if (!c) return "NO_STORAGE";
        const left = putStack(sim, v.carry.item, v.carry.n, c[0], c[1], c[2]);
        const placed = v.carry.n - left;
        if (placed <= 0) return "NO_STORAGE";
        carryTake(sim, v, placed);
      }
      return "done";
    },
  },
  dump: {   // no room in the stockpile: put the load down here (loose items are still counted and can be hauled later)
    dur: 10, skill: null,
    check(sim, v) { return v.carry ? null : "GONE"; },
    work(sim, v) { dropLoose(sim, v.carry.item, v.carry.n, v.x, v.y, v.z); carryTake(sim, v, v.carry.n); return "done"; },
  },
  pickup: { // lift a loose stack (hauling baseline, §09)
    dur: 20, skill: null,
    check(sim, v, s) { const st = E(sim, s); return st && !inZone(sim.stock, st.x, st.y) && carryRoom(v, st.item) > 0 ? null : "GONE"; },
    work(sim, v, s) {
      const st = E(sim, s);
      if (!st || carryRoom(v, st.item) <= 0) return "GONE";          // someone else took it (or my hands filled) during the lift
      const k = Math.min(st.n, carryRoom(v, st.item));
      carryAdd(sim, v, st.item, k); takeFromStack(sim, st, k);
      return "done";
    },
  },
  eat: {
    dur: 30, skill: null,
    check(sim, v, s) { return foodSource(sim, v, s) ? null : "NO_MATERIAL"; },
    work(sim, v, s) {
      const src = foodSource(sim, v, s);
      if (!src) return v.hunger > 0.5 ? "done" : "NO_MATERIAL";
      let food = 1;
      if (src.t === "carry") { food = ITEMS[v.carry.item].food; carryTake(sim, v, 1); }
      else if (src.t === "stock") { food = ITEMS[src.e.item].food; takeFromStack(sim, src.e, 1); }
      else { src.e.yield--; if (src.e.yield === 0) src.e.nx = sim.tick + BERRY_REGROW; }
      v.hunger = Math.min(1, v.hunger + RATION * food);
      return v.hunger < 0.85 && foodSource(sim, v, s) ? "more" : "done";
    },
  },
  drink: {
    dur: 12, skill: null,
    check: () => null,
    work(sim, v) { v.thirst = Math.min(1, v.thirst + 0.12); return v.thirst < 0.99 ? "more" : "done"; },
  },
  sleep: {  // in a leaf bed if owned/free, else on the ground (worse rest, colder)
    dur: 20, skill: null,
    check(sim, v, s) {
      if (s.tid && !claimBed(sim, v, E(sim, s))) return "RESERVED";
      v.rest = s.tid ? 2 : 1; v.slp = 1;
      s.dawn = isNight(sim.tick) ? sim.tick + untilDawn(sim.tick) : 0;     // a night's sleep lasts to dawn
      return null;
    },
    work(sim, v, s) {
      if (v.hunger < 0.06 || v.thirst < 0.08) return done(v);
      return v.energy >= 0.98 && sim.tick >= s.dawn ? done(v) : "more";
    },
  },
  huddle: { // rest in the bed cluster to keep warm; no sleep
    dur: 20, skill: null,
    check(sim, v, s) {
      if (s.tid && !claimBed(sim, v, E(sim, s))) return "RESERVED";
      v.rest = s.tid ? 2 : 1; s.until = sim.tick + 900;
      return null;
    },
    work(sim, v, s) { return v.warm >= 0.8 || sim.tick >= s.until || v.hunger < 0.06 || v.thirst < 0.08 ? done(v) : "more"; },
  },
  build: {  // consume carried materials at a site, leave furniture
    dur: 240, skill: "build",
    check(sim, v, s) {
      const site = E(sim, s);
      return site && v.carry && v.carry.item === s.item && v.carry.n >= s.n ? null : "NO_MATERIAL";
    },
    work(sim, v, s) {
      const site = E(sim, s);
      carryTake(sim, v, s.n);
      const { x, y, z, what } = site;
      sim.ents.remove(site.id);
      sim.ents.add("furniture", { f: what, x, y, z, owner: 0, rv: 0, rt: 0 });
      award(v, "build", VALUE[what], novel(sim, x, y, z));
      sim.cache.iv++;
      if (what === "bed") once(sim, "firstBed", "BUILT_FIRST", v.name + " made the first leaf bed.", [v.id], {}, 1);
      else once(sim, "firstRack", "BUILT_FIRST", v.name + " built the first drying rack.", [v.id], {}, 1);
      return "done";
    },
  },
  deliver: { // put the carried materials into a ghost: the site becomes "framed" (a valid partial build, §12.6)
    dur: 10, skill: null,
    check(sim, v, s) {
      const site = E(sim, s);
      if (!site) return "GONE";
      return v.carry && v.carry.item === s.item && v.carry.n >= s.n ? null : "NO_MATERIAL";
    },
    work(sim, v, s) {
      const site = E(sim, s);
      if (!site) return "GONE";
      carryTake(sim, v, s.n);
      site.got += s.n;
      sim.cache.csv++;
      return "done";
    },
  },
  construct: { // finish a framed ghost (S4a): the cell changes only now
    dur: 120, skill: "build",
    check(sim, v, s) { const site = E(sim, s); return site && site.got >= costOf(site.w, site.m).n ? null : site ? "NO_MATERIAL" : "GONE"; },
    work(sim, v, s) {
      const site = E(sim, s);
      if (!site) return "GONE";
      const { x, y, z, w } = site, cell = w === "floor" ? [x, y, z - 1] : w === "roof" ? [x, y, z + 1] : [x, y, z];
      const fresh = novel(sim, cell[0], cell[1], cell[2]);
      const b = finishSite(sim, v, site);
      if (b) return b;
      award(v, "build", VALUE[w === "wall" || w === "door" ? "wall" : w], fresh);   // net-new matter only (R17)
      return "done";
    },
  },
  unbuild: { // take down a marked piece (S4b): ~75% of the materials come back loose; no XP
    dur: 80, skill: null,
    check(sim, v, s) { return E(sim, s) ? null : "GONE"; },
    work(sim, v, s) { const d = E(sim, s); return d ? unbuild(sim, d) || "done" : "GONE"; },
  },
  dig: {    // remove a terrain cell; stone or dirt falls loose beside the hole. No XP: digging is not a skill yet (R17, S4a)
    dur: 200, skill: null,
    check(sim, v, s) { return diggable(sim, s.cx, s.cy, s.cz) ? null : "GONE"; },
    work(sim, v, s) {
      if (!diggable(sim, s.cx, s.cy, s.cz)) return "GONE";
      const w = sim.world, m = w.mat(s.cx, s.cy, s.cz);
      w.set(s.cx, s.cy, s.cz, M.AIR, w.flags(s.cx, s.cy, s.cz) & ~F.PLAYER);
      for (const id of sim.ents.at(s.cx, s.cy, s.cz + 1).slice()) { const e = sim.ents.get(id); if (e.kind === "item") sim.ents.move(e, s.cx, s.cy, s.cz); }
      dropLoose(sim, m === M.STONE ? "stone" : "dirt", 1, s.cx, s.cy, s.cz);
      return "done";
    },
  },
  dry: {    // sun-dry 5 fresh -> 4 dried on a stick rack (§11.17: no fire needed)
    dur: 360, skill: "gather",
    check(sim, v, s) {
      const r = E(sim, s);
      return r && v.carry && v.carry.item === "berry" && v.carry.n >= 5 ? null : "NO_MATERIAL";
    },
    work(sim, v) {
      carryTake(sim, v, 5);
      carryAdd(sim, v, "dried", 4);
      award(v, "gather", 4 * VALUE.dried, true);
      return "done";
    },
  },
};
const DIGGABLE = new Set([M.GRASS, M.DIRT, M.STONE, M.SAND]);
/** Terrain we let villagers dig: natural ground, nothing standing on it, outside the stockpile. */
export function diggable(sim, x, y, z) {
  if (z < 1 || !DIGGABLE.has(sim.world.mat(x, y, z))) return false;
  if (sim.stock && sim.stock.z === z + 1 && inZone(sim.stock, x, y)) return false;
  for (const id of sim.ents.at(x, y, z + 1)) { const e = sim.ents.get(id); if (e.kind !== "item") return false; }
  return !(sim.world.flags(x, y, z + 1) & F.OBSTACLE);
}
/** Take (or share) a bed: adults own one; a child with no bed of its own may share a parent's. */
function claimBed(sim, v, b) {
  if (!b) return false;
  if (!b.owner) {
    const old = v.bed ? sim.ents.get(v.bed) : null;
    if (old && old.owner === v.id) old.owner = 0;               // moving to a better bed (a warm room's) frees the old one
    b.owner = v.id; v.bed = b.id; return true;
  }
  if (b.owner === v.id) return true;
  return ageDays(sim, v) < maturity(v) && v.par.includes(b.owner);
}
function done(v) { v.rest = 0; v.slp = 0; return "done"; }

export function stockCount(sim, item) {
  let n = 0; const items = sim.ents.ofKind("item"), z = sim.stock;
  for (let i = 0; i < items.length; i++) if (items[i].item === item && inZone(z, items[i].x, items[i].y)) n += items[i].n;
  return n;
}

/** Where can I eat from right now? carry, else a food stack in the stockpile (fresh first), else the bush I stand at. */
function foodSource(sim, v, s) {
  if (s.src === "carry") return v.carry && ITEMS[v.carry.item].food > 0 ? { t: "carry" } : null;
  if (s.src === "bush") { const p = E(sim, s); return p && p.species === "berry" && p.yield > 0 ? { t: "bush", e: p } : null; }
  let best = null;
  const items = sim.ents.ofKind("item");
  for (let i = 0; i < items.length; i++) {
    const st = items[i];
    if (ITEMS[st.item].food === 0 || !inZone(sim.stock, st.x, st.y)) continue;
    if (!best || (st.item === "berry" && best.item !== "berry")) best = st;     // fresh goes first: it is spoiling
  }
  return best ? { t: "stock", e: best } : null;
}

// ---- the runner ------------------------------------------------------------

ACTIONS.Task = {
  step(sim, v, a) {
    const s = a.steps[a.si];
    const verb = VERBS[s.v];
    if (a.ph === 0) {
      if (s.x >= 0 && !(v.x === s.x && v.y === s.y && v.z === s.z)) {
        if (!a.mv) a.mv = Move(s.x, s.y, s.z, null, v.mv);
        const r = ACTIONS.Move.step(sim, v, a.mv);
        if (r === ST.FAILED) { a.blocker = a.mv.blocker; return fail(v, s, a, sim); }
        if (r === ST.RUNNING) return ST.RUNNING;
        a.mv = null;
      }
      const b = verb.check(sim, v, s);
      if (b) { a.blocker = b; return fail(v, s, a, sim); }
      a.ph = 1; a.p = 0;
    }
    a.p += rate(sim, v, verb.skill);
    if (verb.skill) noteWork(v, verb.skill);
    if (sim.tick % 10 === 0 && v.job) for (const id of v.job.res) { const e = sim.ents.get(id); if (e && e.rv === v.id) e.rt = sim.tick; }
    if (a.p < (s.dur || verb.dur)) return ST.RUNNING;
    a.p = 0;
    const res = verb.work(sim, v, s, a);
    if (res === "more") return ST.RUNNING;
    if (res !== "done") { a.blocker = res; return fail(v, s, a, sim); }
    a.si++; a.ph = 0; a.mv = null;
    return a.si >= a.steps.length ? ST.DONE : ST.RUNNING;
  },
};

/** A step failed: remember why (the Why panel reads v.lf) and cool the target down. */
function fail(v, s, a, sim) {
  v.lf = [a.k, a.blocker, sim.tick];
  if (s.tid) {
    v.bad.push([s.tid, sim.tick + 600]);       // unreachable_cooldown (§09)
    if (v.bad.length > 8) v.bad.shift();
  }
  return ST.FAILED;
}
