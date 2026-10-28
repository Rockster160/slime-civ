// Stockpile zones (S17). The main yard (sim.stock, a rectangle round the camp) is where everything is kept; S16 reported that a yard full of food shuts
// non-food keep-N out (the last quarter of its cells is food-only). Two answers:
//
//   EXTRA ZONES  the player draws more stockpile zones in build mode (the Stockpile tool): sim.zones = {n, list:[{id, x0,y0,x1,y1,z, f}]}, saved and hashed.
//                f is a filter: "all" | "food" | "mat" (materials: everything that is not food). items.js storeCell prefers a zone whose filter names the item
//                (a walk of STORE_PULL cells is worth it); inStore() counts a zone's cells as stock, so survey, keep-N, spoilage and hauling just work.
//                  {type:"zone", op:"add", x0,y0,x1,y1,z, f?}   {op:"remove", id}   {op:"filter", id, f}
//                Removing a zone leaves its items on the ground: loose stacks are hauled to the remaining stores.
//   THE RING     every YARD_PERIOD ticks, a main yard that has shut non-food out (its free cells are down to the food reserve) grows by one ring, if every cell
//                of the ring is free land (walkable, nothing on it but loose items, no player-built cell, no other zone, field or pen), up to MAX_YARD per side.
//                The ring is symmetric, so the camp centre (CAMP) does not move.
import { M, F } from "./world.js";
import { inZone, zoneCells, anyStackAt, FOOD_RESERVE } from "./items.js";
import { penAt } from "./farm.js";

export const MAX_ZONE = 12;            // longest side of a drawn zone
export const MAX_ZONES = 8;
export const MAX_YARD = 14;            // the main yard stops growing at this many cells a side
export const YARD_PERIOD = 200;
export const FILTERS = ["all", "food", "mat"];

export function newZones() { return { n: 0, list: [] }; }

const rect = (c) => ({ x0: Math.min(c.x0, c.x1), y0: Math.min(c.y0, c.y1), x1: Math.max(c.x0, c.x1), y1: Math.max(c.y0, c.y1), z: c.z });
const overlaps = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
function fail(sim, why) { sim.lastBlocker = why; return false; }

/** Is this cell free land for a stockpile: standable, nothing but loose items on it, nothing built, and in no other zone, field, pen or cellar? */
export function yardFree(sim, x, y, z, skip) {
  const w = sim.world;
  if (!w.isWalkable(x, y, z) || (w.flags(x, y, z - 1) & F.PLAYER) || (w.flags(x, y, z) & F.PLAYER)) return false;
  const m = w.mat(x, y, z - 1);
  if (m === M.WATER) return false;
  for (const id of sim.ents.at(x, y, z)) { const e = sim.ents.get(id); if (e.kind !== "item" && e.kind !== "villager" && e.kind !== "fauna") return false; }
  if (sim.zones) for (const q of sim.zones.list) if (q !== skip && q.z === z && inZone(q, x, y)) return false;
  if (sim.farm) {
    const c = sim.farm.cellar;
    if (c && c.z === z && inZone(c, x, y)) return false;
    if (penAt(sim, x, y, z)) return false;
    for (const f of sim.farm.fields) if (f.z === z && inZone(f, x, y)) return false;
  }
  return true;
}

export const ZONE_COMMANDS = {
  zone(sim, c) {
    sim.lastBlocker = "";
    const zs = sim.zones;
    if (c.op === "remove") {
      const i = zs.list.findIndex(q => q.id === c.id);
      if (i < 0) return fail(sim, "NO_TARGET");
      zs.list.splice(i, 1); sim.cache.iv++; sim.board.ep++;
      return true;
    }
    if (c.op === "filter") {
      const q = zs.list.find(q => q.id === c.id);
      if (!q || !FILTERS.includes(c.f)) return fail(sim, "NO_TARGET");
      q.f = c.f; sim.cache.iv++; sim.board.ep++;
      return true;
    }
    if (c.op !== "add" || ![c.x0, c.y0, c.x1, c.y1, c.z].every(Number.isInteger)) return false;
    const r = rect(c), f = FILTERS.includes(c.f) ? c.f : "all";
    if (r.x1 - r.x0 + 1 > MAX_ZONE || r.y1 - r.y0 + 1 > MAX_ZONE) return fail(sim, "TOO_BIG");
    if (zs.list.length >= MAX_ZONES) return fail(sim, "TOO_BIG");
    if (sim.stock.z === r.z && overlaps(sim.stock, r)) return fail(sim, "NO_SITE");
    let n = 0;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (yardFree(sim, x, y, r.z)) n++;
    if (n < (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1)) return fail(sim, "NO_SITE");          // every cell must be free land: a zone with holes would strand carriers
    zs.list.push({ id: ++zs.n, ...r, f });
    sim.cache.iv++; sim.board.ep++;
    return true;
  },
};

/** Every YARD_PERIOD ticks: a main yard that has shut non-food out grows by one ring when the land round it is free. -> true when it grew */
export function yardTick(sim) {
  const z = sim.stock, side = Math.max(z.x1 - z.x0, z.y1 - z.y0) + 1;
  if (side + 2 > MAX_YARD) return false;
  let empties = 0;
  for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) if (!anyStackAt(sim, x, y, z.z)) empties++;
  if (empties > Math.floor(FOOD_RESERVE * zoneCells(z))) return false;                       // still room for everything
  for (let y = z.y0 - 1; y <= z.y1 + 1; y++) for (let x = z.x0 - 1; x <= z.x1 + 1; x++) {
    if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) continue;
    if (!yardFree(sim, x, y, z.z)) return false;
  }
  z.x0--; z.y0--; z.x1++; z.y1++;
  sim.cache.iv++; sim.board.ep++;
  return true;
}
