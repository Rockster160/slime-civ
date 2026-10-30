// Splitting (split.js): a healthy adult becomes 2-5 smaller selves and the original is gone. Fixture-based, a few seconds.
//   colour exact; traits within +-5%; skill xp and hp add up to ~90% and are close to equal; ages add up exactly; the count rises with
//   health; no grave, death or mourning; nothing points at the old id; same seed and tick -> same result; a save round-trips.
//   node tests/split.js
import "./legacy.js";
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { toJSON, restore, SAVE_VERSION, migrate } from "../src/sim/save.js";
import { TRAITS, isAdult, ageDays, maxHp, fitness, maturity } from "../src/sim/villager.js";
import { SKILLS } from "../src/sim/skills.js";
import { splitCount, splitBlock, SPLIT_LOSS, SPLIT_MUTATION, SPLIT_MIN, SPLIT_MAX } from "../src/sim/split.js";

let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const pickAdult = (sim) => sim.ents.ofKind("villager").find(v => isAdult(sim, v) && ageDays(sim, v) < v.prime && v.mate);
function ready(sim, v) { v.hunger = 0.9; v.thirst = 0.9; v.energy = 0.9; v.hp = Math.round(maxHp(v, fitness(v, ageDays(sim, v)))); }

/** Give the villager something of every kind of reference to point at it. */
function entangle(sim, v) {
  const o = sim.ents.ofKind("villager").find(q => q.id !== v.id && q.id !== v.mate);
  o.aff = { ...(o.aff || {}), [v.id]: [3, 2, -1] }; o.mn = { ...(o.mn || {}), [v.id]: 2 };
  o.rel = [{ o: v.id, k: "friend", s: 0.6, w: "work" }]; o.tch = { p: v.id, u: sim.tick + 500 }; o.par = [v.id, o.par[1]]; o.gp = [v.id]; o.gr = { u: sim.tick + 900, s: 0.4, f: v.id };
  const mate = sim.ents.get(v.mate);
  sim.crews.list.push({ id: 91, name: "Test", ids: [v.id, o.id], task: null, hk: 0, auto: 0, t0: 0 }); v.cr = 91; o.cr = 91;
  sim.exp.list.push({ id: 91, ids: [v.id], st: "done", item: "flint", dids: [] });
  const bed = sim.ents.get(v.bed); if (bed) bed.owner = v.id;
  const furn = sim.ents.ofKind("furniture").find(f => f !== bed); if (furn) furn.rv = v.id;
  sim.chron.recs[7777] = { id: 7777, name: "Ghost", par: [0, 0], kids: [v.id], death: 1 };
  v.mem = [["wolf", 400, 0, 3, 10], ["cave", 200, 100, 2, 20], ["dark", 0, 500, 1, 30], ["flint", 300, 0, 1, 40]]; v.epi = [[5, "wolf", "hurt"], [9, "cave", "found"]];
  v.hb = { xp: 20, n: 1 }; v.ti = ["master digger"]; v.sk.dig.xp = 40; v.sk.build.xp = 25; v.sk.craft.xp = 12;
  return { o, mate };
}

/** Every number in the sim that equals `id` where it means a villager (reservation, owner, bond, crew ...), by walking everything but the world. */
function pointers(sim, id) {
  const hits = [], skip = /^(x|y|z|n|born|hp|t|t0|rt|cd|tick|u|id|ep|rp|rpt|wt|hold)$/;
  const walk = (o, path, d, seen) => {
    if (d > 8 || o === null || typeof o !== "object" || seen.has(o)) return; seen.add(o);
    for (const k of Object.keys(o)) {
      const x = o[k], p = path + "." + k;
      if (k === String(id) && !Array.isArray(o)) hits.push(p);
      if (typeof x === "number" && x === id && !skip.test(k)) hits.push(p);
      else if (typeof x === "number" && x === id && Array.isArray(o)) hits.push(p);
      walk(x, p, d + 1, seen);
    }
  };
  for (const e of sim.ents.list) if (e.id !== id) walk(e, e.kind + e.id, 0, new Set());
  for (const k of ["crews", "exp", "board", "mine", "farm", "chron", "disc"]) walk(sim[k], k, 0, new Set());
  return hits.filter(h => !/\.cmdLog/.test(h));
}

const sim = loadFixture("year2");
const v = pickAdult(sim);
ready(sim, v);
const { o, mate } = entangle(sim, v);
assert.equal(SAVE_VERSION >= 16, true);

// ---- count rises with health -------------------------------------------------------------------------------------
{
  const w = { ...v, t: v.t };                                  // a weak one, a healthy one, and the best one (the count is a pure read)
  const hp0 = v.hp;
  v.hp = 62; const weak = splitCount(sim, v);
  v.hp = 100; const mid = splitCount(sim, v);
  v.hp = 125; const best = splitCount(sim, v);
  v.hp = hp0;
  assert.equal(weak, SPLIT_MIN, "a weak slime makes " + weak);
  assert.ok(mid >= 3 && mid <= SPLIT_MAX && best >= mid && best >= 4, `counts ${weak}/${mid}/${best}`);
  v.hp = 125; v.hunger = 0.8; v.energy = 0.8; const rich = splitCount(sim, v);
  v.hunger = 0.5001; const hungry = splitCount(sim, v);
  assert.ok(hungry < rich, "a hungry slime makes fewer: " + hungry + " < " + rich);
  v.hp = 30; assert.equal(splitCount(sim, v), 0); assert.equal(splitBlock(sim, v), "Hurt");
  ready(sim, v);
  const kid = sim.ents.ofKind("villager").find(q => !isAdult(sim, q));
  if (kid) assert.equal(splitBlock(sim, kid), "Too young");
  ok(`count rises with health: weak ${weak}, healthy ${mid}, best ${best}; hunger lowers it (${rich} -> ${hungry}); blockers are words`);
}

// ---- the split --------------------------------------------------------------------------------------------------
v.hp = 118; v.hunger = 0.85; v.energy = 0.85;               // a strong one
const before = {
  id: v.id, name: v.name, hue: v.hue, t: { ...v.t }, hp: v.hp, born: v.born, tick: sim.tick, par: v.par.slice(), lin: v.lin,
  xp: Object.fromEntries(SKILLS.map(s => [s, v.sk[s].xp])), mem: v.mem.length, epi: v.epi.length, job: v.job && v.job.k, bed: v.bed, mate: v.mate,
  graves: sim.ents.ofKind("grave").length, deaths: sim.chron.entries.filter(e => e.kind === "DEATH").length, pop: sim.ents.ofKind("villager").length,
  nextId: sim.ents.nextId, predicted: splitCount(sim, v),
};
const json0 = toJSON(sim);                                  // for the determinism and round-trip checks below
assert.ok(before.predicted >= 4, "a strong slime predicts " + before.predicted);
assert.equal(sim.apply({ type: "split", id: v.id }), true);
const clones = sim.lastSplit.to.map(id => sim.ents.get(id));
const N = clones.length;
assert.equal(N, before.predicted, "the card's prediction is the count");
assert.ok(!sim.ents.get(before.id), "the original is gone");
assert.equal(sim.ents.ofKind("villager").length, before.pop - 1 + N);
assert.ok(clones.every(c => c.id >= before.nextId), "new ids");
assert.equal(new Set(clones.map(c => c.id)).size, N);
ok(`split into ${N}: ${clones.map(c => c.name).join(", ")}; the original is gone`);

// colour exact, traits and every genetic within +-5%
for (const c of clones) {
  assert.equal(c.hue, before.hue); assert.equal(c.lin, before.lin); assert.deepEqual(c.par, before.par);
  for (const k of TRAITS) assert.ok(Math.abs(c.t[k] / before.t[k] - 1) <= SPLIT_MUTATION + 0.002, `${k} ${before.t[k]} -> ${c.t[k]}`);
  assert.ok(TRAITS.some(k => c.t[k] !== before.t[k]), "traits mutate");
  assert.ok(c.sp === clones[0].id || c.sp === before.sp);
}
assert.ok(clones.some(c => c.t.strength !== clones[0].t.strength), "the clones differ from each other");
ok("colour exact; traits within +-5% and not all equal");

// skills and hp: ~90% of the original, close to equal; ages add up exactly
for (const s of SKILLS) {
  const xs = clones.map(c => c.sk[s].xp), tot = sum(xs);
  assert.ok(Math.abs(tot - before.xp[s] * (1 - SPLIT_LOSS)) < 0.01 * N, `${s} xp ${before.xp[s]} -> ${tot}`);
  if (before.xp[s] > 0) assert.ok(xs.every(x => Math.abs(x / (tot / N) - 1) < 0.3), s + " shares near equal: " + xs);
}
const hps = clones.map(c => c.hp);
assert.ok(Math.abs(sum(hps) - before.hp * (1 - SPLIT_LOSS)) < 0.5 * N, "hp sums to ~90%: " + sum(hps));
assert.ok(hps.every(h => Math.abs(h / (sum(hps) / N) - 1) < 0.3), "hp near equal: " + hps);
const ages = clones.map(c => sim.tick - c.born);
assert.equal(sum(ages), before.tick - before.born, "ages add up to the parent's");
assert.ok(ages.every(a => Math.abs(a / (sum(ages) / N) - 1) < 0.3), "ages near equal");
assert.ok(clones.some(c => ageDays(sim, c) < maturity(c)), "a share below maturity is a child");
ok(`skills ${SKILLS.map(s => Math.round(sum(clones.map(c => c.sk[s].xp))) + "/" + before.xp[s]).join(" ")}, hp ${Math.round(sum(hps))}/${before.hp}, ages ${ages.length} sum exactly`);

// memories: copied with a few forgotten; identity; the first inherits the job, bed and partner
assert.ok(clones.every(c => c.mem.length <= before.mem && c.epi.length <= before.epi));
assert.ok(clones.every(c => c.mem.every(m => m[1] >= 0 && m[1] <= 1000)));
assert.ok(clones.some(c => c.mem.length > 0), "memories carried");
assert.equal(clones[0].name, before.name);
assert.ok(clones.slice(1).every(c => c.name && c.job === null && c.bed === 0 && c.mate === 0));
assert.equal(clones[0].bed, before.bed); assert.equal(clones[0].mate, before.mate);
assert.equal(mate.mate, clones[0].id);
assert.equal(clones[0].job && clones[0].job.k, before.job);
assert.ok(clones.every(c => c.hb.n === 1 && c.ti[0] === "master digger"));
ok("memories carried (some forgotten), the first keeps job/bed/partner, the others replan");

// no grave, no death, no mourning; one chronicle line; saved format
assert.equal(sim.ents.ofKind("grave").length, before.graves);
assert.equal(sim.chron.entries.filter(e => e.kind === "DEATH").length, before.deaths);
assert.equal(sim.chron.recs[before.id], undefined);
assert.ok(!sim.ents.ofKind("villager").some(q => q.gr && q.gr.f === before.id), "no mourning");
const line = sim.chron.entries.filter(e => / split into /.test(e.text));
assert.equal(line.length, 1);
assert.ok(new RegExp("^" + before.name + " split into .+\\.$").test(line[0].text), line[0].text);
assert.ok(clones.every(c => c.cl === undefined && c.cg === undefined));
ok('no grave, death or mourning; chronicle: "' + line[0].text + '"');

// no dangling references; bonds copied to every clone
assert.deepEqual(pointers(sim, before.id), [], "dangling references");
const ids = clones.map(c => c.id);
assert.ok(ids.every(id => o.aff[id] && o.aff[id][0] === 3 && o.mn[id] === 2), "bonds copied to each clone");
assert.ok(o.rel.some(q => q.o === ids[0]) && o.rel.length <= 6);
assert.equal(o.tch.p, ids[0]); assert.ok(o.par.includes(ids[0])); assert.ok(o.gp.includes(ids[0])); assert.equal(o.gr.f, ids[0]);
const crew = sim.crews.list.find(c => c.id === 91);
assert.ok(ids.every(id => crew.ids.includes(id)) && crew.ids.includes(o.id) && clones.every(c => c.cr === 91));
assert.deepEqual(sim.exp.list.find(x => x.id === 91).ids, [ids[0]]);
assert.ok(sim.chron.recs[7777].kids.every(k => ids.includes(k)) && sim.chron.recs[7777].kids.length === N);
assert.ok(sim.chron.entries.every(e => !e.a.includes(before.id)));
ok("nothing points at the old id: reservations, beds, partner, bonds, family, crews, expeditions, chronicle");

// determinism and save round trip
{
  const sim2 = restore(json0);
  assert.equal(sim2.apply({ type: "split", id: before.id }), true);
  assert.equal(sim2.hash(), sim.hash(), "same state, same split");
  const back = restore(toJSON(sim));
  assert.equal(back.hash(), sim.hash(), "a save after a split round-trips");
  for (let i = 0; i < 20; i++) { sim.step(); back.step(); }
  assert.equal(back.hash(), sim.hash(), "and keeps running the same");
  ok("deterministic; save and reload after a split round-trips");
}

// old saves: cl and cg are dropped
{
  const data = JSON.parse(json0); data.v = 15;
  for (const e of data.entities.list) if (e.kind === "villager") { e.cl = 1; e.cg = 2; }
  const back = restore(data);
  assert.ok(back.ents.ofKind("villager").every(q => q.cl === undefined && q.cg === undefined));
  ok("a v15 save loses cl and cg");
}
console.log("split ok");
