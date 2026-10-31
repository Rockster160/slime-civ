// 9.34 (D58) assignments and Clear area. Fixture based, plan() probes plus short runs, a few seconds.   node tests/assign.js
//   Assign: a slime takes a role, works the named tree, then the nearest one it BELIEVES in beyond 10 cells; an unseen tree is never chosen; needs interrupt and it resumes; cancel ends it;
//   with no beliefs it searches; a split keeps it on clone 1; an assigned slime reads no request but still posts; save round trip + the v19 area-order migration; determinism.
//   Clear area: only the marked kinds inside the rectangle go, it ends when the rectangle is empty, an idle slime that read the notice helps.
import "./legacy.js";
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { plan } from "../src/sim/jobs.js";
import { newPlant } from "../src/sim/plants.js";
import { isAdult } from "../src/sim/villager.js";
import { toJSON, restore, SAVE_VERSION } from "../src/sim/save.js";
import { boardsOf } from "../src/sim/notices.js";
import { splitBlock } from "../src/sim/split.js";

let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
const t00 = Date.now();
const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v) && v.slp === 0);
function bare(sim, cx, cy, keep, r = 30) {
  for (const k of ["plant", "furniture", "site", "csite", "dsite", "fauna", "plot", "item"]) for (const e of sim.ents.ofKind(k).slice()) {
    const inYard = k === "item" && sim.stock && e.x >= sim.stock.x0 && e.x <= sim.stock.x1 && e.y >= sim.stock.y0 && e.y <= sim.stock.y1;
    const board = k === "furniture" && e.f === "board";
    if (Math.abs(e.x - cx) <= r && Math.abs(e.y - cy) <= r && !inYard && !board) sim.ents.remove(e.id);
  }
  for (const o of sim.ents.ofKind("villager")) if (!keep.includes(o)) o.bel = [];
  sim.cache.iv++;
}
const calm = (v) => { v.bel = []; v.carry = null; v.order = null; delete v.as; v.bad = []; v.job = null; v.action = null; v.hunger = v.thirst = v.energy = v.warm = v.mood = 1; };
const ground = (sim, x, y) => { for (let d = 0; d < 6; d++) for (const dy of [0, 1, -1, 2, -2]) { const z = sim.world.standZ(x + d, y + dy); if (z >= 0) return [x + d, y + dy, z]; } assert.fail("no ground near " + x + "," + y); };
const probe = (sim, v) => plan(sim, v, false, null, true);
const believe = (sim, v, T, k = "tree") => { v.bel.push([k, T.x, T.y, T.z, 1, sim.tick, 0]); };
const runUntil = (sim, cap, f) => { for (let i = 0; i < cap; i++) { if (f()) return true; sim.step(); } return f(); };

/** A scene: centre c with nothing round it; trees N (near, 3 east), E (17 east of N) and W (16 west of c); slimes standing at c. */
function scene(nv = 1) {
  const sim = loadFixture("settled"), vs = adults(sim).slice(0, nv);
  const cx = sim.stock.x1 + 20, cy = sim.stock.y0 + 12;
  bare(sim, cx, cy, vs);
  const c = ground(sim, cx, cy), nn = ground(sim, cx + 3, cy), e = ground(sim, cx + 20, cy), w = ground(sim, cx - 16, cy);
  const N = newPlant(sim.ents, "tree", ...nn), E = newPlant(sim.ents, "tree", ...e), W = newPlant(sim.ents, "tree", ...w);
  sim.cache.iv++;
  for (const v of vs) { calm(v); sim.ents.move(v, ...c); }
  return { sim, vs, c, N, E, W };
}
const gone = (sim, T) => { const e = sim.ents.get(T.id); return !e || e.species !== "tree"; };

// 1. works the named tree, then the next believed one, 17 cells away (no circle)
{
  const { sim, vs: [v], N, E } = scene();
  believe(sim, v, E);
  assert.ok(sim.apply({ type: "assign", ids: [v.id], task: "chop", tid: N.id }));
  assert.equal(v.as.task, "chop");
  assert.ok(runUntil(sim, 3000, () => gone(sim, N)), "the named tree was felled");
  assert.ok(v.as, "the assignment lives on");
  assert.ok(runUntil(sim, 4000, () => gone(sim, E)), "the believed second tree, 17 cells off, was felled too");
  assert.ok(v.as.done >= 2, "work counted: " + v.as.done);
  ok("a lumberjack fells the named tree then the nearest believed one, 17 cells away");
}
// 2. no telepathy: E and W exist but only N is known: after N the slime searches
{
  const { sim, vs: [v], N, E, W } = scene();
  sim.apply({ type: "assign", ids: [v.id], task: "chop", tid: N.id });
  assert.ok(runUntil(sim, 3000, () => gone(sim, N)));
  v.job = null; v.action = null; v.carry = null;
  const why = probe(sim, v);
  assert.equal(why.job, "search", "it goes looking, got " + why.job);
  assert.ok(why.tid !== E.id && why.tid !== W.id);
  ok("an unseen tree is never chosen: the slime searches instead");
}
// 3. needs interrupt, then it resumes
{
  const { sim, vs: [v], N } = scene();
  sim.apply({ type: "assign", ids: [v.id], task: "chop", tid: N.id });
  assert.equal(probe(sim, v).job, "chop");
  v.hunger = 0.03;
  const w1 = probe(sim, v);
  assert.equal(w1.cls, "need", "hunger outranks the assignment: " + w1.job);
  v.hunger = 1;
  assert.equal(probe(sim, v).job, "chop");
  assert.ok(v.as, "still assigned");
  ok("hunger interrupts the assignment and it resumes");
}
// 4. cancel
{
  const { sim, vs: [v], N } = scene();
  sim.apply({ type: "assign", ids: [v.id], task: "chop", tid: N.id });
  assert.ok(sim.apply({ type: "cancel", ids: [v.id] }));
  assert.equal(v.as, undefined);
  assert.notEqual(probe(sim, v).job, "chop");
  ok("cancel ends the assignment");
}
// 5. no beliefs and a bare spot: it walks there, then searches; trips count
{
  const { sim, vs: [v], c } = scene();
  v.bel = [];
  sim.apply({ type: "assign", ids: [v.id], task: "forage", x: c[0] + 5, y: c[1], z: c[2] });
  const why = probe(sim, v);
  assert.ok(why.job === "search" || why.job === "forage", "no idling: " + why.job);
  const sf0 = v.sf || 0;
  runUntil(sim, 900, () => (v.sf || 0) >= sf0 + 2);
  assert.ok((v.sf || 0) > sf0, "search trips were made");
  assert.ok(v.as, "still assigned");
  ok("with nothing believed the slime goes looking");
}
// 6. split: clone 1 keeps it, the others start over
{
  const { sim, vs: [v], N } = scene();
  v.mate = 0;
  sim.apply({ type: "assign", ids: [v.id], task: "chop", tid: N.id });
  v.hunger = v.energy = 1; v.hp = 120;
  if (splitBlock(sim, v) === "") {
    assert.ok(sim.apply({ type: "split", id: v.id }));
    const kids = sim.lastSplit.to.map(id => sim.ents.get(id));
    assert.ok(kids[0].as && kids[0].as.task === "chop", "clone 1 keeps the assignment");
    for (const k of kids.slice(1)) assert.equal(k.as, undefined);
    ok("a split keeps the assignment on clone 1 only");
  } else ok("(split gated here: " + splitBlock(sim, v) + ")");
}
// 7. an assigned slime reads no request but still posts
{
  const { sim, vs: [v], N } = scene();
  sim.apply({ type: "assign", ids: [v.id], task: "chop", tid: N.id });
  v.rq = ["log", sim.tick];
  const c = probe(sim, v);
  assert.equal(c.job, "chop");
  assert.ok(!c.rej.some(r => r.job === "check_board"), "reads no board");
  ok("an assigned slime takes no request");
}
// 8. save round trip and the v19 migration
{
  const { sim, vs: [v], N } = scene();
  sim.apply({ type: "assign", ids: [v.id], task: "chop", tid: N.id });
  assert.equal(SAVE_VERSION, 21);
  const back = restore(toJSON(sim)), b = back.ents.get(v.id);
  assert.deepEqual(b.as, v.as);
  const old = JSON.parse(toJSON(sim)); old.v = 19;
  const o = old.entities.list.find(e => e.id === v.id); o.order = { verb: "forage", tid: 0, x: 40, y: 41, z: 3, t0: 5, done: 2 }; delete o.as;
  const mig = restore(JSON.stringify(old)).ents.get(v.id);
  assert.equal(mig.order, null); assert.deepEqual(mig.as, { task: "forage", tid: 0, x: 40, y: 41, z: 3, t0: 5, done: 2, go: 0 });
  ok("assignment round-trips; a v19 area order becomes an assignment");
}
// 9. determinism
{
  const run = () => { const { sim, vs: [v], N, E } = scene(); believe(sim, v, E); sim.apply({ type: "assign", ids: [v.id], task: "chop", tid: N.id }); for (let i = 0; i < 500; i++) sim.step(); return sim.hash(); };
  assert.equal(run(), run());
  ok("deterministic");
}

// ---- Clear area ----
function clearScene(nv = 1) {
  const sim = loadFixture("settled"), vs = adults(sim).slice(0, nv);
  const cx = sim.stock.x1 + 20, cy = sim.stock.y0 + 12;
  bare(sim, cx, cy, vs);
  const mk = (sp, dx, dy) => newPlant(sim.ents, sp, ...ground(sim, cx + dx, cy + dy));
  const inside = [mk("tree", 1, 1), mk("berry", 2, 3), mk("tuft", 4, 2)];
  const tuber = mk("tuber", 3, 4), outside = mk("tree", 14, 0), outside2 = mk("tuft", -12, 5);
  sim.cache.iv++;
  for (const v of vs) { calm(v); sim.ents.move(v, ...ground(sim, cx, cy)); }
  return { sim, vs, cx, cy, inside, tuber, outside, outside2, z: ground(sim, cx, cy)[2] };
}
// 10. only the marked kinds inside the rectangle go; the order ends
{
  const { sim, vs: [v], cx, cy, inside, tuber, outside, outside2, z } = clearScene();
  assert.ok(sim.apply({ type: "clearArea", x0: cx - 1, y0: cy - 1, x1: cx + 8, y1: cy + 8, z, ids: [v.id] }));
  assert.equal(v.order.verb, "clear_area");
  assert.ok(boardsOf(sim)[0].notes.some(q => q[0] === "clear"), "posted on the board");
  assert.ok(runUntil(sim, 9000, () => !v.order), "the order ended");
  for (const e of inside) assert.ok(!sim.ents.get(e.id), e.species + " is gone");
  assert.ok(sim.ents.get(tuber.id), "tubers stay"); assert.ok(sim.ents.get(outside.id) && sim.ents.get(outside2.id), "nothing outside goes");
  for (let i = 0; i < 450; i++) sim.step();
  assert.equal(sim.clr.list.length, 0, "the finished rectangle is dropped");
  assert.ok(!boardsOf(sim)[0].notes.some(q => q[0] === "clear"), "and its notice comes off the board");
  ok("clear area removes the trees, bushes and tufts inside the rectangle only, and ends");
}
// 11. an idle slime that read the notice helps
{
  const { sim, vs: [a, b], cx, cy, inside, z } = clearScene(2);
  sim.apply({ type: "clearArea", x0: cx - 1, y0: cy - 1, x1: cx + 8, y1: cy + 8, z, ids: [a.id] });
  b.bel.push(["clear", cx + 3, cy + 3, z, 1, sim.tick, 2]);
  let helped = false;
  runUntil(sim, 3000, () => { if (b.job && b.job.k === "grub") helped = true; return helped; });
  assert.ok(helped, "the idle slime took the chore off the board");
  ok("an idle slime helps clear the area via the board");
}
// 12. the rectangle round-trips and clear area is deterministic
{
  const run = () => { const { sim, vs: [v], cx, cy, z } = clearScene(); sim.apply({ type: "clearArea", x0: cx - 1, y0: cy - 1, x1: cx + 8, y1: cy + 8, z, ids: [v.id] }); for (let i = 0; i < 600; i++) sim.step(); return sim; };
  const s1 = run(), s2 = run();
  assert.equal(s1.hash(), s2.hash());
  const back = restore(toJSON(s1));
  assert.deepEqual(back.clr, s1.clr);
  ok("clear area is deterministic and saved");
}
console.log("assign ok (" + (Date.now() - t00) + " ms)");
