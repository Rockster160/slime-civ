// The heat function as a table (GDD §11.9, K8): every cell layout the GDD names, with the P it gives and the level it lands on.
//   node tests/heat.js
import "./legacy.js";
import assert from "node:assert/strict";
import { heat, levelOf, LEVELS, enclosure, draftFactor, stationHeat } from "../src/sim/heat.js";
import { Sim } from "../src/sim/sim.js";
import { M, F } from "../src/sim/world.js";
import { flatSpot } from "./helpers.js";

const A = "air", W = "wood", S = "stone", SO = "soil", L = "lined", LV = "lid_vent";
// [name, layout, expected P, expected level]
const TABLE = [
  // the levels' "typical source" column
  ["brush fire in the open (1.0)", { fuel: "grass", faces: [A, A, A, A, A] }, 1.0, 1],
  ["open wood fire = hearth (1.6)", { fuel: "stick", faces: [A, A, A, A, A] }, 1.6, 2],
  ["stone-ringed wood fire (1.98)", { fuel: "log", faces: [S, S, S, S, A] }, 1.984, 2],
  ["clay-lined pit, wood, open top = kiln (2.24)", { fuel: "stick", faces: [L, L, L, L, A] }, 2.24, 3],
  // the layouts that reach level 4 (copper smelting)
  ["L4-1 lined pit, open top, charcoal, bellows (4.37)", { fuel: "charcoal", faces: [L, L, L, L, A], draft: { bellows: true } }, 4.368, 4],
  ["L4-2 lined pit, open top, charcoal, windy ridge (4.37)", { fuel: "charcoal", faces: [L, L, L, L, A], draft: { ridge: true } }, 4.368, 4],
  ["L4-3 lined pit + lid with a vent, charcoal (4.35)", { fuel: "charcoal", faces: [L, L, L, L, LV] }, 4.35, 4],
  ["L4-5 unlined soil pit, charcoal, two draft sources (4.46)", { fuel: "charcoal", faces: [SO, SO, SO, SO, A], draft: { bellows: true, ridge: true } }, 4.464, 4],
  // the layouts that stop at level 3 (no closet cheat)
  ["charcoal, open lined pit, no draft (3.36)", { fuel: "charcoal", faces: [L, L, L, L, A] }, 3.36, 3],
  ["charcoal, unlined pit, one draft source (3.87)", { fuel: "charcoal", faces: [SO, SO, SO, SO, A], draft: { bellows: true } }, 3.8688, 3],
  ["charcoal, lined closet with lid and NO vent: sealed (1.80)", { fuel: "charcoal", faces: [L, L, L, L, L] }, 1.8, 2],
  // wood: never 4, and wood faces cap at 2
  ["best wood fire: lined, lidded, vented, bellows, ridge (3.48)", { fuel: "log", faces: [L, L, L, L, LV], draft: { bellows: true, ridge: true } }, 3.48, 3],
  ["a wooden closet is not a furnace: wood faces cap at level 2", { fuel: "charcoal", faces: [W, W, W, W, W], draft: { vent: true } }, 2.4 * 1.2 * 1.25, 2],
  // charcoal burning is a smoulder, not a heat level
  ["charcoal burning: wood in an earth-mounded sealed cell (1.04)", { fuel: "log", faces: [SO, SO, SO, SO, SO] }, 1.04, 1],
  // forge (post-slice)
  ["coal in a lidded, vented, lined furnace with bellows (6.5)", { fuel: "coal", faces: [L, L, L, L, LV], draft: { bellows: true } }, 6.525, 5],
  // S9: iron. Level 5 needs coal AND a second draft source on top of the flue; charcoal never gets there, the lined pit with coal and one draft stops at 4
  ["F5-1 coal, brick forge (lined, lid + flue), bellows (6.53)", { fuel: "coal", faces: [L, L, L, L, LV], draft: { bellows: true } }, 6.525, 5],
  ["F5-2 coal, brick forge on the windy ridge, no bellows (6.53)", { fuel: "coal", faces: [L, L, L, L, LV], draft: { ridge: true } }, 6.525, 5],
  ["F5-3 coal, open lined pit, bellows and ridge (6.3)", { fuel: "coal", faces: [L, L, L, L, A], draft: { bellows: true, ridge: true } }, 6.3, 5],
  ["coal, brick forge, the flue alone (5.44): level 4", { fuel: "coal", faces: [L, L, L, L, LV] }, 5.4375, 4],
  ["coal, open lined pit, one bellows (5.46): level 4", { fuel: "coal", faces: [L, L, L, L, A], draft: { bellows: true } }, 5.46, 4],
  ["charcoal can never reach 5: the best furnace is 5.22", { fuel: "charcoal", faces: [L, L, L, L, LV], draft: { bellows: true } }, 5.22, 4],
  // a fire in a closed room with no vent is smoke-bound
  ["hearth in a smoke-bound room (x0.7)", { fuel: "stick", faces: [A, A, A, A, W], draft: { smoke: true } }, 1.6 * 1.04 * 0.7, 1],
];
for (const [name, lay, P, level] of TABLE) {
  const h = heat(lay);
  assert.ok(Math.abs(h.P - P) < 0.01, `${name}: P ${h.P.toFixed(3)} expected ${P}`);
  assert.equal(h.level, level, `${name}: level ${h.level} (P ${h.P.toFixed(3)}) expected ${level}`);
}
console.log("heat table: " + TABLE.length + " layouts match");

// Thresholds are the GDD's: 0.4 / 1.2 / 2.1 / 4.0 / 5.5.
assert.deepEqual(LEVELS.map(l => l[2]), [0, 0.4, 1.2, 2.1, 4.0, 5.5]);
for (const [p, l] of [[0.39, 0], [0.4, 1], [1.19, 1], [1.2, 2], [2.09, 2], [2.1, 3], [3.99, 3], [4.0, 4], [5.49, 4], [5.5, 5], [9, 5]]) assert.equal(levelOf(p), l, "levelOf " + p);
assert.ok(Math.abs(enclosure(["lined", "lined", "lined", "lined", "air"]) - 1.4) < 1e-9);
assert.ok(draftFactor({ bellows: true, ridge: true, vent: true }, ["air", "air", "air", "air", "air"]) === 1.5, "D is capped at 1.5");

// Heat 4 is reachable by at least two layouts, and wood never gets there.
const four = TABLE.filter(t => t[3] === 4);
assert.ok(four.length >= 2, "level 4 needs >= 2 layouts");
const SIDE_KINDS = ["air", "wood", "soil", "stone", "daub", "lined"], TOP_KINDS = [...SIDE_KINDS, "lid_vent"];   // a vent replaces the lid: only the top face can be one
let woodMax = 0;
for (const a of SIDE_KINDS) for (const b of SIDE_KINDS) for (const t of TOP_KINDS) for (const d of [{}, { bellows: true }, { bellows: true, ridge: true }, { ridge: true }]) {
  woodMax = Math.max(woodMax, heat({ fuel: "log", faces: [a, b, a, b, t], draft: d }).P);
}
assert.ok(woodMax <= 3.48 + 1e-9, "wood never exceeds 3.48: " + woodMax);
for (const a of SIDE_KINDS) for (const b of SIDE_KINDS) {      // any layout with a wood face never reports above level 2
  const h = heat({ fuel: "charcoal", faces: ["wood", a, b, a, "lid_vent"], draft: { bellows: true, ridge: true } });
  assert.ok(h.level <= 2, "wood face + charcoal still capped: " + h.level);
}
const five = TABLE.filter(t => t[3] === 5);
assert.ok(five.length >= 2 && five.every(t => t[1].fuel === "coal"), "level 5 is reachable on two or more layouts, all with coal (the heat table's Forge level)");
let charcoalMax = 0;
for (const a of SIDE_KINDS) for (const t of TOP_KINDS) for (const d of [{}, { bellows: true }, { bellows: true, ridge: true }, { ridge: true }, { vent: true, bellows: true }]) charcoalMax = Math.max(charcoalMax, heat({ fuel: "charcoal", faces: [a, a, a, a, t], draft: d }).P);
assert.ok(charcoalMax < 5.5, "charcoal never reaches level 5: max P " + charcoalMax.toFixed(2));
console.log("level 5 reachable by " + five.length + " coal layouts; charcoal tops out at P " + charcoalMax.toFixed(2));
console.log("level 4 reachable by " + four.length + " layouts; wood tops out at P " + woodMax.toFixed(2));

// Reading the world: an open hearth on the ground is level 2, the same fire on a ridge is still 2 (1.6 x 1.3 = 2.08 < 2.1),
// a lined-looking pit is read through FACE_OF_MAT, a door is a wood face, and a bellows beside it adds draft.
const sim = Sim.create(7, { villagers: 0 });
const [fx, fy, sz] = flatSpot(sim, 5, 5), x = fx + 2, y = fy + 2, z = sz;
const e = { x, y, z: sz };
assert.equal(stationHeat(sim, e, "stick").level, 2, "an open fire on open ground is level 2");
sim.world.set(x, y, sz - 1, M.DIRT, 0);
sim.world.setFlags(x, y, sz - 1, F.RIDGE);
const onRidge = stationHeat(sim, e, "stick");
assert.ok(onRidge.D === 1.3 && onRidge.level === 2, "a ridge adds draft 1.3 (P " + onRidge.P.toFixed(2) + ", still hearth)");
const charRidge = stationHeat(sim, e, "charcoal");
assert.ok(charRidge.level === 3 && Math.abs(charRidge.P - 2.4 * 1.3) < 1e-6, "charcoal on a ridge in the open: 3.12, level 3");
for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sim.world.set(x + dx, y + dy, sz, M.STONEWALL, 0);
const ringed = stationHeat(sim, e, "stick");
assert.ok(Math.abs(ringed.E - 1.24) < 1e-9, "a ring of dry stone: E 1.24");
console.log("station reader ok; heat ok");
void z;
