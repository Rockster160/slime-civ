// Illness (S14, the second hazard family; GDD §13.6, MVP_SCOPE §1.2): a sickness that spreads from four sources and between people.
//
//   v.ill = {t0, s, p, d, c, tc, rm, ck, bd, fn, n}   sick since t0; severity s (0.4..1); progress p (0..1 = recovered); d = health lost per day now; c = what it came from;
//                                                     tc = tick last tended; rm = tick a remedy was taken; ck = tick last ate cooked food; bd/fn/n = samples in a bed / by a fire / taken
//   v.ex v.exk   the day's exposure so far (a probability) and the biggest single source;   v.imm  immune until this tick (a recovery lasts a while)
//
// SOURCES add to a villager's exposure (a probability per day, rolled once at the daily tick with the "ill" stream, only for the exposed):
//   spoiled food    the day's rotted food beyond ROT_FREE units (jars, a cellar, smoking, eating it in time keep that at zero)
//   bad water       drinking where the water stands still (the marsh): WATER_SIP each sip
//   carrion         raw meat lying loose near them: CARRION per 100 ticks
//   crowding        an enclosed room with fewer than ROOM_PER cells a head and four or more people in it (no vent shaft in it): CROWD x (people - 3) per 100 ticks
//   the sick        CATCH_ROOM (x CROWD_X when crowded) per 100 ticks in the same enclosed room, CATCH_NEAR within 2 cells in the open, CATCH_CARE for each hour of nursing
// A SICK villager rests (job convalesce, jobs.js), works at SICK_WORK of their pace and walks slower. Health drains by `d` a day and the usual healing stops while sick, so
// the weak (elders, children, the wounded) can die of it. Recovery (progress per day) is helped by: a bed, a warm fire, a cooked meal, being nursed (job tend_sick), and above all
// a herbal remedy (HERBAL, made from marsh herb at the bench). Everything here is gated by sim.dp.on and costs nothing in a world made before S14.
import { DUR_DAY } from "./clock.js";
import { log, once } from "./chronicle.js";
import { clamp, r3 } from "./util.js";
import { occupants } from "./rooms.js";
import { World, M } from "./world.js";
import { sight } from "./discovery.js";
import { can } from "./knowledge.js";
import { ITEMS, inStore } from "./items.js";
import { fireBonus } from "./fire.js";
import { isAdult, isElder, stepTicks, fitness, ageDays } from "./villager.js";

export const ROT_FREE = 3;            // units of food that may rot in a day without making anyone ill
export const ROT_RATE = 0.007;        // exposure per villager per unit beyond that
export const WATER_SIP = 0.03;        // exposure per sip of stagnant marsh water
export const CARRION = 0.003;         // per 100 ticks within CARRION_R cells of a loose raw-meat stack
export const CARRION_R = 4;
export const ROOM_PER = 3;            // cells a head below which an enclosed room is stuffy ...
export const CROWD = 0.004;           // ... exposure per 100 ticks per person over three
export const CATCH_ROOM = 0.006, CROWD_X = 3, CATCH_NEAR = 0.006, CATCH_CARE = 0.012;
export const SICK_WORK = 0.6;         // a sick villager works at this share of their pace
export const SICK_WALK = 1.3;         // and takes this much longer per step
export const DRAIN = 9;               // health lost per day at severity 1 and no help
export const IMMUNE_DAYS = 20;
export const BASE_RATE = 0.09;        // progress per day with no help: about eleven days
export const HELP = { bed: 0.06, fire: 0.04, cook: 0.04, care: 0.05, remedy: 0.15 };      // added progress per day (full help ~0.43: about two and a half days)
export const REMEDY_DAYS = 3;         // a remedy works this long
export const OUTBREAK_N = 3, OUTBREAK_DAYS = 6;
export const HERB_SEE = 5;            // a sick villager this close to marsh herb may chew it (the witness route to HERBAL)
export const HERB_P = 0.35;

export const isSick = (v) => !!v.ill;
export function sickOnes(sim) { return sim.ents.ofKind("villager").filter(v => v.ill); }

/** Add exposure to a villager (the largest single addition names the cause). */
export function expose(v, amt, why) {
  const was = v.ex || 0;
  if (!v.exk || amt > (v.exm || 0)) { v.exk = why; v.exm = amt; }
  v.ex = r3(was + amt);
}

/** A sip of water where it stands still. Called by the drink verb. */
export function drinkSip(sim, v, bad) { if (bad && sim.dp && sim.dp.on && !v.ill) expose(v, WATER_SIP, "stagnant marsh water"); }
/** Eating cooked food helps recovery (called by the eat verb). */
export function ateCooked(sim, v) { if (v.ill) v.ill.ck = sim.tick; }

/** Health lost per day while sick, from severity and the help they are getting (the progress rate above BASE_RATE, as a share of its maximum). */
export function drainOf(i) {
  const help = clamp(((i.rt || BASE_RATE) - BASE_RATE) / (HELP.bed + HELP.fire + HELP.cook + HELP.care + HELP.remedy), 0, 1);
  return r3(DRAIN * i.s * (1 - 0.6 * help));
}

/** Catch it: the villager is sick from now on. */
export function fallIll(sim, v, why) {
  const age = isAdult(sim, v) ? 0 : 0.1, hardy = clamp(1.05 - v.t.hardiness, -0.1, 0.25);
  const s = r3(clamp(0.55 + hardy + age + (isElder(sim, v) ? 0.15 : 0), 0.4, 1));       // the hardy shrug it off; children and elders have it worse
  v.ill = { t0: sim.tick, s, p: 0, d: 0, c: why, tc: 0, rm: 0, ck: 0, bd: 0, fn: 0, n: 0, rt: BASE_RATE };
  v.ill.d = drainOf(v.ill);
  v.ex = 0; v.exk = ""; v.exm = 0;
  v.mv = stepTicks(v, fitness(v, ageDays(sim, v)));            // a sick villager walks slower from now
  const d = sim.dp;
  d.cases++; d.lt = sim.tick;
  if (d.ot < 0 || sim.tick - d.ot > OUTBREAK_DAYS * DUR_DAY) { d.ot = sim.tick; d.oc = 0; }
  d.oc++;
  once(sim, "firstIllness", "DISASTER", v.name + " fell ill (" + why + "). Sickness can spread: keep the sick resting, warm and fed.", [v.id], { why }, 2);
  log(sim, "DISASTER", v.name + " fell ill (" + why + ").", [v.id], { why, ill: 1 }, 1);
  if (d.oc === OUTBREAK_N) log(sim, "DISASTER", "Sickness is spreading through the village: " + d.oc + " have fallen ill in " + OUTBREAK_DAYS + " days.", [], { outbreak: 1 }, 2);
  sim.cache.iv++;
}

/** Nursing (verb tend_sick): the carer sits with the patient; a remedy in hand is given. */
export function tend(sim, carer, patient) {
  if (!patient.ill) return;
  patient.ill.tc = sim.tick;
  if (carer.carry && carer.carry.item === "herbal_remedy") {
    patient.ill.rm = sim.tick;
    carer.carry.n--; if (carer.carry.n <= 0) carer.carry = null;
    sim.cache.iv++;
    once(sim, "firstRemedy", "MILESTONE", carer.name + " gave " + patient.name + " the first herbal remedy.", [carer.id, patient.id], {}, 1);
  }
  if (!carer.ill) expose(carer, CATCH_CARE, "nursing " + patient.name);
}

// ---- every 100 ticks: contagion and the room sources -----------------------------------------------------------------

export function illTick(sim) {
  if (!sim.dp || !sim.dp.on) return;
  const vs = sim.ents.ofKind("villager"), t = sim.tick;
  const sick = vs.filter(v => v.ill);
  for (const v of sick) {                                                           // samples of how the day is being spent (bed, fire)
    const i = v.ill; i.n++;
    if (v.rest === 2) i.bd++;
    if (fireBonus(sim, v) > 0.05) i.fn++;
  }
  const rooms = new Map();
  for (const v of vs) {
    const room = sim.rooms.at(v.x, v.y, v.z);
    if (room && room.enclosed) rooms.set(room, (rooms.get(room) || 0) + 1);
  }
  const crowded = new Set();
  for (const [room, n] of rooms) {
    if (n < 4 || room.n >= ROOM_PER * n || ventedRoom(sim, room)) continue;
    crowded.add(room);
    for (const v of vs) if (!v.ill && (v.imm || 0) <= t && sim.rooms.at(v.x, v.y, v.z) === room) expose(v, CROWD * (n - 3), "a crowded, stuffy room");
  }
  if (sick.length) for (const o of vs) {
    if (o.ill || (o.imm || 0) > t) continue;
    const ro = sim.rooms.at(o.x, o.y, o.z);
    for (const s of sick) {
      if (Math.abs(s.z - o.z) > 1) continue;
      const rs = sim.rooms.at(s.x, s.y, s.z);
      if (ro && ro.enclosed && ro === rs) expose(o, CATCH_ROOM * (crowded.has(ro) ? CROWD_X : 1), "catching it from " + s.name);
      else if (Math.abs(s.x - o.x) <= 2 && Math.abs(s.y - o.y) <= 2) expose(o, CATCH_NEAR, "catching it from " + s.name);
    }
  }
  const meat = sim.ents.ofKind("item").filter(s => s.item === "hopper_meat" && !inStore(sim, s.x, s.y, s.z));
  if (meat.length) for (const v of vs) {
    if (v.ill || (v.imm || 0) > t) continue;
    for (const s of meat) if (Math.abs(s.x - v.x) <= CARRION_R && Math.abs(s.y - v.y) <= CARRION_R && Math.abs(s.z - v.z) <= 2) { expose(v, CARRION, "carrion left lying about"); break; }
  }
}
/** A vent shaft inside the room clears its air. */
function ventedRoom(sim, room) {
  for (const f of sim.ents.ofKind("furniture")) if (f.f === "vent" && sim.rooms.at(f.x, f.y, f.z) === room) return true;
  return false;
}

// ---- once a day ------------------------------------------------------------------------------------------------------

export function illDaily(sim) {
  if (!sim.dp || !sim.dp.on) return;
  const t = sim.tick, r = sim.rng.stream("ill"), vs = sim.ents.ofKind("villager").slice();
  let rot = 0;
  const lost = (sim.farm && sim.farm.sp && sim.farm.sp.d) || {};
  for (const k of Object.keys(lost)) if (ITEMS[k] && ITEMS[k].food > 0) rot += lost[k];
  const rotExp = Math.max(0, rot - ROT_FREE) * ROT_RATE;
  for (const v of vs) {
    if (!sim.ents.get(v.id)) continue;
    if (v.ill) { recover(sim, v); continue; }
    if (rotExp > 0 && (v.imm || 0) <= t) expose(v, rotExp, "spoiled food");
    const ex = v.ex || 0;
    if (ex > 0) {
      if ((v.imm || 0) <= t && r.float() < clamp(ex * (isAdult(sim, v) && !isElder(sim, v) ? 1 : 1.3), 0, 0.6)) fallIll(sim, v, v.exk || "an unknown cause");
      v.ex = 0; v.exk = ""; v.exm = 0;
    }
  }
  if (!can(sim, "HERBAL")) for (const v of sim.ents.ofKind("villager")) {          // the witness route: the sick chew the bitter herb that grows by the water
    if (!v.ill || !herbNear(sim, v) || sim.rng.stream("ill.herb").float() >= HERB_P) continue;
    sight(sim, "HERBAL_REMEDY", "herb", v.x, v.y, v.z, v);
  }
}
function herbNear(sim, v) {
  const w = sim.world;
  for (let dy = -HERB_SEE; dy <= HERB_SEE; dy++) for (let dx = -HERB_SEE; dx <= HERB_SEE; dx++) {      // S16: marsh herb is a material on the surface; look for it round the villager
    const x = v.x + dx, y = v.y + dy;
    for (let z = Math.max(0, v.z - 2); z <= v.z; z++) if (w.mat(x, y, z) === M.HERB) return true;
  }
  return false;
}

function recover(sim, v) {
  const i = v.ill, t = sim.tick, n = Math.max(1, i.n);
  const bedF = i.bd / n, fireF = i.fn / n;
  const rate = BASE_RATE + HELP.bed * bedF + HELP.fire * fireF
    + (t - i.ck < DUR_DAY ? HELP.cook : 0) + (t - i.tc < DUR_DAY ? HELP.care : 0) + (i.rm && t - i.rm < REMEDY_DAYS * DUR_DAY ? HELP.remedy : 0);
  i.rt = r3(rate); i.p = r3(i.p + rate); i.bd = 0; i.fn = 0; i.n = 0;
  i.d = drainOf(i);
  if (i.p >= 1) {
    v.ill = null; v.imm = t + IMMUNE_DAYS * DUR_DAY; v.mv = stepTicks(v, fitness(v, ageDays(sim, v)));
    log(sim, "MILESTONE", v.name + " recovered from the sickness after " + Math.round((t - i.t0) / DUR_DAY) + " days" + (i.rm ? ", helped by a remedy" : i.tc ? ", nursed" : "") + ".", [v.id], { recovered: 1 }, 1);
    sim.cache.iv++;
  }
}

/** The plain-words status of a sick villager for the inspector: [{text}] . */
export function illLines(sim, v) {
  const i = v.ill, t = sim.tick, out = [];
  if (!i) return out;
  out.push("Sick for " + Math.max(1, Math.round((t - i.t0) / DUR_DAY)) + " day(s), from " + i.c + ". Recovering " + Math.round(100 * i.p) + "%, health draining " + i.d.toFixed(1) + " a day.");
  const help = [];
  if (i.rm && t - i.rm < REMEDY_DAYS * DUR_DAY) help.push("a herbal remedy");
  if (t - i.tc < DUR_DAY) help.push("being nursed");
  if (t - i.ck < DUR_DAY) help.push("a cooked meal");
  out.push(help.length ? "Helping: " + help.join(", ") + "." : "Nothing is helping yet: a warm bed, cooked food, someone to sit with them, or a herbal remedy all speed recovery.");
  out.push("They work at " + Math.round(SICK_WORK * 100) + "% pace and stay clear of others; the sickness spreads to anyone close, most in a crowded room.");
  return out;
}
export const illCause = "illness";
