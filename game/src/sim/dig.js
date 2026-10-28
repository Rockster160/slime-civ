// What digging a cell does (GDD §14.2 materials as data): how long it takes, what falls out, and which cells
// villagers may dig at all. One table, read by tasks.js (the dig verb), jobs.js, orders.js and mine.js.
import { M, F } from "./world.js";
import { stockZoneAt } from "./items.js";

/** dur = ticks of effort at level 0; item/n = what drops loose at the hole; hard = hard-rock difficulty 0.8 (§10). */
export const DIG = {
  [M.GRASS]:     { item: "dirt",      n: 1, dur: 160 },
  [M.DIRT]:      { item: "dirt",      n: 1, dur: 140 },
  [M.SAND]:      { item: "dirt",      n: 1, dur: 120 },
  [M.CLAY]:      { item: "clay",      n: 2, dur: 140 },
  [M.SOFT]:      { item: "stone",     n: 1, dur: 200 },
  [M.FLINT]:     { item: "flint",     n: 2, dur: 240 },
  [M.MALACHITE]: { item: "malachite", n: 2, dur: 240 },
  [M.STONE]:     { item: "stone",     n: 1, dur: 320, hard: true },     // hard rock: slower, and it only teaches advanced diggers
  // S9: iron country. Ore and coal sit in the first two layers of the hard rock band; the deep rock beneath it takes an iron pick (a tool tier is a material property, GDD §11.5).
  [M.IRONORE]:   { item: "iron_ore",  n: 2, dur: 360, hard: true },
  [M.COAL]:      { item: "coal",      n: 2, dur: 300, hard: true },
  [M.DEEP]:      { item: "stone",     n: 1, dur: 560, hard: true, needs: "iron_pick" },
  [M.RUBBLE]:    { item: "stone",     n: 1, dur: 90 },                         // S12: a fallen roof clears quickly and gives stone back
  // S14: the alternates' raw materials (salt lick, marsh peat, marsh herb)
  [M.SALT]:      { item: "salt",      n: 2, dur: 160 },
  [M.PEAT]:      { item: "peat",      n: 3, dur: 140 },
  [M.HERB]:      { item: "herb",      n: 2, dur: 100 },
};
/** The tool a cell needs in hand (an item name) or "". */
export const toolNeeded = (sim, x, y, z) => { const d = DIG[sim.world.mat(x, y, z)]; return d && d.needs ? d.needs : ""; };
export const HARD_DIFFICULTY = 0.8;

/** Terrain we let villagers dig: natural ground, nothing standing on it, outside the stockpile. */
export function diggable(sim, x, y, z) {
  if (z < 1 || !DIG[sim.world.mat(x, y, z)]) return false;
  if (sim.stock && stockZoneAt(sim, x, y, z + 1)) return false;
  for (const id of sim.ents.at(x, y, z + 1)) { const e = sim.ents.get(id); if (e.kind !== "item" && e.kind !== "fauna") return false; }
  return !(sim.world.flags(x, y, z + 1) & F.OBSTACLE);
}

/**
 * The same for a cell the player MARKED (area mining): plants growing on it are simply uprooted when it goes, so a region
 * over a grove still gets dug. Villagers, furniture and construction sites still block it.
 */
export function diggableMarked(sim, x, y, z) {
  if (z < 1 || !DIG[sim.world.mat(x, y, z)]) return false;
  if (sim.stock && stockZoneAt(sim, x, y, z + 1)) return false;
  for (const id of sim.ents.at(x, y, z + 1)) { const e = sim.ents.get(id); if (e.kind !== "item" && e.kind !== "plant" && e.kind !== "fauna") return false; }
  return true;
}
/** Uproot the plants on top of a cell about to be dug. */
export function uproot(sim, x, y, z) {
  for (const id of sim.ents.at(x, y, z + 1).slice()) if (sim.ents.get(id).kind === "plant") sim.ents.remove(id);
  sim.world.setFlags(x, y, z + 1, sim.world.flags(x, y, z + 1) & ~F.OBSTACLE);
}
