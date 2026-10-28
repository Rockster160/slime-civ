// The thornback's cave and the cells autonomous villagers refuse (GDD §13.3 `unsafe`, §07 K7 risk access).
//
// Restricted cells are what a possessed villager reaches and a delegated one will not (blocker UNSAFE):
//   territory  the lair chamber and its patrol ground (a box round the cave centre, a few levels tall)
//   unmapped   a cave cell nobody has seen yet (an unseen hall is a risk nobody has judged)
//   unstable   S12: a cell under a cracking roof (underground.js)
//   badair     S12: a seen cell of foul air
// Derived from the cave in world.geo (a pure function of the seed) and the fog, so nothing here is saved.
import { World } from "./world.js";
import { isSeen } from "./seen.js";
import { hazardAt } from "./underground.js";

export const TERR_MARGIN = 4;      // cells round the chamber's floor (its patrol ground and the lip of the cave)
export const TERR_UP = 4, TERR_DOWN = 2;      // levels above and below the cave floor

export function lairOf(sim) { return sim.world.geo && sim.world.geo.caves.length ? sim.world.geo.caves[0] : null; }
/** The floor cell nearest the chamber centre: where the thornback lives. */
export function lairHome(sim) {
  const c = lairOf(sim);
  if (!c) return null;
  let best = null, bd = 1e9;
  for (const i of c.floor) { const [x, y, z] = World.xyz(i), d = Math.abs(x - c.cx) + Math.abs(y - c.cy); if (d < bd) { bd = d; best = [x, y, z]; } }
  return best;
}
/** The territory box: the chamber's floor, widened by TERR_MARGIN. Derived from the cave, so never saved. */
function terr(sim) {
  const k = sim.cache;
  if (!k.terr) {
    const c = lairOf(sim);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    if (c) for (const i of c.floor) { const [x, y] = World.xyz(i); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    k.terr = { x0: x0 - TERR_MARGIN, y0: y0 - TERR_MARGIN, x1: x1 + TERR_MARGIN, y1: y1 + TERR_MARGIN, zf: c ? c.zf : 0, on: !!c };
  }
  return k.terr;
}
export function inTerritory(sim, x, y, z) {
  const t = terr(sim);
  return t.on && x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1 && z >= t.zf - TERR_DOWN && z <= t.zf + TERR_UP;
}
function caveSet(sim) {
  const k = sim.cache;
  if (!k.cave) { const c = lairOf(sim); k.cave = new Set(c ? c.cells.concat(c.floor) : []); }
  return k.cave;
}
/** "" if a villager may go there on their own, else why not: "territory" | "unmapped" | "unstable" | "badair". */
export function restricted(sim, x, y, z) {
  if (inTerritory(sim, x, y, z)) return "territory";
  if (caveSet(sim).has(World.idx(x, y, z)) && !isSeen(sim, x, y, z)) return "unmapped";
  return hazardAt(sim, x, y, z);
}
/** The first restricted cell a task would stand in or dig, or "". Steps with z < 0 stay where they are. */
export function unsafeTask(sim, task) {
  if (!task.steps) return "";
  for (const s of task.steps) {
    if (s.z >= 0) { const r = restricted(sim, s.x, s.y, s.z); if (r) return r; }
    if (s.cx !== undefined) { const r = restricted(sim, s.cx, s.cy, s.cz); if (r) return r; }
  }
  return "";
}
