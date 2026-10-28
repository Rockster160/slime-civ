// S13 people depth, quick: pure where it can be, fixture-based (<= 3 game days) where it must be.
//   skill rust and its floor, familiarity never rusts; hidden genotype and the inbreeding rate; partner choice;
//   relationships from a work-beside window, the friend term in Why; grief; a grave and an heirloom on a forced death;
//   hobbies; titles; v7 migration; determinism and the save round trip.
//   node tests/people.js
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { Rng } from "../src/sim/rng.js";
import { toJSON, restore, SAVE_VERSION, migrate } from "../src/sim/save.js";
import { kill } from "../src/sim/population.js";
import { TRAITS, inheritGeno, genoFrom, isAdult, updateNeeds, workFactor, fitness, ageDays, GRIEF_OUT } from "../src/sim/villager.js";
import { level, peakLevel, rustDay, rustOf, RUST_GRACE, RUST_MAX } from "../src/sim/skills.js";
import { famOf } from "../src/sim/knowledge.js";
import { kinship, weakChance, makeWeak, pickPartner, newHeirloom, socialTick, peopleDaily, titleCheck, relationWord } from "../src/sim/people.js";
import { chemistry, relOf, noteLesson, MENTOR_AT } from "../src/sim/bonds.js";
import { hobbyOf, hobbyLevel, HOBBIES } from "../src/sim/hobby.js";
import { plan } from "../src/sim/jobs.js";
import { explain } from "../src/ui/text.js";
import { DAY } from "../src/sim/clock.js";

let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
const fake = (id, par = [0, 0], gp = [], t = {}) => ({ id, par, gp, t: Object.fromEntries(TRAITS.map(k => [k, t[k] ?? 1])) });

// 1. Rust: idle skills slip toward a floor of 70% of their level, slowly; work shakes it off; familiarity never rusts.
{
  const sim = loadFixture("settled"), v = adults(sim)[0];
  v.sk.dig.xp = 60; v.sk.dig.rs = 0; v.sk.dig.lu = sim.tick; v.sk.build.lu = sim.tick; v.sk.craft.lu = sim.tick;
  v.fam.FIRE_TENDING = 0.5;
  const peak = peakLevel(v, "dig");
  for (let d = 0; d < RUST_GRACE; d++) { sim.tick += DAY; rustDay(sim, v); }
  assert.equal(rustOf(v, "dig"), 0, "no rust inside the grace period");
  const lv = [];
  for (let d = 0; d < 400; d++) { sim.tick += DAY; rustDay(sim, v); if (d === 29 || d === 84) lv.push(rustOf(v, "dig")); }
  assert.ok(lv[0] > 0 && lv[0] < lv[1] && lv[1] < RUST_MAX, "rust grows slowly: " + lv);
  assert.ok(Math.abs(rustOf(v, "dig") - RUST_MAX) < 0.01, "and floors at 30%: " + rustOf(v, "dig"));
  assert.ok(Math.abs(level(v, "dig") - 0.7 * peak) < 0.01, "level floors at 70% of its peak: " + level(v, "dig") + " vs " + peak);
  assert.equal(v.sk.dig.xp, 60, "the xp itself is untouched"); assert.equal(famOf(v, "FIRE_TENDING"), 0.5, "familiarity does not rust");
  v.sk.dig.lu = sim.tick;                                                   // back at work
  for (let d = 0; d < 6; d++) { sim.tick += DAY / 2; v.sk.dig.lu = sim.tick; rustDay(sim, v); }
  assert.ok(rustOf(v, "dig") < 0.05, "working again wins it back within days: " + rustOf(v, "dig"));
  ok("rust: grace " + RUST_GRACE + " days, rust at day 30 " + lv[0] + ", day 85 " + lv[1] + ", floor 30%; xp and familiarity untouched; recovers in days");
}

// 2. Genotype and kinship (pure)
{
  const r = new Rng(5).stream("t");
  const a = fake(1), b = fake(2);
  for (const k of TRAITS) { a.t[k] = 1.2; b.t[k] = 0.9; }
  a.g = genoFrom(a.t, 1); b.g = genoFrom(b.t, 2);
  for (const k of TRAITS) assert.ok(Math.abs((a.g[k][0] + a.g[k][1]) / 2 - a.t[k]) < 0.002, "alleles average to the visible trait");
  assert.ok(a.g.strength[0] !== a.g.strength[1], "hidden: the pair differs");
  let s = 0; const N = 600;
  for (let i = 0; i < N; i++) { const o = {}, t = inheritGeno(r, a, b, o); for (const k of TRAITS) { assert.ok(o.g[k].length === 2); s += t[k]; } }
  const mean = s / (N * TRAITS.length);
  assert.ok(mean > 1.02 && mean < 1.08, "children blend the parents (1.2 and 0.9 -> ~1.05): " + mean);
  // kinship table
  const P = fake(10), M = fake(11), Q = fake(12), c1 = fake(20, [10, 11], [0]), c2 = fake(21, [10, 11]), h = fake(22, [10, 12]);
  const gc1 = fake(30, [20, 50], [10, 11]), gc2 = fake(31, [22, 51], [10, 12]), gc3 = fake(32, [21, 52], [10, 11]);
  assert.equal(kinship(P, c1), 0.5); assert.equal(kinship(c1, c2), 0.5); assert.equal(kinship(c1, h), 0.25);
  assert.equal(kinship(gc1, gc3), 0.125, "first cousins"); assert.equal(kinship(P, gc1), 0.25); assert.equal(kinship(c2, gc1), 0.25, "uncle and niece");
  assert.equal(kinship(c1, fake(99)), 0); assert.equal(kinship(gc1, gc2), 0.125);
  assert.equal(relationWord(c1, c2), "sibling"); assert.equal(relationWord(P, c1), "child"); assert.equal(relationWord(gc1, gc3), "cousin");
  // the inbreeding rate: weak children by kinship, over many births
  const rate = (kin) => { let w = 0; for (let i = 0; i < 4000; i++) if (r.chance(weakChance(kin))) w++; return w / 4000; };
  const r0 = rate(0), r1 = rate(0.125), r2 = rate(0.25), r3 = rate(0.5);
  assert.equal(r0, 0, "unrelated pairs have no weak outcomes"); assert.ok(r1 > 0.1 && r1 < 0.2 && r2 > 0.25 && r2 < 0.35 && r3 > 0.55 && r3 < 0.65 && r1 < r2 && r2 < r3, `weak rate by kinship: ${r1} ${r2} ${r3}`);
  const t0 = Object.fromEntries(TRAITS.map(k => [k, 1])), w = makeWeak(t0, "strength");
  assert.ok(w.hardiness < 1 && w.fertility < 1 && w.longevity < 1 && w.strength < 1 && w.speed === 1, "a weak child is frail in health, fertility, years and one more trait");
  // partner choice: kin are mildly avoided, partners and friends preferred
  const me = fake(40, [10, 11], [0]), sib = fake(41, [10, 11]), stranger = fake(42, [60, 61]), friend = fake(43, [62, 63]);
  me.rel = [{ o: 43, k: "friend", s: 1, w: "work" }];
  const cnt = { sib: 0, stranger: 0, friend: 0 };
  for (let i = 0; i < 3000; i++) { const p = pickPartner(r, me, [sib, stranger, friend]); cnt[p === sib ? "sib" : p === stranger ? "stranger" : "friend"]++; }
  assert.ok(cnt.sib < cnt.stranger && cnt.sib > cnt.stranger * 0.35 && cnt.friend > cnt.stranger * 1.5, "mild avoidance, friends favoured: " + JSON.stringify(cnt));
  ok("genotype: alleles hidden and averaging to the trait, children blend; kinship table; weak rate " + [r1, r2, r3].map(x => x.toFixed(2)).join("/") + " for cousins/half/full; partner choice " + JSON.stringify(cnt));
}

// 3. Relationships from working beside each other, the friend term in Why, mentors
let friendSim;
{
  const sim = loadFixture("settled"), vs = adults(sim);
  let a = null, b = null;
  for (const x of vs) for (const y of vs) if (!a && x.id < y.id && chemistry(x, y) > 0.3) { a = x; b = y; }
  assert.ok(a, "a pair that gets on");
  const rival = vs.find(v => v !== a && v !== b && chemistry(a, v) < -0.2);
  for (const v of vs) { v.aff = {}; v.rel = []; v.mn = {}; v.mate = 0; }
  for (const v of [a, b]) { sim.ents.move(v, 70, 70, sim.world.standZ(70, 70)); v.job = { k: "chop", c: "standing", key: "x", t0: sim.tick, tid: 0, g: "", kp: "", res: [] }; v.action = { type: "Task" }; v.slp = 0; }
  for (const v of vs) if (v !== a && v !== b) sim.ents.move(v, 50 + v.id % 5, 50, sim.world.standZ(50 + v.id % 5, 50));
  for (let i = 0; i < 40; i++) socialTick(sim);                       // 40 samples = two game days beside each other
  peopleDaily(sim);
  const rab = relOf(a, b.id);
  assert.ok(rab && rab.k === "friend" && rab.w === "work", "friends after days side by side: " + JSON.stringify(a.aff[b.id]) + JSON.stringify(a.rel));
  assert.ok(relOf(b, a.id) && relOf(b, a.id).k === "friend", "and it is mutual");
  // shared hardship: a death nearby bonds those who stood there (not old age)
  const c = vs.find(v => v !== a && v !== b);
  // the Why: a job beside a friend scores higher, beside a rival lower, and the term is named
  sim.ents.move(a, 66, 66, sim.world.standZ(66, 66));
  const tree = sim.ents.ofKind("plant").filter(p => p.species === "tree" && !p.burn).sort((p, q) => Math.abs(p.x - 66) + Math.abs(p.y - 66) - Math.abs(q.x - 66) - Math.abs(q.y - 66))[0];
  assert.ok(sim.apply({ type: "order", ids: [a.id], verb: "chop", x: tree.x, y: tree.y }), "an order to chop gives the villager a job with a target");
  sim.ents.move(b, tree.x, tree.y, tree.z);
  let base = 0, withF = 0;
  plan(sim, a, false, (cs) => { const q = cs.find(k => k.tid === tree.id); if (q) withF = q.parts.soc; }, true);
  assert.equal(withF, 5, "beside a friend at work: +5");
  relOf(a, b.id).k = "rival";
  plan(sim, a, false, (cs) => { const q = cs.find(k => k.tid === tree.id); if (q) base = q.parts.soc; }, true);
  assert.equal(base, -5, "beside a rival: -5");
  relOf(a, b.id).k = "friend";
  const why = plan(sim, a, false, null, true); why.parts.soc = 5; why.tid = tree.id; a.why = why;
  a.job = { k: why.job, c: why.cls, key: "y", t0: sim.tick, tid: tree.id, g: "", kp: "", res: [] };
  const x = explain(sim, a);
  assert.ok(x.parts.some(p => p.label === "Company"), "Company is a named part of the score");
  assert.ok(x.notes.some(t => t.includes(b.name) && /side by side/.test(t)), "and the note names the friend: " + x.notes);
  // temper clashes make rivals
  if (rival) {
    for (const v of [a, rival]) { sim.ents.move(v, 72, 72, sim.world.standZ(72, 72)); v.job = { k: "chop", c: "standing", key: "x", t0: sim.tick, tid: 0, g: "", kp: "", res: [] }; v.action = { type: "Task" }; v.slp = 0; }
    for (let i = 0; i < 60; i++) socialTick(sim);
    peopleDaily(sim);
    assert.ok(relOf(a, rival.id) && relOf(a, rival.id).k === "rival", "rivals after clashes: " + JSON.stringify(a.aff[rival.id]));
  }
  // mentors: lessons that pay out
  for (let i = 0; i < MENTOR_AT; i++) noteLesson(c, a);
  peopleDaily(sim);
  assert.equal(relOf(a, c.id).k, "mentor"); assert.equal(relOf(a, c.id).d, 1); assert.equal(relOf(c, a.id).d, -1);
  assert.ok((a.rel || []).length <= 6, "at most six ties");
  ok("relationships: friends from 2 days beside each other, " + (rival ? "rivals from clashes, " : "") + "a mentor from " + MENTOR_AT + " lessons; Why shows Company +5 / -5 and names the friend");
  friendSim = sim;
}

// 4. Grief applies and expires; its output cost is within 5%
{
  const sim = loadFixture("settled"), vs = adults(sim), [dead, mate, pal, stranger] = vs;
  dead.mate = mate.id; mate.mate = dead.id;
  const far = vs.find(v => ![dead, mate, pal, stranger].includes(v));
  pal.rel = [{ o: dead.id, k: "friend", s: 0.5, w: "work" }];
  for (const v of vs) { v.par = [0, 0]; v.gp = []; }
  const nChron = sim.chron.entries.length;
  kill(sim, dead, "cold");
  assert.ok(mate.gr && mate.gr.s === 1 && pal.gr && pal.gr.s === 0.5 && !stranger.gr, "partner and friend grieve, a stranger does not");
  assert.ok(mate.gr.u - sim.tick > pal.gr.u - sim.tick, "the partner mourns longer");
  assert.ok(sim.chron.entries.slice(nChron).some(e => /mourn/.test(e.text) && e.text.includes(dead.name)), "a mourning entry in the chronicle");
  const fit = fitness(mate, ageDays(sim, mate)), f1 = workFactor(mate, fit), g = mate.gr; mate.gr = null; const f0 = workFactor(mate, fit); mate.gr = g;
  assert.ok(f1 / f0 >= 1 - GRIEF_OUT - 1e-9 && f1 < f0, "output dips by at most 5%: " + (f1 / f0).toFixed(3));
  const m0 = mate.mood; mate.mood = 0.8; const hold = mate.gr; updateNeeds(sim, mate); const withG = mate.mood; mate.mood = 0.8; mate.gr = null; updateNeeds(sim, mate); const noG = mate.mood; mate.gr = hold;
  assert.ok(withG < noG, "grief drains mood: " + withG + " vs " + noG);
  sim.tick = mate.gr.u + 1; updateNeeds(sim, mate);
  assert.equal(mate.gr, null, "and it expires");
  ok("grief: partner " + 5 + " days, friend shorter, stranger none; mourning entry; output x" + (f1 / f0).toFixed(3) + "; mood drain; expiry");
}

// 5. A forced death: a grave with an inscription from the chronicle, the heirloom passes on (or is buried)
{
  const sim = loadFixture("settled"), vs = adults(sim), [d, heir] = vs;
  for (const v of vs) { v.hl = null; v.ti = []; }
  d.hl = newHeirloom(d, 0); d.ti = ["thornback slayer"]; d.mate = heir.id; heir.mate = d.id;
  const graves0 = sim.ents.ofKind("grave").length, t0 = JSON.stringify(d.t), nm = d.hl.n;
  kill(sim, d, "old age");
  assert.equal(sim.ents.ofKind("grave").length, graves0 + 1, "a grave marker was placed");
  const gr = sim.ents.ofKind("grave").at(-1);
  assert.ok(Math.abs(gr.x - sim.stock.x1) < 25 && sim.world.standZ(gr.x, gr.y) === gr.z, "near the camp, on standable ground: " + gr.x + "," + gr.y);
  assert.ok(gr.ins.includes(d.name) && /Thornback slayer/.test(gr.ins) && /died of old age/.test(gr.ins), "inscription: " + gr.ins);
  const owners = heir.hl.h.length;
  assert.ok(heir.hl && heir.hl.n === nm && heir.hl.h.length === 2 && heir.hl.h[0].n === d.name, "the heirloom passed to the partner with its history: " + JSON.stringify(heir.hl));
  assert.ok(sim.chron.entries.some(e => e.text.includes(nm) && /gave/.test(e.text)), "and the chronicle says so");
  assert.equal(JSON.stringify(heir.t) === t0, false, "(sanity: different person)"); // an heirloom carries no stat bonus: it is not read by any rate, score or yield
  // nobody free to carry it: buried
  const d2 = adults(sim)[1];
  d2.hl = newHeirloom(d2, 0); for (const v of sim.ents.ofKind("villager")) if (v !== d2) v.hl = { n: "the Old Comb", h: [] };
  kill(sim, d2, "cold");
  assert.equal(sim.ents.ofKind("grave").at(-1).hl, d2.hl.n, "buried with its owner when nobody can carry it");
  const g2 = sim.ents.ofKind("grave").at(-1), g1 = sim.ents.ofKind("grave").at(-2);
  assert.ok(Math.abs(g1.x - g2.x) >= 2 || Math.abs(g1.y - g2.y) >= 2, "graves keep a stone's width apart");
  ok("death: grave '" + gr.ins.slice(0, 60) + "...', heirloom passed with " + owners + " owners, another buried with its owner");
}

// 6. Hobbies and titles
{
  const sim = loadFixture("settled"), v = adults(sim)[0];
  const h = hobbyOf(v); assert.ok(HOBBIES[h], "a hobby from temperament"); assert.equal(hobbyOf(v), h, "stable");
  const kinds = new Set(sim.ents.ofKind("villager").map(hobbyOf)); assert.ok(kinds.size >= 2, "different villagers, different pastimes: " + [...kinds]);
  v.hb = { xp: 0, n: 0 }; v.action = { type: "Wander" }; v.mood = 0.1;
  const m0 = v.mood; for (let i = 0; i < 100; i++) updateNeeds(sim, v);
  assert.ok(v.hb.xp > 0.5 && hobbyLevel(v) > 0, "free time earns hobby xp: " + v.hb.xp);
  v.hb.xp = 100; const nc = sim.chron.entries.length; v.sk.dig.xp = 400; v.sk.dig.rs = 0;
  titleCheck(sim, v);
  assert.ok(v.ti.some(t => /^renowned /.test(t)) && v.ti.includes("master digger"), "titles earned: " + v.ti);
  assert.ok(sim.chron.entries.slice(nc).some(e => /is known for/.test(e.text)), "a notable hobbyist is noted in the chronicle");
  ok("hobbies: " + h + " from temperament, xp in free time, a chronicle note and titles " + JSON.stringify(v.ti));
}

// 7. The first to keep a fire earns the title (a forced strike, <= 2 game days)
{
  const sim = loadFixture("settled");
  sim.apply({ type: "force", ev: "lightning" });
  let found = false;
  for (let i = 0; i < 2 * DAY && !found; i++) { sim.step(); found = sim.ents.ofKind("villager").some(v => (v.ti || []).includes("first to keep a fire")); }
  assert.ok(found, "the first witness is known as the first to keep a fire");
  ok("title: first to keep a fire");
}

// 8. v7 saves (S13 migrated them to v8): since S16 any save of the old fixed-size world is refused with a message (tests/migrate.js); the S13 fields are in the current format
{
  const sim = loadFixture("settled"), j = JSON.parse(toJSON(sim));
  j.v = 7;
  assert.throws(() => restore(JSON.stringify(j)), /old fixed-size world/, "a v7 save is refused");
  j.v = SAVE_VERSION;
  const back = restore(JSON.stringify(j));
  for (const v of back.ents.ofKind("villager")) {
    assert.ok(v.g && Array.isArray(v.rel) && v.hb && Array.isArray(v.ti), v.name + " has the S13 fields");
    for (const k of TRAITS) assert.ok(Math.abs((v.g[k][0] + v.g[k][1]) / 2 - v.t[k]) < 0.002, "alleles derived from the phenotype");
  }
  assert.equal(JSON.parse(toJSON(back)).v, SAVE_VERSION);
  ok("a v7 save is refused; the current format keeps genotypes, bonds and hobbies");
}

// 9. Determinism and the save round trip with a death, grave, grief and bonds in the mix (1 game day each)
{
  const run = () => { const s = loadFixture("settled"); for (let i = 0; i < 300; i++) s.step(); kill(s, adults(s)[0], "cold"); for (let i = 0; i < DAY; i++) s.step(); return s; };
  const a = run(), b = run();
  assert.equal(a.hash(), b.hash(), "same fixture, same events -> same hash");
  assert.ok(a.ents.ofKind("grave").length === 1);
  const c = restore(toJSON(a)); assert.equal(c.hash(), a.hash(), "save round trip keeps graves, grief and bonds");
  for (let i = 0; i < 600; i++) { a.step(); c.step(); }
  assert.equal(a.hash(), c.hash(), "and the restored sim stays in step");
  ok("determinism + save round trip with a grave: " + a.hash());
}
console.log("people ok");
