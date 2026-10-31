// AI controller seam. S2: the job board (jobs.js) picks the action. C2
// possession will replace it per villager with input-driven actions that run
// through the same runner in actions.js - the controller never mutates the
// world itself.
import { plan } from "./jobs.js";
import { playerStep } from "./possess.js";

/** Idle villager: choose a job and return its action. */
export function decide(sim, ent) {
  plan(sim, ent, false);
  return ent.action;
}

/** Busy villager at a re-plan point: switch only if something else now scores higher. */
export function replan(sim, ent) {
  plan(sim, ent, true);
}

/**
 * One tick of control for a villager: the AI board (decide when idle, replan on a
 * schedule or when the board changed), or the PlayerController when possessed.
 * Either way the result is an `ent.action` run by the same runner (rule 3).
 */
export function control(sim, v) {
  if (v.poss) { playerStep(sim, v); return; }
  const board = sim.board;
  if (v.action) {
    // 9.30: no village broadcast. A slime replans when it was told to (rp: an order to it, a need of its own, belief.js `look` writing a new need:/danger: fact) or on its staggered timer.
    if (v.rp || (sim.tick + v.id) % 200 === 0) { v.rp = 0; replan(sim, v); }
  } else { decide(sim, v); }
}
