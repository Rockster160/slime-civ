// S7b: the clay -> charcoal -> copper chain (GDD §15.5, §15.7 rows 5, 6, 7, 9; §11.9; §14.3, §14.4; §12.4-12.5), fixture-based, every window <= 3 game days.
//   node tests/chain.js
import assert from "node:assert/strict";
import { waterEdges } from "../src/sim/board.js";
import { loadFixture } from "./fixture.js";
import { flatSpot, clearArea, instantHut } from "./helpers.js";
import { putStation, kilnSpot } from "../tools/make_fixtures.js";
import { toJSON, restore } from "../src/sim/save.js";
import { PHENOMENA, PHENOMENON_IDS, matches, tagsOf, CRAFTS } from "../src/sim/phenomena.js";
import { can, famOf, holders, grant, evidenceOf, eraOf, rawPressure } from "../src/sim/knowledge.js";
import { stationHeat, heatReport } from "../src/sim/heat.js";
import { tinkerCandidates, attempt, sitesOf, hints, discoveryOdds, waterTouch } from "../src/sim/discovery.js";
import { RECIPES, makeQuality, roomOffset, PICK_X, pickUses } from "../src/sim/craft.js";
import { haveTotal, storeInZone, dropLoose, survey } from "../src/sim/items.js";
import { plan } from "../src/sim/jobs.js";
import { cancelAction } from "../src/sim/jobstate.js";
import { isAdult } from "../src/sim/villager.js";
import { kill } from "../src/sim/population.js";
import { hearths } from "../src/sim/fire.js";
import { evaluate } from "../src/sim/roomeval.js";
import { rate } from "../src/sim/tasks.js";
import { M, F } from "../src/sim/world.js";
import { stationInfo, describe, explain } from "../src/ui/text.js";
import { almanac } from "../src/ui/almanac.js";
import { DUR_DAY } from "../src/sim/clock.js";

const step = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };
const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
const furn = (sim, f) => sim.ents.ofKind("furniture").filter(e => e.f === f);
const jobs = (sim, v) => { let cs = []; plan(sim, v, false, (c) => { cs = c; }, true); return cs; };
let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
/** Run until f(sim) is true or `max` ticks; returns ticks used or -1. */
function until(sim, f, max) { for (let i = 0; i < max; i++) { sim.step(); if (f(sim)) return i; } return -1; }

// 1. The phenomenon table: each row fires from its context, falls short with a named axis, and its hints never name the product.
{
  const P = PHENOMENA;
  const R = (row, ctx) => matches(P[row], ctx);
  assert.ok(R("BAKE_CLAY", { tags: tagsOf("clay"), src: "hearth", heat: 2, duration: 600 }).ok);
  assert.deepEqual(R("BAKE_CLAY", { tags: tagsOf("clay"), src: "hearth", heat: 1, duration: 600 }).miss, ["heat"]);
  assert.deepEqual(R("BAKE_CLAY", { tags: tagsOf("clay"), src: "hearth", heat: 2, duration: 300 }).miss, ["duration"]);
  assert.ok(R("SMOULDER_WOOD", { tags: tagsOf("log"), src: "pit", heat: 1, enclosed: true, duration: 1200 }).ok);
  assert.ok(R("SMOULDER_WOOD", { tags: tagsOf("log"), src: "hearth", heat: 1, enclosed: true, duration: 1200 }).ok, "buried hearth route");
  assert.ok(R("SMOULDER_WOOD", { tags: tagsOf("log"), src: "pit", heat: 1, enclosed: false, duration: 1200 }).near, "an open pit burns to ash");
  assert.ok(R("SMOULDER_WOOD", { tags: tagsOf("log"), src: "pit", heat: 2, enclosed: true, duration: 1200 }).near, "too hot is not a smoulder");
  assert.ok(R("KILN_FIRING", { tags: tagsOf("clay"), src: "pit", heat: 3, duration: 900 }).ok && R("KILN_FIRING", { tags: tagsOf("clay"), src: "pit", heat: 2, duration: 900 }).near);
  assert.ok(R("HOLDS_LIQUID", { tags: tagsOf("fired_clay"), src: "hand", verb: "soak" }).ok && !R("HOLDS_LIQUID", { tags: tagsOf("fired_clay"), src: "hand", verb: "hit" }).ok);
  const smelt = { tags: [...tagsOf("malachite"), ...tagsOf("charcoal")], src: "pit", duration: 1200 };
  assert.ok(R("SMELT_COPPER", { ...smelt, heat: 4 }).ok && R("SMELT_COPPER", { ...smelt, heat: 3 }).near);
  assert.ok(!R("SMELT_COPPER", { tags: [...tagsOf("malachite"), ...tagsOf("log")], src: "pit", heat: 4, duration: 1200 }).ok, "wood is not carbon");
  const PRODUCT = /charcoal|copper|ingot|jar|fired|metal|kiln|pottery|pot\b|vessel/i;
  const S9 = { DRESS_STONE: /block|dressed|axe|wall/i, CORDAGE: /cord|rope|string|basket/i, HIDE_WORKING: /leather|backpack|tent|teepee/i, FRAMING: /timber|plank|cabin|frame/i,
    SMOKE_FOOD: /smok|larder|jerky/i, CASTING: /cast|axe|pick|tool/i, HAMMER_NATIVE: /sheet|fitting|plate/i, SMELT_IRON: /iron|steel|ingot|bloom/i, FORGE_WELDING: /weld|forge|pick|axe|tool/i };
  for (const id of PHENOMENON_IDS) {
    const r = P[id]; assert.ok(!r.stub, id + " is live");
    const bad = S9[id] || PRODUCT;                                  // S9 rows: their own product words (the inputs they use may be named)
    assert.ok(!bad.test(r.nearMiss), id + " hint names the product: " + r.nearMiss); assert.ok(!bad.test(r.curio), id + " curiosity names the product: " + r.curio);
  }
  assert.equal(CRAFTS.POTTERY.era, "Clay"); assert.equal(CRAFTS.SMELTING.era, "Copper");
  ok("phenomenon table: five rows live, each fires from its context, near-misses name the short axis, hints are product-free");
}

// 2. Stations are heat-function readers: lined kiln 3 on wood and on charcoal, 4 with a bellows OR on the ridge, a mound is a smoulder, a wood roof caps a kiln at 2.
{
  const sim = loadFixture("copperready");
  const kiln = furn(sim, "kiln")[0];
  assert.equal(stationHeat(sim, kiln, "stick").level, 3); assert.ok(Math.abs(stationHeat(sim, kiln, "stick").P - 2.24) < 1e-9);
  assert.equal(stationHeat(sim, kiln, "charcoal").level, 3); assert.ok(Math.abs(stationHeat(sim, kiln, "charcoal").P - 3.36) < 1e-9, "no closet cheat: charcoal without draft stays at 3");
  const why = heatReport(sim, kiln, "charcoal", 4);
  assert.ok(why.steps.some(s => /needs draft: a bellows beside it/.test(s)), "says why: " + why.steps.join(" | "));
  const bel = putStation(sim, "bellows", kiln.x + 1, kiln.y, kiln.z);
  assert.equal(stationHeat(sim, kiln, "charcoal").level, 4); assert.ok(Math.abs(stationHeat(sim, kiln, "charcoal").P - 4.368) < 1e-3);
  assert.equal(stationHeat(sim, kiln, "stick").level, 3, "wood never gets past 3 even with a bellows");
  assert.equal(heatReport(sim, kiln, "charcoal", 4).steps.length, 0);
  sim.ents.remove(bel.id);
  const r = sim.world.geo.ridge[0], ridge = putStation(sim, "kiln", r.x, r.y, r.z);
  assert.ok(sim.world.flags(r.x, r.y, r.z - 1) & F.RIDGE);
  assert.equal(stationHeat(sim, ridge, "charcoal").level, 4, "a kiln on the windy ridge needs no bellows");
  const mound = putStation(sim, "mound", kiln.x, kiln.y + 3, kiln.z);
  assert.equal(stationHeat(sim, mound, "log").level, 1); assert.ok(Math.abs(stationHeat(sim, mound, "log").P - 1.04) < 1e-9, "an earth-covered pit: 1.6 x 1.3 x 0.5");
  const roofed = putStation(sim, "kiln", kiln.x + 3, kiln.y, kiln.z);
  sim.world.set(roofed.x, roofed.y, roofed.z + 1, M.THATCH, 0);
  const hr = stationHeat(sim, roofed, "charcoal");
  assert.ok(hr.level <= 2, "a wood roof over the pit seals and burns it: at most 2 (" + hr.level + ")");
  assert.ok(heatReport(sim, roofed, "charcoal", 4).steps.some(s => /wood face/.test(s)));
  const info = stationInfo(sim, kiln);
  assert.ok(info.recipes.some(x => x.key === "copper" && !x.ok && /draft/.test(x.why)), "the inspector says why copper is unavailable: " + JSON.stringify(info.recipes.find(x => x.key === "copper")));
  assert.ok(/kiln/i.test(describe(sim, kiln)) && !/undefined/.test(describe(sim, mound)));
  ok("stations: kiln 3 (wood and charcoal), 4 by bellows or ridge, mound 1.04, wood roof caps at 2; the inspector explains " + info.recipes.find(x => x.key === "copper").why.slice(0, 60) + "...");
}

// 3. WITNESS: clay by a lit fire bakes (pottery), a smouldering stump (charcoal), baked clay beside someone drinking (vessels).
{
  const sim = loadFixture("hearth");
  const h = hearths(sim)[0];
  assert.equal(h.lit, 1); assert.ok(!can(sim, "POTTERY"));
  dropLoose(sim, "clay", 3, h.x + 1, h.y, h.z);
  const at = until(sim, (s) => can(s, "POTTERY"), 2 * DUR_DAY);
  assert.ok(at >= 0, "clay lying by a lit fire for a while is understood by someone within 2 days");
  assert.ok(haveTotal(sim, "fired_clay") >= 1, "and one lump actually baked");
  assert.equal(eraOf(sim), "Clay"); assert.match(sim.chron.entries.map(e => e.text).join("\n"), /was first to fire clay|The Clay age begins/);
  assert.ok(holders(sim, "POTTERY").every(v => v.fam.POTTERY >= 0.2) && !can(sim, "VESSELS"));
  // vessels: baked clay lying at the water's edge when someone drinks
  const edge = sim.world.standZ(57, 43) >= 0 ? [57, 43, sim.world.standZ(57, 43)] : null;
  const v = adults(sim)[0];
  const water = waterEdges(sim)[0] || null;
  const spot = water || edge;
  dropLoose(sim, "fired_clay", 1, spot[0], spot[1], spot[2]);
  sim.ents.move(v, spot[0], spot[1], spot[2]);
  waterTouch(sim, v);
  assert.ok(can(sim, "VESSELS"), "drinking beside a baked pot: water meets fired clay");
  assert.ok(sim.chron.entries.some(e => /saw a baked bowl hold water/.test(e.text)));
  ok("witness: pottery after " + at + " ticks of clay by the fire (a lump baked), vessels at the shore");
}
{
  const sim = loadFixture("hearth");
  sim.apply({ type: "force", ev: "stump" });
  const fl = sim.ents.ofKind("flame")[0];
  assert.equal(fl.src, "smoulder"); assert.equal(fl.heat, 1);
  assert.ok(sim.disc.curio.some(c => c.row === "SMOULDER_WOOD"), "the stump leaves a Curiosity until someone understands");
  assert.ok(!can(sim, "CHARCOAL"));
  const vs = adults(sim).slice(0, 3);
  vs.forEach((v, i) => { const z = sim.world.standZ(fl.x + 2 + i, fl.y); sim.ents.move(v, fl.x + 2 + i, fl.y, z); v.slp = 0; });
  const at = until(sim, (s) => can(s, "CHARCOAL"), DUR_DAY);
  assert.ok(at >= 0, "people standing by a smouldering stump understand charcoal");
  assert.ok(!sim.disc.curio.some(c => c.craft === "CHARCOAL"), "and the Curiosity resolves");
  assert.match(sim.chron.entries.map(e => e.text).join("\n"), /burn wood to black coal/);
  ok("witness: a smouldering stump teaches charcoal after " + at + " ticks");
}

// 4. TINKER: every row fires from an experiment at its site (the performer is the discoverer, 0.5); bystanders witness (0.2).
{
  const mk = () => { const s = loadFixture("copperready"); for (const v of s.ents.ofKind("villager")) v.fam = {}; s.cache.kn = null; s.disc.curio = []; return s; };
  const siteOf = (s, kind) => sitesOf(s).find(q => q.kind === kind);
  const tryIt = (s, who, c) => { s.disc.cd = {}; return attempt(s, who, c); };
  // bake clay at the hearth, left in
  let sim = mk(); let v = adults(sim)[0];
  assert.equal(tryIt(sim, v, { item: "clay", with: "", fuel: "", verb: "leave", site: siteOf(sim, "hearth") }), true);
  assert.equal(famOf(v, "POTTERY"), 0.5); assert.ok(haveTotal(sim, "fired_clay") >= 4 + 1, "a trial lump came out");
  // fired clay in a kiln with wood (KILN_FIRING): bystanders who see it learn at 0.2
  sim = mk(); v = adults(sim)[0]; const other = adults(sim)[1], kiln = furn(sim, "kiln")[0];
  sim.ents.move(other, kiln.x + 2, kiln.y, kiln.z); other.slp = 0;
  assert.equal(tryIt(sim, v, { item: "clay", with: "log", fuel: "log", verb: "leave", site: siteOf(sim, "kiln") }), true);
  assert.equal(famOf(v, "KILN"), 0.5); assert.ok(famOf(v, "POTTERY") === 0.5);
  // charcoal: wood under earth, at a buried hearth (bury) ...
  sim = mk(); v = adults(sim)[0];
  assert.equal(tryIt(sim, v, { item: "log", with: "", fuel: "", verb: "bury", site: siteOf(sim, "hearth") }), true);
  assert.equal(famOf(v, "CHARCOAL"), 0.5);
  // ... and at a mound (leave)
  sim = mk(); v = adults(sim)[0]; const mound = putStation(sim, "mound", kiln.x, kiln.y + 3, kiln.z);
  assert.ok(siteOf(sim, "mound"), "a built mound is a place to try things");
  assert.equal(tryIt(sim, v, { item: "log", with: "", fuel: "log", verb: "leave", site: siteOf(sim, "mound") }), true);
  assert.equal(famOf(v, "CHARCOAL"), 0.5);
  assert.equal(tryIt(sim, v, { item: "log", with: "", fuel: "log", verb: "heat", site: siteOf(sim, "mound") }), false, "a short try in the mound is a near miss, not a result");
  // vessels: a baked piece soaked at the camp
  sim = mk(); v = adults(sim)[0];
  assert.equal(tryIt(sim, v, { item: "fired_clay", with: "", fuel: "", verb: "soak", site: siteOf(sim, "camp") }), true);
  assert.equal(famOf(v, "VESSELS"), 0.5);
  // copper: malachite + charcoal at the kiln with a bellows; the same without draft is a counted near miss; with wood it is a dead end
  sim = mk(); v = adults(sim)[0]; const k2 = furn(sim, "kiln")[0], witness = adults(sim)[1];
  sim.ents.move(witness, k2.x + 2, k2.y, k2.z); witness.slp = 0;
  const cu = { item: "malachite", with: "charcoal", fuel: "charcoal", verb: "leave", site: siteOf(sim, "kiln") };
  assert.equal(tryIt(sim, v, cu), false, "no draft: level 3");
  assert.equal(sim.disc.miss.SMELT_COPPER, 1);
  tryIt(sim, v, cu); tryIt(sim, v, cu);
  assert.equal(hints(sim).filter(h => h.id === "SMELT_COPPER").length, 1, "after three failures the Almanac gives the directional hint");
  assert.match(almanac(sim).hints.join(" "), /higher heat/);
  assert.equal(tryIt(sim, v, { ...cu, with: "log", fuel: "log" }), false); assert.ok(sim.disc.dead.some(d => d.item === "malachite" && d.w === "log"));
  putStation(sim, "bellows", k2.x + 1, k2.y, k2.z);
  const before = haveTotal(sim, "copper");
  assert.equal(tryIt(sim, v, { ...cu, site: siteOf(sim, "kiln") }), true);
  assert.equal(famOf(v, "SMELTING"), 0.5); assert.equal(haveTotal(sim, "copper"), before + 1, "a trial ingot");
  assert.ok(famOf(witness, "SMELTING") >= 0.2 || sim.disc.trace.some(t => t.k === "witness" && t.row === "SMELT_COPPER"), "someone watching the smelt rolled to understand it");
  assert.equal(eraOf(sim), "Copper");
  ok("tinker: every row fires from its experiment; smelt: near-miss x3 -> hint, wood is a dead end, bellows -> ingot, Copper age");
}

// 5. Informed tinkering: "investigate here" at a kiln with a bellows finds smelting inside 3 days (a job, not a direct call).
{
  const sim = loadFixture("copperready");
  for (const v of sim.ents.ofKind("villager")) v.fam = {}; sim.cache.kn = null;
  storeInZone(sim, "dried", 120);                         // a full larder (S8): nobody is called away to hunt or forage, the window is for investigating
  const kiln = furn(sim, "kiln")[0]; putStation(sim, "bellows", kiln.x + 1, kiln.y, kiln.z);
  const as = adults(sim).slice(0, 3);
  sim.apply({ type: "investigate", ids: as.map(v => v.id), item: "malachite", at: kiln.id });
  const list = tinkerCandidates(sim);
  assert.ok(list.every(c => c.site.id === kiln.id && (c.item === "malachite")), "the request narrows the experiments: " + list.map(c => c.key));
  assert.ok(discoveryOdds(sim, "SMELT_COPPER") >= 0.2, "informed: a quarter of the tries are the right one: " + discoveryOdds(sim, "SMELT_COPPER").toFixed(2));
  const at = until(sim, (s) => can(s, "SMELTING"), 3 * DUR_DAY);
  assert.ok(at >= 0, "found within 3 days");
  ok("investigate malachite at the kiln: smelting after " + (at / DUR_DAY).toFixed(1) + " days, informed odds per try " + discoveryOdds(sim, "SMELT_COPPER").toFixed(2));
}

// 6. Stations build and produce: kiln -> fired clay, mound -> charcoal, bench -> copper pick, bellows (from fired clay), jar.
{
  const sim = loadFixture("clay");
  grant(sim, adults(sim)[0], "CHARCOAL", 0.5); grant(sim, adults(sim)[1], "SMELTING", 0.5); grant(sim, adults(sim)[0], "VESSELS", 0.5);
  storeInZone(sim, "copper", 2); storeInZone(sim, "fired_clay", 2); storeInZone(sim, "log", 6); sim.cache.iv++;
  const spots = [flatSpot(sim, 3, 3, 0), flatSpot(sim, 3, 3, 1), flatSpot(sim, 3, 3, 2), flatSpot(sim, 3, 3, 3)];
  const piece = ["kiln", "mound", "workbench", "bellows"].map((w, i) => ({ w, x: spots[i][0] + 1, y: spots[i][1] + 1, z: spots[i][2] }));
  for (const [i, s] of spots.entries()) clearArea(sim, s[0], s[1], 3, 3, s[2]);
  assert.equal(sim.apply({ type: "build", cells: piece }), true);
  sim.apply({ type: "keep", item: "fired_clay", n: 6 }); sim.apply({ type: "keep", item: "charcoal", n: 3 }); sim.apply({ type: "keep", item: "copper_pick", n: 1 });
  const seen = new Set(), xp0 = adults(sim).reduce((a, v) => a + v.sk.craft.xp, 0);
  let t = 0;
  for (; t < 3 * DUR_DAY; t++) {
    sim.step();
    if (t % 50 === 0) for (const v of sim.ents.ofKind("villager")) if (v.job) seen.add(v.job.k);
    if (haveTotal(sim, "charcoal") >= 3 && haveTotal(sim, "copper_pick") >= 1 && haveTotal(sim, "fired_clay") >= 6) break;
  }
  for (const w of ["kiln", "mound", "workbench", "bellows"]) assert.equal(furn(sim, w).length, 1, w + " built by villagers through the ghost pipeline");
  assert.ok(haveTotal(sim, "fired_clay") >= 4, "fired clay: " + haveTotal(sim, "fired_clay"));
  assert.ok(haveTotal(sim, "charcoal") >= 3, "charcoal: " + haveTotal(sim, "charcoal"));
  assert.ok(haveTotal(sim, "copper_pick") >= 1, "copper pick: " + haveTotal(sim, "copper_pick"));
  for (const k of ["fire_kiln", "burn_charcoal", "make_tool"]) assert.ok(seen.has(k), "job kind " + k + " ran: " + [...seen]);
  assert.match(sim.chron.entries.map(e => e.text).join("\n"), /first fired clay|first charcoal|first copper pick/);
  // craft XP came from the output
  const xp1 = adults(sim).reduce((a, v) => a + v.sk.craft.xp, 0);
  assert.ok(xp1 > xp0 + 0.3, "craft XP came from the output: " + xp0.toFixed(2) + " -> " + xp1.toFixed(2));
  ok("stations built by villagers and produce: " + haveTotal(sim, "fired_clay") + " fired clay, " + haveTotal(sim, "charcoal") + " charcoal, " + haveTotal(sim, "copper_pick") + " copper pick in " + (t / DUR_DAY).toFixed(1) + " days; jobs " + [...seen].filter(k => /kiln|charcoal|tool|smelt/.test(k)).join(","));
}

// 7. Both heat-4 routes smelt copper through the job board (keep copper): kiln + bellows, and a kiln on the ridge. Without draft the smelt is blocked, and says why.
{
  const run = (setup, label) => {
    const sim = loadFixture("copperready");
    grant(sim, adults(sim)[0], "SMELTING", 0.5);
    const kiln = furn(sim, "kiln")[0];
    const routes = setup(sim, kiln);
    sim.apply({ type: "keep", item: "copper", n: 2 });
    step(sim, 200);                                            // standing orders refill on a 200-tick beat
    return { sim, kiln: routes || kiln };
  };
  // no draft: blocked
  {
    const { sim } = run(() => null);
    const cs = adults(sim).map(v => jobs(sim, v).find(c => c.kind === "smelt")).find(Boolean);       // (any adult: whoever is not asleep or hauling has the candidate)
    assert.ok(cs && cs.blocker === "TOO_COLD", "no draft: smelt is blocked by TOO_COLD: " + (cs && cs.blocker));
    const text = explain(sim, adults(sim)[1]);
    step(sim, 600);
    assert.equal(haveTotal(sim, "copper"), 0, "and nothing is smelted");
  }
  for (const [label, setup] of [["bellows", (sim, kiln) => { putStation(sim, "bellows", kiln.x + 1, kiln.y, kiln.z); }], ["ridge", (sim) => {
    // the ridge is 25-40 cells out: loading it takes trips of ~700 ticks each, so the kiln here is stocked as if two earlier trips had been made (the walk is not what this checks)
    const r = sim.world.geo.ridge.slice().sort((a, b) => (a.x - 64) ** 2 + (a.y - 64) ** 2 - (b.x - 64) ** 2 - (b.y - 64) ** 2)[0];
    clearArea(sim, r.x - 1, r.y - 1, 3, 3, r.z); sim.ents.remove(furn(sim, "kiln")[0].id); sim.cache.iv++;
    const k = putStation(sim, "kiln", r.x, r.y, r.z); k.inv = { malachite: 4, charcoal: 2 }; k.rcp = "copper";
    return k;
  }]]) {
    const { sim } = run(setup, label);
    const at = until(sim, (s) => haveTotal(s, "copper") >= 2, 3 * DUR_DAY);
    assert.ok(at >= 0, label + " route: two ingots within 3 days");
    assert.ok(famOf(adults(sim)[0], "SMELTING") > 0.5 || can(sim, "SMELTING"));
    ok("heat-4 route '" + label + "' smelts copper through the board: 2 ingots after " + (at / DUR_DAY).toFixed(1) + " days (malachite " + haveTotal(sim, "malachite") + " left)");
  }
}

// 8. Loss and rediscovery near a kiln (R11, D8): the kiln and the fired clay are evidence, rediscovery weighs >= 2.5x more than from scratch.
{
  const sim = loadFixture("clay");
  const kiln = (() => { const k = kilnSpot(sim); return putStation(sim, "kiln", k.x, k.y, k.z); })();
  storeInZone(sim, "fired_clay", 3); sim.cache.iv++;
  const hs = holders(sim, "POTTERY");
  assert.equal(hs.length, 2); assert.ok(evidenceOf(sim, "POTTERY") > 0);
  kill(sim, hs[0], "old age"); kill(sim, hs[1], "old age");
  assert.ok(!can(sim, "POTTERY")); assert.ok(sim.disc.lost.POTTERY !== undefined);
  assert.match(sim.chron.entries.filter(e => e.kind === "LOSS").map(e => e.text).join("\n"), /last person who knew pottery.*still here to learn from/s);
  assert.equal(eraOf(sim), "Hearth", "the era regresses to the next highest held craft");
  const base = loadFixture("hearth"); storeInZone(base, "clay", 12); base.cache.iv++;
  for (const s of [sim, base]) { storeInZone(s, "malachite", 12); storeInZone(s, "charcoal", 6); s.cache.iv++; }
  // the pool is redrawn each day: average the odds of one weighted pick over 24 days (only the clock moves; nothing else steps)
  let p0 = 0, pe = 0;
  for (let d = 0; d < 24; d++) {
    base.tick += DUR_DAY; sim.tick += DUR_DAY;
    p0 += discoveryOdds(base, "BAKE_CLAY") + discoveryOdds(base, "KILN_FIRING"); pe += discoveryOdds(sim, "BAKE_CLAY") + discoveryOdds(sim, "KILN_FIRING");
  }
  p0 /= 24; pe /= 24; base.tick -= 24 * DUR_DAY; sim.tick -= 24 * DUR_DAY; sim.cache.tkSig = null;
  assert.ok(p0 > 0 && pe > p0, "both can find it, evidence makes it likelier: " + p0.toFixed(2) + " vs " + pe.toFixed(2));
  assert.ok(p0 / pe <= 0.4, "rediscovery costs <= 0.4x of the first find (D8 gate): " + (p0 / pe).toFixed(2));
  const as = adults(sim).slice(0, 3);
  sim.apply({ type: "investigate", ids: as.map(v => v.id), item: "clay", at: kiln.id });
  const at = until(sim, (s) => can(s, "POTTERY"), 3 * DUR_DAY);
  assert.ok(at >= 0, "and in play: investigating at the old kiln rediscovers it within 3 days");
  assert.match(sim.chron.entries.map(e => e.text).join("\n"), /rediscovered pottery/);
  ok("loss: LOSS + era regress; evidence weight " + pe.toFixed(2) + " vs " + p0.toFixed(2) + " from scratch; rediscovered after " + (at / DUR_DAY).toFixed(1) + " days");
}

// 9. An ingot leads to a new job kind (6d), and the pick is a capability: it is made at a bench, dug with, and wears out. No flat bonus anywhere.
{
  const sim = loadFixture("copperready");
  const v = adults(sim)[0], kinds = (s) => new Set(jobs(s, v).map(c => c.kind));
  assert.ok(!kinds(sim).has("make_tool") && !kinds(sim).has("smelt"), "before: no craft jobs on the board at all");
  sim.apply({ type: "keep", item: "copper_pick", n: 1 });
  step(sim, 200);
  const blocked = jobs(sim, v).find(c => c.kind === "make_tool");
  assert.ok(blocked && blocked.blocker === "UNKNOWN_CRAFT", "asked for, nobody knows: UNKNOWN_CRAFT");
  grant(sim, v, "SMELTING", 0.5); storeInZone(sim, "copper", 2); sim.cache.iv++;
  putStation(sim, "workbench", furn(sim, "kiln")[0].x, furn(sim, "kiln")[0].y + 3, furn(sim, "kiln")[0].z);
  const free = adults(sim).find(a => !a.carry);                // someone with empty hands
  const after = jobs(sim, free).find(c => c.kind === "make_tool");
  assert.ok(after && !after.blocker, "after the discovery and an ingot, `make_tool` is runnable: " + (after && after.blocker));
  const at = until(sim, (s) => haveTotal(s, "copper_pick") >= 1, 3 * DUR_DAY);
  assert.ok(at >= 0, "a copper pick is made");
  const pick = sim.ents.ofKind("item").find(i => i.item === "copper_pick");
  assert.ok(pick.q >= 0.5 && pick.q <= 1, "its quality comes from the maker's skill: " + pick.q);
  // using it: the rate of digging is PICK_X, nothing else changes
  const d = adults(sim)[3];
  const r0 = rate(sim, d, "dig"), none = rate(sim, d, "build");
  d.eq = { item: "copper_pick", u: 3, q: 0.6 };
  assert.ok(Math.abs(rate(sim, d, "dig") / r0 - PICK_X) < 1e-9, "a pick in hand digs x" + PICK_X); assert.equal(rate(sim, d, "build"), none, "and changes nothing else");
  d.eq = null;
  // an equipped digger takes a pick from the stockpile, and it wears out
  sim.apply({ type: "unkeep", item: "copper_pick" });
  assert.ok(until(sim, (s) => survey(s).stock.copper_pick > 0, DUR_DAY) >= 0, "the pick is hauled into the stockpile");
  const [x, y] = [sim.stock.x1 + 6, sim.stock.y0 + 2], z = sim.world.standZ(x, y);
  assert.ok(z >= 0);
  for (const w of sim.ents.ofKind("villager")) if (w.carry) { cancelAction(sim, w); w.job = null; dropLoose(sim, w.carry.item, w.carry.n, w.x, w.y, w.z); w.carry = null; } sim.cache.iv++;       // empty hands (S8: whoever is carrying something digs without taking the pick, and a 4-cell region is done in a few hundred ticks)
  sim.apply({ type: "mine", op: "region", x0: x, y0: y, x1: x + 3, y1: y + 3, z: z - 1, layers: 2 });      // (S9: 32 cells, so a digger with empty hands comes by before it is done)
  // (S16: the villagers on the new land are nearly always carrying a stick or a clod when they are sent to dig, and the equip step needs empty hands: the digger who "comes by" empty-handed is made so here, as the line above does at the start)
  const hold = until(sim, (s) => { if (s.tick % 100 === 0) for (const w of s.ents.ofKind("villager")) if (w.carry && w.job && w.job.k === "mine" && !(w.action && w.action.steps && w.action.steps.some(st => st.v === "dig"))) { cancelAction(s, w); w.job = null; dropLoose(s, w.carry.item, w.carry.n, w.x, w.y, w.z); w.carry = null; } return s.ents.ofKind("villager").some(w => w.eq); }, 2 * DUR_DAY);
  assert.ok(hold >= 0, "a digger picked up the copper pick from the stockpile");
  const w = sim.ents.ofKind("villager").find(q => q.eq); w.eq.u = 1;
  const digs0 = sim.disc.worn || 0;
  const wore = until(sim, (s) => !w.eq, DUR_DAY);
  assert.ok(wore >= 0 && (sim.disc.worn || 0) === digs0 + 1, "it wore out: " + wore);
  assert.equal(pickUses(0), 40); assert.equal(pickUses(1), 120);
  ok("ingot -> `make_tool` appears (UNKNOWN_CRAFT before), pick quality " + pick.q + ", x" + PICK_X + " digging with it, wears out; no flat bonus");
}

// 10. The workshop purpose needs a workbench; crafting at a bench inside a workshop shifts quality by at most +-15%.
{
  const sim = loadFixture("copperready");
  const [x0, y0, z] = flatSpot(sim, 7, 6); clearArea(sim, x0, y0, 7, 6, z);
  instantHut(sim, x0, y0, 7, 6, { z });
  assert.equal(sim.apply({ type: "purpose", x: x0 + 1, y: y0 + 1, z, p: "workshop" }), true);
  const room = sim.rooms.at(x0 + 1, y0 + 1, z);
  let ev = evaluate(sim, room);
  const bench = ev.checks.find(c => c.k === "bench");
  assert.ok(bench && !bench.ok, "a workshop with no bench fails the checklist line: " + JSON.stringify(bench));
  const q0 = ev.quality;
  const wb = putStation(sim, "workbench", x0 + 2, y0 + 2, z);
  sim.rooms.fullRebuild(sim);
  ev = evaluate(sim, sim.rooms.at(x0 + 1, y0 + 1, z));
  assert.ok(ev.checks.find(c => c.k === "bench").ok && ev.quality > q0, "the bench is the requirement: quality " + q0.toFixed(2) + " -> " + ev.quality.toFixed(2));
  const v = adults(sim)[0];
  const inShop = makeQuality(sim, v, wb);
  const open = makeQuality(sim, v, putStation(sim, "workbench", sim.stock.x1 + 4, sim.stock.y0, sim.stock.z));
  const off = roomOffset(sim, sim.rooms.at(x0 + 1, y0 + 1, z));
  assert.ok(Math.abs(off) <= 0.15 + 1e-9 && Math.abs(inShop - open - off) < 0.011, "quality " + open + " -> " + inShop + " (offset " + off.toFixed(3) + ", capped at +-0.15)");
  assert.ok(roomOffset(sim, { ...sim.rooms.at(x0 + 1, y0 + 1, z) }) <= 0.15);
  ok("workshop: needs a workbench (checklist), quality offset " + off.toFixed(3) + " within +-15%");
}

// 11. Jars: a water jar far from the stream is filled as a chore and drunk from, which saves the walk.
{
  const sim = loadFixture("clay");
  grant(sim, adults(sim)[0], "VESSELS", 0.5);
  storeInZone(sim, "jar", 2); sim.cache.iv++;
  const jx = sim.stock.x1 + 3, jy = sim.stock.y0 + 1, jz = sim.world.standZ(jx, jy);
  clearArea(sim, jx - 1, jy - 1, 3, 3, jz);
  assert.equal(sim.apply({ type: "build", cells: [{ w: "waterjar", x: jx, y: jy, z: jz }] }), true);
  const got = until(sim, (s) => furn(s, "waterjar").length === 1, DUR_DAY);
  assert.ok(got >= 0, "villagers set the jar down");
  const jar = furn(sim, "waterjar")[0];
  const filled = until(sim, (s) => jar.fill >= 20, 2 * DUR_DAY);
  assert.ok(filled >= 0, "the fetch_water chore filled it: " + jar.fill);
  const v = adults(sim)[0];
  sim.ents.move(v, jx + 1, jy, jz); v.thirst = 0.1; v.action = null; v.job = null;
  const f0 = jar.fill;
  let drank = false;
  for (let i = 0; i < 400 && !drank; i++) { sim.step(); if (v.job && v.job.k === "drink" && v.job.key === "drink:jar") drank = true; }
  assert.ok(drank, "a thirsty villager at the camp drinks from the jar, not at the stream (" + (v.job && v.job.key) + ")");
  step(sim, 200);
  assert.ok(jar.fill < f0 || v.thirst > 0.5, "the jar gave water");
  assert.match(describe(sim, jar), /Water jar/);
  ok("jar: placed from a made jar, filled by fetch_water (" + jar.fill + " sips), drunk from instead of walking to the stream");
}

// 12. The stump event is fed by tool_edge (digging, a green stone seen), and fires from the pure decision function; it places a smouldering stump.
{
  const { EVENTS, eventDue } = await import("../src/sim/events.js");
  const { toolEdgeRaw, emaStep } = await import("../src/sim/knowledge.js");
  const { Rng } = await import("../src/sim/rng.js");
  const row = EVENTS.find(e => e.id === "stump");
  assert.equal(toolEdgeRaw(0, false, false), 0); assert.ok(toolEdgeRaw(12, true, false) > 0.7);
  let fired = [];
  for (let seed = 1; seed <= 30; seed++) {                    // a village that digs a bit every day and has seen malachite: pressure arms after two seasons
    const rng = new Rng(seed).stream("event.stump");
    let st = { streak: 0, cd: 0 }, p = 0, day = 0, f = null;
    for (; day < 120 && f === null; day++) {
      p = emaStep(p, toolEdgeRaw(day % 3 === 0 ? 0 : 6, true, false));
      let r = eventDue(row, st, { pressure: p, absent: true, roll: 1 });
      if (r.eligible) r = eventDue(row, st, { pressure: p, absent: true, roll: rng.float() });
      st = r.st; if (r.fire) f = day;
    }
    assert.ok(f !== null && f >= 50, "seed " + seed + ": stump on day " + f + " (never before two seasons of pressure)");
    fired.push(f);
  }
  const quiet = eventDue(row, { streak: 49, cd: 0 }, { pressure: 0.2, absent: true, roll: 0 });
  assert.ok(!quiet.fire && quiet.st.streak === 0, "pressure below the threshold resets the streak");
  assert.ok(!eventDue(row, { streak: 99, cd: 0 }, { pressure: 0.9, absent: false, roll: 0 }).fire, "charcoal already known/in stock: the event stays asleep");
  // in the sim: the raw pressure reads digs and ore, and the forced event places the precondition
  const sim = loadFixture("settled");
  assert.equal(rawPressure(sim).tool_edge, 0);
  sim.disc.dg = 10; sim.disc.hd = 1;
  assert.ok(rawPressure(sim).tool_edge >= 0.6);
  assert.equal(sim.apply({ type: "force", ev: "stump" }), true);
  assert.equal(sim.disc.last.id, "stump");
  ok("stump event: tool_edge pressure from digging/ore/hard rock; the pure decision fires on days " + Math.min(...fired) + "-" + Math.max(...fired) + " over 30 seeds, never before day 50");
}

// 13. Save round-trip with a station mid-burn and a made item with quality; deterministic replay.
{
  const make = () => {
    const sim = loadFixture("copperready");
    grant(sim, adults(sim)[0], "SMELTING", 0.5);
    const kiln = furn(sim, "kiln")[0]; putStation(sim, "bellows", kiln.x + 1, kiln.y, kiln.z);
    sim.apply({ type: "keep", item: "copper", n: 2 });
    step(sim, 1500);
    for (let i = 0; i < 3 * DUR_DAY && !(kiln.bn > 0 || haveTotal(sim, "copper") > 0); i++) sim.step();       // (until a smelt is under way, capped)
    return sim;
  };
  const a = make(), kiln = furn(a, "kiln")[0];
  assert.ok(kiln.bn > 0 || haveTotal(a, "copper") > 0, "a smelt is under way (bn " + kiln.bn + ")");
  const copy = restore(toJSON(a));
  assert.equal(copy.hash(), a.hash());
  step(a, 2000); step(copy, 2000);
  assert.equal(copy.hash(), a.hash(), "restored sim stays equal through the finish of the batch");
  const b = make(); step(b, 2000);
  assert.equal(b.hash(), a.hash(), "two runs agree");
  assert.ok(haveTotal(a, "copper") >= 2);
  ok("save round-trip mid-burn and replay: hash " + a.hash());
}

// 14. Text: every new job, blocker and station reads cleanly.
{
  const sim = loadFixture("copperready");
  grant(sim, adults(sim)[0], "SMELTING", 0.5);
  sim.apply({ type: "keep", item: "copper", n: 2 }); sim.apply({ type: "keep", item: "charcoal", n: 20 });
  step(sim, 900);
  for (const v of adults(sim)) { const x = explain(sim, v); if (x) { assert.ok(!/undefined|\[object|NaN/.test(x.sentence), x.sentence); for (const r of x.rejected) assert.ok(r.text && !/undefined/.test(r.text), r.text); } }
  for (const e of sim.ents.ofKind("furniture")) assert.ok(!/undefined|NaN/.test(describe(sim, e)), describe(sim, e));
  ok("explain() and describe() are clean with kilns, keeps and craft jobs running");
}
console.log("chain ok");
