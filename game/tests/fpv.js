// S18 first-person view, the parts that need no browser:
//  1. camera maths: look direction, the facing and the walking table (camera yaw + held keys -> the sim's cell step), the cell ray (3D DDA), the projection;
//  2. the sky (day vs night, season tint) and the key table (the new actions exist and clash with nothing);
//  3. the crosshair target -> the SAME pinput the top-down possession sends for the same target, and the sim ends in the same state (so a recorded possession replays
//     identically whichever view the player used); occlusion (rock in front of a tree), reach ("walk closer"), and nothing in src/sim changed to get here.
//   node tests/fpv.js
import "./legacy.js";
import assert from "node:assert/strict";
import { DAY, LANDING } from "../src/sim/clock.js";
import { loadFixture } from "./fixture.js";
import { M, F } from "../src/sim/world.js";
import { isAdult } from "../src/sim/villager.js";
import { FACE, facingYaw, turnFace, stepFor as stepFor0, lookDir, faceOfYaw, walkDir, castCells, raySphere, perspective, lookAlong, mul, project, clampPitch, MAX_PITCH } from "../src/render/fpvmath.js";
import { skyState } from "../src/render/fpv.js";
import { clampLook, swayTarget, easeLook, LOOK_YAW } from "../src/render/fpvmath.js";
import { pickTarget } from "../src/ui/fpvpick.js";
import { useFor, targetOfPick } from "../src/ui/usecmd.js";
import { createKeymap, ACTIONS } from "../src/ui/keys.js";
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + m);
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, a + " vs " + b);
const H = Math.PI / 2;

// ---- 1. maths ----
{
  const d = lookDir(0, 0); near(d[0], 1); near(d[1], 0); near(d[2], 0);
  const e = lookDir(H, 0.5); near(e[1], Math.cos(0.5)); near(e[2], Math.sin(0.5));
  near(Math.hypot(...lookDir(2.1, -0.7)), 1);
  assert.equal(clampPitch(9), MAX_PITCH); assert.equal(clampPitch(-9), -MAX_PITCH);
  assert.deepEqual([0, H, 2 * H, 3 * H, 4 * H, -H].map(faceOfYaw), [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 0], [0, -1]]);
  assert.deepEqual(faceOfYaw(0.7), [1, 0]); assert.deepEqual(faceOfYaw(0.9), [0, 1]);
  // the walking table: yaw (east, south, west, north) x (forward, back, left, right) -> [dx, dy]; "right" of east is south (y grows southward)
  const T = [
    [0, [1, 0], [-1, 0], [0, -1], [0, 1]],
    [H, [0, 1], [0, -1], [1, 0], [-1, 0]],
    [2 * H, [-1, 0], [1, 0], [0, 1], [0, -1]],
    [3 * H, [0, -1], [0, 1], [-1, 0], [1, 0]],
  ];
  for (const [yaw, f, b, l, r] of T) {
    assert.deepEqual(walkDir(yaw, 1, 0), f, "forward at yaw " + yaw); assert.deepEqual(walkDir(yaw, -1, 0), b, "back at yaw " + yaw);
    assert.deepEqual(walkDir(yaw, 0, -1), l, "left at yaw " + yaw); assert.deepEqual(walkDir(yaw, 0, 1), r, "right at yaw " + yaw);
  }
  assert.deepEqual(walkDir(0.3, 0, 0), [0, 0]);
  assert.deepEqual(walkDir(0.3, 1, 0.3), [1, 0], "forward + a little right while looking mostly east: the dominant axis");
  assert.deepEqual(walkDir(0, 1, 1), [1, 0], "forward + right at the same strength is a tie: forward wins");
  assert.deepEqual(walkDir(0, -1, 1), [-1, 0], "back + right: back wins");
  { const [dx, dy] = walkDir(Math.PI / 4, 1, 0); assert.equal(Math.abs(dx) + Math.abs(dy), 1, "a half-step yaw with only forward still steps (never zero, never diagonal)"); }
  for (let i = 0; i < 64; i++) { const yaw = i * 0.1; const [dx, dy] = walkDir(yaw, 1, 0); assert.ok(Math.abs(dx) + Math.abs(dy) === 1, "one cardinal step at yaw " + yaw); }
  // grid crawler (§12.3): four facings, 90 degree turns, and the facing -> step table (W/S forward/back, A/D strafe)
  assert.deepEqual([0, 1, 2, 3].map(f => faceOfYaw(facingYaw(f))), FACE);
  assert.equal(turnFace(0, 1), 1); assert.equal(turnFace(0, -1), 3); assert.equal(turnFace(3, 1), 0);
  for (let f = 0; f < 4; f++) {
    const [fx, fy] = FACE[f], [rx, ry] = FACE[(f + 1) & 3], stepFor = (...a) => stepFor0(...a).map(x => x + 0);
    assert.deepEqual(stepFor(f, 1, 0), [fx + 0, fy + 0], "forward, facing " + f); assert.deepEqual(stepFor(f, -1, 0), [0 - fx, 0 - fy], "back, facing " + f);
    assert.deepEqual(stepFor(f, 0, 1), [rx, ry], "strafe right, facing " + f); assert.deepEqual(stepFor(f, 0, -1), [0 - rx, 0 - ry], "strafe left, facing " + f);
  }
  ok("grid crawler: 4 facings, 90 degree turns, facing -> step (forward, back, strafe) for every facing");
  ok("lookDir, facing and the camera-yaw -> cell-step table (forward/back/left/right at 4 yaws; ties; never diagonal)");

  // the ray: a floor at z=3 (cells z<=2 solid) and a wall at x=6
  const solid = (x, y, z) => z <= 2 || x >= 6;
  let h = castCells([0.5, 0.5, 3.74], [1, 0, 0], 20, solid);
  assert.deepEqual([h.x, h.y, h.z, h.nx, h.ny, h.nz], [6, 0, 3, -1, 0, 0]); near(h.t, 5.5);
  h = castCells([0.5, 0.5, 3.74], [0, 0, -1], 20, solid);
  assert.deepEqual([h.x, h.y, h.z, h.nx, h.ny, h.nz], [0, 0, 2, 0, 0, 1]); near(h.t, 0.74);
  const dd = lookDir(0.4, -0.3); h = castCells([0.5, 0.5, 3.74], dd, 30, solid);
  assert.ok(h && h.nz === 1 && h.z === 2 && h.t < 30, "a downward diagonal lands on the floor");
  assert.equal(castCells([0.5, 0.5, 3.74], [0, 1, 0], 10, solid), null, "nothing within reach");
  const seen = []; castCells([0.5, 0.5, 3.5], [1, 0, 0], 20, solid, (x, y, z) => seen.push(x)); assert.deepEqual(seen, [0, 1, 2, 3, 4, 5], "the open cells passed, in order");
  h = castCells([-3.5, -9.5, 3.5], [0, 0, -1], 5, solid); assert.deepEqual([h.x, h.y, h.z], [-4, -10, 2], "negative cells (the world is endless)");
  near(raySphere([0, 0, 0], [1, 0, 0], [5, 0.2, 0], 0.5), 5 - Math.sqrt(0.25 - 0.04), 1e-9); assert.equal(raySphere([0, 0, 0], [1, 0, 0], [5, 2, 0], 0.5), -1); assert.equal(raySphere([0, 0, 0], [-1, 0, 0], [5, 0, 0], 0.5), -1);
  // the projection: a point straight ahead is the screen centre; to the right of the view is right of centre (GL axes: x, up, y)
  const vp = mul(perspective(1.2, 16 / 9, 0.05, 40), lookAlong([10, 4, 10], [1, 0, 0]));
  let p = project(vp, 20, 4, 10, 1280, 720); near(p[0], 640, 0.5); near(p[1], 360, 0.5); assert.ok(p[2]);
  p = project(vp, 20, 4, 12, 1280, 720); assert.ok(p[0] > 640, "south is to the right of an east-facing view");
  p = project(vp, 20, 6, 10, 1280, 720); assert.ok(p[1] < 360, "up is up");
  assert.equal(project(vp, 5, 4, 10, 1280, 720)[2], false, "behind the camera");
  ok("the cell ray (walls, floor, diagonals, negative cells), the sphere test and the projection");
}

// ---- 2. sky, keys ----
{
  const noon = DAY * 3 + 0.45 * DAY - LANDING % DAY, midnight = DAY * 3 + 0.95 * DAY - LANDING % DAY;
  const a = skyState(noon), b = skyState(midnight);
  assert.ok(a.day > 0.99 && b.day < 0.01, "day " + a.day + " night " + b.day);
  assert.ok(a.sky[0] > 3 * b.sky[0] && a.sky[2] > b.sky[2], "daylight lights open faces much more than the night does");
  assert.ok(b.sky[2] > b.sky[0], "the night is blue");
  const winter = skyState(DAY * 80 + DAY * 0.45 - LANDING % DAY), summer = skyState(DAY * 37 + DAY * 0.45 - LANDING % DAY);
  assert.ok(winter.sky[2] / winter.sky[0] > summer.sky[2] / summer.sky[0], "winter light is cooler than summer light");
  assert.ok(a.sun[1] > 0.5 && b.sun[1] < 0, "the sun is up at noon, down at midnight");
  const km = createKeymap({ get: () => null, set() {} });
  for (const id of ["turnLeft", "turnRight"]) assert.ok(ACTIONS.find(x => x.id === id && x.ctx === "guide"), id + " is a remappable guide action");
  assert.ok(!ACTIONS.some(x => x.id === "fpv"), "there is no first-person toggle: guiding is always first person (S18b)");
  assert.equal(km.actionOf("f", "guide"), "", "F is free while guiding"); assert.equal(km.actionOf("f", "map"), "follow", "F still follows on the map");
  ok("sky (noon vs midnight, winter vs summer, sun) and the key table (no first-person toggle, F is free in the guide)");
}

// ---- 3. the crosshair sends the top-down possession's commands ----
function scene() {
  const sim = loadFixture("settled"), w = sim.world;
  const v = sim.ents.ofKind("villager").find(q => isAdult(sim, q));
  let spot = null;
  for (let y = sim.site.y - 20; y < sim.site.y + 20 && !spot; y++) for (let x = sim.site.x - 20; x < sim.site.x + 20 && !spot; x++) {
    const z0 = w.standZ(x, y); let good = z0 > 0 && !(sim.stock && x > sim.stock.x0 - 3 && x < sim.stock.x1 + 3 && y > sim.stock.y0 - 3 && y < sim.stock.y1 + 3);
    for (let i = -1; i < 6 && good; i++) for (let j = -1; j <= 1 && good; j++) good = w.standZ(x + i, y + j) === z0 && sim.ents.at(x + i, y + j, z0).length === 0;
    if (good) spot = { x, y, z: z0 };
  }
  assert.ok(spot, "a flat free run");
  for (const q of sim.ents.ofKind("villager")) { q.hunger = q.thirst = q.energy = 1; q.hp = 999; }
  sim.ents.move(v, spot.x, spot.y, spot.z); v.action = null; v.job = null; sim.cache.iv++;
  const tree = (dx) => { const t = sim.ents.add("plant", { species: "tree", x: spot.x + dx, y: spot.y, z: spot.z, yield: 4, nx: 0, rv: 0, rt: 0 }); w.setFlags(spot.x + dx, spot.y, spot.z, w.flags(spot.x + dx, spot.y, spot.z) | F.OBSTACLE); return t; };
  sim.apply({ type: "possess", id: v.id });
  return { sim, v, w, ...spot, tree };
}
const pin = (v, extra) => ({ type: "pinput", id: v.id, dx: 0, dy: 0, tid: 0, verb: "", ...extra });
{
  const A = scene(), B = scene();
  const eye = (S) => [S.x + 0.5, S.y + 0.5, S.z + 0.74];
  // (a) a tree beside us: the crosshair on it -> the chop command, equal to a click on it from above
  const ta = A.tree(1), tb = B.tree(1);
  const dir = (c) => { const e = eye(A), d = [c[0] - e[0], c[1] - e[1], c[2] - e[2]], l = Math.hypot(...d); return d.map(q => q / l); };
  const tgtOf = (S, t) => [{ e: t, c: [t.x + 0.5, S.z + 0.9, t.y + 0.5], r: 0.6 }];
  let T = pickTarget(A.sim, A.v, A.w, eye(A), dir([A.x + 1.5, A.y + 0.5, A.z + 0.9]), tgtOf(A, ta));
  assert.ok(T && T.tgt.ent === ta && T.task === "chop" && !T.blocker, "the crosshair is on the tree: " + JSON.stringify(T && [T.task, T.blocker]));
  const fpvCmd = pin(A.v, useFor(A.sim, A.v, T.tgt).extra);
  const topCmd = pin(B.v, useFor(B.sim, B.v, targetOfPick(B.sim, B.v, { ents: [tb], x: tb.x, y: tb.y, z: B.z })).extra);
  assert.deepEqual(fpvCmd, { ...topCmd, id: A.v.id }, "same pinput as a top-down click on the tree: " + JSON.stringify(fpvCmd));
  assert.equal(fpvCmd.tid, ta.id);
  assert.ok(A.sim.apply(fpvCmd) && B.sim.apply(topCmd));
  let t = 0; for (; t < 3000 && A.sim.ents.get(ta.id).species === "tree"; t++) { A.sim.step(); B.sim.step(); }
  assert.equal(A.sim.ents.get(ta.id).species !== "tree", true, "the tree was felled"); assert.equal(A.sim.hash(), B.sim.hash(), "both views leave the sim in the same state");
  ok("crosshair on a tree -> pinput {tid, verb ''} identical to the top-down click, and when the tree falls the sim hash is identical (chopped)");
}
{
  const A = scene(), B = scene();
  // (b) rock: the dirt cell north of us; the crosshair looks at it level -> dig {x, y, z}; the top-down click on that column sends the same
  for (const S of [A, B]) S.w.set(S.x, S.y - 1, S.z, M.DIRT);
  const e = [A.x + 0.5, A.y + 0.5, A.z + 0.74];
  const T = pickTarget(A.sim, A.v, A.w, e, [0, -1, 0], []);
  assert.ok(T && T.tgt.cell && T.task === "dig", "rock in view is a dig: " + JSON.stringify(T && [T.task, T.blocker, T.tgt]));
  assert.deepEqual(T.tgt.cell, [A.x, A.y - 1, A.z]); assert.equal(T.hit.ny, 1, "entered through its south face");
  const fpvCmd = pin(A.v, useFor(A.sim, A.v, T.tgt).extra), topCmd = pin(B.v, useFor(B.sim, B.v, targetOfPick(B.sim, B.v, { ents: [], x: B.x, y: B.y - 1, z: B.z + 1 })).extra);
  assert.deepEqual(fpvCmd, { ...topCmd, id: A.v.id }); assert.equal(fpvCmd.verb, "dig");
  A.sim.apply(fpvCmd); B.sim.apply(topCmd);
  for (let i = 0; i < 300; i++) { A.sim.step(); B.sim.step(); }
  assert.equal(A.w.mat(A.x, A.y - 1, A.z), M.AIR, "the dirt was dug"); assert.equal(A.sim.hash(), B.sim.hash());
  ok("crosshair on a rock face -> the same dig command as a top-down click on its column, same state after 300 ticks (dug)");
}
{
  const A = scene();
  // (c) reach and occlusion: a tree three cells away is "walk closer"; rock between you and a tree is what you point at
  const far = A.tree(3), e = [A.x + 0.5, A.y + 0.5, A.z + 0.74];
  let T = pickTarget(A.sim, A.v, A.w, e, [1, 0, 0.0001], [{ e: far, c: [A.x + 3.5, A.z + 0.9, A.y + 0.5], r: 0.6 }]);
  assert.ok(T && T.tgt.ent === far && T.blocker === "TOO_FAR", "a tree three cells off: " + JSON.stringify(T && T.blocker));
  assert.equal(useFor(A.sim, A.v, T.tgt).err, "far");
  A.w.set(A.x + 1, A.y, A.z, M.DIRT);
  T = pickTarget(A.sim, A.v, A.w, e, [1, 0, 0.0001], [{ e: far, c: [A.x + 3.5, A.z + 0.9, A.y + 0.5], r: 0.6 }]);
  assert.ok(T && T.tgt.cell && T.tgt.cell[0] === A.x + 1, "rock in front hides the tree behind it");
  assert.equal(pickTarget(A.sim, A.v, A.w, e, [-1, 0, 0.3], []), null, "open air is no target");
  assert.equal(useFor(A.sim, A.v, null).err, "none");
  ok("reach (a far tree says walk closer and sends nothing), occlusion (rock in front of a tree), open air is no target");
}

// looking around: an offset on top of the facing. The facing -> step table and the default target never see it; a click while looking sends the same pinput as the crosshair
{
  for (let f = 0; f < 4; f++) for (const [fw, sd] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const off of [-LOOK_YAW, 0.3, LOOK_YAW]) assert.deepEqual(stepFor0(f, fw, sd), walkDir(facingYaw(f), fw, sd), "the step follows the facing, whatever the look offset " + off);
  const [cy, cp] = clampLook(3, 3, -0.16); assert.ok(Math.abs(cy - 70 * Math.PI / 180) < 1e-9 && Math.abs(cp + -0.16 - 45 * Math.PI / 180) < 1e-9, "the offset is held to +-70 degrees and a total pitch of +45");
  assert.ok(Math.abs(clampLook(-3, -3, -0.16)[1] + -0.16 + 60 * Math.PI / 180) < 1e-9, "...and -60");
  const sw = swayTarget(1280, 0, 1280, 720); assert.ok(Math.abs(sw[0] - 12 * Math.PI / 180) < 1e-9 && Math.abs(sw[1] - 8 * Math.PI / 180) < 1e-9); assert.deepEqual(swayTarget(640, 360, 1280, 720).map(Math.abs), [0, 0]);
  assert.equal(easeLook(0.5, 0, 0.1, true), 0); let o = 0.8; for (let i = 0; i < 16; i++) o = easeLook(o, 0, 1 / 60, false); assert.ok(Math.abs(o) < 0.08, "it eases back in about a quarter of a second (" + o.toFixed(3) + ")");
  ok("look-around: the step table ignores the offset, the offset and the sway are clamped, easing returns in ~250 ms");
}
console.log("fpv ok");
