// Skills (GDD §10, R17, Appendix B): three of them - dig, build, craft. Gathering
// and chopping are skill-less (a light trait-based speed lives in tasks.js).
// XP comes from real output, never from time spent.
//
//   level  = settle(potential * (1 - e^(-xp/K)), 0.5, 0.5)
//   gain   = valueOfOutput * max(0, 1 - level/difficulty) * novelty * rested * learnRate * lessons
//   effect = 1 + 0.8 * level               (speed of the work: a master is 1.8x a novice)
//
// valueOfOutput is in work-units: 1 = what one full working day (1200 ticks) of
// fair-challenge work yields at level 0. K = 100 xp ~ a game year of full-time
// work. Per villager: v.sk[skill] = {xp, wk} where wk = ticks worked in that
// skill today (reset daily) for the rested curve; v.ws / v.wt = the skill I last
// worked and when (so a learner can be watched or taught).
//
// S13 rust: a skill left unused for RUST_GRACE days loses up to RUST_MAX of its level, slowly (e-folding RUST_TAU days), and the loss is
// recovered fast once the work resumes. sk[s].rs is the lost share (0..RUST_MAX), sk[s].lu the tick the skill was last worked.
// The XP is never touched, so the floor is 70% of the level the XP earns; familiarity (knowing a craft) never rusts.
//
// SEAM for S6/S7: every XP award goes through gain(sim, v, skill, value, isNovel, difficulty).
// Mining, smelting, kiln work: call it from the verb with the output's value and
// the task's difficulty (GDD §10 table: hard-rock dig 0.8, kiln 0.7, smelt 0.9).
import { expNeg, settle, clamp } from "./util.js";
import { F } from "./world.js";
import { INSPIRE } from "./inspire.js";
import { DAY } from "./clock.js";
import { isMentorOf, noteLesson, MENTOR_X } from "./bonds.js";

export const SKILLS = ["dig", "build", "craft"];
export const K = 40;           // GDD §10 says ~100 (a game year of full-time work); 40 is what makes Property 3 true with the challenge-matched decay (D21, tune later)
// Difficulty = the level at which a task stops teaching (§10): soft-rock dig 0.6, build 0.6, simple craft 0.5.
export const DIFFICULTY = { dig: 0.6, build: 0.6, craft: 0.5 };
// Output value in work-units per unit produced: ~1/(units per worker-day), §10 units.
// dig: 200 ticks a cell = 6 a day = 1/6; bed 240 ticks, rack 360 ticks, a drying batch 360 ticks.
export const VALUE = { stone: 0.167, dirt: 0.167, clay: 0.15, flint: 0.2, malachite: 0.2, bed: 0.25, rack: 0.3, hearth: 0.2, dried: 0.075, wall: 0.15, floor: 0.08, roof: 0.1,
  // S7b: stations (a kiln is ~300 ticks of work), and what they make per unit (a 900-tick batch of 4 ~ 0.5 of a day's work; a smelt is dearer)
  kiln: 0.25, mound: 0.2, workbench: 0.25, bellows: 0.2, waterjar: 0.1, fired_clay: 0.1, jar: 0.15, charcoal: 0.12, copper: 0.3, copper_pick: 0.4, copper_spear: 0.35,
  // S9
  smoker: 0.25, forge: 0.35, cordage: 0.1, basket: 0.2, leather: 0.15, backpack: 0.35, block: 0.15, stone_axe: 0.3, timber: 0.15, mould: 0.2, brick: 0.12, sheet: 0.2, fitting: 0.2,
  copper_axe: 0.4, cast_pick: 0.45, smoked_meat: 0.1, iron: 0.45, iron_pick: 0.6, iron_axe: 0.55,
  // S15
  wheel: 0.15, wagon: 0.4, cart: 0.45 };
// Aptitude (§08): a read of two traits, not a gene of its own.
const APTITUDE = { dig: ["strength", "stamina"], build: ["strength", "intelligence"], craft: ["intelligence", "drive"] };
const WORKDAY_FULL = 720, WORKDAY = 1200;      // rested curve knees, §10 (60% and 100% of a 1200-tick working day)
export const WATCH_R = 4, WATCH_BONUS = 0.15;  // watching a better worker at the same craft (§10 "watching"): small and slow
export const TEACH_R = 3, TEACH_X = 3, TEACH_OUT = 0.8, TEACH_DAYS = 3;   // Teach (R10, D8): learner x3, teacher output x0.8
export const RUST_GRACE = 15, RUST_MAX = 0.3, RUST_TAU = 40, RUST_RECOVER = 0.6;   // days; share of level; days; per working day the rust keeps
const FRESH = 40;                              // ticks a "last worked" stamp stays current

export function newSkills(r) {
  // §11.16 starting skills: 0-0.1 (gathering, the one they have lived, is skill-less now). xp chosen so level ~ that.
  return { dig: { xp: r.range(0, 8), wk: 0 }, build: { xp: r.range(0, 8), wk: 0 }, craft: { xp: r.range(0, 8), wk: 0 } };
}
export function aptitude(v, s) {
  const [a, b] = APTITUDE[s];
  return clamp(((v.t[a] + v.t[b]) / 2 - 0.8) / 0.4, 0, 1);
}
/** The level their XP earns, before rust. */
export function peakLevel(v, s) {
  const pot = 0.7 + 0.3 * aptitude(v, s);
  return settle(pot * (1 - expNeg(v.sk[s].xp / K)), 0.5, 0.5);
}
export const rustOf = (v, s) => v.sk[s].rs || 0;
export function level(v, s) { return peakLevel(v, s) * (1 - (v.sk[s].rs || 0)); }
export function effect(v, s) { return 1 + 0.8 * level(v, s); }
export function learnRate(v) { return 0.85 + 0.3 * clamp((v.t.intelligence - 0.8) / 0.4, 0, 1); }
/** Up to 60% of a working day in one craft pays full; falls to a 50% floor at a full day (§10). */
export function rested(worked) {
  return worked <= WORKDAY_FULL ? 1 : Math.max(0.5, 1 - 0.5 * (worked - WORKDAY_FULL) / (WORKDAY - WORKDAY_FULL));
}
/** Net-new matter only: a cell the player placed pays nothing when re-worked (R17, anti-grind). */
export function novel(sim, x, y, z) {
  return ((sim.world.flags(x, y, z) | sim.world.flags(x, y, z - 1)) & (F.PLAYER | F.USED)) === 0;
}
/** Digging removes the cell itself, so only that cell's own flag counts (what stood below it is not what is being worked). */
export function novelCell(sim, x, y, z) { return (sim.world.flags(x, y, z) & (F.PLAYER | F.USED)) === 0; }

const near = (a, b, r) => Math.abs(a.x - b.x) <= r && Math.abs(a.y - b.y) <= r && Math.abs(a.z - b.z) <= 1;
const working = (sim, o, s) => o.ws === s && sim.tick - o.wt < FRESH;

/** The villager teaching `v` this skill right now (paired by the player, beside them, working it, and better at it), or null. */
export function teacherOf(sim, v, s) {
  for (const t of sim.ents.ofKind("villager")) {
    if (!t.tch || t.tch.p !== v.id || t.tch.u <= sim.tick || t === v) continue;
    if (near(t, v, TEACH_R) && working(sim, t, s) && level(t, s) > level(v, s)) return t;
  }
  return null;
}
/** The pupil `t` is teaching right now at skill s (they are working beside, at the same craft), or null. */
export function pupilOf(sim, t, s) {
  if (!t.tch || t.tch.u <= sim.tick) return null;
  const p = sim.ents.get(t.tch.p);
  return p && near(t, p, TEACH_R) && working(sim, p, s) && level(t, s) > level(p, s) ? p : null;
}
/** XP multiplier from company: x3 taught, else a small bonus for working near someone clearly better at it. */
export function lessons(sim, v, s) {
  if (teacherOf(sim, v, s)) return TEACH_X;
  const mine = level(v, s);
  for (const o of sim.ents.ofKind("villager")) {
    if (o !== v && working(sim, o, s) && near(o, v, WATCH_R) && level(o, s) >= mine + 0.15) return 1 + WATCH_BONUS;
  }
  return 1;
}

/** Award XP for output. Returns the XP gained. */
export function gain(sim, v, s, value, isNovel, difficulty = DIFFICULTY[s]) {
  if (!isNovel) return 0;
  const sk = v.sk[s], tc = teacherOf(sim, v, s);
  const g = value * Math.max(0, 1 - level(v, s) / difficulty) * rested(sk.wk) * learnRate(v) * (tc ? TEACH_X * (isMentorOf(tc, v) ? MENTOR_X : 1) : lessons(sim, v, s)) * (v.poss ? 1 + INSPIRE.xp : 1);
  if (tc && g > 0) noteLesson(tc, v);                         // S13: lessons that pay out make a mentor
  sk.xp = Math.round((sk.xp + g) * 1000) / 1000;
  return g;
}
export function noteWork(sim, v, s) { v.sk[s].wk++; v.ws = s; v.wt = sim.tick; v.sk[s].lu = sim.tick; }
/** Once a day (S13): skills not used for a while rust toward their floor; skills used today shake the rust off. Children do not rust (no XP yet). */
export function rustDay(sim, v) {
  for (const s of SKILLS) {
    const sk = v.sk[s];
    if (sk.lu === undefined) sk.lu = sim.tick;
    const idle = (sim.tick - sk.lu) / DAY, rs = sk.rs || 0;
    if (idle > RUST_GRACE && sk.xp > 0) { const nr = rs + (RUST_MAX - rs) * (1 - expNeg(1 / RUST_TAU)); sk.rs = RUST_MAX - nr < 0.002 ? RUST_MAX : Math.round(nr * 10000) / 10000; }
    else if (idle < 1 && rs > 0) sk.rs = rs < 0.005 ? 0 : Math.round(rs * RUST_RECOVER * 1000) / 1000;
  }
}
export function resetDay(v) { for (const s of SKILLS) v.sk[s].wk = 0; }
/** Preferred craft (K6): the top skill, if it is at least 0.2. */
export function preferred(v) {
  let best = null, bl = 0.2;
  for (const s of SKILLS) { const l = level(v, s); if (l >= bl) { bl = l; best = s; } }
  return best;
}
/** Profession (R17): derived from the top skill, never stored. "forager" when no skill stands out. */
export const PROFESSION = { dig: "digger", build: "builder", craft: "crafter" };
export function profession(v) { const p = preferred(v); return p ? PROFESSION[p] : "forager"; }
/** Start a lesson: teacher `t` coaches `p` for a few days (cleared by p = 0). Both need to be working the same craft beside each other. */
export function setTeach(sim, t, p) { t.tch = p ? { p, u: sim.tick + TEACH_DAYS * DAY } : null; }
