// The village's starter structure (R8, GDD §15.7 row 1): once FIRE_TENDING is known and the cold is coming, the village plans a
// fire ring near the camp by itself if it has none. Villagers build it like any ghost (craft_site) and tend it as a standing chore
// (jobs.js genTendFire). The player can also place fire rings in build mode.
import { can, pressure } from "./knowledge.js";
import { winterAhead } from "./season.js";
import { hearths, HEARTH_WANT_PRESSURE } from "./fire.js";
import { placeGhosts } from "./build.js";
import { findSite } from "./board.js";

/** Every 200 ticks. Returns true if it planned a fire ring. */
export function autoHearth(sim) {
  if (!can(sim, "FIRE_TENDING") || hearths(sim).length) return false;
  if (sim.ents.ofKind("csite").some(s => s.w === "hearth")) return false;
  if (pressure(sim, "warm") < HEARTH_WANT_PRESSURE && winterAhead(sim.tick) < 0.2) return false;
  const st = findSite(sim, "hearth");
  if (!st) return false;
  const r = placeGhosts(sim, [{ w: "hearth", x: st[0], y: st[1], z: st[2] }], ++sim.board.sg);
  if (r.placed) sim.board.ep++;
  return r.placed > 0;
}
