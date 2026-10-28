// Same seed + same command script => same hash at every checkpoint; a
// different seed must differ. Two sims run side by side in one process, which
// also proves the sim keeps no module-level state.
//   node game/tests/determinism.js [ticks=100000]
import assert from "node:assert/strict";
import { Sim } from "../src/sim/sim.js";
import { run } from "./script.js";

const TICKS = Number(process.argv[2] || 100000), EVERY = 1000;
const a = Sim.create(42), b = Sim.create(42), c = Sim.create(43);
assert.equal(a.hash(), b.hash(), "fresh sims with one seed differ");
assert.notEqual(a.hash(), c.hash(), "different seeds hash equal");

const t0 = Date.now();
for (let t = 0; t < TICKS; t += EVERY) {
  run(a, EVERY); run(b, EVERY);
  assert.equal(a.hash(), b.hash(), "diverged by tick " + a.tick);
}
run(c, TICKS);
assert.notEqual(a.hash(), c.hash(), "different seed ended identical");
assert.ok(a.cmdLog.length > 3, "script did not run");
console.log(`determinism ok: ${TICKS} ticks, ${TICKS / EVERY} checkpoints equal, final ${a.hash()} (seed 43: ${c.hash()}), ${((Date.now() - t0) / 1000).toFixed(1)}s`);
