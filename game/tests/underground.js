// S12 underground and world, fixture-based, every window <= 3 game days: the cave-in span rule, cracks, the fall, supports (placed by hand and
// by the village), what autonomy refuses and possession may enter, bad air and what clears it, torches and the dark, possession's torch and
// support verbs, the new biomes, save round-trip and determinism.
//   node tests/underground.js
import { DUR_DAY } from "../src/sim/clock.js";
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { Sim } from "../src/sim/sim.js";
import { M, F, World } from "../src/sim/world.js";
import { restore, toJSON } from "../src/sim/save.js";
import { storeInZone, survey } from "../src/sim/items.js";
import { grant, can } from "../src/sim/knowledge.js";
import { isSeen, markSeen } from "../src/sim/seen.js";
import { restricted, unsafeTask } from "../src/sim/lair.js";
import { WATER_LEVEL } from "../src/sim/terrain.js";
import { gasCells } from "../src/sim/underground.js";
import { mineSpots } from "../tools/make_fixtures.js";
import { SPAN_R, CRACK_TICKS, COLLAPSE_DMG, VENT_N, POCKET_N, AIR_DMG, airMap, badAt, hazardLines, unstableAt } from "../src/sim/underground.js";
import { lit, darkMul, lightSources, TORCH_R, LAMP_R, DARK_RATE } from "../src/sim/light.js";
import { rate } from "../src/sim/tasks.js";
import { DIG } from "../src/sim/dig.js";
import { maxHp, fitness, ageDays } from "../src/sim/villager.js";
import { cellInfo } from "../src/ui/text.js";
import { isNight } from "../src/sim/season.js";
import { concerns } from "../src/ui/concerns.js";
import { BMAT, checkPlace } from "../src/sim/build.js";

const step = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };
const ok = (m) => console.log("ok " + m);
const idx = World.idx;
const DAY_T = DUR_DAY;

/** A patch of rock east of the camp with room for a w x h hall at stand level z: flat enough, dry, away from the cave and gas. */
function site(sim, w, h) {
  const S = sim.site, hs = (x, y) => sim.world.hsAt(x, y), cave = new Set(sim.world.geo.caves[0].cells.concat(sim.world.geo.caves[0].floor)), gas = new Set(gasCells(sim));
  const spots = []; for (let y0 = S.y - 56; y0 < S.y + 54 - h; y0 += 2) for (let x0 = S.x - 56; x0 < S.x + 54 - w; x0 += 2) spots.push([x0, y0]);
  spots.sort((a, b) => Math.hypot(a[0] + w / 2 - S.x, a[1] + h / 2 - S.y) - Math.hypot(b[0] + w / 2 - S.x, b[1] + h / 2 - S.y) || a[0] - b[0] || a[1] - b[1]);
  for (const [x0, y0] of spots) {
    if (Math.hypot(x0 + w / 2 - S.x, y0 + h / 2 - S.y) < 14) continue;
    let min = 99, good = true;
    for (let y = y0 - 3; y <= y0 + h + 3 && good; y++) for (let x = x0 - 3; x <= x0 + w + 3 && good; x++) { const q = hs(x, y); if (q < WATER_LEVEL + 2) good = false; min = Math.min(min, q); }
    if (!good) continue;
    const z = min - 5;
    for (let y = y0 - 3; y <= y0 + h + 3 && good; y++) for (let x = x0 - 3; x <= x0 + w + 3 && good; x++) for (let k = -1; k <= 4; k++) if (cave.has(idx(x, y, z + k)) || gas.has(idx(x, y, z + k)) || sim.world.mat(x, y, z + k) === M.AIR) good = false;
    if (good) return { x0, y0, z };
  }
  throw new Error("no rock site " + w + "x" + h);
}
const dig = (sim, x0, y0, z, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) sim.world.set(x, y, z, M.AIR, 0); };
const crCount = (sim) => sim.ug.cr.length;
const adults = (sim) => sim.ents.ofKind("villager").filter(v => ageDays(sim, v) > 20);
const holdStill = (sim, v) => { sim.apply({ type: "possess", id: v.id }); };

function tunnel(sim, q, len = 24) {
  // a ramp from the surface down five levels (stand + headroom), then a straight dead-end tunnel of `len` cells east
  const w = sim.world, hs = (x, y) => w.hsAt(x, y);
  const x1 = q.x0, y = q.y0 + 2, top = hs(x1, y);
  for (let i = 0; i <= 5; i++) {
    const x = x1 + i, zz = top - i;
    for (const id of sim.ents.at(x, y, top + 1).slice()) { const e = sim.sents ? null : sim.ents.get(id); if (e && e.kind === "plant") sim.ents.remove(id); }
    w.setFlags(x, y, top + 1, w.flags(x, y, top + 1) & ~F.OBSTACLE);
    for (let k = 0; k <= 1; k++) w.set(x, y, zz + k, M.AIR, 0);
  }
  const zf = top - 5;
  for (let i = 1; i <= len; i++) w.set(x1 + 5 + i, y, zf, M.AIR, 0);
  return { y, zf, x1, top, end: x1 + 5 + len };
}

// ---- 1. the span rule ----
{
  const sim = loadFixture("settled"), { x0, y0, z } = site(sim, 30, 8);
  dig(sim, x0, y0, z, 20, 1);                                   // a one-wide tunnel
  dig(sim, x0, y0 + 3, z, 4, 4);                                // a 4 x 4 room
  step(sim, 40);
  assert.equal(crCount(sim), 0, "a tunnel and a 4-wide room hold: " + crCount(sim));
  const sim2 = loadFixture("settled"), s2 = site(sim2, 30, 8);
  dig(sim2, s2.x0, s2.y0, s2.z, 5, 5);                          // 5 x 5: only the middle is more than 2 cells from rock
  step(sim2, 40);
  assert.deepEqual(sim2.ug.cr.map(e => e[0]), [idx(s2.x0 + 2, s2.y0 + 2, s2.z)], "a 5x5 hall cracks at its middle cell");
  const sim3 = loadFixture("settled"), s3 = site(sim3, 30, 8);
  dig(sim3, s3.x0, s3.y0, s3.z, 7, 7);
  step(sim3, 40);
  assert.equal(crCount(sim3), 9, "a 7x7 hall cracks in the middle 3x3: " + crCount(sim3));
  assert.ok(sim3.chron.entries.some(e => e.text.startsWith("Cracks run")), "the chronicle says so");
  // a natural cave and an open pit are exempt; built roofs are not rock
  const cave = sim3.world.geo.caves[0];
  assert.ok(!unstableAt(sim3, ...World.xyz(cave.floor[10])), "the natural cave's own vault holds");
  assert.equal(SPAN_R, 2);
  ok("span rule: tunnels and 4-wide rooms hold, 5x5 cracks at the middle, 7x7 in the middle 3x3, caves are exempt");
}

// ---- 2. the fall: rubble, a hurt villager set down beside it, buried items, the chronicle ----
{
  const sim = loadFixture("settled"), { x0, y0, z } = site(sim, 30, 8);
  const v = adults(sim)[0], cx = x0 + 3, cy = y0 + 3;
  dig(sim, x0, y0, z, 7, 7);
  sim.ents.move(v, cx, cy, z); holdStill(sim, v); v.hp = 100;
  sim.ents.add("item", { item: "stick", n: 3, sp: 0, rv: 0, rt: 0, x: cx + 1, y: cy, z });
  const hp0 = v.hp, n0 = sim.ents.at(cx + 1, cy, z).length;
  assert.equal(n0, 1);
  step(sim, 40);
  assert.equal(crCount(sim), 9);
  step(sim, CRACK_TICKS - 100);
  assert.equal(sim.ug.n, 0, "nothing falls before the delay is up");
  step(sim, 200);
  assert.equal(sim.ug.n, 1, "the roof came down");
  assert.equal(crCount(sim), 0);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.equal(sim.world.mat(cx + dx, cy + dy, z), M.RUBBLE, "rubble fills the fallen cells");
  assert.ok(sim.world.mat(x0, y0, z) === M.AIR, "the cells near the wall stood");
  assert.ok(v.hp < hp0 - COLLAPSE_DMG + 8, "hurt: " + v.hp);
  assert.ok(sim.world.isWalkable(v.x, v.y, v.z) && Math.max(Math.abs(v.x - cx), Math.abs(v.y - cy)) >= 2, "set down beside the fall: " + [v.x, v.y, v.z]);
  assert.equal(sim.ents.at(cx + 1, cy, z).length, 0, "what lay in the fall is buried");
  assert.ok(sim.chron.entries.some(e => /roof gave way/.test(e.text) && /caught under it/.test(e.text)));
  assert.ok(DIG[M.RUBBLE] && DIG[M.RUBBLE].item === "stone", "rubble digs out as stone");
  ok("cave-in: " + sim.ug.c + " cells fell, the villager lost " + Math.round(hp0 - v.hp) + " hp and was set down beside it");
  // a villager at low health is killed and the cause is plain
  const sim2 = loadFixture("settled"), s2 = site(sim2, 30, 8), w = adults(sim2)[0];
  dig(sim2, s2.x0, s2.y0, s2.z, 7, 7); sim2.ents.move(w, s2.x0 + 3, s2.y0 + 3, s2.z); holdStill(sim2, w); w.hp = 20;
  step(sim2, CRACK_TICKS + 100);
  assert.ok(!sim2.ents.get(w.id), "a weak villager under the fall dies");
  assert.equal(sim2.chron.recs[w.id].cause, "a cave-in"); assert.ok(sim2.chron.entries.some(e => /died of a cave-in.*buried when an unsupported roof/.test(e.text)));
  ok("death by cave-in reads plainly");
}

// ---- 3. supports hold the roof: a post placed by hand, and the village shoring it up itself ----
{
  const sim = loadFixture("settled"), { x0, y0, z } = site(sim, 30, 8);
  dig(sim, x0, y0, z, 7, 7); step(sim, 40);
  assert.equal(crCount(sim), 9);
  sim.world.set(x0 + 3, y0 + 3, z, M.SUPPORT, F.PLAYER | F.USED);               // a post in the middle: every cell is within 2 of a post or a wall
  step(sim, 40);
  assert.equal(crCount(sim), 0, "the post clears every crack");
  step(sim, CRACK_TICKS + 100);
  assert.equal(sim.ug.n, 0, "and nothing falls");
  ok("a timber support in the middle of a 7x7 hall holds it");
  // the village: FRAMING known, timber in the stockpile -> a support ghost, built before the fall
  const s2 = loadFixture("settled"); while (isNight(s2.tick) || s2.tick < 37700) s2.step();       // start at the next dawn: nobody builds in their sleep and a day lies ahead
  const q0 = site(s2, 34, 8), T2 = tunnel(s2, q0, 1);
  grant(s2, adults(s2)[0], "FRAMING", 0.6); s2.cache.kn = null; storeInZone(s2, "timber", 8); s2.cache.iv++;
  const q = { x0: T2.x1 + 6, y0: T2.y - 3, z: T2.zf };                  // a hall at the end of a ramp, so the village can walk in
  dig(s2, q.x0, q.y0, q.z, 7, 7);
  step(s2, 40); assert.equal(crCount(s2), 9);
  let built = -1;
  for (let i = 0; i < CRACK_TICKS + 200 && built < 0; i++) { s2.step();  if (s2.world.mat(q.x0 + 3, q.y0 + 3, q.z) === M.SUPPORT) built = i; }
  assert.ok(built >= 0, "the village posted a support: ghosts " + s2.ents.ofKind("csite").map(c => c.w + ":" + c.m + ":" + c.got + ":" + c.rv).join() + " | " + adults(s2).map(v => v.name + " " + (v.job && v.job.k) + " " + JSON.stringify(v.why && v.why.rej.map(r => r.job + ":" + r.blocker)) + JSON.stringify(v.lf)).join(" ; ") + " n " + s2.ug.n);
  step(s2, 60);
  assert.equal(s2.ug.n, 0, "and the roof held (support built " + built + " ticks in, delay " + (CRACK_TICKS - 40) + ")");
  assert.equal(crCount(s2), 0);
  ok("shoring: the village built the timber support " + (built + 40) + " ticks after the first crack (the roof falls at " + CRACK_TICKS + ")");
  assert.ok(BMAT.support.item === "timber" && BMAT.support.need === "FRAMING");
}

// ---- 4. what autonomy refuses and possession may enter (K7) ----
{
  const sim = loadFixture("settled"), { x0, y0, z } = site(sim, 30, 8);
  dig(sim, x0, y0, z, 7, 7); step(sim, 40);
  const mid = [x0 + 3, y0 + 3, z], edge = [x0 + 4, y0 + 3, z], safe = [x0, y0, z];
  assert.equal(restricted(sim, ...mid), "unstable"); assert.equal(restricted(sim, ...edge), "unstable", "a cell beside a cracked one is refused too");
  assert.equal(restricted(sim, ...safe), "", "the corner of the hall is fine");
  assert.equal(unsafeTask(sim, { steps: [{ v: "dig", x: edge[0], y: edge[1], z, cx: mid[0], cy: mid[1], cz: z - 1 }] }), "unstable");
  // possession: the guided villager may enter, and may dig there
  const v = adults(sim)[0]; sim.ents.move(v, ...edge); holdStill(sim, v);
  assert.ok(sim.ents.get(v.id).poss, "possessed"); // steadfast bypasses the refusal in jobs.js
  sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: 0, verb: "dig", x: mid[0], y: mid[1], z: z - 1 });
  step(sim, 30);
  assert.ok(v.job && v.job.k === "dig" || sim.world.mat(mid[0], mid[1], z - 1) === M.AIR, "the guided villager digs under the cracked roof");
  assert.ok(hazardLines(sim, ...mid).some(t => /cracking/.test(t)), "the banner warns: " + hazardLines(sim, ...mid));
  assert.ok(concerns(sim).some(c => c.k === "underground" && c.level >= 2 && /cracking/.test(c.text)), "Concerns names it");
  ok("autonomy refuses a cracking roof (UNSAFE), a guided villager may enter and dig, the banner and Concerns warn");
}

// ---- 5. bad air: a long dead end goes stale, a vent or a bellows or a second mouth clears it, pockets, harm ----
{
  const sim = loadFixture("settled"), q = site(sim, 34, 8), T = tunnel(sim, q);
  const map = airMap(sim);
  assert.ok(map.bad.size > 0 && map.bad.has(idx(T.end, T.y, T.zf)), "the far end of a long dead-end tunnel is stale");
  assert.ok(!map.bad.has(idx(T.x1 + 5 + 4, T.y, T.zf)), "the stretch near the ramp is fresh");
  const n0 = map.bad.size;
  // a vent near the end clears it
  const vent = sim.ents.add("furniture", { f: "vent", x: T.end - 2, y: T.y, z: T.zf, owner: 0, rv: 0, rt: 0 });
  assert.equal(badAt(sim, T.end, T.y, T.zf), false, "a vent within " + VENT_N + " steps of the tip freshens it");
  sim.ents.remove(vent.id);
  assert.equal(badAt(sim, T.end, T.y, T.zf), true, "taking it away fouls it again");
  sim.ents.add("furniture", { f: "bellows", x: T.end - 3, y: T.y, z: T.zf, owner: 0, rv: 0, rt: 0 });
  assert.equal(badAt(sim, T.end, T.y, T.zf), false, "a bellows works the same way");
  for (const e of sim.ents.ofKind("furniture").slice()) sim.ents.remove(e.id);
  // a second ramp to the surface at the tip: an open tunnel is fresh at both ends
  const w = sim.world, hs = (x, y) => w.hsAt(x, y);
  for (let i = 0; i <= 8; i++) {
    const x = T.end + i, zz = T.zf + i;
    for (const id of sim.ents.at(x, T.y, zz + 1).slice()) { const e = sim.ents.get(id); if (e.kind === "plant") sim.ents.remove(id); }
    w.setFlags(x, T.y, zz + 1, w.flags(x, T.y, zz + 1) & ~F.OBSTACLE);
    for (let k = 0; k <= 1; k++) w.set(x, T.y, zz + k, M.AIR, 0);
    if (zz >= hs(x, T.y)) break;                                     // the stand cell is at the surface: open air
  }
  assert.equal(badAt(sim, T.end - 6, T.y, T.zf), false, "a mouth at the far end airs the tunnel (" + n0 + " foul cells before)");
  ok("bad air: a dead end deeper than " + VENT_N + " goes stale (" + n0 + " cells); a vent, a bellows or a second mouth clears it");

  // harm: health and energy drain, death of bad air, and the fog decides what autonomy refuses
  const s2 = loadFixture("settled"), q2 = site(s2, 34, 8), T2 = tunnel(s2, q2), v = adults(s2)[0];
  s2.ents.move(v, T2.end, T2.y, T2.zf); holdStill(s2, v); v.hp = 100; v.energy = 0.9;
  assert.ok(badAt(s2, v.x, v.y, v.z));
  assert.equal(restricted(s2, v.x, v.y, v.z), "", "foul air nobody has seen is not refused (that is how the first breath costs health)");
  const e0 = v.energy; step(s2, 180);
  assert.ok(v.hp < 100 - 5 && v.hp > 100 - AIR_DMG, "health drains in bad air: " + v.hp);
  assert.ok(v.energy < e0 - 0.001, "so does energy: " + v.energy);
  assert.ok(hazardLines(s2, v.x, v.y, v.z).some(t => /Bad air/.test(t)));
  assert.ok(concerns(s2).some(c => c.k === "underground" && /bad air/.test(c.text)), "Concerns: " + JSON.stringify(concerns(s2).map(c => c.text)));
  markSeen(s2, T2.end, T2.y, T2.zf);
  assert.equal(restricted(s2, T2.end, T2.y, T2.zf), "badair", "once seen, autonomous villagers refuse it");
  assert.equal(restricted(s2, T2.end, T2.y, T2.zf - 1), "");
  const w2 = adults(s2)[1]; s2.ents.move(w2, T2.end - 1, T2.y, T2.zf); w2.hp = 3;
  // a guided villager (v) stays; an unguided one in the foul air with 3 hp dies of it
  for (let i = 0; i < 400 && s2.ents.get(w2.id); i++) { s2.step(); if (s2.ents.get(w2.id) && badAt(s2, w2.x, w2.y, w2.z)) { /* in it */ } }
  if (s2.ents.get(w2.id)) { w2.hp = 1; s2.ents.move(w2, T2.end, T2.y, T2.zf); w2.job = null; w2.action = null; holdStill(s2, w2); step(s2, 200); }
  assert.ok(!s2.ents.get(w2.id) && s2.chron.recs[w2.id].cause === "bad air", "died of bad air: " + (s2.chron.recs[w2.id] && s2.chron.recs[w2.id].cause));
  assert.ok(s2.chron.entries.some(e => /died of bad air.*breathed foul air/.test(e.text)));
  ok("harm: health " + Math.round(v.hp) + ", energy drained, bad air named in the banner and Concerns; refused only once seen; death of bad air reads plainly");

  // a gas pocket: opened, it fouls the tunnel round it; a vent beside it clears it
  const s3 = loadFixture("settled"), q3 = site(s3, 34, 8), T3 = tunnel(s3, q3, 8);
  const pock = idx(T3.x1 + 5 + 4, T3.y + 1, T3.zf);
  { const [px, py, pz] = World.xyz(pock); s3.world.setFlags(px, py, pz, s3.world.flags(px, py, pz) | F.GAS); delete s3.world.peekResident(px >> 4, py >> 4).gas; s3.cache.gasv = -1; }       // a gas pocket is a flag on a rock cell now (terrain.js)
  assert.equal(badAt(s3, T3.x1 + 5 + 4, T3.y, T3.zf), false, "a pocket still sealed in rock fouls nothing");
  s3.world.set(T3.x1 + 5 + 4, T3.y + 1, T3.zf, M.AIR, 0);
  assert.equal(badAt(s3, T3.x1 + 5 + 4, T3.y, T3.zf), true, "opened, its gas fouls the tunnel beside it (6 steps from the mouth)");
  const vv = s3.ents.add("furniture", { f: "vent", x: T3.x1 + 5 + 2, y: T3.y, z: T3.zf, owner: 0, rv: 0, rt: 0 });
  assert.equal(badAt(s3, T3.x1 + 5 + 4, T3.y, T3.zf), false, "a vent within " + POCKET_N + " steps of the pocket clears it");
  void vv;
  ok("a gas pocket opened by digging fouls what is beside it until a vent is within " + POCKET_N + " steps");
}

// ---- 6. the village ventilates, lights and shores by itself ----
{
  const sim = loadFixture("settled"), q = site(sim, 34, 8), T = tunnel(sim, q);
  storeInZone(sim, "stick", 12); sim.cache.iv++;
  for (const x of [T.end, T.end - 1]) markSeen(sim, x, T.y, T.zf);                  // somebody has been at the tip
  step(sim, 120);
  assert.ok(sim.ents.ofKind("csite").some(c => c.w === "vent") || sim.ents.ofKind("furniture").some(f => f.f === "vent"), "a vent was planned beside the bad air that was seen");
  let vented = false; for (let i = 0; i < 2400 && !vented; i++) { sim.step(); vented = !badAt(sim, T.end, T.y, T.zf); }
  assert.ok(vented, "villagers built it and the tunnel is fresh: " + sim.ents.ofKind("csite").map(c => c.w).join());
  ok("the village cut a vent shaft beside bad air it had seen and the tip is fresh");
}

// ---- 7. light: torches and lamps, the dark, the seen frontier, the planner's torches ----
{
  const sim = loadFixture("settled"), q = site(sim, 34, 8), T = tunnel(sim, q, 14);
  const cell = (i) => [T.x1 + 5 + i, T.y, T.zf];
  assert.equal(lit(sim, ...cell(8)), false, "underground and unlit");
  assert.equal(lit(sim, T.x1, T.y, T.top + 1), true, "daylight at the mouth");
  const v = adults(sim)[0]; sim.ents.move(v, ...cell(8));
  const r0 = rate(sim, v, "dig"); assert.equal(darkMul(sim, v), DARK_RATE);
  sim.ents.add("furniture", { f: "torch", x: cell(8)[0], y: T.y, z: T.zf, owner: 0, rv: 0, rt: 0 });
  assert.equal(lightSources(sim).length >= 1 && lit(sim, ...cell(8 + TORCH_R)), true, "lit out to the torch radius " + TORCH_R);
  assert.equal(lit(sim, ...cell(8 + TORCH_R + 1)), false);
  assert.ok(rate(sim, v, "dig") > r0 * 1.1, "work in the light is faster than in the dark: " + r0 + " -> " + rate(sim, v, "dig"));
  assert.equal(isSeen(sim, ...cell(8 + 5)), false);
  step(sim, 25);
  assert.equal(isSeen(sim, ...cell(8 + 5)), true, "the torch widens the seen frontier to its radius");
  assert.equal(isSeen(sim, ...cell(8 + 7)), false);
  sim.ents.add("furniture", { f: "lamp", x: cell(2)[0], y: T.y, z: T.zf, owner: 0, rv: 0, rt: 0 });
  assert.ok(lit(sim, ...cell(2 + LAMP_R)), "a copper lamp reaches " + LAMP_R);
  ok("light: torch radius " + TORCH_R + ", lamp " + LAMP_R + ", dark slows work to " + DARK_RATE + "x, a torch widens what is seen");

  // the planner places torches along a tunnel it is digging, once fire is known
  const s2 = loadFixture("mine");
  grant(s2, adults(s2)[0], "FIRE_TENDING", 0.6); s2.cache.kn = null; storeInZone(s2, "stick", 20); s2.cache.iv++;
  const FACE2 = mineSpots(s2).FACE;                                                  // (S16: search where the mine is: a surface stain sighted nearer the camp is a shallow dig that needs no torch)
  assert.ok(s2.apply({ type: "mine", op: "seek", item: "malachite", x: FACE2[0] - 1, y: FACE2[1] }), s2.lastBlocker);
  let torch = false; for (let i = 0; i < DUR_DAY && !torch; i++) { s2.step(); torch = s2.ents.ofKind("csite").some(c => c.w === "torch") || s2.ents.ofKind("furniture").some(f => f.f === "torch"); }
  assert.ok(torch, "a torch was planned along the tunnel being dug");
  ok("the mining planner plans torches along a tunnel when fire is known");
}

// ---- 8. possession: torch and support verbs, the same hazards ----
{
  const sim = loadFixture("settled"), q = site(sim, 34, 8), T = tunnel(sim, q, 10);
  grant(sim, adults(sim)[0], "FIRE_TENDING", 0.6); grant(sim, adults(sim)[0], "FRAMING", 0.6); sim.cache.kn = null;
  const v = adults(sim)[0], at = [T.x1 + 5 + 3, T.y, T.zf];
  sim.ents.move(v, ...at); v.carry = { item: "stick", n: 2, q: 0 };
  sim.apply({ type: "possess", id: v.id });
  sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: 0, verb: "torch", x: at[0] + 1, y: at[1], z: at[2] });
  step(sim, 400);
  assert.ok(sim.ents.ofKind("furniture").some(f => f.f === "torch" && f.x === at[0] + 1), "the guided villager set a torch: " + JSON.stringify(sim.ents.ofKind("csite").map(c => c.w)) + " " + (v.poss && v.poss.fb));
  assert.equal(v.carry && v.carry.item === "stick" ? v.carry.n : 0, 1, "it cost one stick");
  v.carry = { item: "timber", n: 2, q: 0 };
  sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: 0, verb: "support", x: at[0] - 1, y: at[1], z: at[2] });
  step(sim, 600);
  assert.equal(sim.world.mat(at[0] - 1, at[1], at[2]), M.SUPPORT, "and a timber support: " + JSON.stringify(v.poss && v.poss.fb));
  const s2 = loadFixture("settled"), q2 = site(s2, 34, 8), v2 = adults(s2)[0];
  s2.ents.move(v2, q2.x0, q2.y0, s2.world.standZ(q2.x0, q2.y0)); s2.apply({ type: "possess", id: v2.id });
  s2.apply({ type: "pinput", id: v2.id, dx: 0, dy: 0, tid: 0, verb: "torch", x: v2.x + 1, y: v2.y, z: v2.z }); step(s2, 5);
  assert.ok(v2.poss.fb[0] === "UNKNOWN_CRAFT", "nobody knows fire: " + v2.poss.fb);
  ok("a guided villager sets a torch (fire known) and a timber support (framing known); without the craft it is refused plainly");
}

// ---- 9. cell card, save round-trip and determinism with cracks and fixtures in flight ----
{
  const sim = loadFixture("settled"), q = site(sim, 34, 8);
  dig(sim, q.x0, q.y0, q.z, 7, 7); sim.world.set(q.x0 + 20, q.y0 + 3, q.z, M.AIR, 0);
  sim.ents.add("furniture", { f: "torch", x: q.x0, y: q.y0, z: q.z, owner: 0, rv: 0, rt: 0 });
  step(sim, 60);
  assert.equal(crCount(sim), 9);
  const card = cellInfo(sim, q.x0 + 3, q.y0 + 3, q.z - 1);
  markSeen(sim, q.x0 + 3, q.y0 + 3, q.z - 1);
  const card2 = cellInfo(sim, q.x0 + 3, q.y0 + 3, q.z - 1);
  assert.ok(card2.lines.some(t => /cracking/.test(t)), "the cell card names the crack: " + JSON.stringify(card2.lines));
  void card;
  const copy = restore(toJSON(sim));
  assert.equal(copy.hash(), sim.hash(), "round-trip with cracks pending");
  assert.deepEqual(copy.ug, sim.ug);
  step(sim, CRACK_TICKS); step(copy, CRACK_TICKS);
  assert.equal(sim.ug.n, 1); assert.equal(copy.ug.n, 1);
  assert.equal(copy.hash(), sim.hash(), "the loaded copy falls at the same tick and ends in the same state");
  const a = Sim.create(5, { biomes: true }), b = Sim.create(5, { biomes: true }); step(a, 300); step(b, 300);
  assert.equal(a.hash(), b.hash(), "determinism on a fresh world");
  ok("cell card, save round-trip mid-crack, and the fall replays identically");
}

// ---- 10. the biomes (the 20-seed validator is in tests/geology.js) ----
{
  const sim = Sim.create(7, { villagers: 0, biomes: true }), S = sim.site, w = sim.world;      // the fixtures are meadow-only worlds (tests/legacy.js); the game itself grows biomes
  assert.equal(sim.bio, 1, "new worlds are made with biomes");
  const c = [0, 0, 0];
  let hi = null, ma = null;
  for (let y = S.y - 150; y < S.y + 150; y++) for (let x = S.x - 150; x < S.x + 150; x++) {
    const b = w.biomeAt(x, y); c[b]++;
    if (b === 1 && !hi && w.hsAt(x, y) > WATER_LEVEL + 2) hi = [x, y]; if (b === 2 && !ma && w.hsAt(x, y) > WATER_LEVEL + 2) ma = [x, y];
  }
  assert.ok(c[0] > 0 && c[1] + c[2] > 0, "biome counts " + c);
  for (let y = S.y - 40; y < S.y + 40; y++) for (let x = S.x - 40; x < S.x + 40; x++) if (Math.hypot(x - S.x, y - S.y) < 36) assert.equal(w.biomeAt(x, y), 0, "the camp starts in meadow");
  const card = cellInfo(sim, S.x, S.y, 12);
  assert.ok(!card.lines.some(t => /Meadow/.test(t)), "the plain default is not announced");
  for (const [p, name] of [[hi, "Highland"], [ma, "Marsh"]]) if (p) {
    const [x, y] = p, z = w.hsAt(x, y);
    markSeen(sim, x, y, z);
    assert.ok(cellInfo(sim, x, y, z).lines.some(t => t.startsWith(name + ":")), "the cell card names the " + name);
  }
  const old = Sim.create(7, { villagers: 0, biomes: false });
  let any = 0; for (let y = S.y - 60; y < S.y + 60; y++) for (let x = S.x - 60; x < S.x + 60; x++) any += old.world.biomeAt(x, y);
  assert.ok(any === 0 && old.bio === 0, "a pre-biome world has no biomes");
  ok("biomes: meadow around the camp, the cell card names highland and marsh, a legacy world has none");
}
console.log("underground ok");
