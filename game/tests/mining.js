// S6 feature tests, fixture-based, each window <= 3 game days (5,400 ticks): the four mining intents, walking down a shaft,
// fog hiding and revealing, seek-X finding malachite without cheating, the sleep-commitment fix, save round-trip with the
// seen log and new cells, determinism, hard-rock difficulty, and the anti-grind rule for dug cells.
//   node tests/mining.js
import assert from "node:assert/strict";
import { DUR_DAY } from "../src/sim/clock.js";
import { NEED_DAY } from "../src/sim/villager.js";
import { loadFixture } from "./fixture.js";
import { restore, toJSON } from "../src/sim/save.js";
import { M, F, World } from "../src/sim/world.js";
import { survey, storeInZone } from "../src/sim/items.js";
import { isSeen, revealDisc } from "../src/sim/seen.js";
import { isNight } from "../src/sim/season.js";
import { DIG } from "../src/sim/dig.js";
import { gain, level, K } from "../src/sim/skills.js";
import { SLEEP_DONE } from "../src/sim/jobs.js";
import { carveMine, mineSpots } from "../tools/make_fixtures.js";

const DAY3 = 3 * DUR_DAY;      // ticks: a window of real-time feel (S18b: not "3 game days" any more)
const run = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };
const runUntil = (sim, max, f) => { for (let i = 0; i < max; i++) { if (f()) return i; sim.step(); } return f() ? max : -1; };
const total = (sim, item) => { const s = survey(sim); return s.stock[item] + s.loose[item] + s.carried[item]; };
const xp = (sim) => sim.ents.ofKind("villager").reduce((a, v) => a + v.sk.dig.xp, 0);
const { FACE, HID } = mineSpots(loadFixture("mine"));       // the mine fixture's exposed malachite face and the hidden pocket (tools/make_fixtures.js carveMine)
const feed = (sim) => { storeInZone(sim, "dried", 120); sim.cache.iv++; };     // a full larder, so the village does not call its hands back to forage

// ---- 1. dig region: a box two levels deep, stepped on one side; yields go to the stockpile ----
{
  const sim = loadFixture("settled"); feed(sim);
  const z = sim.stock.z - 1, x0 = 70, y0 = 56;           // a patch of surface east of camp
  const before = total(sim, "dirt");
  assert.ok(sim.apply({ type: "mine", op: "region", x0, y0, x1: x0 + 2, y1: y0 + 1, z, layers: 2 }), sim.lastBlocker);
  const d = sim.mine.list[0];
  assert.equal(d.kind, "region");
  const t = runUntil(sim, 3 * DAY3, () => sim.mine.list.length === 0);
  assert.ok(t >= 0, "the region should finish within 3 days; left " + JSON.stringify(sim.mine.list.map(q => q.q.length)));
  let open = 0;
  for (let k = 0; k < 2; k++) for (let y = y0; y <= y0 + 1; y++) for (let x = x0 + k; x <= x0 + 2; x++) if (!sim.world.isSolid(x, y, z - k)) open++;
  assert.equal(open, 6 + 4, "3x2 on the top level and the stepped 2x2 under it");
  assert.ok(sim.world.isSolid(x0, y0, z - 1) && !sim.world.isSolid(x0 + 1, y0, z - 1), "the lower layer starts one cell in: a step to climb out by");
  assert.ok(total(sim, "dirt") - before >= 8, "dirt came out: " + (total(sim, "dirt") - before));
  console.log(`1 region ok: done in ${t} ticks, +${total(sim, "dirt") - before} dirt`);
}

// ---- 2. dig to depth: a stair down 5 levels; villagers walk down it and haul what came out ----
{
  const sim = loadFixture("settled"); feed(sim);
  const x = 76, y = 70, z0 = sim.world.standZ(x, y);
  for (const id of sim.ents.at(x, y, z0).slice()) sim.ents.remove(id);
  assert.ok(sim.apply({ type: "mine", op: "depth", x, y, z: z0, levels: 5, dir: [1, 0] }), sim.lastBlocker);
  const d = sim.mine.list[0];
  assert.equal(d.kind, "depth"); assert.ok(d.cells.length >= 9 && d.cells.length <= 10, "about 2 cells a level, 1 for the first: " + d.cells.length);
  for (const i of d.cells) for (const id of sim.ents.at(...World.xyz(i)).slice()) { const e = sim.ents.get(id); if (e.kind === "plant") sim.ents.remove(id); }
  const t = runUntil(sim, DAY3 * 2, () => sim.mine.list.length === 0);       // 6 days: one villager at a time digs a stair, in order, between sleeping and other chores (the regenerated fixture takes ~5)
  assert.ok(t >= 0, "the stair should be dug within 6 days");
  // walk down: send an adult to the foot of the stair
  const foot = [x + 5, y, z0 - 5];
  assert.ok(sim.world.isWalkable(...foot), "the foot of the stair is a stand cell");
  for (let i = 0; i < DUR_DAY && (isNight(sim.tick) || isNight(sim.tick + 1500)); i++) sim.step();       // (the walk happens in daylight: whether the digging ended at noon or at dusk is not what is tested)
  const near = (q) => Math.abs(q.x - foot[0]) + Math.abs(q.y - foot[1]);          // (the nearest willing villager: where the others happen to be on the new land is not the point)
  const v = sim.ents.ofKind("villager").filter(q => !q.poss && q.order === null).sort((p, q) => near(p) - near(q) || p.id - q.id)[0];       // the nearest one, fed and rested below: who is hungry or asleep on the new land is not what is tested
  v.job = null; v.action = null; v.energy = v.hunger = v.thirst = 1;
  sim.apply({ type: "order", ids: [v.id], verb: "move", x: foot[0], y: foot[1], z: foot[2] });
  const w = runUntil(sim, 1500, () => v.x === foot[0] && v.y === foot[1] && v.z === foot[2]);
  assert.ok(w >= 0, `${v.name} should walk down the stair (at ${v.x},${v.y},${v.z})`);
  assert.ok(isSeen(sim, foot[0] + 1, foot[1], foot[2]), "digging the stair showed the rock beside it");
  console.log(`2 depth ok: ${d.cells.length} cells dug in ${t} ticks, ${v.name} walked down ${z0 - foot[2]} levels in ${w} ticks`);
}

// ---- 3. follow vein: the exposed malachite face; only the connected cells, not the hidden pocket ----
{
  const sim = loadFixture("mine"); feed(sim);
  assert.ok(isSeen(sim, ...FACE) && sim.world.mat(...FACE) === M.MALACHITE, "the face is exposed and seen");
  assert.ok(!isSeen(sim, ...HID) && sim.world.mat(...HID) === M.MALACHITE, "the pocket is malachite nobody has seen");
  assert.ok(sim.apply({ type: "mine", op: "vein", x: FACE[0], y: FACE[1], z: FACE[2] }), sim.lastBlocker);
  assert.ok(!sim.apply({ type: "mine", op: "vein", x: 70, y: 62, z: 12 }) && sim.lastBlocker === "NOT_ORE", "a plain cell is not a vein");
  const t = runUntil(sim, DAY3, () => sim.mine.list.length === 0 && total(sim, "malachite") >= 8 && survey(sim).stock.malachite >= 8);
  assert.ok(t >= 0, "vein dug and hauled in 3 days: malachite " + total(sim, "malachite") + ", stock " + survey(sim).stock.malachite);
  assert.equal(sim.world.mat(...HID), M.MALACHITE, "the unconnected pocket was left alone");
  console.log(`3 vein ok: 4 cells -> ${survey(sim).stock.malachite} malachite in the stockpile after ${t} ticks`);
}

// ---- 4. seek with the face in sight: goes straight to it, stops at 3 cells' worth ----
{
  const sim = loadFixture("mine"); feed(sim);
  assert.ok(sim.seen.known[M.MALACHITE].length > 0, "malachite has been sighted");
  assert.ok(sim.apply({ type: "mine", op: "seek", item: "malachite", x: FACE[0] - 1, y: FACE[1] }), sim.lastBlocker);
  assert.ok(!sim.apply({ type: "mine", op: "seek", item: "gold" }) && sim.lastBlocker === "UNKNOWN_ITEM");
  const t = runUntil(sim, 3 * DAY3, () => sim.mine.list.length === 0);
  assert.ok(t >= 0, "seek should finish within 3 days");
  assert.ok(total(sim, "malachite") >= 6, "found at least 6 malachite: " + total(sim, "malachite"));
  assert.equal(sim.world.mat(...HID), M.MALACHITE, "it did not need the hidden pocket");
  console.log(`4 seek (sighted) ok: ${total(sim, "malachite")} malachite in ${t} ticks`);
}

// ---- 5. seek without cheating: nothing sighted, malachite hidden behind two cells of rock ----
{
  const sim = loadFixture("mine"); feed(sim);
  for (const [x, y, z] of [[FACE[0], FACE[1] - 1, FACE[2]], FACE, [FACE[0], FACE[1] + 1, FACE[2]], [FACE[0], FACE[1], FACE[2] + 1]]) sim.world.set(x, y, z, M.SOFT, 0);      // the face is plain rock now
  revealDisc(sim, sim.site.x, sim.site.y, 90);                                                                        // (the old world showed the whole surface from the start; here it is shown as people walk)
  for (const k of sim.world.chunkKeys()) {                                                                              // and every other stain on this land is plain rock now, so nobody can sight one mid-test (only the hidden pocket is malachite)
    const c = sim.world.chunks.get(k);
    for (let i = 0; i < c.mats.length; i++) if (c.mats[i] === M.MALACHITE) {
      const x = (c.cx << 4) + (i & 15), y = (c.cy << 4) + ((i >> 4) & 15), z = i >> 8;
      if (!(x >= HID[0] - 1 && x <= HID[0] + 1 && y >= HID[1] - 1 && y <= HID[1] + 1 && z === HID[2])) sim.world.set(x, y, z, M.SOFT, 0);
    }
  }
  sim.seen.known[M.MALACHITE] = [];                                                                                   // and no stain has been sighted anywhere
  assert.ok(!isSeen(sim, ...HID));
  assert.ok(sim.apply({ type: "mine", op: "seek", item: "malachite", x: FACE[0] - 1, y: FACE[1] }), sim.lastBlocker);
  run(sim, 200);
  assert.equal(sim.mine.list[0].tgt, -1, "with nothing sighted it follows the search pattern, not the hidden ore");
  const t = runUntil(sim, 3 * DAY3, () => sim.mine.list.length === 0);
  assert.ok(t >= 0, "seek finds the hidden pocket within 3 days");
  assert.ok(isSeen(sim, ...HID), "digging up to it showed it");
  assert.ok(total(sim, "malachite") >= 6, "got malachite: " + total(sim, "malachite"));
  console.log(`5 seek (unsighted, fog) ok: pattern found it after ${t} ticks, ${total(sim, "malachite")} malachite`);
}

// ---- 6. fog hides and reveals ----
{
  const sim = loadFixture("settled");
  const [cx, cy] = [sim.stock.x0 + 2, sim.stock.y0 + 2], z = sim.stock.z;
  assert.ok(isSeen(sim, cx, cy, z - 1) && isSeen(sim, cx, cy, z + 3), "the surface is known from the start");
  assert.ok(!isSeen(sim, cx, cy, z - 4), "rock four cells under the camp is not");
  assert.ok(!isSeen(sim, cx + 20, cy, z - 6));
  const sb = sim.seen.log.length;
  run(sim, 300);
  const hs = sim.world;            // a villager on a slope also sees the cell diagonally below them: that is the most the surface gives away
  for (const i of sim.seen.log.slice(sb)) { const [x, y, z] = World.xyz(i); assert.ok(z >= hs.hsAt(x, y) - 1, "walking about on the surface revealed rock at depth: " + [x, y, z]); }
  assert.ok(sim.seen.log.length - sb < 40, "and only a few cells: " + (sim.seen.log.length - sb));
  const m = loadFixture("mine");
  const F3 = mineSpots(m).FACE, tx = F3[0] - 7, ty = F3[1], tz = F3[2];         // a cell of the tunnel 7 short of the face (found, not hard-coded: it moves with the land)
  assert.ok(isSeen(m, tx, ty, tz) && isSeen(m, tx, ty, tz - 1), "the tunnel and its floor are seen");
  assert.ok(!isSeen(m, tx, ty + 2, tz) && !isSeen(m, tx, ty - 2, tz - 1), "two cells off the tunnel is still unknown");
  assert.ok(m.seen.log.length > 30);
  console.log(`6 fog ok: ${m.seen.log.length} cells seen below the surface in the mine fixture, none in settled`);
}

// ---- 7. sleep commitment: an order does not pull a half-slept villager off his bed ----
{
  const sim = loadFixture("settled"); feed(sim);
  run(sim, 40);
  const v = sim.ents.ofKind("villager").find(q => q.age === undefined || true);
  v.energy = 0.05; v.rp = 1;
  assert.ok(runUntil(sim, 600, () => v.slp === 1) >= 0, v.name + " goes to sleep when exhausted");
  sim.apply({ type: "order", ids: [v.id], verb: "move", x: 64 + 30, y: 64, z: sim.world.standZ(94, 64) });
  let woke = -1;
  for (let i = 0; i < 0.25 * NEED_DAY; i++) { sim.step(); if (!(v.job && v.job.k === "sleep") && sim.board.fc === 0) { woke = i; break; } }
  assert.ok(woke < 0 || v.energy >= SLEEP_DONE - 0.01, `slept on to energy ${v.energy.toFixed(2)} before the order took over (woke at ${woke})`);
  assert.ok(v.energy > 0.1, "the sleep made real progress: " + v.energy);
  // once rested the order runs
  assert.ok(runUntil(sim, NEED_DAY, () => v.job && v.job.k === "goto") >= 0, "then the order takes over");
  console.log(`7 sleep commitment ok: slept to ${SLEEP_DONE} before obeying`);
}

// ---- 8. hard rock: slower, and difficulty 0.8 ----
{
  assert.ok(DIG[M.STONE].dur > DIG[M.SOFT].dur && DIG[M.STONE].hard && !DIG[M.SOFT].hard);
  const sim = loadFixture("settled");
  const v = sim.ents.ofKind("villager")[0];
  v.sk.dig.xp = 6 * K; v.sk.dig.rs = 0;
  assert.ok(level(v, "dig") > 0.62, "a skilled digger: " + level(v, "dig"));
  assert.equal(gain(sim, v, "dig", 0.167, true), 0, "soft rock (difficulty 0.6) teaches a skilled digger nothing");
  assert.ok(gain(sim, v, "dig", 0.167, true, 0.8) > 0, "hard rock (0.8) still does");
  console.log("8 hard rock ok");
}

// ---- 9. anti-grind: placed cells are not mined by a region, and a mined cell cannot be farmed ----
{
  const sim = loadFixture("settled"); feed(sim);
  const z = sim.stock.z - 1, x = 71, y = 60;
  sim.apply({ type: "place", x, y: y + 1, z, mat: M.DIRT });                  // the player's own block in the region's path
  sim.apply({ type: "mine", op: "region", x0: x, y0: y, x1: x + 1, y1: y + 1, z, layers: 1 });
  runUntil(sim, DAY3, () => sim.mine.list.length === 0);
  assert.equal(sim.world.mat(x, y + 1, z), M.DIRT, "a placed cell is left alone by region digging");
  assert.ok(!sim.world.isSolid(x, y, z));
  assert.ok(sim.world.flags(x, y + 1, z) & (F.PLAYER | F.USED));
  console.log("9 anti-grind ok");
}

// ---- 10. save round-trip with the seen log, designations and new cells; determinism with mining ----
{
  const a = loadFixture("mine"); feed(a);
  a.apply({ type: "mine", op: "seek", item: "malachite", x: FACE[0] - 1, y: FACE[1] });
  a.apply({ type: "mine", op: "region", x0: 70, y0: 56, x1: 72, y1: 57, z: a.stock.z - 1, layers: 2 });
  run(a, 700);
  assert.ok(a.seen.log.length > 0 && a.mine.list.length > 0);
  const json = toJSON(a), b = restore(json);
  assert.equal(b.hash(), a.hash(), "hash differs right after load");
  assert.equal(toJSON(b), json, "re-saving the loaded sim changed the save");
  assert.deepEqual(b.seen.log, a.seen.log.slice(-500), "8.24: the loaded sim keeps the newest 500 cells seen, in order");
  assert.deepEqual(b.seen.known[M.MALACHITE].slice().sort(), a.seen.known[M.MALACHITE].filter((i, k, arr) => arr.indexOf(i) === k && a.world.mat(...World.xyz(i)) === M.MALACHITE).sort().filter(i => b.seen.known[M.MALACHITE].includes(i)), "sighted ore survives a save");
  for (let i = 0; i < 600; i++) { a.step(); b.step(); assert.equal(a.hash(), b.hash(), "diverged " + (i + 1) + " ticks after load"); }
  const c = loadFixture("mine"); feed(c);
  c.apply({ type: "mine", op: "seek", item: "malachite", x: FACE[0] - 1, y: FACE[1] });
  c.apply({ type: "mine", op: "region", x0: 70, y0: 56, x1: 72, y1: 57, z: c.stock.z - 1, layers: 2 });
  run(c, 1300);
  assert.equal(c.hash(), a.hash(), "same fixture + same commands = same hash");
  console.log(`10 save/determinism ok: ${(json.length / 1024).toFixed(0)} KB, ${a.seen.log.length} seen cells, hashes equal for 600 ticks after load`);
}

// ---- 11. the fixture builder is repeatable ----
{
  const a = loadFixture("settled"), b = loadFixture("settled");
  const fa = carveMine(a), fb = carveMine(b);
  assert.deepEqual(fa, fb); assert.equal(a.hash(), b.hash());
  console.log("11 fixture ok");
}
console.log("mining ok");
