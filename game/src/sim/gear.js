// S9: what villagers wear and hold. Carry tiers (GDD §14.7: hand -> basket -> backpack), the pick tiers (copper -> cast -> iron, the last digs
// deep rock), and whether a tool exists anywhere in the village.
//
//   v.pk   "basket" | "backpack" | undefined   worn; raises the carry capacity (items.js carryCap). A backpack is hide + cordage, a basket is cordage + sticks.
//   v.eq   {item, u, q}                         the one tool slot (pick or spear), see craft.js / tasks.js equip.
import { survey } from "./items.js";

export const PACKS = ["backpack", "basket"];                  // best first
/** Digging tools, by tier: speed multiplier and the cells dug before wearing out at quality 0 and 1. Only a tier-3 tool opens deep rock. */
export const PICKS = {
  copper_pick: { rate: 1.6, uses: [40, 120], tier: 1 },
  cast_pick:   { rate: 1.9, uses: [60, 160], tier: 2 },
  iron_pick:   { rate: 2.4, uses: [120, 320], tier: 3 },
};
export const PICK_BEST = ["iron_pick", "cast_pick", "copper_pick"];
export const SPEAR_USES = 30;

/** Is one of this tool in the stockpile or in somebody's hand? (Cheap: survey is cached.) */
export function toolAround(sim, item) {
  if (survey(sim).stock[item] > 0) return true;
  for (const v of sim.ents.ofKind("villager")) if (v.eq && v.eq.item === item) return true;
  return false;
}

/** The best pick in the stockpile (or "" ). `need` restricts to exactly that item (deep rock wants an iron pick). */
export function bestPick(sim, need) {
  const st = survey(sim).stock;
  for (const k of need ? [need] : PICK_BEST) if (st[k] > 0) return k;
  return "";
}

/** Every 100 ticks: someone passing the stockpile with nothing on picks up a backpack (or a basket) if they wear none; a better one replaces a worse one. */
export function packTick(sim) {
  const st = survey(sim).stock;
  if (!(st.backpack > 0 || st.basket > 0)) return;
  const z = sim.stock;
  for (const v of sim.ents.ofKind("villager")) {
    if (v.slp === 1 || v.carry || v.z !== z.z) continue;
    if (v.x < z.x0 - 3 || v.x > z.x1 + 3 || v.y < z.y0 - 3 || v.y > z.y1 + 3) continue;
    const have = v.pk ? PACKS.indexOf(v.pk) : 99;
    for (const k of PACKS) {
      if (PACKS.indexOf(k) >= have) break;
      const stack = sim.ents.ofKind("item").find(s => s.item === k && s.n > 0 && s.x >= z.x0 && s.x <= z.x1 && s.y >= z.y0 && s.y <= z.y1);
      if (!stack) continue;
      if (v.pk) { sim.ents.add("item", { item: v.pk, n: 1, sp: 0, rv: 0, rt: 0, x: v.x, y: v.y, z: v.z }); }   // the old one is set down (hauled back in)
      stack.n--; if (stack.n <= 0) sim.ents.remove(stack.id);
      v.pk = k; sim.cache.iv++;
      break;
    }
  }
}
