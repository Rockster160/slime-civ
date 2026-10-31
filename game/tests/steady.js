// 10.1 a village left alone holds steady: 100 game days (one full year, winter included) from the year2 fixture, no player input, no assignments.
// The author's goal: "more or less poorly self-sustaining at whatever level they are at ... basically just as they left it." Asserts the bands:
// population within +-25% of where it started (no boom, no extinction), nobody dies of hunger, thirst or cold, no new era, at most two new crafts,
// the beds are not fewer. Also the breeding weight reads the pair's own beliefs (free bed known: full; a bedless neighbour and no free bed: BED_NONE).
//   node tests/steady.js   (about 75 s: 100 days of an 8-slime village; the whole year is the point)
import "./legacy.js";
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { DAY } from "../src/sim/clock.js";
import { dayF, WINTER_START } from "../src/sim/season.js";
import { CRAFT_IDS } from "../src/sim/phenomena.js";
import { can, eraOf } from "../src/sim/knowledge.js";
import { pairWeights, BED_NONE } from "../src/sim/local.js";

let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
const sim = loadFixture("year2");
const vs0 = sim.ents.ofKind("villager");

// 1. the pair's breeding weight is its own belief (cheap, before the long run)
{
  const [a, b] = vs0.slice(0, 2), bed = sim.ents.ofKind("furniture").find(f => f.f === "bed"), owner = bed.owner;
  for (const v of [a, b]) { v.bed = 0; v.bel = v.bel.filter(f => f[0] !== "bed" && f[0] !== "need:bed"); }
  const w0 = pairWeights(sim, a, b);
  assert.equal(w0.bed, 0.4, "no bed of their own, nobody in need in view, no free bed known: the old 0.4");
  a.bel.push(["need:bed", a.x, a.y, a.z, 1, sim.tick, 1]);
  assert.equal(pairWeights(sim, a, b).bed, BED_NONE, "a bedless neighbour in view and no free bed known: BED_NONE");
  bed.owner = 0; a.bel.push(["bed", bed.x, bed.y, bed.z, 1, sim.tick, 1]); sim.cache.iv++;
  assert.equal(pairWeights(sim, a, b).bed, 1, "one of them knows a free bed: full");
  bed.owner = owner;
  ok("breeding weight from the pair's own beliefs: free bed known 1, bedless neighbour and none free " + BED_NONE);
}
const sim2 = loadFixture("year2");           // the run starts from a clean fixture
const vs = sim2.ents.ofKind("villager"), n0 = vs.length, ids0 = new Set(vs.map(v => v.id));
const beds0 = sim2.ents.ofKind("furniture").filter(f => f.f === "bed").length;
const crafts0 = CRAFT_IDS.filter(c => can(sim2, c)).length, era0 = eraOf(sim2), d0 = dayF(sim2.tick);
const rec0 = new Set(Object.keys(sim2.chron.recs)), c0 = sim2.chron.n;
let maxPop = n0, minPop = n0, crossed = false, born = 0;
const t0 = Date.now();
for (let t = 0; t < 100 * DAY; t++) {
  sim2.step();
  if (t % 600 === 0) {
    const p = sim2.ents.ofKind("villager").length; maxPop = Math.max(maxPop, p); minPop = Math.min(minPop, p);
    const d = dayF(sim2.tick); if (d >= WINTER_START && d < WINTER_START + 1) crossed = true;
  }
}
const end = sim2.ents.ofKind("villager"), ents = sim2.chron.entries.slice(Math.max(0, sim2.chron.entries.length - (sim2.chron.n - c0)));
born = ents.filter(e => e.kind === "BIRTH").length;
const causes = {}; for (const [id, r] of Object.entries(sim2.chron.recs)) if (!rec0.has(id)) causes[r.cause] = (causes[r.cause] || 0) + 1;
const deaths = Object.values(causes).reduce((a, b) => a + b, 0);
const beds1 = sim2.ents.ofKind("furniture").filter(f => f.f === "bed").length, crafts1 = CRAFT_IDS.filter(c => can(sim2, c)).length;
console.log("steady: pop " + n0 + " -> " + end.length + " (min " + minPop + ", max " + maxPop + "), births " + born + ", deaths " + JSON.stringify(causes) + ", beds " + beds0 + " -> " + beds1 + ", crafts " + crafts0 + " -> " + crafts1 + ", era '" + era0 + "' -> '" + eraOf(sim2) + "', " + ((Date.now() - t0) / 1000).toFixed(0) + " s");

assert.ok(crossed, "the run crosses the start of winter");
assert.ok(end.length >= 0.75 * n0 - 1e-9 && end.length <= 1.25 * n0 + 1e-9, "population within +-25% of " + n0 + ": " + end.length);
assert.ok(maxPop <= 1.5 * n0 && minPop >= 0.5 * n0, "no boom and no collapse along the way: " + minPop + ".." + maxPop);
ok("population holds: " + n0 + " -> " + end.length + " (" + minPop + ".." + maxPop + "), " + born + " born, " + deaths + " died");
assert.ok(born >= 1 && born <= deaths + 0.25 * n0 + 1, "births roughly meet deaths: " + born + " vs " + deaths);
assert.ok(!causes.starvation && !causes.thirst && !causes.cold, "nobody starves, dies of thirst or freezes: " + JSON.stringify(causes));
ok("no starvation, thirst or cold deaths through the winter: " + JSON.stringify(causes));
assert.ok(crafts1 - crafts0 <= 2, "at most slight progress in crafts: " + crafts0 + " -> " + crafts1);
assert.ok(ents.filter(e => e.kind === "DISCOVERY" && /age (begins|dawns)/.test(e.text)).length <= 1, "no run of new eras");
ok("slight progress only: crafts " + crafts0 + " -> " + crafts1);
assert.ok(beds1 >= beds0, "beds are not lost: " + beds0 + " -> " + beds1);
ok("the village keeps its beds (" + beds1 + ")");
