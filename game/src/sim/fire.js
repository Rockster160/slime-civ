// Fire in the world (GDD §11.8, §11.9, §15.7 row 1): burning trees and smouldering stumps (flame entities, made by events.js),
// and the hearth (fire ring) the village builds once FIRE_TENDING is known.
//
//   flame  = {kind:"flame", src:"tree"|"smoulder", x,y,z, tid (the tree), fuel (ticks left), heat (level)}
//   hearth = furniture {f:"hearth", x,y,z, owner:0, rv:0, rt:0, fuel (ticks of burn left), lit 0|1, fi (last fuel item), hl (heat level now)}
//
// A lit hearth warms the cells around it (fireBonus: up to FIRE_WARM by its heat level, fading over FIRE_R cells) and, in an enclosed
// room, the whole room (ROOM_FIRE). Warmth is read by villager.updateNeeds beside the room insulation bonus, so a fire visibly
// lowers the cold drain without any new need. Everything is integer ticks and + - * /.
import { DAY } from "./clock.js";
import { heat, stationHeat } from "./heat.js";
import { tempAt, coldAhead, winterAhead } from "./season.js";
import { burnDown } from "./plants.js";
import { log } from "./chronicle.js";
import { kitchenAt, evalPurpose, KITCHEN_EAT } from "./purposes.js";

export const BURN_TREE = 2 * DAY;            // a lightning-struck tree burns for two days ...
export const BURN_SMOULDER = 2 * DAY;        // ... then smoulders as a stump for two more
export const FUEL_TICKS = { grass: 300, stick: 900, log: 2400, dried_peat: 1700 };       // S14: dried peat burns like wood, a little shorter than a log   // burn time one unit gives a hearth (a log lasts most of a day and a night)
export const HEARTH_CAP = 3600;              // a hearth holds two days of fire
export const FUEL_LOW = 1200;                // villagers top it up when it falls below this and a fire is wanted
export const FIRE_R = 5;                     // cells over which a hearth warms the open air
export const FIRE_WARM = [0, 0.18, 0.30, 0.38, 0.40, 0.40];   // warmth bonus at the fire by heat level (level 2 open hearth = +0.30 against a comfort threshold of 0.30)
export const ROOM_FIRE = [0, 0.20, 0.26, 0.30, 0.30, 0.30];   // bonus for everyone in the same enclosed room (on top of the room's insulation)
export const COOK_R = 8;                     // eating within this many cells of a lit hearth counts as cooked food
export const MEAT_COOK = 1.5;                 // S8: raw meat is poor food; cooked at a fire ring it gives half again (hopper meat "can be cooked at the hearth")
export const COOK_BONUS = 1.3;               // cooked berries / tubers give 30% more (best guess, §14.3 "cooked at a hearth")
export const HEARTH_WANT_PRESSURE = 0.2;     // the village builds a hearth when the warm pressure reaches this

const FLAME_LAYOUT = { tree: { fuel: "log", faces: ["air", "air", "air", "air", "air"] }, smoulder: { fuel: "log", faces: ["soil", "soil", "soil", "soil", "soil"] } };
/** Heat level of a flame source, from the same function as every other fire (open burning tree = 2, earth-covered smoulder = 1). */
export function flameLevel(src) { return heat(FLAME_LAYOUT[src] || FLAME_LAYOUT.tree).level; }

export function flames(sim) { return sim.ents.ofKind("flame"); }
export function hearths(sim) {
  const out = [];
  for (const f of sim.ents.ofKind("furniture")) if (f.f === "hearth") out.push(f);
  return out;
}
export function litHearths(sim) {
  const out = [];
  for (const f of sim.ents.ofKind("furniture")) if (f.f === "hearth" && f.lit) out.push(f);
  return out;
}
export function anyFire(sim) { return flames(sim).length > 0 || litHearths(sim).length > 0; }

/** A tree catches (lightning, or the debug command): a flame entity on its cell; villagers stop chopping it. */
export function igniteTree(sim, tree) {
  tree.burn = 1; tree.rv = 0;
  const f = sim.ents.add("flame", { src: "tree", x: tree.x, y: tree.y, z: tree.z, tid: tree.id, fuel: BURN_TREE, heat: flameLevel("tree"), t0: sim.tick });
  sim.cache.iv++; sim.board.ep++;
  return f;
}
/** A stump smoulders under its mound (the systemic "smouldering stump" event, or a burnt-down tree). */
export function smoulderAt(sim, stump) {
  const f = sim.ents.add("flame", { src: "smoulder", x: stump.x, y: stump.y, z: stump.z, tid: stump.id, fuel: BURN_SMOULDER, heat: flameLevel("smoulder"), t0: sim.tick });
  sim.cache.iv++;
  return f;
}

/** Every 20 ticks: flames burn down (tree -> stump -> smouldering -> out), hearths burn their fuel and refresh their heat level. */
export function fireTick(sim) {
  for (const f of flames(sim).slice()) {
    if (sim.world.dormantAt(f.x, f.y)) continue;                     // S17: frozen until somebody comes back (dormant.js puts it out)
    f.fuel -= 20;
    if (f.fuel > 0) continue;
    const p = sim.ents.get(f.tid);
    if (f.src === "tree") {
      sim.ents.remove(f.id);
      if (p) { burnDown(sim, p); smoulderAt(sim, p); log(sim, "MILESTONE", "The burning tree has fallen in on itself and smoulders.", [], { x: f.x, y: f.y }, 0); }
    } else sim.ents.remove(f.id);
  }
  for (const h of hearths(sim)) {
    if (sim.world.dormantAt(h.x, h.y)) continue;
    if (h.fuel > 0) h.fuel = Math.max(0, h.fuel - 20);
    const lit = h.fuel > 0 ? 1 : 0;
    if (lit !== h.lit) { h.lit = lit; sim.cache.iv++; }
    h.hl = lit ? hearthLevel(sim, h) : 0;
  }
}

/** Heat level of a lit hearth from the cells around it (stationHeat): open ground 2, a ringed pit more, a closed room 1 (smoke-bound). */
export function hearthLevel(sim, h) {
  return stationHeat(sim, h, h.fi === "grass" ? "grass" : h.fi === "dried_peat" ? "dried_peat" : "log").level;
}

/** Warmth a lit fire gives a villager at (x,y,z): the strongest of the hearths and flames, in the same room or within FIRE_R cells. */
export function fireBonus(sim, v) {
  let best = 0;
  const hs = sim.ents.ofKind("furniture"), fl = sim.ents.ofKind("flame");
  let room = null, roomSet = false;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    if (h.f !== "hearth" || !h.lit || Math.abs(h.z - v.z) > 1) continue;
    const lv = h.hl;
    if (!roomSet) { room = sim.rooms.at(v.x, v.y, v.z); roomSet = true; }
    const hr = sim.rooms.at(h.x, h.y, h.z);
    let b;
    if (hr && hr.enclosed && hr === room) b = ROOM_FIRE[lv];
    else {
      const d = Math.max(Math.abs(h.x - v.x), Math.abs(h.y - v.y));
      b = d <= FIRE_R ? FIRE_WARM[lv] * (1 - d / (FIRE_R + 1)) : 0;
    }
    if (b > best) best = b;
  }
  for (let i = 0; i < fl.length; i++) {                   // a burning tree warms whoever stands close, but nobody sleeps there
    const f = fl[i], d = Math.max(Math.abs(f.x - v.x), Math.abs(f.y - v.y));
    if (d <= 3 && Math.abs(f.z - v.z) <= 1) best = Math.max(best, FIRE_WARM[f.heat] * (1 - d / 4));
  }
  return best;
}

/** The bonus of the fire in `room` for everyone inside (the room inspector and the Warmth overlay show it). */
export function roomFire(sim, room) {
  let best = 0;
  for (const h of sim.ents.ofKind("furniture")) {
    if (h.f !== "hearth" || !h.lit) continue;
    if (sim.rooms.at(h.x, h.y, h.z) === room) best = Math.max(best, ROOM_FIRE[h.hl]);
  }
  return best;
}

/** Is a lit hearth within COOK_R of this cell? Food eaten there is cooked. */
export function nearFire(sim, x, y, z) {
  for (const h of sim.ents.ofKind("furniture")) {
    if (h.f === "hearth" && h.lit && Math.abs(h.x - x) <= COOK_R && Math.abs(h.y - y) <= COOK_R && Math.abs(h.z - z) <= 1) return h;
  }
  return null;
}
export function cookMul(sim, v, item) {
  const h = nearFire(sim, v.x, v.y, v.z);
  if (!h) return 1;
  let m = item === "berry" || item === "tuber" || item === "hopper_meat" ? (item === "hopper_meat" ? MEAT_COOK : COOK_BONUS) : 1;
  const k = sim.rooms.list.size ? kitchenAt(sim, h) : null;
  if (k) m *= 1 + KITCHEN_EAT * evalPurpose(sim, k).quality;             // S15: a meal eaten by a kitchen's fire is worth more, the better the room
  return m;
}

/** Is a fire wanted now? It is cold now (night included) or the next days look cold. */
export function fireWanted(sim) {
  const a = sim.disc.ask;                                                          // S7b: while the player has asked villagers to investigate, a fire is kept lit to try things at
  return tempAt(sim.tick) < 0.55 || coldAhead(sim.tick) > 0 || winterAhead(sim.tick) > 0.5 || !!(a && a.until > sim.tick);
}

/** Add fuel to a hearth from a carried item; returns units used. Waste (familiarity < 0.3) shortens the burn. */
export function addFuel(h, item, n, waste, mul = 1) {
  const each = Math.round(FUEL_TICKS[item] * (1 - waste) * mul);               // mul = this world's property for the fuel (depth.js)
  let used = 0;
  while (used < n && h.fuel + each <= HEARTH_CAP + each / 2) { h.fuel = Math.min(HEARTH_CAP, h.fuel + each); used++; }
  if (used) { h.lit = 1; h.fi = item; }
  return used;
}
export const FUEL_ITEMS = ["log", "stick", "grass", "dried_peat"];

/** S9: how well a lit fire beside a covered rack smokes what hangs in it: the level of the hottest lit hearth within SMOKE_R cells (0 = none). */
export const SMOKE_R = 3;
export function smokeFire(sim, e) {
  let lv = 0;
  for (const h of sim.ents.ofKind("furniture")) if (h.f === "hearth" && h.lit && Math.abs(h.x - e.x) <= SMOKE_R && Math.abs(h.y - e.y) <= SMOKE_R && Math.abs(h.z - e.z) <= 1 && h.hl > lv) lv = h.hl;
  return lv;
}
