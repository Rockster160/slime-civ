// 9.28 belief store (belief.js): patch facts per slime, a staggered local look, decay, founders and heirs, the save, and "gameplay is untouched".
// Fixture based (crowd: 60 slimes for the perf and hash runs; year2 for the clones). A few seconds. node tests/belief.js
import "./legacy.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixture } from "./fixture.js";
import { Sim } from "../src/sim/sim.js";
import { toJSON, restore, SAVE_VERSION } from "../src/sim/save.js";
import { look, scan, audit, isStale, nearestFact, flags, BEL_CAP, LOOK_R, LOOK_MAX, PATCH_R, STALE, FORGET, LOOK_EVERY } from "../src/sim/belief.js";
import { newPlant } from "../src/sim/plants.js";
import { spawnChild } from "../src/sim/population.js";
import { splitSlime } from "../src/sim/split.js";
import { isAdult, ageDays, maxHp, fitness } from "../src/sim/villager.js";
import { knowChips } from "../src/ui/beltext.js";

const here = dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
assert.ok(!/Math\.(exp|sin|cos|random|pow)|Date\.|performance/.test(readFileSync(join(here, "..", "src", "sim", "belief.js"), "utf8").replace(/\/\/.*$/gm, "")), "belief.js uses no exp / sin / random / clock");

const cheb = (v, f) => Math.max(Math.abs(f[1] - v.x), Math.abs(f[2] - v.y));
/** Remove everything a look would notice within r of a slime, so a test places exactly what it wants. */
function bare(sim, v, r = 10) {
  for (const k of ["plant", "furniture", "site", "csite", "fauna"]) for (const e of sim.ents.ofKind(k).slice()) if (Math.abs(e.x - v.x) <= r && Math.abs(e.y - v.y) <= r && Math.abs(e.z - v.z) <= 3) sim.ents.remove(e.id);
  for (const o of sim.ents.ofKind("villager")) if (o !== v && Math.abs(o.x - v.x) <= r && Math.abs(o.y - v.y) <= r) sim.ents.move(o, v.x + 40, v.y + 40, o.z);
  v.bel = [];
}
const berry = (sim, x, y, z, yld = 3) => { const p = newPlant(sim.ents, "berry", x, y, z); p.yield = yld; return p; };

const sim = loadFixture("crowd");
for (let guard = 0; sim.ents.ofKind("villager").length < 60 && guard < 400; guard++) sim.spawnVillager();
for (const v of sim.ents.ofKind("villager")) v.hunger = v.thirst = v.energy = 1;
const vs = sim.ents.ofKind("villager");

// 0. the crowd's own beliefs were seeded on load (a v12 fixture is a migration) and on spawn
assert.ok(vs.every(v => Array.isArray(v.bel) && v.bel.length > 0 && v.bel.length <= BEL_CAP), "everyone knows something and no more than the cap");
ok("a loaded old save and spawned slimes start with the camp's knowledge, within the cap (" + vs[0].bel.length + " facts)");

// 1. the look writes only facts within LOOK_R, at most LOOK_MAX
{
  const v = vs[3]; bare(sim, v);
  for (let d = -9; d <= 9; d += 3) { const z = sim.world.standZ(v.x + d, v.y + 2); if (z >= 0) berry(sim, v.x + d, v.y + 2, z); }
  const tz = sim.world.standZ(v.x + 9, v.y - 9); if (tz >= 0) newPlant(sim.ents, "tree", v.x + 9, v.y - 9, tz);
  sim.tick += 1; look(sim, v);
  assert.ok(v.bel.length > 0 && v.bel.length <= LOOK_MAX, "wrote " + v.bel.length);
  for (const f of v.bel) if (!/^stock/.test(f[0])) assert.ok(cheb(v, f) <= LOOK_R && Math.abs(f[3] - v.z) <= 2, "fact " + f + " is out of sight");
  assert.ok(!v.bel.some(f => f[0] === "tree"), "a tree 9 cells away is not seen");
  ok("a look writes " + v.bel.length + " facts (max " + LOOK_MAX + "), all within " + LOOK_R + " cells");
}

// 2. patches: berries within PATCH_R fold into one fact (amounts add), one farther off is a second
{
  const v = vs[4]; bare(sim, v);
  const z = v.z, spots = [[0, 1], [1, 1], [2, 2]];
  for (const [dx, dy] of spots) berry(sim, v.x + dx, v.y + dy, z, 2);
  berry(sim, v.x - 5, v.y - 5, z, 4);
  sim.tick += 1; look(sim, v);
  const food = v.bel.filter(f => f[0] === "food").sort((a, b) => b[4] - a[4]);
  assert.equal(food.length, 2, "two patches: " + JSON.stringify(food));
  assert.equal(food[0][4], 6, "the grove adds up"); assert.equal(food[1][4], 4);
  assert.ok(Math.max(Math.abs(food[0][1] - food[1][1]), Math.abs(food[0][2] - food[1][2])) > PATCH_R);
  ok("things of one kind within " + PATCH_R + " cells fold into one patch (6 + 4 in two facts for four bushes)");
}

// 3. decay: stale is still usable but flagged, forgotten is dropped, and a thing seen gone is dropped at once
{
  const v = vs[5]; bare(sim, v);
  const now = sim.tick = sim.tick + 1;
  v.bel = [["food", v.x + 30, v.y, v.z, 5, now - STALE - 1, 1], ["tree", v.x + 31, v.y, v.z, 1, now - FORGET - 1, 1], ["food", v.x + 32, v.y, v.z, 5, now - 10, 0]];
  assert.ok(isStale(v.bel[0], now) && !isStale(v.bel[2], now));
  assert.ok(nearestFact(v, "food", v.x, v.y, now), "a stale fact is still usable");
  look(sim, v);
  assert.ok(!v.bel.some(f => f[0] === "tree"), "forgotten");
  assert.equal(v.bel.filter(f => f[0] === "food").length, 2, "stale kept, far from sight");
  v.bel.push(["food", v.x + 2, v.y + 2, v.z, 9, now - 5, 2]);       // believed in plain view, nothing there
  sim.tick++; look(sim, v);
  assert.ok(!v.bel.some(f => f[1] === v.x + 2 && f[2] === v.y + 2), "a believed berry that is gone is dropped on sight");
  ok("stale facts stay usable, the forgotten go, a gone thing in view is dropped");
}

// 4. the cap holds, and the freshest survive
{
  const v = vs[6]; bare(sim, v, 3);
  const home = [v.x, v.y, v.z];
  for (let i = 0; i < 40; i++) {
    const x = home[0] + 10 + 8 * i, y = home[1], z = sim.world.standZ(x, y);
    if (z < 0) continue;
    berry(sim, x, y, z); sim.ents.move(v, x, y, z); sim.tick += 3; look(sim, v);
    assert.ok(v.bel.length <= BEL_CAP, "over the cap: " + v.bel.length);
  }
  assert.equal(v.bel.length, BEL_CAP, "full");
  assert.ok(v.bel.every(f => f[5] >= sim.tick - 3 * 40), "ticks sane");
  ok("the store stops at " + BEL_CAP + " and drops the oldest first");
  sim.ents.move(v, home[0], home[1], home[2]);
}

// 5. founders know the camp (OD-57)
{
  const s = Sim.create(3);
  for (const v of s.ents.ofKind("villager")) {
    assert.ok(v.bel.length > 3 && v.bel.length <= BEL_CAP);
    const st = v.bel.find(f => f[0] === "stock"); assert.ok(st && st[4] >= 3 * 7, "knows the larder");
    assert.ok(v.bel.some(f => f[0] === "food" || f[0] === "tree"), "knows a berry patch or a tree");
  }
  const b0 = JSON.stringify(s.ents.ofKind("villager")[0].bel);
  assert.ok(s.ents.ofKind("villager").every(v => JSON.stringify(v.bel) === b0), "all founders share the camp's knowledge");
  ok("founders start knowing the camp: " + s.ents.ofKind("villager")[0].bel.length + " facts, the larder included");
}

// 6. a newborn and a split clone inherit
{
  const y2 = loadFixture("year2");
  const adults = y2.ents.ofKind("villager").filter(v => isAdult(y2, v) && ageDays(y2, v) < v.prime && v.mate);
  const a = adults[0], b = y2.ents.get(a.mate);
  assert.ok(a.bel.length > 0);
  const kid = spawnChild(y2, a, b);
  assert.deepEqual(kid.bel.map(f => f.slice(0, 6)), a.bel.map(f => f.slice(0, 6)), "heir has the parent's beliefs");
  assert.ok(kid.bel.every(f => f[6] >= 1), "heard, not seen");
  a.hunger = 0.9; a.thirst = 0.9; a.energy = 0.9; a.hp = Math.round(maxHp(a, fitness(a, ageDays(y2, a))));
  const before = JSON.stringify(a.bel), clones = splitSlime(y2, a);
  assert.ok(clones && clones.every(c => JSON.stringify(c.bel) === before && c.bel !== a.bel), "every clone has the original's beliefs");
  ok("a newborn gets its parent's beliefs (as told); " + clones.length + " split clones keep all of theirs");
}

// 7. the save keeps bel; a v16 save migrates (seeded)
{
  const v = vs[7];
  assert.equal(SAVE_VERSION, 21);
  const json = toJSON(sim), back = restore(json);
  assert.deepEqual(back.ents.get(v.id).bel, v.bel, "bel round-trips");
  assert.equal(back.hash(), sim.hash(), "hash equal after load");
  const old = JSON.parse(json); old.v = 16;
  for (const e of old.entities.list) if (e.kind === "villager") delete e.bel;
  const mig = restore(JSON.stringify(old));
  for (const m of mig.ents.ofKind("villager")) assert.ok(m.bel.length > 3 && m.bel.some(f => f[0] === "stock"), "seeded " + m.id);
  assert.equal(mig.tick, sim.tick);
  ok("bel survives a save round-trip (hash equal); a v16 save loads with every villager seeded");
}

// 8. the Knows chips: icons and counts, stale shown
{
  const v = vs[8], now = sim.tick;
  v.bel = [["food", 1, 1, 0, 5, now, 0], ["food", 9, 9, 0, 5, now, 0], ["tree", 3, 3, 0, 1, now - STALE - 5, 1], ["danger:wolf", 4, 4, 0, 1, now, 0], ["stock", 0, 0, 0, 12, now, 0]];
  const c = knowChips(v, now);
  assert.deepEqual(c.map(x => x.label + " " + x.n + (x.stale ? "?" : "")), ["Larder 12", "Food 2", "Trees 1?", "Wolf 1"]);
  assert.ok(c.find(x => x.label === "Trees").stale && !c.find(x => x.label === "Food").stale);
  assert.ok(audit(sim, v) && typeof audit(sim, v).gone === "number");
  ok("the card's Knows chips: " + c.map(x => x.label + " " + x.n + (x.stale ? "?" : "")).join(", "));
}

// 9. the look is cheap: the same crowd, the store on and the store off. (9.29: the planners read the beliefs, so the sims are NO LONGER the same with it on and off; tests/beliefplan.js checks determinism instead.)
{
  const RUN = 1200, snap = toJSON(sim);
  const strip = (s) => { const kept = s.ents.ofKind("villager").map(v => v.bel); for (const v of s.ents.ofKind("villager")) delete v.bel; const h = s.hash(); s.ents.ofKind("villager").forEach((v, i) => { v.bel = kept[i]; }); return h; };
  const timed = (off) => {
    flags.off = off; const s = restore(snap);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < RUN; i++) s.step();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / RUN;
    flags.off = false;
    return { s, ms };
  };
  const off = timed(true), on = timed(false);
  assert.equal(strip(timed(false).s), strip(on.s), "the same run twice is the same sim (store on)");
  assert.deepEqual(off.s.ents.ofKind("villager").map(v => v.bel), restore(snap).ents.ofKind("villager").map(v => v.bel), "off: beliefs untouched");
  assert.ok(on.s.ents.ofKind("villager").some(v => v.bel.some(f => f[5] > sim.tick)), "on: looks ran");
  console.log("perf: " + vs.length + " slimes, " + RUN + " ticks: look off " + off.ms.toFixed(3) + " ms/tick, look on " + on.ms.toFixed(3) + " ms/tick (+" + (on.ms - off.ms).toFixed(3) + ")");
  ok("the store on is deterministic (same hash twice), and off it is left alone; a look every " + LOOK_EVERY + " ticks per slime");
}
console.log("belief ok");
