// Villagers: traits, life stages, needs, death (GDD §08, ported in spirit from
// slime-village slime/sim/slime.js + ai.js; numbers rescaled to the GDD clock).
//
// A villager is an entity {kind:"villager", ...}: all plain JSON.
//   t      the nine traits (multipliers around 1, §08): strength speed stamina intelligence drive leisure fertility longevity hardiness
//   sk     skills {dig,build,craft: {xp, wk}}; ws/wt = skill last worked and when; tch = {p, u} lesson I am giving
//   sp     split origin: the id of the slime this one was split from (0 = born, not split); splits of one slime share it and count as full siblings
//   hue    colour (0..359), lin founder lineage, par parent ids, gen generation
//   born   tick of birth (negative for founders), prime = age in days where decline starts
//   needs  hunger thirst energy warm mood in 0..1 (1 = fine); hp health; hard = lifelong hardship
//   bed    id of the leaf bed I own (0 none); mate id; cd = tick I may breed again
//   rest   0 awake / 1 on the ground / 2 in a bed (huddling or sleeping); slp 1 = asleep
//   fam    {CRAFT: 0..1} familiarity per craft (S7a, knowledge.js); a craft is known while a living villager has f > 0
//   g      S13 hidden genotype {trait: [allele, allele]}: the visible trait is their blend (R16); gp grandparent ids, inb the kinship of the parents, wk 1 = weak (close-kin outcome)
//   aff mn rel  S13 bonds (bonds.js); gr grief {u, s, f}; hb hobby {xp, n}; ti titles earned; hl heirloom {n, h}
//   carry  {item,n} | null; action; job; why; order; sk; ep (board epoch seen); bad [[targetId,untilTick]]
import { DAY, DUR_DAY, DAY_X } from "./clock.js";
import { bedroomQ, partnerBeside, BEDROOM_REST, BEDROOM_MOOD, PARTNER_MOOD } from "./purposes.js";
import { clamp, expNeg, settle, r3 } from "./util.js";
import { tempAt } from "./season.js";
import { occupants } from "./rooms.js";
import { fireBonus } from "./fire.js";
import { airHarm, AIR_TIRE } from "./underground.js";
import { BIOMES, biomeAt } from "./biome.js";
import { hobbyStep } from "./hobby.js";
import { mix32 } from "./rng.js";
import { fnv1aStr } from "./hash.js";

export const LIFE_DAYS = 500;               // a life is ~5 game years of 100 days (S18b/D35; it was 400 = 4 years, GDD §23 box, R1)
const LIFE_X = LIFE_DAYS / 400;             // the ageing constants below were tuned on the 400-day life and keep their shape on a longer one
/** The tick count the need rates are written against: hunger 0.25 per NEED_DAY, thirst 0.35, energy 0.7 awake, and so on (a ration about every 14 min at 1x, a drink every 10, a night's sleep that fills the energy). Flat: changing the calendar day (clock.js DAY) does not change them. */
export const NEED_DAY = 12000;
export const NEED_STEP = 10;                // needs update every 10 ticks per villager (staggered by id)
// The nine traits carried over from slime-village (GDD §08). hardiness is its maxHealth (85-115 -> 0.85-1.15), also the cold trait.
export const TRAITS = ["strength", "speed", "stamina", "intelligence", "drive", "leisure", "fertility", "longevity", "hardiness"];
export const FOUNDER_RANGE = {              // GDD §08 table, founder ranges unchanged
  strength: [0.8, 1.2], speed: [0.8, 1.2], stamina: [0.8, 1.2], intelligence: [0.8, 1.2], drive: [0.75, 1.25],
  leisure: [0.6, 1.5], fertility: [0.8, 1.2], longevity: [0.9, 1.1], hardiness: [0.85, 1.15],
};
export const TRAIT_SOFT = { drive: 0.6, hardiness: 0.6 };      // settle() band: slime-village TRAIT_SOFT 0.5, drive x1.2, vitality scaled
export const GENE_CAP = 0.25;                                  // genes move any output by at most +-25% (R16 guard 5)
export const SPORT_P = 0.04;                                   // per trait per child (§08 mutation)
export const THIRST_RATE = 0.35;           // per day; GDD §08 says 0.5, but water is ~25 cells away and carrying it is out of C1
export const BED_WARMTH = 0.10;            // a leaf bed (insulation from the ground)
export const HUDDLE_EACH = 0.04;           // each resting neighbour within 2 cells
export const HUDDLE_MAX = 0.12;
export const ROOM_HUDDLE = 0.015;           // each other villager in the same enclosed room (on top of the neighbour huddle)
export const ROOM_HUDDLE_MAX = 0.06;
export const COMFORT = 0.30;                // body-temperature comfort threshold (design call, tuned)
export const COLD_DRAIN = 0.14;             // warmth lost per day per unit of cold deficit
export const AGE_DMG = 1.6;                 // slime-village AGE_DMG shape: health/day * frailty^2
export const WOUND_AT = 0.85, WOUND_HEAL = 6, REST_HEAL = 12;     // S8: health/day gained by a wounded villager (on top of the 2/day), and extra at rest
export const GRIEF_OUT = 0.05;             // S13 (D8): grief costs at most 5% of work output while it lasts
export const GRIEF_MOOD = 0.5;            // and drains mood by up to this much a day, on top of the usual sag
export const ELDER_DECAY = 1 / (130 * LIFE_X);         // fitness e-folding past prime (days^-1)
export const FRAIL_DAYS = 100;          // calendar days past prime at which frailty reads 1.0. Tuned (tests/lifespan.js) so the old-age death window centres on 5 years (500 days)

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
/** Health lost per game day to old age (slime-village AGE_DMG shape): zero until prime, then frailty squared; lifelong hardship (`hard`) adds up to 50%. */
export function agingHarm(v, age) {
  const frail = Math.max(0, age - v.prime) / FRAIL_DAYS;
  return AGE_DMG * frail * frail * (1 + Math.min(0.5, (v.hard || 0) / 300));
}
/** Rations of food this villager needs per game day (§11.17: juvenile 0.5, elder 0.8; appetite scales). */
export function dailyNeed(sim, v) {
  const a = ageDays(sim, v);
  return foodUpkeep(v) * (a < maturity(v) ? 0.5 : a > v.prime ? 0.8 : 1);
}

// ---- convex trait upkeep (R16 guard 1): above 1.0 a trait costs, so the all-1.7 villager is not free ----
const over = (x) => (x > 1 ? (x - 1) * (x - 1) : 0);
/** Food drain multiplier: strength k=1.2; a big engine (stamina) also eats a little more. 1.2 on one trait costs ~5%. */
export function foodUpkeep(v) { return (1 + 1.2 * over(v.t.strength)) * (1 + 0.5 * (v.t.stamina - 1)); }
/** Energy drain multiplier while awake: speed, stamina, intelligence all pay k=1.0 above 1; stamina then divides it (works longer). */
export function energyUpkeep(v) { return (1 + over(v.t.speed) + over(v.t.stamina) + over(v.t.intelligence)) / v.t.stamina; }
/** Mood sag per game day without leisure: drive burns out (§08), leisure wants more downtime. 0.15 at average. */
export function moodSag(v) { return 0.15 * (0.5 * v.t.drive + 0.5 * v.t.leisure); }
/** The most one gene may move an output: trait clamped to 1 +- GENE_CAP. */
export function geneMul(x) { return clamp(x, 1 - GENE_CAP, 1 + GENE_CAP); }
/** Ticks per cell walked: speed trait and fitness (slime-village speed formula). */
export function stepTicks(v, fit) { return Math.max(3, Math.round((v.ill ? 7.8 : 6) / (v.t.speed * (0.55 + 0.45 * fit)))); }      // S14: a sick villager walks 30% slower
/** Work-rate multiplier (before skill): fitness and mood (§08: mood < 0.30 slows work 15%). */
export function workFactor(v, fit) { return (v.ill ? 0.6 : 1) * (0.55 + 0.45 * fit) * (v.mood < 0.1 ? 0.7 : v.mood < 0.3 ? 0.85 : 1) * (v.gr ? 1 - GRIEF_OUT * v.gr.s : 1); }

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
  // S18b: hunger, thirst and energy are the "needs" and run on NEED_DAY (a ration every ~14 min at 1x, a night's sleep that fills the energy). Everything else (cold, mood, harm, healing, ageing damage) is a flat rate per DUR_DAY = 1800 ticks, as it always was.
  const dt = NEED_STEP / DUR_DAY, dtN = NEED_STEP / NEED_DAY;
  const age = ageDays(sim, v), fit = fitness(v, age);
  const asleep = v.slp === 1, resting = v.rest > 0;
  const child = age < maturity(v), elder = age > v.prime;

  v.hunger = Math.max(0, v.hunger - 0.25 * foodUpkeep(v) * (child ? 0.5 : elder ? 0.8 : 1) * (asleep ? 0.6 : 1) * dtN);
  v.thirst = Math.max(0, v.thirst - THIRST_RATE * (asleep ? 0.6 : 1) * dtN);
  const bq = asleep && v.rest === 2 ? bedroomQ(sim, v) : -1;                         // S15: a bed in a closed Bedroom rests better and lifts the mood (purposes.js)
  if (asleep) v.energy = Math.min(1, v.energy + (v.rest === 2 ? 2.0 * (bq >= 0 ? 1 + BEDROOM_REST * bq : 1) : 1.3) * dtN);   // bed rests better than ground (§08)
  else v.energy = Math.max(0, v.energy - (resting ? 0.35 : 0.7) * energyUpkeep(v) * dtN);
  const leisure = v.action && (v.action.type === "Wander" || (v.job && v.job.k === "tinker"));     // tinkering is free time too
  const hob = v.action && v.action.type === "Wander" ? hobbyStep(v) : 1;            // S13: a hobby is followed in free time, and lifts the mood it brings back a little
  if (v.gr && sim.tick >= v.gr.u) v.gr = null;                                      // S13: grief runs out
  v.mood = clamp(v.mood + (leisure ? 4.0 * hob : -moodSag(v)) * dt - (v.gr ? GRIEF_MOOD * v.gr.s * dt : 0)
    + (bq >= 0 ? (BEDROOM_MOOD * bq + (partnerBeside(sim, v) ? PARTNER_MOOD : 0)) * dt : 0), 0, 1);

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
  bonus += fireBonus(sim, v);                    // a lit hearth or a burning tree close by (S7a, fire.js)
  bonus += BIOMES[biomeAt(sim.world, v.x, v.y)].warm;       // S12: the highland is colder, the marsh a little kinder
  const comfort = COMFORT - 0.5 * (v.t.hardiness - 1) + (child || elder ? 0.05 : 0);
  const deficit = comfort - (tempAt(sim.tick) + bonus);
  if (deficit > 0) v.warm = Math.max(0, v.warm - deficit * COLD_DRAIN * dtN);        // cold follows the seasons (calendar): a winter is 25 calendar days long
  else v.warm = Math.min(1, v.warm + 2.0 * dt);

  // harm per game day
  const hS = v.hunger < 0.08 ? 12 * (1 - v.hunger / 0.08) : 0;
  const hT = v.thirst < 0.08 ? 30 * (1 - v.thirst / 0.08) : 0;
  const hC = v.warm < 0.25 ? 8 * (0.25 - v.warm) / 0.25 : 0;
  const hA = agingHarm(v, age);
  const hB = airHarm(sim, v);                    // S12: bad air (underground.js) costs health and tires
  if (hB) v.energy = Math.max(0, v.energy - AIR_TIRE * dt);
  const hI = v.ill ? v.ill.d : 0;                // S14: sickness drains health (disease.js) and stops the usual healing while it lasts
  const hurt = (hS + hT + hB + hI) * dt + hC * dtN;
  v.hard = r3(v.hard + hurt);
  const mh = maxHp(v, fit);
  v.hp -= (hS + hT + hB + hI + hA) * dt + hC * dtN;
  // Healing offsets age damage until frailty outruns it (hA > 2/day), so old age is a slope, not a cliff.
  if (hS + hT + hC + hB + hI === 0) {
    const well = v.hunger > 0.25 && v.thirst > 0.25 && v.warm > 0.4;
    // S8 wounds: below WOUND_AT of max health the body mends faster, and much faster at rest (the mend job, sleep, huddling): a mauled villager is back in days, not weeks
    v.hp += ((well ? 2.0 : 0.5) + (well && v.hp < WOUND_AT * mh ? WOUND_HEAL + (v.rest > 0 ? REST_HEAL : 0) : 0)) * dt;
  }
  if (v.hp > mh) v.hp = mh;
  if (v.hp <= 0) {
    let cause = "old age", m = hA;
    if (hS > m) { cause = "starvation"; m = hS; }
    if (hT > m) { cause = "thirst"; m = hT; }
    if (hC > m) { cause = "cold"; m = hC; }
    if (hB > m) { cause = "bad air"; m = hB; }
    if (hI > m) { cause = "illness"; m = hI; }
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
    sk: o.sk, ep: 0, bad: [], rp: 0, rpt: 0, lf: null, ws: "", wt: 0, tch: null, sp: o.sp ?? 0, fam: {},
    g: o.g ?? null, gp: o.gp ?? [], inb: o.inb ?? 0, wk: o.wk ?? 0, aff: {}, mn: {}, rel: [], gr: null, hb: { xp: 0, n: 0 }, ti: [], hl: null, ps: null, mem: [], epi: [],
  };
}

/** Hidden alleles for a visible phenotype (R16): a pair that averages to the trait, split by a stable hash of (id, trait). Used for founders and saves from before S13. */
export const ALLELE_SPREAD = 0.06;
export function genoFrom(t, id) {
  const g = {};
  for (const k of TRAITS) {
    const d = (mix32(id, fnv1aStr(k)) / 4294967296 * 2 - 1) * ALLELE_SPREAD;
    g[k] = [r3(t[k] + d), r3(t[k] - d)];
  }
  return g;
}
/** The visible trait of an allele pair: their blend, soft-capped like every trait. */
export const blend = (k, x, y) => r3(settle((x + y) / 2, 1, TRAIT_SOFT[k] ?? 0.5));

/**
 * Traits of a child of a and b: S13 (R16) hidden genotype. Each parent hands down one of its two alleles per trait, +-5% noise
 * (drive drifts +-5% more, so a village's character can change), a 4% sport of +-8-15% on the new pair; the visible trait is the
 * blend of the child's two alleles, settled. (This replaces the S1 mixture-of-phenotypes draw: segregation gives the same spread.)
 * `out.sports` (optional) collects the traits that mutated; `out.g` receives the child's alleles.
 */
export function inheritGeno(r, a, b, out) {
  const ga = a.g || genoFrom(a.t, a.id || 0), gb = b.g || genoFrom(b.t, b.id || 0), t = {}, g = {};
  for (const k of TRAITS) {
    let x = ga[k][r.int(2)], y = gb[k][r.int(2)];
    x *= 1 + (r.float() * 2 - 1) * 0.05; y *= 1 + (r.float() * 2 - 1) * 0.05;
    if (k === "drive") { const d = 1 + (r.float() * 2 - 1) * 0.05; x *= d; y *= d; }
    if (r.chance(SPORT_P)) { const m = 1 + (r.chance(0.5) ? 1 : -1) * (0.08 + 0.07 * r.float()); x *= m; y *= m; if (out && out.sports) out.sports.push(k); }
    const soft = TRAIT_SOFT[k] ?? 0.5;
    g[k] = [r3(settle(x, 1, soft)), r3(settle(y, 1, soft))];
    t[k] = blend(k, g[k][0], g[k][1]);
  }
  if (out) out.g = g;
  return t;
}
export const inheritTraits = inheritGeno;

/** Hue: lean toward one parent with a little jitter; the 7% sport jumps 45-150 degrees (§08). */
export function inheritHue(r, a, b) {
  let d = ((b.hue - a.hue + 540) % 360) - 180;      // shortest signed arc a -> b
  const lean = r.chance(0.5) ? r.float() * 0.32 : 0.68 + r.float() * 0.32;
  let h = a.hue + d * lean + (r.float() * 2 - 1) * 16;
  if (r.chance(0.07)) h += (r.chance(0.5) ? 1 : -1) * (45 + r.float() * 105);
  return Math.round(((h % 360) + 360) % 360);
}
