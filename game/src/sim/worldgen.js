// The world of a seed (S16): endless, generated on demand, a pure function of (seed, options). See terrain.js (the land), spawn.js (where the
// camp is and what is placed round it) and flora.js (what grows when a chunk is activated). This file puts them together for the Sim.
import { World } from "./world.js";
import { Entities } from "./entities.js";
import { genChunk } from "./terrain.js";
import { defOf } from "./spawn.js";
import { activateChunk } from "./flora.js";

/** World options a caller may flip before it makes worlds: tests of the older balance run on the meadow-only map (tests/legacy.js); the game never touches it. */
export const WORLD = { biomes: true, depth: true, prefer: null };       // depth (S14): salt, peat and herb deposits, and (sim.js) illness, wolves and grazers, perturbed properties; tests/legacy.js turns it off
/** The nominal camp. The real one is `world.site` (the spawn search may move it); this is only the first candidate, kept for code that wants a default. */
export const SITE = Object.freeze({ x: 0, y: 0, z: 13, r: 8 });
export const BIOME_CLEAR = 36;

/** A world for a seed: {world, ents, gen} with nothing activated yet (the Sim activates the chunks round its people). gen = how the spawn search went. */
export function generateWorld(seed, opts = {}) {
  const biomes = opts.biomes !== undefined ? opts.biomes : WORLD.biomes, depth = opts.depth !== undefined ? opts.depth : WORLD.depth;
  const o = { biomes, depth };
  if (opts.spawn) o.spawn = opts.spawn; else if (WORLD.prefer) o.prefer = WORLD.prefer;
  const def = defOf(seed >>> 0, o);
  const world = new World((cx, cy) => genChunk(def, cx, cy), def), ents = new Entities();
  world.gen_ = def.gen;
  return { world, ents, gen: def.gen, def };
}

/** Activate every chunk within `r` cells (Chebyshev) of a point, in ascending chunk-key order. -> number activated */
export function activateAround(world, ents, def, x, y, r, tick = 0) {
  let n = 0;
  for (let cx = (x - r) >> 4; cx <= (x + r) >> 4; cx++) for (let cy = (y - r) >> 4; cy <= (y + r) >> 4; cy++) if (activateChunk(world, ents, def, cx, cy, tick)) n++;
  return n;
}
