// Dormant chunks, save size and cost after exploring (S17). Through the Sim at the real spawn (like tests/endless.js): a walker is carried away and back
// (every tick still goes through the sim, so activation, sleep and wake run as in play).
//   node tests/dormant.js
import assert from "node:assert/strict";
import { Sim } from "../src/sim/sim.js";
import { toJSON, restore } from "../src/sim/save.js";
import { releaseJob } from "../src/sim/jobstate.js";
import { chunkKey } from "../src/sim/cellkey.js";
import { DEACT_CH } from "../src/sim/chunks.js";
import { dropLoose } from "../src/sim/items.js";
import { igniteTree } from "../src/sim/fire.js";
import { DUR_DAY } from "../src/sim/clock.js";
import { newPlant } from "../src/sim/plants.js";
import { F } from "../src/sim/world.js";

const ok = (m) => console.log("ok  " + m);
const fed = (sim, v) => { v.hunger = v.thirst = v.energy = 1; v.hp = 999; v.fear = 0; if (v.job) releaseJob(sim, v); v.job = null; v.action = null; v.order = null; };
const standNear = (sim, x, y) => { for (let r = 0; r < 12; r++) for (let a = -r; a <= r; a++) for (const [p, q] of [[a, -r], [a, r], [-r, a], [r, a]]) { const z = sim.world.standZ(x + p, y + q); if (z >= 0 && !sim.ents.at(x + p, y + q, z).length) return [x + p, y + q, z]; } return null; };
const standIn = (sim, cx, cy, lx, ly) => { let best = null, bd = 1e9; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const X = (cx << 4) + x, Y = (cy << 4) + y, z = sim.world.standZ(X, Y); if (z < 0 || sim.ents.at(X, Y, z).length) continue; const d = (x - lx) ** 2 + (y - ly) ** 2; if (d < bd) { bd = d; best = [X, Y, z]; } } return best; };
const carry = (sim, v, x, y) => { const p = standNear(sim, x, y); sim.ents.move(v, p[0], p[1], p[2]); };
const run = (sim, vs, n) => { for (let i = 0; i < n; i++) { for (const v of vs) fed(sim, v); sim.step(); } };
const plantsIn = (sim, cx, cy) => sim.ents.ofKind("plant").filter(p => (p.x >> 4) === cx && (p.y >> 4) === cy);

// ---- 1. a changed far chunk falls asleep and is caught up when somebody returns ----
function scenario() {
  const sim = Sim.create(7, { villagers: 2 }), vs = sim.ents.ofKind("villager"), v = vs[0];
  const FX = sim.site.x + 150, FY = sim.site.y;
  carry(sim, v, FX, FY);
  run(sim, vs, 60);
  const cx = v.x >> 4, cy = v.y >> 4, key = chunkKey(cx, cy), c = sim.world.chunks.get(key);
  assert.ok(c && c.act === 1, "the far chunk is active while the walker stands in it");
  // make it a changed chunk with a fire, a hearth, loose food, depleted plants, a burning tree
  const X0 = cx << 4, Y0 = cy << 4, dig = standIn(sim, cx, cy, 2, 2);
  sim.world.set(dig[0], dig[1], dig[2] - 1, 0, 0);                                      // a dug cell: the chunk is changed and is never dropped
  assert.equal(c.mod, 1);
  const spot = standIn(sim, cx, cy, 8, 8);
  dropLoose(sim, "berry", 50, spot[0], spot[1], spot[2]);
  const hspot = standIn(sim, cx, cy, 4, 12);
  sim.ents.add("furniture", { f: "hearth", x: hspot[0], y: hspot[1], z: hspot[2], owner: 0, rv: 0, rt: 0, fuel: 3000, lit: 1, fi: "log", hl: 2 });
  for (const [sp, lx, ly] of [["berry", 1, 6], ["berry", 14, 3], ["berry", 9, 14], ["tuft", 12, 12], ["tuft", 6, 9], ["tuft", 3, 14], ["tree", 13, 8], ["tree", 7, 2]]) {       // (far land is sparse: plant a few of each)
    const q = standIn(sim, cx, cy, lx, ly), p = newPlant(sim.ents, sp, q[0], q[1], q[2]);
    if (sp === "tree") sim.world.setFlagsQuiet(q[0], q[1], q[2], sim.world.flags(q[0], q[1], q[2]) | F.OBSTACLE);
  }
  const ps = plantsIn(sim, cx, cy), trees = ps.filter(p => p.species === "tree"), berries = ps.filter(p => p.species === "berry"), tufts = ps.filter(p => p.species === "tuft");
  assert.ok(ps.length > 5 && trees.length && berries.length && tufts.length, "the chunk has trees, bushes and tufts: " + ps.length);
  for (const b of berries) { b.yield = 0; b.nx = sim.tick; }
  for (const t of tufts) { t.yield = 0; t.nx = sim.tick + 300; }
  const burning = trees[0]; igniteTree(sim, burning);
  const bx = burning.x, by = burning.y;
  run(sim, vs, 100);                                                                  // growPlants gives every bush its birth and growth days
  const gr0 = berries.map(b => b.gr);
  const n0 = ps.length;
  // everyone goes home
  const home = sim.site;
  carry(sim, v, home.x + 3, home.y + 3);
  run(sim, vs, 220);
  assert.ok(c.dz > 0, "the changed chunk, far from everyone, fell asleep");
  assert.equal(plantsIn(sim, cx, cy).length, 0, "its plants are packed, not entities");
  assert.ok(c.pk.length >= n0 - 2, "packed plants: " + c.pk.length + " of " + n0);
  const wild0 = sim.ents.ofKind("fauna").filter(e => (e.x >> 4) === cx && (e.y >> 4) === cy && e.wi).length;
  assert.ok(wild0 <= 1, "its wild creatures were removed (at most one has wandered back in since: " + wild0 + ")");
  const fl = sim.ents.ofKind("flame").find(f => f.x === bx && f.y === by), fuel0 = fl.fuel, hearth = sim.ents.ofKind("furniture").find(f => f.f === "hearth" && f.x === hspot[0]);
  const berries_ = () => sim.ents.ofKind("item").filter(s => s.item === "berry" && (s.x >> 4) === cx && (s.y >> 4) === cy).reduce((a, s) => a + s.n, 0) + (c.pi || []).filter(a => a[0] === "berry").reduce((a, q) => a + q[3], 0);       // (asleep, stacks are packed: they are not entities, nothing scans them)
  assert.equal(berries_(), 50);
  const hfuel0 = hearth.fuel, asleepAt = sim.tick;
  // time passes at home: 2.2 game days. Dormant ground does not burn, rot or move.
  let steps = 0;
  const hash0 = sim.hash();
  steps = Math.round(2.2 * DUR_DAY); run(sim, vs, steps);
  assert.equal(fl.fuel, fuel0, "a dormant fire does not burn down");
  assert.ok(hearth.fuel === hfuel0 && hearth.lit === 1 && hfuel0 > 0, "a dormant hearth keeps its fuel");
  assert.equal(berries_(), 50, "dormant loose food does not rot");
  assert.ok(c.dz > 0 && c.pk.length > 0 && c.pi.length > 0, "and the chunk stays asleep, its stacks packed");
  // a save taken asleep loads asleep and wakes the same way
  const json = toJSON(sim), twin = restore(json);
  assert.equal(twin.hash(), sim.hash(), "a dormant chunk survives save and load");
  assert.equal(toJSON(twin), json, "and re-saves identically");
  // somebody comes back
  carry(sim, v, FX, FY);
  const tv = twin.ents.get(v.id); carry(twin, tv, FX, FY);
  const vt = [tv, ...twin.ents.ofKind("villager").filter(q => q !== tv)];
  for (let i = 0; i < 60; i++) { run(sim, vs, 1); run(twin, vt, 1); }
  assert.equal(c.dz, 0, "the chunk woke");
  assert.equal(sim.hash(), twin.hash(), "the loaded sim wakes the chunk exactly the same way");
  const after = plantsIn(sim, cx, cy);
  assert.ok(after.length >= n0 * 0.8, "its plants are back: " + after.length + " of " + n0);
  assert.ok(!sim.ents.ofKind("flame").some(f => f.x === bx && f.y === by), "the fire went out");
  const stump = sim.ents.at(bx, by, burning.z).map(id => sim.ents.get(id)).find(e => e.kind === "plant");
  assert.ok(stump && stump.species === "stump", "the burning tree burnt down to a stump");
  const h2 = sim.ents.ofKind("furniture").find(f => f.f === "hearth" && f.x === hspot[0]);
  assert.ok(h2.lit === 0 && h2.fuel === 0, "the hearth is out");
  const left = berries_();
  const expectedLoss = 50 * 0.08 * (steps + 280) / DUR_DAY;
  assert.ok(left < 50 && left >= 50 - Math.ceil(expectedLoss) - 5, "loose food rotted by the elapsed days: 50 -> " + left + " (about " + expectedLoss.toFixed(1) + " expected)");
  const regrown = after.filter(p => p.species === "berry");
  assert.ok(regrown.some(b => b.yield > 0), "bushes bore fruit again: " + regrown.map(b => b.yield).join(","));
  const grew = regrown.filter(b => b.gr !== undefined && b.gr >= 1 + Math.min(...gr0.filter(g => g !== undefined)));
  assert.ok(grew.length > 0, "growth days were added");
  assert.ok(after.filter(p => p.species === "tuft").every(p => p.yield === 1), "cut tufts regrew");
  return { sim, hash: sim.hash(), n0, nAfter: after.length, steps: steps + asleepAt - sim.tick };
}
const a = scenario(), b = scenario();
assert.equal(a.hash, b.hash, "the same seed and commands give the same hash after a sleep and a wake");
ok("dormancy: a changed chunk 150 cells out slept (plants packed, fire, hearth and loose food frozen), woke caught up: plants back (" + a.nAfter + "/" + a.n0 + "), fire out, food rotted; a save taken asleep wakes identically; deterministic");

// ---- 2. cost and save size after exploring a wide area ----
const keep = (v) => { v.hunger = v.thirst = v.energy = 1; v.hp = 999; v.fear = 0; };       // (needs met; jobs left alone: the villagers work round the camp as in play)
function ticks(sim, vs, windows = 3, n = 300) {
  let best = 1e9;
  for (let w = 0; w < windows; w++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < n; i++) { for (const v of vs) keep(v); sim.step(); }
    best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6 / n);
  }
  return best;
}
const base = Sim.create(7, { villagers: 7 }), bvs = base.ents.ofKind("villager");
for (let i = 0; i < 400; i++) { for (const v of bvs) keep(v); base.step(); }
const msBase = ticks(base, bvs), chunksBase = base.world.chunks.size, plantsBase = base.ents.ofKind("plant").length;

const sim = Sim.create(7, { villagers: 7 }), vs = sim.ents.ofKind("villager");
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1]];
const RAY = 300;
for (let n = 0; n < RAY; n++) {
  vs.forEach((v, i) => {
    const d = DIRS[i], seg = Math.floor(n / 100), [dx, dy] = seg % 2 ? [d[1] || 1, d[0] || 1] : d;
    for (let r = 0; r < 40; r++) {
      const x = v.x + dx * (1 + (r >> 3)) + (r & 7) - 3, y = v.y + dy * (1 + (r >> 3)) + ((r * 3) & 7) - 3, z = sim.world.standZ(x, y);
      if (z >= 0 && !sim.ents.at(x, y, z).length) { sim.ents.move(v, x, y, z); break; }
    }
    if (n % 6 === 0) {                                                                // leave a mark in the chunk (a dug cell and a dropped log): the chunk is now changed for good
      const z = sim.world.standZ(v.x + 1, v.y + 1);
      if (z >= 2) { sim.world.set(v.x + 1, v.y + 1, z - 1, 0, 0); dropLoose(sim, "log", 1, v.x, v.y, v.z); }
    }
  });
  run(sim, vs, 2);
}
const far = sim.world.chunks.size, mod = [...sim.world.chunks.values()].filter(c => c.mod).length;
const json = toJSON(sim), kb = json.length / 1024;
const entsFar = sim.ents.list.length;
// back home; the changed land far away falls asleep
for (const v of vs) carry(sim, v, sim.site.x + 2, sim.site.y + 2);
run(sim, vs, 700);
for (let i = 0; i < 300; i++) { for (const v of vs) keep(v); sim.step(); }       // (let them settle into their work)
const dormant = [...sim.world.chunks.values()].filter(c => c.dz).length, awake = sim.world.chunks.size - dormant;
const kbHome = toJSON(sim).length / 1024;
const msAfter = ticks(sim, vs);
const plantsAfter = sim.ents.ofKind("plant").length;
console.log("    explored: " + far + " resident chunks (" + mod + " changed), " + entsFar + " entities, save " + kb.toFixed(0) + " KB; at home: " + dormant + " dormant, " + awake + " awake chunks, " + plantsAfter + " plant entities (fresh camp " + plantsBase + ", " + chunksBase + " chunks)");
console.log("    save at home after the trip: " + kbHome.toFixed(0) + " KB");
console.log("    ms/tick: fresh camp " + msBase.toFixed(3) + ", after exploring " + msAfter.toFixed(3));
assert.ok(dormant >= 100, "the changed land far away is dormant: " + dormant);
assert.ok(awake <= chunksBase * 2 + 30, "awake chunks stay a camp's worth: " + awake + " (fresh " + chunksBase + ")");
assert.ok(plantsAfter < plantsBase * 2.5, "plant entities do not pile up: " + plantsAfter + " vs " + plantsBase);
assert.ok(msAfter < msBase * 1.6 + 0.03, "ms/tick does not grow with the explored chunks: " + msAfter.toFixed(3) + " vs " + msBase.toFixed(3));
ok("cost: ms/tick " + msAfter.toFixed(3) + " after exploring " + far + " chunks (" + dormant + " dormant) against " + msBase.toFixed(3) + " at a fresh camp");

assert.ok(json.length < 2 * 1024 * 1024, "a save after a long exploration stays under 2 MB: " + kb.toFixed(0) + " KB");
assert.ok(3 * json.length < 4.5 * 1024 * 1024, "three autosave slots fit in localStorage (about 5 MB): " + (3 * kb / 1024).toFixed(1) + " MB");
ok("save size: " + kb.toFixed(0) + " KB after exploring " + far + " chunks (" + entsFar + " entities); 3 slots " + (3 * kb / 1024).toFixed(2) + " MB");
const sim2 = restore(toJSON(sim));
assert.equal(sim2.hash(), sim.hash(), "round trip with dormant chunks");
ok("round trip: " + dormant + " dormant chunks save and load to the same hash");
console.log("dormant ok");
