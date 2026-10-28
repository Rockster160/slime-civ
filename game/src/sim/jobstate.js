// Releasing what a villager's job holds: reservations, a construction site,
// the sleeping/huddling flags. Used when a job finishes, is replaced, or the
// villager dies, so nothing leaks to a dead or reassigned actor (§09 Stall).

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
}

/** Drop the current action and everything it holds. */
export function cancelAction(sim, v) { releaseJob(sim, v); v.action = null; }

/** Is entity e reserved by someone other than `me` (holder alive and not expired)? */
export function reservedByOther(sim, e, me) {
  if (!e.rv || e.rv === me) return false;
  if (sim.tick - e.rt >= RES_EXPIRY) return false;
  return sim.ents.get(e.rv) !== undefined;
}
export function reserve(sim, v, e) {
  e.rv = v.id; e.rt = sim.tick;
  if (!v.job.res.includes(e.id)) v.job.res.push(e.id);
}
