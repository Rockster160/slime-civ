// Wagons and animal carts (GDD §14.7 transport tiers, S15; hand -> basket -> backpack -> wagon -> animal cart; no belts or drones, D3).
//
//   wagon = entity {kind:"wagon", t:"wagon"|"cart", x,y,z, rv, rt, dr (the villager pushing it, 0 = free), an (a cart's grazer id), tr (trips made)}
//   A wagon is made at the workbench (recipes wheel / wagon / cart, craft.js; FRAMING) and stands where it was left. A villager on a long haul (jobs.js genHaul)
//   hitches a free one (v.wg = its id, v.wgc = its load capacity: items.js carryCap reads it), walks with it, picks up several loose stacks, drops them in
//   the store and unhitches it there. Pushed, it slows the walker (WAGON.drag), and more off flat ground (a step up or down); a cart's grazer pulls it faster.
//   A cart is pulled by a penned grazer (husbandry.js), which must be fed: the pen's trough must hold fodder and its animals must not be hungry, and every trip eats a little.
import { once } from "./chronicle.js";
const penById = (sim, id) => sim.farm.pens.find(p => p.id === id) || null;      // (farm.js imports a good deal more than the walk step may)

export const WAGON = {
  wagon: { label: "Wagon", cap: 30, drag: 1.4, rough: 2.2 },           // pushed by one villager: carries ~5x a pair of hands, walks 40% slower on the flat
  cart:  { label: "Animal cart", cap: 48, drag: 0.85, rough: 1.5 },    // pulled by a penned grazer: faster than walking on the flat, and carries more
};
export const WAGON_FAR = 14;          // a loose stack this far (cells) from the nearest store is a long haul: worth hitching a wagon for
export const WAGON_NEAR = 40;         // and the wagon must be within this many cells of the villager
export const BATCH_R = 8;             // stacks of the same item within this many cells of the first are picked up on the same trip
export const BATCH_MAX = 6;
export const CART_FODDER = 1;         // trough units a cart's trip eats

export const WAGON_OUT = { wagon: "wagon", cart: "cart" };       // recipe output -> wagon type (these are made as entities, not items)
export const wagons = (sim) => sim.ents.ofKind("wagon");
export const wagonOf = (sim, v) => (v.wg ? sim.ents.get(v.wg) || null : null);

/** A new wagon standing on a free walkable cell next to (x,y,z) (the bench it was made at). */
export function spawnWagon(sim, t, x, y, z) {
  let at = [x, y, z];
  for (let d = 1; d <= 2; d++) {
    let found = null;
    for (let dy = -d; dy <= d && !found; dy++) for (let dx = -d; dx <= d && !found; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const cx = x + dx, cy = y + dy;
      if (sim.world.isWalkable(cx, cy, z) && !sim.ents.at(cx, cy, z).length) found = [cx, cy, z];
    }
    if (found) { at = found; break; }
  }
  const w = sim.ents.add("wagon", { t, x: at[0], y: at[1], z: at[2], rv: 0, rt: 0, dr: 0, an: 0, tr: 0 });
  sim.cache.iv++;
  return w;
}

/** A cart's grazer: the one it is assigned to if that is still a penned grazer, else the first unassigned penned grazer in a finished pen (and it is then assigned). -> {e, pen} | null. */
export function cartAnimal(sim, w, assign = true) {
  const ok = (e) => e && e.kind === "fauna" && e.sp === "grazer" && e.tame && e.pen && penById(sim, e.pen) && penById(sim, e.pen).built;
  let e = w.an ? sim.ents.get(w.an) : null;
  if (!ok(e)) {
    e = null;
    const taken = new Set(wagons(sim).filter(q => q !== w && q.an).map(q => q.an));
    for (const g of sim.ents.ofKind("fauna")) if (g.sp === "grazer" && ok(g) && !taken.has(g.id)) { e = g; break; }
    if (e && assign) w.an = e.id; else if (!e && assign) w.an = 0;
  }
  return e ? { e, pen: penById(sim, e.pen) } : null;
}
/** Can this wagon be used now? -> "" (yes) | "NO_ANIMAL" (a cart with no penned grazer) | "NO_FODDER" (its grazer's pen has no fodder, or its animals are hungry). */
export function wagonReady(sim, w) {
  if (w.t !== "cart") return "";
  const a = cartAnimal(sim, w, false);
  if (!a) return "NO_ANIMAL";
  return a.pen.fod >= CART_FODDER && !a.pen.hg ? "" : "NO_FODDER";
}
/** The wagon a villager on a long haul would take: the nearest free, ready one within WAGON_NEAR (carts before wagons at equal distance). null when none. */
export function freeWagon(sim, v, reservedByOther) {
  let best = null, bd = 1e9;
  for (const w of wagons(sim)) {
    if ((w.dr && w.dr !== v.id) || reservedByOther(sim, w, v.id) || wagonReady(sim, w)) continue;
    const d = Math.abs(w.x - v.x) + Math.abs(w.y - v.y) + 2 * Math.abs(w.z - v.z) - (w.t === "cart" ? 3 : 0);
    if (d < bd && d <= WAGON_NEAR) { bd = d; best = w; }
  }
  return best;
}

export function hitch(sim, v, w) {
  v.wg = w.id; v.wgc = WAGON[w.t].cap; w.dr = v.id;
  if (w.t === "cart") cartAnimal(sim, w);
  sim.cache.iv++;
}
export function unhitch(sim, v) {
  const w = wagonOf(sim, v);
  if (w) w.dr = 0;
  delete v.wg; delete v.wgc;
  sim.cache.iv++;
}
/** A hauling trip ended with the load in the store: a cart's trip eats fodder, the trip is counted, the first is a chronicle line. */
export function tripDone(sim, v, w) {
  w.tr++;
  if (w.t === "cart") { const a = cartAnimal(sim, w, false); if (a) a.pen.fod = Math.max(0, a.pen.fod - CART_FODDER); }
  once(sim, "firstHaul_" + w.t, "MILESTONE", v.name + " made the first long haul with the " + WAGON[w.t].label.toLowerCase() + ".", [v.id], {}, 1);
}

/**
 * Called by the walk step (actions.js) when the villager `ent` has just stepped from level z0 to its cell: the wagon comes along, and the next step takes longer
 * (the wagon's drag; more when the step changed level). Returns the multiplier on the ticks per cell.
 */
export function wagonStep(sim, ent, z0) {
  const w = sim.ents.get(ent.wg);
  if (!w) { delete ent.wg; delete ent.wgc; return 1; }
  sim.ents.move(w, ent.x, ent.y, ent.z);
  const row = WAGON[w.t];
  return ent.z !== z0 ? row.rough : row.drag;
}
