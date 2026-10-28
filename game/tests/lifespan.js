// Lifespan (S18b, D35): a life is ~5 game years. A pure test on villager.js: the old-age death window of a well-fed, warm, healthy villager
// (no hunger, thirst, cold, sickness or wounds) is walked day by day with the same formulas updateNeeds uses (fitness, maxHp, agingHarm, the
// 2 health/day healing, 8 when below WOUND_AT), for a spread of traits. The mean age of death must sit near 5 years (500 days).
//   node tests/lifespan.js
import assert from "node:assert/strict";
import { LIFE_DAYS, fitness, maxHp, agingHarm, pace, maturity, WOUND_AT, WOUND_HEAL } from "../src/sim/villager.js";
import { DAYS_PER_YEAR, DAY_X } from "../src/sim/clock.js";

/** Age in days at which a villager with these traits dies of old age (hardship `hard` = lifelong wear, 0 for an easy life). */
export function deathAge(t, primeFrac, hard = 0) {
  const v = { t, prime: Math.round(LIFE_DAYS * primeFrac * t.longevity), hard };
  let hp = maxHp(v, fitness(v, 0));
  for (let age = 1; age < 3 * LIFE_DAYS; age++) {
    const fit = fitness(v, age), mh = maxHp(v, fit);
    hp += ((hp < WOUND_AT * mh ? 2 + WOUND_HEAL : 2) - agingHarm(v, age)) * DAY_X;       // harm and healing are flat rates per 1800 ticks; a calendar day holds DAY_X of them
    if (hp > mh) hp = mh;
    if (hp <= 0) return age;
  }
  return -1;
}
const base = { strength: 1, speed: 1, stamina: 1, intelligence: 1, drive: 1, leisure: 1, fertility: 1, longevity: 1, hardiness: 1 };
const ages = [];
for (const longevity of [0.9, 1, 1.1]) for (const hardiness of [0.85, 1, 1.15]) for (const pf of [0.4, 0.55, 0.7]) for (const hard of [0, 100]) {
  ages.push(deathAge({ ...base, longevity, hardiness }, pf, hard));
}
const mean = ages.reduce((a, b) => a + b, 0) / ages.length, lo = Math.min(...ages), hi = Math.max(...ages);
console.log(`old-age death at ${(mean / DAYS_PER_YEAR).toFixed(2)} years on average (range ${(lo / DAYS_PER_YEAR).toFixed(2)}..${(hi / DAYS_PER_YEAR).toFixed(2)}), ${ages.length} trait mixes; LIFE_DAYS ${LIFE_DAYS}`);
assert.ok(ages.every(a => a > 0), "everyone dies of old age eventually");
assert.ok(Math.abs(mean - 5 * DAYS_PER_YEAR) <= 0.4 * DAYS_PER_YEAR, "mean death age is about 5 years: " + mean);
assert.ok(lo > 3.2 * DAYS_PER_YEAR && hi < 7.2 * DAYS_PER_YEAR, "the window is a spread around five years, not a cliff or a tail");
const v0 = { t: base };
assert.ok(maturity(v0) / DAYS_PER_YEAR >= 0.9 && maturity(v0) / DAYS_PER_YEAR <= 1.1, "adulthood at about one year");
console.log("lifespan ok");
