// Scouting and far sights (S17).
//
//   Scout order   {type:"scout", ids:[...], x, y}: the villagers walk (in hops of SCOUT_HOP cells, so the path budget never sees a 200-cell goal) to unexplored land and
//                 reveal it as they go (seen.js watch). It is the "order" verb "scout" (jobs.js genScout), a standing order like Move: needs outrank it, and it
//                 stays until they arrive. The same rule as an expedition for "anything new": whatever they see for the first time far from camp enters the Curiosities.
//   Landmarks     every 100 ticks each villager above ground looks: a landmark (landmarks.js) within sight (longer from high ground) is recorded in sim.seen.lm
//                 [[kind, x, y]], saved with the seen set, drawn on the minimap, and, 40 or more cells from camp, added to the Curiosities as the expeditions do.
import { ORDER_COMMANDS } from "./orders.js";
import { landmarksIn, sightFor, LM_TEXT } from "./landmarks.js";
import { RS } from "./terrain.js";

export const SCOUT_HOP = 20;            // cells a scout plans ahead
export const SCOUT_MAX = 160;           // farthest target from camp (a scout far from the stockpile starves)
export const CURIO_FROM = 40;           // landmarks this far from camp are Curiosities

export const SCOUT_COMMANDS = {
  /** {type:"scout", ids, x, y}: send villagers to see what is there. */
  scout(sim, c) {
    sim.lastBlocker = "";
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) return false;
    if (Math.max(Math.abs(c.x - sim.site.x), Math.abs(c.y - sim.site.y)) > SCOUT_MAX) { sim.lastBlocker = "SCOUT_FAR"; return false; }
    return ORDER_COMMANDS.order(sim, { type: "order", ids: c.ids, verb: "scout", x: c.x, y: c.y, z: 0 });
  },
};

/** Every 100 ticks: landmarks come into view. */
export function landmarkTick(sim) {
  const s = sim.seen, w = sim.world, cp = sim.site, d = sim.disc;
  for (const v of sim.ents.ofKind("villager")) {
    const h = w.hsAt(v.x, v.y);
    if (v.z < h) continue;                                           // underground sees no horizon
    const R = sightFor(h);
    for (let ry = Math.floor((v.y - R) / RS); ry <= Math.floor((v.y + R) / RS); ry++) for (let rx = Math.floor((v.x - R) / RS); rx <= Math.floor((v.x + R) / RS); rx++) {
      for (const lm of landmarksIn(sim.def, rx, ry)) {
        if ((lm.x - v.x) * (lm.x - v.x) + (lm.y - v.y) * (lm.y - v.y) > R * R) continue;
        if (s.lm.some(m => m[1] === lm.x && m[2] === lm.y)) continue;
        s.lm.push([lm.k, lm.x, lm.y]);
        s.ver++;
        if (Math.max(Math.abs(lm.x - cp.x), Math.abs(lm.y - cp.y)) >= CURIO_FROM) {
          const id = "lm:" + lm.k + ":" + lm.x + "," + lm.y;
          if (!d.curio.some(q => q.id === id)) d.curio.push({ id, row: "", craft: "", wild: 1, t: sim.tick, x: lm.x, y: lm.y, z: Math.max(0, w.hsAt(lm.x, lm.y)) + 1, text: LM_TEXT[lm.k] });
        }
      }
    }
  }
}
