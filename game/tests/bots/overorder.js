// Over-ordering bot (GDD §09 "Food collapse under orders", failure table): the
// player orders EVERY adult to chop, constantly, and sets keep 999 logs. Village-
// critical needs (food runway, shelter) and personal needs must still outrank
// the orders, so nobody starves or dehydrates (zero such deaths). Cold in a long winter may still take
// elders (and, rarely, a just-grown adult without a bed); that is reported, and at most one adult may freeze.
// Runs one game year (landing through the first winter) on several seeds.
//   node game/tests/bots/overorder.js [years=1]
import assert from "node:assert/strict";
import { runSeed, fanOut, arg, sumDeaths } from "./lib.js";
import { isAdult } from "../../src/sim/villager.js";

const years = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 1);
const seedArg = arg("seed", null);

/** Every 100 ticks: re-order every adult to chop the tree nearest the camp. Never lets up. */
function overorder(sim) {
  if (sim.tick === 0) sim.apply({ type: "keep", item: "log", n: 999 });
  if (sim.tick % 100 !== 0) return;
  let tree = null, bd = 1e9;
  for (const p of sim.ents.ofKind("plant")) {
    if (p.species !== "tree") continue;
    const d = Math.abs(p.x - 64) + Math.abs(p.y - 64);
    if (d < bd) { bd = d; tree = p; }
  }
  const ids = sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).map(v => v.id);
  if (tree && ids.length) sim.apply({ type: "order", ids, verb: "chop", tid: tree.id });
}

if (seedArg !== null) {
  const r = runSeed(Number(seedArg), years, overorder);
  const logs = r.sim.ents.ofKind("item").filter(i => i.item === "log").reduce((a, i) => a + i.n, 0);
  delete r.sim;
  r.logs = logs;
  console.log(JSON.stringify(r));
} else {
  const seeds = [1, 2, 3, 4, 5, 6];
  const res = await fanOut(import.meta.url, seeds, [String(years)]);
  // Starvation and thirst must be zero. Cold in a long winter may still take the frail (elders/children) of
  // an over-worked village; it must not take healthy adults.
  let bad = 0;
  const stages = {};
  for (const r of res) {
    for (const [k, n] of Object.entries(r.byStage || {})) {
      stages[k] = (stages[k] || 0) + n;
      if (!k.startsWith("cold/")) bad += n;
    }
    console.log(`seed ${r.seed}: pop end ${r.pop}, min ${r.min}, logs on the ground ${r.logs}, deaths ${JSON.stringify(r.deaths)}`);
  }
  console.log("deaths by year and cause:", JSON.stringify(sumDeaths(res)), "non-age deaths by cause/stage:", JSON.stringify(stages));
  assert.equal(bad, 0, bad + " villager(s) starved or dehydrated while over-ordered");
  assert.ok((stages["cold/adult"] || 0) <= 1, "healthy adults froze while over-ordered: " + stages["cold/adult"]);
  console.log("overorder bot ok");
}
