// 9.29 planners read beliefs (know.js, jobs.js, belief.js): a slime goes only where it believes something is. Fixture based, a few seconds. node tests/beliefplan.js
//   unknown -> UNKNOWN_PLACE; seen -> goes; gone on arrival -> the fact is dropped and the slime replans; ore known only after seeing or digging;
//   the dev guard (entities.js) shows the converted planners never read the world; determinism; a short survival sanity check, beliefs on vs off.
import "./legacy.js";
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { plan } from "../src/sim/jobs.js";
import { look, flags, felt, learnDug, LOOK_EVERY, LOOK_R } from "../src/sim/belief.js";
import { entsOf, oreCells } from "../src/sim/know.js";
import { guard, DEFERRED, guardBoard } from "../src/sim/entities.js";
import { newPlant } from "../src/sim/plants.js";
import { Task } from "../src/sim/tasks.js";
import { isAdult } from "../src/sim/villager.js";
import { M, F } from "../src/sim/world.js";
import { dropLoose } from "../src/sim/items.js";
import { BLOCKER_TEXT } from "../src/ui/text.js";

let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
const t00 = Date.now();

/** Remove everything a look would notice round a slime (and send the others away), so a test places exactly what it wants; the slime knows nothing. */
function bare(sim, v, r = 14) {
  for (const k of ["plant", "furniture", "site", "csite", "dsite", "fauna", "plot", "item"]) for (const e of sim.ents.ofKind(k).slice()) {
    if (Math.abs(e.x - v.x) <= r && Math.abs(e.y - v.y) <= r && Math.abs(e.z - v.z) <= 4 && !(k === "item" && sim.stock && e.x >= sim.stock.x0 && e.x <= sim.stock.x1 && e.y >= sim.stock.y0 && e.y <= sim.stock.y1)) sim.ents.remove(e.id);
  }
  for (const o of sim.ents.ofKind("villager")) if (o !== v && Math.abs(o.x - v.x) <= r && Math.abs(o.y - v.y) <= r) sim.ents.move(o, o.x + 60, o.y, sim.world.standZ(o.x + 60, o.y) >= 0 ? sim.world.standZ(o.x + 60, o.y) : o.z);
  v.bel = []; v.carry = null; v.order = null; v.bad = []; v.hunger = v.thirst = v.energy = v.warm = v.mood = 1;
}
/** 9.30: the slime has read an empty larder (demand is local, so this is what makes the food chain exist for it). */
const lowLarder = (sim, v) => { v.bel = v.bel.filter(f => f[0] !== "stock"); v.bel.push(["stock", sim.stock.x0, sim.stock.y0, sim.stock.z, 0, sim.tick, 0]); };
/** Every scored candidate of a dry plan: [{kind, tid, blocker}]. */
function cands(sim, v) {
  let out = [];
  plan(sim, v, false, (cs) => { out = cs.map(c => ({ kind: c.kind, tid: c.tid || 0, blocker: c.blocker || "" })); }, true);
  return out;
}
const standOf = (sim, x, y, dx, dy) => { const X = x + dx, Y = y + dy, Z = sim.world.standZ(X, Y); assert.ok(Z >= 0, "no ground at " + X + "," + Y); return [X, Y, Z]; };
const adult = (sim) => sim.ents.ofKind("villager").find(v => isAdult(sim, v) && v.slp === 0);
/** A cell 9..13 east of the slime where something can stand (the slime is outside LOOK_R of it). */
const farSpot = (sim, v) => { for (let d = 9; d <= 13; d++) { const z = sim.world.standZ(v.x + d, v.y); if (z >= 0 && Math.abs(z - v.z) <= 1) return [v.x + d, v.y, z]; } throw new Error("no far spot"); };

// 1. a slime that has not seen a berry bush does not go to it and blocks with UNKNOWN_PLACE; once it looks, it goes
{
  const sim = loadFixture("settled"), v = adult(sim);
  bare(sim, v);
  sim.board.fc = 1; sim.board.fneed = 3; sim.board.uvf = 1;                 // (the store-off baseline reads these)
  lowLarder(sim, v);                                                          // food is critical as this slime reads it: the forage job exists
  const [bx, by, bz] = farSpot(sim, v);
  const b = newPlant(sim.ents, "tuber", bx, by, bz);                          // tubers grow all year, so the test does not depend on the season
  b.yield = 4;
  assert.ok(Math.max(Math.abs(bx - v.x), Math.abs(by - v.y)) > LOOK_R, "the bush is out of sight");
  look(sim, v); lowLarder(sim, v);
  let c = cands(sim, v).filter(x => x.kind === "forage");
  assert.ok(c.length && c.every(x => x.tid !== b.id), "it does not go to a bush it has not seen");
  assert.ok(c.every(x => x.blocker === "UNKNOWN_PLACE"), "the forage job says UNKNOWN_PLACE, got " + JSON.stringify(c));
  assert.ok(BLOCKER_TEXT.UNKNOWN_PLACE && BLOCKER_TEXT.STALE_BELIEF, "both blockers have plain text");
  ok("a bush it has not seen is not a target: forage is blocked UNKNOWN_PLACE");
  // it walks near and looks
  sim.ents.move(v, bx - 4, by, sim.world.standZ(bx - 4, by) >= 0 ? sim.world.standZ(bx - 4, by) : bz);
  sim.tick += 1; look(sim, v); lowLarder(sim, v);
  assert.ok(v.bel.some(f => f[0] === "food"), "the look wrote a food fact");
  c = cands(sim, v).filter(x => x.kind === "forage");
  assert.ok(c.some(x => x.tid === b.id && !x.blocker), "once seen, forage targets the bush: " + JSON.stringify(c));
  ok("after it looks at the bush, forage goes to it (patch fact, then a local lookup picks the bush)");
  // a seeded fact does the same
  sim.ents.move(v, bx - 12, by, sim.world.standZ(bx - 12, by) >= 0 ? sim.world.standZ(bx - 12, by) : bz);
  bare(sim, v, 4); v.bel = [["food", bx, by, bz, 4, sim.tick, 1]]; lowLarder(sim, v);
  c = cands(sim, v).filter(x => x.kind === "forage");
  assert.ok(c.some(x => x.tid === b.id && !x.blocker), "a fact that was told does it too " + JSON.stringify(c));
  // and with the store off the old telepathy is back
  v.bel = []; flags.off = true;
  try { c = cands(sim, v).filter(x => x.kind === "forage"); } finally { flags.off = false; }
  assert.ok(c.some(x => x.tid && !x.blocker), "flags.off: the world scan finds a bush (the nearest in the world, not only this one) with no belief at all " + JSON.stringify(c));
  ok("a seeded fact is enough; with flags.off the planners fall back to the world scan (the telepathic baseline)");
}

// 2. trees and loose items and beds, each only from belief
{
  const sim = loadFixture("settled"), v = adult(sim);
  bare(sim, v);
  sim.board.keeps.push({ item: "log", n: 30, on: 1 });
  const [tx, ty, tz] = farSpot(sim, v), t = newPlant(sim.ents, "tree", tx, ty, tz);
  const [sx, sy, sz] = standOf(sim, v.x, v.y, -9, 0);
  dropLoose(sim, "stick", 3, sx, sy, sz);
  const loose = sim.ents.at(sx, sy, sz).map(id => sim.ents.get(id)).find(e => e.kind === "item");
  assert.ok(loose, "a loose stack was dropped");
  let c = cands(sim, v);
  assert.ok(c.filter(x => x.kind === "chop").every(x => x.tid !== t.id && x.blocker === "UNKNOWN_PLACE"), "chop: the unseen tree is not a target " + JSON.stringify(c.filter(x => x.kind === "chop")));
  assert.ok(c.filter(x => x.kind === "haul").every(x => x.tid !== loose.id), "haul: the unseen stack is not a target");
  v.bel = [["tree", tx, ty, tz, 1, sim.tick, 0], ["loose", sx, sy, sz, 3, sim.tick, 0]];
  c = cands(sim, v);
  assert.ok(c.some(x => x.kind === "chop" && x.tid === t.id && !x.blocker), "chop goes to the believed tree: " + JSON.stringify(c.filter(x => x.kind === "chop")));
  assert.ok(c.some(x => x.kind === "haul" && x.tid === loose.id), "haul goes to the believed stack");
  // the believed patch is empty (the tree was felled while they were away): STALE_BELIEF, not UNKNOWN_PLACE
  sim.ents.remove(t.id);
  c = cands(sim, v).filter(x => x.kind === "chop");
  assert.ok(c.length && c.every(x => x.blocker === "STALE_BELIEF"), "chop: a remembered tree that is gone is STALE_BELIEF " + JSON.stringify(c));
  ok("trees and loose items are targets only when believed; a believed patch with nothing in it is STALE_BELIEF");
}

// 2b. beds: a free bed it never saw is not where it sleeps
{
  const sim = loadFixture("settled"), beds = sim.ents.ofKind("furniture").filter(f => f.f === "bed"), bed = beds[0];
  assert.ok(bed, "the fixture has beds");
  const v = sim.ents.ofKind("villager").find(q => isAdult(sim, q) && q.slp === 0);
  for (const b of beds) b.owner = b === bed ? 0 : (sim.ents.ofKind("villager")[1].id);          // exactly one bed is free
  v.bed = 0; v.carry = null; v.order = null; v.bad = []; v.energy = 0.2; v.hunger = v.thirst = v.warm = v.mood = 1;
  const z = sim.world.standZ(bed.x + 12, bed.y);
  sim.ents.move(v, bed.x + 12, bed.y, z >= 0 ? z : bed.z);
  v.bel = [];
  const sleep0 = cands(sim, v).find(x => x.kind === "sleep");
  assert.ok(sleep0 && sleep0.tid === 0, "tired, with no bed in its beliefs: it sleeps on the ground (tid 0), not in the bed it never saw " + JSON.stringify(sleep0));
  v.bel = [["bed", bed.x, bed.y, bed.z, 1, sim.tick, 0]];
  const sleep1 = cands(sim, v).find(x => x.kind === "sleep");
  assert.ok(sleep1 && sleep1.tid === bed.id, "once the bed is believed, it goes there " + JSON.stringify(sleep1));
  ok("beds: sleep picks a free bed only from belief");
}

// 3. arrival at a gone or empty target: the fact is dropped on the spot, the walk is felt (bad list), and the slime replans
{
  for (const mode of ["gone", "empty"]) {
    const sim = loadFixture("settled"), v = adult(sim);
    bare(sim, v);
    const [bx, by, bz] = standOf(sim, v.x, v.y, 2, 0);
    const b = newPlant(sim.ents, "berry", bx, by, bz); b.yield = 3;
    const fact = ["food", bx, by, bz, 3, sim.tick - 100, 0];
    v.bel = [fact];
    while ((sim.tick + v.id) % LOOK_EVERY !== 1 || sim.tick % 20 === 0) sim.step();                    // the next tick is not this slime's look tick: only the arrival check can drop the fact
    v.bel = [fact]; v.bad = []; v.carry = null; b.yield = 3;
    v.job = { k: "forage", c: "demand", key: "forage:" + b.id, t0: sim.tick, tid: b.id, g: "food", kp: "", res: [] };
    v.action = Task("forage", [{ v: "pick", tid: b.id, x: v.x, y: v.y, z: v.z }]);
    sim.ents.move(b, v.x, v.y, v.z); fact[1] = v.x; fact[2] = v.y; fact[3] = v.z;
    if (mode === "gone") sim.ents.remove(b.id); else b.yield = 0;
    v.ep = sim.board.ep; v.rp = 0;                                               // no re-plan this tick: the runner meets the missing target
    sim.step();
    if (process.env.DBG) console.log(mode, "lf", v.lf, "act", v.action && v.action.k, "job", v.job && v.job.k, "bel", JSON.stringify(v.bel), "bad", JSON.stringify(v.bad), "tick", sim.tick, "id", v.id);
    assert.ok(!v.bel.some(x => x[0] === "food"), mode + ": the fact is dropped at arrival: " + JSON.stringify(v.bel));
    assert.ok(v.bad.some(x => x[0] === b.id), mode + ": the target is on the bad list");
    assert.ok(v.lf && v.lf[1] === "GONE", mode + ": the wasted walk is recorded, lf = " + JSON.stringify(v.lf));
    assert.ok(!v.action || v.action.k !== "forage" || v.job.key !== "forage:" + b.id, mode + ": the slime replans");
    if (!v.action) { sim.step(); sim.step(); }
    assert.ok(v.action && !(v.job && v.job.tid === b.id), mode + ": and it has something else to do");
  }
  ok("arriving at a gone (or picked-empty) believed target drops the fact the same tick, bad-lists it, and the slime replans");
}

// 4. ore: known only after seeing it or digging it out
{
  const sim = loadFixture("settled"), v = adult(sim);
  bare(sim, v);
  const [ox, oy, oz] = farSpot(sim, v);
  sim.world.set(ox, oy, oz, M.IRONORE, sim.world.flags(ox, oy, oz));            // an ore block sitting in the open, out of sight
  const ctx = { sim, v };
  look(sim, v);
  assert.equal(oreCells(ctx, [M.IRONORE]).length, 0, "ore out of sight is not known");
  assert.ok(!v.bel.some(f => f[0].startsWith("ore:")), "no ore fact yet");
  sim.ents.move(v, ox - 3, oy, sim.world.standZ(ox - 3, oy) >= 0 ? sim.world.standZ(ox - 3, oy) : oz); sim.tick += 1; look(sim, v);
  assert.ok(v.bel.some(f => f[0] === "ore:" + M.IRONORE), "seen ore is a fact: " + JSON.stringify(v.bel));
  assert.ok(oreCells({ sim, v }, [M.IRONORE]).some(c => c[0] === ox && c[1] === oy && c[2] === oz), "and oreCells finds it");
  // buried ore is not seen; digging the dirt that hid it shows it to the digger
  sim.world.set(ox, oy, oz, M.AIR, 0);
  bare(sim, v);
  const [gx, gy, gz] = standOf(sim, v.x, v.y, 0, 5);
  const w = sim.world;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) w.set(gx + dx, gy + dy, gz + 3 + dz, M.DIRT, 0);   // a dirt knob in the air above the ground
  w.set(gx, gy, gz + 3, M.IRONORE, 0);
  sim.tick += 1; look(sim, v);
  assert.ok(!v.bel.some(f => f[0].startsWith("ore:")), "ore inside rock is not seen");
  w.set(gx, gy - 1, gz + 3, M.AIR, 0);                                              // the digger takes the dirt in front of the ore out
  sim.tick += 1; learnDug(sim, v, gx, gy - 1, gz + 3);
  assert.ok(v.bel.some(f => f[0] === "ore:" + M.IRONORE), "digging the cover away shows the ore to the digger: " + JSON.stringify(v.bel));
  ok("ore is known only after the slime sees it or digs it out (ore:<mat> patches); seen.known is not read by the explore planner");
}

// 5. the dev guard: the converted planners read no world list (every fixture that has the furniture, fields and sites in it)
{
  const names = ["start", "settled", "hearth", "workshop", "farm", "settle", "mine", "expedition", "midwinter"];
  guard.on = true; guard.throws = false; guard.hits.length = 0;
  const seenKinds = new Set(), reads = {};
  try {
    for (const name of names) {
      const sim = loadFixture(name);
      const b = sim.board;                                                        // push every converted chain into play: food and shelter critical (as each slime reads it), the keeps on
      guardBoard(b);                                                              // 9.30: a plan() that reads the board's village demand is a hit
      for (const item of ["log", "grass", "stick", "berry", "dried", "jar", "charcoal"]) b.keeps.push({ item, n: 30, on: 1 });
      const tell = () => { for (const v of sim.ents.ofKind("villager")) if (v.bel) { v.bel = v.bel.filter(f => f[0] !== "stock" && f[0] !== "need:bed" && f[0] !== "need:warm"); v.bel.push(["stock", sim.stock.x0, sim.stock.y0, sim.stock.z, 0, sim.tick, 0], ["need:bed", v.x, v.y, v.z, 3, sim.tick, 0], ["need:warm", v.x, v.y, v.z, 1, sim.tick, 0]); } };
      tell();
      for (let i = 0; i < 450; i++) { sim.step(); if (i % 20 === 5) tell(); }
      for (const v of sim.ents.ofKind("villager")) if (v.why) seenKinds.add(v.why.job);
    }
    Object.assign(reads, guard.deferred);
  } finally { guard.on = false; }
  assert.deepEqual([...new Set(guard.hits)], [], "planners read the world: " + [...new Set(guard.hits)].join(", "));
  assert.ok(seenKinds.size >= 6, "the guarded runs planned a spread of jobs: " + [...seenKinds].join(","));
  const scopes = [...new Set(Object.keys(reads).map(k => k.split(":")[0]))].sort();
  assert.ok(scopes.every(s => DEFERRED[s]), "every deferred scope is documented");
  console.log("   guarded " + names.length + " fixtures x 450 ticks; jobs seen: " + [...seenKinds].sort().join(" "));
  console.log("   still reading the world (deferred, 9.30/9.31): " + scopes.join(", "));
  ok("the dev guard sees no ofKind from the converted planners (food, trees, items, beds and furniture, sites, plots, ore, game)");
}

// 6. determinism: the same fixture twice is the same sim, with the beliefs in the hash
{
  const run = () => { const sim = loadFixture("settled"); for (let i = 0; i < 1200; i++) sim.step(); return sim.hash() + "|" + JSON.stringify(sim.ents.ofKind("villager").map(v => v.bel)).length; };
  const a = run(), b = run();
  assert.equal(a, b, "same fixture, same ticks, same result");
  ok("deterministic: the same run twice gives the same hash (" + a.split("|")[0] + ")");
}

// 7. a short survival sanity check on the start fixture, beliefs on vs off: nobody starves and the work still gets done
{
  const TICKS = 3000, SAMPLE = 25;
  const go = (off) => {
    flags.off = off;
    try {
      const sim = loadFixture("start");
      for (const v of sim.ents.ofKind("villager")) if (off) v.bel = [];
      const mix = {};
      let minHunger = 1, deaths = 0, samples = 0;
      const n0 = sim.ents.ofKind("villager").length;
      for (let i = 0; i < TICKS; i++) {
        sim.step();
        if (i % SAMPLE) continue;
        for (const v of sim.ents.ofKind("villager")) { const k = v.action ? (v.job ? v.job.k : "?") : "idle"; mix[k] = (mix[k] || 0) + 1; samples++; if (v.hunger < minHunger) minHunger = v.hunger; }
      }
      deaths = Object.values(sim.chron.recs).filter(r => r.death !== undefined && r.death !== null && r.death > 0).length;
      const stock = sim.ents.ofKind("item").filter(i => i.item === "berry").reduce((a, i) => a + i.n, 0);
      return { sim, mix, samples, minHunger, deaths, alive: sim.ents.ofKind("villager").length, berries: stock };
    } finally { flags.off = false; }
  };
  const on = go(false), off = go(true);
  const fmt = (r) => Object.entries(r.mix).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, c]) => k + " " + Math.round(100 * c / r.samples) + "%").join(", ");
  console.log("   beliefs ON : alive " + on.alive + ", lost " + on.deaths + ", lowest hunger " + on.minHunger.toFixed(2) + ", berries in the larder " + on.berries + "\n      mix: " + fmt(on));
  console.log("   beliefs OFF: alive " + off.alive + ", lost " + off.deaths + ", lowest hunger " + off.minHunger.toFixed(2) + ", berries in the larder " + off.berries + "\n      mix: " + fmt(off));
  assert.equal(on.deaths, 0, "nobody died with beliefs on");
  assert.ok(on.minHunger > 0, "nobody starved with beliefs on");
  assert.ok((on.mix.idle || 0) / on.samples < 0.6, "beliefs on: not mostly idle");
  ok("short survival (" + TICKS + " ticks, start fixture): nobody starves with beliefs on; the activity mix is above");
}
console.log("beliefplan ok (" + ((Date.now() - t00) / 1000).toFixed(1) + " s)");
