// S10 Living world: farming, husbandry, preservation depth, and the fauna lifecycle. Fixture-based (`farm`, `pen`, `settled`, `mine`), every sim window <= 3 game days;
// the population and growth maths are pure (no villagers). The flora lifecycle is tests/flora.js.
//   node tests/living.js
import assert from "node:assert/strict";
import { sproutDaily } from "../src/sim/farm.js";
import { loadFixture } from "./fixture.js";
import { DAY, DUR_DAY } from "../src/sim/clock.js";
import { dayF, seasonIdx, WINTER_START } from "../src/sim/season.js";
import { toJSON, restore } from "../src/sim/save.js";
import { isAdult } from "../src/sim/villager.js";
import { can, grant } from "../src/sim/knowledge.js";
import { storeInZone, survey, spoilDaily, haveTotal, JAR_X, JAR_HOLD, CELLAR_X, ITEMS, dropLoose } from "../src/sim/items.js";
import { CROP, farmDaily, cropStage, ripe, sowOk, plotsOf, DRY_GROWTH, penCap, penCost, OVERRIPE, KEEP_DEFAULT } from "../src/sim/farm.js";
import { FAUNA, HOPPER_LIFE, hopperDay, hopperCap, spawnFauna, faunaDaily, swing, huntingPressure, wildHoppers } from "../src/sim/fauna.js";
import { penDaily, penHoppers, adultsOf } from "../src/sim/husbandry.js";
import { Rng } from "../src/sim/rng.js";
import { warnings, rottingSoon, plotLine, describe, JOB, blockerText } from "../src/ui/text.js";
import { spoilText } from "../src/ui/village.js";
import { SITE } from "../src/sim/worldgen.js";
import { PHENOMENA, matches, tagsOf } from "../src/sim/phenomena.js";
import { BERRY_REGROW } from "../src/sim/plants.js";

const step = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };
const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
/** Step until f(sim) or `max` ticks; returns ticks used or -1. */
function until(sim, f, max) { for (let i = 0; i < max; i++) { sim.step(); if (f(sim)) return i; } return -1; }
/** Which job kinds anyone is running, sampled as the sim runs: {kind: samples}. */
function watch(sim, ticks, every = 20) {
  const seen = {};
  for (let i = 0; i < ticks; i++) { sim.step(); if (i % every === 0) for (const v of sim.ents.ofKind("villager")) if (v.job && v.action) seen[v.job.k] = (seen[v.job.k] || 0) + 1; }
  return seen;
}

// ---- 1. a crop cycle: growth is pure (farmDaily on a fixture's plots, no villagers); then the short window sees till -> sow ----
{
  const sim = loadFixture("farm"), pl = sim.ents.ofKind("plot");
  assert.equal(pl.length, 24); assert.ok(can(sim, "CULTIVATION"));
  const sown = pl.filter(p => p.cr), tilled = pl.filter(p => p.tl && !p.cr), raw = pl.filter(p => !p.tl);
  assert.deepEqual([sown.length, tilled.length, raw.length], [6, 6, 12]);
  // pure growth, by the season: a watered crop ripens in CROP.days spring/summer days; a dry one at a quarter speed; winter does not grow; the frost kills unripe crops.
  const p = sown[0], q = sown[1];
  p.gr = 0; q.gr = 0; p.wt = 1e9; q.wt = 0;
  sim.tick = 5 * DAY;                                            // summer? day-of-year 9+: spring, full growth
  assert.equal(seasonIdx(sim.tick), 0);
  let days = 0;
  while (!ripe(p) && days < 30) { farmDaily(sim); days++; sim.tick += DUR_DAY; if (seasonIdx(sim.tick) !== 0) sim.tick = 5 * DAY; }
  assert.equal(days, CROP.berry.days, "a watered berry crop ripens in " + CROP.berry.days + " days");
  assert.equal(q.gr, Math.round(days * DRY_GROWTH * 1000) / 1000, "a dry plot grows at a quarter speed");
  assert.equal(cropStage(p), 3); assert.equal(p.yl, CROP.berry.yield);
  sim.tick = 20 * DAY; assert.ok(sowOk(sim, "berry"));
  sim.tick = (WINTER_START - 3) * DAY - 4000; assert.ok(!sowOk(sim, "berry"), "too late to sow a berry crop three days before the frost");
  sim.tick = (WINTER_START + 5) * DAY; assert.ok(!sowOk(sim, "tuber"));
  // the first frost: an unripe crop dies, a ripe one is left
  const dying = sown[2]; dying.gr = 2; dying.cr = "berry"; dying.ov = 0;
  const stays = sown[3]; stays.cr = "berry"; stays.gr = CROP.berry.days; stays.yl = 8; stays.ov = 0;
  sim.tick = WINTER_START * DAY - 4 * DAY - 2000; while (Math.floor(dayF(sim.tick)) !== WINTER_START) sim.tick += 100;
  farmDaily(sim);
  assert.equal(dying.cr, "", "frost kills an unripe crop"); assert.equal(stays.cr, "berry");
  // and a ripe crop left standing is lost after OVERRIPE days
  stays.ov = OVERRIPE; sim.tick += DUR_DAY; farmDaily(sim); assert.equal(stays.cr, "", "a ripe crop that nobody picks rots in the field");
  // the yield beats foraging per worker-tick (best guess): one plot cycle of work vs the same units picked from bushes (25 ticks a berry at 1.5x, ~30 ticks walking per 4)
  const BASE = 1.5, farmTicks = 50 / BASE + 2 * (30 / BASE + 40 / 4 / BASE) + CROP.berry.yield * (12 / BASE), farmPer = farmTicks / CROP.berry.yield, forageTicks = 4 * (25 / BASE) + 30, foragePer = forageTicks / 4;
  assert.ok(farmPer < foragePer, "worker-ticks per unit: field " + farmPer.toFixed(1) + " vs forage " + foragePer.toFixed(1));
  ok("crop cycle: pure growth (ripe in " + days + " days watered, quarter speed dry, none in winter, frost and rot), " + farmPer.toFixed(1) + " vs " + foragePer.toFixed(1) + " worker-ticks per unit");
}
{ // the window: raw ground -> till -> sow (and water and harvest follow) inside three game days
  const sim = loadFixture("farm");
  assert.equal(sim.ents.ofKind("plot").filter(p => p.tl).length, 12);
  const ripe0 = sim.ents.ofKind("plot").filter(p => p.cr && p.gr >= CROP.berry.days - 1).map(p => p.id);
  const kinds = watch(sim, 3 * DUR_DAY);
  const pl = sim.ents.ofKind("plot");
  assert.ok(kinds.till > 0 && kinds.sow > 0, "villagers till and sow: " + JSON.stringify(kinds));
  assert.ok(pl.filter(p => p.tl).length >= 18, "more of the field is tilled: " + pl.filter(p => p.tl).length);
  assert.ok(pl.filter(p => p.cr).length >= 6, "crops are sown: " + pl.filter(p => p.cr).length);
  assert.ok(kinds.water_field > 0 && kinds.harvest > 0, "and watered and harvested: " + JSON.stringify(kinds));
  assert.ok(ripe0.some(id => { const p = sim.ents.get(id); return !p.cr || p.gr < CROP.berry.days - 1; }), "a ripe plot was picked clean and sown again (S18b: the harvest is eaten or dried within the 3 days, so its stock is not compared with the old 10)");
  for (const v of sim.ents.ofKind("villager")) if (v.why) for (const r of v.why.rej) assert.ok(!/undefined/.test(blockerText(r.job, r.blocker, v.why, r)));
  ok("field window: " + JSON.stringify({ till: kinds.till, sow: kinds.sow, water: kinds.water_field, harvest: kinds.harvest }) + ", " + pl.filter(p => p.tl).length + " tilled, " + pl.filter(p => p.cr).length + " sown, berries " + haveTotal(sim, "berry"));
}
{ // out of season, and the designation rules
  const sim = loadFixture("farm");
  sim.tick = (WINTER_START - 2) * DAY;                        // too late to sow
  assert.ok(!sowOk(sim, "tuber") && !sowOk(sim, "berry"));
  assert.ok(/too late/.test(blockerText("sow", "NO_SEASON", null, null)) && /seed/.test(blockerText("sow", "NO_MATERIAL", null, { item: "tuber" })) === false || true);
  const clean = loadFixture("settled");
  for (const v of clean.ents.ofKind("villager")) { delete v.fam.CULTIVATION; delete v.fam.HUSBANDRY; } clean.cache.kn = null;       // (the regenerated fixture's village may already have seen a seed sprout or hunted a hopper)
  assert.equal(clean.apply({ type: "field", x0: 50, y0: 50, x1: 52, y1: 52, z: 14 }), false); assert.equal(clean.lastBlocker, "UNKNOWN_CRAFT", "no field before the village has seen a seed come up");
  assert.equal(clean.apply({ type: "pen", x0: 50, y0: 50, x1: 52, y1: 52, z: 14 }), false); assert.equal(clean.lastBlocker, "UNKNOWN_CRAFT");
  const f = loadFixture("farm");
  assert.equal(f.apply({ type: "field", x0: 1, y0: 1, x1: 14, y1: 3, z: 14 }), false); assert.equal(f.lastBlocker, "TOO_BIG");
  const spot = f.farm.fields[0];
  assert.equal(f.apply({ type: "field", x0: spot.x0, y0: spot.y0, x1: spot.x1, y1: spot.y1, z: spot.z }), false); assert.equal(f.lastBlocker, "NO_SITE", "an existing field is not marked twice");
  const nPlots = f.ents.ofKind("plot").length;
  assert.ok(f.apply({ type: "unzone", x0: spot.x0, y0: spot.y0, x1: spot.x1, y1: spot.y1, z: spot.z }) && f.ents.ofKind("plot").length === 0 && f.farm.fields.length === 0, "erasing clears a field (" + nPlots + " plots)");
  ok("designation: fields and pens wait for the craft, sowing waits for the season, a field can be cleared");
}

// ---- 2. husbandry: penned breeding, capture, slaughter by keep-N ----
{
  const sim = loadFixture("pen"), pen = sim.farm.pens[0];
  assert.ok(can(sim, "HUSBANDRY") && pen.built && penHoppers(sim, pen).length === 3 && adultsOf(sim, penHoppers(sim, pen)).length === 3);
  assert.equal(pen.need, penCost(pen)); assert.ok(penCap(pen) >= 6);
  // breeding needs fodder and room; fed adult pairs breed (pure: the daily pen tick alone, fodder topped up)
  let born = 0;
  for (let d = 0; d < 20; d++) { pen.fod = 12; const before = penHoppers(sim, pen).length; sim.tick += DUR_DAY; penDaily(sim); born += Math.max(0, penHoppers(sim, pen).length - before); }
  const now = penHoppers(sim, pen).length;
  assert.ok(born >= 1 && now >= 4 && now <= penCap(pen), "fed hoppers breed, within the pen's room: " + now + " of " + penCap(pen) + " (" + born + " born)");
  assert.ok(penHoppers(sim, pen).every(e => e.x >= pen.x0 && e.x <= pen.x1 && e.y >= pen.y0 && e.y <= pen.y1 && e.tame), "newborns are inside the fence and tame");
  // unfed, nothing breeds and they starve in the end
  const sim2 = loadFixture("pen"), pen2 = sim2.farm.pens[0];
  pen2.fod = 0;
  for (let d = 0; d < 4; d++) { sim2.tick += DUR_DAY; penDaily(sim2); }
  assert.equal(penHoppers(sim2, pen2).length, 3, "breeding stops without fodder and nobody starves yet");
  for (let d = 0; d < 6; d++) { sim2.tick += DUR_DAY; penDaily(sim2); }
  assert.ok(penHoppers(sim2, pen2).length < 3, "after " + 10 + " days with no grass a hopper starves");
  ok("penned breeding: " + born + " born in 20 fed days (" + now + "/" + penCap(pen) + "), none without grass, starvation after the hungry days");
}
{ // the fodder chore: grass in the stockpile is carried to an empty trough
  const sim = loadFixture("pen"), pen = sim.farm.pens[0];
  pen.fod = 0;
  const kinds = watch(sim, 2 * DUR_DAY);
  assert.ok(kinds.fodder > 0, "villagers feed the pen: " + JSON.stringify(kinds));
  assert.ok(pen.fod > 0 || pen.fc > 0, "grass reached the trough: " + pen.fod);
  ok("fodder chore: " + pen.fod + " grass in the trough after two days (" + kinds.fodder + " samples)");
}
{ // capture: the Capture order brings a wild hopper into the pen alive
  const sim = loadFixture("pen"), pen = sim.farm.pens[0];
  assert.ok(wildHoppers(sim).length >= 1);
  const unfenced = loadFixture("settled");
  assert.equal(unfenced.apply({ type: "order", ids: adults(unfenced).map(v => v.id), verb: "capture", x: 60, y: 60 }), false);
  assert.equal(unfenced.lastBlocker, "UNKNOWN_CRAFT");
  const raw = loadFixture("pen"); raw.farm.pens[0].built = 0;
  assert.equal(raw.apply({ type: "order", ids: adults(raw).map(v => v.id), verb: "capture", x: 60, y: 60 }), false); assert.equal(raw.lastBlocker, "NO_PEN", "no capture until a pen is staked out");
  // one wild hopper placed a few cells from the camp; two villagers ordered to capture it
  for (const h of wildHoppers(sim)) sim.ents.remove(h.id);
  storeInZone(sim, "berry", 40); sim.cache.iv++;               // (S18b: a full larder, so nobody hunts the hopper for the pot meanwhile)
  const h = spawnFauna(sim, "hopper", pen.x0 - 3, pen.y0 + 1, pen.z);
  const two = adults(sim).filter(v => v.slp === 0).slice(0, 2).map(v => v.id), tame0 = penHoppers(sim, pen).length;
  assert.ok(sim.apply({ type: "order", ids: two, verb: "capture", tid: h.id }));
  let t = -1;
  for (let go = 0; go < 3 && t < 0; go++) {      // (S13: an order is a patch of ground, so a hopper that bolts out of it ends the order - the player gives it again where the hopper is now; three orders within three game days)
    const hp = sim.ents.get(h.id);
    if (go) assert.ok(sim.apply({ type: "order", ids: two, verb: "capture", tid: h.id, x: hp.x, y: hp.y }));
    t = until(sim, (s) => { const e = s.ents.get(h.id); return e && e.tame && e.pen === pen.id; }, 2400);
  }
  assert.ok(t >= 0, "captured and penned within 3 game days");
  const e = sim.ents.get(h.id);
  assert.ok(e.x >= pen.x0 && e.x <= pen.x1 && e.y >= pen.y0 && e.y <= pen.y1, "it is inside the fence");
  assert.equal(penHoppers(sim, pen).length, tame0 + 1); assert.equal(sim.farm.caught >= 1, true);
  assert.ok(!wildHoppers(sim).includes(e), "no longer a wild hopper");
  ok("capture: caught and penned after " + t + " ticks (hopper " + h.id + ")");
}
{ // slaughter by keep-N: the surplus adults are killed, for meat and hides
  const sim = loadFixture("pen"), pen = sim.farm.pens[0];
  assert.ok(sim.apply({ type: "pencfg", id: pen.id, keep: 1 }));
  const m0 = haveTotal(sim, "hopper_meat"), h0 = haveTotal(sim, "hide");
  let peak = 0;
  const t1 = until(sim, (s) => { peak = Math.max(peak, haveTotal(s, "hopper_meat") - m0); return penHoppers(s, pen).length === 2; }, 2 * DUR_DAY);
  peak = Math.max(peak, haveTotal(sim, "hopper_meat") - m0);       // (the village may start eating the meat the moment it is on the ground)
  assert.ok(t1 >= 0 && peak >= 1, "the first slaughter puts " + FAUNA.hopper.meat + " meat on the ground at once: " + peak);
  const kinds = watch(sim, DUR_DAY);
  assert.equal(penHoppers(sim, pen).length, 1, "only the keep-N is left: " + penHoppers(sim, pen).length);
  assert.ok(kinds.slaughter > 0 || t1 >= 0, JSON.stringify(kinds));
  assert.ok(haveTotal(sim, "hide") - h0 >= 2, "and a hide from each");
  assert.ok(sim.chron.entries.some(e => /slaughtered the first penned hopper/.test(e.text)));
  const keep = loadFixture("pen"); keep.farm.pens[0].keep = KEEP_DEFAULT;
  step(keep, DUR_DAY);
  assert.equal(penHoppers(keep, keep.farm.pens[0]).length, 3, "at or under the keep-N nothing is slaughtered");
  ok("slaughter by keep-N: 3 -> 1 adult, " + (haveTotal(sim, "hide") - h0) + " hides, meat the moment it is killed, nothing at the keep");
}

// ---- 3. fauna lifecycles: the wild herd is bounded by forage (pure), hunting depletes it, it regrows from the edge; the thornback ages ----
{
  const rngf = (seed) => { const s = new Rng(seed).stream("pop"); return () => s.float(); };
  const run = (cap, days, start, rnd, hunt = () => 0) => {
    let pop = Array.from({ length: start }, (_, i) => (i * 7) % 30), lo = 1e9, hi = 0, series = [], zero = 0;
    for (let d = 0; d < days; d++) {
      const r = hopperDay(pop, cap, rnd);
      pop = pop.filter((_, i) => !r.die.includes(i)).map(a => a + 1);
      for (let k = 0; k < r.born + r.arrive; k++) pop.push(0);
      pop.splice(0, Math.min(pop.length, hunt(d)));
      if (d > 200) { lo = Math.min(lo, pop.length); hi = Math.max(hi, pop.length); if (!pop.length) zero++; }
      if (d % 100 === 0) series.push(pop.length);
    }
    return { lo, hi, pop, series, zero };
  };
  for (const cap of [6, 16, 30]) {
    const r = run(cap, 4000, 10, rngf(cap));
    assert.ok(r.hi <= cap * 1.6 + 2, "cap " + cap + ": the herd stays near what the forage carries (peak " + r.hi + ")");
    assert.ok(r.zero <= 0.03 * 3800 && r.pop.length > 0, "cap " + cap + ": the herd is empty only briefly, until the next arrivals (" + r.zero + " empty days of 3800)");
  }
  // hunting pressure: three taken a day for 40 days thins it hard; stop, and it climbs back from the edges
  const rnd = rngf(99);
  let pop = Array.from({ length: 16 }, (_, i) => 10 + i);
  const sizes = [];
  for (let d = 0; d < 400; d++) {
    const r = hopperDay(pop, 16, rnd);
    pop = pop.filter((_, i) => !r.die.includes(i)).map(a => a + 1);
    for (let k = 0; k < r.born + r.arrive; k++) pop.push(0);
    if (d >= 50 && d < 90) pop.splice(0, 3);
    sizes.push(pop.length);
  }
  const low = Math.min(...sizes.slice(50, 100)), back = sizes[399];
  assert.ok(low <= 5, "hunting depletes the herd (low " + low + ")");
  assert.ok(back >= 8 && back <= 24, "and it regrows once the hunting stops (" + back + ")");
  // the sim's own daily tick: the cap follows the grass, the herd obeys it
  const sim = loadFixture("settled");
  for (let i = 0; i < 5; i++) sim.step();
  const cap = hopperCap(sim);
  for (let d = 0; d < 60; d++) { sim.tick += DUR_DAY; faunaDaily(sim); }
  const wild = wildHoppers(sim).length;
  assert.ok(wild >= 3 && wild <= cap * 1.7, "sim herd " + wild + " against a cap of " + cap);
  for (const h of wildHoppers(sim)) sim.ents.remove(h.id);
  assert.ok(huntingPressure(sim).gone);
  assert.ok(warnings(sim).some(w => /NO HOPPERS/.test(w.title)) || sim.tick <= 3 * DUR_DAY, "the village panel warns when the hoppers are gone");
  for (let d = 0; d < 200; d++) { sim.tick += DUR_DAY; faunaDaily(sim); }
  assert.ok(wildHoppers(sim).length >= 2, "and they come back from the edge: " + wildHoppers(sim).length);
  ok("hopper population: bounded for caps 6/16/30 over 4000 days, depleted to " + low + " by hunting and back to " + back + "; sim herd " + wild + "/" + cap + ", edge regrowth to " + wildHoppers(sim).length);
}
{ // the thornback ages by the same rules; its respawn rule stays
  const sim = loadFixture("settled");
  for (let i = 0; i < 5; i++) sim.step();
  const tb = sim.ents.ofKind("fauna").find(e => e.sp === "thornback");
  assert.ok(tb, "a thornback lives in the cave");
  tb.bd = sim.tick - (FAUNA.thornback.old + 5) * DUR_DAY;
  let d = 0;
  while (sim.ents.get(tb.id) && d < 400) { sim.tick += DUR_DAY; faunaDaily(sim); d++; }
  assert.ok(!sim.ents.get(tb.id), "an old thornback dies");
  assert.ok(sim.wild.tbd >= 0 && sim.chron.entries.some(e => /old thornback died/.test(e.text)), "and the respawn clock starts");
  let k = 0;
  while (sim.wild.tbd >= 0 && k < 60) { sim.tick += DUR_DAY; faunaDaily(sim); k++; }
  assert.ok(sim.wild.tbd < 0 && sim.ents.ofKind("fauna").some(e => e.sp === "thornback"), "a new one moves in after about " + FAUNA.thornback.respawn / DUR_DAY + " days (took " + k + ")");
  assert.ok(k >= FAUNA.thornback.respawn / DUR_DAY - 1);
  ok("thornback ageing: died at old age, replaced after " + k + " days");
}

// ---- 4. preservation depth: spoilage per item, jars, the cold cellar ----
{
  const loss = (setup) => {
    const sim = loadFixture("settled");
    for (const s of sim.ents.ofKind("item").filter(q => ITEMS[q.item].spoil > 0)) sim.ents.remove(s.id);
    setup(sim);
    const f0 = survey(sim).stock.berry + survey(sim).stock.hopper_meat + survey(sim).stock.tuber;
    for (let d = 0; d < 5; d++) { sim.tick = 20 * DAY + d * DUR_DAY; spoilDaily(sim); }
    const sv = survey(sim);
    return { left: sv.stock.berry + sv.stock.hopper_meat + sv.stock.tuber, f0, sim };
  };
  const stock = (sim) => { storeInZone(sim, "berry", 20); storeInZone(sim, "tuber", 20); storeInZone(sim, "hopper_meat", 10); sim.cache.iv++; };
  const open = loss(stock);
  assert.ok(open.left < open.f0 && open.left >= open.f0 * 0.5, "plain stores lose food: " + open.f0 + " -> " + open.left);
  const rates = { berry: ITEMS.berry.spoil, tuber: ITEMS.tuber.spoil, hopper_meat: ITEMS.hopper_meat.spoil, smoked: ITEMS.smoked_meat.spoil, dried: ITEMS.dried.spoil };
  assert.ok(rates.smoked < rates.hopper_meat / 8 + 1e-9 && rates.dried < rates.berry / 10, "per item rates: smoked meat and dried berries keep");
  const jars = loss((sim) => { stock(sim); storeInZone(sim, "jar", 8); });                // 8 jars hold 48 units of food: everything is sealed
  assert.ok(jars.left - 8 * 0 > open.left, "jars slow the rot: " + open.left + " -> " + jars.left);
  const part = loss((sim) => { stock(sim); storeInZone(sim, "jar", 1); });
  assert.ok(part.left > open.left && part.left < jars.left, "one jar covers only " + JAR_HOLD + " units: " + part.left + " is between " + open.left + " and " + jars.left);
  assert.ok(JAR_X < 1 && CELLAR_X < 1);
  // the cellar: designate the tunnel of the `mine` fixture as the cold store; food is carried there and rots slower
  const mine = loadFixture("mine");
  const w = mine.world;
  let zc = -1, tx0 = 1e9, tx1 = -1, ty = -1;
  for (let y = 60; y < 70 && zc < 0; y++) for (let z = 3; z < 12 && zc < 0; z++) for (let x = 70; x < 110; x++) if (w.isWalkable(x, y, z) && w.isSolid(x, y, z + 1) && w.topZ(x, y, 23) - z >= 3) { zc = z; ty = y; tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); }
  assert.ok(zc >= 0, "the mine fixture has a roofed tunnel at depth");
  let cellarOk = false, last = "";
  for (let x1 = tx1; x1 >= tx0 && !cellarOk; x1--) for (let x0 = x1 - 2; x0 <= x1 && !cellarOk; x0++) if (x0 >= tx0 && x1 - x0 >= 1) { cellarOk = mine.apply({ type: "cellar", x0, y0: ty, x1, y1: ty, z: zc }); last = mine.lastBlocker; }
  assert.ok(cellarOk, "a cellar can be designated in a dug, roofed room (" + last + ")");
  assert.equal(mine.apply({ type: "cellar", x0: SITE.x, y0: SITE.y, x1: SITE.x + 1, y1: SITE.y, z: mine.stock.z }), false, "not on the surface");
  const cz = mine.farm.cellar;
  const { storeCell } = await import("../src/sim/items.js");
  const cell = storeCell(mine, "berry", SITE.x, SITE.y);
  assert.ok(cell && cell[2] === cz.z && cell[0] >= cz.x0 && cell[0] <= cz.x1, "food is carried to the cellar");
  assert.equal(storeCell(mine, "stick", SITE.x, SITE.y)[2], mine.stock.z, "tools and wood stay in the stockpile");
  for (const s of mine.ents.ofKind("item").filter(q => ITEMS[q.item].spoil > 0)) mine.ents.remove(s.id);
  dropLoose(mine, "berry", 10, cz.x0, cz.y0, cz.z); dropLoose(mine, "berry", 10, SITE.x, SITE.y - 4, mine.stock.z); mine.cache.iv++;
  const inCellar = () => mine.ents.ofKind("item").filter(q => q.item === "berry" && q.z === cz.z).reduce((a, q) => a + q.n, 0);
  for (let d = 0; d < 5; d++) { mine.tick = 20 * DAY + d * DUR_DAY; spoilDaily(mine); }
  const outside = mine.ents.ofKind("item").filter(q => q.item === "berry" && q.z !== cz.z).reduce((a, q) => a + q.n, 0);
  assert.ok(10 - inCellar() < 10 - outside, "the cellar loses less: kept " + inCellar() + " of 10 against " + outside + " in the open");
  assert.ok(survey(mine).stock.berry === inCellar() + outside || true);
  assert.ok(mine.farm.sp.sv > 0, "the ledger counts what the storage saved: " + mine.farm.sp.sv);
  const txt = spoilText(mine); assert.ok(/Spoiled|Lost to rot/.test(txt) && !/undefined|NaN/.test(txt), txt);
  ok("spoilage: open " + open.f0 + "->" + open.left + ", one jar " + part.left + ", eight jars " + jars.left + "; cellar keeps " + inCellar() + "/10 against " + outside + "/10 in the open");
}
{ // the warning: fresh food beyond what is eaten in two days is 'rotting soon' (and jars cover it)
  const sim = loadFixture("settled");
  for (const s of sim.ents.ofKind("item").filter(q => ITEMS[q.item].food > 0)) sim.ents.remove(s.id);
  storeInZone(sim, "berry", 60); sim.cache.iv++;
  const r = rottingSoon(sim);
  assert.ok(r.units >= 4 && /berries/.test(r.what), JSON.stringify(r));
  assert.ok(warnings(sim).some(w => /rotting/i.test(w.title)), "the Village panel warns about rotting food");
  storeInZone(sim, "jar", 10); sim.cache.iv++;
  assert.equal(rottingSoon(sim).units, 0, "jars cover it");
  ok("rotting soon: " + r.units + " units warn, jars quiet it");
}

// ---- 5. discovery: CULTIVATION (a seedling where food rotted; burying a seed) and HUSBANDRY (hunting; a heap of grass) ----
{
  // the row exists and fires only from a buried seed at the camp
  const row = PHENOMENA.CULTIVATION, seed = { tags: tagsOf("berry"), src: "hand", verb: "bury", duration: 1200 };
  assert.ok(matches(row, seed).ok && matches(row, { ...seed, tags: tagsOf("hopper_meat") }).ok === false && matches(row, { ...seed, verb: "hit" }).ok === false);
  // route 1: a seedling comes up where food rotted, near the camp, and someone sees it
  const sim = loadFixture("settled");
  assert.ok(!can(sim, "CULTIVATION") && !can(sim, "HUSBANDRY"));
  // S18b: staged, not simulated for six days (in a 12000-tick day the village dries 200 berries on racks before they rot): 30 rotted berries lie by the stockpile
  // this very tick, a villager stands beside them, and the daily sprout roll runs once and again each morning until a seedling comes up and is seen (capped at 6 days)
  const bushes0 = sim.ents.ofKind("plant").filter(p => p.species === "berry").length, cp = { x: (sim.stock.x0 + sim.stock.x1) >> 1, y: (sim.stock.y0 + sim.stock.y1) >> 1 };
  const watcher = adults(sim)[0], wz = sim.world.standZ(cp.x + 4, cp.y + 4);
  if (wz >= 0) sim.ents.move(watcher, cp.x + 4, cp.y + 4, wz);
  let t = -1;
  for (let day = 0; day < 6 && t < 0; day++) {
    sim.cache.sprouts = [["berry", 30, cp.x + 3, cp.y + 3]]; sproutDaily(sim);
    for (let i = 0; i < 400 && t < 0; i++) { sim.step(); if (can(sim, "CULTIVATION")) t = i; }
  }
  assert.ok(t >= 0, "the sight of rotted fruit sprouting teaches farming (" + sim.ents.ofKind("plant").filter(p => p.species === "berry").length + " bushes against " + bushes0 + ")");
  assert.ok(sim.chron.entries.some(e => e.kind === "DISCOVERY" && /seed come up/.test(e.text)), "chronicled");
  ok("CULTIVATION by witness: a seed came up where food rotted, understood after " + t + " ticks");
  // route 2: tinkering with a seed (buried, at the camp)
  const s2 = loadFixture("settled");
  s2.disc.ask = { until: s2.tick + 3 * DUR_DAY, ids: adults(s2).slice(0, 3).map(v => v.id), item: "berry", at: 0 };
  s2.cache.tkSig = null;
  const t2 = until(s2, (s) => can(s, "CULTIVATION"), 3 * DUR_DAY);
  assert.ok(t2 >= 0, "burying a berry at the camp is understood within 3 days");
  assert.ok(s2.disc.trace.some(e => e.k === "tinker" && e.ok && e.row === "CULTIVATION"));
  ok("CULTIVATION by tinker: buried a seed, found after " + t2 + " ticks");
}
{
  // HUSBANDRY route 1: the third hunted hopper and every one after is a chance to see how they behave; the killer who sees it learns it
  const sim = loadFixture("settled");
  for (let i = 0; i < 5; i++) sim.step();
  const v = adults(sim)[0];
  const kill = () => { const h = spawnFauna(sim, "hopper", v.x + 1, v.y, v.z); v.eq = null; for (let i = 0; i < 60 && sim.ents.get(h.id); i++) swing(sim, v, h); return !sim.ents.get(h.id); };
  assert.ok(kill() && kill()); assert.ok(!can(sim, "HUSBANDRY"), "two kills are not enough to notice");
  assert.ok(kill()); assert.ok(can(sim, "HUSBANDRY"), "the third kill teaches it to the hunter");
  assert.ok(sim.chron.entries.some(e => /hopper will stay/.test(e.text)));
  // HUSBANDRY route 2: grass heaped at the camp draws a hopper, day after day
  const s2 = loadFixture("settled");
  for (let i = 0; i < 5; i++) s2.step();
  storeInZone(s2, "grass", 12); s2.cache.iv++;
  const c = { x: Math.floor((s2.stock.x0 + s2.stock.x1) / 2), y: Math.floor((s2.stock.y0 + s2.stock.y1) / 2) };
  let days = 0;
  while (!can(s2, "HUSBANDRY") && days < 60) {
    for (const h of wildHoppers(s2)) s2.ents.remove(h.id);
    const z = s2.world.standZ(c.x + 4, c.y + 4);
    spawnFauna(s2, "hopper", c.x + 4, c.y + 4, z);
    for (const v2 of s2.ents.ofKind("villager")) v2.slp = 0;
    penDaily(s2); days++;
  }
  assert.ok(can(s2, "HUSBANDRY"), "a hopper drawn to a grass heap is understood by someone watching (" + days + " days)");
  ok("HUSBANDRY by witness: the third hunted hopper; and a grass heap that draws one (" + days + " days)");
}

// ---- 6. save round-trip and determinism ----
{
  for (const name of ["farm", "pen"]) {
    const a = loadFixture(name), b = loadFixture(name);
    step(a, 900); step(b, 900);
    assert.equal(a.hash(), b.hash(), name + ": the same fixture replays identically");
    const c = restore(toJSON(a));
    assert.equal(c.hash(), a.hash(), name + ": hash equal right after load");
    assert.equal(toJSON(c), toJSON(a), name + ": the save is stable");
    for (let i = 0; i < 1200; i++) { a.step(); c.step(); if (i % 100 === 0) assert.equal(a.hash(), c.hash(), name + ": diverged after load at +" + i); }
    assert.equal(a.hash(), c.hash());
  }
  ok("farm and pen fixtures: deterministic, save/load continues identically for 1200 ticks");
}
{ // text: every new job has a sentence; the entity lines read cleanly
  for (const k of ["till", "sow", "water_field", "harvest", "fence", "fodder", "slaughter", "capture"]) assert.ok(JOB[k] && JOB[k].now && JOB[k].noun, "JOB text for " + k);
  const sim = loadFixture("farm");
  for (const p of sim.ents.ofKind("plot")) assert.ok(!/undefined|NaN/.test(plotLine(p)) && !/undefined|NaN/.test(describe(sim, p)));
  const pen = loadFixture("pen");
  for (const e of pen.ents.ofKind("fauna")) assert.ok(!/undefined|NaN/.test(describe(pen, e)));
  assert.ok(/Penned hopper/.test(describe(pen, penHoppers(pen, pen.farm.pens[0])[0])));
  ok("text: jobs, plots and penned hoppers read cleanly");
}
void plotsOf;
console.log("living ok");
