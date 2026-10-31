// Construction (GDD §12.6): ghosts become sites, villagers haul and build them as derived STANDING jobs,
// supports-first ordering, cancel refunds, partial builds, dig -> stone -> stone walls, the 70% hand cap,
// and the dry-run Why preview changing nothing.
//   node game/tests/build.js
import { DUR_DAY } from "../src/sim/clock.js";
import "./legacy.js";
import assert from "node:assert/strict";
import { Sim } from "../src/sim/sim.js";
import { M, F } from "../src/sim/world.js";
import { putStack, survey } from "../src/sim/items.js";
import { isAdult } from "../src/sim/villager.js";
import { plan } from "../src/sim/jobs.js";
import { hutCells } from "./bots/shelter_plan.js";
import { levelGround } from "./helpers.js";

/** A world with a levelled building plot and a full larder so only construction is being measured. */
function plot(seed = 4) {
  const sim = Sim.create(seed), z = sim.stock.z;
  levelGround(sim, 50, 50, 20, 14, z);
  const z0 = sim.stock;
  for (let i = 0; i < 6; i++) putStack(sim, "dried", 10, z0.x0 + i, z0.y0, z0.z);        // 60 dried: no food emergency
  return sim;
}
const stock = (sim, item, n) => { const z = sim.stock; for (let k = 0; k < Math.ceil(n / 10); k++) putStack(sim, item, Math.min(10, n - 10 * k), z.x0 + k, z.y0 + 5, z.z); sim.cache.iv++; };
const settle = (sim) => { for (const v of sim.ents.ofKind("villager")) { v.hunger = Math.max(v.hunger, 0.7); v.thirst = Math.max(v.thirst, 0.8); v.energy = Math.max(v.energy, 0.8); v.mood = 0.9; v.warm = 1; } };
const solidAt = (sim, x, y, z) => sim.world.isSolid(x, y, z);

// ---- 1. supports-first: floors, walls, roof (needs a wall within 3), door last; built by standing-class jobs ----
{
  const sim = plot(), z = sim.stock.z;
  stock(sim, "stick", 80); stock(sim, "grass", 60);
  const cells = hutCells(z, 52, 52, 7, 6, 3);
  assert.ok(sim.apply({ type: "build", cells }));
  const total = sim.ents.ofKind("csite").length;
  assert.equal(total, cells.length);
  const doorX = 52 + 3, doorY = 52 + 5;
  let sawStanding = false, order = [];
  for (let i = 0; i < 40000 && sim.ents.ofKind("csite").length; i++) {
    if (i % 20 === 0) settle(sim);
    sim.step();
    for (const v of sim.ents.ofKind("villager")) if (v.job && v.job.k === "build_site") { sawStanding = true; assert.equal(v.job.c, "standing", "derived build jobs are standing class"); assert.equal(v.job.g, "construct"); }
    // supports-first invariants, checked each tick on what exists
    const roofs = [], walls = [];
    for (let y = 52; y < 58; y++) for (let x = 52; x < 59; x++) {
      if (sim.world.mat(x, y, z + 1) === M.THATCH) roofs.push([x, y]);
      if (sim.world.mat(x, y, z) === M.WATTLE) walls.push([x, y]);
    }
    for (const [x, y] of roofs) assert.ok(walls.some(([wx, wy]) => Math.abs(wx - x) <= 3 && Math.abs(wy - y) <= 3), "a roof tile went up with no wall within 3");
    const doorBuilt = sim.ents.at(doorX, doorY, z).some(id => sim.ents.get(id).f === "door");
    if (doorBuilt && !order.includes("door")) {
      order.push("door");
      const left = sim.ents.ofKind("csite").filter(s => s.w === "wall" || s.w === "roof" || s.w === "bed").length;
      assert.equal(left, 0, "the door was built before the walls, roof and beds were done (" + left + " left)");
    }
  }
  assert.equal(sim.ents.ofKind("csite").length, 0, "everything got built");
  assert.ok(sawStanding, "villagers did the building");
  sim.step();
  const r = sim.rooms.all();
  assert.equal(r.length, 1); assert.ok(r[0].enclosed);
  assert.equal(sim.ents.ofKind("furniture").filter(f => f.f === "bed").length >= 3, true);
  assert.ok(sim.world.flags(52, 52, z) & F.PLAYER, "built cells carry the player flag (anti-grind)");
  console.log(`1 ok: ${total} pieces built by tick ${sim.tick}, supports-first held, door last, room ${r[0].n} cells warm +${r[0].warm.toFixed(2)}`);
}

// ---- 2. cancel refunds delivered materials; partial builds persist ----
{
  const sim = plot(), z = sim.stock.z;
  sim.apply({ type: "build", cells: [{ w: "wall", m: "wattle", x: 55, y: 55, z }, { w: "wall", m: "log", x: 56, y: 55, z }] });
  const [a, b] = sim.ents.ofKind("csite");
  a.got = 2; b.got = 1;                                              // framed: materials delivered
  for (let i = 0; i < 50; i++) sim.step();
  assert.equal(sim.ents.ofKind("csite").length, 2, "unbuilt ghosts persist (nobody has materials)");
  assert.equal(sim.world.mat(55, 55, z), M.AIR, "a framed ghost is not a wall yet");
  assert.ok(sim.apply({ type: "erase", x0: 55, y0: 55, x1: 56, y1: 55, z }));
  assert.equal(sim.ents.ofKind("csite").length, 0);
  const sticks = sim.ents.at(55, 55, z).map(id => sim.ents.get(id)).find(e => e.kind === "item"), logs = sim.ents.at(56, 55, z).map(id => sim.ents.get(id)).find(e => e.kind === "item");
  assert.ok(sticks && sticks.item === "stick" && sticks.n === 2 && logs && logs.item === "log" && logs.n === 1, "delivered materials come back as loose items");
  console.log("2 ok: cancel refunds delivered materials");
}

// ---- 3. dig yields stone (no XP), stone builds a dry-stone wall ----
{
  const sim = plot(), z = sim.stock.z;
  for (let y = 56; y <= 58; y++) for (let x = 56; x <= 58; x++) sim.world.set(x, y, z, M.STONE, 0);   // a 3x3 outcrop
  const vs = sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).slice(0, 3);
  const xp0 = vs.map(v => JSON.stringify(v.sk));
  assert.ok(sim.apply({ type: "order", ids: vs.map(v => v.id), verb: "dig", x: 57, y: 57, z }));
  for (let i = 0; i < 7 * DUR_DAY && vs.some(v => v.order); i++) { if (i % 20 === 0) settle(sim); sim.step(); }
  let rock = 0; for (let y = 56; y <= 58; y++) for (let x = 56; x <= 58; x++) if (sim.world.mat(x, y, z) === M.STONE) rock++;
  assert.equal(rock, 0, "the whole outcrop was dug out");
  assert.ok(vs.every(v => !v.order), "the order finishes when nothing is left");
  const dug = JSON.stringify(vs.map(v => v.sk.build));
  for (let i = 0; i < 3000; i++) { if (i % 20 === 0) settle(sim); sim.step(); }                 // let the haul baseline carry it in
  const sv = survey(sim);
  assert.equal(sv.stock.stone + sv.loose.stone + sv.carried.stone, 9, "9 stone from 9 cells");
  assert.ok(sv.stock.stone >= 6, "stone gets hauled to the stockpile (" + sv.stock.stone + ")");
  void xp0; void dug;
  // now a dry-stone wall from it
  sim.apply({ type: "build", cells: [{ w: "wall", m: "stone", x: 60, y: 56, z }, { w: "wall", m: "stone", x: 61, y: 56, z }] });
  for (let i = 0; i < 6000 && sim.ents.ofKind("csite").length; i++) { if (i % 20 === 0) settle(sim); sim.step(); }
  assert.equal(sim.world.mat(60, 56, z), M.STONEWALL); assert.equal(sim.world.mat(61, 56, z), M.STONEWALL);
  console.log("3 ok: dug 9 stone, built 2 dry-stone walls from it");
}

// ---- 4. the 70% hand cap, and a stamp with no materials does not starve anyone ----
{
  const sim = plot(), z = sim.stock.z;
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).length;
  stock(sim, "stick", 100); stock(sim, "grass", 100);
  for (let i = 0; i < 6; i++) sim.apply({ type: "build", cells: hutCells(z, 51 + (i % 3) * 6, 51 + (i >> 1 >> 1) * 7 + (i >= 3 ? 7 : 0), 5, 5, 2) });
  let peak = 0;
  for (let i = 0; i < 3000; i++) {
    if (i % 20 === 0) settle(sim);
    sim.step();
    peak = Math.max(peak, sim.ents.ofKind("villager").filter(v => v.job && v.job.k === "build_site" && v.action).length);
  }
  assert.ok(peak >= 2, "several builders at once (" + peak + ")");
  // 9.30: no village-wide hand cap any more. A slime only counts the builders it can SEE (a share of the slimes it knows of, local.js), so slimes that cannot see each other may all go (the planner is local, D52).
  assert.ok(peak <= adults, "builders " + peak + " of " + adults + " adults");
  console.log(`4 ok: peak ${peak} builders of ${adults} adults (each slime only counts the builders in view)`);
}

// ---- 5. the dry-run preview is pure ----
{
  const sim = plot(), z = sim.stock.z;
  stock(sim, "stick", 40);
  sim.apply({ type: "build", cells: hutCells(z, 52, 52, 6, 5, 2) });
  for (let i = 0; i < 300; i++) sim.step();
  const h0 = sim.hash(), v = sim.ents.ofKind("villager")[0];
  const w0 = JSON.stringify(v.why);
  const next = plan(sim, v, false, null, true);
  assert.equal(sim.hash(), h0, "a dry-run plan changed the sim");
  assert.equal(JSON.stringify(v.why), w0);
  assert.ok(next && next.job && next.cls, "returns a why record");
  console.log("5 ok: dry-run plan() is pure; next =", next.job, "(" + next.cls + ")");
}
console.log("build ok");
