// S14 world depth (quick set; every scenario loads a fixture and runs <= 3 game days, or is pure):
//   1 illness: spreads in a crowded unventilated room (and not in a vented or roomy one), the weak die, care and a remedy speed recovery, the nursing job, the HERBAL routes
//   2 wolves: attack a lone villager on a winter night, flee a group and a fire, take hoppers
//   3 grazers: hunted for big meat, hide and bone; turn on a villager that crowds them; penned in a big pen only
//   4 alternates: salt, dry, peat, bone and the remedy each fire (witness + tinker) and produce; peat burns like wood at heat <= 3
//   5 perturbation: deterministic per seed, bounded +-10%, applied, shown in "This world"
//   6 the validator over 20 seeds, the depth switch (off = the world plays as before), save round-trip and determinism
//   node game/tests/depth.js
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { Sim } from "../src/sim/sim.js";
import { toJSON, restore } from "../src/sim/save.js";
import { DUR_DAY } from "../src/sim/clock.js";
import { M, World, F } from "../src/sim/world.js";
import { isAdult, workFactor, stepTicks, fitness, ageDays } from "../src/sim/villager.js";
import { newDepth, perturbOf, pt, PERTURB_KEYS, oreYield, thisWorld, dryAir, PERTURB_SPAN } from "../src/sim/depth.js";
import { illTick, illDaily, fallIll, sickOnes, ROOM_PER, drinkSip } from "../src/sim/disease.js";
import { addFuel, FUEL_TICKS } from "../src/sim/fire.js";
import { can, grant } from "../src/sim/knowledge.js";
import { PHENOMENA, matches } from "../src/sim/phenomena.js";
import { FAUNA, spawnFauna, swing } from "../src/sim/fauna.js";
import { survey, storeInZone, haveTotal, dropLoose, spoilDaily } from "../src/sim/items.js";
import { isNight, seasonIdx } from "../src/sim/season.js";
import { instantHut, flatSpot } from "./helpers.js";
import { putStation } from "../tools/make_fixtures.js";
import { tinkerCandidates, attempt, candCtx } from "../src/sim/discovery.js";
import { RECIPES, makeAtBench, light, finish } from "../src/sim/craft.js";
import { stationHeat } from "../src/sim/heat.js";
import { openPen, penLoad } from "../src/sim/husbandry.js";
import { plan } from "../src/sim/jobs.js";
import { almanac } from "../src/ui/almanac.js";
import { concerns } from "../src/ui/concerns.js";
import { explain, alerts, describe } from "../src/ui/text.js";
import { generateWorld } from "../src/sim/worldgen.js";
import { depositsIn } from "../src/sim/terrain.js";
import { saltLicks } from "../src/sim/fauna.js";

const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
const fauna = (sim, sp) => sim.ents.ofKind("fauna").filter(e => e.sp === sp);
const steps = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };
const depthSim = () => loadFixture("depth");
const mhp = (sim, v) => 100 * v.t.hardiness * (0.45 + 0.55 * fitness(v, ageDays(sim, v)));
const lines = [];
const note = (s) => lines.push(s);

// ---- 1. illness --------------------------------------------------------------------------------------------------------

{
  // a world without the S14 content never gets anyone ill and has no depth state to speak of
  const old = loadFixture("settled");
  assert.equal(old.dp.on, 0, "an older fixture loads with the depth content off");
  for (let i = 0; i < 20; i++) illTick(old);
  illDaily(old);
  assert.equal(sickOnes(old).length, 0);
}
{
  // crowded, unventilated: five in a 2x2 room (4 cells, under ROOM_PER a head)
  const sim = depthSim(), vs = adults(sim).slice(0, 5);
  const [x0, y0, z] = flatSpot(sim, 4, 4);
  instantHut(sim, x0, y0, 4, 4, { z });
  sim.rooms.update(sim);
  const cells = [[x0 + 1, y0 + 1], [x0 + 2, y0 + 1], [x0 + 1, y0 + 2], [x0 + 2, y0 + 2]];
  const place = () => vs.forEach((v, i) => { const c = cells[i % 4]; if (sim.ents.get(v.id)) sim.ents.move(v, c[0], c[1], z); });
  place();
  const room = sim.rooms.at(x0 + 1, y0 + 1, z);
  assert.ok(room && room.enclosed && room.n < ROOM_PER * 5, "a small enclosed room");
  let first = -1, day = 0;
  for (; day < 8; day++) {
    for (let k = 0; k < 18; k++) illTick(sim);
    illDaily(sim); place();
    if (first < 0 && sickOnes(sim).length) first = day;
  }
  assert.ok(first >= 0 && first <= 5, "someone falls ill in the crowded room within days (day " + first + ")");
  const nSick = sim.dp.cases;
  assert.ok(nSick >= 2, "it spreads between the people in the room: " + nSick + " cases");
  assert.ok(sim.chron.entries.some(e => /fell ill/.test(e.text)), "the chronicle records it");
  note("crowded room: first case day " + first + ", " + nSick + " cases in 8 days");

  // the same people in a vented room, or a roomy one: nobody is exposed
  for (const mode of ["vent", "roomy"]) {
    const s2 = depthSim(), v2 = adults(s2).slice(0, 5);
    const sp = flatSpot(s2, mode === "roomy" ? 8 : 4, mode === "roomy" ? 8 : 4);
    const w = mode === "roomy" ? 8 : 4;
    instantHut(s2, sp[0], sp[1], w, w, { z: sp[2] });
    if (mode === "vent") putStation(s2, "vent", sp[0] + 1, sp[1] + 1, sp[2]);
    s2.rooms.update(s2);
    const free = []; for (let y = sp[1] + 1; y < sp[1] + w - 1; y++) for (let x = sp[0] + 1; x < sp[0] + w - 1; x++) free.push([x, y]);
    v2.forEach((v, i) => { const c = free[i % free.length]; s2.ents.move(v, c[0], c[1], sp[2]); });
    for (let d = 0; d < 6; d++) { for (let k = 0; k < 18; k++) illTick(s2); illDaily(s2); }
    assert.equal(s2.dp.cases, 0, mode + ": no case without crowding");
  }
}
{
  // a weak villager with no help dies of it within 3 days; the cause is "illness"
  const sim = depthSim(), v = adults(sim)[0], id = v.id;
  v.hp = 14; fallIll(sim, v, "test"); v.ill.s = 1; v.ill.d = 9;
  let dead = -1;
  for (let i = 0; i < 3 * DUR_DAY && dead < 0; i++) { sim.step(); if (!sim.ents.get(id)) dead = i; }
  assert.ok(dead >= 0, "a weak sick villager dies within 3 days");
  assert.equal(sim.chron.recs[id].cause, "illness");
  assert.ok(sim.chron.entries.some(e => e.kind === "DEATH" && /illness/.test(e.text)));
  note("weak villager died of illness after " + dead + " ticks");
}
{
  // a healthy one shrugs it off; a warm bed, a nurse and a remedy get them well faster than nothing
  const run = (remedy) => {
    const sim = depthSim(), vs = adults(sim), p = vs[0];
    grant(sim, vs[1], "HERBAL", 0.5);
    if (remedy) storeInZone(sim, "herbal_remedy", 3);
    else for (const q of sim.ents.ofKind("item").filter(i => i.item === "herb" || i.item === "herbal_remedy")) sim.ents.remove(q.id);       // (S18b: with a day's spare hours the village steeps its own remedy from the herb in stock; the no-remedy run has none to steep)
    fallIll(sim, p, "test");
    const jobs = new Set(); let nursed = 0;
    for (let i = 0; i < 2 * DUR_DAY; i++) {
      sim.step();
      if (i % 20 === 0) for (const v of adults(sim)) if (v.job) { jobs.add(v.job.k); if (v.job.k === "tend_sick") nursed++; }
    }
    return { sim, p: sim.ents.get(p.id), jobs, nursed };
  };
  const A = run(true), B = run(false);
  const prog = (r) => (r.p.ill ? r.p.ill.p : 1);
  assert.ok(A.p, "the patient lives (with a remedy)");
  assert.ok(A.p.ill ? A.p.ill.rm > 0 : A.p.imm > 0, "the remedy was given");
  assert.ok(prog(A) >= prog(B) + 0.1, "recovery with a remedy beats none: " + prog(A).toFixed(2) + " vs " + prog(B).toFixed(2));
  assert.ok(A.jobs.has("convalesce") || !A.p.ill, "the sick rest");
  assert.ok(A.nursed > 0 && B.nursed > 0, "someone nurses the sick (standing job)");
  assert.ok(A.sim.chron.entries.some(e => /first herbal remedy/.test(e.text)));
  assert.ok(A.sim.chron.entries.some(e => /fell ill/.test(e.text)));
  note("remedy: progress " + prog(A).toFixed(2) + " vs unaided " + prog(B).toFixed(2) + " after 2 days");

  // while anyone is sick and the remedy is known, the village steeps remedies without being asked (marsh herb in stock)
  const sim = depthSim(), vs = adults(sim);
  grant(sim, vs[1], "HERBAL", 0.5); fallIll(sim, vs[0], "test");
  steps(sim, 3 * DUR_DAY);
  assert.ok(sim.chron.entries.some(e => /first herbal remedy/.test(e.text)), "remedies are made on their own while someone is sick");
}
{
  // a sick villager is slower, shows in the inspector texts, the alerts and the Concerns list; the well keep clear
  const sim = depthSim(), vs = adults(sim), p = vs[0], q = vs[1];
  const fit = fitness(p, ageDays(sim, p)), w0 = workFactor(p, fit), s0 = stepTicks(p, fit);
  fallIll(sim, p, "spoiled food");
  assert.ok(Math.abs(workFactor(p, fit) - 0.6 * w0) < 1e-9, "works at 60%");
  assert.ok(stepTicks(p, fit) > s0, "walks slower");
  assert.ok(alerts(sim, p).some(a => a.k === "sick"));
  const c = concerns(sim).find(x => x.k === "illness");
  assert.ok(c && /sick/.test(c.text) && c.loc && c.loc.id === p.id, "a Concerns line for the sick");
  p.job = { k: "convalesce", c: "need", key: "convalesce:0", t0: sim.tick, tid: 0, g: "need", kp: "", res: [] };
  assert.ok(/sick/.test(explain(sim, p).sentence) && !/undefined/.test(explain(sim, p).sentence));
  // avoidance: a job whose target stands within 3 cells of the sick scores 20 lower for a well villager
  q.job = null; q.action = null;
  let cand = null;
  plan(sim, q, false, (cs) => { cand = cs.find(k => k.tid && sim.ents.get(k.tid) && sim.ents.get(k.tid).x !== undefined && k.cls !== "need" && k.cls !== "vcrit" && k.kind !== "tend_sick" && k.kind !== "forage" && k.kind !== "dry"); });
  if (cand) {
    const e = sim.ents.get(cand.tid), z = sim.world.standZ(e.x + 1, e.y);
    if (z >= 0) {
      sim.ents.move(p, e.x + 1, e.y, z); p.slp = 0; p.rest = 0;
      let after = null;
      plan(sim, q, false, (cs) => { after = cs.find(k => k.key === cand.key); });
      if (after) assert.equal(after.parts.ill, -20, "a well villager prefers work away from the sick");
    }
  }
}

{
  // bad water: sips of stagnant water add exposure, clean water does not; the debug command makes someone ill only where the content is on
  const sim = depthSim(), v = adults(sim)[0];
  drinkSip(sim, v, false); assert.ok(!v.ex, "clean water: nothing");
  for (let i = 0; i < 12; i++) drinkSip(sim, v, true);
  assert.ok(v.ex >= 0.3 && v.exk === "stagnant marsh water", "a long drink at the marsh is a real exposure: " + v.ex);
  assert.ok(sim.apply({ type: "ill", id: adults(sim)[1].id }) && sickOnes(sim).length === 1);
  assert.equal(loadFixture("settled").apply({ type: "ill", id: adults(loadFixture("settled"))[0].id }), false, "no sickness where the content is off");
}

// ---- the HERBAL routes: witness (the sick near marsh herb) and tinker (herb in the stockpile) -------------------------------------
{
  const sim = depthSim(), p = adults(sim)[0], z = sim.world.standZ(p.x + 2, p.y);
  sim.world.set(p.x + 2, p.y, z - 1, M.HERB, 0);
  sim.world.geo.herb = [{ at: [p.x + 2, p.y], cells: [World.idx(p.x + 2, p.y, z - 1)] }];
  assert.ok(!can(sim, "HERBAL"));
  let n = 0;
  for (; n < 40 && !can(sim, "HERBAL"); n++) { fallIll(sim, p, "test"); p.ill.p = 0; illDaily(sim); }
  assert.ok(can(sim, "HERBAL") && sim.disc.seen.HERBAL_REMEDY !== undefined, "the sick one chews the herb and understands (witness route), after " + n + " tries");
  assert.ok(p.fam.HERBAL > 0 && sim.chron.entries.some(e => /marsh herb/.test(e.text)), "chronicle line for it");
}

/** The tinker route to a row: the candidate that satisfies it must exist among everything possible, and doing it fires it. */
function tinkerRoute(sim, rowId, who) {
  tinkerCandidates(sim);
  const all = sim.cache.tkAll, c = all.find(k => k.row === rowId);
  assert.ok(c, rowId + ": a tinker candidate satisfies it (of " + all.length + ")");
  assert.ok(!can(sim, PHENOMENA[rowId].craft));
  const fired = attempt(sim, who, c);
  assert.ok(fired && can(sim, PHENOMENA[rowId].craft), rowId + ": the tinker attempt fires it");
  return c;
}
{
  const sim = depthSim(), who = adults(sim)[0];
  tinkerRoute(sim, "HERBAL_REMEDY", who);
  assert.ok(haveTotal(sim, "herbal_remedy") >= 1 || sim.ents.ofKind("item").some(i => i.item === "herbal_remedy"), "a trial batch of remedy");
}

// ---- 2. wolves -----------------------------------------------------------------------------------------------------------------

function winterNight() {
  const sim = loadFixture("midwinter");
  sim.dp = newDepth(1); sim.wild.i2 = 1;
  for (let i = 0; i < 2 * DUR_DAY && !(isNight(sim.tick) && seasonIdx(sim.tick) === 3); i++) sim.step();
  assert.ok(isNight(sim.tick) && seasonIdx(sim.tick) === 3, "a winter night");
  return sim;
}
function spot(sim, dx, dy) {
  // S18b: a strip of clear 3x3 cells (0 and +9 east of an origin 26 cells from the stockpile), found once per sim: the village has built where it likes, and the wolf must have a way to the villager
  const open = (cx, cy, z) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (sim.world.standZ(cx + i, cy + j) !== z || sim.ents.at(cx + i, cy + j, z).length) return false; return true; };
  if (!sim.__orig) {
    const x0 = sim.stock.x0 + 26, y0 = sim.stock.y0;
    outer: for (let r = 0; r < 30; r++) for (const [a, b] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
      const x = x0 + a, y = y0 + b, z = sim.world.standZ(x, y);
      if (z >= 0 && open(x, y, z) && [0, 9].every(k => sim.world.standZ(x + k, y) === z && open(x + k, y, z))) { sim.__orig = [x, y, z]; break outer; }
    }
    if (!sim.__orig) throw new Error("no spot");
  }
  const [ox, oy, oz] = sim.__orig, x = ox + dx, y = oy + dy, z = sim.world.standZ(x, y);
  return [x, y, z >= 0 ? z : oz];
}
function pin(sim, list) { for (const [v, c] of list) { if (sim.ents.get(v.id) && (v.x !== c[0] || v.y !== c[1])) sim.ents.move(v, c[0], c[1], c[2]); v.action = null; v.job = null; v.slp = 0; v.hunger = Math.max(v.hunger, 0.8); v.thirst = Math.max(v.thirst, 0.8); v.energy = 0.9; v.fear = 0; } }
function wolfAt(sim, c) { const w = spawnFauna(sim, "wolf", c[0], c[1], c[2]); w.home = c.slice(); w.pk = 1; w.fd = sim.tick + 3 * DUR_DAY; return w; }
{
  // a lone villager on a winter night is attacked ...
  const sim = winterNight(), vs = adults(sim), v = vs[0];
  const far = sim.ents.ofKind("villager").filter(o => o !== v).map((o, i) => [o, [sim.stock.x0 - 20 + (i % 3), sim.stock.y0 - 18 + (i >> 1), 0]]);       // (S18b: everyone else, children and elders too: they wander within 30 cells of camp and a crowd keeps the wolf off)
  for (const [o, c] of far) { c[2] = sim.world.standZ(c[0], c[1]); if (c[2] < 0) c[2] = o.z; }
  const vc = spot(sim, 0, 0), wc = spot(sim, 9, 0);
  const w = wolfAt(sim, wc), t0 = sim.tick;
  v.hp = mhp(sim, v);
  let hit = -1, hp0 = v.hp;
  for (let i = 0; i < 2400 && hit < 0; i++) { pin(sim, [[v, vc], ...far]); sim.step(); if (v.ht > t0) hit = i; }       // (S18b: 900 -> 2400 ticks: how long the wolf takes to find a way round whatever the longer-lived village built there)
  assert.ok(hit >= 0, "the wolf attacks a lone villager on a winter night");
  note("lone villager on a winter night: first bite after " + hit + " ticks");
  // ... but not by day, and not in summer
  const day = loadFixture("settled"); day.dp = newDepth(1); day.wild.i2 = 1;
  const dv = adults(day)[0], dvc = spot(day, 0, 0), dw = wolfAt(day, spot(day, 9, 0)), dfar = day.ents.ofKind("villager").filter(o => o !== dv).map((o, i) => [o, [day.stock.x0 - 20, day.stock.y0 - 18 + i, o.z]]);
  for (const [o, c] of dfar) c[2] = day.world.standZ(c[0], c[1]) < 0 ? o.z : day.world.standZ(c[0], c[1]);
  const dt0 = day.tick;
  for (let i = 0; i < 600; i++) { pin(day, [[dv, dvc], ...dfar]); day.step(); }
  assert.ok(!(dv.ht > dt0), "no attack by day, outside winter");
  // a group: three villagers together are left alone, and the wolf runs
  const g = winterNight(), gv = adults(g).slice(0, 3), base = spot(g, 0, 0), gcs = gv.map((v, i) => { const z = g.world.standZ(base[0] + i, base[1]); return [v, [base[0] + i, base[1], z < 0 ? base[2] : z]]; });
  const gother = g.ents.ofKind("villager").filter(o => !gv.includes(o)).map((o, i) => [o, [g.stock.x0 - 20, g.stock.y0 - 18 + i, o.z]]);
  for (const [o, c] of gother) c[2] = g.world.standZ(c[0], c[1]) < 0 ? o.z : g.world.standZ(c[0], c[1]);
  const gw = wolfAt(g, spot(g, 9, 0)), gt0 = g.tick; let fled = false;
  for (let i = 0; i < 600; i++) { pin(g, [...gcs, ...gother]); g.step(); if (gw.st === "flee" || gw.st === "rest") fled = true; }
  assert.ok(fled && gv.every(v => !(v.ht > gt0)), "a group sends the wolf off, unharmed");
  // a fire: a lone villager beside a lit hearth is left alone
  const f = winterNight(), fv = adults(f)[0], fc = spot(f, 0, 0), fother = adults(f).slice(1).map((o, i) => [o, [f.stock.x0 - 20, f.stock.y0 - 18 + i, o.z]]);
  for (const [o, c] of fother) c[2] = f.world.standZ(c[0], c[1]) < 0 ? o.z : f.world.standZ(c[0], c[1]);
  let hx = fc[0] + 2, hy = fc[1], hz = f.world.standZ(hx, hy);
  for (const [a, b] of [[-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (hz < 0 || f.ents.at(hx, hy, hz).length) { hx = fc[0] + a; hy = fc[1] + b; hz = f.world.standZ(hx, hy); }       // (S16: the cell two east of the villager may be a tree or water on the new land: the fire goes beside them wherever there is room)
  f.ents.add("furniture", { f: "hearth", x: hx, y: hy, z: hz, owner: 0, rv: 0, rt: 0, fuel: 3600, lit: 1, fi: "log", hl: 2 });
  const fw = wolfAt(f, spot(f, 9, 0)), ft0 = f.tick; let ffled = false;
  for (let i = 0; i < 600; i++) { f.ents.ofKind("furniture").forEach(h => { if (h.f === "hearth") { h.fuel = 3600; h.lit = 1; } }); pin(f, [[fv, fc], ...fother]); f.step(); if (fw.st === "flee" || fw.st === "rest") ffled = true; }
  assert.ok(ffled && !(fv.ht > ft0), "a lit fire keeps the wolf off a lone villager");
  // hoppers: a hungry wolf runs one down
  const h = loadFixture("pen"); h.dp = newDepth(1); h.wild.i2 = 1;
  const wc2 = spot(h, 0, 0), hz2 = h.world.standZ(wc2[0] + 6, wc2[1]), hop = spawnFauna(h, "hopper", wc2[0] + 6, wc2[1], hz2 < 0 ? wc2[2] : hz2), w2 = spawnFauna(h, "wolf", wc2[0], wc2[1], wc2[2]);
  w2.home = wc2.slice(); w2.pk = 1; w2.fd = 0;
  const hfar = h.ents.ofKind("villager").map((o, i) => { const c = [h.stock.x0 - 20 + (i % 3), h.stock.y0 - 18 + (i >> 1), 0]; c[2] = h.world.standZ(c[0], c[1]); if (c[2] < 0) c[2] = o.z; return [o, c]; });       // (everyone far away: a crowd keeps a wolf off)
  let ate = -1;
  for (let i = 0; i < 1200 && ate < 0; i++) { pin(h, hfar); h.step(); if (!h.ents.get(hop.id)) ate = i; }
  assert.ok(ate >= 0 && w2.fd > h.tick, "a hungry wolf takes a hopper (" + ate + " ticks)");
  // a hunt order on a wolf is accepted (dangerous game, the player's call)
  assert.ok(h.apply({ type: "order", ids: [adults(h)[0].id], verb: "hunt", tid: w2.id }));
  // ... and the whole village sent after a wolf stands together and kills it (a party does not panic at its quarry, and nobody claims big game alone)
  {
    const p = loadFixture("pen"); p.dp = newDepth(1); p.wild.i2 = 1;
    const pv = adults(p), wx = p.stock.x0 + 12, wy = p.stock.y0, pw = wolfAt(p, [wx, wy, p.world.standZ(wx, wy)]);
    assert.ok(p.apply({ type: "order", ids: pv.map(v => v.id), verb: "hunt", tid: pw.id }));
    for (let i = 0; i < 2000 && p.ents.get(pw.id); i++) p.step();
    assert.ok(!p.ents.get(pw.id) && pv.every(v => p.ents.get(v.id)), "an ordered party kills a wolf and nobody dies");
  }
  // the surfaces: inspector line, curio
  assert.ok(/Wolf/.test(describe(h, w2)) && !/undefined/.test(describe(h, w2)));
}

// ---- 3. grazers --------------------------------------------------------------------------------------------------------------------
{
  // hunted with spears: big meat, hides, bone
  const sim = loadFixture("pen"); sim.dp = newDepth(1); sim.wild.i2 = 1;
  storeInZone(sim, "copper_spear", 4);
  const vs = adults(sim), gc = spot(sim, 0, 6), g = spawnFauna(sim, "grazer", gc[0], gc[1], gc[2]);
  g.home = gc.slice(); g.pk = 2;
  const meat0 = haveTotal(sim, "hopper_meat"), hide0 = haveTotal(sim, "hide"), bone0 = haveTotal(sim, "bone");
  assert.ok(sim.apply({ type: "order", ids: vs.slice(0, 4).map(v => v.id), verb: "hunt", tid: g.id }));
  let dead = -1, turned = false;
  for (let i = 0; i < 5400 && dead < 0; i++) {
    if (i % 300 === 299 && sim.ents.get(g.id)) sim.apply({ type: "order", ids: vs.slice(0, 4).map(v => v.id), verb: "hunt", tid: g.id });       // (S16: a player sends them again when the grazer has walked off: on land with no edge it does)
    if (i % 20 === 0) for (const v of vs.slice(0, 4)) { v.hunger = Math.max(v.hunger, 0.8); v.thirst = Math.max(v.thirst, 0.8); v.energy = Math.max(v.energy, 0.8); }       // (S16: the hunt, not the walk to the lake and back: where the water is differs on the new land)
    sim.step(); if (g.st === "turn") turned = true; if (!sim.ents.get(g.id)) dead = i;
  }
  assert.ok(dead >= 0, "four spears bring a grazer down within 3 days");
  steps(sim, 600);
  assert.ok(haveTotal(sim, "hopper_meat") - meat0 >= FAUNA.grazer.meat - 1, "big meat: " + (haveTotal(sim, "hopper_meat") - meat0));
  assert.ok(haveTotal(sim, "hide") - hide0 >= FAUNA.grazer.hide && haveTotal(sim, "bone") - bone0 >= FAUNA.grazer.bone, "hide and bone");
  assert.ok(turned || sim.ents.ofKind("villager").some(v => v.ht > 0), "it fought back");
  assert.ok(sim.chron.entries.some(e => /first grazer/.test(e.text)));
  note("grazer: dead after " + dead + " ticks, turned " + turned);
}
{
  // cornered: a villager crowding one is struck at
  const sim = loadFixture("pen"); sim.dp = newDepth(1); sim.wild.i2 = 1;
  const v = adults(sim)[0], gc = spot(sim, 14, 10), g = spawnFauna(sim, "grazer", gc[0], gc[1], gc[2]);
  g.home = gc.slice();
  const z = sim.world.standZ(gc[0] + 1, gc[1]); sim.ents.move(v, gc[0] + 1, gc[1], z < 0 ? gc[2] : z);
  // (it first walks off; hemmed in by a wall of rock it cannot, so it turns: walls on three sides of it)
  for (const [dx, dy] of [[-1, 0], [0, 1], [0, -1]]) { const wz = sim.world.standZ(gc[0] + dx, gc[1] + dy); if (wz >= 0) { sim.world.set(gc[0] + dx, gc[1] + dy, wz, M.STONE, 0); sim.world.set(gc[0] + dx, gc[1] + dy, wz + 1, M.STONE, 0); } }
  const t0 = sim.tick; let turned = false;
  for (let i = 0; i < 400; i++) { v.action = null; v.job = null; sim.step(); if (g.st === "turn") turned = true; }
  assert.ok(turned && v.ht > t0, "a grazer crowded up against turns on the villager");
}
{
  // penned: only in a big pen, and it takes the room of three hoppers
  const sim = loadFixture("pen"); sim.dp = newDepth(1); sim.wild.i2 = 1;
  const pen = sim.farm.pens[0];
  for (const v of sim.ents.ofKind("villager")) { v.hunger = 1; v.thirst = 1; v.energy = 1; }
  const gx = pen.x1 + 6, gy = pen.y0 + 1, gz = sim.world.standZ(gx, gy), gc = [gx, gy, gz];
  const g = spawnFauna(sim, "grazer", gc[0], gc[1], gc[2]);
  assert.ok(openPen(sim, g.x, g.y, "grazer"), "the 4x3 pen has room for a grazer");
  const small = { ...pen, x1: pen.x0 + 2, y1: pen.y0 + 2, id: pen.id };       // 3x3: too small
  const save = { x1: pen.x1, y1: pen.y1 }; pen.x1 = small.x1; pen.y1 = small.y1;
  assert.equal(openPen(sim, g.x, g.y, "grazer"), null, "a 3x3 pen is too small for a grazer");
  pen.x1 = save.x1; pen.y1 = save.y1;
  // capture it alive with the order
  const vs = adults(sim);
  assert.ok(sim.apply({ type: "order", ids: vs.slice(0, 3).map(v => v.id), verb: "capture", tid: g.id }), "a capture order on a grazer is accepted");
  let penned = -1;
  for (let i = 0; i < 3 * DUR_DAY && penned < 0; i++) { sim.step(); if (g.tame && g.pen === pen.id) penned = i; }
  assert.ok(penned >= 0, "three villagers catch a grazer alive and put it in the big pen");
  assert.equal(penLoad(sim, pen), 6, "it takes the room of three hoppers");
  steps(sim, 2 * DUR_DAY);
  assert.ok(sim.ents.get(g.id) && g.tame, "it stays inside the fence and is fed");
  assert.ok(/Penned grazer/.test(describe(sim, g)));
  note("grazer penned after " + penned + " ticks");
}

// ---- 4. the alternates -----------------------------------------------------------------------------------------------------------------

/** Make `key` at the bench with the craft granted and the inputs loaded; -> the items that land at the bench. */
function bench(sim, key, craft, inv) {
  const st = sim.ents.ofKind("furniture").find(f => f.f === "workbench"), v = adults(sim)[0];
  grant(sim, v, craft, 0.6);
  st.inv = { ...inv }; st.rcp = key;
  const before = {};
  for (const i of sim.ents.ofKind("item")) before[i.item] = (before[i.item] || 0) + i.n;
  assert.equal(makeAtBench(sim, v, st, key), null, key + " is made");
  const after = {};
  for (const i of sim.ents.ofKind("item")) after[i.item] = (after[i.item] || 0) + i.n;
  return (item) => (after[item] || 0) - (before[item] || 0);
}
{
  // salt: the tinker route (salt rubbed into meat), the witness route (a kill beside the lick), the recipe, and a keep-N through the job board
  const sim = depthSim();
  const c = tinkerRoute(sim, "SALT_FOOD", adults(sim)[0]);
  assert.equal(c.item, "salt"); assert.equal(c.with, "hopper_meat"); assert.equal(c.verb, "mix");
  const s2 = depthSim(), g = adults(s2)[0];
  s2.world.geo.salt = [{ at: [g.x, g.y], cells: [] }];
  const k = spawnFauna(s2, "grazer", g.x + 2, g.y, g.z); k.hp = 1;
  assert.ok(!can(s2, "SALTING"));
  swing(s2, g, k); for (let i = 0; i < 30 && s2.ents.get(k.id); i++) swing(s2, g, k);
  assert.ok(!s2.ents.get(k.id) && s2.disc.seen.SALT_FOOD !== undefined, "meat left beside a lick is seen to keep (witness route)");
  const got = bench(depthSim(), "salted_meat", "SALTING", { hopper_meat: 4, salt: 2 });
  assert.equal(got("salted_meat"), 4);
  const s3 = depthSim(); grant(s3, adults(s3)[0], "SALTING", 0.6);
  s3.apply({ type: "keep", item: "salted_meat", n: 4 });
  steps(s3, 2 * DUR_DAY);
  assert.ok(survey(s3).stock.salted_meat + survey(s3).loose.salted_meat >= 4, "a keep-N makes salted meat through the job board");
  note("salt: " + survey(s3).stock.salted_meat + " salted meat from the job board");
}
{
  // dry: only in cold dry air (winter, or the highland wind); needs no fire; produces dried meat
  const sim = loadFixture("midwinter"); sim.dp = newDepth(1); sim.wild.i2 = 1;
  const rack = putStation(sim, "smoker", sim.stock.x0 - 3, sim.stock.y0 - 3, sim.world.standZ(sim.stock.x0 - 3, sim.stock.y0 - 3));
  storeInZone(sim, "hopper_meat", 8);
  assert.ok(dryAir(sim, rack) && seasonIdx(sim.tick) === 3, "winter air is dry");
  const c = tinkerRoute(sim, "DRY_FOOD", adults(sim)[0]);
  assert.equal(c.site.kind, "smoker"); assert.equal(c.site.heat, 0, "no fire");
  const s2 = loadFixture("workshop"); const r2 = s2.ents.ofKind("furniture").find(f => f.f === "smoker");
  assert.ok(!dryAir(s2, r2), "an older world never has dry air");
  const dctx = { tags: ["food", "wet", "meat"], src: "smoke", heat: 0, enclosed: true, duration: 1500 };
  assert.equal(matches(PHENOMENA.DRY_FOOD, dctx).ok, false, "DRY_FOOD never matches where no one set the air (ctx.dry undefined)");
  assert.equal(matches(PHENOMENA.DRY_FOOD, { ...dctx, dry: 0 }).near, true, "damp air is a near miss");
  assert.equal(matches(PHENOMENA.DRY_FOOD, { ...dctx, dry: 1 }).ok, true);
  // the rack batch: lit with no fire, finished, produces
  const w2 = loadFixture("midwinter"); w2.dp = newDepth(1); w2.wild.i2 = 1;
  const st = putStation(w2, "smoker", w2.stock.x0 - 3, w2.stock.y0 - 3, w2.world.standZ(w2.stock.x0 - 3, w2.stock.y0 - 3)), v = adults(w2)[0];
  grant(w2, v, "DRYING", 0.6); st.inv = { hopper_meat: 4 }; st.rcp = "dried_meat";
  assert.equal(light(w2, v, st, "dried_meat"), null, "lit without any fire in dry air");
  st.bn = 20; steps(w2, 25);
  assert.ok(sim && w2.ents.ofKind("item").some(i => i.item === "dried_meat" && i.n === 3), "dried meat comes off the rack");
  const w3 = loadFixture("workshop"); w3.dp = newDepth(1); const r3 = w3.ents.ofKind("furniture").find(f => f.f === "smoker"); grant(w3, adults(w3)[0], "DRYING", 0.6); r3.inv = { hopper_meat: 4 };
  assert.equal(light(w3, adults(w3)[0], r3, "dried_meat"), "NO_SEASON", "not in damp summer air");
}
{
  // peat: the witness route (peat by a fire), the tinker route, the recipe, and it fuels a hearth like wood at heat <= 3
  const sim = depthSim();
  const h = sim.ents.ofKind("furniture").find(f => f.f === "hearth" && f.lit);
  const z = sim.world.standZ(h.x + 1, h.y);
  dropLoose(sim, "peat", 2, h.x + 1, h.y, z);
  for (let i = 0; i < 500; i++) sim.step();
  assert.ok(sim.disc.seen.PEAT_FUEL !== undefined, "peat lying by a lit fire is seen to dry and burn (witness route)");
  const s2 = depthSim(); tinkerRoute(s2, "PEAT_FUEL", adults(s2)[0]);
  const got = bench(depthSim(), "dried_peat", "PEAT_CUTTING", { peat: 4 });
  assert.equal(got("dried_peat"), 4);
  // burns: dried peat is the only fuel left, the hearth is low, someone feeds it
  const s3 = loadFixture("fire"); s3.dp = newDepth(1); s3.wild.i2 = 1; grant(s3, adults(s3)[0], "PEAT_CUTTING", 0.6);
  for (const it of s3.ents.ofKind("item").slice()) if (it.item === "log" || it.item === "stick") s3.ents.remove(it.id);
  storeInZone(s3, "dried_peat", 6); s3.cache.iv++;
  const hh = s3.ents.ofKind("furniture").find(f => f.f === "hearth"); hh.fuel = 0; hh.lit = 0;
  s3.disc.press.warm = 0.6;
  steps(s3, 1500);
  assert.ok(hh.fuel > 0 && hh.fi === "dried_peat", "the hearth is fed dried peat when wood has run out");
  assert.ok(hh.hl >= 1 && hh.hl <= 3);
  // heat: like wood, capped at the Kiln level
  const kiln = putStation(s3, "kiln", s3.stock.x0 - 4, s3.stock.y0 - 4, s3.world.standZ(s3.stock.x0 - 4, s3.stock.y0 - 4));
  const lv = stationHeat(s3, kiln, "dried_peat").level, lw = stationHeat(s3, kiln, "stick").level;
  assert.ok(lv <= 3 && lv >= 2 && lv === Math.min(lw, 3), "peat in a lined pit: level " + lv + " (sticks " + lw + ")");
  const bell = putStation(s3, "bellows", kiln.x + 1, kiln.y, kiln.z);
  assert.ok(stationHeat(s3, kiln, "dried_peat").level <= 3 && stationHeat(s3, kiln, "charcoal").level >= 4, "a bellows lifts charcoal past what peat can reach");
  note("peat: hearth level " + hh.hl + ", kiln level " + lv);
}
{
  // bone: a carcass leaves bone (witness route), bone is split into an edge (tinker route), the recipe, and the bone axe stands in for the stone axe
  const sim = depthSim(), g = adults(sim)[0];
  const k = spawnFauna(sim, "grazer", g.x + 2, g.y, g.z); k.hp = 1;
  for (let i = 0; i < 30 && sim.ents.get(k.id); i++) swing(sim, g, k);
  assert.ok(sim.disc.seen.BONE_TOOL !== undefined && sim.ents.ofKind("item").some(i => i.item === "bone"), "a grazer carcass leaves bone that may be seen split (witness route)");
  const s2 = depthSim(); tinkerRoute(s2, "BONE_TOOL", adults(s2)[0]);
  const got = bench(depthSim(), "bone_axe", "BONE_WORKING", { bone: 2, stick: 1 });
  assert.equal(got("bone_axe"), 1);
  assert.ok(RECIPES.timber.tool.includes("bone_axe"), "framing accepts the bone axe");
  const s3 = depthSim(); grant(s3, adults(s3)[0], "BONE_WORKING", 0.6); storeInZone(s3, "log", 4); storeInZone(s3, "bone_axe", 1); grant(s3, adults(s3)[0], "FRAMING", 0.6);
  const cx = { tags: ["wood", "tool", "edge", "hard", "fuel", "dry"], src: "hand", heat: 0, verb: "hit", duration: 200 };
  assert.ok(matches(PHENOMENA.FRAMING, cx).ok, "a log and a bone axe frame timber like a stone axe");
  s3.apply({ type: "keep", item: "timber", n: 2 }); steps(s3, 201);
  const fr = adults(s3)[0]; fr.job = null; fr.action = null; fr.carry = null;         // (hands empty: after 200 ticks of play on the new land they may hold a stick)
  const timberCand = (sim, v) => { let c = null; plan(sim, v, false, (cs) => { c = cs.find(k => k.key.includes(":timber:")); }); return c; };
  const withAxe = timberCand(s3, fr);
  assert.ok(withAxe && (!withAxe.blocker || withAxe.blocker === "MAX_WORKERS"), "(open, or already staffed by someone who has the axe) with only a bone axe in the stockpile the timber job is open (no missing tool)");
  const s4 = depthSim(); grant(s4, adults(s4)[0], "FRAMING", 0.6); storeInZone(s4, "log", 4); s4.apply({ type: "keep", item: "timber", n: 2 }); steps(s4, 201);
  const f4 = adults(s4)[0]; f4.job = null; f4.action = null;
  const noAxe = timberCand(s4, f4);
  assert.ok(noAxe && noAxe.blocker === "NO_MATERIAL" && noAxe.short === "stone_axe", "with no axe at all it is blocked on one");
}

// ---- 5. perturbation --------------------------------------------------------------------------------------------------------------------
{
  const a = perturbOf(7), b = perturbOf(7), c = perturbOf(8);
  assert.deepEqual(a, b, "deterministic per seed");
  assert.notDeepEqual(a, c, "different seeds differ");
  let lo = 9, hi = 0, devs = 0;
  for (let seed = 1; seed <= 40; seed++) for (const k of PERTURB_KEYS) { const v = perturbOf(seed)[k]; lo = Math.min(lo, v); hi = Math.max(hi, v); if (Math.abs(v - 1) >= 0.03) devs++; }
  assert.ok(lo >= 1 - PERTURB_SPAN - 1e-9 && hi <= 1 + PERTURB_SPAN + 1e-9, "bounded +-10%: " + lo + ".." + hi);
  assert.ok(lo < 0.95 && hi > 1.05, "and it uses the range");
  assert.ok(devs > 100, "most seeds show several noticeable deviations");
  // the perturbation draws nothing from the sim's own streams, and is off in an older world
  const s1 = Sim.create(7, { villagers: 2, depth: true, biomes: true }), s2 = Sim.create(7, { villagers: 2, depth: false, biomes: true });
  assert.equal(pt(s2, "fuel_peat"), 1); assert.equal(pt(s1, "fuel_peat"), a.fuel_peat);
  assert.deepEqual(s1.rng.counters(), s2.rng.counters(), "no stream moves");
  // applied: ore yield averages the factor, spoilage uses it
  const sim = depthSim(); sim.seed = 7;
  for (const k of ["ore_copper", "ore_iron", "ore_clay", "ore_salt"]) {
    sim.cache.pt = { ...a, [k]: 1.1 };
    let tot = 0; for (let i = 0; i < 2000; i++) { const y = oreYield(sim, k === "ore_copper" ? "malachite" : k === "ore_iron" ? "iron_ore" : k === "ore_clay" ? "clay" : "salt", 2, i * 17 + 3); assert.ok(y === 2 || y === 3); tot += y; }
    assert.ok(Math.abs(tot / 2000 - 2.2) < 0.08, k + " richer ore: mean " + tot / 2000);
    sim.cache.pt = { ...a, [k]: 0.9 };
    tot = 0; for (let i = 0; i < 2000; i++) tot += oreYield(sim, k === "ore_copper" ? "malachite" : k === "ore_iron" ? "iron_ore" : k === "ore_clay" ? "clay" : "salt", 2, i * 17 + 3);
    assert.ok(Math.abs(tot / 2000 - 1.8) < 0.08);
  }
  sim.cache.pt = null;
  {                                                                               // peat burns longer or shorter by this world's property
    const hh = { fuel: 0, lit: 0, fi: "" }, base = FUEL_TICKS.dried_peat;
    addFuel(hh, "dried_peat", 1, 0, 1.08); assert.equal(hh.fuel, Math.round(base * 1.08));
  }
  const spoilRun = (mul) => {
    const s = depthSim(); s.cache.pt = { ...perturbOf(s.seed), spoil_meat: mul };
    s.ents.ofKind("item").filter(i => i.item === "hopper_meat").forEach(i => s.ents.remove(i.id));
    storeInZone(s, "hopper_meat", 60);
    s.cache.iv++;
    for (let d = 0; d < 3; d++) { s.cache.sprouts = []; spoilDaily(s); }
    return survey(s).stock.hopper_meat;
  };
  const lowS = spoilRun(0.9), highS = spoilRun(1.1);
  assert.ok(lowS > highS, "meat spoils slower at 0.9 than 1.1: " + lowS + " vs " + highS);
  note("spoilage: " + lowS + " vs " + highS + " meat left of 60 after 3 days");
  // shown in "This world"
  let shown = 0;
  for (const seed of [7, 8, 9]) {
    const s = Sim.create(seed, { villagers: 1, depth: true, biomes: true });
    const w = thisWorld(s);
    assert.ok(w.on && w.props.every(p => /\(\+?-?\d+%\)/.test(p.text) && Math.abs(p.pct) >= 3 && Math.abs(p.pct) <= 10) && w.facts.length >= 4);
    shown += w.props.length;
    const alm = almanac(s);
    assert.deepEqual(alm.world, w);
  }
  assert.ok(shown >= 5, "'This world' lists deviations: " + shown);
  assert.equal(thisWorld(loadFixture("settled")).on, 0, "an older world has no such section");
  const peatSeed = [...Array(40).keys()].map(i => i + 1).find(s => perturbOf(s).fuel_peat >= 1.08);
  assert.ok(peatSeed, "some seed has peat that burns hot");
  const sp = Sim.create(peatSeed, { villagers: 1, depth: true, biomes: true });
  assert.ok(thisWorld(sp).props.some(p => /Peat here burns hot/.test(p.text)), "the Almanac says so");
}

// ---- 6. the validator, the switch, save and determinism ---------------------------------------------------------------------------------
{
  let moved = 0, withSalt = 0, withPeat = 0, withHerb = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { world, ents, gen, def } = generateWorld(seed, { biomes: true, depth: true });
    assert.ok(gen.ok, "seed " + seed + ": the validator passes with the S14 deposits: " + gen.fails);
    if (gen.spawn.x !== 0 || gen.spawn.y !== 0) moved++;
    const S = world.site, near = (kind) => depositsIn(def, kind, S.x - 80, S.y - 80, S.x + 80, S.y + 80);
    for (const k of ["salt", "peat", "herb"]) {
      let cells = 0; for (const d of near(k)) for (let y = d.y - d.r; y <= d.y + d.r; y++) for (let x = d.x - d.r; x <= d.x + d.r; x++) if (world.mat(x, y, world.hsAt(x, y)) === { salt: M.SALT, peat: M.PEAT, herb: M.HERB }[k]) cells++;
      if (near(k).length) assert.ok(cells >= 4, "seed " + seed + ": a " + k + " deposit has cells");
    }
    if (near("salt").length) withSalt++; if (near("peat").length) withPeat++; if (near("herb").length) withHerb++;
    // a world made with and without the depth content differs only by the deposits: same terrain, same camp
    if (seed <= 3) {
      const old = generateWorld(seed, { biomes: true, depth: false });
      if (old.world.site.x !== world.site.x || old.world.site.y !== world.site.y) continue;       // (the S14 checks can move the camp: then the lands differ by design)
      let diff = 0; for (let y = S.y - 50; y < S.y + 50; y++) for (let x = S.x - 50; x < S.x + 50; x++) if (old.world.hsAt(x, y) !== world.hsAt(x, y)) diff++;
      assert.equal(diff, 0, "same heightmap");
    }
  }
  assert.ok(withSalt >= 18 && withPeat >= 18 && withHerb >= 18, "the deposits exist near the camp on nearly every seed: " + [withSalt, withPeat, withHerb]);
  note("validator: 20 seeds ok (" + moved + " camps moved off the origin by the spawn search); salt/peat/herb within 80 cells on " + [withSalt, withPeat, withHerb]);
}
{
  // a new game starts with the content, wolves and grazers appear lazily, and a world made without it plays on without
  const sim = Sim.create(7, { depth: true, biomes: true });
  assert.equal(sim.dp.on, 1);
  steps(sim, 30);
  const start = (sp) => fauna(sim, sp).filter(e => !e.wi);           // (S16: chunks activated far out may hold wild packs and herds of their own, marked wi)
  assert.equal(start("wolf").length, 4, "a pack of four wolves");
  assert.ok(start("grazer").length === 5, "a herd of five grazers");
  const wl = start("wolf")[0], gz = start("grazer")[0];
  assert.equal(sim.world.biomeAt(wl.home[0], wl.home[1]), 1, "the pack's ground is the highland");
  assert.ok(saltLicks(sim, gz.home[0], gz.home[1], 6).length > 0 || sim.world.biomeAt(gz.x, gz.y) === 2, "the herd grazes at a salt lick or in the marsh");
  const old = loadFixture("settled"); steps(old, 60);
  assert.equal(fauna(old, "wolf").length + fauna(old, "grazer").length, 0, "an older world spawns neither");
}
{
  // save round-trip with illness in flight, and determinism of the same run twice
  const make = () => { const s = depthSim(), vs = adults(s); grant(s, vs[1], "HERBAL", 0.5); fallIll(s, vs[0], "test"); storeInZone(s, "herbal_remedy", 2); s.wild.i2 = 0; return s; };
  const a = make(); steps(a, DUR_DAY);
  const text = toJSON(a), b = restore(text);
  assert.equal(b.hash(), a.hash(), "restored state hashes equal");
  assert.equal(b.dp.on, 1);
  steps(a, 1500); steps(b, 1500);
  assert.equal(b.hash(), a.hash(), "the continuation is identical after a save/load, with sickness, wolves and grazers in play");
  const c = make(); steps(c, DUR_DAY); steps(c, 1500);
  assert.equal(c.hash(), a.hash(), "two runs of the same scenario agree");
  // an older save (no dp) still loads, as an older world
  const o = loadFixture("settled"), t = JSON.parse(toJSON(o)); delete t.dp;
  assert.equal(restore(t).dp.on, 0);
}
console.log(lines.join("\n"));
console.log("depth ok");
