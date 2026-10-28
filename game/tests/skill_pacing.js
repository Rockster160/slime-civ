// Skill pacing (D13, S18b): a villager of average aptitude working ONE craft steadily (a full working day, every day, on work hard enough to keep
// teaching: difficulty 0.9) reaches skill 0.7 after about 30% of adult life. Adult life = maturity .. LIFE_DAYS = 400 game days now (5-year life),
// so 0.7 comes after about 120 days. Pure: only skills.js and villager.js functions, no sim.
//   node tests/skill_pacing.js
import assert from "node:assert/strict";
import { K, WORKDAY, WORKDAY_FULL, level, xpFor, rested, XP_PER_VALUE } from "../src/sim/skills.js";
import { LIFE_DAYS, maturity } from "../src/sim/villager.js";
import { DAY, DUR_DAY } from "../src/sim/clock.js";

const avg = { strength: 1, speed: 1, stamina: 1, intelligence: 1, drive: 1, leisure: 1, fertility: 1, longevity: 1, hardiness: 1 };
/** Days of steady work in one skill until level >= 0.7 (0 xp to begin with). `chunk` ticks of work pay one output of value chunk/WORKDAY (VALUE is "a full working day = 1"). */
export function daysTo(target, { difficulty = 0.9, ticksPerDay = WORKDAY, chunk = 200, t = avg, maxDays = 20000 } = {}) {
  const v = { t, sk: { craft: { xp: 0, wk: 0, rs: 0 } } };
  for (let d = 1; d <= maxDays; d++) {
    v.sk.craft.wk = 0;
    for (let w = 0; w < ticksPerDay; w += chunk) {
      v.sk.craft.xp += xpFor(v, "craft", chunk / WORKDAY, difficulty, v.sk.craft.wk);
      v.sk.craft.wk += chunk;
    }
    if (level(v, "craft") >= target) return d;
  }
  return -1;
}
const adultCal = LIFE_DAYS - maturity({ t: avg }), adult = adultCal * DAY / DUR_DAY, want = 0.3 * adult;       // adult life in WORK days (one per DUR_DAY ticks, the rested curve's day): the calendar adult life holds DAY / DUR_DAY of them per day
const d70 = daysTo(0.7);
console.log(`K ${K}: steady work reaches skill 0.7 in ${d70} days = ${(100 * d70 / adult).toFixed(0)}% of the ${adult.toFixed(0)} work days of an adult life (${adultCal} calendar days; target 30% = ${want.toFixed(0)}); a work day is ${DUR_DAY} ticks with ${WORKDAY} of work`);
assert.ok(Math.abs(d70 - want) <= 0.05 * adult, "D13: 0.7 after about 30% of adult life, got " + d70 + " days");
// the rested curve: full pay up to 60% of the working day, then falling to half at a full day
assert.equal(WORKDAY_FULL, Math.round(0.6 * WORKDAY));
assert.equal(rested(WORKDAY_FULL), 1);
assert.ok(Math.abs(rested(WORKDAY) - 0.5) < 1e-9 && rested(0) === 1, "rested curve");
assert.ok(WORKDAY <= DUR_DAY, "a working day fits inside the duration day");
assert.equal(XP_PER_VALUE, 1);
// less than a day's work is slower: half-days take longer, but sub-linearly because the rested curve is kind to short shifts
const half = daysTo(0.7, { ticksPerDay: WORKDAY / 2 });
assert.ok(half > d70 && half < 2.2 * d70, "half-time work is slower, not absurdly so: " + half);
console.log("skill pacing ok (half-time: " + half + " days)");
