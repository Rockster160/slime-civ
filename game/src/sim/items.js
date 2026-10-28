// Items and the stockpile (GDD §14.5, §11.17).
//
// An item is a STACK entity {kind:"item", item, n, sp, x,y,z}: n is an integer
// count, sp the fractional spoilage carried between days. One item type per
// cell. The stockpile is one rectangular zone (sim.stock = {x0,y0,x1,y1,z});
// stacks inside it are "in stock", stacks anywhere else are "loose" (a felled
// tree's logs, a dead villager's load) and get hauled in by the baseline
// hauling behaviour. Villagers carry one item type by hand ({item,n}) up to
// a small load (carryCap).
//
// Every change goes through the helpers here so `sim.cache.iv` (a version for
// derived data, never saved) moves with it.
import { DAY } from "./clock.js";
import { seasonIdx } from "./season.js";
import { pt } from "./depth.js";
import { World } from "./world.js";
import { storageRoomAt, storageMul, evalPurpose } from "./purposes.js";

export const STACK_CAP = 10;       // units per stack (stack size by container tier, §14.5: bare ground)
export const PACK_CAP = { basket: 3, backpack: 6 };   // S9: extra carry capacity worn (GDD §14.7: hand -> basket -> backpack); gear.js hands them out
export const RATION = 0.25;        // hunger restored by one ration (= one adult-day of food, §11.17)

// food: rations per unit. spoil: fraction lost per day (winter value in .w). load: carry weight units.
export const ITEMS = {
  berry: { food: 1, spoil: 0.08, spoilW: 0.03, load: 1, label: "berries", color: "#d1405f", seed: 1 },   // §11.17 raw 8%/day, 3% winter
  dried: { food: 1, spoil: 0.005, spoilW: 0.005, load: 1, label: "dried berries", color: "#8c4a3a" },
  grass: { food: 0, spoil: 0, spoilW: 0, load: 1, label: "grass", color: "#b5e07a" },
  stick: { food: 0, spoil: 0, spoilW: 0, load: 1, label: "sticks", color: "#a67c52" },
  log:   { food: 0, spoil: 0, spoilW: 0, load: 3, label: "logs", color: "#6b4a2a" },
  stone: { food: 0, spoil: 0, spoilW: 0, load: 2, label: "stone", color: "#8d929c" },     // S4a: from digging rock
  dirt:  { food: 0, spoil: 0, spoilW: 0, load: 1, label: "dirt", color: "#8a6a45" },       // S4a: from digging soil
  tuber: { food: 1, spoil: 0.02, spoilW: 0.01, load: 1, label: "tubers", color: "#d9b98a", seed: 1 },   // S6: keeps better than berries (Appendix B foods)
  flint: { food: 0, spoil: 0, spoilW: 0, load: 1, label: "flint", color: "#4a5570" },        // S6: nodules from the soft rock
  clay:  { food: 0, spoil: 0, spoilW: 0, load: 2, label: "clay", color: "#c4704e" },         // S6: stream-bank clay
  malachite: { food: 0, spoil: 0, spoilW: 0, load: 2, label: "malachite", color: "#28be78" },   // S6: copper ore
  // S7b: the clay -> charcoal -> copper chain (products; `made` = shown in the stock bars only once the village has some)
  fired_clay: { food: 0, spoil: 0, spoilW: 0, load: 2, label: "fired clay", color: "#b8613f", made: 1 },
  jar:        { food: 0, spoil: 0, spoilW: 0, load: 2, label: "clay jars", color: "#a8552f", made: 1 },
  charcoal:   { food: 0, spoil: 0, spoilW: 0, load: 1, label: "charcoal", color: "#3a3a42", made: 1 },
  copper:     { food: 0, spoil: 0, spoilW: 0, load: 1, label: "copper ingots", color: "#d98a4a", made: 1 },
  copper_pick: { food: 0, spoil: 0, spoilW: 0, load: 2, label: "copper picks", color: "#e0a060", made: 1 },
  // S8: game and weapons
  hopper_meat: { food: 2, spoil: 0.12, spoilW: 0.04, load: 1, label: "hopper meat", color: "#c0605a", made: 1 },     // two rations a piece: a hopper (3) is most of a villager-day and a half; raw spoils fast, cooked at a fire it is better
  copper_spear: { food: 0, spoil: 0, spoilW: 0, load: 2, label: "copper spears", color: "#f0b070", made: 1 },
  // S9 (GDD §15.7 rows 2-4, 6, 8, 10-12): stone, hide and fibre, timber, brick, smoke, cast and iron work
  hide:       { food: 0, spoil: 0.03, spoilW: 0.01, load: 2, label: "raw hides", color: "#b89a74", made: 1 },       // a raw hide rots unless it is worked
  cordage:    { food: 0, spoil: 0, spoilW: 0, load: 1, label: "cordage", color: "#d8c690", made: 1 },
  leather:    { food: 0, spoil: 0, spoilW: 0, load: 1, label: "worked hide", color: "#9a6b44", made: 1 },
  backpack:   { food: 0, spoil: 0, spoilW: 0, load: 2, label: "backpacks", color: "#8a5a38", made: 1 },
  basket:     { food: 0, spoil: 0, spoilW: 0, load: 2, label: "baskets", color: "#c9a85c", made: 1 },
  smoked_meat: { food: 2, spoil: 0.01, spoilW: 0.004, load: 1, label: "smoked meat", color: "#8f4a3c", made: 1 },     // the winter larder: an eighth the spoilage of raw meat
  block:      { food: 0, spoil: 0, spoilW: 0, load: 3, label: "dressed stone", color: "#b4b8c4", made: 1 },
  stone_axe:  { food: 0, spoil: 0, spoilW: 0, load: 2, label: "stone axes", color: "#9aa0ac", made: 1 },
  timber:     { food: 0, spoil: 0, spoilW: 0, load: 3, label: "timber", color: "#a8743c", made: 1 },
  brick:      { food: 0, spoil: 0, spoilW: 0, load: 2, label: "bricks", color: "#b6523a", made: 1 },
  mould:      { food: 0, spoil: 0, spoilW: 0, load: 2, label: "clay moulds", color: "#a05a40", made: 1 },
  copper_axe: { food: 0, spoil: 0, spoilW: 0, load: 2, label: "copper axes", color: "#e8a060", made: 1 },
  cast_pick:  { food: 0, spoil: 0, spoilW: 0, load: 2, label: "cast copper picks", color: "#eeb070", made: 1 },
  sheet:      { food: 0, spoil: 0, spoilW: 0, load: 1, label: "copper sheet", color: "#e09a58", made: 1 },
  fitting:    { food: 0, spoil: 0, spoilW: 0, load: 1, label: "copper fittings", color: "#d88848", made: 1 },
  iron_ore:   { food: 0, spoil: 0, spoilW: 0, load: 3, label: "iron ore", color: "#9a4e38", made: 1 },
  coal:       { food: 0, spoil: 0, spoilW: 0, load: 2, label: "coal", color: "#2a2a30", made: 1 },
  iron:       { food: 0, spoil: 0, spoilW: 0, load: 2, label: "iron", color: "#8c94a4", made: 1 },
  iron_pick:  { food: 0, spoil: 0, spoilW: 0, load: 2, label: "iron picks", color: "#a8b0c0", made: 1 },
  iron_axe:   { food: 0, spoil: 0, spoilW: 0, load: 2, label: "iron axes", color: "#b0b8c8", made: 1 },
  // S14 (GDD §15.7 R13 alternates): salt and salted meat, rack-dried meat, peat and dried peat, marsh herb and its remedy, bone and the bone axe
  salt:        { food: 0, spoil: 0, spoilW: 0, load: 1, label: "salt", color: "#e6e6e0" },
  salted_meat: { food: 2, spoil: 0.008, spoilW: 0.003, load: 1, label: "salted meat", color: "#c98a80", made: 1 },     // a tenth the spoilage of raw meat: the other winter larder
  dried_meat:  { food: 2, spoil: 0.014, spoilW: 0.006, load: 1, label: "dried meat", color: "#a8625a", made: 1 },       // wind-dried strips: keeps well, not as well as salt or smoke
  peat:        { food: 0, spoil: 0, spoilW: 0, load: 2, label: "wet peat", color: "#5c422e" },
  dried_peat:  { food: 0, spoil: 0, spoilW: 0, load: 1, label: "dried peat", color: "#7a5a3c", made: 1 },
  herb:        { food: 0, spoil: 0.05, spoilW: 0.02, load: 1, label: "marsh herb", color: "#8fb84a" },
  herbal_remedy: { food: 0, spoil: 0.01, spoilW: 0.005, load: 1, label: "herbal remedies", color: "#6fc07a", made: 1 },
  bone:        { food: 0, spoil: 0, spoilW: 0, load: 1, label: "bone", color: "#e3dcc8" },
  bone_axe:    { food: 0, spoil: 0, spoilW: 0, load: 2, label: "bone axes", color: "#d9d0b8", made: 1 },
  // S15: dishes cooked in a kitchen (kitchen.js: `cooked` = counts as a cooked meal for the sick), wheels, and the two wagons (entities, wagon.js: counted in the survey, never a stack)
  cooked_meat: { food: 3, spoil: 0.04, spoilW: 0.015, load: 1, label: "cooked meat", color: "#a04a38", made: 1, cooked: 1 },
  baked_tuber: { food: 1.5, spoil: 0.015, spoilW: 0.007, load: 1, label: "baked tubers", color: "#c99a5a", made: 1, cooked: 1 },
  wheel:       { food: 0, spoil: 0, spoilW: 0, load: 2, label: "wheels", color: "#a8743c", made: 1 },
  wagon:       { food: 0, spoil: 0, spoilW: 0, load: 0, label: "wagons", color: "#b88a4c", made: 1, ent: 1 },
  cart:        { food: 0, spoil: 0, spoilW: 0, load: 0, label: "animal carts", color: "#c89a5c", made: 1, ent: 1 },
};
export const ITEM_KINDS = ["berry", "dried", "tuber", "grass", "stick", "log", "stone", "dirt", "flint", "clay", "malachite", "fired_clay", "jar", "charcoal", "copper", "copper_pick", "copper_spear", "hopper_meat",
  "hide", "cordage", "leather", "backpack", "basket", "smoked_meat", "block", "stone_axe", "timber", "brick", "mould", "copper_axe", "cast_pick", "sheet", "fitting", "iron_ore", "coal", "iron", "iron_pick", "iron_axe",
  "salt", "salted_meat", "dried_meat", "peat", "dried_peat", "herb", "herbal_remedy", "bone", "bone_axe",
  "cooked_meat", "baked_tuber", "wheel", "wagon", "cart"];

export function newCache() { return { iv: 0, sv: -1, s: null }; }
const bump = (sim) => { sim.cache.iv++; };

export function inZone(z, x, y) { return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1; }
/** S10: is a cell part of the village's stores: the stockpile, or the cold cellar (food is carried there once one is designated)? */
export function inStore(sim, x, y, z) {
  if (inZone(sim.stock, x, y)) return true;
  const c = sim.farm && sim.farm.cellar;
  if (c && z === c.z && inZone(c, x, y)) return true;
  return sim.rooms.list.size > 0 && !!storageRoomAt(sim, x, y, z);          // S15: a closed Storage room is a stockpile too
}
/**
 * S15: the slots a closed Storage room offers `item`: [[x, y, z, has]] (has = 1 when a same-item stack there has room). A cell holding furniture other than a shelf,
 * another item, or a full stack is not a slot. Room order, then cell order: deterministic.
 */
export function storageSlots(sim, item) {
  const out = [];
  for (const r of sim.rooms.all()) {
    if (r.purpose !== "storage" || !r.enclosed) continue;
    for (const c of r.cells) {
      const [x, y, z] = World.xyz(c);
      let ok = true, has = 0;
      const ids = sim.ents.at(x, y, z);
      for (let i = 0; i < ids.length && ok; i++) {
        const e = sim.ents.get(ids[i]);
        if (e.kind === "item") { if (e.item !== item || e.n >= STACK_CAP) ok = false; else has = 1; }
        else if (e.kind === "furniture") { if (e.f !== "shelf") ok = false; }
        else if (e.kind !== "villager") ok = false;
      }
      if (ok) out.push([x, y, z, has]);
    }
  }
  return out;
}
export function zoneCells(z) { return (z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1); }
export function zoneCapacity(z) { return zoneCells(z) * STACK_CAP; }

/** Carry capacity in load units; "small" (GDD §14.7 tier 0): 5..7 by strength. */
export function carryCap(v) { const hands = Math.max(5, Math.round(6 * v.t.strength)) + (v.pk ? PACK_CAP[v.pk] || 0 : 0); return v.wgc ? Math.max(hands, v.wgc) : hands; }      // S9: + a basket (3) or a backpack (6)
export function carryLoad(v) { return v.carry ? v.carry.n * ITEMS[v.carry.item].load : 0; }
/** How many more units of `item` fit in v's hands (0 if hands hold something else). */
export function carryRoom(v, item) {
  if (v.carry && v.carry.item !== item) return 0;
  return Math.floor((carryCap(v) - carryLoad(v)) / ITEMS[item].load);
}
export function carryAdd(sim, v, item, n) {
  if (n <= 0) return;
  if (v.carry) v.carry.n += n; else v.carry = { item, n };
  bump(sim);
}
export function carryTake(sim, v, n) {
  v.carry.n -= n;
  if (v.carry.n <= 0) v.carry = null;
  bump(sim);
}

export function stackAt(sim, x, y, z, item) {
  const ids = sim.ents.at(x, y, z);
  for (let i = 0; i < ids.length; i++) {
    const e = sim.ents.get(ids[i]);
    if (e.kind === "item" && (item === undefined || e.item === item)) return e;
  }
  return null;
}
export function anyStackAt(sim, x, y, z) { return stackAt(sim, x, y, z, undefined); }

/** Put `n` of an item on the ground at a cell (merging with a same-item stack). Returns units NOT placed (stack full). */
export function putStack(sim, item, n, x, y, z, q) {
  const s = stackAt(sim, x, y, z);
  bump(sim);
  if (s) {
    if (s.item !== item) return n;
    const put = Math.min(n, STACK_CAP - s.n);
    if (q !== undefined && put > 0) s.q = Math.round(((s.q === undefined ? q : s.q) * s.n + q * put) / (s.n + put) * 100) / 100;      // S7b: a made item's quality averages over the stack
    s.n += put; return n - put;
  }
  const put = Math.min(n, STACK_CAP);
  sim.ents.add("item", q === undefined ? { item, n: put, sp: 0, rv: 0, rt: 0, x, y, z } : { item, n: put, sp: 0, rv: 0, rt: 0, x, y, z, q });
  return n - put;
}
/** Loose drop: unlimited per cell (a felled tree's output), so spill over to a second stack on the same cell if needed. */
export function dropLoose(sim, item, n, x, y, z, q) {
  while (n > 0) {
    let left = putStack(sim, item, n, x, y, z, q);
    if (left === n) {                       // cell holds another item type: make a separate stack on the cell
      sim.ents.add("item", q === undefined ? { item, n: Math.min(n, STACK_CAP), sp: 0, rv: 0, rt: 0, x, y, z } : { item, n: Math.min(n, STACK_CAP), sp: 0, rv: 0, rt: 0, x, y, z, q }); bump(sim);
      left = n - Math.min(n, STACK_CAP);
    }
    n = left;
  }
}
export function takeFromStack(sim, s, n) {
  s.n -= n; bump(sim);
  if (s.n <= 0) sim.ents.remove(s.id);
}

/** Put into the stockpile, filling same-item stacks first, then empty cells. Returns units not placed. */
export function storeInZone(sim, item, n) {
  const z = sim.stock;
  for (let y = z.y0; y <= z.y1 && n > 0; y++) for (let x = z.x0; x <= z.x1 && n > 0; x++) {
    const s = stackAt(sim, x, y, z.z, item);
    if (s && s.n < STACK_CAP) n = putStack(sim, item, n, x, y, z.z);
  }
  for (let y = z.y0; y <= z.y1 && n > 0; y++) for (let x = z.x0; x <= z.x1 && n > 0; x++) {
    if (!anyStackAt(sim, x, y, z.z)) n = putStack(sim, item, n, x, y, z.z);
  }
  return n;
}
/** Nearest stockpile cell that can take at least one more of `item`, or null. */
export const STORE_PULL = 12;         // S15: how many cells of walking a Storage room is worth for food (and, for anything else, how much worse than the yard it is)
export const FOOD_RESERVE = 0.25;       // share of stockpile cells only food may open (S4b: a keep-999 logs order filled every cell and starved the larder)
export function storeCell(sim, item, fx, fy) {
  const cz = sim.farm && sim.farm.cellar;
  if (cz && ITEMS[item].food > 0) {                                    // S10: food goes to the cold cellar while it has room (it spoils slower there)
    let best = null, bd = 1e9;
    for (let y = cz.y0; y <= cz.y1; y++) for (let x = cz.x0; x <= cz.x1; x++) {
      const s = anyStackAt(sim, x, y, cz.z);
      if (s && (s.item !== item || s.n >= STACK_CAP)) continue;
      const d = Math.abs(x - fx) + Math.abs(y - fy) - (s ? 0.5 : 0);
      if (d < bd) { bd = d; best = [x, y, cz.z]; }
    }
    if (best) return best;
  }
  const z = sim.stock;
  let best = null, bd = 1e9, empties = 0;
  const spots = [];
  for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) {
    const s = anyStackAt(sim, x, y, z.z);
    if (!s) empties++;
    if (s && (s.item !== item || s.n >= STACK_CAP)) continue;
    spots.push([x, y, s ? 1 : 0]);
  }
  const closed = ITEMS[item].food === 0 && empties <= Math.floor(FOOD_RESERVE * zoneCells(z));     // the last cells are for food: non-food may only top up its own stacks
  for (const [x, y, has] of spots) {
    if (closed && !has) continue;
    const d = Math.abs(x - fx) + Math.abs(y - fy) - (has ? 0.5 : 0);     // prefer topping up an existing stack
    if (d < bd) { bd = d; best = [x, y, z.z]; }
  }
  if (sim.rooms.list.size) {                                                // S15: a Storage room keeps food better, so food goes there first; anything else when the yard has no place
    const food = ITEMS[item].food > 0 || ITEMS[item].spoil > 0;
    for (const [x, y, sz, has] of storageSlots(sim, item)) {
      const d = Math.abs(x - fx) + Math.abs(y - fy) - (has ? 0.5 : 0) + (food ? -STORE_PULL : best ? STORE_PULL : 0);
      if (d < bd) { bd = d; best = [x, y, sz]; }
    }
  }
  return best;
}

/**
 * Totals, cached per item-version: {stock, loose, carried} each {item: n}, plus
 * food rations in stock. Derived data - not saved, recomputed on demand.
 */
export function survey(sim) {
  const c = sim.cache;
  if (c.sv === c.iv && c.s) return c.s;
  const stock = {}, loose = {}, carried = {};
  for (const k of ITEM_KINDS) { stock[k] = 0; loose[k] = 0; carried[k] = 0; }
  const z = sim.stock, items = sim.ents.ofKind("item");
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    (inStore(sim, s.x, s.y, s.z) ? stock : loose)[s.item] += s.n;
  }
  for (const v of sim.ents.ofKind("villager")) if (v.carry) carried[v.carry.item] += v.carry.n;
  for (const w of sim.ents.ofKind("wagon")) stock[w.t]++;                                       // S15: a wagon is a thing the village has (a keep-N counts it)
  c.s = { stock, loose, carried, rations: stock.berry + stock.dried + stock.tuber + ITEMS.hopper_meat.food * stock.hopper_meat + ITEMS.smoked_meat.food * stock.smoked_meat + 2 * (stock.salted_meat + stock.dried_meat) + Math.round(3 * stock.cooked_meat + 1.5 * stock.baked_tuber) }; c.sv = c.iv;
  return c.s;
}
/** Everything that exists or is on its way, for standing-order accounting. */
export function haveTotal(sim, item) { const s = survey(sim); return s.stock[item] + s.loose[item] + s.carried[item]; }

/**
 * Daily (tick % DAY === 0): food and hides spoil at the item's rate (slower in winter, §11.17), and the storage changes the number (§14.6):
 * food in the cold cellar spoils at CELLAR_X of the rate, and every clay jar in the stores covers JAR_HOLD units of food at JAR_X (both stack).
 * The losses are tallied in sim.farm.sp (the Village panel shows them); what the modifiers saved is tallied beside them.
 */
export const CELLAR_X = 0.4;       // a cellar (cold, dark, underground) keeps food at 40% of the open rate
export const JAR_X = 0.25;         // food sealed in a jar: a quarter of the rate (grain in a clay jar 0.2%/day against 8% raw, §11.17)
export const JAR_HOLD = 6;         // units of food one jar covers
export function spoilDaily(sim) {
  const winter = seasonIdx(sim.tick) === 3, sp = sim.farm.sp;
  const items = sim.ents.ofKind("item"), dead = [], lost = {};
  let jars = 0;
  for (let i = 0; i < items.length; i++) if (items[i].item === "jar" && inStore(sim, items[i].x, items[i].y, items[i].z)) jars += items[i].n;
  let cover = jars * JAR_HOLD, saved = 0;
  const sprouts = [], rq = new Map();
  for (let i = 0; i < items.length; i++) {
    const s = items[i], d = ITEMS[s.item], base = winter ? d.spoilW : d.spoil;
    if (base === 0) continue;
    const stored = inStore(sim, s.x, s.y, s.z), cel = stored && sim.farm.cellar && s.z === sim.farm.cellar.z;
    const room = stored && !cel && sim.rooms.list.size ? storageRoomAt(sim, s.x, s.y, s.z) : null;
    let rmul = 1;
    if (room) { if (!rq.has(room)) rq.set(room, storageMul(evalPurpose(sim, room).quality)); rmul = rq.get(room); }          // S15: a Storage room keeps what is in it a little longer
    let eff = base * (cel ? CELLAR_X : 1) * rmul * (d.food > 0 ? pt(sim, s.item === "hopper_meat" || s.item === "smoked_meat" || s.item === "salted_meat" || s.item === "dried_meat" ? "spoil_meat" : "spoil_plant") : 1);       // S14: this world's own spoil rates (+-10%)
    if (d.food > 0 && stored && cover > 0) { const c = Math.min(s.n, cover); cover -= c; eff = (eff * (s.n - c) + eff * JAR_X * c) / s.n; }
    s.sp += s.n * eff;
    const lose = Math.floor(s.sp);
    saved += s.n * base - s.n * eff;
    if (lose > 0) {
      s.sp -= lose; s.n -= lose; lost[s.item] = (lost[s.item] || 0) + lose;
      if (d.seed) sprouts.push([s.item, lose, s.x, s.y, s.z]);
      if (s.n <= 0) dead.push(s.id);
    }
  }
  for (const id of dead) sim.ents.remove(id);
  sp.d = lost; sp.sv = Math.round((sp.sv + saved) * 100) / 100;
  for (const k of Object.keys(lost)) sp.t[k] = (sp.t[k] || 0) + lost[k];
  sim.cache.sprouts = sprouts;                                          // rotted seed near the camp may sprout where it lay (farm.js sproutDaily: the sight that teaches farming)
  bump(sim);
}
