// S11 orders at 20-60 villagers: the `crowd` fixture (60 spawned adults, no years played). One game day with orders and crews on everyone;
// the mean ms/tick must stay under 2 (the board, planning and the panels' pure parts all scale). One sim, one run.
//   node tests/crowd.js
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { isAdult } from "../src/sim/villager.js";
import { DAY } from "../src/sim/clock.js";
import { toJSON, restore } from "../src/sim/save.js";
import { alerts } from "../src/ui/text.js";
import { concerns } from "../src/ui/concerns.js";
import { crewSummary } from "../src/ui/crewtext.js";
import { newDepth } from "../src/sim/depth.js";
import { fallIll } from "../src/sim/disease.js";
import { flatSpot, clearArea, instantHut } from "./helpers.js";
import { storeInZone, dropLoose } from "../src/sim/items.js";
import { spawnWagon } from "../src/sim/wagon.js";
import { advise, newAdvisor } from "../src/ui/advisory.js";
import { chronicleMarkdown } from "../src/ui/chronicletext.js";

// S15: all of Phase 3-4 is on for this run: the depth content (illness, relationships, wolves and grazers), crews and orders, and the settlement systems (a kitchen cooking,
// a storage room, a wagon on a long haul, the advisory cards). `node tests/crowd.js 100` runs the R4 sim ceiling once (FULL only: tests/all.js --full).
const N = Number(process.argv[2]) || 60;
const sim = loadFixture("crowd");
for (let guard = 0; sim.ents.ofKind("villager").length < N && guard < 400; guard++) sim.spawnVillager();
for (const v of sim.ents.ofKind("villager")) v.hunger = v.thirst = v.energy = 1;
sim.dp = newDepth(1);
const ill = sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).slice(0, 4);
for (const v of ill) fallIll(sim, v, "the crowd test");
{
  const [x0, y0, z] = flatSpot(sim, 7, 6, 0); clearArea(sim, x0, y0, 7, 6, z); instantHut(sim, x0, y0, 7, 6, { z });
  sim.apply({ type: "purpose", x: x0 + 1, y: y0 + 1, z, p: "kitchen" });
  sim.ents.add("furniture", { f: "hearth", x: x0 + 3, y: y0 + 3, z, owner: 0, rv: 0, rt: 0, fuel: 20000, lit: 1, fi: "log", hl: 2 });
  const [a0, b0, zz] = flatSpot(sim, 7, 6, 1); clearArea(sim, a0, b0, 7, 6, zz); instantHut(sim, a0, b0, 7, 6, { z: zz });
  sim.apply({ type: "purpose", x: a0 + 1, y: b0 + 1, z: zz, p: "storage" });
  for (let i = 0; i < 4; i++) sim.ents.add("furniture", { f: "shelf", x: a0 + 1 + i, y: b0 + 1, z: zz, owner: 0, rv: 0, rt: 0 });
  storeInZone(sim, "hopper_meat", 12);
  const c = sim.stock;
  for (let dx = 30; dx < 55; dx++) { const x = c.x1 + dx, y = c.y0; if ([0, 1, 2, 3].every(i => sim.world.standZ(x + i, y) === c.z)) { clearArea(sim, x, y, 4, 1, c.z); for (let i = 0; i < 4; i++) dropLoose(sim, "log", 10, x + i, y, c.z); break; } }
  spawnWagon(sim, "wagon", c.x1 + 2, c.y0, c.z); spawnWagon(sim, "wagon", c.x1 + 2, c.y0 + 1, c.z);
  sim.cache.iv++;
}
const vs = sim.ents.ofKind("villager"), ids = vs.map(v => v.id);
assert.ok(vs.length >= N, N + " villagers: " + vs.length);
// everyone ordered at once, three crews of twenty with different tasks: the worst case for the board (every plan runs against 60 others)
const tree = sim.ents.ofKind("plant").find(p => p.species === "tree");
sim.apply({ type: "order", ids: ids.slice(0, 20), verb: "chop", x: tree.x, y: tree.y, z: tree.z });
for (let k = 0; k < 3; k++) sim.apply({ type: "crew", op: "make", name: "Crew " + (k + 1), ids: ids.slice(20 * k, 20 * k + 20), hk: k + 1 });
sim.apply({ type: "crew", op: "task", id: 2, task: { t: "chore", g: "build" } });
sim.apply({ type: "keep", item: "log", n: 60 });
sim.apply({ type: "crew", op: "task", id: 3, task: { t: "keep", item: "log" } });
let worst = 0;
const t0 = performance.now();
for (let i = 0; i < DAY; i++) {
  const a = performance.now();
  sim.step();
  const d = performance.now() - a;
  if (d > worst) worst = d;
}
const ms = performance.now() - t0, mean = ms / DAY;
console.log("crowd: " + vs.length + " villagers, all systems on, one day: " + mean.toFixed(3) + " ms/tick mean, " + worst.toFixed(1) + " ms worst tick, " + ms.toFixed(0) + " ms total");
assert.ok(mean < 2, "mean ms/tick under 2 at " + vs.length + " villagers: " + mean.toFixed(3));
// the panels' pure parts at this size
const live = sim.ents.ofKind("villager");
for (const v of live) alerts(sim, v);
const cl = concerns(sim);
assert.ok(Array.isArray(cl));
assert.ok(Array.isArray(advise(newAdvisor(), cl, sim.tick)));
assert.ok(chronicleMarkdown(sim).length > 200, "the chronicle exports at this size");
for (const c of sim.crews.list) assert.match(crewSummary(sim, c).line, /^\d+ of \d+ working/);
assert.equal(restore(toJSON(sim)).hash(), sim.hash(), "a " + vs.length + "-villager save round-trips");
console.log("crowd ok");
