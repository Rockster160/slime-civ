// S17: the spawn prefers a camp with drinkable water within WATER_NEAR cells and berry bushes within 15 (worldgen only: no sim, 20 seeds, the game's own world options).
//   node tests/spawn17.js
import assert from "node:assert/strict";
import { defOf, WATER_NEAR, BERRY_MIN } from "../src/sim/spawn.js";
import { WORLD } from "../src/sim/worldgen.js";

const opts = { biomes: WORLD.biomes, depth: WORLD.depth, pond: WORLD.pond };
let water = 0, berries = 1e9, home = 0;
for (let seed = 1; seed <= 20; seed++) {
  const g = defOf(seed, opts).gen;
  assert.ok(g.ok, "seed " + seed + " has a fair start: " + g.fails);
  assert.ok(g.water <= WATER_NEAR, "seed " + seed + ": drinkable water " + g.water + " cells from camp (at most " + WATER_NEAR + ")");
  assert.ok(g.berries >= BERRY_MIN, "seed " + seed + ": " + g.berries + " berry bushes within 15 cells");
  water = Math.max(water, g.water); berries = Math.min(berries, g.berries);
  if (g.spawn.x === 0 && g.spawn.y === 0) home++;
}
assert.deepEqual(defOf(7, opts).gen.spawn, defOf(7, opts).gen.spawn, "the spawn is a pure function of the seed");
console.log("ok  spawn: 20 of 20 seeds have water within " + water + " cells and at least " + berries + " berry bushes within 15 (" + home + " at the origin)");
console.log("spawn17 ok");
