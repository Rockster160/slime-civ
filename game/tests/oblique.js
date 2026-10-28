// The angled map view's pure maths (6.19b): projection round-trips at several levels, the GL matrix agreeing with the camera, exact picking through the grid with and
// without the slice's clip plane, and the words the depth gauge shows. No GL, no sim.
import assert from "node:assert/strict";
import { Camera, OBLIQUE_PITCH } from "../src/render/camera.js";
import { obliqueVP, projectVP, pickCell, levelLabel, depthBadge, viewLevelFor, gaugeRows, depthBand } from "../src/render/obmath.js";

const D = 24;
const cam = new Camera(); cam.setPitch(OBLIQUE_PITCH); cam.resize(1280, 720); cam.x = 70.3; cam.y = 41.8; cam.zoom = 18; cam.zf = 14;
let n = 0; const ok = (m) => console.log("ok " + ++n + " " + m);

// world -> screen -> world, at several heights
for (const z of [3, 9, 14, 20]) for (const [x, y] of [[60.5, 30.5], [70.3, 41.8], [88, 52.25]]) {
  const [sx, sy] = cam.toScreen(x, y, z), [bx, by] = cam.toWorld(sx, sy, z);
  assert.ok(Math.abs(bx - x) < 1e-9 && Math.abs(by - y) < 1e-9, `round trip at z ${z}: ${x},${y} -> ${bx},${by}`);
}
ok("world -> screen -> world round-trips at four levels");
assert.deepEqual(cam.toScreen(cam.x, cam.y, cam.zf).map(Math.round), [640, 360]); ok("the focus point is the middle of the screen");
const up = cam.toScreen(70, 40, 15)[1], dn = cam.toScreen(70, 40, 14)[1];
assert.ok(Math.abs((dn - up) - cam.zoom * Math.cos(OBLIQUE_PITCH)) < 1e-9); ok("one level of height lifts a point cos(pitch) cells up the screen");
// a flat camera is the old top-down grid
const flat = new Camera(); flat.resize(800, 600); flat.x = 10; flat.y = 10; flat.zoom = 8;
assert.deepEqual(flat.toScreen(12, 13, 99), [(12 - 10) * 8 + 400, (13 - 10) * 8 + 300]); ok("flat (pitch 90): height does not move a point");
// the GL matrix agrees with the camera
const vp = obliqueVP(cam);
for (const [x, y, z] of [[66, 38, 9], [75.5, 47.5, 14], [70.3, 41.8, 20]]) {
  const a = projectVP(vp, x, y, z, 1280, 720), b = cam.toScreen(x, y, z);
  assert.ok(Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01, "matrix = camera at " + [x, y, z] + ": " + a + " vs " + b);
}
ok("the view-projection matrix lands every point where camera.toScreen does");
// rects stay rects
const [rx, ry, rw, rh] = cam.rect(60, 30, 63, 32, 14); assert.ok(Math.abs(rw - 3 * 18) < 1e-9 && Math.abs(rh - 2 * 18 * Math.sin(OBLIQUE_PITCH)) < 1e-9); ok("an axis-aligned ground rectangle stays an axis-aligned rectangle");

// picking: a hill (a column of solid cells up to z 16 at x 70..72, y 40..44), flat ground below z 13 elsewhere
const solid = (x, y, z) => z <= 12 || (x >= 70 && x <= 72 && y >= 40 && y <= 44 && z <= 16);
const hit = (cell, z, clip) => { const [sx, sy] = cam.toScreen(cell[0] + 0.5, cell[1] + 0.5, z); return pickCell(cam, sx, sy, solid, clip, D); };
let h = hit([71, 42], 17, D - 1); assert.deepEqual([h.x, h.y, h.z], [71, 42, 16]); assert.equal(h.nz, 1); ok("the top of a hill is found exactly (cell " + [h.x, h.y, h.z] + ")");
h = hit([20, 20], 13, D - 1); assert.deepEqual([h.x, h.y, h.z], [20, 20, 12]); ok("flat ground is found exactly");
// the south face of the hill (a cliff): a point on the front face, 2 cells up, belongs to the hill cell, not the ground in front of it
const [fx, fy] = cam.toScreen(71.5, 45, 15); h = pickCell(cam, fx, fy, solid, D - 1, D); assert.deepEqual([h.x, h.y, h.z, h.ny], [71, 44, 15, 1]); ok("a cliff face is a hit on the cell it belongs to (normal south)");
// with the slice at level 14 the hill's top three layers are cut away: the same pixel on the top now finds the cut at z 14
h = pickCell(cam, ...cam.toScreen(71.5, 42.5, 17), solid, 14, D); assert.ok(h && h.z === 14, "clipped: " + JSON.stringify(h)); ok("with the clip plane at level 14 the ray stops on the cut (z " + h.z + "), not the cells above it");
h = pickCell(cam, ...cam.toScreen(71.5, 42.5, 12), solid, 11, D); assert.ok(h && h.z === 11); ok("a slice below the ground: the ray goes down to the cut");
assert.equal(pickCell(cam, 5, 5, () => false, D - 1, D), null); ok("empty space picks nothing");

// the gauge words
assert.equal(levelLabel(D - 1, 14, D), "Surface"); assert.equal(levelLabel(11, 14, D), "3 below ground"); assert.equal(levelLabel(14, 14, D), "Ground level"); assert.equal(levelLabel(16, 14, D), "2 above ground"); assert.equal(levelLabel(9, 14, D), "5 below ground");
ok("the gauge label: Surface / Ground level / 3 below ground / 2 above ground");
assert.equal(depthBadge(D - 1, 14, 13, D), ""); assert.equal(depthBadge(D - 1, 9, 13, D), "↓4"); assert.equal(depthBadge(11, 9, 13, D), "↓2"); assert.equal(depthBadge(11, 14, 13, D), "↑3"); assert.equal(depthBadge(11, 11, 13, D), "");
ok("depth badges: none on the viewed level, ↓n below it, ↑n above it, ↓n under the ground in the Surface view");
assert.equal(viewLevelFor(13, 14, D), D - 1); assert.equal(viewLevelFor(13, 9, D), 9); ok("a show-me jump uses the Surface for a target on its column's top, else the slice at its level");
const rows = gaugeRows(11, 14, D, new Map([[9, 2]]), new Set([10]));
assert.equal(rows[0].label, "Surface"); assert.ok(rows.find(r => r.n === 9 && r.slimes === 2)); assert.ok(rows.find(r => r.n === 10 && r.dug)); assert.equal(rows.filter(r => r.cur).length, 1); assert.equal(rows.find(r => r.cur).label, "3 below ground");
ok("the gauge rows mark slimes, carved levels and the current one");
assert.deepEqual([1, 2, 3, 4, 5, 8].map(u => depthBand(u)), [0, 1, 2, 3, 4, 4]); ok("depth bands: this level full colour, then four dimmer bands");
console.log("oblique: " + n + " checks passed");
