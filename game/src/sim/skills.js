// Skills (GDD §10, R17): XP from real output, never from time spent.
//
//   level  = settle(potential * (1 - e^(-xp/K)), 0.5, 0.5)
//   gain   = valueOfOutput * max(0, 1 - level/difficulty) * novelty * rested * learnRate
//   effect = 1 + 0.8 * level               (speed of the work)
//
// valueOfOutput is in work-units: 1 = what one full working day (1200 ticks) of
// fair-challenge work yields at level 0. K = 100 xp ~ a game year of full-time
// work. Per villager: v.sk[skill] = {xp, wk} where wk = ticks worked in that
// skill today (reset daily) for the rested curve.
import { expNeg, settle, clamp } from "./util.js";
import { F } from "./world.js";
import { INSPIRE } from "./inspire.js";

export const SKILLS = ["gather", "chop", "build"];
export const K = 100;
// Difficulty = the level at which a task stops teaching (§10). gather is 0.3 in
// the GDD, but S2 villagers start at 0.2-0.4 and foraging is their main work, so
// 0.5 keeps it teaching (documented deviation).
export const DIFFICULTY = { gather: 0.5, chop: 0.5, build: 0.6 };
// Output value in work-units per unit produced: ~1/(units per worker-day), §10 units.
export const VALUE = { berry: 0.4, grass: 0.2, log: 0.25, stick: 0.08, bed: 0.5, rack: 0.7, dried: 0.1, wall: 0.15, floor: 0.08, roof: 0.1 };
const APTITUDE = { gather: ["speed", "intelligence"], chop: ["strength", "hardiness"], build: ["strength", "intelligence"] };
const WORKDAY_FULL = 720, WORKDAY = 1200;      // rested curve knees, §10 (60% and 100% of a 1200-tick working day)

export function newSkills(r) {
  // §11.16 starting skills: gathering 0.2-0.4 (they have lived), others 0-0.1. xp chosen so level ~ those.
  return { gather: { xp: r.range(25, 55), wk: 0 }, chop: { xp: r.range(0, 8), wk: 0 }, build: { xp: r.range(0, 8), wk: 0 } };
}
export function aptitude(v, s) {
  const [a, b] = APTITUDE[s];
  return clamp(((v.t[a] + v.t[b]) / 2 - 0.8) / 0.4, 0, 1);
}
export function level(v, s) {
  const pot = 0.7 + 0.3 * aptitude(v, s);
  return settle(pot * (1 - expNeg(v.sk[s].xp / K)), 0.5, 0.5);
}
export function effect(v, s) { return 1 + 0.8 * level(v, s); }
export function learnRate(v) { return 0.85 + 0.3 * clamp((v.t.intelligence - 0.8) / 0.4, 0, 1); }
/** Up to 60% of a working day in one craft pays full; falls to a 50% floor at a full day (§10). */
export function rested(worked) {
  return worked <= WORKDAY_FULL ? 1 : Math.max(0.5, 1 - 0.5 * (worked - WORKDAY_FULL) / (WORKDAY - WORKDAY_FULL));
}
/** Net-new matter only: a cell the player placed pays nothing when re-worked (R17, anti-grind). */
export function novel(sim, x, y, z) {
  return ((sim.world.flags(x, y, z) | sim.world.flags(x, y, z - 1)) & F.PLAYER) === 0;
}
export function award(v, s, value, isNovel) {
  if (!isNovel) return 0;
  const sk = v.sk[s];
  const gain = value * Math.max(0, 1 - level(v, s) / DIFFICULTY[s]) * rested(sk.wk) * learnRate(v) * (v.poss ? 1 + INSPIRE.xp : 1);
  sk.xp = Math.round((sk.xp + gain) * 1000) / 1000;
  return gain;
}
export function noteWork(v, s) { v.sk[s].wk++; }
export function resetDay(v) { for (const s of SKILLS) v.sk[s].wk = 0; }
/** Preferred craft (K6): the top skill, if it is at least 0.2. */
export function preferred(v) {
  let best = null, bl = 0.2;
  for (const s of SKILLS) { const l = level(v, s); if (l >= bl) { bl = l; best = s; } }
  return best;
}
