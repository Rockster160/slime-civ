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

export const STACK_CAP = 10;       // units per stack (stack size by container tier, §14.5: bare ground)
export const RATION = 0.25;        // hunger restored by one ration (= one adult-day of food, §11.17)

// food: rations per unit. spoil: fraction lost per day (winter value in .w). load: carry weight units.
export const ITEMS = {
  berry: { food: 1, spoil: 0.08, spoilW: 0.03, load: 1, label: "berries", color: "#d1405f" },   // §11.17 raw 8%/day, 3% winter
  dried: { food: 1, spoil: 0.005, spoilW: 0.005, load: 1, label: "dried berries", color: "#8c4a3a" },
  grass: { food: 0, spoil: 0, spoilW: 0, load: 1, label: "grass", color: "#b5e07a" },
  stick: { food: 0, spoil: 0, spoilW: 0, load: 1, label: "sticks", color: "#a67c52" },
  log:   { food: 0, spoil: 0, spoilW: 0, load: 3, label: "logs", color: "#6b4a2a" },
  stone: { food: 0, spoil: 0, spoilW: 0, load: 2, label: "stone", color: "#8d929c" },     // S4a: from digging rock
  dirt:  { food: 0, spoil: 0, spoilW: 0, load: 1, label: "dirt", color: "#8a6a45" },       // S4a: from digging soil
};
export const ITEM_KINDS = ["berry", "dried", "grass", "stick", "log", "stone", "dirt"];

export function newCache() { return { iv: 0, sv: -1, s: null }; }
const bump = (sim) => { sim.cache.iv++; };

export function inZone(z, x, y) { return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1; }
export function zoneCells(z) { return (z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1); }
export function zoneCapacity(z) { return zoneCells(z) * STACK_CAP; }

/** Carry capacity in load units; "small" (GDD §14.7 tier 0): 5..7 by strength. */
export function carryCap(v) { return Math.max(5, Math.round(6 * v.t.strength)); }
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
export function putStack(sim, item, n, x, y, z) {
  const s = stackAt(sim, x, y, z);
  bump(sim);
  if (s) {
    if (s.item !== item) return n;
    const put = Math.min(n, STACK_CAP - s.n);
    s.n += put; return n - put;
  }
  const put = Math.min(n, STACK_CAP);
  sim.ents.add("item", { item, n: put, sp: 0, rv: 0, rt: 0, x, y, z });
  return n - put;
}
/** Loose drop: unlimited per cell (a felled tree's output), so spill over to a second stack on the same cell if needed. */
export function dropLoose(sim, item, n, x, y, z) {
  while (n > 0) {
    let left = putStack(sim, item, n, x, y, z);
    if (left === n) {                       // cell holds another item type: make a separate stack on the cell
      sim.ents.add("item", { item, n: Math.min(n, STACK_CAP), sp: 0, rv: 0, rt: 0, x, y, z }); bump(sim);
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
export const FOOD_RESERVE = 0.25;       // share of stockpile cells only food may open (S4b: a keep-999 logs order filled every cell and starved the larder)
export function storeCell(sim, item, fx, fy) {
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
    (inZone(z, s.x, s.y) ? stock : loose)[s.item] += s.n;
  }
  for (const v of sim.ents.ofKind("villager")) if (v.carry) carried[v.carry.item] += v.carry.n;
  c.s = { stock, loose, carried, rations: stock.berry + stock.dried }; c.sv = c.iv;
  return c.s;
}
/** Everything that exists or is on its way, for standing-order accounting. */
export function haveTotal(sim, item) { const s = survey(sim); return s.stock[item] + s.loose[item] + s.carried[item]; }

/** Daily (tick % DAY === 0): fresh food spoils at its rate, slower in winter (§11.17). */
export function spoilDaily(sim) {
  const winter = seasonIdx(sim.tick) === 3;
  const items = sim.ents.ofKind("item");
  const dead = [];
  for (let i = 0; i < items.length; i++) {
    const s = items[i], d = ITEMS[s.item], rate = winter ? d.spoilW : d.spoil;
    if (rate === 0) continue;
    s.sp += s.n * rate;
    const lose = Math.floor(s.sp);
    if (lose > 0) { s.sp -= lose; s.n -= lose; if (s.n <= 0) dead.push(s.id); }
  }
  for (const id of dead) sim.ents.remove(id);
  bump(sim);
}
