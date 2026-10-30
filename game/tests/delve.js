// 7.23 Delving gameplay and the core itself (quick set). Pre-situated fixtures, each run only until the event (capped):
//   delve      three villagers on a labyrinth's first door  -> the delve expedition maps, disarms, opens caches, recalls on wounds and on light, names what stalls it, brings the haul home
//   guardian   a slime beside a weakened guardian           -> the kill is a deed and offers the choice
//   coreslain  the guardian slain, the choice pending       -> Harvest (shards, the core gone, spawning stops, nothing else changes) or Leave (nothing changes), answered only by the player
// plus the pure rules: a harvest in one sim never reaches another, and it survives a save.
//   node game/tests/delve.js
import "./legacy.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixture } from "./fixture.js";
import { manaAt, liveMana, coresNear } from "../src/sim/core.js";
import { HARVEST_SHARDS, pending, coreByKey, coreName, CHOICES } from "../src/sim/cm.js";
import { DELVE_LIGHT, DELVE_TIME, DELVE_RECALL_HP } from "../src/sim/delve.js";
import { spawnRate, regionCap } from "../src/sim/monsters.js";
import { dungeonOf, lootAt } from "../src/sim/dungeon.js";
import { survey } from "../src/sim/items.js";
import { M } from "../src/sim/world.js";
import { toJSON, restore } from "../src/sim/save.js";
import { maxHp, fitness, ageDays } from "../src/sim/villager.js";
import { crewSummary } from "../src/ui/crewtext.js";
import { delveStallText, EXP_WHY, blockerText } from "../src/ui/text.js";
import { delveChoices } from "../src/ui/expedition.js";
import { spawnFauna } from "../src/sim/fauna.js";
import { FAUNA_SIZE, spriteOf } from "../src/render/sprites.js";

const here = dirname(fileURLToPath(import.meta.url));
const ok = (m) => console.log("ok  " + m);
const adults = (sim) => sim.ents.ofKind("villager");

// ---- 1. the pure rules ----
{
  assert.ok(!/Math\.(exp|sin|cos|random|pow)|Date\.|performance/.test(readFileSync(join(here, "..", "src", "sim", "delve.js"), "utf8").replace(/\/\/.*$/gm, "")), "delve.js uses no exp / sin / random / clock");
  assert.ok(!/Math\.(exp|sin|cos|random|pow)|Date\.|performance/.test(readFileSync(join(here, "..", "src", "sim", "cm.js"), "utf8").replace(/\/\/.*$/gm, "")), "cm.js uses no exp / sin / random / clock");
  assert.deepEqual(Object.values(CHOICES).map(s => s.split(" ").length), [1, 1], "each choice has a 1-3 word label (" + Object.values(CHOICES).join(", ") + ")");
  ok("labels " + Object.values(CHOICES).join(" / "));
}

// ---- 2. the guardian: a slime next to it, a kill, the deed, the choice (until the event) ----
{
  const sim = loadFixture("guardian"), v = adults(sim).find(q => q.eq && q.eq.item === "copper_spear"), g = sim.ents.ofKind("fauna").find(e => e.sp === "guardian");
  assert.ok(v && g && g.hp <= 20, "the fixture: a slime with a spear and a weakened guardian");
  const key = g.ck;
  assert.deepEqual(sim.cm.pend, [], "nothing pending yet");
  assert.ok(sim.apply({ type: "possess", id: v.id }));
  let t = -1;
  for (let i = 0; i < 600 && t < 0; i++) {
    const tb = sim.ents.get(g.id); if (!tb) { t = i; break; }
    const adj = Math.abs(tb.x - v.x) + Math.abs(tb.y - v.y) <= 1 && Math.abs(tb.z - v.z) <= 1, horiz = Math.abs(tb.x - v.x) >= Math.abs(tb.y - v.y);
    if (!v.action) sim.apply({ type: "pinput", id: v.id, dx: adj ? 0 : horiz ? Math.sign(tb.x - v.x) : 0, dy: adj ? 0 : horiz ? 0 : Math.sign(tb.y - v.y), tid: adj ? tb.id : 0, verb: "" });
    sim.step();
  }
  assert.ok(t >= 0 && sim.ents.get(v.id), "the guided slime slew the guardian and lived (tick " + t + ")");
  assert.deepEqual(sim.cm.pend, [key], "the choice is pending for that core");
  assert.ok((sim.wild.gk || []).includes(key), "the guardian is remembered as slain");
  assert.ok(sim.chron.entries.some(e => /slew the guardian of the .* ridge/.test(e.text)), "the chronicle: guardian slain");
  assert.ok(sim.chron.entries.some(e => /first to enter a labyrinth/.test(e.text)), "the chronicle: the first to enter the labyrinth");
  const p = pending(sim)[0];
  assert.ok(p.key === key && /ridge/.test(p.name), "the prompt names the core: " + p.name);
  for (let i = 0; i < 300; i++) sim.step();
  assert.deepEqual(sim.cm.pend, [key], "the game waits: nothing answers the choice for the player");
  assert.equal(sim.world.mat(...Object.values(coreByKey(sim, key)).slice(0, 3)), M.CORE, "the core is still there");
  ok("guardian: slain in " + t + " ticks by a guided slime, chronicle deeds written, the choice waits on the player (" + p.name + ")");
}

// ---- 3. Leave: nothing changes ----
{
  const sim = loadFixture("coreslain"), key = sim.cm.pend[0], c = coreByKey(sim, key);
  assert.ok(key && c, "the fixture has a choice pending");
  const m0 = manaAt(sim.def, c.x, c.y, c.z), stock0 = survey(sim).stock.core_shard;
  assert.ok(!sim.apply({ type: "core", op: "harvest", key: "1,2" }) && sim.lastBlocker === "NO_TARGET", "a core with no choice pending is refused (NO_TARGET)");
  assert.ok(sim.apply({ type: "core", op: "leave", key }), "Leave is accepted");
  assert.deepEqual(sim.cm.pend, []); assert.deepEqual(sim.cm.left, [key]);
  assert.ok(!sim.apply({ type: "core", op: "harvest", key }), "and it is final: a left core cannot be harvested afterwards");
  assert.equal(manaAt(sim.def, c.x, c.y, c.z), m0, "the field is untouched, however long it waits");
  assert.equal(sim.world.mat(c.x, c.y, c.z), M.CORE, "the core stands");
  assert.equal(survey(sim).stock.core_shard, stock0, "no shards");
  assert.ok(sim.chron.entries.some(e => /left as it is/.test(e.text)), "the chronicle says it was left");
  ok("leave: the field stays " + m0 + ", the core stands, no shards, final");
}

// ---- 4. Harvest: the haul, the core gone, it spawns nothing  ----
{
  const sim = loadFixture("coreslain"), other = loadFixture("coreslain"), key = sim.cm.pend[0], c = coreByKey(sim, key), dun = dungeonOf(sim.def, c);
  const probes = [[c.x, c.y, c.z], [c.x + 10, c.y, c.z], [c.x, c.y + 20, c.z + 2], [c.x - 30, c.y, c.z]];
  const before = probes.map(([x, y, z]) => manaAt(sim.def, x, y, z));
  assert.ok(before[0] >= 200 && before[1] > 0, "a heart-band field round the core: " + before.join(", "));
  const shards0 = survey(sim).stock.core_shard + survey(sim).loose.core_shard, t0 = sim.tick;
  assert.ok(sim.apply({ type: "core", op: "harvest", key }), "Harvest is accepted");
  assert.deepEqual(sim.cm.pend, []); assert.deepEqual(sim.cm.gone, [[key, t0]]);
  assert.ok(!sim.apply({ type: "core", op: "harvest", key }), "a harvested core cannot be harvested twice");
  const s1 = survey(sim);
  assert.equal(s1.stock.core_shard + s1.loose.core_shard - shards0, HARVEST_SHARDS, "a large one-time haul of core shards (" + HARVEST_SHARDS + ")");
  assert.equal(sim.world.mat(c.x, c.y, c.z), M.AIR, "the core cell is open: the core is gone for good");
  assert.ok(sim.chron.entries.some(e => /The core of the .* ridge was harvested/.test(e.text)), "the chronicle: the core was harvested");
  // D48: a harvest removes nothing. The field as generated, ore, caches and the danger display are exactly what they were; only new spawns stop (at once).
  const lootGrid = (d) => { const o = []; for (let k = 0; k < 400; k++) o.push(JSON.stringify(lootAt(d, c.x - 20 + (k % 20), c.y - 10 + ((k / 20) | 0), c.z))); return o; };
  assert.deepEqual(probes.map(([x, y, z]) => manaAt(sim.def, x, y, z)), before, "the field (and so the danger band shown) is unchanged by the harvest");
  const lootB = lootGrid(other.def), lootA = lootGrid(sim.def);
  assert.deepEqual(lootA, lootB, "cache loot near the core is exactly what it was");
  assert.ok(lootA.some(q => q !== "[]"), "(and there is loot to compare)");
  const live = (d, p) => liveMana(coresNear(d, p[0], p[1], p[0], p[1]), p[0], p[1], p[2]);
  assert.ok(live(other.def, probes[1]) > 0 && live(other.def, probes[0]) >= 200, "before: the live (spawning) field is there");
  assert.ok(probes.every(p => live(sim.def, p) === 0), "after: the live field is 0 at once, nowhere spawns from this core");
  assert.ok(spawnRate(0, "den", true) === 0 && regionCap(0) === 0 && spawnRate(before[1], "den", true) > 0, "so spawn rate and region cap are 0");
  // another sim of the same seed never feels it (the harvest ledger is the sim's own)
  assert.deepEqual(probes.map(([x, y, z]) => manaAt(other.def, x, y, z)), before, "a second sim of the same world is untouched");
  // ore and rock round the core, including cells in chunks never generated before the harvest, equal the unharvested sim's
  const w = sim.world, w2 = other.world, ore = [], ore2 = [];
  for (let k = 0; k < 400; k++) { const x = c.x - 60 + (k % 20) * 6, y = c.y - 60 + ((k / 20) | 0) * 6; for (let z = c.z - 3; z <= c.z + 3; z++) { if (x === c.x && y === c.y && z === c.z) continue; ore.push(w.mat(x, y, z)); ore2.push(w2.mat(x, y, z)); } }
  assert.deepEqual(ore, ore2, "ore and rock round the core are as generated (new chunks too)");
  assert.ok(dun && dun.rooms.length > 0, "the labyrinth itself stays");
  ok("harvest: " + HARVEST_SHARDS + " shards, cell open, field/loot/ore unchanged, spawning stopped, a second sim unaffected");
}

// ---- 5. the harvest and the choice survive a save; two runs agree ----
{
  const a = loadFixture("coreslain"), key = a.cm.pend[0], c = coreByKey(a, key);
  a.apply({ type: "core", op: "harvest", key });
  for (let i = 0; i < 120; i++) a.step();
  const json = toJSON(a), b = restore(json);
  assert.deepEqual(b.cm, a.cm, "the ledger round-trips");
  assert.equal(b.hash(), a.hash(), "a restored sim hashes the same");
  for (let i = 0; i < 100; i++) { a.step(); b.step(); }
  assert.equal(b.hash(), a.hash(), "and runs on tick for tick");
  assert.equal(manaAt(b.def, c.x + 5, c.y, c.z), manaAt(a.def, c.x + 5, c.y, c.z), "the same field after a load");
  assert.equal(liveMana(coresNear(b.def, c.x + 5, c.y, c.x + 5, c.y), c.x + 5, c.y, c.z), 0, "and the harvested core still spawns nothing after a load");
  const p = loadFixture("coreslain"), r = restore(toJSON(p));
  assert.deepEqual(r.cm.pend, p.cm.pend, "a pending choice survives a save");
  ok("save: ledger, harvest and a pending choice round-trip (hash " + a.hash() + ")");
}

// ---- 6. the delve expedition ----
{
  const sim = loadFixture("delve"), vs = adults(sim).slice(0, 3), ids = vs.map(v => v.id);
  assert.ok(!sim.apply({ type: "expedition", op: "start", kind: "delve", ids: [], core: "1,2" }) && sim.lastBlocker === "NO_TARGET", "no party, no delve");
  assert.ok(!sim.apply({ type: "expedition", op: "start", kind: "delve", ids, core: "1,2" }) && sim.lastBlocker === "NO_DUNGEON", "no labyrinth at those coordinates: NO_DUNGEON");
  assert.ok(blockerText("mine", "NO_DUNGEON").length > 5, "and the refusal has plain text");
  assert.ok(sim.apply({ type: "expedition", op: "start", kind: "delve", ids }), "a delve starts: " + sim.lastBlocker);
  const x = sim.exp.list[0];
  assert.ok(x.kind === "delve" && x.st === "work" && /ridge/.test(x.name) && x.rooms >= 8 && x.light === DELVE_LIGHT && x.deadline - x.t0 === DELVE_TIME, "a delve record: " + x.name + ", " + x.rooms + " rooms");
  assert.ok(vs.every(v => v.xp === x.id), "the members are on the expedition");
  const crew = sim.crews.list.find(q => q.id === x.cr);
  assert.ok(crew && crew.task.t === "exp", "an auto crew carries it (R6)");
  // run until the party has mapped rooms, disarmed a trap and opened a cache (capped)
  const stalls = new Set(); let t = -1, wasLit = 0;
  for (let i = 0; i < 6000 && t < 0; i++) {
    sim.step();
    if (x.stall) stalls.add(x.stall.split(":")[0]);
    if (vs.some(v => v.br)) wasLit = 1;
    if (x.mapped >= 6 && x.disarmed >= 1 && x.opened >= 1) t = i;
  }
  assert.ok(t >= 0, "within 6000 ticks: " + x.mapped + " rooms mapped, " + x.disarmed + " traps cleared, " + x.opened + " caches opened");
  assert.ok(wasLit && x.light < DELVE_LIGHT, "the brands burn only inside (light " + x.light + " of " + DELVE_LIGHT + ")");
  assert.ok(Object.keys(x.loot).length >= 1, "the party packed loot: " + JSON.stringify(x.loot));
  assert.ok(sim.chron.entries.some(e => /first to enter a labyrinth/.test(e.text)), "the chronicle: first to enter the labyrinth");
  assert.ok(sim.cm.known.length === 1, "the labyrinth is known to the map");
  const sum = crewSummary(sim, crew);
  assert.ok(sum.working === 3, "the crew summary counts them working: " + sum.line);
  // the stall summary names the trap or the monster
  assert.ok(delveStallText("TRAP:dart") === "a darts trap is in the way" && delveStallText("MONSTER:crawler") === "a cave crawler is in the way" && delveStallText("NO_PATH").length > 5, "stall wording names the trap or monster");
  x.stall = "TRAP:pit";
  assert.ok(/pit trap is in the way/.test(crewSummary(sim, crew).line), "the crew line names it: " + crewSummary(sim, crew).line);
  x.stall = "MONSTER:spitter";
  assert.ok(/spitter is in the way/.test(crewSummary(sim, crew).line), "or the monster: " + crewSummary(sim, crew).line);
  x.stall = "";
  // wounds recall the party
  const h0 = vs[0].hp; vs[0].hp = 0.4 * maxHp(vs[0], fitness(vs[0], ageDays(sim, vs[0])));
  for (let i = 0; i < 60 && x.st === "work"; i++) sim.step();
  assert.ok(x.st === "home" && x.why === "wounded" && EXP_WHY[x.why], "a wounded member turns the party back (" + x.why + "; the line is " + DELVE_RECALL_HP * 100 + "% health)");
  assert.ok(vs.every(v => !v.order || v.order.verb === "scout"), "home bound: orders are the walk home");
  ok("delve: " + x.mapped + "/" + x.rooms + " rooms, " + x.disarmed + " traps cleared, " + x.opened + " caches, loot " + JSON.stringify(x.loot) + "; stalls seen " + [...stalls].join("/") + "; recalled on wounds");
}
{
  // light running out recalls; the haul comes home; no autonomy
  const sim = loadFixture("delve"), vs = adults(sim).slice(0, 3);
  sim.apply({ type: "expedition", op: "start", kind: "delve", ids: vs.map(v => v.id) });
  const x = sim.exp.list[0];
  for (let i = 0; i < 400; i++) sim.step();
  const plant = vs.filter(v => v.hp > 0);
  x.light = 40; x.loot = { gem: 2, copper: 3 };
  const g0 = survey(sim); let t = -1;
  for (let i = 0; i < 100 && t < 0; i++) { sim.step(); if (x.st === "home") t = i; }
  assert.ok(t >= 0 && x.why === "light", "the party turns back when the brands run low (" + x.why + ")");
  for (let i = 0; i < 3500 && x.st !== "done"; i++) sim.step();
  assert.ok(x.st === "done" && /brands burned low/.test(x.rep), "the report is written: " + x.rep);
  const g1 = survey(sim), got = (s, k) => s.stock[k] + s.loose[k];
  assert.ok(got(g1, "gem") - got(g0, "gem") === 2 && got(g1, "copper") - got(g0, "copper") === 3, "the haul is in the stockpile");
  assert.ok(vs.every(v => !v.xp && !v.br), "the party is released");
  assert.ok(plant.length >= 1);
  ok("delve: recalled on light, the pack unloaded, the report: " + x.rep.slice(0, 90));
}
{
  // a monster in their way: the stall summary names it (a coreback frightens everyone within sight)
  const sim = loadFixture("delve"), vs = adults(sim).slice(0, 3);
  sim.apply({ type: "expedition", op: "start", kind: "delve", ids: vs.map(v => v.id) });
  const x = sim.exp.list[0], w = sim.world, L = vs[0];
  for (let i = 0; i < 100; i++) sim.step();
  let spot = null;
  for (let r = 1; r < 5 && !spot; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (!spot && w.isWalkable(L.x + dx, L.y + dy, L.z) && !sim.ents.at(L.x + dx, L.y + dy, L.z).length) spot = [L.x + dx, L.y + dy, L.z];
  assert.ok(spot, "a free cell beside the leader");
  const m = spawnFauna(sim, "coreback", spot[0], spot[1], spot[2]); m.mon = 1; m.hr = 24; m.home = spot.slice(); m.st = "patrol";
  let seen = "";
  for (let i = 0; i < 400 && !seen; i++) { sim.step(); if (x.stall.startsWith("MONSTER:")) seen = x.stall; }
  assert.equal(seen, "MONSTER:coreback", "the stall names the monster that frightens them");
  assert.ok(/coreback is in the way/.test(crewSummary(sim, sim.crews.list.find(q => q.id === x.cr)).line), "and the crew line says so");
  ok("delve: a coreback in the way is named in the stall summary (" + seen + ")");
}
{
  // the delve command in the page: a labyrinth a selected slime stands in is offered; the recall button works
  const sim = loadFixture("delve"), vs = adults(sim).slice(0, 3);
  const ch = delveChoices(sim, vs);
  assert.ok(ch.length === 1 && /ridge/.test(ch[0].name), "the panel offers the labyrinth they stand in: " + JSON.stringify(ch));
  assert.deepEqual(delveChoices(sim, []), [], "and nothing for a village that has seen no ruin");
  sim.apply({ type: "expedition", op: "start", kind: "delve", ids: vs.map(v => v.id), core: ch[0].key });
  for (let i = 0; i < 60; i++) sim.step();
  assert.ok(sim.apply({ type: "expedition", op: "recall" }) && sim.exp.list[0].st === "home" && sim.exp.list[0].why === "recall", "the Recall button turns it home");
  const copy = restore(toJSON(sim));
  assert.deepEqual(copy.exp.list[0].vis, sim.exp.list[0].vis, "a delve in progress survives a save");
  ok("delve: the panel offers " + ch[0].name + "; Recall; a save mid-delve");
}
// ---- 7. first person: a monster billboard is sized for what it is (7.22 screenshot: a crawler beside you filled the bottom third) ----
{
  assert.ok(FAUNA_SIZE.crawler <= 0.6 && FAUNA_SIZE.crawler < 0.9 && FAUNA_SIZE.crawler < FAUNA_SIZE.spitter && FAUNA_SIZE.spitter < FAUNA_SIZE.coreback && FAUNA_SIZE.coreback < FAUNA_SIZE.guardian && FAUNA_SIZE.guardian <= 2, "sizes follow the creature: " + JSON.stringify(FAUNA_SIZE));
  const sim = loadFixture("monsters"), cr = sim.ents.ofKind("fauna").find(e => e.sp === "crawler"), sl = adults(sim)[0];
  const a = spriteOf(cr, sim, false, {}), b = spriteOf(sl, sim, false, {});
  assert.ok(a.w === FAUNA_SIZE.crawler && a.w < 0.6 * b.w + 0.01, "a crawler billboard is " + a.w + " cells, a slime " + b.w);
  ok("fpv: crawler " + a.w + " < slime " + b.w + " cells wide");
}
console.log("delve: all passed");
