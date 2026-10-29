// Task: the action every job becomes. A Task is plain data - a list of STEPS
// (walk to a place, then do one verb there) - run by the same runner as Move
// and Wander (actions.js). The job board (jobs.js) only decides which steps;
// this module is the only place that knows what a verb does to the world.
//
//   step = {v: verb, tid: target entity id, x,y,z: where to stand (z = -1: nowhere; x and y are signed now), ...verb args}
//   verb = { dur, skill, check(sim,v,s) -> blocker|null  (on arrival)
//            work(sim,v,s,a) -> "more" | "done" | blocker  (after each `dur` ticks of effort) }
//
// Work progress is `rate` per tick (fitness, mood, skill effect, trait), so
// better workers finish sooner. XP is awarded here, from real output (§10).
import { ACTIONS, Move, ST } from "./actions.js";
import { fitness, ageDays, workFactor, maturity, geneMul, maxHp } from "./villager.js";
import { ITEMS, RATION, carryRoom, carryAdd, carryTake, dropLoose, putStack, storeCell, takeFromStack, inStore, storeInZone } from "./items.js";
import { fellTree, BERRY_REGROW, TUFT_REGROW, ROOT_REGROW } from "./plants.js";
import { TEACH_OUT, gain, noteWork, effect, novelCell, pupilOf, VALUE } from "./skills.js";
import { untilDawn, isNight } from "./season.js";
import { once } from "./chronicle.js";
import { costOf, finishSite, unbuild, UNBUILD_DUR } from "./build.js";
import { M, F, World } from "./world.js";
import { feel, mineSubject } from "./memory.js";
import { INSPIRE } from "./inspire.js";
import { DIG, diggable, diggableMarked, uproot, HARD_DIFFICULTY, toolNeeded } from "./dig.js";
import { reveal } from "./seen.js";
import { mineDug } from "./mine.js";
import { TUBER_REGROW, TUBER_YIELD } from "./plants.js";
import { addFuel, FUEL_ITEMS, cookMul } from "./fire.js";
import { can, famOf, useCraft, wasteOf } from "./knowledge.js";
import { attempt, waterTouch } from "./discovery.js";
import { light, makeAtBench, toolRate, wearPick, toolUses, RECIPES, JAR_CAP, JAR_FETCH, loadedFor } from "./craft.js";
import { PICKS } from "./gear.js";
import { TOOL_ITEMS } from "./phenomena.js";
import { once as onceLog } from "./chronicle.js";
import { swing, near1 } from "./fauna.js";
import { CROP, WATERED_FOR, sowOk, ripe, penById } from "./farm.js";
import { catchTry, releaseIn, butcher, stake } from "./husbandry.js";
import { darkMul } from "./light.js";
import { hitch, unhitch, wagonOf, wagonReady, tripDone } from "./wagon.js";
import { cookAt } from "./kitchen.js";
import { drinkSip, ateCooked, tend as tendPatient } from "./disease.js";
import { oreYield, fuelMul } from "./depth.js";
import { MARSH, biomeAt } from "./biome.js";
import { isSeenTrap, disarm, openCache } from "./traps.js";

export const WATER_SIPS = 4;           // sips of the hide bag one plot takes (fill gives 24: six plots a trip)
export function Task(k, steps) { return { type: "Task", k, steps, si: 0, ph: 0, mv: null, p: 0, blocker: null }; }
export const AT = (x, y, z) => ({ x, y, z });
export const HERE = { x: -1, y: -1, z: -1 };

const E = (sim, s) => sim.ents.get(s.tid);

/** Everyone has foraged all their life: gathering has no skill (Appendix B), so it runs 30% above a bare-handed novice instead (D21). */
export const GATHER_BASE = 1.5;
/**
 * S18b (D35, revised): hunger runs at its old flat rate (a ration per ~1800 ticks), but a berry picked in 17 ticks fed the village in a few percent of
 * its time and K3's 40-60% of early labour on food read 5%. Gathering FOOD by hand is therefore slower: a berry, a tuber patch, a root dig and a
 * harvested unit take FORAGE_SLOW times as long as they did (tuned so tests/k3.js reads 30-70%). Walking, chopping, digging, building keep their ticks.
 */
export const FORAGE_SLOW = 24;
export const SUN_DRY_BASE = 1.45;      // sun-drying is start knowledge (Appendix B), so its craft needs no learning to be useful

/**
 * Work progress per tick for verb `name`: fitness and mood, the verb's skill effect (dig/build/craft: up to 1.8x),
 * and one trait (clamped to +-25%, R16). A teacher with a pupil beside them works at 0.8x (D8).
 */
export function rate(sim, v, name, sk) {
  const vb = VERBS[name] || {}, skill = sk || vb.skill;
  const fit = fitness(v, ageDays(sim, v));
  let r = workFactor(v, fit) * (vb.base || 1);
  if (skill) r *= effect(v, skill);
  if (vb.tr) r *= geneMul(v.t[vb.tr]);
  r *= toolRate(v, name);                           // S7b: a copper pick in hand digs faster (and wears)
  r *= darkMul(sim, v);                             // S12: underground and beyond any torch, everything takes longer (light.js)
  if (skill && v.tch && pupilOf(sim, v, skill)) r *= TEACH_OUT;
  return v.poss ? r * (1 + INSPIRE.speed) : r;       // divine inspiration (§07); the only difference from an AI villager
}

const VERBS = {
  goto: { dur: 1, skill: null, check: () => null, work: () => "done" },

  pick: {   // take a berry from a bush
    dur: 25 * FORAGE_SLOW, skill: null, tr: "speed", base: GATHER_BASE,
    check(sim, v, s) { const p = E(sim, s); return p && p.species === "berry" && p.yield > 0 && carryRoom(v, "berry") > 0 ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s);
      if (!p || p.yield <= 0) return "done";
      p.yield--; if (p.yield === 0) p.nx = sim.tick + BERRY_REGROW;
      carryAdd(sim, v, "berry", 1);
      return p.yield > 0 && carryRoom(v, "berry") > 0 ? "more" : "done";
    },
  },
  root: {   // winter forage (§11.17): dig edible roots/grubs where a grass tuft stood. 3 rations per ~240 ticks of work (a patch holds a few), about 1/3 of berry picking
    dur: 240 * FORAGE_SLOW, skill: null, tr: "speed", base: GATHER_BASE,
    check(sim, v, s) { const p = E(sim, s); return p && p.species === "tuft" && p.yield > 0 && carryRoom(v, "berry") > 0 ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s);
      p.yield = 0; p.nx = sim.tick + ROOT_REGROW;
      carryAdd(sim, v, "berry", Math.min(3, carryRoom(v, "berry")));      // roots store as the same food item (spoils 3%/day in winter)
      return "done";
    },
  },
  cut: {    // gather a grass tuft
    dur: 30, skill: null, tr: "speed", base: GATHER_BASE,
    check(sim, v, s) { const p = E(sim, s); return p && p.species === "tuft" && p.yield > 0 && carryRoom(v, "grass") > 0 ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s);
      p.yield = 0; p.nx = sim.tick + TUFT_REGROW;
      carryAdd(sim, v, "grass", 1);
      return "done";
    },
  },
  chop: {   // fell a tree: 2 logs + 4 sticks fall loose at its cell; it becomes a sapling
    dur: 360, skill: null, tr: "strength",
    check(sim, v, s) { const p = E(sim, s); return p && p.species === "tree" && !p.burn ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s);
      fellTree(sim, p);
      dropLoose(sim, "log", 2, p.x, p.y, p.z);
      dropLoose(sim, "stick", 4, p.x, p.y, p.z);
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
        if (st.item !== s.item || !inStore(sim, st.x, st.y, st.z)) continue;
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
        const left = putStack(sim, v.carry.item, v.carry.n, c[0], c[1], c[2], v.carry.q);
        const placed = v.carry.n - left;
        if (placed <= 0) return "NO_STORAGE";
        carryTake(sim, v, placed);
      }
      return "done";
    },
  },
  hitch: {  // S15: take hold of a free wagon or cart (wagon.js): the load capacity becomes its own and the walk slows
    dur: 15, skill: null,
    check(sim, v, s) {
      const w = E(sim, s);
      if (!w || w.kind !== "wagon") return "GONE";
      return w.dr && w.dr !== v.id ? "RESERVED" : wagonReady(sim, w) || null;
    },
    work(sim, v, s) { const w = E(sim, s); if (!w || w.kind !== "wagon") return "GONE"; hitch(sim, v, w); return "done"; },
  },
  unhitch: { // S15: leave the wagon where it stands (at the store, after the drop); the trip is counted
    dur: 8, skill: null,
    check() { return null; },
    work(sim, v) { const w = wagonOf(sim, v); if (w) tripDone(sim, v, w); unhitch(sim, v); return "done"; },
  },
  cook: {   // S15: work the carried raw food at the lit fire ring of a kitchen (kitchen.js): more food comes out than went in, the better the room the more
    dur: 300, skill: "craft", tr: "intelligence",
    check(sim, v, s) { const h = E(sim, s); return h && h.f === "hearth" ? null : "GONE"; },
    work(sim, v, s) { const h = E(sim, s); return h ? cookAt(sim, v, h, s.dish) || "done" : "GONE"; },
  },
  dump: {   // no room in the stockpile: put the load down here (loose items are still counted and can be hauled later)
    dur: 10, skill: null,
    check(sim, v) { return v.carry ? null : "GONE"; },
    work(sim, v) { dropLoose(sim, v.carry.item, v.carry.n, v.x, v.y, v.z, v.carry.q); carryTake(sim, v, v.carry.n); return "done"; },
  },
  pickup: { // lift a loose stack (hauling baseline, §09)
    dur: 20, skill: null,
    check(sim, v, s) { const st = E(sim, s); return st && !inStore(sim, st.x, st.y, st.z) && carryRoom(v, st.item) > 0 ? null : "GONE"; },
    work(sim, v, s) {
      const st = E(sim, s);
      if (!st || carryRoom(v, st.item) <= 0) return "GONE";          // someone else took it (or my hands filled) during the lift
      const k = Math.min(st.n, carryRoom(v, st.item));
      carryAdd(sim, v, st.item, k);
      if (st.q !== undefined) v.carry.q = st.q;                       // S7b: a made item keeps its quality in the hands
      takeFromStack(sim, st, k);
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
      if (src.t === "carry") { food = ITEMS[v.carry.item].food * cookMul(sim, v, v.carry.item); if (food > ITEMS[v.carry.item].food || ITEMS[v.carry.item].cooked) ateCooked(sim, v); carryTake(sim, v, 1); }
      else if (src.t === "stock") { food = ITEMS[src.e.item].food * cookMul(sim, v, src.e.item); if (food > ITEMS[src.e.item].food || ITEMS[src.e.item].cooked) ateCooked(sim, v); takeFromStack(sim, src.e, 1); }
      else { src.e.yield--; if (src.e.yield === 0) src.e.nx = sim.tick + BERRY_REGROW; }
      v.hunger = Math.min(1, v.hunger + RATION * food);
      return v.hunger < 0.85 && foodSource(sim, v, s) ? "more" : "done";
    },
  },
  drink: {
    dur: 12, skill: null,
    check: () => null,
    work(sim, v) {
      v.thirst = Math.min(1, v.thirst + 0.12);
      drinkSip(sim, v, biomeAt(sim.world, v.x, v.y) === MARSH);                       // S14: water that stands still in the marsh makes people ill
      if (v.thirst < 0.99) return "more"; waterTouch(sim, v); return "done";
    },
  },
  sip: {    // S7b: drink from a water jar (one sip per 12 ticks of work; the jar runs dry)
    dur: 12, skill: null,
    check(sim, v, s) { const j = E(sim, s); return j && j.f === "waterjar" && j.fill > 0 ? null : "NO_WATER"; },
    work(sim, v, s) {
      const j = E(sim, s);
      if (!j || j.fill <= 0) return v.thirst > 0.5 ? "done" : "NO_WATER";
      j.fill--; v.thirst = Math.min(1, v.thirst + 0.12);
      return v.thirst < 0.99 && j.fill > 0 ? "more" : "done";
    },
  },
  fill: {   // S7b: scoop water at the stream into the hands (no item: a hide bag on the hip); `wc` sips are carried to a jar
    dur: 40, skill: null,
    check: () => null,
    work(sim, v) { v.wc = JAR_FETCH; return "done"; },
  },
  pour: {   // S7b: empty what is carried into a water jar (up to its capacity)
    dur: 20, skill: null,
    check(sim, v, s) { const j = E(sim, s); return j && j.f === "waterjar" && v.wc > 0 ? null : "GONE"; },
    work(sim, v, s) {
      const j = E(sim, s), put = Math.min(v.wc, JAR_CAP - j.fill);
      j.fill += put; v.wc = 0; sim.cache.iv++;
      once(sim, "firstJarFilled", "BUILT_FIRST", v.name + " filled the first water jar.", [v.id], {}, 1);
      return "done";
    },
  },
  load: {   // S7b: put the carried items into a station (kiln / mound / workbench) as part of a recipe
    dur: 20, skill: null,
    check(sim, v, s) {
      const st = E(sim, s);
      if (!st) return "GONE";
      if (st.rcp && st.rcp !== s.rcp && !loadedFor(st, s.rcp, sim.tick)) return "RESERVED";          // it holds another recipe's load (unless that has sat unlit for a day: work() returns it to the ground)
      return v.carry && v.carry.item === s.item && v.carry.n >= s.n ? null : "NO_MATERIAL";
    },
    work(sim, v, s) {
      const st = E(sim, s);
      if (st.rcp && st.rcp !== s.rcp) { for (const k of Object.keys(st.inv)) { const left = storeInZone(sim, k, st.inv[k]); if (left > 0) dropLoose(sim, k, left, st.x, st.y, st.z); } st.inv = {}; }      // the stale load of a called-off job goes back to the stockpile (what does not fit lies on the ground)
      carryTake(sim, v, s.n);
      st.inv[s.item] = (st.inv[s.item] || 0) + s.n; st.rcp = s.rcp; st.lt = sim.tick;
      sim.cache.iv++;
      return "done";
    },
  },
  light: {  // S7b: strike a loaded kiln or mound; it burns by itself for the recipe's time
    dur: 120, skill: "craft", tr: "intelligence",
    check(sim, v, s) { const st = E(sim, s); return st ? null : "GONE"; },
    work(sim, v, s) { const st = E(sim, s); return st ? light(sim, v, st, s.rcp) || "done" : "GONE"; },
  },
  make: {   // S7b: the work at a bench (a copper pick); duration is the recipe's
    dur: 600, skill: "craft", tr: "intelligence",
    check(sim, v, s) { const st = E(sim, s); return st ? null : "GONE"; },
    work(sim, v, s) { const st = E(sim, s); return st ? makeAtBench(sim, v, st, s.rcp) || "done" : "GONE"; },
  },
  equip: {  // S7b: take a pick (S8: or a spear; S9: the best pick, or the iron pick for deep rock) from the stockpile in hand for the work ahead; a worse tool in hand is set down
    dur: 20, skill: null,
    check(sim, v) { return v.carry ? "NO_CAPACITY" : null; },
    work(sim, v, s) {
      const items = sim.ents.ofKind("item");
      for (let i = 0; i < items.length; i++) {
        const st = items[i];
        if (st.item !== (s.item || "copper_pick") || !inStore(sim, st.x, st.y, st.z)) continue;
        if (v.eq) { dropLoose(sim, v.eq.item, 1, v.x, v.y, v.z, v.eq.q); v.eq = null; }
        v.eq = { item: st.item, u: toolUses(st.item, st.q), q: st.q === undefined ? 0.5 : st.q };
        takeFromStack(sim, st, 1);
        return "done";
      }
      return "NO_MATERIAL";
    },
  },
  strike: { // S8: ONE melee verb for the AI (hunting, defending) and the player (E or click on an adjacent creature): a swing every `dur` ticks of effort
    dur: 30, skill: null,
    check(sim, v, s) { const e = E(sim, s); return e && e.kind === "fauna" ? (near1(v, e) ? null : "TOO_FAR") : "GONE"; },
    work(sim, v, s) {
      const e = E(sim, s);
      if (!e || e.kind !== "fauna") return "done";                    // it is dead or gone: the fight is over
      if (!near1(v, e)) return "TOO_FAR";                             // it ran: the job re-plans and follows
      swing(sim, v, e);
      return sim.ents.get(s.tid) ? "more" : "done";
    },
  },
  // ---- S10: the field (till, sow, water, harvest) and the pen (stake, fodder, catch, release, slaughter) ----
  till: {   // break the ground of a raw plot (a digging stick is start knowledge): it can be sown from now on, and stays tilled through the winter
    dur: 160, skill: null, tr: "strength", base: GATHER_BASE,
    check(sim, v, s) { const p = E(sim, s); return p && p.kind === "plot" && !p.tl ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s);
      p.tl = 1; sim.cache.iv++;
      once(sim, "firstTilled", "BUILT_FIRST", v.name + " broke the first ground for a field.", [v.id], {}, 1);
      return "done";
    },
  },
  sow: {    // put one carried seed (a berry or a tuber) in a tilled plot; refused out of season (a late sowing would not ripen before the frost)
    dur: 50, skill: null, tr: "speed", base: GATHER_BASE,
    check(sim, v, s) {
      const p = E(sim, s);
      if (!p || p.kind !== "plot" || !p.tl || p.cr) return "GONE";
      if (!v.carry || v.carry.item !== s.item) return "NO_MATERIAL";
      return sowOk(sim, s.item) ? null : "NO_SEASON";
    },
    work(sim, v, s) {
      const p = E(sim, s);
      carryTake(sim, v, 1);
      p.cr = s.item; p.gr = 0; p.yl = 0; p.ov = 0; p.wt = 0; sim.cache.iv++;
      once(sim, "firstSown", "BUILT_FIRST", v.name + " sowed the first field.", [v.id], {}, 1);
      return "done";
    },
  },
  water: {  // pour a few sips from the hide bag on a sown plot: it grows at full speed for three days
    dur: 30, skill: null, tr: "speed", base: GATHER_BASE,
    check(sim, v, s) { const p = E(sim, s); return p && p.kind === "plot" && p.cr && !ripe(p) && v.wc >= WATER_SIPS ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s);
      v.wc -= WATER_SIPS; p.wt = sim.tick + WATERED_FOR;
      return "done";
    },
  },
  harvest: { // gather the ripe crop a unit at a time into the hands (the baseline hauling stores it); the plot is tilled again when it is empty
    dur: 12 * FORAGE_SLOW, skill: null, tr: "speed", base: GATHER_BASE,
    check(sim, v, s) { const p = E(sim, s); return p && p.kind === "plot" && ripe(p) && p.yl > 0 && carryRoom(v, p.cr) > 0 ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s), item = p.cr;
      p.yl--; carryAdd(sim, v, item, 1);
      if (p.yl <= 0) { p.cr = ""; p.gr = 0; p.yl = 0; p.ov = 0; sim.cache.iv++; once(sim, "firstHarvest", "BUILT_FIRST", v.name + " brought in the first harvest.", [v.id], {}, 2); return "done"; }
      return carryRoom(v, item) > 0 ? "more" : "done";
    },
  },
  stake: {  // set the carried sticks into the pen's fence; the last ones finish it
    dur: 120, skill: null, tr: "strength",
    check(sim, v, s) { const pn = penById(sim, s.pid); return pn && !pn.built && v.carry && v.carry.item === "stick" ? null : "GONE"; },
    work(sim, v, s) {
      const pn = penById(sim, s.pid), n = Math.min(v.carry.n, pn.need - pn.got);
      carryTake(sim, v, Math.max(1, n)); stake(sim, v, pn, n);
      return "done";
    },
  },
  fodder: { // tip the carried grass into the pen's trough
    dur: 30, skill: null,
    check(sim, v, s) { const pn = penById(sim, s.pid); return pn && pn.built && v.carry && v.carry.item === "grass" ? null : "GONE"; },
    work(sim, v, s) { const pn = penById(sim, s.pid); pn.fod += v.carry.n; carryTake(sim, v, v.carry.n); sim.cache.iv++; return "done"; },
  },
  catch: {  // S10: lay a hand on a wild hopper beside you: held, it travels with you to the pen (fauna.js)
    dur: 40, skill: null, tr: "speed",
    check(sim, v, s) { const e = E(sim, s); return e && e.kind === "fauna" && !e.tame && e.st !== "held" ? (near1(v, e) ? null : "TOO_FAR") : "GONE"; },
    work(sim, v, s) { const e = E(sim, s); return e ? catchTry(sim, v, e) : "GONE"; },
  },
  release: { // let the held hopper go inside the pen
    dur: 20, skill: null,
    check(sim, v) { return sim.ents.ofKind("fauna").some(q => q.st === "held" && q.by === v.id) ? null : "GONE"; },
    work(sim, v, s) { return releaseIn(sim, v, s.pid) || "done"; },
  },
  slaughter: { // kill and dress a penned hopper: meat and a hide
    dur: 60, skill: null, tr: "strength",
    check(sim, v, s) { const e = E(sim, s); return e && e.kind === "fauna" && e.tame ? (near1(v, e) ? null : "TOO_FAR") : "GONE"; },
    work(sim, v, s) { const e = E(sim, s); if (!e || !near1(v, e)) return "TOO_FAR"; butcher(sim, v, e); return "done"; },
  },
  mend: {   // S8: rest to heal a wound (the body mends faster at rest, villager.js updateNeeds); ends when nearly healed or a need bites
    dur: 20, skill: null,
    check(sim, v) { v.rest = 1; return null; },
    work(sim, v) {
      const mh = maxHp(v, fitness(v, ageDays(sim, v)));
      return v.hp >= 0.9 * mh || v.hunger < 0.1 || v.thirst < 0.1 || (v.fear || 0) > 0.6 ? done(v) : "more";
    },
  },
  convalesce: { // S14: a sick villager lies down (in their bed if they own one) until it passes; the body fights it better at rest, and hunger and thirst still pull them up
    dur: 20, skill: null,
    check(sim, v, s) {
      if (s.tid && !claimBed(sim, v, E(sim, s))) return "RESERVED";
      v.rest = s.tid ? 2 : 1;
      return null;
    },
    work(sim, v) { return !v.ill || v.hunger < 0.12 || v.thirst < 0.12 || (v.fear || 0) > 0.6 ? done(v) : "more"; },
  },
  tend: {   // S14: sit with a sick villager (and give them the remedy in hand): they mend faster for a day and the nurse risks catching it
    dur: 160, skill: null,
    check(sim, v, s) { const p = E(sim, s); return p && p.kind === "villager" && p.ill ? (Math.abs(p.x - v.x) <= 1 && Math.abs(p.y - v.y) <= 1 ? null : "TOO_FAR") : "GONE"; },
    work(sim, v, s) { const p = E(sim, s); if (!p || !p.ill) return "done"; tendPatient(sim, v, p); return "done"; },
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
    dur: 240, skill: "craft", tr: "intelligence",
    check(sim, v, s) {
      const site = E(sim, s);
      return site && v.carry && v.carry.item === s.item && v.carry.n >= s.n ? null : "NO_MATERIAL";
    },
    work(sim, v, s) {
      const site = E(sim, s);
      carryTake(sim, v, s.n);
      const { x, y, z, what } = site;
      sim.ents.remove(site.id);
      const fresh = novelCell(sim, x, y, z);       // the bed is new output even on a floor you built; only a bed made here before pays nothing
      sim.ents.add("furniture", { f: what, x, y, z, owner: 0, rv: 0, rt: 0 });
      sim.world.setFlags(x, y, z, sim.world.flags(x, y, z) | F.USED);      // building and taking down the same bed must not pay twice
      gain(sim, v, "craft", VALUE[what], fresh);
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
    dur: 120, skill: "build", tr: "strength",       // (s.sk = "craft" for a planned bed or rack)
    check(sim, v, s) { const site = E(sim, s); return site && site.got >= costOf(site.w, site.m).n ? null : site ? "NO_MATERIAL" : "GONE"; },
    work(sim, v, s) {
      const site = E(sim, s);
      if (!site) return "GONE";
      const { x, y, z, w } = site, cell = w === "floor" ? [x, y, z - 1] : w === "roof" ? [x, y, z + 1] : [x, y, z];
      const fresh = novelCell(sim, cell[0], cell[1], cell[2]);
      const b = finishSite(sim, v, site);
      if (b) return b;
      gain(sim, v, s.sk || "build", VALUE[w === "wall" || w === "door" ? "wall" : w], fresh);   // net-new matter only (R17)
      return "done";
    },
  },
  unbuild: { // take down a marked piece (S4b): ~75% of the materials come back loose; no XP
    dur: 80, skill: null,
    check(sim, v, s) { return E(sim, s) ? null : "GONE"; },
    work(sim, v, s) { const d = E(sim, s); return d ? unbuild(sim, d) || "done" : "GONE"; },
  },
  dig: {    // remove a terrain cell; what it holds falls loose in the hole (DIG table). Pays dig XP only for natural ground (R17)
    dur: 200, skill: "dig", tr: "strength",
    check(sim, v, s) {
      if (!(s.did ? diggableMarked : diggable)(sim, s.cx, s.cy, s.cz)) return "GONE";
      const need = toolNeeded(sim, s.cx, s.cy, s.cz);                                   // S9: deep rock wants an iron pick in hand
      return need && !(v.eq && v.eq.item === need) ? "NO_TOOL" : null;
    },
    work(sim, v, s) {
      if (!(s.did ? diggableMarked : diggable)(sim, s.cx, s.cy, s.cz)) return "GONE";
      if (s.did) uproot(sim, s.cx, s.cy, s.cz);
      const w = sim.world, m = w.mat(s.cx, s.cy, s.cz), info = DIG[m], fresh = novelCell(sim, s.cx, s.cy, s.cz);
      w.set(s.cx, s.cy, s.cz, M.AIR, w.flags(s.cx, s.cy, s.cz) & ~F.PLAYER);
      let fz = s.cz; while (fz > 1 && w.mat(s.cx, s.cy, fz - 1) === M.AIR) fz--;               // S12: what falls out of a hole with no floor under it lands on the floor below, where it can be reached
      for (const id of sim.ents.at(s.cx, s.cy, s.cz + 1).slice()) { const e = sim.ents.get(id); if (e.kind === "item") sim.ents.move(e, s.cx, s.cy, fz); }
      let got;
      if (m === M.CACHE) got = openCache(sim, v, s.cx, s.cy, fz);                           // 7.21: a sealed cache spills its table (traps.js), not one ore
      else { got = oreYield(sim, info.item, info.n, World.idx(s.cx, s.cy, s.cz)); dropLoose(sim, info.item, got, s.cx, s.cy, fz); }       // S14: this world's richer or leaner ore
      gain(sim, v, "dig", VALUE[info.item], fresh, info.hard ? HARD_DIFFICULTY : undefined);   // hard rock teaches only past 0.8 (§10)
      sim.disc.dg = (sim.disc.dg || 0) + 1; if (info.hard) sim.disc.hd = 1;                    // S7b: tool_edge pressure counts the digging
      wearPick(sim, v);
      const sj = mineSubject(m);
      if (sj) feel(sim, v, sj, "good", sj === "gem" ? 30 : 8);                              // experiment (memory.js): what the dig turned up
      reveal(sim, s.cx, s.cy, s.cz);                                // the digger looks into the hole: its neighbours are now seen (fog, §13.8)
      if (s.did) mineDug(sim, s.did, m, got, s.cx, s.cy, s.cz);
      return "done";
    },
  },
  disarm: { // 7.21: defuse a spotted trap beside me (a craft job; a skilled hand mostly succeeds and keeps the parts, a slip sets it off in their face)
    dur: 120, skill: "craft", tr: "intelligence",
    check(sim, v, s) { return isSeenTrap(sim, s.tx, s.ty, s.tz) ? null : "GONE"; },
    work(sim, v, s) {
      const r = disarm(sim, v, s.tx, s.ty, s.tz);
      if (r === "gone") return "GONE";
      if (r === "ok") gain(sim, v, "craft", 0.5, false);
      return "done";
    },
  },
  feed: {   // S7a: put the carried sticks / logs on a hearth; lights it. Needs a living knower of FIRE_TENDING; low familiarity wastes fuel (§10)
    dur: 60, skill: null,
    check(sim, v, s) {
      const h = E(sim, s);
      if (!h || h.f !== "hearth") return "GONE";
      if (!can(sim, "FIRE_TENDING")) return "UNKNOWN_CRAFT";
      return v.carry && FUEL_ITEMS.includes(v.carry.item) ? null : "NO_MATERIAL";
    },
    work(sim, v, s) {
      const h = E(sim, s), item = v.carry.item;
      const used = addFuel(h, item, v.carry.n, wasteOf(famOf(v, "FIRE_TENDING")), fuelMul(sim, item));
      if (used) { carryTake(sim, v, used); useCraft(sim, v, "FIRE_TENDING"); sim.cache.iv++; }
      onceLog(sim, "firstHearthLit", "BUILT_FIRST", v.name + " lit the first hearth fire.", [v.id], {}, 1);
      return "done";
    },
  },
  tinker: { // S7a: one experiment (discovery.js attempt): consumes the carried material, may fire a phenomenon, else records a dead end
    dur: 300, skill: null,
    check(sim, v, s) { return (s.item === "deadwood" || (v.carry && v.carry.item === s.item)) && (!s.with || stockCount(sim, s.with) >= 1) ? null : "NO_MATERIAL"; },
    work(sim, v, s) {
      if (s.item !== "deadwood") carryTake(sim, v, 1);
      if (s.with && !TOOL_ITEMS.includes(s.with)) takeStock(sim, s.with, 1);   // the fuel (or the mould) that goes in with it comes off the stockpile; an axe stays
      attempt(sim, v, { item: s.item, with: s.with || "", fuel: s.fuel || "", verb: s.verb, site: s.site });
      return "done";
    },
  },
  tuber: {  // dig a tuber plant: food that keeps in winter. 3 rations per ~200 ticks of work
    dur: 200 * FORAGE_SLOW, skill: null, tr: "speed", base: GATHER_BASE,
    check(sim, v, s) { const p = E(sim, s); return p && p.species === "tuber" && p.yield > 0 && carryRoom(v, "tuber") > 0 ? null : "GONE"; },
    work(sim, v, s) {
      const p = E(sim, s);
      const n = Math.min(p.yield, carryRoom(v, "tuber"));
      p.yield -= n; if (p.yield === 0) p.nx = sim.tick + TUBER_REGROW;
      carryAdd(sim, v, "tuber", n);
      return "done";
    },
  },
  dry: {    // sun-dry 5 fresh -> 4 dried on a stick rack (§11.17: no fire needed). Food preservation is a craft.
    dur: 360, skill: "craft", tr: "intelligence", base: SUN_DRY_BASE,
    check(sim, v, s) {
      const r = E(sim, s);
      return r && v.carry && v.carry.item === "berry" && v.carry.n >= 5 ? null : "NO_MATERIAL";
    },
    work(sim, v) {
      carryTake(sim, v, 5);
      carryAdd(sim, v, "dried", 4);
      gain(sim, v, "craft", 4 * VALUE.dried, true);
      return "done";
    },
  },
};
export { diggable };
/** Take (or share) a bed: adults own one; a child with no bed of its own may share a parent's. */
function claimBed(sim, v, b) {
  if (!b) return false;
  if (!b.owner) {
    const old = v.bed ? sim.ents.get(v.bed) : null;
    if (old && old.owner === v.id) old.owner = 0;               // moving to a better bed (a warm room's) frees the old one
    b.owner = v.id; v.bed = b.id; return true;
  }
  if (b.owner === v.id) return true;
  return (ageDays(sim, v) < maturity(v) && v.par.includes(b.owner)) || (v.mate && b.owner === v.mate);     // S13: partners share a bed
}
function done(v) { v.rest = 0; v.slp = 0; return "done"; }


/** Remove `n` of an item from the stockpile (the caller checked stockCount). */
function takeStock(sim, item, n) {
  const items = sim.ents.ofKind("item");
  for (let i = 0; i < items.length && n > 0; i++) {
    const st = items[i];
    if (st.item !== item || !inStore(sim, st.x, st.y, st.z)) continue;
    const k = Math.min(n, st.n); takeFromStack(sim, st, k); n -= k; i--;
  }
}

export function stockCount(sim, item) {
  let n = 0; const items = sim.ents.ofKind("item");
  for (let i = 0; i < items.length; i++) if (items[i].item === item && inStore(sim, items[i].x, items[i].y, items[i].z)) n += items[i].n;
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
    if (ITEMS[st.item].food === 0 || !inStore(sim, st.x, st.y, st.z)) continue;
    if (!best || ITEMS[st.item].spoil > ITEMS[best.item].spoil) best = st;     // what spoils fastest goes first (raw meat, then berries ...); smoked meat and dried fruit are the winter larder
  }
  return best ? { t: "stock", e: best } : null;
}

/**
 * The real length of the current Task step (pure, read-only; the first-person HUD's countdown). -> null when the step is not working, else
 * {verb, need, rate, left, item, n}: work needed per unit (`need`, compared with action.p), work per tick (`rate`, with skill, tool, mood and inspiration),
 * units still to come in this step (`left`: berries on the bush, ripe crop in the plot; 1 for a one-shot) and what a unit gives (`item`, `n`; item "" if none).
 */
export function stepNeed(sim, v, step) {
  const a = v.action, s = step || (a && a.steps && a.steps[a.si]);
  if (!s) return null;
  const vb = VERBS[s.v]; if (!vb) return null;
  const out = { verb: s.v, need: s.dur || vb.dur, rate: rate(sim, v, s.v, s.sk || vb.skill), left: 1, item: "", n: 0 };
  const p = s.tid ? sim.ents.get(s.tid) : null;
  if (s.v === "pick" && p) { out.left = Math.max(1, Math.min(p.yield, carryRoom(v, "berry"))); out.item = "berry"; out.n = 1; }
  else if (s.v === "harvest" && p && p.cr) { out.left = Math.max(1, Math.min(p.yl, carryRoom(v, p.cr))); out.item = p.cr; out.n = 1; }
  else if (s.v === "chop") { out.item = "log"; out.n = 2; }
  else if (s.v === "cut") { out.item = "grass"; out.n = 1; }
  else if (s.v === "root") { out.item = "berry"; out.n = 3; }
  else if (s.v === "dig" && s.cx !== undefined) { const info = DIG[sim.world.mat(s.cx, s.cy, s.cz)]; if (info) { out.item = info.item; out.n = info.n; } }
  return out;
}

// ---- the runner ------------------------------------------------------------

ACTIONS.Task = {
  step(sim, v, a) {
    const s = a.steps[a.si];
    const verb = VERBS[s.v];
    if (a.ph === 0) {
      if (s.z >= 0 && !(v.x === s.x && v.y === s.y && v.z === s.z)) {
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
    const skill = s.sk || verb.skill;                       // a step may name its own skill (planned beds and racks are craft, walls are build)
    a.p += rate(sim, v, s.v, skill);
    if (skill) noteWork(sim, v, skill);
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
  if (s.tid && !((s.v === "strike" || s.v === "catch" || s.v === "slaughter") && a.blocker === "TOO_FAR")) {       // a creature that moved off is chased again, not given up on
    v.bad.push([s.tid, sim.tick + 600]);       // unreachable_cooldown (§09)
    if (v.bad.length > 8) v.bad.shift();
  }
  return ST.FAILED;
}
