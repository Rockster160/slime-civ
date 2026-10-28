// What a "use" on a target sends (shared by the top-down possession and the first-person view, S18). The target is what the player points at - an entity or
// a rock cell - and the answer is the extra fields of the ONE pinput command (tid, or verb "dig" with a cell), or why not. Both views call this, so the same target
// produces the same command and a recorded possession replays the same whichever view the player used. Pure: it reads the sim and never writes.
import { diggable } from "../sim/tasks.js";

/** Lower is picked first when several things are within reach. */
export const PRIORITY = { fauna: -1, csite: 0, item: 1, plant: 2, furniture: 3 };

/** Is it something a hand can do something to (a tree, a bush or tuft that still bears; not the stockpile's non-food)? */
export function usable(sim, e) {
  if (!(e.kind in PRIORITY)) return false;
  if (e.kind === "plant" && !(e.species === "tree" || (e.species === "berry" && e.yield > 0) || (e.species === "tuft" && e.yield > 0))) return false;
  if (e.kind === "item" && sim.stock && e.x >= sim.stock.x0 && e.x <= sim.stock.x1 && e.y >= sim.stock.y0 && e.y <= sim.stock.y1 && e.z === sim.stock.z && !(e.item === "berry" || e.item === "dried")) return false;
  return true;
}
/** Beside the villager (one step, one level). */
export const nearBy = (v, e) => Math.abs(e.x - v.x) + Math.abs(e.y - v.y) <= 1 && Math.abs(e.z - v.z) <= 1;

/**
 * tgt = {ent} | {cell: [x, y, z]} (the rock cell to dig) | null.  -> {extra: {tid} | {verb: "dig", x, y, z}} or {err: "far" | "none"}.
 */
export function useFor(sim, v, tgt) {
  if (!tgt) return { err: "none" };
  if (tgt.ent) return nearBy(v, tgt.ent) ? { extra: { tid: tgt.ent.id } } : { err: "far" };
  if (tgt.cell && diggable(sim, tgt.cell[0], tgt.cell[1], tgt.cell[2])) return { extra: { verb: "dig", x: tgt.cell[0], y: tgt.cell[1], z: tgt.cell[2] } };
  return { err: "none" };
}

/** The target of a map click (ui/pick.js): the clicked cell's entity beside us, else any entity there (too far), else the rock under it. */
export function targetOfPick(sim, v, pk) {
  const e = pk.ents.find(q => nearBy(v, q)) || pk.ents[0];
  if (e) return { ent: e };
  return pk.z > 0 ? { cell: [pk.x, pk.y, pk.z - 1] } : null;
}
export const USE_ERR = { far: "Too far - walk next to it first (WASD).", none: "Nothing there to use." };
