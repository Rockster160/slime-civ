// Villagers: traits, life stages, needs, death (GDD §08, ported in spirit from
// slime-village slime/sim/slime.js + ai.js; numbers rescaled to the GDD clock).
//
// A villager is an entity {kind:"villager", ...}: all plain JSON.
//   t      traits (multipliers around 1): strength speed intelligence hardiness appetite fertility longevity
//   hue    colour (0..359), lin founder lineage, par parent ids, gen generation
//   born   tick of birth (negative for founders), prime = age in days where decline starts
//   needs  hunger thirst energy warm mood in 0..1 (1 = fine); hp health; hard = lifelong hardship
//   bed    id of the leaf bed I own (0 none); mate id; cd = tick I may breed again
//   rest   0 awake / 1 on the ground / 2 in a bed (huddling or sleeping); slp 1 = asleep
//   carry  {item,n} | null; action; job; why; order; sk; ep (board epoch seen); bad [[targetId,untilTick]]
import { DAY } from "./clock.js";
import { clamp, expNeg, settle, r3 } from "./util.js";
import { tempAt } from "./season.js";
import { occupants } from "./rooms.js";

export const LIFE_DAYS = 400;               // a life is ~4 game years of 100 days (GDD §23 box, R1)
export const NEED_STEP = 10;                // needs update every 10 ticks per villager (staggered by id)
export const TRAITS = ["strength", "speed", "intelligence", "hardiness", "appetite", "fertility", "longevity"];
export const FOUNDER_RANGE = {              // GDD §08 table; hardiness is the maxHealth/cold trait, appetite the upkeep trait
  strength: [0.8, 1.2], speed: [0.8, 1.2], intelligence: [0.8, 1.2], hardiness: [0.85, 1.15],
  appetite: [0.85, 1.15], fertility: [0.8, 1.2], longevity: [0.9, 1.1],
};
export const THIRST_RATE = 0.35;           // per day; GDD §08 says 0.5, but water is ~25 cells away and carrying it is out of C1
export const BED_WARMTH = 0.10;            // a leaf bed (insulation from the ground)
export const HUDDLE_EACH = 0.04;           // each resting neighbour within 2 cells
export const HUDDLE_MAX = 0.12;
export const ROOM_HUDDLE = 0.015;           // each other villager in the same enclosed room (on top of the neighbour huddle)
export const ROOM_HUDDLE_MAX = 0.06;
export const COMFORT = 0.30;                // body-temperature comfort threshold (design call, tuned)
export const COLD_DRAIN = 0.14;             // warmth lost per day per unit of cold deficit
export const AGE_DMG = 1.6;                 // slime-village AGE_DMG shape: health/day * frailty^2
export const ELDER_DECAY = 1 / 130;         // fitness e-folding past prime (days^-1)

// ---- life stages ----------------------------------------------------------

/** slime-village lifePace: long-lived lines mature slower. */
export function pace(v) { return v.t.longevity * (1.04 - v.t.hardiness * 0.04); }
export function ageDays(sim, v) { return (sim.tick - v.born) / DAY; }
export function childEnd(v) { return 0.15 * LIFE_DAYS * pace(v); }
export function maturity(v) { return 0.20 * LIFE_DAYS * pace(v); }
export function isAdult(sim, v) { return ageDays(sim, v) >= maturity(v); }
export function isElder(sim, v) { return ageDays(sim, v) > v.prime; }
export function lifeStage(sim, v) { const a = ageDays(sim, v); return a < maturity(v) ? "child" : a > v.prime ? "elder" : "adult"; }

/** 0..1 capability: rises to prime, then fades with no floor (§08 aging). */
export function fitness(v, age) {
  const c = childEnd(v);
  if (age < c) return 0.25 + 0.35 * (age / c);
  if (age < v.prime) return 0.6 + 0.4 * ((age - c) / Math.max(1, v.prime - c));
  return expNeg((age - v.prime) * ELDER_DECAY / Math.max(0.4, pace(v)));
}
export function maxHp(v, fit) { return 100 * v.t.hardiness * (0.45 + 0.55 * fit); }
/** Rations of food this villager needs per game day (§11.17: juvenile 0.5, elder 0.8; appetite scales). */
export function dailyNeed(sim, v) {
  const a = ageDays(sim, v);
  return v.t.appetite * (a < maturity(v) ? 0.5 : a > v.prime ? 0.8 : 1);
}
/** Ticks per cell walked: speed trait and fitness (slime-village speed formula). */
export function stepTicks(v, fit) { return Math.max(3, Math.round(6 / (v.t.speed * (0.55 + 0.45 * fit)))); }
/** Work-rate multiplier (before skill): fitness and mood (§08: mood < 0.30 slows work 15%). */
export function workFactor(v, fit) { return (0.55 + 0.45 * fit) * (v.mood < 0.1 ? 0.7 : v.mood < 0.3 ? 0.85 : 1); }

// ---- needs ----------------------------------------------------------------

/** Squared ramp 0 at the soft threshold .. 1 at the critical one (§09). */
export function urgency(level, soft, crit) { const x = clamp((soft - level) / (soft - crit), 0, 1); return x * x; }
// warm: critical (0.30) sits just above where cold starts to hurt (0.25), so a cold villager stops for warmth before it is injured.
export const SOFT = { hunger: [0.5, 0.15], thirst: [0.5, 0.2], energy: [0.4, 0.1], warm: [0.55, 0.30], mood: [0.4, 0.1] };

/**
 * Advance one villager's body by NEED_STEP ticks. Returns the death cause or null.
 * Cold model (documented simply): air temp = seasonal warmth - night drop. Sleeping or
 * huddling in a leaf bed adds BED_WARMTH; any rest beside other resters adds HUDDLE_EACH each (max
 * HUDDLE_MAX) - "near others". Below COMFORT warmth drains with the deficit; above it, it recovers.
 */
export function updateNeeds(sim, v) {
  const dt = NEED_STEP / DAY;
  const age = ageDays(sim, v), fit = fitness(v, age);
  const asleep = v.slp === 1, resting = v.rest > 0;
  const child = age < maturity(v), elder = age > v.prime;

  v.hunger = Math.max(0, v.hunger - 0.25 * v.t.appetite * (child ? 0.5 : elder ? 0.8 : 1) * (asleep ? 0.6 : 1) * dt);
  v.thirst = Math.max(0, v.thirst - THIRST_RATE * (asleep ? 0.6 : 1) * dt);
  if (asleep) v.energy = Math.min(1, v.energy + (v.rest === 2 ? 2.0 : 1.3) * dt);   // bed rests better than ground (§08)
  else v.energy = Math.max(0, v.energy - (resting ? 0.35 : 0.7) * dt);
  const leisure = v.action && v.action.type === "Wander";
  v.mood = clamp(v.mood + (leisure ? 4.0 : -0.15) * dt, 0, 1);

  let bonus = 0;
  if (resting) {
    if (v.rest === 2) bonus += BED_WARMTH;
    let near = 0;
    for (const o of sim.ents.ofKind("villager")) {
      if (o === v || o.rest === 0) continue;
      if (Math.abs(o.x - v.x) <= 2 && Math.abs(o.y - v.y) <= 2) near++;
    }
    bonus += Math.min(HUDDLE_MAX, HUDDLE_EACH * near);
  }
  // Inside an enclosed, roofed room the walls keep the heat in: the room's insulation-scaled bonus applies awake or asleep (§11.9, S4a).
  const room = sim.rooms.at(v.x, v.y, v.z);
  if (room && room.enclosed) bonus += room.warm + Math.min(ROOM_HUDDLE_MAX, ROOM_HUDDLE * (occupants(sim, room) - 1));
  const comfort = COMFORT - 0.5 * (v.t.hardiness - 1) + (child || elder ? 0.05 : 0);
  const deficit = comfort - (tempAt(sim.tick) + bonus);
  if (deficit > 0) v.warm = Math.max(0, v.warm - deficit * COLD_DRAIN * dt);
  else v.warm = Math.min(1, v.warm + 2.0 * dt);

  // harm per game day
  const hS = v.hunger < 0.08 ? 12 * (1 - v.hunger / 0.08) : 0;
  const hT = v.thirst < 0.08 ? 30 * (1 - v.thirst / 0.08) : 0;
  const hC = v.warm < 0.25 ? 8 * (0.25 - v.warm) / 0.25 : 0;
  const frail = Math.max(0, age - v.prime) / 150;
  const hA = AGE_DMG * frail * frail * (1 + Math.min(0.5, v.hard / 300));
  const hurt = (hS + hT + hC) * dt;
  v.hard = r3(v.hard + hurt);
  const mh = maxHp(v, fit);
  v.hp -= (hS + hT + hC + hA) * dt;
  // Healing offsets age damage until frailty outruns it (hA > 2/day), so old age is a slope, not a cliff.
  if (hS + hT + hC === 0) v.hp += (v.hunger > 0.25 && v.thirst > 0.25 && v.warm > 0.4 ? 2.0 : 0.5) * dt;
  if (v.hp > mh) v.hp = mh;
  if (v.hp <= 0) {
    let cause = "old age", m = hA;
    if (hS > m) { cause = "starvation"; m = hS; }
    if (hT > m) { cause = "thirst"; m = hT; }
    if (hC > m) { cause = "cold"; m = hC; }
    return cause;
  }
  return null;
}

/** 0..1 worst personal-need urgency (night raises the sleep threshold: villagers sleep at night). */
export function worstUrgency(v, night) {
  return Math.max(urgency(v.hunger, ...SOFT.hunger), urgency(v.thirst, ...SOFT.thirst),
    urgency(v.energy, night ? 0.9 : 0.4, SOFT.energy[1]), urgency(v.warm, ...SOFT.warm));
}

// ---- making villagers -----------------------------------------------------

const ON = ["b", "d", "g", "k", "l", "m", "n", "p", "r", "s", "t", "v", "z", "br", "gr", "tr", "sh", "ch"];
const VO = ["a", "e", "i", "o", "u", "ai", "oo", "ea"];
const CO = ["", "n", "m", "l", "r", "x", "b", "k", "p", "t"];
export function makeName(r) {
  const n = r.pick(ON) + r.pick(VO) + r.pick(CO);
  return n[0].toUpperCase() + n.slice(1);
}

export function rollRange(r, [lo, hi]) { return r3(lo + (hi - lo) * r.float()); }

/** The full field set; callers pass identity/traits/age and get a ready entity. */
export function villagerProps(x, y, z, o) {
  return {
    x, y, z, name: o.name, hue: o.hue, lin: o.lin, par: o.par, gen: o.gen, t: o.t, born: o.born, prime: o.prime,
    hunger: o.hunger ?? 0.9, thirst: o.thirst ?? 0.9, energy: o.energy ?? 0.9, warm: 1, mood: 0.8, hp: 100, hard: 0,
    bed: 0, mate: 0, cd: 0, rest: 0, slp: 0, mv: 6, carry: null, action: null, job: null, why: null, order: null,
    sk: o.sk, ep: 0, bad: [], rp: 0, rpt: 0, lf: null,
  };
}

/** Traits of a child of a and b: GDD §08 mixture inheritance + 4% sports, then settle(). */
export function inheritTraits(r, a, b) {
  const t = {};
  for (const k of TRAITS) {
    const x = a.t[k], y = b.t[k], u = r.float();
    let v = u < 0.22 ? x : u < 0.44 ? y : u < 0.72 ? (x + y) / 2 : x + (y - x) * r.float();
    v *= 1 + (r.float() * 2 - 1) * 0.05;
    if (r.chance(0.04)) v *= 1 + (r.chance(0.5) ? 1 : -1) * (0.08 + 0.07 * r.float());
    t[k] = r3(settle(v, 1, k === "hardiness" ? 0.6 : 0.5));
  }
  return t;
}
/** Hue: lean toward one parent with a little jitter; the 7% sport jumps 45-150 degrees (§08). */
export function inheritHue(r, a, b) {
  let d = ((b.hue - a.hue + 540) % 360) - 180;      // shortest signed arc a -> b
  const lean = r.chance(0.5) ? r.float() * 0.32 : 0.68 + r.float() * 0.32;
  let h = a.hue + d * lean + (r.float() * 2 - 1) * 16;
  if (r.chance(0.07)) h += (r.chance(0.5) ? 1 : -1) * (45 + r.float() * 105);
  return Math.round(((h % 360) + 360) % 360);
}
