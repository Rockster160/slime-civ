// Pathfinding cost with many walkers. Prints percentiles; asserts only generous
// bounds (machines differ). Search time is measured by wrapping find() here in
// the test: the sim itself never reads a clock.
//   node game/tests/path_bench.js
import assert from "node:assert/strict";
import { Sim } from "../src/sim/sim.js";

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

function bench(walkers, ticks) {
  const sim = Sim.create(11, { villagers: 0 });
  for (let i = 0; i < walkers; i++) sim.spawnVillager();
  const times = [];
  const find = sim.path.find.bind(sim.path);
  sim.path.find = (s, g, b) => {
    const before = sim.path.stats.searches, t = performance.now();
    const r = find(s, g, b);
    if (sim.path.stats.searches > before) times.push(performance.now() - t);   // real searches, not cache hits
    return r;
  };
  const tickMs = [];
  for (let t = 0; t < ticks; t++) {
    const t0 = performance.now(); sim.step(); tickMs.push(performance.now() - t0);
  }
  const mean = tickMs.reduce((a, b) => a + b, 0) / tickMs.length;
  const st = sim.path.stats;
  console.log(`${String(walkers).padStart(3)} walkers, ${ticks} ticks: ${times.length} searches (avg ${(st.expanded / Math.max(1, st.searches)).toFixed(0)} nodes), `
    + `search p50 ${pct(times, 0.5).toFixed(3)} ms  p95 ${pct(times, 0.95).toFixed(3)} ms  max ${Math.max(...times).toFixed(2)} ms; `
    + `tick mean ${mean.toFixed(3)} ms  p95 ${pct(tickMs, 0.95).toFixed(3)} ms  max ${Math.max(...tickMs).toFixed(2)} ms`);
  return { p95: pct(times, 0.95), mean };
}

bench(8, 4000);
const r = bench(100, 4000);
assert.ok(r.p95 < 25, "search p95 too slow: " + r.p95);
assert.ok(r.mean < 20, "100 walkers cost more than 20 ms/tick on average: " + r.mean);
console.log("path bench ok");
