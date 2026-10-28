// S15 settlement depth, quick: pure where it can be, fixture-based (<= 3 game days) where it must be.
//   1 room purposes: each one's checklist and graded quality, bedroom rest and mood (partners share one), storage as a room-stockpile with less spoilage, the kitchen
//     (cook job, bigger yield with quality, a bonus for a meal eaten by its fire)
//   2 transport: wheels and a wagon made at the bench, a wagon on a long haul carries more per trip, an animal cart needs its grazer fed, hitch/unhitch leave no trace
//   3 advisory notifications: one card per class, hysteresis, dismiss and snooze; the stable Concerns order
//   4 the chronicle export (pure)
//   5 save round trip and determinism
//   node tests/settle.js
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { toJSON, restore } from "../src/sim/save.js";
import { DUR_DAY } from "../src/sim/clock.js";
import { isAdult, updateNeeds, NEED_STEP } from "../src/sim/villager.js";
import { World } from "../src/sim/world.js";
import { instantHut, flatSpot, clearArea } from "./helpers.js";
import { evaluate } from "../src/sim/roomeval.js";
import { PURPOSES, PURPOSE_ORDER, bedroomQ, storageMul, BEDROOM_REST } from "../src/sim/purposes.js";
import { storeCell, inStore, storeInZone, putStack, spoilDaily, haveTotal, survey, carryCap, ITEMS } from "../src/sim/items.js";
import { cookAt, cookBonus, kitchens, DISHES } from "../src/sim/kitchen.js";
import { cookMul } from "../src/sim/fire.js";
import { plan } from "../src/sim/jobs.js";
import { putStation } from "../tools/make_fixtures.js";
import { RECIPES, makeAtBench } from "../src/sim/craft.js";
import { grant } from "../src/sim/knowledge.js";
import { WAGON, spawnWagon, wagonReady, freeWagon, tripDone, wagonOf, CART_FODDER } from "../src/sim/wagon.js";
import { reservedByOther } from "../src/sim/jobstate.js";
import { dropLoose } from "../src/sim/items.js";
import { advise, dismiss, snooze, newAdvisor, ADVISE } from "../src/ui/advisory.js";
import { stableOrder, concerns } from "../src/ui/concerns.js";
import { chronicleMarkdown } from "../src/ui/chronicletext.js";
import { kill } from "../src/sim/population.js";
import { describe, wagonLine, BLOCKER_TEXT } from "../src/ui/text.js";

let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
const steps = (sim, k) => { for (let i = 0; i < k; i++) sim.step(); };
const bed = (sim, x, y, z) => sim.ents.add("furniture", { f: "bed", x, y, z, owner: 0, rv: 0, rt: 0 });
const hearthAt = (sim, x, y, z, lit = 1) => sim.ents.add("furniture", { f: "hearth", x, y, z, owner: 0, rv: 0, rt: 0, fuel: lit ? 9000 : 0, lit, fi: "log", hl: lit ? 2 : 0 });
/** A 7x6 hut (interior 5x4) on flat ground: {x0, y0, z, cells:[[x,y]...interior]}. Purpose set afterwards. */
function hut(sim, skip = 0) {
  const [x0, y0, z] = flatSpot(sim, 7, 6, skip);
  clearArea(sim, x0, y0, 7, 6, z);
  instantHut(sim, x0, y0, 7, 6, { z });
  const cells = [];
  for (let y = y0 + 1; y <= y0 + 4; y++) for (let x = x0 + 1; x <= x0 + 5; x++) cells.push([x, y]);
  return { x0, y0, z, cells, room: () => sim.rooms.at(x0 + 1, y0 + 1, z) };
}
const setP = (sim, h, p) => sim.apply({ type: "purpose", x: h.x0 + 1, y: h.y0 + 1, z: h.z, p });
const check = (ev, k) => ev.checks.find(c => c.k === k);

// ---- 1. room purposes ------------------------------------------------------------------------------------------------------------

{
  const sim = loadFixture("settled");
  assert.deepEqual(PURPOSE_ORDER.slice().sort(), Object.keys(PURPOSES).sort(), "every purpose is a data row and is offered");
  // every purpose has a checklist beyond the basics, a quality word and a blurb
  const h = hut(sim);
  for (const p of PURPOSE_ORDER) {
    assert.ok(setP(sim, h, p), "the " + p + " purpose can be set");
    const ev = evaluate(sim, h.room());
    assert.equal(ev.purpose, p);
    assert.ok(ev.checks.length >= 5 && ev.word && PURPOSES[p].blurb, p + " has a checklist and a quality word");
  }
  assert.equal(setP(sim, h, "palace"), false, "an unknown purpose is refused");
  ok("every purpose is a data row with a checklist and a quality word");

  // bedroom: beds count, quality grades
  setP(sim, h, "bedroom");
  let ev = evaluate(sim, h.room());
  assert.equal(check(ev, "beds").ok, false, "no beds yet");
  const q0 = ev.quality;
  for (let i = 0; i < 5; i++) bed(sim, h.cells[i][0], h.cells[i][1], h.z);
  ev = evaluate(sim, h.room());
  assert.equal(check(ev, "beds").ok, true, "five beds for a 20-cell room");
  assert.ok(ev.quality > q0, "quality rises with the beds: " + q0.toFixed(2) + " -> " + ev.quality.toFixed(2));
  assert.ok(check(ev, "door").ok && check(ev, "warm") !== undefined, "door and warmth are on the list");

  // rest and mood: the same sleeper, bed and hours; only the purpose differs
  const v = adults(sim)[0], b = sim.ents.ofKind("furniture").find(f => f.f === "bed" && sim.rooms.at(f.x, f.y, f.z) === h.room());
  sim.ents.move(v, b.x, b.y, b.z);
  const sleep = () => { v.slp = 1; v.rest = 2; v.energy = 0.2; v.mood = 0.3; v.hunger = v.thirst = 1; v.warm = 1; for (let i = 0; i < 12; i++) updateNeeds(sim, v); return [v.energy, v.mood]; };
  setP(sim, h, "shelter");
  const [eS, mS] = sleep();
  setP(sim, h, "bedroom");
  const q = evaluate(sim, h.room()).quality;
  assert.ok(bedroomQ(sim, (v.slp = 1, v.rest = 2, v)) >= 0, "a sleeper in a bed in a bedroom has a bedroom quality");
  const [eB, mB] = sleep();
  assert.ok(eB > eS, "a bedroom rests better: " + eB.toFixed(3) + " vs " + eS.toFixed(3));
  assert.ok(mB > mS, "and lifts the mood: " + mB.toFixed(3) + " vs " + mS.toFixed(3));
  assert.ok(Math.abs((eB - 0.2) / (eS - 0.2) - (1 + BEDROOM_REST * q)) < 0.05, "by the quality-scaled factor");
  v.slp = 0; v.rest = 0;
  ok("bedroom: beds checked, rest +" + Math.round((eB - eS) / (eS - 0.2) * 100) + "%, mood +" + (mB - mS).toFixed(3) + " at quality " + q.toFixed(2));

  // partners share one: a bedroom with two free beds, one elsewhere nearer to the villager
  const a = adults(sim)[1], c = adults(sim)[2];
  a.mate = c.id; c.mate = a.id;
  const inRoom = sim.ents.ofKind("furniture").filter(f => f.f === "bed" && sim.rooms.at(f.x, f.y, f.z) === h.room());
  inRoom[0].owner = a.id; a.bed = inRoom[0].id;                       // a sleeps in the bedroom
  const [fx, fy, fz] = flatSpot(sim, 2, 2, 3); clearArea(sim, fx, fy, 2, 2, fz);
  const near = bed(sim, fx, fy, fz);                                  // a free bed out in the open, where c stands
  sim.ents.move(c, fx + 1, fy, fz);
  c.energy = 0.05; c.bed = 0; c.slp = 0; c.action = null; c.job = null;
  let pick = null;
  plan(sim, c, false, (cands) => { pick = cands.find(k => k.kind === "sleep"); }, true);
  assert.ok(pick, "the partner plans to sleep");
  const got = sim.ents.get(pick.tid);
  assert.ok(got && sim.rooms.at(got.x, got.y, got.z) === h.room() && got.id !== near.id, "the partner is given a bed in the same bedroom, not the nearer open one");
  a.mate = c.mate = 0; a.bed = 0; inRoom[0].owner = 0; sim.ents.remove(near.id);
  ok("partners are given beds in the same bedroom");

  // storage: shelves on the list, the room is a stockpile, spoilage is lower, food goes there first
  const s2 = loadFixture("settled"), h2 = hut(s2, 1);
  setP(s2, h2, "storage");
  let e2 = evaluate(s2, h2.room());
  assert.equal(check(e2, "shelves").ok, false, "no shelves yet");
  const qNo = e2.quality;
  assert.equal(inStore(s2, h2.cells[0][0], h2.cells[0][1], h2.z), true, "a closed Storage room is a stockpile");
  for (let i = 0; i < 4; i++) s2.ents.add("furniture", { f: "shelf", x: h2.cells[i][0], y: h2.cells[i][1], z: h2.z, owner: 0, rv: 0, rt: 0 });
  e2 = evaluate(s2, h2.room());
  assert.equal(check(e2, "shelves").ok, true, "four shelves for twenty cells");
  assert.ok(e2.quality > qNo, "shelves raise the quality");
  const c0 = storeCell(s2, "berry", h2.x0 + 3, h2.y0 + 5);
  assert.ok(c0 && s2.rooms.at(c0[0], c0[1], c0[2]) === h2.room(), "food is carried to the storage room first: " + c0);
  setP(s2, h2, "none");
  assert.equal(inStore(s2, h2.cells[0][0], h2.cells[0][1], h2.z), false, "and it is not a stockpile when it has no purpose");
  setP(s2, h2, "storage");
  for (const f of ["berry", "tuber"]) for (const s of s2.ents.ofKind("item").filter(i => i.item === f).slice()) s2.ents.remove(s.id);
  putStack(s2, "berry", 10, h2.cells[8][0], h2.cells[8][1], h2.z);      // ten berries in the room ...
  storeInZone(s2, "berry", 10);                                         // ... and ten in the open yard
  s2.cache.iv++;
  const lost = { room: 0, yard: 0 };
  for (let d = 0; d < 8; d++) {
    const before = (where) => s2.ents.ofKind("item").filter(i => i.item === "berry" && (s2.rooms.at(i.x, i.y, i.z) ? "room" : "yard") === where).reduce((t, i) => t + i.n, 0);
    const r0 = before("room"), y0 = before("yard");
    s2.tick += DUR_DAY; spoilDaily(s2);
    lost.room += r0 - before("room"); lost.yard += y0 - before("yard");
  }
  assert.ok(lost.yard > 0 && lost.room < lost.yard, "less spoils in the storage room over eight days: " + lost.room + " vs " + lost.yard);
  assert.ok(storageMul(e2.quality) < storageMul(0) && storageMul(1) < 0.6, "a better room saves more");
  ok("storage: shelves checked, a room-stockpile for food, " + lost.room + " vs " + lost.yard + " berries lost in 8 days");

  // kitchen: hearth on the checklist, the cook job makes dishes, quality adds yield, eating by its fire is worth more
  const s3 = loadFixture("settle"), h3 = hut(s3, 2);
  setP(s3, h3, "kitchen");
  let e3 = evaluate(s3, h3.room());
  assert.equal(check(e3, "hearth").ok, false, "no fire ring yet");
  assert.equal(kitchens(s3).length, 0);
  const fire = hearthAt(s3, h3.cells[7][0], h3.cells[7][1], h3.z);
  e3 = evaluate(s3, h3.room());
  assert.equal(check(e3, "hearth").ok, true, "a fire ring inside");
  assert.equal(kitchens(s3).length, 1, "the kitchen is found");
  const ck = adults(s3)[0];
  sim_move(s3, ck, h3.cells[8][0], h3.cells[8][1], h3.z);
  const eatPlain = cookMul(s3, ck, "dried");
  assert.ok(eatPlain > 1, "a meal eaten by the kitchen's fire is worth more: x" + eatPlain.toFixed(2));
  ck.carry = { item: "hopper_meat", n: 4 };
  const meat0 = haveTotal(s3, "cooked_meat");
  assert.equal(cookAt(s3, ck, fire, "cooked_meat"), null);
  const bonus = cookBonus(e3.quality);
  assert.equal(haveTotal(s3, "cooked_meat") - meat0, 4 + bonus, "4 raw meat make " + (4 + bonus) + " cooked at quality " + e3.quality.toFixed(2));
  assert.ok(bonus >= 1, "a decent kitchen adds food");
  assert.ok(ITEMS.cooked_meat.food * 1 > ITEMS.hopper_meat.food && ITEMS.cooked_meat.spoil < ITEMS.hopper_meat.spoil, "cooked meat is richer and keeps longer");
  ck.carry = null;
  for (const s of s3.ents.ofKind("item").filter(i => i.item === "cooked_meat").slice()) s3.ents.remove(s.id);
  s3.cache.iv++;
  fire.lit = 0; fire.fuel = 0;
  ck.carry = { item: "hopper_meat", n: 4 };
  assert.equal(cookAt(s3, ck, fire, "cooked_meat"), "TOO_COLD", "a cold ring cooks nothing");
  ck.carry = null; fire.lit = 1; fire.fuel = 9000;
  // the job: villagers cook by themselves
  const stockMeat = haveTotal(s3, "hopper_meat");
  let done = -1;
  for (let i = 0; i < 2 * DUR_DAY && done < 0; i++) { s3.step(); if (haveTotal(s3, "cooked_meat") > 0) done = i; }
  assert.ok(done >= 0, "within two days a villager cooks in the kitchen as a job (meat " + stockMeat + " raw in stock)");
  ok("kitchen: fire ring checked, cooked in " + done + " ticks, x" + eatPlain.toFixed(2) + " eating by the fire");
}
function sim_move(sim, v, x, y, z) { sim.ents.move(v, x, y, z); }


// ---- 2. wheels, wagons and carts ---------------------------------------------------------------------------------------------------

/** Six logs-heaps in a row, ~dist cells east of the stockpile, on one level: [[x,y,z]...]. */
function farHeaps(sim, dist = 30) {
  const z0 = sim.stock.z;
  for (let dx = dist; dx < dist + 25; dx++) for (let dy = -8; dy <= 8; dy++) {
    const x = sim.stock.x1 + dx, y = sim.stock.y0 + dy;
    let good = true;
    for (let i = 0; i < 6 && good; i++) if (sim.world.standZ(x + i, y) !== z0 || sim.ents.at(x + i, y, z0).some(id => sim.ents.get(id).kind !== "plant")) good = false;
    if (!good) continue;
    const v = adults(sim)[0];
    if (!sim.path.find(World.idx(v.x, v.y, v.z), World.idx(x, y, z0)).ok) continue;
    clearArea(sim, x, y, 6, 1, z0);
    const out = [];
    for (let i = 0; i < 6; i++) { dropLoose(sim, "log", 10, x + i, y, z0); out.push([x + i, y, z0]); }
    return out;
  }
  throw new Error("no far ground for the heaps");
}
/** Run `ticks` and report what the haul looked like: the biggest load carried, deliveries, wagon jobs seen. */
function haulRun(sim, ticks, each) {
  const r = { maxLoad: 0, jobs: 0, store0: survey(sim).stock.log, hitched: 0 };
  for (let i = 0; i < ticks; i++) {
    if (each) each(sim);
    sim.step();
    for (const v of sim.ents.ofKind("villager")) {
      if (v.carry && v.carry.item === "log" && v.carry.n > r.maxLoad) r.maxLoad = v.carry.n;
      if (v.job && v.job.k === "haul_wagon" && v.action) { r.jobs++; if (v.wg) r.hitched++; }
    }
  }
  r.moved = survey(sim).stock.log - r.store0;
  return r;
}

{
  // the recipes: wheels from timber and sticks, a wagon from timber and wheels (at a bench, by a villager who knows FRAMING)
  assert.ok(RECIPES.wheel && RECIPES.wagon && RECIPES.cart && RECIPES.wagon.craft === "FRAMING" && RECIPES.wagon.inputs.wheel === 4, "wheel, wagon and cart are bench recipes that want FRAMING");
  const sim = loadFixture("settle"), bench = sim.ents.ofKind("furniture").find(f => f.f === "workbench"), mk = adults(sim)[0];
  bench.inv = { timber: 2, stick: 2 }; bench.rcp = "wheel";
  const w0 = haveTotal(sim, "wheel");
  assert.equal(makeAtBench(sim, mk, bench, "wheel"), null);
  assert.equal(haveTotal(sim, "wheel") - w0, 2, "two wheels from the bench");
  assert.equal(sim.ents.ofKind("wagon").length, 0);

  // a keep-N on wagons: villagers build one at the bench (timber and wheels are in stock)
  sim.apply({ type: "keep", item: "wagon", n: 1 });
  let built = -1;
  for (let i = 0; i < 3 * DUR_DAY && built < 0; i++) { sim.step(); if (sim.ents.ofKind("wagon").length) built = i; }
  assert.ok(built >= 0, "a wagon is built at the bench within three days");
  const wg = sim.ents.ofKind("wagon")[0];
  assert.equal(wg.t, "wagon");
  assert.equal(survey(sim).stock.wagon, 1, "the village counts its wagon");
  assert.ok(sim.chron.entries.some(e => /first wagon/.test(e.text)), "and chronicles it");
  assert.ok(/Wagon/.test(describe(sim, wg)) && wagonLine(sim, wg), "it can be described");
  ok("a wagon is built at the workbench (" + built + " ticks), wheels from timber and sticks");
}

let hand, wag;
{
  const base = loadFixture("settle");
  sim_fixup(base);
  farHeaps(base);
  const snap = toJSON(base);
  const a = restore(snap), b = restore(snap);
  hand = haulRun(a, 2400);
  const st = b.stock, wgn = spawnWagon(b, "wagon", st.x1 + 2, st.y0, b.stock.z);
  assert.ok(wgn.id, "a wagon stands by the stockpile");
  wag = haulRun(b, 2400);
  assert.ok(hand.maxLoad <= 4, "by hand a log haul is a couple of logs a trip: " + hand.maxLoad);
  assert.ok(wag.jobs > 0 && wag.hitched > 0, "a wagon haul job ran (" + wag.jobs + " ticks, " + wag.hitched + " hitched)");
  assert.ok(wag.maxLoad >= 8, "a wagon trip carries a lot more: " + wag.maxLoad + " logs (by hand " + hand.maxLoad + ")");
  assert.ok(wag.moved >= hand.moved, "and moves at least as much in the same time: " + wag.moved + " vs " + hand.moved);
  assert.ok(b.ents.ofKind("wagon")[0].tr >= 1, "the trip is counted");
  assert.ok(b.chron.entries.some(e => /first long haul/.test(e.text)), "and the first long haul is chronicled");
  assert.ok(b.ents.ofKind("villager").every(v => !v.wg || (b.ents.get(v.wg) && b.ents.get(v.wg).dr === v.id)), "hitching is consistent");
  ok("wagon on a long haul: biggest load " + wag.maxLoad + " logs vs " + hand.maxLoad + " by hand; moved " + wag.moved + " vs " + hand.moved);
}
function sim_fixup(sim) { sim.cache.iv++; }

{
  // an animal cart: pulled by a penned grazer that must be fed
  const base = loadFixture("settle"), pen = base.farm.pens[base.farm.pens.length - 1];
  farHeaps(base);
  const cart = spawnWagon(base, "cart", base.stock.x1 + 2, base.stock.y0, base.stock.z);
  const v = adults(base)[0];
  base.ents.move(v, cart.x - 1, cart.y, cart.z);          // (S18b: the fixture is taken at a different moment of the day: stand the villager beside the cart)
  pen.fod = 0; pen.hg = 0;
  assert.equal(wagonReady(base, cart), "NO_FODDER", "an unfed grazer cannot pull the cart");
  assert.equal(freeWagon(base, v, reservedByOther), null, "so it is not offered for a haul");
  assert.ok(BLOCKER_TEXT.NO_FODDER && BLOCKER_TEXT.NO_ANIMAL, "and the blockers have words");
  pen.fod = 5;
  assert.equal(wagonReady(base, cart), "", "fed, it can");
  assert.equal(freeWagon(base, v, reservedByOther).id, cart.id);
  const f0 = pen.fod; tripDone(base, v, cart);
  assert.equal(pen.fod, f0 - CART_FODDER, "a trip eats fodder from the pen's trough");
  pen.fod = 40;
  const snap = toJSON(base);
  const cr = haulRun(restore(snap), 2400);
  assert.ok(cr.jobs > 0 && cr.maxLoad >= wag.maxLoad, "a cart hauls too, and at least as much as a wagon: " + cr.maxLoad + " logs");
  const dry = restore(snap);
  const dr = haulRun(dry, 1200, (q) => { const p = q.farm.pens[q.farm.pens.length - 1]; p.fod = 0; p.hg = 0; });       // (villagers would feed the pen: hold the trough empty)
  assert.equal(dr.jobs, 0, "with no fodder the cart stays where it is");
  const noAnimal = restore(snap); for (const g of noAnimal.ents.ofKind("fauna").filter(e => e.sp === "grazer")) noAnimal.ents.remove(g.id);
  assert.equal(wagonReady(noAnimal, noAnimal.ents.ofKind("wagon")[0]), "NO_ANIMAL", "no grazer, no cart");
  assert.ok(WAGON.cart.cap > WAGON.wagon.cap && WAGON.cart.drag < WAGON.wagon.drag && WAGON.cart.drag < 1, "a cart carries more and is faster than a wagon");
  ok("animal cart: needs fodder (none: no haul), eats " + CART_FODDER + " a trip, carried " + cr.maxLoad + " logs");
}


// ---- 3. advisory notifications (pure) ----------------------------------------------------------------------------------------------

{
  const cold = (level, extra = {}) => ({ k: "cold", level, text: "3 villager(s) have no bed", adv: "Winter in 5 days and 3 villagers have no warm bed", loc: { x: 1, y: 2, z: 3 }, ...extra });
  const food = (level) => ({ k: "food", level, text: "Food is critical", adv: "Food is critical", loc: null });
  const adv = newAdvisor();
  assert.deepEqual(advise(adv, [cold(2)], 0), [], "a moderate concern raises no card");
  let c = advise(adv, [cold(3)], 10);
  assert.equal(c.length, 1); assert.equal(c[0].k, "cold"); assert.match(c[0].text, /Winter in 5 days and 3 villagers have no warm bed/);
  const since = c[0].since;
  for (let t = 20; t < 400; t += 10) c = advise(adv, [cold(t % 40 === 0 ? 2 : 3)], t);     // flickers between 2 and 3: one card, never a second
  assert.equal(c.length, 1); assert.equal(c[0].since, since, "hysteresis: a level that dithers between 2 and 3 does not raise it again");
  // two classes: one card each, oldest first; at most MAX_SHOWN
  c = advise(adv, [cold(3), food(3)], 410);
  assert.deepEqual(c.map(x => x.k), ["cold", "food"], "one card per class, in the order they rose");
  c = advise(adv, [cold(3), food(3), { k: "illness", level: 3, text: "a", loc: null }, { k: "danger", level: 3, text: "b", loc: null }], 420);
  assert.equal(c.length, ADVISE.MAX_SHOWN, "no more than " + ADVISE.MAX_SHOWN + " cards at once");
  assert.equal(c.filter(x => x.k === "cold").length, 1, "never two for one class");
  // dismiss: gone, and stays gone while the class stays up
  const d = newAdvisor();
  advise(d, [cold(3)], 0);
  dismiss(d, "cold");
  assert.deepEqual(advise(d, [cold(3)], 5), []);
  assert.deepEqual(advise(d, [cold(3)], 5000), [], "a dismissed class stays quiet while it lasts");
  advise(d, [], 6000);                                              // it eases
  assert.deepEqual(advise(d, [cold(3)], 6100), [], "no repeat inside the re-arm window (" + ADVISE.REARM + " ticks)");
  assert.equal(advise(d, [cold(3)], 6000 + ADVISE.REARM + 10).length, 1, "a later, separate alarm raises a fresh card");
  // snooze: hidden for SNOOZE ticks, back if still up, gone if it eased meanwhile
  const z = newAdvisor();
  advise(z, [food(3)], 0);
  snooze(z, "food", 0);
  assert.deepEqual(advise(z, [food(3)], ADVISE.SNOOZE - 1), []);
  assert.equal(advise(z, [food(3)], ADVISE.SNOOZE + 1).length, 1, "a snoozed card comes back while the trouble lasts");
  const z2 = newAdvisor();
  advise(z2, [food(3)], 0); snooze(z2, "food", 0);
  advise(z2, [], 100);
  assert.deepEqual(advise(z2, [], ADVISE.SNOOZE + 2), [], "and a snoozed card does not come back if the trouble has gone");
  // a stable display order: equal levels keep their places however the input is ordered; a level change moves a class
  const prev = [];
  const a1 = stableOrder([{ k: "food", level: 2 }, { k: "cold", level: 2 }, { k: "idle", level: 1 }], prev).map(x => x.k);
  const a2 = stableOrder([{ k: "cold", level: 2 }, { k: "idle", level: 1 }, { k: "food", level: 2 }], prev).map(x => x.k);
  assert.deepEqual(a1, a2, "the same set in another input order is shown in the same order");
  const a3 = stableOrder([{ k: "food", level: 2 }, { k: "cold", level: 3 }, { k: "idle", level: 1 }], prev).map(x => x.k);
  assert.equal(a3[0], "cold", "a class that rises goes up");
  // the real thing: the cold class gives the winter sentence
  const sim = loadFixture("settled");
  sim.board.sc = 1; sim.board.sneed = 3;
  const cn = concerns(sim).find(q => q.k === "cold");
  assert.match(cn.adv, /^(Winter in \d+ days? and|It is winter and) 3 villagers have no warm bed$/);
  ok("advisory: one card per class, hysteresis, dismiss, snooze, stable order; \"" + cn.adv + "\"");
}

// ---- 4. the chronicle export (pure) ------------------------------------------------------------------------------------------------

{
  const sim = loadFixture("year2"), vs = sim.ents.ofKind("villager").slice();
  const h0 = sim.hash();
  vs[0].ti = ["first in firecraft"]; vs[1].hl = { n: "the Grey Comb", h: [{ n: "Old Ba", t: 0 }, { n: vs[1].name, t: sim.tick }] };
  const doomed = vs[2]; doomed.ti = ["master digger"]; doomed.hl = { n: "the Worn Flute", h: [{ n: doomed.name, t: 0 }] };
  kill(sim, doomed, "cold");
  const md = chronicleMarkdown(sim);
  for (const h of ["# Chronicle", "## The village today", "## Eras", "## Firsts", "## Births and deaths", "## Notable people", "## Graves", "## Heirlooms"]) assert.ok(md.includes(h), "has " + h);
  assert.ok(/Year \d+, day \d+/.test(md), "dates are readable");
  assert.ok(md.includes(doomed.name + " (generation") && /died of cold/.test(md), "the death is there with its context");
  assert.ok(md.includes("Master digger") && md.includes(doomed.name), "the dead keep their titles");
  assert.ok(md.includes("First in firecraft") && md.includes(vs[0].name), "so do the living");
  assert.ok(md.includes("the Grey Comb") && md.includes("Old Ba -> " + vs[1].name), "heirlooms and the hands they passed through");
  assert.ok(md.includes(doomed.name + ", from") && /died of cold/.test(md.split("## Graves")[1]), "a grave with its inscription");
  assert.ok(/Worn Flute/i.test(md.split("## Heirlooms")[1]), "the dead's heirloom is accounted for (handed on or buried)");
  assert.ok(/The \w+ age/.test(md), "eras are named");
  assert.equal(chronicleMarkdown(sim), md, "pure: the same text twice");
  assert.ok(md.split("\n").length > 40, "a real history: " + md.split("\n").length + " lines");
  ok("chronicle export: " + md.split("\n").length + " lines, " + md.length + " chars, eras/firsts/births/deaths/notables/graves/heirlooms");
}

// ---- 5. save round trip and determinism ---------------------------------------------------------------------------------------------

{
  const make = () => {
    const sim = loadFixture("settle");
    const h = hut(sim);
    setP(sim, h, "kitchen"); hearthAt(sim, h.cells[7][0], h.cells[7][1], h.z);
    const h2 = hut(sim, 1); setP(sim, h2, "storage"); sim.ents.add("furniture", { f: "shelf", x: h2.cells[0][0], y: h2.cells[0][1], z: h2.z, owner: 0, rv: 0, rt: 0 });
    farHeaps(sim);
    spawnWagon(sim, "wagon", sim.stock.x1 + 2, sim.stock.y0, sim.stock.z);
    spawnWagon(sim, "cart", sim.stock.x1 + 2, sim.stock.y0 + 1, sim.stock.z);
    sim.farm.pens[sim.farm.pens.length - 1].fod = 30;
    return sim;
  };
  const a = make(), b = make();
  steps(a, 500); steps(b, 500);
  assert.equal(a.hash(), b.hash(), "determinism: the same scenario twice gives the same world");
  const c = restore(toJSON(a));
  assert.equal(c.hash(), a.hash(), "a save round-trips mid-haul");
  assert.deepEqual(Object.values(c.rooms.marks).sort(), ["kitchen", "storage"], "purposes are saved");
  assert.equal(c.ents.ofKind("wagon").length, 2);
  steps(a, 600); steps(c, 600);
  assert.equal(c.hash(), a.hash(), "and the restored world plays on identically");
  // an old world is untouched by any of this: no rooms with purposes, no wagons, nothing hitched
  const old = loadFixture("settled");
  assert.equal(old.ents.ofKind("wagon").length, 0);
  assert.ok(old.ents.ofKind("villager").every(v => v.wg === undefined && v.wgc === undefined));
  ok("save round trip mid-haul and determinism over 1100 ticks");
}

console.log("settle ok");
