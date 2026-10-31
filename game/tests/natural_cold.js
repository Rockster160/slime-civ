// 10.2 through the coldest stretch nobody freezes or starves, and the hearth is kept (lit, or relit when it goes dark and a cold slime has wood). From the midwinter3
// save (year-day 87, the hearth lit), 11 game days into the end of winter. "Kept" is a share of the samples with the hearth burning; the share and the body-warmth
// floor are loose (natural play lets the fire die between feedings, and relights it when a cold slime sees wood in the yard).
//   node tests/natural_cold.js   (about 10 s)
import assert from "node:assert/strict";
import { natural, hearthsLit } from "./natural_lib.js";

let lit = 0, samples = 0, minWarm = 1, relit = 0, was = 1;
const r = natural("midwinter3", 11, (sim) => {
  samples++; const l = hearthsLit(sim) ? 1 : 0; lit += l; if (l && !was) relit++; was = l;
  for (const v of sim.ents.ofKind("villager")) minWarm = Math.min(minWarm, v.warm);
});
console.log("midwinter:", JSON.stringify(r.start), "->", JSON.stringify(r.end), "births", r.births, "deaths", JSON.stringify(r.causes), "hearth lit in " + lit + "/" + samples + " samples, relit " + relit + "x, coldest body " + minWarm.toFixed(2));
assert.ok(!r.causes.cold, "nobody freezes: " + JSON.stringify(r.causes));
assert.ok(!r.causes.starvation, "nobody starves: " + JSON.stringify(r.causes));
console.log("ok 1 no freezing or starving deaths");
assert.ok(lit / samples >= 0.25, "the hearth is kept burning at least a quarter of the time: " + lit + "/" + samples);
assert.ok(minWarm > 0.1, "nobody gets close to freezing: coldest body warmth " + minWarm.toFixed(2));
console.log("ok 2 the hearth is kept (" + lit + "/" + samples + " samples lit, relit " + relit + "x)");
