// Biomes (GDD §11.4, S12): the meadow the camp starts in, a cold pine highland and a marsh. A biome is a label per column
// (per chunk, terrain.js: a pure function of the seed and the column) with a few knobs, read by worldgen (flora, ground, ores),
// villager.js (a warmth offset) and fauna.js (how many hoppers wander in). Everything is derived from the seed, so nothing is
// saved except `sim.bio` (1 = this world has biomes, 0 = a world made before they existed).

export const MEADOW = 0;
export const HIGHLAND = 1;
export const MARSH = 2;       // (one export per line: the bundler only sees the first name in `export const a, b`)
/**
 * name; warm = added to the warmth a villager feels there (the 0..1 scale of season.js; the highland is colder, the marsh a touch kinder);
 * tree/berry/tuft/tuber = permille chances per grass cell (meadow = worldgen's own numbers); herd = share of the hoppers that arrive from the edge
 * (fauna.js); tint = how the map tints it ([r,g,b], alpha); note = the cell card's sentence.
 */
export const BIOMES = [
  { id: MEADOW,   name: "Meadow",   warm: 0,     herd: 100, tint: [0, 0, 0, 0],         note: "Grass, berries and groves: a gentle country." },
  { id: HIGHLAND, name: "Highland", warm: -0.08, herd: 40,  tint: [92, 118, 168, 0.24], note: "Cold pine highland: little to forage and few hoppers, but more bare stone and iron near the surface. Colder than the meadow." },
  { id: MARSH,    name: "Marsh",    warm: 0.04,  herd: 140, tint: [86, 150, 120, 0.26], note: "Wetland: reeds (grass) and clay at the surface, ponds, many hoppers, few trees." },
];
/** Chances per 1000 grass cells beyond the clearing: [forest-patch tree, other tree, berry, tuft, tuber]. */
export const FLORA = { [HIGHLAND]: [200, 70, 4, 18, 3], [MARSH]: [20, 8, 10, 120, 14] };

/** The biome of a column (a world made without biomes is all meadow). */
export function biomeAt(world, x, y) { return world.biomeAt(x, y); }
