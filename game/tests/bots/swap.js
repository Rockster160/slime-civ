// Possess-swap bot (S12, GDD §07 R9 band): a scripted player who hops between three villagers (release, possess the next, every 60 ticks) must not out-produce a
// player who stays with ONE villager by more than 1.25x over the same window. Both run the village's three strongest adults alone in the world (needs kept
// topped up, so only the controller differs); the two others are delegated (an AI chop order, renewed). Output = trees felled by the three together.
//   node game/tests/bots/swap.js
import "../legacy.js";
import assert from "node:assert/strict";
import { loadFixture } from "../fixture.js";
import { World } from "../../src/sim/world.js";
import { isAdult } from "../../src/sim/villager.js";

const WINDOW = 4000, SWAP = 60;
function setup() {
  const sim = loadFixture("settled");
  const three = sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).sort((a, b) => b.t.strength - a.t.strength || a.id - b.id).slice(0, 3);
  for (const v of sim.ents.ofKind("villager").slice()) if (!three.includes(v)) sim.ents.remove(v.id);
  for (const v of three) { v.job = null; v.action = null; v.slp = 0; v.rest = 0; }       // (S18b: the fixture is taken at dawn, with some still asleep)
  sim.cache.iv++;
  return { sim, ids: three.map(v => v.id) };
}
const nearestTree = (sim, v) => {
  let t = null, bd = 1e9;
  for (const p of sim.ents.ofKind("plant")) { if (p.species !== "tree" || (p.rv && p.rv !== v.id)) continue; const d = Math.abs(p.x - v.x) + Math.abs(p.y - v.y); if (d < bd) { bd = d; t = p; } }
  return t;
};
const felled = (sim) => sim.ents.ofKind("plant").filter(p => p.species === "sapling" || (p.species === "stump" && p.fl)).length;
const topUp = (sim, ids) => { if (sim.tick % 100 === 0) for (const id of ids) { const v = sim.ents.get(id); if (v) { v.hunger = Math.max(v.hunger, 0.9); v.thirst = Math.max(v.thirst, 0.9); v.energy = Math.max(v.energy, 0.9); v.warm = 1; } } };

/** One press of the keys for the possessed villager: walk to the nearest tree, then interact (the bots/possess.js script). */
function press(sim, v, st) {
  if (v.action) return;
  if (!st.target || st.target.species !== "tree") { st.target = nearestTree(sim, v); st.goal = null; }
  const t = st.target; if (!t) return;
  if (Math.abs(t.x - v.x) + Math.abs(t.y - v.y) <= 1 && Math.abs(t.z - v.z) <= 1) { sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: t.id, verb: "" }); st.target = null; return; }
  if (!st.goal) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dz of [0, 1, -1]) if (!st.goal && sim.world.isWalkable(t.x + dx, t.y + dy, t.z + dz)) st.goal = [t.x + dx, t.y + dy, t.z + dz];
  const r = st.goal && sim.path.find(World.idx(v.x, v.y, v.z), World.idx(st.goal[0], st.goal[1], st.goal[2]));
  if (r && r.ok && r.path.length) { const [nx, ny] = World.xyz(r.path[0]); sim.apply({ type: "pinput", id: v.id, dx: Math.sign(nx - v.x), dy: Math.sign(ny - v.y), tid: 0, verb: "" }); } else { st.target = null; st.goal = null; }
}

function run(mode) {
  const { sim, ids } = setup(), f0 = felled(sim), st = {};
  let cur = -1, swaps = 0;
  for (let i = 0; i < WINDOW; i++) {
    topUp(sim, ids);
    const want = mode === "single" ? 0 : Math.floor(i / SWAP) % 3;
    if (want !== cur) { if (cur >= 0) sim.apply({ type: "release" }); sim.apply({ type: "possess", id: ids[want] }); cur = want; st.target = null; st.goal = null; swaps++; }
    for (let k = 0; k < 3; k++) {
      const v = sim.ents.get(ids[k]); if (!v) continue;
      if (k === cur) press(sim, v, st);
      else if (!v.order) { const t = nearestTree(sim, v); if (t) sim.apply({ type: "order", ids: [v.id], verb: "chop", tid: t.id }); }
    }
    sim.step();
  }
  return { trees: felled(sim) - f0, swaps, cmds: sim.cmdLog.length };
}
const single = run("single"), swap = run("swap"), ratio = swap.trees / Math.max(1, single.trees);
console.log(`single possession: ${single.trees} trees in ${WINDOW} ticks (${single.cmds} commands); swapping every ${SWAP} ticks: ${swap.trees} trees (${swap.swaps} swaps, ${swap.cmds} commands); ratio ${ratio.toFixed(3)}`);
assert.ok(single.trees > 0, "the single-possession run felled trees (S18b: a swapped run restarts every chop every 180 ticks, so it may fell none: that is the point of the 1.25x cap, not a failure)");
assert.ok(ratio <= 1.25, "swapping beat staying by more than 1.25x: " + ratio.toFixed(3));
console.log("possess-swap bot ok: swapping between villagers stays inside the 1.25x band");
