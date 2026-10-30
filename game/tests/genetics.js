// Genetics (GDD §08, R16), unit-style and fast: no sim, just the inheritance functions and the upkeep curves.
//   1. Mutation: ~4% of trait rolls are sports (+-8-15%).
//   2. Breed-best for 40 generations (parents = the top quarter by trait sum, the worst case for runaway): every trait
//      mean stays bounded (settle() is the soft cap) and no villager runs away.
//   3. Convex upkeep: an everything-1.5 villager costs well over 1.5x an average one in food/energy terms, an average
//      one pays nothing; no gene output is above +-25%.
//   4. (Splitting is tested in tests/split.js.)
//   node tests/genetics.js
import assert from "node:assert/strict";
import { Rng } from "../src/sim/rng.js";
import { TRAITS, FOUNDER_RANGE, inheritTraits, rollRange, foodUpkeep, energyUpkeep, geneMul, SPORT_P } from "../src/sim/villager.js";

const r = new Rng(99).stream("test");
const founders = () => { const t = {}; for (const k of TRAITS) t[k] = rollRange(r, FOUNDER_RANGE[k]); return { t }; };

// 1. mutation rate
{
  const a = founders(), b = founders(), out = { sports: [] };
  const N = 5000;
  for (let i = 0; i < N; i++) inheritTraits(r, a, b, out);
  const rate = out.sports.length / (N * TRAITS.length);
  console.log(`sport rate ${(rate * 100).toFixed(2)}% of ${N * TRAITS.length} trait rolls (target ${SPORT_P * 100}%)`);
  assert.ok(rate > 0.03 && rate < 0.05, "sport rate off: " + rate);
}

// 2. breed-best for 40 generations
{
  let pop = Array.from({ length: 40 }, founders);
  for (let g = 0; g < 40; g++) {
    const score = (v) => TRAITS.reduce((s, k) => s + v.t[k], 0);
    const parents = pop.slice().sort((x, y) => score(y) - score(x)).slice(0, 10);
    pop = Array.from({ length: 40 }, () => ({ t: inheritTraits(r, parents[r.int(10)], parents[r.int(10)]) }));
  }
  const mean = {}, max = {};
  for (const k of TRAITS) { mean[k] = pop.reduce((s, v) => s + v.t[k], 0) / pop.length; max[k] = Math.max(...pop.map(v => v.t[k])); }
  console.log("after 40 generations of top-quarter breeding: mean " + TRAITS.map(k => k + " " + mean[k].toFixed(2)).join(", ") + "; highest " + Math.max(...Object.values(max)).toFixed(2));
  for (const k of TRAITS) { assert.ok(mean[k] < 1.9 && mean[k] > 0.5, k + " mean ran away: " + mean[k]); assert.ok(max[k] < 2.4, k + " max ran away: " + max[k]); }
}

// 3. upkeep and the +-25% gene cap
{
  const avg = { t: Object.fromEntries(TRAITS.map(k => [k, 1])) };
  assert.equal(foodUpkeep(avg), 1); assert.equal(energyUpkeep(avg), 1);
  const big = { t: Object.fromEntries(TRAITS.map(k => [k, 1.5])) };
  const cost = foodUpkeep(big) * 1;
  console.log(`everything-1.5 villager: food drain x${foodUpkeep(big).toFixed(2)}, energy drain x${energyUpkeep(big).toFixed(2)} (stamina divides it)`);
  assert.ok(cost > 1.5, "a big villager should cost over 1.5x food: " + cost);
  const strong = { t: { ...avg.t, strength: 1.7 } };
  assert.ok(foodUpkeep(strong) > 1.5, "strength 1.7 should cost ~+59% food (§08): " + foodUpkeep(strong));
  assert.equal(geneMul(1.9), 1.25); assert.equal(geneMul(0.4), 0.75);
}

console.log("genetics ok");

// 5. Starting slimes share one colour: every founder's hue is within +-9 deg (5% of the wheel) of the others around a base (wrap-safe).
{
  const { Sim } = await import("../src/sim/sim.js");
  const hues = Sim.create(42).ents.ofKind("villager").map(v => v.hue);
  const ref = hues[0], dev = hues.map(h => ((h - ref + 540) % 360) - 180);
  assert.ok(hues.length >= 3 && Math.max(...dev) - Math.min(...dev) <= 18, "founder hues spread over " + hues);
  console.log("founder hues " + hues.join(",") + " ok");
}
