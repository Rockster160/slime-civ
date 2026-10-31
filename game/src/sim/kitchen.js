// The kitchen (S15, GDD §12.4-12.5): a closed Kitchen room with a fire ring in it. Cooking is a job (jobs.js genCook): a villager takes raw food from the
// stockpile, works at the lit fire ring in the room, and carries away MORE food that keeps longer; a better kitchen gives more (a poor one nothing extra).
// Data rows: add a dish by adding a row here and an item in items.js.
import { evalPurpose, kitchenAt } from "./purposes.js";
import { dropLoose, carryAdd, carryTake, carryRoom } from "./items.js";
import { gain } from "./skills.js";
import { once } from "./chronicle.js";

/** dish item -> {from: raw item, n: raw units cooked at once, dur: ticks of work, label}. A batch of `n` gives `n` + round(2 x kitchen quality) dishes. */
export const DISHES = {
  cooked_meat: { from: "hopper_meat", n: 4, dur: 300, label: "cook meat" },
  baked_tuber: { from: "tuber", n: 4, dur: 240, label: "bake tubers" },
};
export const DISH_OF = {};                           // raw item -> dish
for (const k of Object.keys(DISHES)) DISH_OF[DISHES[k].from] = k;
export const COOK_DIFF = 0.3;                        // craft XP difficulty of a cook batch

/** [{room, hearth}] of every closed Kitchen with a fire ring in it, in hearth order. */
export function kitchens(sim, hearths) {       // 9.29: a planner passes the hearths it believes in; no list = every furnace in the world (the HUD, tests)
  const out = [];
  if (!sim.rooms.list.size) return out;
  for (const h of hearths || sim.ents.ofKind("furniture")) {
    if (h.f !== "hearth") continue;
    const room = kitchenAt(sim, h);
    if (room) out.push({ room, hearth: h });
  }
  return out;
}
/** The dishes worth cooking right now: [dish] whose raw item has a batch in stock (3 or more of them, so a single berry-sized scrap does not start a fire). */
export function cookable(sv) { return Object.keys(DISHES).filter(k => sv.stock[DISHES[k].from] >= 3); }

/** The extra dishes a kitchen of quality q adds to a batch. */
export const cookBonus = (q) => Math.round(2 * q);

/** The cook verb's work: the carried raw food becomes dishes in the hands (what does not fit is set down for the hauling baseline). Returns null or a blocker. */
export function cookAt(sim, v, h, dish) {
  const D = DISHES[dish], room = kitchenAt(sim, h);
  if (!D || !room) return "NO_STATION";
  if (!h.lit) return "TOO_COLD";
  if (!v.carry || v.carry.item !== D.from || v.carry.n < D.n) return "NO_MATERIAL";
  const q = evalPurpose(sim, room).quality, out = D.n + cookBonus(q);
  carryTake(sim, v, D.n);
  const put = Math.min(out, carryRoom(v, dish));
  carryAdd(sim, v, dish, put);
  if (v.carry) v.carry.q = Math.round(q * 100) / 100;
  if (out > put) dropLoose(sim, dish, out - put, v.x, v.y, v.z);
  gain(sim, v, "craft", 0.3, true, COOK_DIFF);
  sim.cache.iv++;
  once(sim, "firstCooked", "BUILT_FIRST", v.name + " cooked the first meal in a kitchen.", [v.id], {}, 1);
  return null;
}
