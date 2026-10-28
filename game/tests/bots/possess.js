// Possess bot (S4b, R9 band): a scripted player possesses the village's strongest chopper for one game season
// (25 days) and chops by walking and pressing interact, using only possess / pinput commands. Its output
// (logs per day) must be <= 1.25x the same villager left to the AI with a chop order. Both run alone in the
// world (the rest of the village removed, needs kept topped up) so only the controller differs.
//   node game/tests/bots/possess.js
import "../legacy.js";
import assert from "node:assert/strict";
import { Sim } from "../../src/sim/sim.js";
import { World } from "../../src/sim/world.js";
import { isAdult } from "../../src/sim/villager.js";
import { DAY } from "../../src/sim/clock.js";

const SEASON = 25 * DAY;

function setup(seed) {
  const sim = Sim.create(seed);
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  const best = adults.slice().sort((a, b) => b.t.strength - a.t.strength || a.id - b.id)[0];
  for (const v of sim.ents.ofKind("villager").slice()) if (v !== best) sim.ents.remove(v.id);
  sim.cache.iv++;
  return { sim, v: best };
}
const nearestTree = (sim, v) => {
  let t = null, bd = 1e9;
  for (const p of sim.ents.ofKind("plant")) {
    if (p.species !== "tree" || (p.rv && p.rv !== v.id)) continue;
    const d = Math.abs(p.x - v.x) + Math.abs(p.y - v.y);
    if (d < bd) { bd = d; t = p; }
  }
  return t;
};
const saplings = (sim) => sim.ents.ofKind("plant").filter(p => p.species === "sapling" || (p.species === "stump" && p.fl)).length;      // felled trees: saplings and (S10) the stumps they leave
const topUp = (sim, v) => { if (sim.tick % 100 === 0) { v.hunger = Math.max(v.hunger, 0.9); v.thirst = Math.max(v.thirst, 0.9); v.energy = Math.max(v.energy, 0.9); v.warm = 1; } };

/** Felled trees over a season. mode: "ai" (chop order, re-issued when it ends) | "player" (possessed + scripted keys). */
function season(seed, mode) {
  const { sim, v } = setup(seed), id = v.id;
  const s0 = saplings(sim);
  if (mode === "player") sim.apply({ type: "possess", id });
  let target = null, goal = null;
  for (let i = 0; i < SEASON; i++) {
    topUp(sim, v);
    if (mode === "ai") {
      if (!v.order) { const t = nearestTree(sim, v); if (t) sim.apply({ type: "order", ids: [id], verb: "chop", tid: t.id }); }
    } else if (!v.action) {                                        // an idle tick: look at the world and press a key
      if (!target || target.species !== "tree") { target = nearestTree(sim, v); goal = null; }
      if (target) {
        const near = Math.abs(target.x - v.x) + Math.abs(target.y - v.y) <= 1 && Math.abs(target.z - v.z) <= 1;
        if (near) { sim.apply({ type: "pinput", id, dx: 0, dy: 0, tid: target.id, verb: "" }); target = null; }
        else {
          if (!goal) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const gx = target.x + dx, gy = target.y + dy;
            for (const dz of [0, 1, -1]) if (sim.world.isWalkable(gx, gy, target.z + dz)) { goal = goal || [gx, gy, target.z + dz]; break; }
          }
          const r = goal && sim.path.find(World.idx(v.x, v.y, v.z), World.idx(goal[0], goal[1], goal[2]));
          if (r && r.ok && r.path.length) {
            const [nx, ny] = World.xyz(r.path[0]);
            sim.apply({ type: "pinput", id, dx: Math.sign(nx - v.x), dy: Math.sign(ny - v.y), tid: 0, verb: "" });
          } else { target = null; goal = null; }
        }
      }
    }
    sim.step();
    if (!sim.ents.get(id)) break;
  }
  return { trees: saplings(sim) - s0, days: SEASON / DAY, cmds: sim.cmdLog.length };
}

let ok = true;
for (const seed of [1, 2, 3, 4, 5]) {
  const ai = season(seed, "ai"), pl = season(seed, "player");
  const aiRate = ai.trees * 2 / ai.days, plRate = pl.trees * 2 / pl.days, ratio = plRate / aiRate;
  console.log(`seed ${seed}: delegated ${aiRate.toFixed(2)} logs/day (${ai.trees} trees), possessed ${plRate.toFixed(2)} logs/day (${pl.trees} trees, ${pl.cmds} commands), ratio ${ratio.toFixed(3)}`);
  if (!(ratio <= 1.25)) ok = false;
  assert.ok(ai.trees > 0 && pl.trees > 0, "both chopped something");
}
assert.ok(ok, "possessed output exceeded 1.25x the delegated villager (R9 band)");
console.log("possess bot ok: possession stays inside the 1.25x band");
