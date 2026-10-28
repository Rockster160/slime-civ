// What the first-person crosshair is on (S18). Pure: reads the sim and the cell view, returns a target in the shape ui/usecmd.js takes, plus what using it would do
// (the verb the sim's own interact() would build, or why not) so the HUD can show the verb chip. Never writes the sim (interact() is read-only for everything but torches).
import { interact } from "../sim/possess.js";
import { diggable } from "../sim/tasks.js";
import { castCells, raySphere } from "../render/fpvmath.js";
import { usable } from "./usecmd.js";

export const REACH_SEE = 7;              // how far the crosshair looks for something to use
export const REACH_ROCK = 3.2;           // rock is outlined and offered only this close

/**
 * eye = [x, y, z] and dir = unit look direction (sim axes); `targets` = [{e, c: [x, up, y] (GL axes), r}] (the billboards, from render/fpv.js).
 * -> null | {tgt: {ent} | {cell}, task, blocker, at: [x, y, z] (where the verb chip hangs), t, ent?, hit?, mat?}
 */
export function pickTarget(sim, v, view, eye, dir, targets) {
  const hit = castCells(eye, dir, REACH_SEE, (x, y, z) => view.isSolid(x, y, z));
  let best = null, bt = hit ? hit.t : 1e9;
  for (const t of targets) {
    if (!usable(sim, t.e)) continue;
    const d = raySphere(eye, dir, [t.c[0], t.c[2], t.c[1]], t.r);
    if (d >= 0 && d < bt) { bt = d; best = t.e; }
  }
  if (best) {
    const r = interact(sim, v, best.id, "", [0, 0, 0]);
    return { tgt: { ent: best }, ent: best, task: r.task ? r.task.k : "", blocker: r.blocker || "", at: [best.x + 0.5, best.y + 0.5, best.z + 0.6], t: bt };
  }
  if (hit && hit.t <= REACH_ROCK && diggable(sim, hit.x, hit.y, hit.z)) {
    const r = interact(sim, v, 0, "dig", [hit.x, hit.y, hit.z]);
    return { tgt: { cell: [hit.x, hit.y, hit.z] }, hit, task: r.task ? r.task.k : "", blocker: r.blocker || "", at: [hit.x + 0.5 + hit.nx * 0.5, hit.y + 0.5 + hit.ny * 0.5, hit.z + 0.5 + hit.nz * 0.5], mat: view.mat(hit.x, hit.y, hit.z), t: hit.t };
  }
  return null;
}
