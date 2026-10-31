// Max-expansion bot (S12, GDD §22 command scale): the `crowd` fixture (60 villagers) is told to build as much as it can at once: a blueprint stamped on a dozen
// sites (ghosts for ~150 pieces). Over three game days nobody may starve or go hungry, and the larder must hold: its food value at the end may not fall
// more than a small margin below its start (9.30: slimes work from local demand and a village left alone holds steady rather than over-producing, so
// "the share of adults on food jobs stays at 60% of the idle village" no longer says anything; see D57). Printed: pieces planned and built, deaths, the food shares, hunger, larder.
//   node game/tests/bots/expand.js
import "../legacy.js";
import assert from "node:assert/strict";
import { loadFixture } from "../fixture.js";
import { flatSpot, clearArea } from "../helpers.js";
import { isAdult } from "../../src/sim/villager.js";
import { survey, ITEMS } from "../../src/sim/items.js";

const FOOD = new Set(["forage", "eat", "dry", "hunt", "harvest", "sow", "till", "water_field", "slaughter", "smoke", "root", "fence", "fodder", "capture"]);
const WINDOW = 5400, HUTS = 12;
const HUNGRY = 0.5, LARDER_MARGIN = 0.1;                    // a villager under HUNGRY is going hungry; the larder may end 10% under where it began
const larder = (sim) => { const st = survey(sim).stock; let f = 0; for (const k of Object.keys(st)) if (ITEMS[k] && ITEMS[k].food > 0) f += ITEMS[k].food * st[k]; return f; };
const cell = (w, x, y, m) => (m ? [x, y, w, m] : [x, y, w]);
function hut() {                                           // 5 x 4 wattle walls with a door on the south side, a thatched roof, two beds
  const cells = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) {
    const edge = x === 0 || x === 4 || y === 0 || y === 3;
    if (edge && !(x === 2 && y === 3)) cells.push(cell("wall", x, y, "wattle"));
    else if (!edge) cells.push(cell("roof", x, y, "thatch"));
  }
  cells.push(cell("door", 2, 3), cell("bed", 1, 1), cell("bed", 3, 1));
  return { w: 5, h: 4, cells };
}
function run(expand) {
  const sim = loadFixture("crowd"), adults = () => sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  let planned = 0;
  if (expand) {
    const h = hut();
    assert.ok(sim.apply({ type: "blueprint", op: "add", bp: { name: "Hut", w: h.w, h: h.h, cells: h.cells } }), "a blueprint");
    const bp = sim.bps.list[sim.bps.list.length - 1];
    for (let k = 0; k < HUTS; k++) {
      const [x0, y0, z] = flatSpot(sim, 5, 4, k * 2);
      clearArea(sim, x0, y0, 5, 4, z);
      const rects = bp.cells.map(c => ({ w: c[2], m: c[3] || "", x: x0 + c[0], y: y0 + c[1], z }));
      if (sim.apply({ type: "build", bp: bp.id, cells: rects, at: { ox: x0, oy: y0, z, rot: 0, over: {} } })) planned += rects.length;
    }
  }
  const d0 = Object.keys(sim.chron.recs).length;
  let share = 0, n = 0, fcOn = 0, minHunger = 1;
  const l0 = larder(sim);
  for (let i = 0; i < WINDOW; i++) {
    sim.step();
    if (i % 100 === 50) {
      const ad = adults().filter(v => v.slp !== 1), onFood = ad.filter(v => v.job && FOOD.has(v.job.k)).length;
      for (const v of sim.ents.ofKind("villager")) if (v.hunger < minHunger) minHunger = v.hunger;
      share += ad.length ? onFood / ad.length : 0; n++; if (sim.board.fc) fcOn++;
    }
  }
  const starved = Object.values(sim.chron.recs).filter(r => r.cause === "starvation").length, died = Object.keys(sim.chron.recs).length - d0;
  return { planned, built: planned - sim.ents.ofKind("csite").length, starved, died, share: share / n, fcOn, pop: sim.ents.ofKind("villager").length, minHunger, l0, l1: larder(sim), sim };
}
const base = run(false), big = run(true);
console.log(`nothing to build: ${base.pop} villagers, ${base.starved} starved, ${base.died} died, ${(base.share * 100).toFixed(0)}% of awake adults on food jobs`);
console.log(`larder (food value) ${base.l0.toFixed(0)} -> ${base.l1.toFixed(0)} with nothing to build, ${big.l0.toFixed(0)} -> ${big.l1.toFixed(0)} while building; lowest hunger ${base.minHunger.toFixed(2)} vs ${big.minHunger.toFixed(2)}`);
console.log(`${HUTS} huts stamped (${big.planned} pieces, ${big.built} built in 3 days): ${big.pop} villagers, ${big.starved} starved, ${big.died} died, ${(big.share * 100).toFixed(0)}% on food jobs, food critical for ${big.fcOn} of 54 samples`);
assert.ok(big.planned >= 120, "many pieces were planned: " + big.planned);
assert.equal(big.starved, 0, "nobody starves in three days of expansion");
assert.ok(big.minHunger >= HUNGRY, "nobody goes hungry while the village builds: lowest hunger " + big.minHunger.toFixed(2));
assert.ok(big.l1 >= big.l0 * (1 - LARDER_MARGIN), "the larder holds: " + big.l0.toFixed(0) + " -> " + big.l1.toFixed(0));
assert.ok(big.built > 0, "and they did build");
console.log("max-expansion bot ok");
