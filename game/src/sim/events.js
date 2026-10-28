// Systemic world events (GDD §11.8): data rows that PLACE a precondition instead of waiting for the player. They are never raids
// and never grant knowledge; they only make a thing possible. A row runs when
//   (a) its pressure tag has been over its threshold for `days` days in a row, AND
//   (b) the precondition it provides is absent from the settlement's reach,
// and then once a day with chance `p` (a named RNG stream, so a seed always has the same weather) until it has fired, after
// which it rests `cool` days. `eventDue` is the pure decision (tests/events.js drives it over a pressure timeline, no sim);
// `eventsDaily` feeds it from the real sim; `forceEvent` is the debug command (Game menu).
//
// LIGHTNING: pressure(warm) > 0.3 for 2 days and nobody knows fire and nothing is burning -> a storm strikes a tree near the camp
//   (flame entity, fire.js): it burns for two days, falls in, and smoulders for two more. In a normal game the pressure climbs from
//   about day 55 (winter look-ahead), so the first strike lands around day 58-66, in autumn, before the first winter.
// STUMP: pressure(tool_edge) > 0.3 for two seasons and no charcoal anywhere -> a stump smoulders under a mound near the camp
//   (charcoal precondition, S7b). tool_edge pressure is 0 until S7b feeds it, so this row sleeps until then.
import { DAYS_PER_SEASON } from "./clock.js";
import { log } from "./chronicle.js";
import { pressure, can } from "./knowledge.js";
import { anyFire, igniteTree, smoulderAt } from "./fire.js";
import { burnDown } from "./plants.js";
import { CAMP } from "./board.js";
import { haveTotal } from "./items.js";

/** id, tag, thr: pressure threshold, days: how long it must hold, p: daily chance once eligible, cool: rest after firing, absent(sim): is the precondition missing? */
export const EVENTS = [
  { id: "lightning", tag: "warm", thr: 0.3, days: 2, p: 0.4, cool: 3, absent: (sim) => !anyFire(sim) && !can(sim, "FIRE_TENDING"), act: strikeTree },
  { id: "stump", tag: "tool_edge", thr: 0.3, days: 2 * DAYS_PER_SEASON, p: 0.15, cool: 20, absent: (sim) => haveTotal(sim, "charcoal") === 0 && !can(sim, "CHARCOAL"), act: placeStump },
];

/**
 * The decision, pure: st = {streak, cd} (days), input = {pressure, absent, roll} -> {st', fire}. `roll` is a float in [0,1) and is only
 * meaningful when the row is eligible (the caller draws one only then, so the stream does not advance on quiet days).
 */
export function eventDue(row, st, input) {
  const streak = input.pressure > row.thr ? st.streak + 1 : 0;
  const cd = Math.max(0, st.cd - 1);
  const eligible = streak >= row.days && input.absent && cd === 0;
  const fire = eligible && input.roll < row.p;
  return { st: { streak, cd: fire ? row.cool : cd }, fire, eligible };
}

/** Once a day, from the real sim. */
export function eventsDaily(sim) {
  const d = sim.disc;
  for (const row of EVENTS) {
    const st = d.ev[row.id] || { streak: 0, cd: 0 };
    const p = pressure(sim, row.tag), absent = row.absent(sim);
    const probe = eventDue(row, st, { pressure: p, absent, roll: 1 });          // would it be eligible? (roll 1 never fires)
    let roll = 1;
    if (probe.eligible) roll = sim.rng.stream("event." + row.id).float();
    const r = probe.eligible ? eventDue(row, st, { pressure: p, absent, roll }) : probe;
    d.ev[row.id] = r.st;
    if (r.fire) row.act(sim);
  }
}

/** Debug (Game menu): make an event happen now. Returns true if it did. */
export function forceEvent(sim, id) {
  const row = EVENTS.find(e => e.id === id);
  return !!row && row.act(sim) === true;
}

// ---- the acts -------------------------------------------------------------------------------------------------------

const cheb = (a, x, y) => Math.max(Math.abs(a.x - x), Math.abs(a.y - y));

/** A tree near the camp, not already alight: prefer 8-14 cells out (close enough to be seen), widen if needed. */
function pickTree(sim, lo, hi) {
  const c = CAMP(sim.stock), cands = [];
  for (const t of sim.ents.ofKind("plant")) {
    if (t.species !== "tree" || t.burn) continue;
    const d = cheb(t, c.x, c.y);
    if (d >= lo && d <= hi) cands.push(t);
  }
  return cands;
}
function chooseTree(sim, stream) {
  for (const [lo, hi] of [[8, 14], [6, 22], [3, 40]]) {
    const c = pickTree(sim, lo, hi);
    if (c.length) return stream.pick(c);
  }
  return null;
}

function strikeTree(sim) {
  const t = chooseTree(sim, sim.rng.stream("event.pick"));
  if (!t) return false;
  igniteTree(sim, t);
  const c = CAMP(sim.stock);
  sim.disc.last = { id: "lightning", t: sim.tick, x: t.x, y: t.y, z: t.z };
  sim.disc.curio.push({ id: "fire_tree", row: "FIRE_TENDING", craft: "FIRE_TENDING", t: sim.tick, x: t.x, y: t.y, z: t.z, text: "A tree is burning. Something is eating the wood and giving off light and heat." });
  log(sim, "MILESTONE", "Lightning struck a tree " + cheb(t, c.x, c.y) + " cells from the camp. It is burning.", [], { x: t.x, y: t.y, ev: "lightning" }, 1);
  return true;
}

function placeStump(sim) {
  const t = chooseTree(sim, sim.rng.stream("event.pick"));
  if (!t) return false;
  burnDown(sim, t);
  smoulderAt(sim, t);
  sim.disc.last = { id: "stump", t: sim.tick, x: t.x, y: t.y, z: t.z };
  sim.disc.curio.push({ id: "smoulder", row: "SMOULDER_WOOD", craft: "CHARCOAL", t: sim.tick, x: t.x, y: t.y, z: t.z, text: "A stump under a heap of earth is smoking and is not gone." });
  log(sim, "MILESTONE", "A stump near the camp is smouldering under a mound of earth.", [], { x: t.x, y: t.y, ev: "stump" }, 1);
  return true;
}

