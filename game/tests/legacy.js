// Import FIRST in a test that was tuned on the meadow-only map (before S12's biomes): worlds made without an explicit `biomes` option are then
// grown the old way, so seed 7's trajectory (who sees the lightning, when the first copper is found) is what those tests were written against.
// The biome map itself is covered by tests/geology.js (20 seeds), tests/underground.js and the ui_smoke.
import { WORLD } from "../src/sim/worldgen.js";
WORLD.biomes = false;
WORLD.depth = false;      // S14: the world-depth content (illness, wolves and grazers, salt/peat/herb, perturbed properties) is off too: those tests were tuned before it, and their fixtures were made without it
// S16: these tests hard-code positions round the OLD camp (64, 64): the camp is placed there if it is a fair start (otherwise the spawn search runs as in the game; tests/endless.js,
// tests/geology.js and the ui_smoke use it). Everything else - the terrain, caves, stream, ores - is the endless world's.
WORLD.prefer = { x: 64, y: 64 };
