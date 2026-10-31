// 9.30 local demand and claims (local.js, jobs.js, jobstate.js): a slime rates demand from ITS OWN beliefs, counts only the workers it can see, and idles into shortage work.
// Fixture based, a few seconds (the crowd comparison is the longest: 3 s of sim per side).   node tests/localdemand.js
//   larder: beside an empty larder demand is up, far and uninformed it is not; two slimes that cannot see each other double up and one moves on at the target;
//   idle pull: an idle slime that saw a stalled site goes to chop, a busy one keeps its job; the board's demand numbers are never read inside plan() (guard);
//   no village-average read is left (source check); determinism; the crowd, beliefs on vs off.
import "./legacy.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixture } from "./fixture.js";
import { plan } from "../src/sim/jobs.js";
import { look, flags } from "../src/sim/belief.js";
import { demandOf, seenWorkers } from "../src/sim/local.js";
import { guard, guardBoard } from "../src/sim/entities.js";
import { newPlant } from "../src/sim/plants.js";
import { isAdult } from "../src/sim/villager.js";
import { Wander } from "../src/sim/actions.js";
import { hutCells } from "./bots/shelter_plan.js";
import { flatSpot, clearArea } from "./helpers.js";
import { LOOK_R } from "../src/sim/belief.js";
import { reservedByOther } from "../src/sim/jobstate.js";

const here = dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
const t00 = Date.now();

const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v) && v.slp === 0);
/** Remove what a look would notice round (cx, cy) (and send the other slimes away) so a test places exactly what it wants. */
function bare(sim, cx, cy, keep = [], r = 16) {
  for (const k of ["plant", "furniture", "site", "csite", "dsite", "fauna", "plot", "item"]) for (const e of sim.ents.ofKind(k).slice()) {
    const inYard = k === "item" && sim.stock && e.x >= sim.stock.x0 && e.x <= sim.stock.x1 && e.y >= sim.stock.y0 && e.y <= sim.stock.y1;
    if (Math.abs(e.x - cx) <= r && Math.abs(e.y - cy) <= r && !inYard) sim.ents.remove(e.id);
  }
  for (const o of sim.ents.ofKind("villager")) if (!keep.includes(o) && Math.abs(o.x - cx) <= r + 6 && Math.abs(o.y - cy) <= r + 6) sim.ents.move(o, o.x + 90, o.y, sim.world.standZ(o.x + 90, o.y) >= 0 ? sim.world.standZ(o.x + 90, o.y) : o.z);
  sim.cache.iv++;
}
const calm = (v) => { v.bel = []; v.carry = null; v.order = null; v.bad = []; v.job = null; v.action = null; v.hunger = v.thirst = v.energy = v.warm = v.mood = 1; v.bed = v.bed || 0; };
const put = (sim, v, x, y) => { const z = sim.world.standZ(x, y); assert.ok(z >= 0, "no ground at " + x + "," + y); sim.ents.move(v, x, y, z); return z; };
const emptyYard = (sim) => { const z = sim.stock; for (const e of sim.ents.ofKind("item").slice()) if (e.x >= z.x0 && e.x <= z.x1 && e.y >= z.y0 && e.y <= z.y1) sim.ents.remove(e.id); sim.cache.iv++; };
const cands = (sim, v) => { let out = []; plan(sim, v, false, (cs) => { out = cs.map(c => ({ kind: c.kind, cls: c.cls, tid: c.tid || 0, blocker: c.blocker || "", pull: !!c.pull })); }, true); return out; };

// 1. a slime beside an empty larder rates food demand up; a far, uninformed one does not
{
  const sim = loadFixture("settled"), [a, b] = adults(sim);
  emptyYard(sim);
  calm(a); calm(b);
  const zn = sim.stock;
  put(sim, a, zn.x1 + 1, zn.y0);                                       // beside the larder
  sim.tick += 8; look(sim, a);
  assert.ok(a.bel.some(f => f[0] === "stock" && f[4] === 0), "it read the empty larder");
  const da = demandOf({ sim, v: a });
  assert.ok(da.reading && da.food >= 0.9 && da.fc === 1, "beside the empty larder food demand is up: " + JSON.stringify(da));
  for (let k = 0; k < 40; k++) { const x = zn.x1 + 30 + k, z = sim.world.standZ(x, zn.y0); if (z >= 0) { sim.ents.move(b, x, zn.y0, z); break; } }
  assert.ok(Math.abs(b.x - zn.x1) > 20, "far from the yard");
  look(sim, b);
  const db = demandOf({ sim, v: b });
  assert.ok(!db.reading && db.food === 0 && db.fc === 0, "a far, uninformed slime rates no food demand (the larder is empty, it does not know): " + JSON.stringify(db));
  ok("beside the empty larder food demand is " + da.food + " (critical); far and uninformed it is " + db.food + " (no reading)");
  const nf = { sim, v: b }; b.bel.push(["need:food", b.x, b.y, b.z, 2, sim.tick, 0]);
  assert.ok(demandOf(nf).food >= 0.6, "a hungry neighbour it saw is a food shortage too");
  ok("a hungry neighbour in view raises food demand to " + demandOf({ sim, v: b }).food + " without any larder reading");
}

// 2. two slimes that cannot see each other double up; the second finds the tree taken on arrival and moves on
{
  const sim = loadFixture("settled"), [a, b] = adults(sim);
  const cx = sim.stock.x1 + 16, cy = sim.stock.y0 + 12;
  bare(sim, cx, cy, [a, b]);
  calm(a); calm(b);
  const zt = sim.world.standZ(cx, cy);
  const tree = newPlant(sim.ents, "tree", cx, cy, zt >= 0 ? zt : sim.stock.z);
  const spots = [];
  for (const dx of [-9, 9]) { let hit = null; for (let d = 0; d <= 3 && !hit; d++) for (const dy of [0, 1, -1, 2, -2]) { const x = cx + dx + (dx < 0 ? -d : d), y = cy + dy, z = sim.world.standZ(x, y); if (z >= 0 && Math.abs(z - tree.z) <= 1) { hit = [x, y, z]; break; } } spots.push(hit); }
  assert.ok(spots[0] && spots[1], "ground either side of the tree");
  sim.ents.move(a, ...spots[0]); sim.ents.move(b, ...spots[1]);
  const apart = Math.abs(a.x - b.x);
  assert.ok(apart > LOOK_R, "they cannot see each other (" + apart + " cells apart)");
  for (const v of [a, b]) v.bel = [["tree", tree.x, tree.y, tree.z, 1, sim.tick, 0]];
  assert.ok(sim.apply({ type: "order", ids: [a.id, b.id], verb: "chop", tid: tree.id }), "an order to chop");
  sim.step();                                                          // a plans first and holds the tree; b cannot see that
  assert.ok(a.job && a.job.tid === tree.id && tree.rv === a.id, "a took the tree: " + JSON.stringify(a.job));
  assert.ok(b.job && b.job.tid === tree.id, "b planned for the same tree (it could not see a): " + JSON.stringify(b.job));
  assert.ok(b.job.rl && b.job.rl.includes(tree.id) && tree.rv === a.id, "b did not steal the reservation; it is remembered to check on arrival");
  let moved = -1;
  for (let i = 1; i < 1500 && moved < 0; i++) { sim.step(); if (!b.job || b.job.tid !== tree.id || !b.action) moved = i; }
  assert.ok(moved > 0, "b gave the tree up");
  assert.ok(b.lf && b.lf[1] === "RESERVED" || b.bad.some(q => q[0] === tree.id), "it found the tree taken (RESERVED) and bad-listed it: " + JSON.stringify([b.lf, b.bad]));
  ok("two slimes " + apart + " cells apart both walk to one tree; b finds it taken after " + moved + " ticks (" + b.lf[1] + ") and moves on");
  // in sight the claim is seen: b near a does not plan for it
  const sim2 = loadFixture("settled"), [c, d] = adults(sim2);
  bare(sim2, cx, cy, [c, d]); calm(c); calm(d);
  const t2 = newPlant(sim2.ents, "tree", cx, cy, zt >= 0 ? zt : sim2.stock.z);
  sim2.ents.move(c, ...spots[0]);
  { let hit = null; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]]) { const z = sim2.world.standZ(spots[0][0] + dx, spots[0][1] + dy); if (z === spots[0][2]) { hit = [spots[0][0] + dx, spots[0][1] + dy, z]; break; } } assert.ok(hit, "ground beside c"); sim2.ents.move(d, ...hit); }
  for (const v of [c, d]) v.bel = [["tree", t2.x, t2.y, t2.z, 1, sim2.tick, 0]];
  sim2.apply({ type: "order", ids: [c.id], verb: "chop", tid: t2.id });
  sim2.step();
  assert.equal(t2.rv, c.id);
  assert.ok(reservedByOther(sim2, t2, d.id), "within sight d sees c's claim");
  assert.ok(!reservedByOther(sim2, t2, b.id) || Math.abs(b.x - t2.x) <= LOOK_R, "out of sight b does not");
  ok("reservedByOther is visibility-aware: seen from beside the holder, unseen from afar");
}

// 3. the idle pull: an idle slime that saw a stalled site (no wood) goes to chop; a busy slime keeps its job
{
  const sim = loadFixture("settled"), [a, b] = adults(sim);
  const [x0, y0, z] = flatSpot(sim, 5, 5, 0);
  bare(sim, x0 + 2, y0 + 2, [a, b], 10);
  clearArea(sim, x0, y0, 5, 5, z);
  for (const it of sim.ents.ofKind("item").slice()) if (it.item === "stick" || it.item === "log") sim.ents.remove(it.id);
  sim.cache.iv++;
  sim.apply({ type: "build", cells: hutCells(z, x0, y0, 5, 5, 0) });
  assert.ok(sim.ents.ofKind("csite").length > 4, "a stamp of ghosts needing wood: " + sim.ents.ofKind("csite").length);
  let tx = x0 + 7; while (sim.world.standZ(tx, y0 + 2) !== z && tx < x0 + 11) tx++;
  newPlant(sim.ents, "tree", tx, y0 + 2, z);
  for (const v of [a, b]) { calm(v); put(sim, v, x0 + 2, y0 + 6 < y0 + 5 ? y0 : y0 + 6); sim.tick += 8; look(sim, v); }
  assert.ok(a.bel.some(f => f[0] === "site") && a.bel.some(f => f[0] === "tree"), "it saw the site and a tree: " + JSON.stringify(a.bel.map(f => f[0])));
  const idle = plan(sim, a, false, null, true);
  assert.equal(idle.job, "chop", "an idle slime that saw the stalled site goes to chop: " + JSON.stringify(idle));
  const cd = cands(sim, a);
  assert.ok(cd.some(c => c.kind === "chop" && c.pull && !c.blocker), "the chop is a pulled shortage job");
  // b is busy at something else (a non-leisure job it is running): the pull never reaches it
  b.job = { k: "store", c: "demand", key: "store:0", t0: sim.tick, tid: 0, g: "", kp: "", res: [] }; b.action = Wander();
  const cb = cands(sim, b);
  assert.ok(!cb.some(c => c.pull), "a busy slime is offered no pulled work: " + JSON.stringify(cb.filter(c => c.pull)));
  const busy = plan(sim, b, true, null, true);
  assert.notEqual(busy.job, "chop", "and it does not drop its job for the shortage (" + busy.job + ")");
  b.job = { k: "leisure", c: "leisure", key: "leisure:0", t0: sim.tick, tid: 0, g: "leisure", kp: "", res: [] };
  assert.ok(cands(sim, b).some(c => c.kind === "chop" && c.pull && !c.blocker), "a slime at leisure is pulled in too");
  ok("idle slime saw a stalled site and goes to chop; at leisure too; a busy one is offered nothing and keeps its job");
}

// 4. the board's demand numbers are not read by plan() (the guard)
{
  const sim = loadFixture("settled");
  guardBoard(sim.board);
  guard.on = true; guard.throws = false; guard.hits.length = 0;
  try {
    for (let i = 0; i < 400; i++) sim.step();
    for (const v of adults(sim)) plan(sim, v, false, null, true);
    guard.in = 1; guard.scope = "control"; void sim.board.dem; void sim.board.fc; guard.in = 0;
  } finally { guard.on = false; }
  const mine = guard.hits.filter(h => h.includes("board."));
  assert.deepEqual(mine, ["control:board.dem", "control:board.fc"], "only the deliberate control read was caught: " + mine.join(","));
  assert.ok(sim.board.dem && typeof sim.board.dem.food === "number", "board.js still computes its truth for the HUD");
  guard.hits.length = 0;
  ok("400 ticks of planning read no board demand (dem, fc, sc, fneed, sneed, uvf, uvs); a read inside plan() would be a hit");
}

// 5. no village-average input is left in the planners
{
  const src = (f) => readFileSync(join(here, "..", "src", "sim", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").split("\n").filter(l => !/belFlags\.off/.test(l)).join("\n");     // (the flags.off baseline lines are the telepathic path and are allowed to read the village)
  const jobs = src("jobs.js"), farm = src("farmjobs.js"), know = src("knowledge.js"), pop = src("population.js"), board = src("board.js");
  for (const [name, text] of [["jobs.js", jobs], ["farmjobs.js", farm]]) {
    for (const re of [/\bb\.dem\b/, /\.dem\.(food|shelter|rack|preserve)/, /\bfneed\b/, /\bsneed\b/, /vl\.adults/, /vl\.n\b/, /sv\.loose/, /sv\.carried/, /sim\.board\.(fc|sc|runway)/, /\bb\.(fc|sc)\b/]) assert.ok(!re.test(text), name + " still reads " + re);
  }
  const full = readFileSync(join(here, "..", "src", "sim", "jobs.js"), "utf8"), mk = full.slice(full.indexOf("function makeCtx"), full.indexOf("function company"));
  assert.ok(/if \(belFlags\.off\) \{[^}]*\n[^]*ofKind\("villager"\)/.test(mk) && mk.indexOf("ofKind") > mk.indexOf("if (belFlags.off)") && mk.indexOf("ofKind") < mk.indexOf("const ctx"), "makeCtx's worker tally exists only inside the flags.off baseline branch");
  assert.ok(!/thirst < 0\.4/.test(know) && !/v\.warm < 0\.6/.test(know) && !/cold \/ vs\.length/.test(know), "knowledge.js pressure has no cold / thirsty share of the village");
  assert.ok(!/foodFrac/.test(pop) && !/beds \/ n/.test(pop), "breeding has no village runway or beds-per-head weight");
  assert.ok(!/missing \/ n\b/.test(board), "board.js has no missing-beds-per-head");
  ok("no village-average read left: board dem/fc/sc/fneed/sneed, vl.adults, sv.loose, cold and thirsty shares, beds per head");
}

// 6. determinism
{
  const run = () => { const sim = loadFixture("settled"); for (let i = 0; i < 900; i++) sim.step(); return sim.hash(); };
  assert.equal(run(), run(), "same fixture twice, same hash");
  ok("deterministic over 900 ticks");
}

// 7. the crowd: 60 slimes, a shortage, beliefs on vs off
{
  const CAP = Number(process.env.CROWD_TICKS) || 3000, N = 60;
  const run = (off) => {
    flags.off = off;
    try {
      const sim = loadFixture("crowd");
      for (let g = 0; sim.ents.ofKind("villager").length < N && g < 400; g++) sim.spawnVillager();
      const before = sim.ents.ofKind("villager").length;
      const beds0 = sim.ents.ofKind("furniture").filter(f => f.f === "bed").length;
      for (const v of sim.ents.ofKind("villager")) v.thirst = v.energy = 1;
      const tally = {}; let samples = 0;
      const t0 = performance.now();
      for (let i = 0; i < CAP; i++) {
        sim.step();
        if (i % 20 === 0) for (const v of sim.ents.ofKind("villager")) { if (!isAdult(sim, v)) continue; const k = v.job && v.action ? v.job.k : "idle"; tally[k] = (tally[k] || 0) + 1; samples++; }
      }
      const ms = performance.now() - t0;
      const pc = (k) => Math.round(1000 * (tally[k] || 0) / samples) / 10, r1 = (x) => Math.round(x * 10) / 10;
      return { leisure: r1(pc("leisure") + pc("idle")), bed: pc("build_bed"), forage: pc("forage"), chop: pc("chop"), deaths: before - sim.ents.ofKind("villager").length, beds: sim.ents.ofKind("furniture").filter(f => f.f === "bed").length - beds0, ms: ms / CAP, n: before };
    } finally { flags.off = false; }
  };
  const on = run(false), off = run(true);
  const fmt = (r) => "leisure " + r.leisure + "%, build_bed " + r.bed + "%, forage " + r.forage + "%, chop " + r.chop + "%, deaths " + r.deaths + ", beds built " + r.beds + ", " + r.ms.toFixed(2) + " ms/tick";
  console.log("   crowd " + on.n + " slimes, " + CAP + " ticks:");
  console.log("   beliefs ON : " + fmt(on));
  console.log("   beliefs OFF: " + fmt(off));
  // the per-tick cost is not comparable (on, the slimes work and plan; off, 83% of them wander): so time the same dry plans on one crowd, on and off
  const per = (off) => {
    flags.off = off;
    try {
      const sim = loadFixture("crowd");
      for (let g = 0; sim.ents.ofKind("villager").length < N && g < 400; g++) sim.spawnVillager();
      for (let i = 0; i < 200; i++) sim.step();
      const vs = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
      for (const v of vs) plan(sim, v, false, null, true);                 // warm the per-tick caches
      let calls = 0; const t0 = performance.now();
      for (let r = 0; r < 12; r++) { sim.tick++; for (const v of vs) { plan(sim, v, false, null, true); calls++; } }
      return (performance.now() - t0) * 1000 / calls;
    } finally { flags.off = false; }
  };
  const pOn = per(false), pOff = per(true);
  console.log("   one plan on the crowd: beliefs ON " + pOn.toFixed(0) + " us, OFF (the O(V) worker tally and village scans) " + pOff.toFixed(0) + " us");
  assert.ok(pOn < pOff * 1.5 + 50, "a local plan costs no more than the telepathic one: " + pOn.toFixed(0) + " vs " + pOff.toFixed(0));
  assert.ok(on.leisure < off.leisure, "fewer idle slimes with local demand: " + on.leisure + "% vs " + off.leisure + "%");
  assert.ok(on.deaths <= off.deaths + 6, "no extra deaths from local demand: " + on.deaths + " vs " + off.deaths);
  ok("crowd: leisure " + on.leisure + "% on vs " + off.leisure + "% off; one plan " + pOn.toFixed(0) + " us vs " + pOff.toFixed(0) + " us");
}
console.log("localdemand ok (" + ((Date.now() - t00) / 1000).toFixed(1) + " s)");
