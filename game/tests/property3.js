// Property 3 (GDD §26): work equal to 15% of an adult lifespan in one skill makes the worker >= 25% more effective
// than a control villager with the same genes who did none. Real Task steps run by the real runner (the dig verb
// on fresh ground), with the job board and needs left out so only the skill system is measured.
// Adult lifespan = LIFE_DAYS - maturity; a working day = 1200 ticks of dig work, rested curve reset between days.
//   node tests/property3.js
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { Task } from "../src/sim/tasks.js";
import { runAction } from "../src/sim/actions.js";
import { M } from "../src/sim/world.js";
import { isAdult, LIFE_DAYS, maturity } from "../src/sim/villager.js";
import { effect, level, resetDay } from "../src/sim/skills.js";

const sim = loadFixture("settled");
const [a, b] = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
for (const v of sim.ents.ofKind("villager").slice()) if (v !== a && v !== b) sim.ents.remove(v.id);
for (const v of [a, b]) for (const k of Object.keys(v.sk)) { v.sk[k].xp = 0; v.sk[k].rs = 0; }                      // two untrained adults
b.t = { ...a.t }; b.born = a.born; b.prime = a.prime;                                         // identical twins; b is the control
const z = sim.stock.z, x0 = sim.stock.x1 + 6, y0 = sim.stock.y0;
for (let cy = y0 - 1; cy <= y0 + 6; cy++) for (let cx = x0; cx < x0 + 6; cx++) for (const id of sim.ents.at(cx, cy, z).slice()) if (sim.ents.get(id).kind !== "villager") sim.ents.remove(id);     // the dig ground is bare (a regenerated fixture may have dropped something there)
for (const v of [a, b]) { v.action = null; v.job = null; }                                    // whatever the fixture's villagers were in the middle of
const lifespan = LIFE_DAYS - maturity(a), target = Math.round(0.15 * lifespan) * 1200;            // working ticks
const start = { eff: effect(a, "dig"), lvl: level(a, "dig") };

let worked = 0, cell = 0;
while (worked < target) {
  if (!a.action) {                                         // fresh ground each time: lay a dirt cell beside the digger and dig it
    const cx = x0 + (cell % 6), cy = y0 + (cell / 6 | 0) % 6; cell++;
    sim.world.set(cx, cy, z - 1, M.DIRT, 0); sim.world.set(cx, cy, z, M.AIR, 0);
    sim.ents.move(a, cx, cy - 1, z); a.x = cx; a.y = cy - 1; a.z = z;
    a.action = Task("dig", [{ v: "dig", cx, cy, cz: z - 1, x: cx, y: cy - 1, z }]);
  }
  sim.tick++;
  runAction(sim, a);
  worked++;
  if (worked % 1200 === 0) resetDay(a);
}
const ratio = effect(a, "dig") / effect(b, "dig");
console.log(`15% of adult life = ${target / 1200} working days of dig: level ${start.lvl.toFixed(2)} -> ${level(a, "dig").toFixed(2)} (control ${level(b, "dig").toFixed(2)}), effect ${effect(a, "dig").toFixed(2)} vs ${effect(b, "dig").toFixed(2)} = ${ratio.toFixed(2)}x`);
assert.ok(ratio >= 1.25, "property 3: expected >= 1.25x the control, got " + ratio.toFixed(2));
console.log("property 3 ok");
