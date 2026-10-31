// 9.33 learning by doing and seeing (inspire.js ORDER_XP, skills.js ordered, belief.js seeIdea, knowledge.js setIdea / tellIdeas, discovery.js ideaX). Fixture based, a few seconds.   node tests/ideas.js
//   an ordered slime learns faster than an unordered one; ordered work makes the same memories; seeing a hide teepee gives an idea (and a hearth, through data) and the try is likelier;
//   an idea never passes the cap without practice and never makes the craft "known"; a chat passes it at half strength; practice turns it into a skill (chronicle); save round trip; determinism.
import "./legacy.js";
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { toJSON, restore, SAVE_VERSION } from "../src/sim/save.js";
import { M } from "../src/sim/world.js";
import { gain } from "../src/sim/skills.js";
import { INSPIRE, ORDER_XP } from "../src/sim/inspire.js";
import { look } from "../src/sim/belief.js";
import { famOf, ideaOf, can, setFam, grant, IDEA_CAP, DISCOVER_FAM, WITNESS_FAM, IDEA_GAP } from "../src/sim/knowledge.js";
import { gossip } from "../src/sim/notices.js";
import { discoveryOdds, tinkerCandidates } from "../src/sim/discovery.js";
import { isAdult } from "../src/sim/villager.js";
import { storeInZone } from "../src/sim/items.js";
import { knowChips } from "../src/ui/beltext.js";
import { BMAT } from "../src/sim/build.js";

const t00 = Date.now();
let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v) && v.slp === 0);
const calm = (v) => { v.bel = []; v.carry = null; v.order = null; v.bad = []; v.job = null; v.action = null; v.hunger = v.thirst = v.energy = v.warm = v.mood = 1; v.par = []; v.gp = []; v.rel = []; v.mate = 0; };
const put = (sim, v, x, y) => {
  for (let r = 0; r < 8; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const z = sim.world.standZ(x + dx, y + dy);
    if (z >= 0 && !sim.world.isSolid(x + dx, y + dy, z)) { sim.ents.move(v, x + dx, y + dy, z); return z; }
  }
  assert.fail("no ground near " + x + "," + y);
};
/** A little teepee of hide wall cells on the ground beside (x, y), made of the same cells a blueprint stamps. */
function teepee(sim, x, y) {
  const z = sim.world.standZ(x, y);
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]]) sim.world.set(x + dx, y + dy, z, BMAT.hide.id, 0);
}
const noOne = (sim, c) => { for (const v of sim.ents.ofKind("villager")) if (v.fam) delete v.fam[c]; sim.cache.kn = null; };
const look3 = (sim, v) => { for (let i = 0; i < 3; i++) { sim.tick += IDEA_GAP; delete v.bel.lt; look(sim, v); } };

// 1. an ordered slime gains more XP than the same slime unordered; a possessed one gains the most
{
  const sim = loadFixture("settled"), v = adults(sim)[0];
  const xp = (job, poss) => { v.sk.dig.xp = 0; v.sk.dig.wk = 0; v.job = job; v.poss = poss; const g = gain(sim, v, "dig", 4, true); v.poss = 0; return g; };
  const plain = xp({ c: "standing", k: "mine" }, 0), ordered = xp({ c: "order", k: "mine" }, 0), crew = xp({ c: "standing", k: "mine", cw: 1 }, 0), poss = xp({ c: "order", k: "mine" }, 1);
  assert.ok(plain > 0 && ordered > plain && crew > plain, "an order or a crew task teaches more");
  assert.ok(Math.abs(ordered / plain - (1 + ORDER_XP)) < 1e-3, "by ORDER_XP");
  assert.ok(ORDER_XP > 0 && ORDER_XP <= INSPIRE.xp * 0.6 && poss > ordered, "smaller than the possessed bonus");
  const other = adults(sim)[1];
  other.job = null; other.sk.dig.xp = 0; other.sk.dig.wk = 0;
  assert.equal(gain(sim, other, "dig", 4, true) > 0, true);
  ok("ordered work teaches x" + (ordered / plain).toFixed(3) + " (crew task the same), possessed x" + (poss / plain).toFixed(3) + ", a neighbour with no order x1");
}

// 2. ordered work produces the same memories (feel() sits at the choke points, not behind possession): an ordered dig into flint
{
  const sim = loadFixture("settled"), [a, b] = adults(sim);
  for (const o of sim.ents.ofKind("villager").slice()) if (o !== a) sim.ents.remove(o.id);
  calm(a); a.mem = []; a.epi = [];
  const z = put(sim, a, 70, 58), cx = a.x + 1, cy = a.y;
  sim.world.set(cx, cy, z - 1, M.FLINT, 0); sim.world.set(cx, cy, z, M.AIR, 0);
  sim.cache.iv++;
  storeInZone(sim, "dried", 120);
  assert.ok(sim.apply({ type: "order", ids: [a.id], verb: "dig", x: cx, y: cy, z: z - 1 }), sim.lastBlocker);
  let seenOrder = false;
  for (let i = 0; i < 1500 && !(a.mem || []).some(s => s[0] === "ore"); i++) { sim.step(); if (a.job && a.job.c === "order") seenOrder = true; }
  assert.ok(seenOrder, "the dig ran as an ORDER-class job");
  assert.ok((a.mem || []).some(s => s[0] === "ore" && s[3] > 0), "the ordered dig left a memory of ore: " + JSON.stringify(a.mem));
  ok("an ordered dig ran as an order and left a memory of ore");
}

// 3. seeing a teepee gives an idea; one who never saw it has none; furniture maps through data too
{
  const sim = loadFixture("settled"), [a, b, c] = adults(sim);
  for (const o of sim.ents.ofKind("villager").slice()) if (![a, b, c].includes(o)) sim.ents.remove(o.id);
  for (const v of [a, b, c]) calm(v);
  noOne(sim, "HIDE_WORKING");
  const x = a.x + 8, y = a.y + 8;
  teepee(sim, x, y);
  put(sim, a, x + 1, y + 3);                         // in sight, 2-3 cells off
  put(sim, c, a.x + 8, a.y - 20);                    // far away: never sees it
  look3(sim, a); look3(sim, c);
  assert.ok(ideaOf(a, "HIDE_WORKING") > 0, "the slime that saw the teepee has an idea of hide working");
  assert.equal(ideaOf(c, "HIDE_WORKING"), 0, "the one that never saw it has none");
  assert.equal(famOf(a, "HIDE_WORKING"), 0, "an idea is not a familiarity");
  assert.ok(!can(sim, "HIDE_WORKING"), "and the village does not know the craft");
  assert.ok(ideaOf(a, "HIDE_WORKING") <= IDEA_CAP && IDEA_CAP < WITNESS_FAM && WITNESS_FAM < DISCOVER_FAM);
  // more likely to try it: the same tinker pool, hide on the shelf
  storeInZone(sim, "hide", 4); sim.cache.iv++; sim.cache.tk = null;
  const pool = tinkerCandidates(sim);
  const odds = (v) => discoveryOdds(sim, "HIDE_WORKING", v);
  if (pool.some(q => q.row === "HIDE_WORKING")) {
    assert.ok(odds(a) > odds(c), "the slime that saw a teepee tries it first (" + odds(a).toFixed(3) + " vs " + odds(c).toFixed(3) + ")");
    ok("a slime that saw a teepee has idea " + ideaOf(a, "HIDE_WORKING") + ", the one that did not has none; its try is x" + (odds(a) / odds(c)).toFixed(2) + " likelier");
  } else {
    assert.ok(false, "no hide working candidate in the pool: " + pool.map(q => q.row).join(","));
  }
  // chips: a faded craft icon with "?"
  const chip = knowChips(a, sim.tick).find(q => /hide/.test(q.label));
  assert.ok(chip && chip.icon === "craft" && chip.stale, "the card shows the idea as a faded chip");
  assert.ok(!knowChips(c, sim.tick).some(q => /hide/.test(q.label)));
  // furniture: a hearth seen by one who lacks firecraft
  noOne(sim, "FIRE_TENDING"); b.bel = [];
  const hz = put(sim, b, a.x - 12, a.y); sim.ents.add("furniture", { f: "hearth", x: b.x + 2, y: b.y, z: hz });
  sim.cache.iv++; look3(sim, b);
  assert.ok(ideaOf(b, "FIRE_TENDING") > 0, "a hearth seen gives an idea of firecraft (furniture -> craft through PLACE_NEEDS)");
  ok("a hearth maps to firecraft through the same data; the chip shows craft icon + ? (faded)");
}

// 4. repeat sightings and closer looks raise it, never past the cap, never to a skill
{
  const sim = loadFixture("settled"), [a, b] = adults(sim);
  for (const o of sim.ents.ofKind("villager").slice()) if (o !== a && o !== b) sim.ents.remove(o.id);
  calm(a); calm(b); noOne(sim, "HIDE_WORKING");
  const x = a.x + 8, y = a.y + 8; teepee(sim, x, y);
  put(sim, a, x + 1, y + 5);                         // far edge of the look
  put(sim, b, x + 1, y + 2);                         // close
  look3(sim, a); look3(sim, b);
  const far = ideaOf(a, "HIDE_WORKING"), close = ideaOf(b, "HIDE_WORKING");
  assert.ok(close > far && far > 0, "a closer look gives more (" + close + " vs " + far + ")");
  const hist = [far];
  for (let i = 0; i < 40; i++) { look3(sim, a); hist.push(ideaOf(a, "HIDE_WORKING")); }
  assert.ok(hist.every((f, i) => i === 0 || f >= hist[i - 1]) && hist[hist.length - 1] > far, "repeat sightings raise it");
  assert.equal(hist[hist.length - 1], IDEA_CAP, "to the cap");
  assert.equal(Math.max(...hist), IDEA_CAP, "never past it");
  assert.equal(famOf(a, "HIDE_WORKING"), 0, "and never a skill without practice");
  // a sighting inside the gap does not count twice
  look3(sim, b); const f0 = ideaOf(b, "HIDE_WORKING"); delete b.bel.lt; sim.tick += 1; look(sim, b);
  assert.equal(ideaOf(b, "HIDE_WORKING"), f0, "two looks inside IDEA_GAP count once");
  // setFam with how saw clamps, and watching someone build (WITNESS_FAM) is stronger
  assert.equal(setFam(sim, b, "CORDAGE", 0.9, { kind: "saw" }), true); assert.equal(ideaOf(b, "CORDAGE"), IDEA_CAP);
  assert.equal(b.fam.CORDAGE, undefined);
  ok("closer looks and repeats raise an idea to IDEA_CAP " + IDEA_CAP + " and no further; no practice, no skill");
}

// 5. a chat passes an idea at half strength, only below the cap; practice turns it into a skill and the chronicle says so once
{
  const sim = loadFixture("settled"), [a, b, c] = adults(sim);
  for (const o of sim.ents.ofKind("villager").slice()) if (![a, b, c].includes(o)) sim.ents.remove(o.id);
  for (const v of [a, b, c]) calm(v);
  noOne(sim, "HIDE_WORKING");
  setFam(sim, a, "HIDE_WORKING", 0.1, { kind: "saw" });
  gossip(sim, a, b);
  assert.equal(ideaOf(b, "HIDE_WORKING"), 0.05, "half of 0.1");
  gossip(sim, b, c);
  assert.equal(ideaOf(c, "HIDE_WORKING"), 0.025, "halved again down the line");
  setFam(sim, a, "HIDE_WORKING", 0.9, { kind: "saw" });
  gossip(sim, a, c);
  assert.ok(ideaOf(c, "HIDE_WORKING") <= IDEA_CAP / 2 + 1e-9, "a told idea is at most half the cap");
  assert.equal(famOf(b, "HIDE_WORKING"), 0, "no skill from a chat");
  const lines = () => sim.chron.entries.filter(e => e && e.data && e.data.how === "idea").length;
  setFam(sim, b, "HIDE_WORKING", DISCOVER_FAM, { kind: "discover", row: "HIDE_WORKING" });
  assert.equal(ideaOf(b, "HIDE_WORKING"), 0, "once it is a skill the idea is gone");
  assert.ok(!b.idea, "and the field with it");
  assert.equal(lines(), 1, "the chronicle notes an idea becoming a skill");
  setFam(sim, c, "HIDE_WORKING", DISCOVER_FAM, { kind: "witness", row: "HIDE_WORKING" });
  assert.equal(lines(), 1, "the first time only");
  ok("a chat passes an idea at half strength (0.1 -> 0.05 -> 0.025), the cap holds; an idea turned skill is chronicled once");
}

// 6. save round trip and determinism
{
  const run = () => {
    const sim = loadFixture("settled"), [a] = adults(sim);
    for (const o of sim.ents.ofKind("villager").slice()) if (o !== a) sim.ents.remove(o.id);
    calm(a); noOne(sim, "HIDE_WORKING");
    teepee(sim, a.x + 6, a.y + 6); put(sim, a, a.x + 7, a.y + 9);
    for (let i = 0; i < 1500; i++) sim.step();
    return sim;
  };
  const s1 = run(), s2 = run();
  assert.equal(JSON.stringify(s1.ents.ofKind("villager").map(v => [v.id, v.x, v.y, v.idea || 0, v.sk])), JSON.stringify(s2.ents.ofKind("villager").map(v => [v.id, v.x, v.y, v.idea || 0, v.sk])), "two runs agree");
  assert.ok(s1.ents.ofKind("villager")[0].idea, "the slime formed an idea while it lived near the teepee");
  const text = toJSON(s1), back = restore(text);
  assert.deepEqual(back.ents.ofKind("villager")[0].idea, s1.ents.ofKind("villager")[0].idea, "the idea survives a save");
  assert.ok(SAVE_VERSION >= 19);
  ok("deterministic over 1500 ticks; the idea round-trips through a save (SAVE_VERSION " + SAVE_VERSION + ")");
}
console.log("ideas: " + n + " checks in " + (Date.now() - t00) + " ms");
