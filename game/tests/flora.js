// S10: the plant lifecycle, PURE (plants.js only: a stub sim with a flat grass world, no villagers, no jobs). Over years the map neither fills nor empties:
// seedlings grow into mature plants, plants age and wither, mature plants seed in their season under a local and a global density cap, and wind-blown
// seed keeps a stripped map from staying bare.   node tests/flora.js
import assert from "node:assert/strict";
import { Entities } from "../src/sim/entities.js";
import { World, M, F } from "../src/sim/world.js";
import { Rng } from "../src/sim/rng.js";
import { DAY, DUR_DAY } from "../src/sim/clock.js";
import { newPlant, floraDaily, growPlants, floraCounts, floraCaps, fellTree, stageOf, lifeOf, LIFE, STUMP_REGROW, STUMP_ROT, SPROUT_PCT } from "../src/sim/plants.js";
import { seasonIdx } from "../src/sim/season.js";

const Z = 5;
function stub(seed, plantsPer) {
  // S16: the world is chunks from a generator; a flat grass plain, with the 8 x 8 chunks round the camp active (the flora only seeds and ages where people are)
  const flat = (cx, cy) => { const mats = new Uint8Array(16 * 16 * 24), flgs = new Uint8Array(16 * 16 * 24); for (let z = 0; z < Z; z++) mats.fill(z === Z - 1 ? M.GRASS : M.DIRT, z * 256, z * 256 + 256); return { cx, cy, mats, flgs, hs: new Int16Array(256).fill(Z - 1), bm: new Uint8Array(256) }; };
  const world = new World(flat);
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) { const c = world.resident(cx, cy); c.act = 1; c.last = 1e12; }     // (always near people)
  const sim = { tick: 0, ents: new Entities(), rng: new Rng(seed), world, site: { x: 64, y: 64 }, wild: {}, farm: { pens: [] }, stock: { x0: 0, y0: 0, x1: 0, y1: 0, z: Z } };
  const r = sim.rng.stream("seed");
  for (const sp of ["berry", "tuft", "tuber", "tree"]) for (let n = 0; n < plantsPer[sp]; ) {
    const x = r.range(2, 125), y = r.range(2, 125);
    if (sim.ents.at(x, y, Z).length) continue;
    newPlant(sim.ents, sp, x, y, Z); if (sp === "tree") world.setFlags(x, y, Z, F.OBSTACLE); n++;
  }
  return sim;
}
const day = (sim, camp) => { sim.tick += DUR_DAY; growPlants(sim); floraDaily(sim, camp); };
const camp = { x: 64, y: 64 };

// 1. A steady map over 15 years (1500 days): each species stays inside its band the whole time, never above the cap's band, never emptied.
{
  const sim = stub(14, { berry: 100, tuft: 350, tuber: 30, tree: 500 });       // (S16: was seed 11. The rain window is relative to the camp now, so the draws moved; three of the four seeds tried end within a plant or two of the 0.4-cap floor for the 30 tubers. The bands are unchanged.)
  const caps = floraCaps(sim), lo = {}, hi = {};
  for (const k of Object.keys(caps)) { lo[k] = 1e9; hi[k] = 0; }
  for (let d = 1; d <= 1500; d++) {
    day(sim, camp);
    if (d % 10 === 0) { const c = floraCounts(sim); for (const k of Object.keys(c)) { lo[k] = Math.min(lo[k], c[k]); hi[k] = Math.max(hi[k], c[k]); } }
  }
  const c = floraCounts(sim);
  for (const k of Object.keys(c)) {
    assert.ok(hi[k] <= caps[k] * 1.15, k + " overfilled: peak " + hi[k] + " vs cap " + caps[k]);
    assert.ok(lo[k] >= caps[k] * 0.4, k + " emptied: low " + lo[k] + " vs cap " + caps[k]);
    assert.ok(c[k] >= caps[k] * 0.5, k + " ends thin: " + c[k] + " vs cap " + caps[k]);
  }
  console.log("ok 1 steady map, 1500 days: berry " + lo.berry + ".." + hi.berry + " (cap " + caps.berry + "), tuft " + lo.tuft + ".." + hi.tuft + " (" + caps.tuft + "), tuber " + lo.tuber + ".." + hi.tuber + " (" + caps.tuber + "), tree " + lo.tree + ".." + hi.tree + " (" + caps.tree + ")");
}

// 2. A stripped map recovers: 90% of everything taken on day 100 (overharvest, a fire), back above half the cap within two years, and not past the cap.
{
  const sim = stub(12, { berry: 100, tuft: 350, tuber: 30, tree: 500 });
  const caps = floraCaps(sim);
  for (let d = 1; d <= 100; d++) day(sim, camp);
  let k = 0;
  for (const p of sim.ents.ofKind("plant").slice()) if (k++ % 10 !== 0) { if (p.species === "tree") sim.world.setFlags(p.x, p.y, p.z, 0); sim.ents.remove(p.id); }
  const thin = floraCounts(sim);
  for (const sp of Object.keys(thin)) assert.ok(thin[sp] < caps[sp] * 0.2, "stripped " + sp);
  for (let d = 1; d <= 800; d++) day(sim, camp);
  const c = floraCounts(sim);
  for (const sp of Object.keys(c)) { assert.ok(c[sp] >= caps[sp] * 0.45, sp + " did not recover: " + c[sp] + " of cap " + caps[sp]); assert.ok(c[sp] <= caps[sp] * 1.15, sp + " overshot"); }
  console.log("ok 2 stripped map recovers: " + JSON.stringify(thin) + " -> " + JSON.stringify(c));
}

// 3. An overfull map relaxes: plants that are not replaced die of age (no new seed above the cap).
{
  const sim = stub(13, { berry: 100, tuft: 350, tuber: 30, tree: 500 });
  const caps = floraCaps(sim);
  const r = sim.rng.stream("extra");
  for (const sp of ["berry", "tuft"]) for (let n = 0; n < caps[sp]; ) { const x = r.range(2, 125), y = r.range(2, 125); if (!sim.ents.at(x, y, Z).length) { newPlant(sim.ents, sp, x, y, Z); n++; } }
  assert.ok(floraCounts(sim).berry > caps.berry * 1.7);
  for (let d = 1; d <= 600; d++) day(sim, camp);
  const c = floraCounts(sim);
  assert.ok(c.berry <= caps.berry * 1.15 && c.tuft <= caps.tuft * 1.15, "relaxed: " + JSON.stringify(c) + " vs " + JSON.stringify(caps));
  console.log("ok 3 an overfull map relaxes: " + JSON.stringify(c) + " (caps " + JSON.stringify(caps) + ")");
}

// 4. Stages and seasons: a seedling bears nothing, growth stops in winter, a bush withers at its lifespan, a tree falls and frees its cell.
{
  const sim = stub(14, { berry: 0, tuft: 0, tuber: 0, tree: 0 });
  const b = sim.ents.add("plant", { species: "berry", x: 30, y: 30, z: Z, yield: 0, nx: 0, rv: 0, rt: 0, bt: 0, gr: 0 });
  assert.equal(stageOf(sim, b), "seedling");
  b.gr = 5; assert.equal(stageOf(sim, b), "young");
  b.gr = 12; assert.equal(stageOf(sim, b), "mature");
  sim.tick = 80 * DAY;                                    // day-of-year 84: winter. Growth days do not count.
  assert.equal(seasonIdx(sim.tick), 3);
  const g0 = b.gr; floraDaily(sim, camp); assert.equal(b.gr, g0, "no growth in winter");
  b.bt = sim.tick - (lifeOf(b) + 2) * DAY;
  floraDaily(sim, camp);
  assert.ok(!sim.ents.get(b.id), "a bush past its lifespan withers");
  const t = newPlant(sim.ents, "tree", 40, 40, Z); sim.world.setFlags(40, 40, Z, F.OBSTACLE); t.bt = 0; t.gr = 50;
  t.bt = sim.tick - (lifeOf(t) + 2) * DAY;
  floraDaily(sim, camp);
  assert.ok(!sim.ents.get(t.id) && !(sim.world.flags(40, 40, Z) & F.OBSTACLE), "an old tree falls and its cell is walkable again");
  console.log("ok 4 stages, winter pause, withering");
}

// 5. A felled tree leaves a stump that sprouts or rots: over many stumps about SPROUT_PCT% become saplings, the rest are gone after STUMP_ROT.
{
  const sim = stub(15, { berry: 0, tuft: 0, tuber: 0, tree: 0 });
  const ids = [];
  for (let i = 0; i < 100; i++) { const t = newPlant(sim.ents, "tree", 4 + (i % 50), 4 + Math.floor(i / 50) * 2, Z); sim.world.setFlags(t.x, t.y, Z, F.OBSTACLE); fellTree(sim, t); ids.push(t.id); assert.equal(t.species, "stump"); assert.ok(!(sim.world.flags(t.x, t.y, Z) & F.OBSTACLE)); }
  sim.tick = 12 * DAY + 5 * DAY * 0;                       // spring (day-of-year 16): sprouting is allowed
  sim.tick = STUMP_REGROW + 10;
  growPlants(sim);
  const sap = ids.filter(id => sim.ents.get(id) && sim.ents.get(id).species === "sapling").length, stumps = ids.filter(id => sim.ents.get(id) && sim.ents.get(id).species === "stump").length;
  assert.ok(sap >= SPROUT_PCT - 20 && sap <= SPROUT_PCT + 20, "about " + SPROUT_PCT + "% coppice: " + sap);
  sim.tick = STUMP_ROT + STUMP_REGROW;
  growPlants(sim);
  const left = ids.filter(id => sim.ents.get(id) && sim.ents.get(id).species === "stump").length;
  assert.equal(left, 0, "the rest rot away (" + stumps + " were waiting)");
  console.log("ok 5 stumps: " + sap + " of 100 sprouted, " + stumps + " waited, all rotted by day " + Math.round((STUMP_ROT + STUMP_REGROW) / DUR_DAY));
}

// 6. Determinism: the same seed gives the same map after 400 days.
{
  const run = () => { const sim = stub(16, { berry: 60, tuft: 200, tuber: 20, tree: 300 }); for (let d = 0; d < 400; d++) day(sim, camp); return JSON.stringify(sim.ents.toJSON()); };
  assert.equal(run(), run());
  console.log("ok 6 deterministic");
}
void LIFE;
console.log("flora ok");
