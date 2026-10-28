// Absent-player bot (build plan S2, GDD §11.17 Property 1): no commands at all,
// 10 seeds x 2 game years. Pass when >= 90% of runs keep a villager alive AND
// the population does not collapse in the first winter (survivors at the end of
// winter >= 50% of the head count when it began). Prints survival per seed and
// deaths by cause per year.
//   node game/tests/bots/absent.js [years=2]
import assert from "node:assert/strict";
import { runSeed, fanOut, arg, sumDeaths } from "./lib.js";

const years = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 2);
const seedArg = arg("seed", null);

if (seedArg !== null) {
  const r = runSeed(Number(seedArg), years);
  delete r.sim;
  console.log(JSON.stringify(r));
} else {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const res = await fanOut(import.meta.url, seeds, [String(years)]);
  let alive = 0, steady = 0;
  for (const r of res) {
    const w0 = r.atWinterStart[0], w1 = r.atWinterEnd[0];
    const ok = r.pop > 0, noCollapse = w1 >= 0.5 * w0;
    if (ok) alive++;
    if (noCollapse) steady++;
    console.log(`seed ${String(r.seed).padStart(2)}: pop end ${String(r.pop).padStart(2)}, min ${String(r.min).padStart(2)}, winter ${w0} -> ${w1}${noCollapse ? "" : "  COLLAPSE"}, births ${r.births}, deaths ${JSON.stringify(r.deaths)}, ${r.msPerTick.toFixed(4)} ms/tick`);
  }
  console.log("deaths by year and cause:", JSON.stringify(sumDeaths(res)));
  console.log(`alive ${alive}/${res.length}, no first-winter collapse ${steady}/${res.length}`);
  assert.ok(alive >= 9, "fewer than 90% of runs kept a villager alive");
  assert.ok(steady >= 9, "population collapsed in the first winter in too many runs");
  console.log("absent bot ok");
}
