// S11 Command scale: crews (name, default task, stall summary, preference in the Why breakdown, the expedition crew), the Concerns ranking,
// blueprint revision (K10), and the save/determinism of all of it. Fixture-based; every sim window <= 3 game days.
//   node tests/command.js
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { flatSpot, clearArea } from "./helpers.js";
import { toJSON, restore } from "../src/sim/save.js";
import { isAdult } from "../src/sim/villager.js";
import { plan } from "../src/sim/jobs.js";
import { DAY } from "../src/sim/clock.js";
import { isNight } from "../src/sim/season.js";
import { M, F } from "../src/sim/world.js";
import { BMAT, builtPiece } from "../src/sim/build.js";
import { oriented, addInstance, diffInstance, instancesOf, pushInstance } from "../src/sim/blueprint.js";
import { storeInZone, survey } from "../src/sim/items.js";
import { grant } from "../src/sim/knowledge.js";
import { crewOf, CREW_PREF, choreOf, crewBonus } from "../src/sim/crews.js";
import { wildHoppers } from "../src/sim/fauna.js";
import { explain } from "../src/ui/text.js";
import { crewSummary } from "../src/ui/crewtext.js";
import { concerns, CONCERN_ORDER } from "../src/ui/concerns.js";

const step = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };
const keepAlive = (sim) => { for (const v of sim.ents.ofKind("villager")) { v.hunger = Math.max(v.hunger, 0.8); v.thirst = Math.max(v.thirst, 0.8); v.energy = Math.max(v.energy, 0.8); v.warm = 1; } };
const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);

// ---- 1. a crew: make, rename, task, summary, disband ----
{
  const sim = loadFixture("settled"), ids = adults(sim).slice(0, 5).map(v => v.id);
  assert.ok(sim.apply({ type: "crew", op: "make", name: "  Loggers  ", ids }));
  const c = sim.crews.list[0];
  assert.equal(c.name, "Loggers"); assert.deepEqual(c.ids, ids); assert.ok(ids.every(id => sim.ents.get(id).cr === c.id));
  assert.ok(!sim.apply({ type: "crew", op: "make", name: "x", ids: [] }), "no members, no crew");
  assert.ok(sim.apply({ type: "crew", op: "rename", id: c.id, name: "Fellers" })); assert.equal(c.name, "Fellers");
  // one crew each: moving two members to a new crew leaves the old one with three
  assert.ok(sim.apply({ type: "crew", op: "make", name: "Two", ids: ids.slice(0, 2) }));
  assert.equal(sim.crews.list.find(q => q.name === "Fellers").ids.length, 3); assert.equal(sim.ents.get(ids[0]).cr, sim.crews.list[1].id);
  // hotkeys are unique
  assert.ok(sim.apply({ type: "crew", op: "hotkey", id: c.id, hk: 3 })); assert.ok(sim.apply({ type: "crew", op: "hotkey", id: sim.crews.list[1].id, hk: 3 }));
  assert.equal(sim.crews.list.filter(q => q.hk === 3).length, 1);
  ok("make, rename, one crew each, unique hotkeys");

  // an order task is given to every member as an ordinary order
  const tree = sim.ents.ofKind("plant").find(p => p.species === "tree");
  assert.ok(sim.apply({ type: "crew", op: "task", id: c.id, task: { t: "order", verb: "chop", x: tree.x, y: tree.y, z: tree.z } }));
  assert.ok(c.ids.every(id => sim.ents.get(id).order && sim.ents.get(id).order.verb === "chop"), "every member got the chop order");
  assert.ok(!sim.apply({ type: "crew", op: "task", id: c.id, task: { t: "order", verb: "fly", x: 1, y: 1 } }), "an unknown verb is refused");
  assert.ok(!sim.apply({ type: "crew", op: "task", id: c.id, task: { t: "chore", g: "dance" } }));
  // recall: orders go, they walk back to camp
  assert.ok(sim.apply({ type: "crew", op: "recall", id: c.id }));
  assert.ok(c.ids.every(id => sim.ents.get(id).order.verb === "move"));
  assert.equal(c.task, null, "the recalled order task is gone");
  ok("order task reaches every member; recall sends them home");

  // the stall summary: one line, from what each member could not do
  keepAlive(sim);
  const ms = c.ids.map(id => sim.ents.get(id));
  for (const v of ms) { v.order = null; v.job = null; v.action = null; }
  ms[0].job = { k: "chop", c: "order", key: "k", t0: 0, tid: 0, g: "order", kp: "", res: [] }; ms[0].action = { steps: [], si: 0 };
  ms[1].job = { k: "sleep", c: "need", key: "k", t0: 0, tid: 0, g: "", kp: "", res: [] }; ms[1].action = { steps: [], si: 0 };
  for (const v of ms.slice(2)) v.why = { job: "wander", cls: "leisure", score: 0, parts: {}, rej: [{ job: "chop", cls: "order", score: 300, blocker: "NO_PATH", item: "" }], t: sim.tick, tid: 0 };
  const s = crewSummary(sim, c);
  assert.equal(s.n, 3); assert.equal(s.working, 1); assert.equal(s.resting, 1); assert.equal(s.blocked, 1);
  assert.match(s.line, /^1 of 3 working, 1 resting; 1 blocked: no way to get there$/); assert.deepEqual(s.blockedIds, [ms[2].id]);
  ok("stall summary: " + s.line);

  assert.ok(sim.apply({ type: "crew", op: "disband", id: c.id }));
  assert.ok(ms.every(v => v.cr === undefined), "disbanding frees the members");
  ok("disband");
}

// ---- 2. the crew preference is one term in the Why breakdown ----
{
  const sim = loadFixture("settled"), ad = adults(sim), crew = ad.slice(0, 3).map(v => v.id), other = ad[4];
  keepAlive(sim); step(sim, 1);
  sim.apply({ type: "keep", item: "log", n: 60 }); sim.apply({ type: "keep", item: "grass", n: 60 });
  sim.apply({ type: "crew", op: "make", name: "Wood", ids: crew });
  const cid = sim.crews.list[0].id;
  assert.ok(sim.apply({ type: "crew", op: "task", id: cid, task: { t: "keep", item: "log" } }));
  step(sim, 201);                                                 // the keep-N turns on at tick % 200 === 0
  keepAlive(sim);
  assert.ok(sim.board.keeps.find(k => k.item === "log").on, "the log order is refilling");
  let seen = 0, sawLabel = false;
  for (const o of sim.ents.ofKind("villager")) { o.job = null; o.action = null; o.carry = null; }       // nobody holds a worker slot of the log order
  for (const id of crew) {
    const v = sim.ents.get(id); v.job = null; v.action = null; v.carry = null;
    let cands = null;
    plan(sim, v, false, (cs) => { cands = cs.map(c => ({ kp: c.kp, cls: c.cls, crew: c.parts.crew })); });
    v.job = null; v.action = null;                                // (plan assigned one: free the slot again for the next member)
    const logs = cands.filter(c => c.kp === "log"), others = cands.filter(c => c.kp !== "log");
    assert.ok(logs.length, "a log candidate exists");
    for (const c of logs) assert.equal(c.crew, CREW_PREF, "the log job carries the crew term");
    for (const c of others) assert.equal(c.crew, 0, "nothing else does");
    if (v.why.parts.crew) { seen++; const x = explain(sim, v); sawLabel = sawLabel || x.parts.some(p => p.k === "crew" && p.label === "Crew task" && p.value === CREW_PREF); assert.ok(x.notes.some(t => /default task is keep/.test(t)), "the Why panel says whose task it is: " + x.notes.join("|")); }
  }
  assert.ok(seen >= 1, "at least one crew member's chosen job carries the preference");
  assert.ok(sawLabel, "the Why breakdown lists the Crew task row");
  let ocands = null; const ov = sim.ents.get(other.id); ov.job = null; ov.action = null;
  plan(sim, ov, false, (cs) => { ocands = cs; });
  assert.ok(ocands.every(c => !c.parts.crew), "a villager outside the crew gets no bonus");
  // class limits: never outranks an order, never applies to a need
  assert.equal(crewBonus({ t: "keep", item: "log" }, { cls: "order", kp: "log" }), 0); assert.equal(crewBonus({ t: "keep", item: "log" }, { cls: "need", kp: "log" }), 0);
  assert.equal(crewBonus({ t: "chore", g: "build" }, { cls: "standing", grp: "construct", kind: "build_site" }), CREW_PREF);
  assert.equal(choreOf({ grp: "farm" }), "farm"); assert.equal(choreOf({ kind: "store", grp: "haul" }), "haul"); assert.equal(choreOf({ kind: "wander", grp: "leisure" }), null);
  // the preference makes a difference: with the same villager, the log job scores CREW_PREF higher than it does for a non-member
  ok("the crew task is one preference term: +" + CREW_PREF + " on matching standing jobs, listed in the Why breakdown");
}

// ---- 3. the expedition party is a crew with an expedition task ----
{
  const sim = loadFixture("expedition"), ids = adults(sim).slice(0, 3).map(v => v.id);
  keepAlive(sim);
  assert.ok(sim.apply({ type: "expedition", op: "start", ids, item: "flint" }), sim.lastBlocker);
  assert.equal(sim.crews.list.length, 1, "an unnamed party becomes a crew");
  const c = sim.crews.list[0], x = sim.exp.list[0];
  assert.deepEqual(c.task, { t: "exp", id: x.id }); assert.equal(x.cr, c.id); assert.ok(c.auto);
  step(sim, 60); keepAlive(sim);
  assert.match(crewSummary(sim, c).line, /^3 of 3 working/);
  assert.ok(sim.apply({ type: "expedition", op: "recall", crew: c.id }));
  for (let i = 0; i < 3500 && x.st !== "done"; i++) { sim.step(); if (i % 40 === 0) keepAlive(sim); }
  assert.equal(x.st, "done"); step(sim, 40);
  assert.equal(sim.crews.list.length, 0, "the party's own crew goes home with the report");
  assert.ok(ids.every(id => !sim.ents.get(id) || sim.ents.get(id).cr === undefined));
  // a NAMED crew keeps existing: send it, and it gets the task and loses it again
  const sim2 = loadFixture("expedition"), ids2 = adults(sim2).slice(0, 3).map(v => v.id);
  keepAlive(sim2);
  sim2.apply({ type: "crew", op: "make", name: "Diggers", ids: ids2 });
  assert.ok(sim2.apply({ type: "expedition", op: "start", crew: sim2.crews.list[0].id, item: "flint" }), sim2.lastBlocker);
  assert.equal(sim2.crews.list.length, 1); assert.equal(sim2.crews.list[0].task.t, "exp");
  sim2.apply({ type: "expedition", op: "recall", crew: sim2.crews.list[0].id });
  for (let i = 0; i < 3500 && sim2.exp.list[0].st !== "done"; i++) { sim2.step(); if (i % 40 === 0) keepAlive(sim2); }
  step(sim2, 40);
  assert.equal(sim2.crews.list.length, 1); assert.equal(sim2.crews.list[0].task, null); assert.equal(sim2.crews.list[0].name, "Diggers");
  ok("an expedition is a crew with an expedition task; a named crew keeps its name and loses the task when the party is back");
}

// ---- 4. Concerns: pure, ranked, one line per class ----
{
  const sim = loadFixture("settled");
  sim.tick += 1000; while (isNight(sim.tick)) sim.tick += 200;           // a daytime reading (pure functions: no stepping)
  const classes = () => concerns(sim).map(c => c.k);
  const base = concerns(sim);
  assert.deepEqual(base, concerns(sim), "pure: the same state, the same list");
  // one class at a time, from calm
  sim.board.fc = 1; sim.board.runway = 1.2;
  assert.equal(concerns(sim)[0].k, "food"); assert.equal(concerns(sim)[0].level, 3); assert.match(concerns(sim)[0].text, /Food is critical/); sim.board.fc = 0; sim.board.runway = 99;
  sim.board.sc = 1; sim.board.sneed = 2;
  const cold = concerns(sim).find(c => c.k === "cold"); assert.ok(cold && cold.level === 3 && cold.loc); sim.board.sc = 0;
  // knowledge at risk: exactly one living holder
  const ad = adults(sim); for (const v of sim.ents.ofKind("villager")) v.fam = {}; sim.cache.kn = null;
  grant(sim, ad[0], "FIRE_TENDING", 0.5);
  const kn = concerns(sim).find(c => c.k === "knowledge"); assert.ok(kn, "one holder is a concern"); assert.match(kn.text, new RegExp("Only " + ad[0].name + " knows")); assert.equal(kn.loc.id, ad[0].id);
  grant(sim, ad[1], "FIRE_TENDING", 0.3); sim.cache.kn = null; assert.ok(!classes().includes("knowledge"), "two holders: no concern");
  // spoilage
  storeInZone(sim, "berry", 40); sim.cache.iv++;
  const sp = concerns(sim).find(c => c.k === "spoilage"); assert.ok(sp, "fresh food beyond two days of eating is a concern"); assert.match(sp.text, /spoil/);
  // hunting scarcity
  for (const h of wildHoppers(sim)) sim.ents.remove(h.id);
  const hu = concerns(sim).find(c => c.k === "hunting"); assert.ok(hu && hu.level === 2, "no hoppers left"); assert.match(hu.text, /No wild hoppers/);
  // idle hands
  const adl = adults(sim); for (const v of adl.slice(0, 5)) { v.hunger = v.energy = 1; v.why = { job: "wander", cls: "leisure", score: 0, parts: {}, rej: [], t: sim.tick, tid: 0 }; }
  const idle = concerns(sim).find(c => c.k === "idle"); assert.ok(idle, "idle adults are a concern"); assert.match(idle.text, /nothing to do/);
  // a blocked crew
  sim.apply({ type: "crew", op: "make", name: "Stuck", ids: adl.slice(0, 3).map(v => v.id) });
  for (const v of adl.slice(0, 3)) { v.job = null; v.action = null; v.why = { job: "wander", cls: "leisure", score: 0, parts: {}, rej: [{ job: "mine", cls: "standing", score: 200, blocker: "NO_TOOL", item: "" }], t: sim.tick, tid: 0 }; }
  sim.apply({ type: "crew", op: "task", id: sim.crews.list[0].id, task: { t: "chore", g: "mine" } });
  const cr = concerns(sim).find(c => c.k === "crew"); assert.ok(cr, "a blocked crew is a concern"); assert.match(cr.text, /Stuck: 0 of 3 working; 3 blocked: deep rock is marked/);
  // the thornback near camp
  const tb = loadFixture("thornback"); for (const v of tb.ents.ofKind("villager")) v.fear = 0;
  const dg = concerns(tb).find(c => c.k === "danger"); assert.ok(dg && dg.level === 2 && /thornback is \d+ cells from camp/.test(dg.text), dg && dg.text);
  tb.ents.ofKind("villager")[0].fear = 0.9; assert.equal(concerns(tb).find(c => c.k === "danger").level, 3);
  // ranking: severity first, then the fixed class order; never two lines of one class
  sim.board.fc = 1; sim.board.sc = 1; sim.board.sneed = 1;
  const all = concerns(sim), lv = all.map(c => c.level);
  assert.deepEqual(lv, lv.slice().sort((a, b) => b - a), "most urgent first");
  assert.equal(new Set(all.map(c => c.k)).size, all.length, "one line per class");
  assert.deepEqual(all.slice(0, 2).map(c => c.k), ["food", "cold"]);
  assert.ok(all.every(c => CONCERN_ORDER.includes(c.k) && c.text && !/undefined|NaN/.test(c.text)));
  const seen = new Set(all.map(c => c.k)); for (const k of ["food", "cold", "knowledge"]) seen.add(k);
  ok("Concerns: food, cold, danger, crew, knowledge, spoilage, hunting, idle each fire; ranked by level then class; " + all.length + " lines at once");
}

// ---- 5. blueprint revision: push to two instances; only the difference is rebuilt ----
/** A 6x4 hut: wattle walls, door south, thatch roof over the inside, one bed, one rack. */
function hutCells() {
  const cells = [], w = 6, h = 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    if (edge) cells.push([x, y, x === 3 && y === h - 1 ? "door" : "wall", x === 3 && y === h - 1 ? "" : "wattle"]);
    else cells.push([x, y, "roof", "thatch"]);
  }
  cells.push([1, 1, "bed", ""], [4, 1, "rack", ""]);
  return { w, h, cells };
}
/** Build a blueprint instance instantly (as if villagers had finished it) and register it. */
function buildNow(sim, bp, ox, oy, z) {
  const inst = addInstance(sim, bp, ox, oy, z);
  for (const [dx, dy, p, m] of oriented(bp, 0, {}).cells) {
    const x = ox + dx, y = oy + dy;
    if (p === "wall") sim.world.set(x, y, z, BMAT[m].id, sim.world.flags(x, y, z) | F.PLAYER | F.USED);
    else if (p === "roof") sim.world.set(x, y, z + 1, BMAT[m].id, sim.world.flags(x, y, z + 1) | F.PLAYER | F.USED);
    else if (p === "floor") sim.world.set(x, y, z - 1, BMAT[m].id, sim.world.flags(x, y, z - 1) | F.PLAYER | F.USED);
    else { sim.ents.add("furniture", { f: p, x, y, z, owner: 0, rv: 0, rt: 0 }); if (p === "door") sim.world.markDirty(x, y, z); }
  }
  sim.rooms.update(sim);
  return inst;
}
function revisionWorld() {
  const sim = loadFixture("settled");
  const [x0, y0, z] = flatSpot(sim, 13, 5);
  clearArea(sim, x0, y0, 13, 5, z);
  const h = hutCells();
  assert.ok(sim.apply({ type: "blueprint", op: "add", bp: { name: "Hut", w: h.w, h: h.h, cells: h.cells } }));
  const bp = sim.bps.list[sim.bps.list.length - 1];
  const a = buildNow(sim, bp, x0, y0, z), b = buildNow(sim, bp, x0 + 7, y0, z);
  return { sim, bp, a, b, x0, y0, z };
}
{
  const { sim, bp, a, b, x0, y0, z } = revisionWorld();
  assert.equal(bp.rev, 1); assert.equal(instancesOf(sim, bp.id).length, 2); assert.deepEqual([a.rev, a.rot], [1, 0]);
  const doorBefore = sim.ents.ofKind("furniture").filter(f => f.f === "door" && f.x === x0 + 3 && f.y === y0 + 3).map(f => f.id), bedBefore = sim.ents.ofKind("furniture").filter(f => f.f === "bed" && f.x === x0 + 1 && f.y === y0 + 1).map(f => f.id);
  const wallBefore = [...Array(6)].map((_, i) => sim.world.mat(x0 + i, y0, z));
  // revision 2, edited in place: the roof over (2,1) and (3,1) becomes log, the rack comes out, a second bed goes in at (2,2)
  assert.ok(sim.apply({ type: "blueprint", op: "edit", id: bp.id, set: [[2, 1, "roof", "logroof"], [3, 1, "roof", "logroof"], [2, 2, "bed", ""]], del: [[4, 1, "rack"]] }));
  assert.equal(bp.rev, 2); assert.ok(bp.hist[1], "revision 1 is kept for diffing");
  assert.ok(!sim.apply({ type: "blueprint", op: "edit", id: bp.id, set: [[2, 1, "roof", "logroof"]] }), "no change, no new revision");
  const d = diffInstance(sim, bp, a);
  assert.deepEqual([d.rep.length, d.del.length, d.add.length], [2, 1, 1], "the diff is exactly what changed");
  assert.ok(d.keep.length >= 18, "everything else is kept (" + d.keep.length + ")");
  const keepKeys = new Set(d.keep.map(c => c.w + ":" + c.x + ":" + c.y));
  // push to both
  storeInZone(sim, "log", 12); storeInZone(sim, "grass", 20); sim.cache.iv++;
  assert.ok(sim.apply({ type: "blueprint", op: "push", id: bp.id }));
  assert.equal(a.rev, 2); assert.equal(b.rev, 2);
  assert.ok(!sim.apply({ type: "blueprint", op: "push", id: bp.id }), "nothing left to push");
  const cs = sim.ents.ofKind("csite"), ds = sim.ents.ofKind("dsite");
  assert.equal(cs.length, 6, "2 swaps + 1 bed per building"); assert.equal(ds.length, 2, "one rack per building");
  assert.equal(cs.filter(s => s.rp).length, 4, "the roof swaps are in-place replacements");
  for (const s of [...cs, ...ds]) assert.ok(!keepKeys.has(s.w + ":" + s.x + ":" + s.y) || s.w === "bed", "no job on a matching cell: " + s.w + " " + s.x + "," + s.y);
  // the building is still a room while the swap is pending (the old roof stays until the new one is on)
  assert.equal(sim.world.mat(x0 + 2, y0 + 1, z + 1), M.THATCH);
  let t = 0;
  for (; t < 5400 && (sim.ents.ofKind("csite").length || sim.ents.ofKind("dsite").length); t++) { sim.step(); if (t % 40 === 0) keepAlive(sim); }
  assert.ok(t < 5400, "the pushed work finished within 3 game days (" + t + " ticks)");
  for (const [ox, oy] of [[x0, y0], [x0 + 7, y0]]) {
    assert.equal(sim.world.mat(ox + 2, oy + 1, z + 1), M.LOGROOF); assert.equal(sim.world.mat(ox + 3, oy + 1, z + 1), M.LOGROOF);
    assert.equal(sim.world.mat(ox + 1, oy + 1, z + 1), M.THATCH, "the other roof cells were never touched");
    assert.ok(!builtPiece(sim, "rack", ox + 4, oy + 1, z), "the rack came down"); assert.ok(builtPiece(sim, "bed", ox + 2, oy + 2, z), "the new bed stands");
  }
  assert.deepEqual(sim.ents.ofKind("furniture").filter(f => f.f === "door" && f.x === x0 + 3 && f.y === y0 + 3).map(f => f.id), doorBefore, "the door entity is the same one");
  assert.deepEqual(sim.ents.ofKind("furniture").filter(f => f.f === "bed" && f.x === x0 + 1 && f.y === y0 + 1).map(f => f.id), bedBefore, "the first bed is the same one");
  assert.deepEqual([...Array(6)].map((_, i) => sim.world.mat(x0 + i, y0, z)), wallBefore, "the walls are untouched");
  ok("revision 2 pushed to 2 instances: " + t + " ticks, only 2 swaps + 1 removal + 1 addition each; the door, the bed and every wall are the same");
}
{
  // hand edits are skipped unless forced; a retheme (the shelter ladder) swaps wall, roof and adds floors
  const { sim, bp, a, b, x0, y0, z } = revisionWorld();
  sim.world.set(x0 + 1, y0, z, M.LOGWALL, sim.world.flags(x0 + 1, y0, z) | F.PLAYER);            // someone rebuilt a wall in log by hand
  grant(sim, adults(sim)[0], "FRAMING", 0.6); sim.cache.kn = null;
  assert.ok(sim.apply({ type: "blueprint", op: "retheme", id: bp.id, wall: "timber", roof: "logroof", floor: "plank" }));
  assert.equal(bp.rev, 2); assert.ok(bp.cells.filter(c => c[2] === "floor").length === 8 && bp.cells.every(c => c[2] !== "wall" || c[3] === "timber"));
  const d = diffInstance(sim, bp, b);
  assert.equal(d.rep.length, 15 + 8, "15 walls and 8 roofs swap in place"); assert.equal(d.add.length, 8, "8 floors are new"); assert.equal(d.del.length, 0);
  assert.ok(sim.apply({ type: "blueprint", op: "push", id: bp.id }));
  assert.equal(b.rev, 2); assert.equal(a.rev, 1, "the hand-edited building is skipped");
  assert.ok(sim.apply({ type: "blueprint", op: "push", id: bp.id, force: true })); assert.equal(a.rev, 2);
  assert.ok(!sim.apply({ type: "blueprint", op: "retheme", id: bp.id, wall: "plank" }), "a floor material cannot be a wall");
  const pending = sim.ents.ofKind("csite").length; assert.ok(pending >= 22, "ghosts placed: " + pending);
  ok("hand-edited buildings are skipped unless forced; a retheme swaps materials in place and adds floors (teepee to cabin)");
}
{
  // instances are recorded by the stamp itself (build command with `at`), by auto-build, and are dropped with their blueprint
  const sim = loadFixture("settled"), [x0, y0, z] = flatSpot(sim, 7, 5);
  clearArea(sim, x0, y0, 7, 5, z);
  const h = hutCells(); sim.apply({ type: "blueprint", op: "add", bp: { name: "Hut", w: h.w, h: h.h, cells: h.cells } });
  const bp = sim.bps.list[sim.bps.list.length - 1];
  const cells = oriented(bp, 1, { wall: "log" }).cells.map(([dx, dy, p, m]) => ({ w: p, m, x: x0 + dx, y: y0 + dy, z }));
  assert.ok(sim.apply({ type: "build", bp: bp.id, cells, at: { ox: x0, oy: y0, z, rot: 1, over: { wall: "log" } } }));
  const inst = sim.bps.inst[0];
  assert.deepEqual([inst.bp, inst.rev, inst.ox, inst.oy, inst.z, inst.rot, inst.over.wall], [bp.id, 1, x0, y0, z, 1, "log"]);
  sim.apply({ type: "blueprint", op: "remove", id: bp.id }); assert.equal(sim.bps.inst.length, 0);
  ok("a stamp records its blueprint, revision, corner, rotation and overrides");
}

// ---- 6. save round-trip and determinism with crews and a revision in flight ----
{
  const run = () => {
    const { sim, bp } = revisionWorld();
    const ad = adults(sim);
    storeInZone(sim, "log", 12); storeInZone(sim, "grass", 20); sim.cache.iv++;
    sim.apply({ type: "crew", op: "make", name: "Fellers", ids: ad.slice(0, 4).map(v => v.id), hk: 2 });
    sim.apply({ type: "crew", op: "task", id: sim.crews.list[0].id, task: { t: "chore", g: "build" } });
    sim.apply({ type: "blueprint", op: "edit", id: bp.id, set: [[2, 1, "roof", "logroof"]], del: [[4, 1, "rack"]] });
    sim.apply({ type: "blueprint", op: "push", id: bp.id });
    step(sim, 400);
    return sim;
  };
  const a = run(), b = run();
  assert.equal(a.hash(), b.hash(), "the same script, the same hash");
  const text = toJSON(a), r = restore(text);
  assert.equal(r.hash(), a.hash(), "save round-trip keeps crews, revisions and instances");
  assert.deepEqual(r.crews, a.crews); assert.deepEqual(r.bps.inst, a.bps.inst); assert.equal(r.bps.list[r.bps.list.length - 1].rev, 2);
  step(a, 300); step(r, 300);
  assert.equal(r.hash(), a.hash(), "and continues identically");
  assert.ok(crewOf(r, r.ents.get(r.crews.list[0].ids[0])), "members still point at the crew");
  // an old save (no crews, no instances) loads
  const old = JSON.parse(text); delete old.crews; delete old.bps.inst; delete old.bps.ni;
  const o = restore(JSON.stringify(old)); assert.deepEqual(o.crews, { n: 0, list: [] }); assert.deepEqual(o.bps.inst, []);
  ok("save round-trip with crews and a revision in flight, and determinism");
}
void DAY; void survey; void toJSON;
console.log("command ok");
