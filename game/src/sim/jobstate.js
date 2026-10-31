// Releasing what a villager's job holds: reservations, a construction site,
// the sleeping/huddling flags. Used when a job finishes, is replaced, or the
// villager dies, so nothing leaks to a dead or reassigned actor (§09 Stall).

import { flags as belFlags, LOOK_R } from "./belief.js";

export const RES_EXPIRY = 400;        // ticks without progress before a reservation lapses (§09)

export function releaseJob(sim, v) {
  const j = v.job;
  if (j && j.res) {
    for (const id of j.res) {
      const e = sim.ents.get(id);
      if (!e) continue;
      if (e.kind === "site") { if (e.rv === v.id) sim.ents.remove(id); }
      else if (e.rv === v.id) e.rv = 0;
    }
    j.res = [];
  }
  v.rest = 0; v.slp = 0;
  if (v.wg) { const w = sim.ents.get(v.wg); if (w) w.dr = 0; delete v.wg; delete v.wgc; }       // S15: a wagon is left where it stands when the haul is cut short
}

/** Drop the current action and everything it holds. */
export function cancelAction(sim, v) { releaseJob(sim, v); v.action = null; }

/** Does entity e carry a live reservation of someone other than `me` (holder alive and not expired)? The truth, whether or not `me` can tell. */
export function takenByOther(sim, e, me) {
  if (!e.rv || e.rv === me) return false;
  if (sim.tick - e.rt >= RES_EXPIRY) return false;
  return sim.ents.get(e.rv) !== undefined;
}
const within = (a, b) => Math.abs(a.x - b.x) <= LOOK_R && Math.abs(a.y - b.y) <= LOOK_R && Math.abs(a.z - b.z) <= 2;
/**
 * Is entity e reserved by someone other than `me`, AS `me` CAN TELL (9.30)? A reservation is seen when `me` is within sight of the thing (it sees who works it) or
 * of the holder. Out of sight it is not known: the planner may send `me` there, and the arrival check (tasks.js) finds the target taken and moves on.
 */
export function reservedByOther(sim, e, me) {
  if (!takenByOther(sim, e, me)) return false;
  if (belFlags.off) return true;
  const v = sim.ents.get(me);
  return !v || within(v, e) || within(v, sim.ents.get(e.rv));
}
/** Take the reservation. When another slime already holds it (it could not be seen when planning) the entity stays theirs and is remembered as `rl`: checked on arrival. */
export function reserve(sim, v, e) {
  if (takenByOther(sim, e, v.id)) { (v.job.rl || (v.job.rl = [])).push(e.id); return; }
  e.rv = v.id; e.rt = sim.tick;
  if (!v.job.res.includes(e.id)) v.job.res.push(e.id);
}
