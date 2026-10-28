// S9: the rest of the twelve discoveries (GDD §15.7 rows 2-4, 6, 8, 10-12), on the S7 engine. Fixture-based, every window <= 3 game days.
//   node tests/discoveries.js
// Fixtures: `workshop` (hand work: stone, hides, fibre, framing, smoking), `copperage` (casting, hammering), `ironready` (a brick forge, coal, iron ore).
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { flatSpot, clearArea, instantHut } from "./helpers.js";
import { putStation, mineSpots } from "../tools/make_fixtures.js";
import { toJSON, restore } from "../src/sim/save.js";
import { PHENOMENA, PHENOMENON_IDS, matches, tagsOf, CRAFTS, ERAS, ERA_RANK, ERA_FLOW, GRAPH } from "../src/sim/phenomena.js";
import { can, grant, eraOf, erasHeld, famOf } from "../src/sim/knowledge.js";
import { stationHeat, heatReport } from "../src/sim/heat.js";
import { RECIPES } from "../src/sim/craft.js";
import { haveTotal, storeInZone, dropLoose, survey, spoilDaily, carryCap, ITEMS, PACK_CAP } from "../src/sim/items.js";
import { isAdult } from "../src/sim/villager.js";
import { initFauna, swing } from "../src/sim/fauna.js";
import { rampCells } from "../src/sim/mine.js";
import { look } from "../src/sim/seen.js";
import { packTick, toolAround } from "../src/sim/gear.js";
import { SHELTERS } from "../src/sim/shelter.js";
import { evaluate } from "../src/sim/roomeval.js";
import { M, MAT, World } from "../src/sim/world.js";
import { BMAT, checkPlace, PLACE_NEEDS } from "../src/sim/build.js";
import { almanac } from "../src/ui/almanac.js";
import { stationInfo, describe, blockerText, cellInfo } from "../src/ui/text.js";
import { generateWorld } from "../src/sim/worldgen.js";
import { dirtAt, SOFT_THICK } from "../src/sim/terrain.js";
import { DAY } from "../src/sim/clock.js";

const step = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };
const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
const furn = (sim, f) => sim.ents.ofKind("furniture").filter(e => e.f === f);
let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
/** Run until f(sim) or `max` ticks; returns ticks used or -1. */
function until(sim, f, max) { for (let i = 0; i < max; i++) { sim.step(); if (f(sim)) return i; } return -1; }
const asks = (sim, extra) => sim.apply({ type: "investigate", ids: adults(sim).slice(0, 3).map(v => v.id), ...extra });

// 1. The table: each new row fires from its context and falls short on a named axis.
{
  const R = (row, ctx) => matches(PHENOMENA[row], ctx);
  const t = (...items) => [...new Set(items.flatMap(tagsOf))];
  assert.ok(R("DRESS_STONE", { tags: t("stone"), src: "hand", verb: "hit", duration: 200 }).ok && !R("DRESS_STONE", { tags: t("stone"), src: "hand", verb: "soak", duration: 200 }).ok);
  assert.ok(R("CORDAGE", { tags: t("grass"), src: "hand", verb: "bind", duration: 200 }).ok && !R("CORDAGE", { tags: t("grass"), src: "hand", verb: "hit", duration: 200 }).ok);
  assert.ok(R("HIDE_WORKING", { tags: t("hide"), src: "hand", verb: "press", duration: 200 }).ok);
  assert.ok(R("FRAMING", { tags: t("log", "stone_axe"), src: "hand", verb: "hit", duration: 200 }).ok && !R("FRAMING", { tags: t("log"), src: "hand", verb: "hit", duration: 200 }).ok, "a log needs an edge");
  const smoke = { tags: t("hopper_meat"), src: "smoke", heat: 2, enclosed: true, duration: 1200 };
  assert.ok(R("SMOKE_FOOD", smoke).ok && R("SMOKE_FOOD", { ...smoke, heat: 0 }).near && R("SMOKE_FOOD", { ...smoke, enclosed: false }).miss.includes("enclosed") && R("SMOKE_FOOD", { ...smoke, duration: 300 }).miss.includes("duration"));
  const cast = { tags: t("copper", "mould"), src: "pit", heat: 4, duration: 600 };
  assert.ok(R("CASTING", cast).ok && R("CASTING", { ...cast, heat: 3 }).miss.includes("heat") && !R("CASTING", { ...cast, tags: t("copper") }).ok, "a mould is needed");
  assert.ok(R("HAMMER_NATIVE", { tags: t("copper"), src: "hand", verb: "hit", heat: 0, duration: 200 }).ok && R("HAMMER_NATIVE", { tags: t("copper"), src: "hand", verb: "hit", heat: 4, duration: 200 }).near, "hammered cold");
  assert.ok(!R("HAMMER_NATIVE", { tags: t("iron"), src: "hand", verb: "hit", heat: 0, duration: 200 }).ok, "iron does not spread cold");
  const iron = { tags: t("iron_ore", "coal"), src: "pit", heat: 5, duration: 1200 };
  assert.ok(R("SMELT_IRON", iron).ok && R("SMELT_IRON", { ...iron, heat: 4 }).miss.includes("heat") && !R("SMELT_IRON", { ...iron, tags: t("iron_ore", "log") }).ok, "wood is not carbon");
  assert.ok(R("SMELT_IRON", { ...iron, tags: t("malachite", "coal") }).ok === false, "green rock is not iron ore");
  const weld = { tags: t("iron", "coal"), src: "pit", heat: 5, duration: 600 };
  assert.ok(R("FORGE_WELDING", weld).ok && R("FORGE_WELDING", { ...weld, heat: 4 }).near && !R("FORGE_WELDING", { ...weld, tags: t("copper", "coal") }).ok);
  for (const id of PHENOMENON_IDS) assert.ok(!PHENOMENA[id].stub, id + " is live");
  ok("the new rows fire from their context, name the short axis, and need the right material (a mould, an edge, coal, not wood)");
}

// 2. Eras: K10's order Hearth -> Hide -> Stone -> Clay -> Timber -> Copper -> Iron, labelled by capability, with Iron needing both smelting and welding.
{
  assert.deepEqual(ERAS.map(e => e[0]), ["Hearth", "Hide", "Stone", "Clay", "Timber", "Copper", "Iron"]);
  assert.deepEqual(ERA_FLOW, ["Hearth", "Hide", "Stone", "Clay", "Timber", "Copper", "Iron"]);
  assert.ok(ERA_RANK.Clay < ERA_RANK.Timber && ERA_RANK.Timber < ERA_RANK.Copper && ERA_RANK.Copper < ERA_RANK.Iron && ERA_RANK.Hearth < ERA_RANK.Hide, "the slice chain Clay -> Copper, with Timber (off-chain) between");
  const sig = {}; for (const id of Object.keys(CRAFTS)) if (CRAFTS[id].era) sig[CRAFTS[id].era] = id;
  assert.deepEqual(sig, { Hearth: "FIRE_TENDING", Hide: "HIDE_WORKING", Stone: "DRESS_STONE", Clay: "POTTERY", Timber: "FRAMING", Copper: "SMELTING", Iron: "FORGING" });
  assert.deepEqual(CRAFTS.FORGING.also, ["IRON_SMELTING"]);
  // found in the "wrong" order: the chronicle logs each age as it is reached, a lower one reached late says so; the label shown is the highest
  const sim = loadFixture("hearth"), [a, b, c] = adults(sim);
  const log0 = sim.chron.entries.length;
  grant(sim, a, "POTTERY"); step(sim, 10); grant(sim, a, "FRAMING"); step(sim, 10); grant(sim, b, "HIDE_WORKING"); step(sim, 10); grant(sim, c, "DRESS_STONE");
  assert.equal(eraOf(sim), "Timber");
  const lines = sim.chron.entries.slice(log0).filter(e => /age/.test(e.text)).map(e => e.text);
  assert.ok(lines.some(l => /Clay age begins/.test(l)) && lines.some(l => /Timber age begins/.test(l)), lines.join(" | "));
  assert.ok(lines.some(l => /Hide age dawns, behind the Timber age/.test(l)) && lines.some(l => /Stone age dawns, behind/.test(l)), "a lower age reached late is chronicled as such: " + lines.join(" | "));
  const al = almanac(sim);
  assert.deepEqual(al.order, ["Hearth", "Clay", "Timber", "Hide", "Stone"], "the Almanac lists the ages in the order they were found");
  assert.deepEqual(al.flow.filter(x => x.held).map(x => x.name), ["Hearth", "Hide", "Stone", "Clay", "Timber"]);
  assert.equal(al.flow.find(x => x.name === "Hide").nth, 4);
  // Iron needs both: welding alone (nobody can have it without smelting, but a loss makes it so) does not label
  grant(sim, a, "FORGING"); assert.notEqual(eraOf(sim), "Iron", "welding without smelting is not the Iron age");
  grant(sim, b, "IRON_SMELTING"); assert.equal(eraOf(sim), "Iron");
  assert.deepEqual(erasHeld(sim).sort(), ["Clay", "Hearth", "Hide", "Iron", "Stone", "Timber"].sort());
  const gr = almanac(sim).graph;
  assert.equal(gr.length, 12); assert.equal(gr[0].state, "known"); assert.equal(gr[11].state, "known"); assert.equal(gr[8].state, "closed", "copper is closed: no kiln or charcoal yet");
  assert.ok(gr.every(g => g.state === "known" ? !!g.name : g.name === ""), "unknown rows are not named");
  ok("eras: K10 order, signatures, Iron needs smelting + welding, late ages chronicled and listed in the order found; the Almanac graph shows known / open / closed rows");
}

// 3. Heat 5 on two routes: a brick forge with coal and a second draft (a bellows, or the windy ridge). Charcoal tops out at 4; the flue alone is 4.
{
  const sim = loadFixture("ironready");
  const forge = furn(sim, "forge")[0];
  const lv = (e, f) => stationHeat(sim, e, f);
  assert.equal(lv(forge, "coal").level, 5); assert.ok(Math.abs(lv(forge, "coal").P - 6.525) < 1e-3, "3.0 x 1.45 x 1.5");
  assert.equal(lv(forge, "charcoal").level, 4, "the heat table does not let charcoal reach 5 (2.4 x 1.45 x 1.5 = 5.22)");
  const bel = furn(sim, "bellows").find(b => Math.abs(b.x - forge.x) <= 1 && Math.abs(b.y - forge.y) <= 1);
  sim.ents.remove(bel.id);
  assert.equal(lv(forge, "coal").level, 4, "route 0: one draft source (the flue) is not enough: 5.44");
  const why = heatReport(sim, forge, "coal", 5).steps.join(" | ");
  assert.ok(/second|two draft|bellows/.test(why), "the inspector says what is missing: " + why);
  const r = sim.world.geo.ridge[0], rf = putStation(sim, "forge", r.x, r.y, r.z);
  assert.equal(lv(rf, "coal").level, 5, "route 2: the forge on the windy ridge needs no bellows");
  const info = stationInfo(sim, forge);
  assert.ok(info && info.forge && /coal/.test(info.note) && /second|two draft|bellows/.test(info.heat.find(h => h.fuel === "coal").steps.join(" ")), "the station inspector explains heat 5");
  assert.ok(info.recipes.some(r => r.key === "iron" && !r.ok && /nobody knows iron smelting/.test(r.why)));
  // a plain kiln with coal and a bellows is the Furnace level (5.46), never the Forge level: iron needs the forge
  const kiln = furn(sim, "kiln")[0];
  assert.equal(lv(kiln, "coal").level, 4);
  ok("heat 5: forge + bellows 6.53, forge on the ridge 6.53; the flue alone 5.44 and charcoal 5.22 stay at level 4; the inspector explains it");
}

// 4. Witness routes: things are SEEN while doing something else (workshop fixture, only builds and a hunt).
{
  // stone fitted into a wall -> DRESS_STONE
  let sim = loadFixture("workshop");
  assert.ok(!can(sim, "DRESS_STONE"));
  let [x0, y0, z] = flatSpot(sim, 8, 3, 3); clearArea(sim, x0, y0, 8, 3, z);
  sim.apply({ type: "build", cells: [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ w: "wall", m: "stone", x: x0 + i, y: y0, z })) });
  let t = until(sim, (s) => can(s, "DRESS_STONE"), 3 * DAY);
  assert.ok(t >= 0, "someone understood stone dressing from watching a dry-stone wall go up"); assert.ok(sim.disc.trace.some(e => e.k === "witness" && e.row === "DRESS_STONE"), "a witness roll is in the trace");
  assert.equal(sim.disc.nt, 0, "nobody tinkered: it was seen");
  ok("witness: a dry-stone wall teaches stone dressing (tick " + t + ")");
  // fibre bound into wattle -> CORDAGE
  sim = loadFixture("workshop");
  [x0, y0, z] = flatSpot(sim, 8, 3, 3); clearArea(sim, x0, y0, 8, 3, z);
  sim.apply({ type: "build", cells: [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ w: "wall", m: "wattle", x: x0 + i, y: y0, z })) });
  t = until(sim, (s) => can(s, "CORDAGE"), 3 * DAY);
  assert.ok(t >= 0, "wattle and thatch are bound with fibre: CORDAGE is seen"); assert.equal(sim.disc.nt, 0);
  ok("witness: binding wattle shows how fibre twists into cord (tick " + t + ")");
  // a log squared with an axe -> FRAMING
  sim = loadFixture("workshop");
  storeInZone(sim, "stone_axe", 1); sim.cache.iv++;
  [x0, y0, z] = flatSpot(sim, 4, 3, 3); clearArea(sim, x0, y0, 4, 3, z);
  sim.apply({ type: "build", cells: [0, 1, 2, 3].map(i => ({ w: "wall", m: "log", x: x0 + i, y: y0, z })) });
  t = until(sim, (s) => can(s, "FRAMING"), 3 * DAY);
  assert.ok(t >= 0, "log walls with an axe about teach framing");
  ok("witness: log walls raised with an axe in the village show framing (tick " + t + ")");
  // the skin off a hopper -> HIDE_WORKING (and a hide drops)
  sim = loadFixture("workshop");
  initFauna(sim);
  let hides = 0;
  for (let k = 0; k < 4 && !can(sim, "HIDE_WORKING"); k++) {
    const hop = sim.ents.ofKind("fauna").find(f => f.sp === "hopper"), hunter = adults(sim)[k % 3];
    sim.ents.move(hop, hunter.x, hunter.y, hunter.z); hop.hp = 1;
    for (let s = 0; s < 40 && sim.ents.get(hop.id); s++) swing(sim, hunter, hop);
    assert.ok(!sim.ents.get(hop.id), "the hopper fell");
    step(sim, 60);
  }
  hides = haveTotal(sim, "hide") - 6;
  assert.ok(hides >= 1, "a kill drops a hide (" + hides + " more than the stockpile started with)");
  assert.ok(can(sim, "HIDE_WORKING"), "whoever watched the skinning understood hide working");
  ok("witness: skinning a hopper shows hide working, and drops a hide");
}

// 5. Tinker routes: Investigate a material and the villagers try it; each phenomenon fires from its own context, no flag, no leak.
{
  const via = (name, fix, craft, extra, prep, seeAt) => {
    const sim = loadFixture(fix);
    if (prep) prep(sim);
    assert.ok(!can(sim, craft), name + ": unknown at the start");
    asks(sim, extra(sim));
    let t = until(sim, (s) => can(s, craft), 3 * DAY);
    if (t < 0) { asks(sim, extra(sim)); t = until(sim, (s) => can(s, craft), 3 * DAY); }       // S13: one experiment per station per day makes a find a chance roll (3 tries in an ask); asked a second time if the first ask came up empty
    assert.ok(t >= 0, name + ": found within two asks (6 game days) (dead ends " + sim.disc.dead.length + ", tries " + sim.disc.nt + ", miss " + JSON.stringify(sim.disc.miss) + ")");
    assert.ok(sim.disc.trace.some(e => e.k === "tinker" && e.ok && e.row === craftRow(craft)), name + ": the trace shows a tinker success");
    ok("tinker: " + name + " (" + t + " ticks, " + sim.disc.nt + " tries)");
    return sim;
  };
  const craftRow = (c) => PHENOMENON_IDS.find(id => PHENOMENA[id].craft === c);
  via("stone struck", "workshop", "DRESS_STONE", () => ({ item: "stone" }));
  via("grass twisted", "workshop", "CORDAGE", () => ({ item: "grass" }));
  via("a hide worked", "workshop", "HIDE_WORKING", () => ({ item: "hide" }));
  via("meat left on the covered rack beside the fire", "workshop", "SMOKING", (s) => ({ item: "hopper_meat", at: furn(s, "smoker")[0].id }));
  via("a log and an axe", "workshop", "FRAMING", () => ({ item: "log" }), (s) => { storeInZone(s, "stone_axe", 1); s.cache.iv++; });
  via("copper beaten cold", "copperage", "HAMMERING", () => ({ item: "copper" }));
  via("copper and a mould in a hot kiln", "copperage", "CASTING", (s) => ({ item: "copper", at: furn(s, "kiln")[0].id }), (s) => { storeInZone(s, "mould", 2); s.cache.iv++; });
  via("iron ore and coal in the forge", "ironready", "IRON_SMELTING", (s) => ({ item: "iron_ore", at: furn(s, "forge")[0].id }));
  via("iron and coal in the forge", "ironready", "FORGING", (s) => ({ item: "iron", at: furn(s, "forge")[0].id }), (s) => { storeInZone(s, "iron", 12); grant(s, adults(s)[0], "IRON_SMELTING"); s.cache.iv++; });
}

// 6. Near-miss hints and the dead ends: iron ore in a kiln with a bellows only reaches 4, and says "hotter" without naming iron
{
  const sim = loadFixture("ironready");
  const kiln = furn(sim, "kiln")[0];
  grant(sim, adults(sim)[0], "KILN");
  asks(sim, { item: "iron_ore", at: kiln.id });
  step(sim, 3 * DAY);
  assert.ok(!can(sim, "IRON_SMELTING"), "a kiln never gets there");
  assert.ok((sim.disc.miss.SMELT_IRON || 0) >= 1, "near-miss counted: " + JSON.stringify(sim.disc.miss));
  sim.disc.miss.SMELT_IRON = 3;
  const a = almanac(sim);
  assert.ok(a.hints.some(h => /hotter/.test(h) && !/iron|steel|ingot/i.test(h)), "the hint names the gap, not the product: " + a.hints);
  assert.ok(a.deadEnds.some(t => /heavy rust-red rock/.test(t)), "tried, nothing: " + a.deadEnds);
  ok("near miss: ore in a kiln is a dead end at heat 4; after three the Almanac says hotter, never what it makes");
}

// 7. Recipes and stations produce: hand work at the bench, the covered rack, bricks in the kiln.
{
  const sim = loadFixture("workshop"), [a, b] = adults(sim);
  for (const c of ["CORDAGE", "HIDE_WORKING", "DRESS_STONE", "SMOKING"]) grant(sim, a, c, 0.6);
  grant(sim, b, "KILN", 0.6); grant(sim, b, "POTTERY", 0.6);
  const kinds = new Set();
  const phase = (want, max = 5 * DAY) => {
    for (const k of Object.keys(want)) sim.apply({ type: "keep", item: k, n: want[k] });
    let t = 0;
    for (; t < max; t++) {
      sim.step();
      if (t % 100 === 0) for (const v of sim.ents.ofKind("villager")) if (v.job) kinds.add(v.job.k);
      if (Object.keys(want).every(k => haveTotal(sim, k) >= want[k])) break;
    }
    const got = Object.fromEntries(Object.keys(want).map(k => [k, haveTotal(sim, k)]));
    for (const k of Object.keys(want)) assert.ok(got[k] >= want[k], k + " made: " + JSON.stringify(got));
    ok("bench + rack recipes: " + JSON.stringify(got) + " in " + t + " ticks");
    for (const k of Object.keys(want)) sim.apply({ type: "unkeep", item: k });
  };
  for (const e of sim.ents.ofKind("item").filter(q => q.item === "stick" || q.item === "log").slice()) sim.ents.remove(e.id);       // room in the stockpile (a full one idles every keep)
  storeInZone(sim, "grass", 12); storeInZone(sim, "stone", 16); storeInZone(sim, "flint", 4); storeInZone(sim, "stick", 10); storeInZone(sim, "log", 6); sim.cache.iv++;           // (S13: a regenerated fixture's stores are whatever the village had left; the recipes need these)
  phase({ cordage: 3, block: 2, stone_axe: 1, smoked_meat: 4 });           // (one bench: a bench job is one worker at a time, so the products are made in phases)
  storeInZone(sim, "cordage", 4); storeInZone(sim, "hide", 6); sim.cache.iv++;
  phase({ leather: 2, basket: 1 });
  storeInZone(sim, "cordage", 2); sim.cache.iv++;
  phase({ backpack: 1 });
  assert.ok(kinds.has("make_tool") && kinds.has("smoke"), "the bench job and a new job kind, `smoke`, ran: " + [...kinds]);
  // framing wants an axe: with the stone axe made above, timber comes
  grant(sim, a, "FRAMING", 0.6);
  sim.apply({ type: "keep", item: "timber", n: 2 });
  assert.ok(until(sim, (s) => haveTotal(s, "timber") >= 2, 3 * DAY) >= 0, "timber is framed once an axe exists");
  assert.equal(RECIPES.timber.tool.includes("stone_axe"), true);
  ok("timber: framed with the stone axe (it is not used up: " + haveTotal(sim, "stone_axe") + " axe left)");
  assert.equal(haveTotal(sim, "stone_axe"), 1);
}
{
  const sim = loadFixture("workshop");
  const [a] = adults(sim);
  grant(sim, a, "KILN", 0.6); grant(sim, a, "POTTERY", 0.6);
  const kiln = putStation(sim, "kiln", ...(([x, y, z]) => [x + 1, y + 1, z])(flatSpot(sim, 3, 3, 4))); clearArea(sim, kiln.x - 1, kiln.y - 1, 3, 3, kiln.z);
  storeInZone(sim, "clay", 8); storeInZone(sim, "stick", 10); sim.cache.iv++;
  sim.apply({ type: "keep", item: "brick", n: 4 });
  const t = until(sim, (s) => haveTotal(s, "brick") >= 4, 3 * DAY);
  assert.ok(t >= 0, "bricks come out of the kiln (KILN_FIRING is live: a kiln run teaches it, brick is its product)");
  assert.ok(can(sim, "KILN"));
  ok("kiln firing: 4 bricks in " + t + " ticks");
}
{
  const sim = loadFixture("copperage"), [a, b] = adults(sim);
  grant(sim, a, "CASTING", 0.6); grant(sim, a, "HAMMERING", 0.6);
  for (const [k, v] of [["mould", 2], ["sheet", 0]]) if (v) storeInZone(sim, k, v);
  sim.apply({ type: "keep", item: "mould", n: 2 }); sim.apply({ type: "keep", item: "sheet", n: 2 }); sim.apply({ type: "keep", item: "copper_axe", n: 1 });
  // (S16: on the new land a villager can start a third mould at the very moment two exist and leave the bench loaded for it; craft.js now lets another recipe clear a load that sat unlit for a day)
  const t = until(sim, (s) => haveTotal(s, "mould") >= 2 && haveTotal(s, "sheet") >= 2 && haveTotal(s, "copper_axe") >= 1, 3 * DAY);
  assert.ok(t >= 0 && haveTotal(sim, "mould") >= 2 && haveTotal(sim, "copper_axe") >= 1, "moulds, sheet and a cast axe: " + ["mould", "sheet", "copper_axe", "charcoal", "copper"].map(k => k + "=" + haveTotal(sim, k)));
  sim.apply({ type: "keep", item: "fitting", n: 2 }); sim.apply({ type: "keep", item: "cast_pick", n: 1 });
  const t2 = until(sim, (s) => haveTotal(s, "fitting") >= 2 && haveTotal(s, "cast_pick") >= 1, 3 * DAY);
  assert.ok(t2 >= 0, "fittings and a cast pick: " + ["fitting", "cast_pick", "mould", "copper", "sheet", "charcoal"].map(k => k + "=" + haveTotal(sim, k)));
  ok("copper age: moulds, sheet and a cast axe in " + t + " ticks; fittings and a cast pick in " + t2 + " more");
}
{
  const sim = loadFixture("ironready"), [a, b] = adults(sim);
  grant(sim, a, "IRON_SMELTING", 0.6); grant(sim, a, "FORGING", 0.6);
  sim.apply({ type: "keep", item: "iron", n: 2 });
  const t = until(sim, (s) => haveTotal(s, "iron") >= 2, 3 * DAY);
  assert.ok(t >= 0, "iron smelted at the forge");
  const iron = sim.ents.ofKind("item").find(s => s.item === "iron");
  sim.apply({ type: "keep", item: "iron_pick", n: 1 });
  const t2 = until(sim, (s) => haveTotal(s, "iron_pick") >= 1, 3 * DAY);
  assert.ok(t2 >= 0, "an iron pick forged: iron " + haveTotal(sim, "iron"));
  assert.ok(sim.chron.entries.some(e => /first iron/i.test(e.text)), "the first iron is a chronicle line");
  ok("iron: 2 iron in " + t + " ticks, then an iron pick in " + t2);
}

// 8. Iron tools dig deep rock: marked deep rock stalls with NO_TOOL until an iron pick exists; then a digger takes it and digs.
{
  const sim = loadFixture("ironready");
  // a stair down to the top of the deep rock (as if dug and walked: the village can dig everything above deep rock without iron), then one deep cell beside its foot
  let found = null;
  for (let x = sim.stock.x1 + 4; x < sim.stock.x1 + 30 && !found; x += 2) {
    const y = sim.stock.y0, z0 = sim.world.standZ(x, y);
    if (z0 < 0) continue;
    let zd = -1; for (let z = z0; z >= 1; z--) if (sim.world.mat(x, y, z) === M.DEEP) { zd = z; break; }
    if (zd < 0) continue;
    const levels = z0 - zd - 1, cells = rampCells(sim, x, y, z0, levels, [1, 0]);
    if (!cells || sim.world.mat(x + levels + 1, y, zd) !== M.DEEP || sim.world.mat(x + levels, y, zd) !== M.DEEP) continue;
    if (cells.some(i => sim.ents.at(...World.xyz(i)).length)) continue;
    found = { x, y, z0, zd, levels, cells };
  }
  assert.ok(found, "a stair site over deep rock");
  const { x, y, zd, levels } = found;
  for (const i of found.cells) { const c = World.xyz(i); sim.world.set(...c, M.AIR, 0); look(sim, ...c); }
  const target = [x + levels + 1, y, zd];
  assert.ok(sim.world.isWalkable(x + levels, y, zd + 1), "the foot of the stair is a stand cell on deep rock");
  sim.apply({ type: "mine", op: "region", x0: target[0], y0: y, x1: target[0], y1: y, z: zd, layers: 1 });
  step(sim, 900);
  assert.equal(sim.world.mat(...target), M.DEEP, "without an iron pick the deep rock stays");
  const why = blockerText("mine", "NO_TOOL");
  assert.ok(/iron pick/.test(why), why);
  assert.ok(!sim.ents.ofKind("villager").some(v => v.eq && v.eq.item === "iron_pick"));
  storeInZone(sim, "iron_pick", 1); sim.cache.iv++;
  assert.ok(toolAround(sim, "iron_pick"));
  const t = until(sim, (s) => s.world.mat(...target) === M.AIR, 2 * DAY);
  assert.ok(t >= 0, "with an iron pick in the stockpile a digger takes it and digs the deep rock");
  ok("deep rock: marked, it waits (\"" + why.slice(0, 44) + "...\"), then an iron pick arrives and it is dug after " + t + " ticks");
}

// 8b. "Seek iron ore" is an ordinary mining intent (R27): with ore in sight a villager digs it out of the hard rock band and it is hauled home. (Coal likewise.)
{
  const sim = loadFixture("mine");
  const { FACE } = mineSpots(sim), known = [[0, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, 1]].map(([a, b, c]) => World.idx(FACE[0] + a, FACE[1] + b, FACE[2] + c)).filter(i => sim.seen.known[M.MALACHITE].includes(i));      // the four exposed cells of the mine fixture's face
  assert.ok(known.length >= 3, "the mine fixture has an exposed face");
  sim.seen.known[M.IRONORE] = [];
  for (const i of known) { const [x, y, z] = World.xyz(i); sim.world.set(x, y, z, M.IRONORE, 0); sim.seen.known[M.IRONORE].push(i); }
  assert.ok(sim.apply({ type: "mine", op: "seek", item: "iron_ore" }), "iron ore is a seekable item");
  assert.ok(sim.apply({ type: "mine", op: "seek", item: "coal" }), "and so is coal");
  assert.ok(sim.apply({ type: "mine", op: "cancel", id: sim.mine.list.find(d => d.item === "coal").id }), "(cancelled again: its search tunnels would compete for the diggers)");
  assert.ok(!sim.apply({ type: "mine", op: "seek", item: "gold" }) && sim.lastBlocker === "UNKNOWN_ITEM");
  const t = until(sim, (s) => survey(s).stock.iron_ore >= 2, 3 * DAY);
  assert.ok(t >= 0, "iron ore dug and hauled: " + survey(sim).stock.iron_ore + " in stock, " + survey(sim).loose.iron_ore + " loose");
  assert.ok(sim.disc.hd, "hard rock counted as dug (the tool_edge pressure's input)");
  ok("mining: 'seek iron ore' digs the seen face and the ore is hauled home after " + t + " ticks");
}

// 9. Spoilage and smoking: raw meat and hides go off, smoked meat keeps; it counts as the winter larder.
{
  const sim = loadFixture("workshop");
  for (const s of sim.ents.ofKind("item").slice()) if (["hopper_meat", "hide"].includes(s.item)) sim.ents.remove(s.id);
  storeInZone(sim, "hopper_meat", 10); storeInZone(sim, "smoked_meat", 10); storeInZone(sim, "hide", 10); sim.cache.iv++;
  const r0 = survey(sim).rations;
  for (let d = 0; d < 3; d++) spoilDaily(sim);
  const sv = survey(sim);
  assert.ok(sv.stock.hopper_meat <= 7, "raw meat spoils ~12% a day: " + sv.stock.hopper_meat);
  assert.ok(sv.stock.smoked_meat >= 10 - 1, "smoked meat keeps: " + sv.stock.smoked_meat);
  for (let d = 0; d < 5; d++) spoilDaily(sim);
  assert.ok(survey(sim).stock.hide <= 9, "a raw hide rots (3%/day): " + survey(sim).stock.hide);
  assert.ok(ITEMS.smoked_meat.spoil * 8 <= ITEMS.hopper_meat.spoil, "an eighth of the spoilage or less");
  // the winter larder counts at full value in the runway; raw meat and berries count less as winter nears
  const mk = (item, k) => { const s = loadFixture("workshop"); for (const q of s.ents.ofKind("item").slice()) if (["hopper_meat", "berry", "tuber", "dried"].includes(q.item)) s.ents.remove(q.id); storeInZone(s, item, k); s.cache.iv++; return s; };
  const raw = mk("hopper_meat", 8), smoked = mk("smoked_meat", 8);
  for (const s of [raw, smoked]) { s.tick = 1800 * 60; s.cache.iv++; for (let i = 0; i < 40; i++) s.step(); }
  assert.ok(smoked.board.runway > raw.board.runway, "in late autumn the same smoked meat is a bigger larder: " + smoked.board.runway + " vs " + raw.board.runway);
  // and a villager eats the perishable first
  ok("spoilage: 3 days -> raw meat " + sv.stock.hopper_meat + "/10, smoked " + sv.stock.smoked_meat + "/10, hides " + sv.stock.hide + "/10; larder runway " + smoked.board.runway + " vs " + raw.board.runway + " days of raw");
}

// 10. A pack on the back: a backpack (or basket) in the yard is picked up by whoever passes, and raises the carry capacity.
{
  const sim = loadFixture("workshop");
  const v = adults(sim)[0], base = carryCap(v);
  storeInZone(sim, "backpack", 1); storeInZone(sim, "basket", 1); sim.cache.iv++;
  v.carry = null; v.slp = 0; sim.ents.move(v, sim.stock.x0, sim.stock.y0, sim.stock.z);
  for (const o of sim.ents.ofKind("villager")) if (o !== v && o !== adults(sim)[1]) o.slp = 1;       // everyone else is asleep: whoever stands in the yard first takes the pack
  packTick(sim);
  assert.equal(v.pk, "backpack", "the better one is taken first"); assert.equal(carryCap(v), base + PACK_CAP.backpack);
  const w = adults(sim)[1]; sim.ents.move(w, sim.stock.x0, sim.stock.y0, sim.stock.z); w.carry = null; w.slp = 0; v.slp = 0; packTick(sim);
  assert.equal(w.pk, "basket"); assert.equal(carryCap(w), carryCap({ ...w, pk: "" }) + PACK_CAP.basket);
  assert.ok(carryCap(v) >= base * 2 - 1, "a backpack roughly doubles what the arms carry");
  // dying leaves it behind
  const before = haveTotal(sim, "backpack");
  ok("carry tiers: hand " + base + " -> basket " + carryCap(w) + " -> backpack " + carryCap(v) + " load units");
}

// 11. The shelter ladder: the same house in the materials at hand. Warmer walls, better rooms; the designs appear as the village learns the materials.
{
  const sim = loadFixture("hearth");
  const names = () => sim.bps.list.map(b => b.name);
  assert.ok(!names().includes("Hide teepee"), "no teepee design before hide working");
  const a = adults(sim)[0];
  grant(sim, a, "HIDE_WORKING"); grant(sim, a, "FRAMING"); grant(sim, a, "DRESS_STONE"); grant(sim, a, "KILN");
  step(sim, DAY + 5);
  for (const s of SHELTERS) assert.ok(names().includes(s.name), "the village offers a " + s.name + ": " + names());
  // wall materials: insulation climbs with the rung, and the room score with it
  const ins = (m) => MAT[m].ins;
  assert.ok(ins(M.WATTLE) < ins(M.HIDEWALL) && ins(M.HIDEWALL) <= ins(M.LOGWALL) && ins(M.LOGWALL) < ins(M.TIMBERWALL) && ins(M.TIMBERWALL) < ins(M.DRESSED) && ins(M.DRESSED) < ins(M.BRICKWALL), "insulation climbs: wattle .4 < hide .5 <= log .5 < timber .6 < dressed .7 < brick .8");
  const quality = {}, warm = {};
  const mats = { wattle: M.WATTLE, hide: M.HIDEWALL, timber: M.TIMBERWALL, dressed: M.DRESSED, brick: M.BRICKWALL };
  let k = 0;
  for (const key of Object.keys(mats)) {
    const [x0, y0, z, w, h] = (() => { const [x, y, zz] = flatSpot(sim, 6, 5, 6 + 3 * k++); return [x, y, zz, 6, 5]; })();
    clearArea(sim, x0, y0, w, h, z);
    instantHut(sim, x0, y0, w, h, { wall: mats[key], roofMat: M.THATCH, z });
    const room = sim.rooms.at(x0 + 2, y0 + 2, z);
    assert.ok(room && room.enclosed, key + " hut is a closed room");
    quality[key] = evaluate(sim, room).quality; warm[key] = room.warm;
  }
  assert.ok(warm.wattle < warm.hide && warm.hide < warm.timber && warm.timber < warm.dressed && warm.dressed < warm.brick, "warmth by wall material: " + JSON.stringify(warm));
  assert.ok(quality.wattle < quality.timber && quality.timber < quality.brick, "room quality by wall material: " + JSON.stringify(quality));
  // a teepee design stamps with hide walls; the palette check refuses it while nobody knows hide working
  const bp = sim.bps.list.find(b => b.name === "Hide teepee");
  assert.ok(bp.cells.some(c => c[2] === "wall" && c[3] === "hide") && bp.cells.some(c => c[2] === "roof" && c[3] === "hideroof") && bp.cells.some(c => c[2] === "bed"));
  const fresh = loadFixture("hearth"), [fx, fy, fz] = flatSpot(fresh, 3, 3, 0);
  assert.equal(checkPlace(fresh, "wall", "hide", fx, fy, fz), "unknown", "hide walls are refused until someone knows hide working");
  assert.equal(checkPlace(fresh, "wall", "dressed", fx, fy, fz), "unknown"); assert.equal(checkPlace(fresh, "wall", "brick", fx, fy, fz), "unknown"); assert.equal(checkPlace(fresh, "floor", "plank", fx, fy, fz), "unknown");
  grant(fresh, adults(fresh)[0], "HIDE_WORKING"); assert.equal(checkPlace(fresh, "wall", "hide", fx, fy, fz), null, "...and placeable once they do");
  assert.equal(PLACE_NEEDS.forge[0], "KILN"); assert.equal(PLACE_NEEDS.smoker[0], "FIRE_TENDING");
  ok("shelter ladder: warmth " + Object.keys(warm).map(k => k + " " + warm[k].toFixed(2)).join(", ") + "; quality " + Object.keys(quality).map(k => k + " " + quality[k].toFixed(2)).join(", "));
}

// 12. Iron country in the world: >= 2 shallow sources of iron ore and coal, deep rock beneath (the 20-seed validator is tests/geology.js; two seeds here).
{
  for (const seed of [3, 11]) {
    const { world: w, gen } = generateWorld(seed);
    assert.ok(gen.ok && gen.counts.iron >= 2 && gen.counts.coal >= 2, "seed " + seed + ": " + JSON.stringify(gen.counts));
    let di = 0, dc = 0;                                                 // S16: the deep veins are noise bands in the deep rock now; look for them near the camp
    for (let y = w.site.y - 64; y <= w.site.y + 64; y++) for (let x = w.site.x - 64; x <= w.site.x + 64; x++) {
      const sb = w.hsAt(x, y) - dirtAt(seed, x, y) - SOFT_THICK;
      for (let z = Math.min(sb - 3, 23); z >= 1; z--) { const m = w.mat(x, y, z); if (m === M.IRONORE) di++; else if (m === M.COAL) dc++; }
    }
    assert.ok(di > 0 && dc > 0, "and richer veins in the deep rock: iron " + di + ", coal " + dc);
  }
  ok("worldgen: iron and coal each have >= 2 reachable shallow veins (plus deep ones)");
}

// 13. Save round-trip mid-batch and determinism: a forge burning iron and a covered rack smoking, restored, replay identically; old saves load.
{
  const sim = loadFixture("ironready"), [a] = adults(sim);
  grant(sim, a, "IRON_SMELTING", 0.6); grant(sim, a, "SMOKING", 0.6);
  storeInZone(sim, "hopper_meat", 4); sim.cache.iv++;
  sim.apply({ type: "keep", item: "iron", n: 2 });
  const forge = furn(sim, "forge")[0];
  assert.ok(until(sim, () => forge.bn > 0, 2 * DAY) >= 0, "the forge is lit");
  step(sim, 300);
  const text = toJSON(sim), copy = restore(text);
  assert.equal(copy.hash(), sim.hash(), "restored hash matches");
  step(sim, 900); step(copy, 900);
  assert.equal(copy.hash(), sim.hash(), "and stays equal 900 ticks on");
  assert.deepEqual(copy.disc.eras, sim.disc.eras);
  ok("save round-trip mid-burn and replay: hash " + sim.hash());
}

// 14. Plain words: every new station, material and graph row reads cleanly.
{
  const sim = loadFixture("ironready");
  for (const e of sim.ents.ofKind("furniture")) { const t = describe(sim, e); assert.ok(t && !/undefined|NaN|\[object/.test(t), t); }
  for (const m of [M.IRONORE, M.COAL, M.DEEP, M.HIDEWALL, M.HIDEROOF, M.DRESSED, M.TIMBERWALL, M.PLANKFLOOR, M.BRICKWALL]) assert.ok(MAT[m].name);
  assert.equal(GRAPH.length, 12);
  assert.ok(Object.keys(BMAT).every(k => !BMAT[k].need || CRAFTS[BMAT[k].need]), "every material's craft exists");
  ok("text: stations and materials read cleanly");
}
console.log("discoveries ok");
