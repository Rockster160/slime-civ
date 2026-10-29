// Light underground (GDD §13.5, S12): torches, lamps, and what the dark costs.
//
// A cell is UNDERGROUND when natural rock or soil closes it over within four cells (built roofs do not count: a hut is not
// a mine). Daylight reaches everything else. Underground, a cell is LIT when a light source stands within its radius on the
// same level (one level of slack): a torch (stick, FIRE_TENDING) shines 5 cells, a copper lamp (sheet, cold hammering) 7, a
// lit hearth or a burning kiln / mound / forge 4. Beyond light, work is slower (DARK_RATE, best guess) and a villager only
// sees SIGHT cells; inside light the seen frontier widens to the light's radius (seen.js look()), so a torch-lit tunnel is
// mapped as far as it shines.
// Pure functions of the world and furniture; nothing is cached, so a loaded sim answers exactly as the original did.
import { M } from "./world.js";

export const TORCH_R = 5;
export const LAMP_R = 7;
export const FIRE_LIGHT_R = 4;      // (one export per line: the bundler only sees the first name in `export const a, b`)
export const DARK_RATE = 0.85;               // work speed underground beyond any light (a best guess; tuned by the user later)
export const LIT_SIGHT = 5;                  // a villager standing in light looks this far along a tunnel (the dark: seen.js SIGHT, 3)

const NAT = new Uint8Array(256);
for (const m of [M.GRASS, M.DIRT, M.STONE, M.SAND, M.SOFT, M.FLINT, M.MALACHITE, M.CLAY, M.IRONORE, M.COAL, M.DEEP, M.RUBBLE, M.SALT, M.PEAT, M.HERB, M.GEM, M.CRYSTAL, M.COREORE, M.CORE, M.DWALL, M.CACHE]) NAT[m] = 1;
/** Natural ground (the stuff a roof is made of in a mine). */
export const isNatural = (m) => NAT[m] === 1;

/** Natural ground closes this cell over within four cells. */
export function underground(w, x, y, z) {
  for (let k = 1; k <= 4; k++) if (NAT[w.mat(x, y, z + k)]) return true;
  return false;
}

/** The light sources as [x, y, z, radius]. */
export function lightSources(sim) {
  const out = [];
  for (const e of sim.ents.ofKind("furniture")) {
    if (e.f === "torch") out.push([e.x, e.y, e.z, TORCH_R]);
    else if (e.f === "lamp") out.push([e.x, e.y, e.z, LAMP_R]);
    else if ((e.f === "hearth" && e.lit) || ((e.f === "kiln" || e.f === "mound" || e.f === "forge") && e.bn > 0)) out.push([e.x, e.y, e.z, FIRE_LIGHT_R]);
  }
  return out;
}
/** Within the radius of one of `lights` (squared integer distance on the level, one level of slack). */
export function inLight(lights, x, y, z) {
  for (const [lx, ly, lz, r] of lights) {
    if (Math.abs(lz - z) > 1) continue;
    const dx = lx - x, dy = ly - y;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}
/** Is it light enough to work here? (Open air always is: night is a different cost.) */
export function lit(sim, x, y, z) {
  return !underground(sim.world, x, y, z) || inLight(lightSources(sim), x, y, z);
}
/** Work-rate multiplier for a villager at their cell. */
export function darkMul(sim, v) {
  if (v.xp) return 1;                                  // an expedition party carries its own brands: delegated search work is not slowed by the dark
  return underground(sim.world, v.x, v.y, v.z) && !inLight(lightSources(sim), v.x, v.y, v.z) ? DARK_RATE : 1;
}
/** How far a villager looks from here: the light's reach inside light, else the dark default. */
export function sightAt(sim, x, y, z, dark, v) {
  if (!underground(sim.world, x, y, z)) return dark;
  if (v && v.br) return Math.max(dark, LIT_SIGHT);                         // 7.23: a delve party's own brands (while they last: delve.js)
  return inLight(lightSources(sim), x, y, z) ? Math.max(dark, LIT_SIGHT) : dark;
}
