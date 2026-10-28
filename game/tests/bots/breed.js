// Breed-best bot (S12, GDD §08 R16, "breed the best" must not run away): from the `settled` village, five generations of breeding the top quarter by
// trait sum (the player's best play), against five generations of ordinary random pairing from the same founders. settle() is the soft cap: the bred
// colony's OVERALL trait mean is reported against 1.15x the ordinary colony's (hard bound 1.25x); a single trait the player breeds for may run further (reported, hard bound 1.7x). A population-module test:
// no ticks, so it takes a second. (S13: inbreeding depression (people.js) and kin-avoiding partner choice are why this fell from 1.20x to 1.13x.) It prints the margin whatever happens.
//   node game/tests/bots/breed.js
import "../legacy.js";
import assert from "node:assert/strict";
import { loadFixture } from "../fixture.js";
import { breedGenerations } from "../../src/sim/population.js";
import { TRAITS } from "../../src/sim/villager.js";

const GENS = 5, TARGET = 1.15, HARD = 1.25;
let worst = 0, worstTrait = "", overall = 0;
const rows = [];
for (const seedShift of [0, 1, 2]) {                            // three independent breeding runs (the rng stream is advanced between them)
  const a = loadFixture("settled"), b = loadFixture("settled");
  for (let i = 0; i < seedShift * 7; i++) { a.rng.stream("breedbot").u32(); b.rng.stream("breedbot").u32(); }
  const best = breedGenerations(a, GENS, { pick: "best", size: 16 }), norm = breedGenerations(b, GENS, { pick: "random", size: 16 });
  const last = best[GENS].mean, base = norm[GENS].mean;
  for (const k of TRAITS) {
    const ratio = last[k] / base[k];
    if (ratio > worst) { worst = ratio; worstTrait = k; }
    assert.ok(ratio < 1.7, "run " + seedShift + ": bred " + k + " mean " + last[k].toFixed(2) + " vs ordinary " + base[k].toFixed(2));
  }
  const all = TRAITS.reduce((s, k) => s + last[k], 0) / TRAITS.reduce((s, k) => s + base[k], 0);          // the colony's overall trait mean against an ordinary colony's
  overall = Math.max(overall, all);
  assert.ok(all <= HARD, "run " + seedShift + ": the bred colony's overall trait mean is " + all.toFixed(3) + "x an ordinary colony's (hard bound " + HARD + ")");
  rows.push("run " + seedShift + ": mean over all traits bred " + (TRAITS.reduce((s, k) => s + last[k], 0) / TRAITS.length).toFixed(3) + " vs ordinary " + (TRAITS.reduce((s, k) => s + base[k], 0) / TRAITS.length).toFixed(3) + "; best single value " + best[GENS].top.toFixed(2));
  assert.ok(best[GENS].top < 2.0, "no single trait ran away: " + best[GENS].top);
}
for (const r of rows) console.log(r);
console.log("overall trait mean, bred / ordinary, after " + GENS + " generations: " + overall.toFixed(3) + " (target <= " + TARGET + ": " + (overall <= TARGET ? ((TARGET - overall) * 100).toFixed(1) + "% to spare" : "OVER by " + ((overall - TARGET) * 100).toFixed(1) + "%, reported for the balance pass; hard bound " + HARD) + ")");
console.log("worst single trait: " + worstTrait + " at " + worst.toFixed(3) + "x" + (worst <= TARGET ? "" : " (over the target by " + ((worst - TARGET) * 100).toFixed(1) + "%: the cap is soft, so a trait the player breeds for outruns the average; reported for the balance pass)"));
console.log("breed bot ok");
