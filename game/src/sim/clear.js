// Clear area (user design, D58): "tells the slime we want to get rid of the trees and other growth in an area. Not a profession, just following instructions to make room for
// future buildings." A drag rectangle the player marks; it is an ORDER for the selected slimes and a designation on the board (OD-58) for idle ones.
//
//   sim.clr = {n, list:[{id, x0,y0,x1,y1, z, t0}]}   (saved + hashed)
//   Removes: trees (a felled tree is grubbed out, stump and all: 2 logs + 4 sticks fall loose), saplings, stumps, berry bushes (the berries on them fall loose) and grass tufts.
//   Leaves: tubers (the winter larder), rock (surface outcrops are terrain: the Dig tool), anything built, anything burning.
//   The rectangle (at most CLEAR_MAX a side) ends when none of those is left in it. An ordered slime's `v.order` is {verb:"clear_area", cid}; a slime that read the notice (belief kind
//   "clear") works it as a standing chore (jobs.js genClear, job kind "grub", task step "grub" in tasks.js). Outputs lie loose and are hauled to the yard as always.
import { designate } from "./notices.js";
import { isAdult } from "./villager.js";

export const CLEAR_MAX = 24;                  // cells a side
export const CLEAR_SEE = 16;                  // a believed notice covers the rectangles whose centre is this close to where it was written
export const CLEARS = new Set(["tree", "sapling", "stump", "berry", "tuft"]);
export const GRUB_DUR = { tree: 360, sapling: 60, stump: 90, berry: 60, tuft: 30 };

export const newClr = () => ({ n: 0, list: [] });
export const centreOf = (r) => ({ x: (r.x0 + r.x1) >> 1, y: (r.y0 + r.y1) >> 1 });

/** The growth still to clear inside a rectangle, in id order (the cells are read with the grid; cached per tick and item version). */
export function clearTargets(sim, r) {
  const c = sim.cache;
  if (c.clT !== sim.tick || c.clV !== c.iv) { c.clT = sim.tick; c.clV = c.iv; c.cl = new Map(); }
  const hit = c.cl.get(r.id);
  if (hit) return hit;
  const out = [], w = sim.world;
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) {
    const g = w.standZ(x, y), lo = g >= 0 ? Math.min(r.z - 5, g - 2) : r.z - 5, hi = g >= 0 ? Math.max(r.z + 5, g + 2) : r.z + 5;
    for (let z = lo; z <= hi; z++) for (const id of sim.ents.at(x, y, z)) { const e = sim.ents.get(id); if (e && e.kind === "plant" && CLEARS.has(e.species) && !e.burn) out.push(e); }
  }
  out.sort((a, b) => a.id - b.id);
  c.cl.set(r.id, out);
  return out;
}

/** Take out the rectangles with nothing left to clear (every 200 ticks, with the board). */
export function clearTick(sim) {
  const L = sim.clr;
  if (!L) return;
  for (let i = L.list.length - 1; i >= 0; i--) if (!clearTargets(sim, L.list[i]).length) L.list.splice(i, 1);
}
export const CLEAR_COMMANDS = {
  /** {type:"clearArea", x0,y0,x1,y1,z, ids?}: mark the rectangle; the ids (if any) are ordered to work it. */
  clearArea(sim, c) {
    sim.lastBlocker = "";
    if (![c.x0, c.y0, c.x1, c.y1, c.z].every(Number.isInteger)) return false;
    const r = { id: sim.clr.n + 1, x0: Math.min(c.x0, c.x1), y0: Math.min(c.y0, c.y1), x1: Math.max(c.x0, c.x1), y1: Math.max(c.y0, c.y1), z: c.z, t0: sim.tick };
    r.x1 = Math.min(r.x1, r.x0 + CLEAR_MAX - 1); r.y1 = Math.min(r.y1, r.y0 + CLEAR_MAX - 1);
    if (!clearTargets(sim, r).length) { sim.lastBlocker = "NO_TARGET"; return false; }
    sim.clr.n++; sim.clr.list.push(r);
    const m = centreOf(r);
    designate(sim, "clear", m.x, m.y, r.z, 1);
    for (const id of c.ids || []) {
      const v = sim.ents.get(id);
      if (!v || v.kind !== "villager" || !isAdult(sim, v) || v.xp) continue;
      v.order = { verb: "clear_area", cid: r.id, tid: 0, x: m.x, y: m.y, z: r.z, t0: sim.tick, done: 0 };
      v.rp = 1;
    }
    sim.board.ep++;
    return true;
  },
};
