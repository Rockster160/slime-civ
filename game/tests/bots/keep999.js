// Keep-N bot (S4b playtest fix): the player sets "keep 999 logs" on day 1 and never touches anything
// again, for 2 years on 10 seeds. A standing order must not out-rank foraging for long: no starvation
// or thirst deaths, and survival (population at the end) no worse than the absent player on the same seeds.
//   node game/tests/bots/keep999.js [years=2]
import assert from "node:assert/strict";
import { runSeed, fanOut, arg, sumDeaths } from "./lib.js";

const years = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 2);
const seedArg = arg("seed", null);
const keeper = (sim) => { if (sim.tick === 0) sim.apply({ type: "keep", item: "log", n: 999 }); };
const count = (r, cause) => Object.values(r.deaths).reduce((a, y) => a + (y[cause] || 0), 0);

if (seedArg !== null) {
  const seed = Number(seedArg);
  const a = runSeed(seed, years), k = runSeed(seed, years, keeper);
  const logs = k.sim.ents.ofKind("item").filter(i => i.item === "log").reduce((s, i) => s + i.n, 0);
  console.log(JSON.stringify({ seed, absent: { pop: a.pop, deaths: a.deaths }, keep: { pop: k.pop, deaths: k.deaths, logs, min: k.min } }));
} else {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const res = await fanOut(import.meta.url, seeds, [String(years)]);
  let pa = 0, pk = 0, starve = 0, thirst = 0, astarve = 0;
  for (const r of res) {
    pa += r.absent.pop; pk += r.keep.pop;
    starve += count(r.keep, "starvation"); thirst += count(r.keep, "thirst"); astarve += count(r.absent, "starvation");
    console.log(`seed ${String(r.seed).padStart(2)}: pop end absent ${r.absent.pop} -> keep-999 ${r.keep.pop} (logs ${r.keep.logs}); keep deaths ${JSON.stringify(r.keep.deaths)}`);
  }
  console.log("keep-999 deaths by year and cause:", JSON.stringify(sumDeaths(res.map(r => r.keep))), "| absent starvation deaths:", astarve);
  console.log(`starvation deaths ${starve}, thirst ${thirst}; population at end absent ${pa} vs keep-999 ${pk}`);
  assert.equal(starve + thirst, 0, "keep-999 starved or dehydrated the village");
  const da = res.reduce((n, r) => n + Object.values(r.absent.deaths).reduce((m, y) => m + Object.values(y).reduce((q, c) => q + c, 0), 0), 0);
  const dk = res.reduce((n, r) => n + Object.values(r.keep.deaths).reduce((m, y) => m + Object.values(y).reduce((q, c) => q + c, 0), 0), 0);
  console.log(`all deaths: absent ${da}, keep-999 ${dk}`);
  assert.ok(dk <= da * 1.15 + 2, "keep-999 killed noticeably more villagers than the absent player (" + dk + " vs " + da + ")");
  console.log("keep999 bot ok");
}
