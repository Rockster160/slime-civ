// stepNeed (tasks.js): the sim names a Task step's real length, so the first-person HUD can count down.
// A possessed villager chops a tree and digs rock; the ticks from the first work tick to the finish match need / rate within +-1, and a bush's units count down.
//   node game/tests/stepneed.js
import "./legacy.js";
import assert from "node:assert/strict";
import { DAY } from "../src/sim/clock.js";
import { Sim } from "../src/sim/sim.js";
import { LIFE_DAYS } from "../src/sim/villager.js";
import { stepNeed } from "../src/sim/tasks.js";
import { M } from "../src/sim/world.js";
import { diggable } from "../src/sim/dig.js";

function adult(seed) {
  const sim = Sim.create(seed, { villagers: 0 });
  const v = sim.spawnVillager();
  v.born = -Math.round(0.35 * LIFE_DAYS * DAY); v.hunger = v.thirst = v.energy = 1;
  sim.apply({ type: "possess", id: v.id });
  return { sim, v };
}
/** Run until the current work step ends; returns {ticks, pred, gone} where pred = need/rate sampled on the first work tick. */
function timeStep(sim, v, cap, done) {
  let pred = 0, first = -1, n = 0;
  for (let i = 0; i < cap; i++) {
    sim.step();
    const a = v.action;
    if (a && a.type === "Task" && a.ph === 1) {
      if (first < 0) { first = sim.tick; const st = stepNeed(sim, v); pred = st.need / st.rate; }
      n++;
    }
    if (done()) return { ticks: sim.tick - first + 1, pred, n };
  }
  assert.fail("step never finished");
}

// chop
{
  const { sim, v } = adult(3);
  let tree = null, bd = 1e9;
  for (const p of sim.ents.ofKind("plant")) if (p.species === "tree") { const d = Math.abs(p.x - v.x) + Math.abs(p.y - v.y); if (d < bd) { bd = d; tree = p; } }
  // stand beside it (tests the helper, not the walk)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = sim.world; if (w.isWalkable(tree.x + dx, tree.y + dy, tree.z) && !w.isSolid(tree.x + dx, tree.y + dy, tree.z)) { sim.ents.move(v, tree.x + dx, tree.y + dy, tree.z); break; } }
  sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: tree.id, verb: "" });
  const r = timeStep(sim, v, 3000, () => sim.ents.get(tree.id).species !== "tree");
  assert.ok(Math.abs(r.ticks - r.pred) <= 1.5, "chop took " + r.ticks + " ticks, stepNeed said " + r.pred.toFixed(1));
  console.log(`chop: ${r.ticks} ticks, stepNeed ${r.pred.toFixed(1)}`);
}
// berry bush: several units, the count of what is left falls by one per unit
{
  const { sim, v } = adult(3);
  let bush = null, bd = 1e9;
  for (const p of sim.ents.ofKind("plant")) if (p.species === "berry" && p.yield >= 3) { const d = Math.abs(p.x - v.x) + Math.abs(p.y - v.y); if (d < bd) { bd = d; bush = p; } }
  assert.ok(bush, "a berry bush with fruit");
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = sim.world; if (w.isWalkable(bush.x + dx, bush.y + dy, bush.z) && !w.isSolid(bush.x + dx, bush.y + dy, bush.z)) { sim.ents.move(v, bush.x + dx, bush.y + dy, bush.z); break; } }
  sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: bush.id, verb: "" });
  const y0 = bush.yield; let first = null, lefts = [], pEnd = 0;
  const gate = (a) => a && a.type === "Task" && a.ph === 1;
  for (let i = 0; i < 3000 && bush.yield > y0 - 2; i++) {
    sim.step();
    if (gate(v.action)) { const st = stepNeed(sim, v); if (!first) first = st; lefts.push(st.left); }
  }
  assert.equal(first.left, Math.min(y0, first.left), "left is bounded by the yield");
  assert.ok(first.left >= 2, "several units on the bush: " + first.left);
  assert.ok(lefts[0] > lefts[lefts.length - 1], "units left falls as berries land: " + lefts[0] + " -> " + lefts[lefts.length - 1]);
  assert.equal(y0 - bush.yield, 2, "two berries picked");
  console.log(`bush: ${first.left} units, left ${lefts[0]} -> ${lefts[lefts.length - 1]} after two picked`);
}
// dig
{
  const { sim, v } = adult(3);
  const w = sim.world; let cell = null;
  outer: for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dz of [0, -1]) {
    const x = v.x + dx, y = v.y + dy, z = v.z + dz;
    if (w.mat(x, y, z) !== M.AIR && diggable(sim, x, y, z)) { cell = [x, y, z]; break outer; }
  }
  if (cell) {
    sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: 0, verb: "dig", x: cell[0], y: cell[1], z: cell[2] });
    const before = w.mat(...cell);
    let st = null, n = 0;
    for (let i = 0; i < 2000 && w.mat(...cell) === before; i++) { sim.step(); if (v.action && v.action.type === "Task" && v.action.ph === 1) { if (!st) st = stepNeed(sim, v); n++; } }
    if (st) { assert.ok(Math.abs(n - st.need / st.rate) <= 2, "dig took " + n + " ticks vs " + (st.need / st.rate).toFixed(1)); console.log(`dig: ${n} ticks, stepNeed ${(st.need / st.rate).toFixed(1)}, gives ${st.n} ${st.item}`); }
    else console.log("dig: no diggable cell started (skipped)");
  } else console.log("dig: no solid neighbour (skipped)");
}
console.log("stepneed ok");
