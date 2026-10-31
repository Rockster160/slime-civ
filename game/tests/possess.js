// Possession (S4b): the player drives the SAME pipeline as the AI.
//  1. Same-sim proof: an AI villager ordered to chop a tree and a possessed villager fed the equivalent
//     pinput walk the same cells and chop for the same number of ticks - except for the documented
//     +10% work speed (INSPIRE.speed), and with that zeroed they are tick-identical.
//  2. The command log replays a possession spell to the same hash; release / grace / collapse rules.
//   node game/tests/possess.js
import "./legacy.js";
import assert from "node:assert/strict";
import { DAY } from "../src/sim/clock.js";
import { Sim } from "../src/sim/sim.js";
import { LIFE_DAYS } from "../src/sim/villager.js";
import { INSPIRE } from "../src/sim/inspire.js";
import { rate } from "../src/sim/tasks.js";
import { possessed } from "../src/sim/possess.js";
import { toJSON, restore } from "../src/sim/save.js";

/** One lone adult and a tree in reach. */
function world(seed) {
  const sim = Sim.create(seed, { villagers: 0 });
  const v = sim.spawnVillager();
  v.born = -Math.round(0.35 * LIFE_DAYS * DAY); v.hunger = v.thirst = v.energy = 1;
  let tree = null, bd = 1e9;
  for (const p of sim.ents.ofKind("plant")) {
    if (p.species !== "tree") continue;
    const d = Math.abs(p.x - v.x) + Math.abs(p.y - v.y);
    if (d >= 3 && d < bd) { bd = d; tree = p; }         // the nearest tree that needs a walk (the planner's own chop candidate is the nearest tree, so the order and the village's wood chain agree on it; S16: was d > 4, which only held on the old map)
  }
  return { sim, v, tree };
}
const treeGone = (sim, id) => sim.ents.get(id).species !== "tree";

/** AI run: order chop at tick 0. Records each move (tick, cell) and when the chop finished. */
function aiRun(seed) {
  const { sim, v, tree } = world(seed), moves = [];
  sim.apply({ type: "order", ids: [v.id], verb: "chop", tid: tree.id });
  let last = [v.x, v.y, v.z], arrived = -1, done = -1;
  for (let i = 0; i < 3000 && done < 0; i++) {
    sim.step();
    if (v.x !== last[0] || v.y !== last[1] || v.z !== last[2]) { moves.push({ t: sim.tick - 1, from: last, to: [v.x, v.y, v.z] }); last = [v.x, v.y, v.z]; arrived = sim.tick - 1; }
    if (treeGone(sim, tree.id)) done = sim.tick - 1;
  }
  assert.ok(done > 0, "AI never felled the tree");
  return { moves, arrived, done, n: done - arrived + 1, rate: rate(sim, v, "chop"), start: [moves[0].from] };
}

/** Possessed run: replay the AI's cells as direction presses, then press interact. */
function playerRun(seed, ai) {
  const { sim, v, tree } = world(seed);
  sim.apply({ type: "possess", id: v.id });
  let mi = 0, arrived = -1, done = -1, sent = false;
  const dir = (a, b) => ({ dx: Math.sign(b[0] - a[0]), dy: Math.sign(b[1] - a[1]) });
  for (let i = 0; i < 3000 && done < 0; i++) {
    if (mi < ai.moves.length) {
      const m = ai.moves[mi];
      if (v.x === m.from[0] && v.y === m.from[1] && v.z === m.from[2] && !(v.action)) sim.apply({ type: "pinput", id: v.id, ...dir(m.from, m.to), tid: 0, verb: "" });
    } else if (!sent && !v.action) { sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: tree.id, verb: "" }); sent = true; }
    sim.step();
    const m = ai.moves[mi];
    if (m && v.x === m.to[0] && v.y === m.to[1] && v.z === m.to[2]) { mi++; arrived = sim.tick - 1; }
    if (treeGone(sim, tree.id)) done = sim.tick - 1;
  }
  assert.ok(done > 0, "possessed villager never felled the tree");
  return { arrived, done, n: done - arrived };       // the chop starts the tick after the last step (a fresh Task), the AI's the same tick
}

for (const seed of [3, 11]) {
  const ai = aiRun(seed);
  // modifier zeroed: tick-identical (walk and work)
  const saved = INSPIRE.speed;
  INSPIRE.speed = 0;
  const z = playerRun(seed, ai);
  assert.equal(z.arrived, ai.arrived, "seed " + seed + ": same walk, same arrival tick");
  assert.equal(z.n, ai.n, "seed " + seed + ": with the buff zeroed the chop takes " + z.n + " ticks vs AI " + ai.n);
  assert.equal(z.done, ai.done + 1, "completion differs by exactly the one-tick decision gap");
  // documented +10%
  INSPIRE.speed = saved;
  const p = playerRun(seed, ai);
  const want = ai.n / (1 + saved);               // mood drifts a hair over the ~300 ticks, so allow 2 ticks
  assert.ok(Math.abs(p.n - want) <= 2, "possessed chop should take ~" + want.toFixed(1) + " ticks (AI " + ai.n + " / 1.1), got " + p.n);
  assert.ok(p.n < ai.n, "inspiration makes it faster");
  console.log(`seed ${seed}: walk ${ai.moves.length} steps, arrival tick ${ai.arrived} both; chop AI ${ai.n} ticks, possessed (buff zeroed) ${z.n}, possessed (+${saved * 100}%) ${p.n}`);
}

// ---- replay + rules ----
// A spell driven only by commands (the shared script also edits the world directly, which a log cannot replay).
function spell(sim) {
  const t = sim.tick;
  if (t === 3000) { const v = sim.ents.ofKind("villager").find(q => q.born < -100000); sim.apply({ type: "possess", id: v.id }); }
  const v = possessed(sim);
  if (v && t > 3000 && t % 40 === 0) {
    const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][Math.floor(t / 400) % 4];
    let tid = 0;
    if (t % 400 === 0) for (const dz of [0, 1, -1]) for (const id of sim.ents.at(v.x + d[0], v.y + d[1], v.z + dz)) if (sim.ents.get(id).kind === "plant") tid = id;
    sim.apply({ type: "pinput", id: v.id, dx: tid ? 0 : d[0], dy: tid ? 0 : d[1], tid, verb: "" });
  }
}
const a = Sim.create(5);
while (a.tick < 6000) { spell(a); a.step(); }
assert.ok(possessed(a), "mid-possession at tick 6000");
const b = Sim.create(5);
const cmds = a.cmdLog.slice();
let ci = 0;
while (b.tick < a.tick) { while (ci < cmds.length && cmds[ci].t === b.tick) { const { t, ...c } = cmds[ci++]; b.apply(c); } b.step(); }
assert.equal(b.hash(), a.hash(), "replaying the command log (with possession) reproduces the hash");
assert.ok(cmds.some(c => c.type === "pinput") && cmds.some(c => c.type === "possess"), "possession went through the command log");
const c = restore(toJSON(a));
assert.ok(possessed(c) && c.hash() === a.hash(), "save mid-possession restores it");
for (let i = 0; i < 1500; i++) { spell(a); spell(c); a.step(); c.step(); }
assert.equal(a.hash(), c.hash(), "a loaded mid-possession sim continues identically");

// release, one at a time, reservations back after the grace
const { sim, v, tree } = world(9);
sim.apply({ type: "order", ids: [v.id], verb: "chop", tid: tree.id });
for (let i = 0; i < 40; i++) sim.step();
assert.equal(tree.rv, v.id, "AI holds a reservation on its tree");
sim.apply({ type: "possess", id: v.id });
assert.equal(tree.rv, v.id, "kept through the grace period");
for (let i = 0; i < INSPIRE.grace - 20; i++) sim.step();
assert.equal(tree.rv, v.id, "still held before 600 ticks");
for (let i = 0; i < 40; i++) sim.step();
assert.equal(tree.rv, 0, "released after 600 ticks");
const w2 = sim.spawnVillager(); w2.born = v.born;
sim.apply({ type: "possess", id: w2.id });
assert.ok(!v.poss && w2.poss, "one villager at a time");
sim.apply({ type: "release" });
assert.ok(!w2.poss && !possessed(sim), "release clears it");
// need warnings never release it
sim.apply({ type: "possess", id: v.id });
v.hunger = 0.05; v.thirst = 0.1; v.warm = 0.2;
for (let i = 0; i < 100; i++) sim.step();
assert.ok(v.poss, "needs warnings do not release");
v.hp = 3;
for (let i = 0; i < 20; i++) sim.step();
assert.ok(!v.poss, "collapse releases");
// ---- S8: the melee verb is one Action for the AI and the player ----
// A frozen 150-HP target stands beside a lone villager. The AI is ordered to hunt it; the player replays the AI's steps and presses the strike. With the
// +10% buff zeroed the swings land on the same ticks (relative to the first), with the same hit/miss and damage rolls (the "melee" stream), so the target's
// health trace is identical. (The shared stream is consumed per swing, not per controller.)
import { spawnFauna } from "../src/sim/fauna.js";
import { storeInZone } from "../src/sim/items.js";
import { seedCamp } from "../src/sim/belief.js";
function fightWorld(seed) {
  const { sim, v } = world(seed);
  v.hp = 100000;                                               // this test is about the swings, not the survival
  storeInZone(sim, "berry", 40);                               // a stocked village with beds and a rack: no village-critical job outranks the order
  for (let i = 0; i < 3; i++) { const bx = sim.stock.x0 - 3, by = sim.stock.y0 + i * 2, bz = sim.world.standZ(bx, by); sim.ents.add("furniture", { f: i < 2 ? "bed" : "rack", x: bx, y: by, z: bz, owner: 0, rv: 0, rt: 0 }); }
  sim.cache.iv++; seedCamp(sim, v);                            // 9.30: demand is local: it has to KNOW the larder, the beds and the rack (the camp is in its beliefs)
  let cell = null;
  for (let r = 4; r < 9 && !cell; r++) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const x = v.x + dx * r, y = v.y + dy * r, z = sim.world.standZ(x, y); if (z >= 0 && Math.abs(z - v.z) <= 1 && !sim.ents.at(x, y, z).length) { cell = [x, y, z]; break; } }
  const h = spawnFauna(sim, "hopper", cell[0], cell[1], cell[2]);
  h.hp = h.mhp = 150;
  sim.wild.init = 1;                                           // no other creatures: nothing else draws on the shared streams
  for (const e of sim.ents.ofKind("fauna").slice()) if (e !== h) sim.ents.remove(e.id);
  return { sim, v, h };
}
const frozen = (h) => { h.cd = 1e9; };
function aiFight(seed) {
  const { sim, v, h } = fightWorld(seed), moves = [], trace = [];
  sim.apply({ type: "order", ids: [v.id], verb: "hunt", tid: h.id });
  let last = [v.x, v.y, v.z], hp = h.hp;
  for (let i = 0; i < 900 && sim.ents.get(h.id); i++) {
    frozen(h); sim.step();
    if (v.x !== last[0] || v.y !== last[1] || v.z !== last[2]) { moves.push({ from: last, to: [v.x, v.y, v.z] }); last = [v.x, v.y, v.z]; }
    if (h.hp !== hp || (sim.ents.get(h.id) === undefined)) { trace.push([sim.tick, h.hp, h.hd]); hp = h.hp; }
  }
  assert.ok(trace.length >= 3, "the AI landed several blows (got " + trace.length + ")");
  return { moves, trace };
}
function playerFight(seed, ai) {
  const { sim, v, h } = fightWorld(seed), trace = [];
  sim.apply({ type: "possess", id: v.id });
  let mi = 0, sent = false, hp = h.hp;
  const dir = (a, b) => ({ dx: Math.sign(b[0] - a[0]), dy: Math.sign(b[1] - a[1]) });
  for (let i = 0; i < 900 && sim.ents.get(h.id); i++) {
    if (mi < ai.moves.length) {
      const m = ai.moves[mi];
      if (v.x === m.from[0] && v.y === m.from[1] && v.z === m.from[2] && !v.action) sim.apply({ type: "pinput", id: v.id, ...dir(m.from, m.to), tid: 0, verb: "" });
    } else if (!sent && !v.action) { sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: h.id, verb: "" }); sent = true; }
    frozen(h); sim.step();
    const m = ai.moves[mi];
    if (m && v.x === m.to[0] && v.y === m.to[1] && v.z === m.to[2]) mi++;
    if (h.hp !== hp || (sim.ents.get(h.id) === undefined)) { trace.push([sim.tick, h.hp, h.hd]); hp = h.hp; }
  }
  return { trace };
}
{
  const saved = INSPIRE.speed;
  INSPIRE.speed = 0;
  for (const seed of [3, 11]) {
    const ai = aiFight(seed), pl = playerFight(seed, ai);
    const rel = (t) => t.map(([tk, hp, hd]) => [tk - t[0][0], hp, hd]);
    assert.deepEqual(rel(pl.trace), rel(ai.trace), "seed " + seed + ": the same blows land on the same ticks for the same damage, AI or player");
    console.log(`seed ${seed}: melee identical for AI and player: ${ai.trace.length} blows, target ${ai.trace[0][1] + ai.trace[0][2]} -> ${ai.trace[ai.trace.length - 1][1]} HP`);
  }
  INSPIRE.speed = saved;
}

// ---- repeated E on the work in progress continues it (never restarts the countdown) ----
{
  const { sim, v, tree } = world(3);
  sim.apply({ type: "possess", id: v.id });
  const pin = (o) => sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: 0, verb: "", ...o });
  // walk beside the tree with free walk, then chop
  for (let i = 0; i < 2000 && Math.abs(tree.x - v.x) + Math.abs(tree.y - v.y) > 1; i++) {
    pin({ mx: Math.sign(tree.x - v.x) * 64, my: Math.abs(tree.x - v.x) ? 0 : Math.sign(tree.y - v.y) * 64 });
    sim.step();
  }
  pin({ mx: 0, my: 0 });
  assert.ok(Math.abs(tree.x - v.x) + Math.abs(tree.y - v.y) <= 1, "free walk got beside the tree");
  pin({ tid: tree.id }); sim.step();
  for (let i = 0; i < 60; i++) sim.step();
  const p0 = v.action.p, a0 = v.action;
  assert.ok(p0 > 0, "chop is under way");
  pin({ tid: tree.id }); sim.step();
  assert.equal(v.action, a0, "a repeated E keeps the same action object");
  assert.ok(v.action.p >= p0, "the countdown carried on (" + v.action.p + " >= " + p0 + ")");
  assert.ok(!v.poss.fb[0] || v.poss.fb[1] < sim.tick - 5, "no refusal");
}

// ---- free walk: fractions of a cell, walls block, the cell stays authoritative, release leaves it in that cell ----
{
  const { sim, v } = world(3);
  sim.apply({ type: "possess", id: v.id });
  const x0 = v.x, y0 = v.y, z0 = v.z;
  assert.equal(v.poss.ox, 512, "starts mid-cell");
  sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, mx: 64, my: 0, tid: 0, verb: "" });
  sim.step();
  assert.ok(v.poss.ox > 512 && v.poss.ox < 1024 && v.x === x0, "one tick is a fraction of a cell (ox " + v.poss.ox + ")");
  const route = [];
  for (let i = 0; i < 40; i++) { sim.step(); route.push(v.x + "," + v.y + "," + v.z); }
  assert.ok(v.x > x0 || v.x === x0, "walked east or was blocked");
  assert.ok(v.poss.ox >= 0 && v.poss.ox < 1024 && v.poss.oy >= 0 && v.poss.oy < 1024, "offset stays inside its cell");
  assert.ok(sim.world.isWalkable(v.x, v.y, v.z), "the cell it stands in is walkable");
  // determinism: an identical run gives the identical hash
  const run = () => { const q = world(3); q.sim.apply({ type: "possess", id: q.v.id }); for (let i = 0; i < 120; i++) { if (i % 30 === 0) q.sim.apply({ type: "pinput", id: q.v.id, dx: 0, dy: 0, mx: [64, 45, 0, -45][(i / 30) | 0], my: [0, 45, 64, -45][(i / 30) | 0], tid: 0, verb: "" }); q.sim.step(); } return q.sim.hash(); };
  assert.equal(run(), run(), "free walk is deterministic");
  // a wall: walk into a solid neighbour and stop short of its edge
  const cx = v.x, cy = v.y, cz = v.z;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (sim.world.isWalkable(cx + dx, cy + dy, cz) || sim.world.isWalkable(cx + dx, cy + dy, cz + 1) || sim.world.isWalkable(cx + dx, cy + dy, cz - 1)) continue;
    sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, mx: dx * 64, my: dy * 64, tid: 0, verb: "" });
    for (let i = 0; i < 60; i++) sim.step();
    assert.deepEqual([v.x, v.y, v.z], [cx, cy, cz], "a wall blocks free walk");
    assert.ok(dx ? (dx > 0 ? v.poss.ox < 1024 - 100 : v.poss.ox > 100) : (dy > 0 ? v.poss.oy < 1024 - 100 : v.poss.oy > 100), "stops short of the wall");
    break;
  }
  const at = [v.x, v.y, v.z];
  sim.apply({ type: "release" });
  assert.deepEqual([v.x, v.y, v.z], at, "released in the cell it stands in");
  assert.ok(v.poss === undefined, "no sub-cell state left");
}
console.log("possess ok");
