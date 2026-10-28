// Village-level state of the job board (GDD §09): the demand vector, the
// village-level critical-need flags with hysteresis, and standing orders.
// Stored as sim.board (saved + hashed). Everything here is recomputed on a
// cadence from world state, then READ by jobs.js when villagers decide.
//
//   board = { ep, fc, sc, uvf, uvs, fneed, runway, dem:{food,shelter,rack,preserve}, keeps:[{item,n,on}] }
//   ep  epoch: bumps whenever a flag/order changes so villagers re-plan at once
//   fc  food-critical flag   uvf its urgency u_v   fneed jobs it may open
//   sc  shelter-critical     uvs                   runway = effective food days per head
import { DAY, DAYS_PER_YEAR } from "./clock.js";
import { clamp } from "./util.js";
import { dayF, WINTER_START, winterAhead, coldAhead, forecastMin } from "./season.js";
import { survey, haveTotal, inZone, zoneCapacity, ITEM_KINDS, ITEMS, storeCell } from "./items.js";
import { dailyNeed, isAdult } from "./villager.js";
import { World, M } from "./world.js";
import { log } from "./chronicle.js";

export const FOOD_YIELD = 2.5;             // rations per forager-day (§11.17: 2.0-2.8)
export const CRIT_BASE = 2;                // days of food per head below which food is village-critical (§09)
export const CRIT_WINTER = 18;             // extra days demanded as winter approaches (C1: no winter forage, no fire)
export const HYST = 0.5;                   // release at critical + 0.5 (§09: 2 -> 2.5)
export const BED_COST = { item: "grass", n: 4 };     // §11.17 says grass x6; 4 keeps it inside a 5-load hand
export const RACK_COST = { item: "stick", n: 5 };
export const COLD_SHELTER = 0.30;          // §09: shelter is critical when warmth < 0.30 now or within 5 days
export const KEEP_LOW = 0.8;               // standing orders refill below 80% of N, stop at 100% (§09, R7)

export function newBoard() {
  return { ep: 1, fc: 0, sc: 0, uvf: 0, uvs: 0, fneed: 0, sneed: 0, runway: 99, dem: { food: 0, shelter: 0, rack: 0, preserve: 0 }, keeps: [], crisisT: -99999, racksWanted: 1, sg: 0, ag: 0 };
}

/** Furniture and sites, cached per (tick, item version): derived data, never saved. */
export function village(sim) {
  const c = sim.cache;
  if (c.vt === sim.tick && c.vv === c.iv && c.vl) return c.vl;
  const beds = [], racks = [], sites = [], vs = sim.ents.ofKind("villager");
  for (const f of sim.ents.ofKind("furniture")) { if (f.f === "bed") beds.push(f); else if (f.f === "rack") racks.push(f); }
  for (const s of sim.ents.ofKind("site")) sites.push(s);
  for (const s of sim.ents.ofKind("csite")) if (s.w === "bed" || s.w === "rack") sites.push({ what: s.w, id: s.id });   // player ghosts count as beds on the way
  let need = 0, adults = 0;
  for (const v of vs) { need += dailyNeed(sim, v); if (isAdult(sim, v)) adults++; }
  c.vl = { beds, racks, sites, n: vs.length, adults, need };
  c.vt = sim.tick; c.vv = c.iv;
  return c.vl;
}

export const CAMP = (z) => ({ x: (z.x0 + z.x1) >> 1, y: (z.y0 + z.y1) >> 1 });

// ---- sites -----------------------------------------------------------------

const RING = [];
for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) RING.push([dx, dy]);
RING.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);

/** The simple site picker (R8): nearest free walkable cell around the stockpile, beds hugging it, racks a step further out. */
export function findSite(sim, what) {
  const z = sim.stock, c = CAMP(z), minR = what === "bed" ? 4 : 5;
  for (const [dx, dy] of RING) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < minR) continue;
    const x = c.x + dx, y = c.y + dy, sz = sim.world.standZ(x, y);
    if (sz < 0 || Math.abs(sz - z.z) > 1 || sim.ents.at(x, y, sz).length) continue;
    return [x, y, sz];
  }
  return null;
}

/** Cells you can stand on beside water (drink spots), cached once: terrain, not flags, decides it. */
export function waterEdges(sim) {
  if (sim.cache.edges) return sim.cache.edges;
  const w = sim.world, out = [];
  for (let y = 1; y < 127; y++) for (let x = 1; x < 127; x++) {
    const z = w.standZ(x, y);
    if (z < 0) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (w.mat(nx, ny, z - 1) === M.WATER || w.mat(nx, ny, z - 2) === M.WATER) { out.push([x, y, z]); break; }
    }
  }
  return (sim.cache.edges = out);
}

// ---- board update ------------------------------------------------------------

/** Every 20 ticks: recompute runway, village-critical flags and the demand vector (§09). */
export function updateBoard(sim) {
  const b = sim.board, vl = village(sim), s = survey(sim), t = sim.tick;
  const wa = winterAhead(t), n = vl.n;
  if (n === 0) return;
  // Effective runway: fresh food spoils, so as winter nears only part of it counts as banked.
  const eff = (s.stock.dried + s.stock.berry * (1 - 0.6 * wa)) / Math.max(0.01, vl.need);
  b.runway = Math.round(Math.min(99, eff) * 100) / 100;
  const critT = CRIT_BASE + CRIT_WINTER * wa;

  if (!b.fc && eff < critT) {
    b.fc = 1; b.ep++;
    if (eff < CRIT_BASE && t - b.crisisT > DAY * 10) {
      b.crisisT = t;
      log(sim, "DISASTER", "Food is running short: about " + eff.toFixed(1) + " days left in the stockpile.", [], { runway: b.runway }, 2);
    }
  } else if (b.fc && eff >= critT + HYST) { b.fc = 0; b.ep++; }
  b.uvf = Math.round(clamp((critT - eff) / (0.75 * critT), 0, 1) * 100) / 100;
  const d = dayF(t);
  const horizon = d < WINTER_START ? Math.max(3, WINTER_START - d) : 3;
  const deficit = Math.max(0, (critT + HYST) * vl.need - eff * vl.need);
  // Hands needed = feeding everyone today + closing the deficit over the horizon (§09: ceil(deficit / yield)).
  b.fneed = Math.max(1, Math.min(Math.max(1, vl.adults), Math.max(Math.ceil(vl.adults * 0.75), Math.ceil((deficit / horizon + vl.need) / FOOD_YIELD))));

  // Shelter: a bed (or a bed on its way) for everyone, urgent when it is or is about to be cold.
  let pendingBeds = 0;
  for (const st of vl.sites) if (st.what === "bed") pendingBeds++;
  // Adults own a bed; two children share one (they sleep with a parent).
  const missing = Math.max(0, vl.adults + Math.ceil((n - vl.adults) / 2) - vl.beds.length - pendingBeds);
  // §09: warmth < 0.30 now or within 5 days - plus, since C1 villagers build beds by hand, once the winter look-ahead is well under way.
  const cold = forecastMin(t) < COLD_SHELTER || wa >= 0.6;
  const sc = cold && missing > 0 ? 1 : 0;
  if (sc !== b.sc) { b.sc = sc; b.ep++; }
  b.uvs = Math.round(clamp(missing / n, 0, 1) * 100) / 100;
  b.sneed = missing;

  // Demand vector (K3): food, shelter, rack, preserve in 0..1.
  const target = 3 + 22 * wa;
  b.dem.food = Math.round(clamp((target - eff) / target, 0, 1) * 100) / 100;
  b.dem.shelter = Math.round(clamp(missing / n * (1 + coldAhead(t)), 0, 1) * 100) / 100;
  const racksWanted = Math.max(1, Math.ceil(vl.adults / 4));
  let pendingRacks = 0;
  for (const st of vl.sites) if (st.what === "rack") pendingRacks++;
  b.dem.rack = vl.racks.length + pendingRacks < racksWanted ? Math.round(clamp(0.3 + 0.7 * wa, 0, 1) * 100) / 100 : 0;
  b.dem.preserve = vl.racks.length && s.stock.berry >= 5 ? Math.round(clamp(s.stock.berry / (1.5 * Math.max(1, vl.need)), 0, 1) * 100) / 100 : 0;
  b.racksWanted = racksWanted;
}

/** Every 200 ticks: standing orders keep-N with hysteresis (refill below 80%, stop at 100%). */
export function updateKeeps(sim) {
  const b = sim.board;
  for (const k of b.keeps) {
    const have = haveTotal(sim, k.item);
    // Nowhere left to put it (the last cells are reserved for food): the order idles instead of felling trees for nothing.
    const room = ITEMS[k.item].food > 0 || storeCell(sim, k.item, 0, 0) !== null;
    if (!k.on && room && have < k.n * KEEP_LOW) { k.on = 1; b.ep++; }
    else if (k.on && !room) { k.on = 0; b.ep++; }
    else if (k.on && have >= k.n) { k.on = 0; b.ep++; }
  }
}
