// Job-board unit tests (GDD §09): the "stamp during a food dip" case, personal
// needs beating orders, blockers on rejected candidates, and the shape of v.why.
//   node game/tests/jobs.js
import "./legacy.js";
import assert from "node:assert/strict";
import { Sim } from "../src/sim/sim.js";
import { putStack } from "../src/sim/items.js";
import { isAdult } from "../src/sim/villager.js";
import { plan } from "../src/sim/jobs.js";
import { readStock } from "../src/sim/belief.js";
import { hutCells } from "./bots/shelter_plan.js";
import { flatSpot, clearArea } from "./helpers.js";

function setStock(sim, berry, dried) {
  for (const it of sim.ents.ofKind("item").slice()) sim.ents.remove(it.id);
  const z = sim.stock;
  let x = z.x0;
  for (let left = berry; left > 0; left -= 10) putStack(sim, "berry", Math.min(10, left), x++, z.y0, z.z);
  for (let left = dried; left > 0; left -= 10) putStack(sim, "dried", Math.min(10, left), x++, z.y0, z.z);
  sim.cache.iv++;
}
function addBeds(sim) {            // everyone housed, so shelter-critical (cold spring landing) stays out of the food contest
  let k = 0;
  for (const v of sim.ents.ofKind("villager")) {
    const b = sim.ents.add("furniture", { f: "bed", x: 56 + (k++ % 4), y: 58 + (k >> 2), z: sim.world.standZ(56 + ((k - 1) % 4), 58 + ((k - 1) >> 2)), owner: v.id, rv: 0, rt: 0 });
    v.bed = b.id;
  }
  sim.cache.iv++;
}
/** 9.30: demand is local, so the food contest below needs every slime to have READ the larder (they are told it, as if they were all at the yard). */
const readLarder = (sim) => { for (const v of sim.ents.ofKind("villager")) if (v.bel) { readStock(sim, v.bel, null, sim.tick, true); v.rp = 1; } };
const nearestTree = (sim) => sim.ents.ofKind("plant").filter(p => p.species === "tree")
  .sort((a, b) => Math.abs(a.x - 64) + Math.abs(a.y - 64) - Math.abs(b.x - 64) - Math.abs(b.y - 64))[0];
const classes = (sim) => {
  const c = {};
  for (const v of sim.ents.ofKind("villager")) { const k = v.job && v.action ? v.job.c + ":" + v.job.k : "-"; c[k] = (c[k] || 0) + 1; }
  return c;
};

// ---- 1. stamp during a food dip: food workers stay on food while an order is outstanding ----
{
  const sim = Sim.create(5);
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  addBeds(sim);
  setStock(sim, 8, 0);                                          // ~1.1 days for 7 villagers: below the 2-day line
  sim.apply({ type: "order", ids: adults.map(v => v.id), verb: "chop", tid: nearestTree(sim).id });
  // Keep every need comfortably met so only the food/order contest is measured.
  const settle = () => { for (const v of sim.ents.ofKind("villager")) { v.hunger = 0.7; v.thirst = 0.9; v.energy = 0.95; v.mood = 0.9; } };
  let foodWorkers = 0, orderWorkers = 0, maxFood = 0, orderSeen = 0;
  for (let i = 0; i < 400; i++) {
    if (i % 10 === 0) settle();
    sim.step();
    if (sim.tick % 20 === 0) { setStock(sim, 8, 0); readLarder(sim); }          // hold the dip: the larder stays low while we watch
    const c = classes(sim);
    foodWorkers = (c["vcrit:forage"] || 0) + (c["vcrit:dry"] || 0);
    orderWorkers = c["order:chop"] || 0;
    maxFood = Math.max(maxFood, foodWorkers);
    orderSeen = Math.max(orderSeen, orderWorkers);
    if (process.env.DBG && i % 40 === 0) console.log(i, JSON.stringify(c));
  }
  assert.equal(sim.board.fc, 1, "food runway under 2 days should set the village-critical food flag");
  assert.ok(sim.board.fneed >= 1, "fneed should be positive");
  // 9.30: the hands come from what each slime believes (its larder reading, the bushes it knows), not from the board's fneed; the rack's derived chop takes some of them
  assert.ok(maxFood >= 3, `peak food workers ${maxFood} (board fneed ${sim.board.fneed}, HUD truth)`);
  const ordered = sim.ents.ofKind("villager").filter(v => v.order || v.as).length;
  assert.equal(ordered, adults.length, "the order is still outstanding on everyone (orders are not cancelled, only out-ranked)");
  assert.ok(sim.ents.ofKind("villager").filter(v => (v.order || v.as) && v.why.cls === "vcrit" && v.job.g === "food").length >= 1, "ordered villagers are on village-critical food jobs");
  const f = sim.ents.ofKind("villager").find(v => v.job && v.job.c === "vcrit");
  assert.ok(f.why && f.why.cls === "vcrit" && f.why.score >= 350, "Why record of a food worker should say village-critical");
  console.log(`stamp-during-food-dip ok: runway ${sim.board.runway} d, fneed ${sim.board.fneed}, ${foodWorkers} on food, ${orderWorkers} on the order, ${JSON.stringify(classes(sim))}`);

  // Food recovers past the release line: the hands return to the order.
  setStock(sim, 0, 90);
  for (let i = 0; i < 400; i++) { if (i % 10 === 0) settle(); if (i % 20 === 0) readLarder(sim); sim.step(); }
  assert.equal(sim.board.fc, 0, "flag should release once runway passes critical + 0.5");
  const c = classes(sim);
  assert.equal((c["vcrit:forage"] || 0) + (c["vcrit:dry"] || 0), 0, "no village-critical food jobs after release: " + JSON.stringify(c));
  console.log("release ok:", JSON.stringify(c));
}

// ---- 1b. the same example with REAL stamps: ten huts stamped during a food dip (GDD §09 worked example) ----
{
  const sim = Sim.create(5);
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  addBeds(sim);
  const mats = (n) => { const zs = sim.stock; for (const [item, row] of [["stick", 4], ["grass", 5]]) for (let k = 0; k < n; k++) putStack(sim, item, 10, zs.x0 + k, zs.y0 + row, zs.z); sim.cache.iv++; };
  const keepDip = () => { for (const it of sim.ents.ofKind("item").slice()) if (it.item === "berry" || it.item === "dried") sim.ents.remove(it.id); putStack(sim, "berry", 8, sim.stock.x0, sim.stock.y0, sim.stock.z); sim.cache.iv++; };
  keepDip(); mats(6);
  for (let i = 0; i < 10; i++) {                    // ten huts on flat ground around the basin: "stamp x10"
    const [x, y, zz] = flatSpot(sim, 4, 4);
    clearArea(sim, x, y, 4, 4, zz);
    sim.apply({ type: "build", cells: hutCells(zz, x, y, 4, 4, 1) });
  }
  assert.ok(sim.ents.ofKind("csite").length >= 100, "stamp x10 placed ghosts: " + sim.ents.ofKind("csite").length);
  const settle = () => { for (const v of sim.ents.ofKind("villager")) { v.hunger = 0.7; v.thirst = 0.9; v.energy = 0.95; v.mood = 0.9; v.warm = 1; } };
  let maxFood = 0, builders = 0, orderBuilders = 0;
  for (let i = 0; i < 500; i++) {
    if (i % 10 === 0) settle();
    sim.step();
    if (sim.tick % 20 === 0) { keepDip(); readLarder(sim); }
    const f = sim.ents.ofKind("villager").filter(v => v.job && v.action && v.job.c === "vcrit" && v.job.g === "food").length;
    maxFood = Math.max(maxFood, f);
    for (const v of sim.ents.ofKind("villager")) if (v.job && v.action && v.job.k === "build_site") { builders++; if (v.job.c !== "standing") orderBuilders++; }
  }
  if (process.env.DBG) console.log("1b", JSON.stringify(classes(sim)), "adults", adults.length, "fneed", sim.board.fneed);
  assert.equal(sim.board.fc, 1, "food critical during the dip");
  assert.ok(maxFood >= 3, `food workers ${maxFood} (board fneed ${sim.board.fneed}, HUD truth)`);
  assert.equal(orderBuilders, 0, "stamp jobs are derived, standing class - never an order");
  console.log(`stamp-x10-during-food-dip ok: ${maxFood} on food (need ${sim.board.fneed}), ${builders} builder-ticks at standing class; ${sim.ents.ofKind("csite").length} pieces still waiting`);
  // the larder recovers: now the stamp gets built
  const before = sim.ents.ofKind("csite").length;
  for (const it of sim.ents.ofKind("item").slice()) if (it.item === "berry") sim.ents.remove(it.id);
  for (let k = 0; k < 6; k++) putStack(sim, "dried", 10, sim.stock.x0 + k, sim.stock.y0, sim.stock.z);
  sim.cache.iv++;
  for (let i = 0; i < 2500; i++) { if (i % 10 === 0) settle(); sim.step(); }
  assert.ok(sim.ents.ofKind("csite").length < before, "builders get to work once food is safe: " + before + " -> " + sim.ents.ofKind("csite").length);
  console.log("stamp release ok:", before, "->", sim.ents.ofKind("csite").length, "pieces");
}

// ---- 2. a starving villager eats despite an order; a fed one keeps the order ----
{
  const sim = Sim.create(6);
  addBeds(sim);
  setStock(sim, 40, 0);
  const [a, b] = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  sim.apply({ type: "order", ids: [a.id, b.id], verb: "chop", tid: nearestTree(sim).id });
  for (const v of sim.ents.ofKind("villager")) { v.thirst = 0.9; v.energy = 0.95; v.mood = 0.9; v.hunger = 0.8; }
  a.hunger = 0.10;                                              // u ~ 0.94: 400u beats an order (<= 345)
  for (let i = 0; i < 60; i++) sim.step();
  assert.equal(a.why.cls, "need", "starving villager should be on a personal need: " + JSON.stringify(a.why));
  assert.equal(a.why.job, "eat");
  assert.equal(b.why.cls, "order", "fed villager keeps the order: " + JSON.stringify(b.why));
  const rej = b.why.rej.map(r => r.blocker);
  assert.ok(b.why.rej.length >= 1 && rej.every(x => typeof x === "string" && x.length), "rejected alternatives carry blockers");
  console.log("need-beats-order ok:", a.why.job, "(" + a.why.cls + ")", "vs", b.why.job, "(" + b.why.cls + ")");
}

// ---- 3. blockers: no bed material -> NO_MATERIAL; why record shape ----
{
  const sim = Sim.create(7);
  const v = sim.ents.ofKind("villager")[0];
  let cands = null;
  plan(sim, v, false, (c) => { cands = c; });
  assert.ok(cands.length > 0);
  for (const c of cands) assert.ok(typeof c.score === "number" && c.parts, "every candidate is scored");
  const w = v.why;
  for (const k of ["job", "cls", "score", "parts", "rej", "t"]) assert.ok(k in w, "why." + k);
  for (const k of ["base", "urg", "fit", "prox", "path", "pref", "tmp", "sw"]) assert.ok(k in w.parts, "why.parts." + k);
  assert.ok(w.rej.length <= 3);
  console.log("why shape ok:", JSON.stringify(w).slice(0, 200));
}
console.log("jobs ok");
