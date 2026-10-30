// Saves rebuild the same world: a dungeon is a pure function of (seed, core), whichever order its chunks (or caches) are visited in,
// and everything that happens to one (a trap disarmed, a vault looted, the guardian slain, a wall dug, the core harvested) survives a save.
// Fixture-based and bounded (a few seconds):  node game/tests/dungeon_regrow.js
import "./legacy.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFixture } from "./fixture.js";
import { DIR } from "../tools/make_fixtures.js";
import { restore, toJSON } from "../src/sim/save.js";
import { dungeonOf, dungeonsIn, trapList, cacheList, lootAt } from "../src/sim/dungeon.js";
import { coresNear, coreKey } from "../src/sim/core.js";
import { nodeOf, CRS } from "../src/sim/caves.js";
import { coreByKey } from "../src/sim/cm.js";
import { spot, disarm, trapHere, isSeenTrap } from "../src/sim/traps.js";
import { M, F } from "../src/sim/world.js";
import { Hasher } from "../src/sim/hash.js";

const ok = (m) => console.log("ok  " + m);
const text = readFileSync(join(DIR, "delve.json"), "utf8");
const fresh = () => restore(text);

const base = fresh();
// the first core near the camp that has a labyrinth
const core0 = coresNear(base.def, base.site.x, base.site.y, base.site.x, base.site.y, 400).filter(c => dungeonOf(base.def, c)).sort((a, b) => a.x - b.x || a.y - b.y)[0];
assert.ok(core0, "the fixture has a labyrinth");
const KEY = coreKey(core0);

/** A comparable description of a dungeon's layout (everything build() makes), as a hash per aspect. */
function describe(dun) {
  const hx = (v) => { const h = new Hasher(); h.value(v); return h.hex; };
  return {
    core: hx([dun.core.x, dun.core.y, dun.core.z]),
    box: hx([dun.x0, dun.y0, dun.W, dun.H, dun.L, dun.jc, dun.s, dun.bb]),
    grid: hx(dun.grid.map(g => Array.from(g))),
    ov: hx([...dun.ov].sort((a, b) => a[0] - b[0])),
    rooms: hx(dun.rooms.map(r => [r.j, r.x0, r.y0, r.x1, r.y1, r.kind, r.tpl || "", r.craft || 0, r.ax, r.ay, r.d, r.leaf])),
    stairs: hx(dun.stairs),
    traps: hx(trapList(dun)),
    caches: hx(cacheList(dun)),
    loot: hx(cacheList(dun).map(c => lootAt(base.def, c.x, c.y, c.z))),
    doors: hx(dun.doors.map(d => [d.x, d.y, d.j, d.side, !!d.link])),
    links: hx(dun.links.map(p => [Array.from(p.xs), Array.from(p.ys), Array.from(p.zs)])),
    entrances: hx(dun.entrances),
    ramps: hx(dun.ramps),
  };
}
const diff = (a, b) => Object.keys(a).filter(k => a[k] !== b[k]);

/** Hash of every cell (material + flags) over the dungeon's box, reading the chunks in the given order. */
function cells(sim, dun, order) {
  const w = sim.world, cks = [];
  for (let cx = dun.bb.x0 >> 4; cx <= dun.bb.x1 >> 4; cx++) for (let cy = dun.bb.y0 >> 4; cy <= dun.bb.y1 >> 4; cy++) cks.push([cx, cy]);
  if (order === "rev") cks.reverse(); else if (order === "mix") cks.sort((p, q) => ((p[0] * 7 + p[1] * 13) % 5) - ((q[0] * 7 + q[1] * 13) % 5) || q[0] - p[0]);
  for (const [cx, cy] of cks) w.resident(cx, cy);
  const h = new Hasher();
  for (let y = dun.bb.y0; y <= dun.bb.y1; y++) for (let x = dun.bb.x0; x <= dun.bb.x1; x++) for (let z = 1; z < 23; z++) h.u32((w.mat(x, y, z) << 8) | w.flags(x, y, z));
  return h.hex;
}

// ---- (a) generation does not depend on the order things are visited in ----
{
  const A = fresh(), B = fresh(), C = fresh();
  const dA = dungeonOf(A.def, coreByKey(A, KEY));
  // B: visit every other core / cave node first, then ask for ours, with the bounded caches cleared in between
  for (const c of coresNear(B.def, core0.x, core0.y, core0.x, core0.y, 700)) if (coreKey(c) !== KEY) dungeonOf(B.def, c);
  B.def.dc = null; B.def.rc = null;
  const dB = dungeonOf(B.def, coreByKey(B, KEY));
  const layout = diff(describe(dA), describe(dB));
  assert.deepEqual(layout, [], "layout differs by visiting order in: " + layout.join(", "));
  const ca = cells(A, dA, "fwd"), cb = cells(B, dB, "rev"), cc = cells(C, dungeonOf(C.def, coreByKey(C, KEY)), "mix");
  assert.equal(cb, ca, "cells differ when the chunks load in reverse order");
  assert.equal(cc, ca, "cells differ when the chunks load in a mixed order");
  ok("layout, traps, treasure and " + "cells are the same in any visiting order (" + dA.rooms.length + " rooms, " + trapList(dA).length + " traps, " + cacheList(dA).length + " caches)");
}

// ---- (a2) the caves and the labyrinth do not depend on WHEN a node is first asked for (a harvest fades the field, never the ground) ----
{
  const A = fresh(), B = fresh();
  const rx = Math.floor(core0.x / CRS), ry = Math.floor(core0.y / CRS);
  const bandA = nodeOf(A.def, rx, ry).band;
  const cB = coreByKey(B, KEY);
  B.def.rc = null; B.def.dc = null;                                          // (the restore warmed the caches: start cold, as a world first asked after the harvest)
  B.def.gone.set(KEY, 0);                     // harvested long ago, then the region is visited for the first time
  const nB = nodeOf(B.def, rx, ry);
  assert.equal(nB.band, bandA, "the cave node's band (and so its caves) changed because the core had been harvested before the node was first computed");
  const bad = [];
  for (const c of coresNear(B.def, core0.x, core0.y, core0.x, core0.y, 900)) {
    const crx = Math.floor(c.x / CRS), cry = Math.floor(c.y / CRS);
    B.def.gone.set(coreKey(c), 0);                                           // every core near here has been harvested, then the nodes are first asked for
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = nodeOf(A.def, crx + i, cry + j), b = nodeOf(B.def, crx + i, cry + j); if ((a ? a.band : -1) !== (b ? b.band : -1)) bad.push((crx + i) + "," + (cry + j) + " band " + (a && a.band) + " vs " + (b && b.band)); }
  }
  assert.deepEqual(bad, [], "cave node bands differ with the order/time of first use: " + bad.join("; "));
  assert.equal(nB.core.gt, undefined, "the node keeps the core as generated");
  const dB = dungeonOf(B.def, cB);
  assert.equal(dB.core.gt, undefined, "the dungeon keeps the core as generated");
  ok("harvest-before-visit: node band " + bandA + " and the stored core unchanged (loot follows the raw field too)");
}

// ---- (b) mutate the dungeon, save, restore, compare ----
{
  const A = fresh(), core = coreByKey(A, KEY), dun = dungeonOf(A.def, core);
  const v = A.ents.ofKind("villager")[0];
  const traps = trapList(dun), caches = cacheList(dun);
  assert.ok(traps.length >= 2 && caches.length >= 2, "the labyrinth has traps and caches");
  const t1 = traps[0], t2 = traps[1];
  // spot and disarm one trap, spot another and leave it
  spot(A, t1.x, t1.y, t1.z); spot(A, t2.x, t2.y, t2.z);
  let r = "";
  for (let i = 0; i < 40 && r !== "ok"; i++) { A.tick++; r = trapHere(A, t1.x, t1.y, t1.z) ? disarm(A, v, t1.x, t1.y, t1.z) : "ok"; }
  // loot a vault: the sealed cache cell is dug out
  const c1 = caches.find(c => A.world.mat(c.x, c.y, c.z) === M.CACHE);
  assert.ok(c1, "a sealed cache is standing");
  A.world.set(c1.x, c1.y, c1.z, M.AIR, A.world.flags(c1.x, c1.y, c1.z) & ~F.NATURAL);
  // the guardian is slain (the choice is pending), and a dungeon wall is dug
  A.wild.gk = [KEY]; A.cm.pend.push(KEY); A.cm.n++;
  let wall = null;
  for (let x = dun.x0; x < dun.x0 + dun.W && !wall; x++) for (let y = dun.y0; y < dun.y0 + dun.H && !wall; y++) if (A.world.mat(x, y, dun.s[0] + 1) === M.DWALL) wall = [x, y, dun.s[0] + 1];
  assert.ok(wall, "a dungeon wall to dig");
  A.world.set(wall[0], wall[1], wall[2], M.AIR, A.world.flags(wall[0], wall[1], wall[2]) & ~F.NATURAL);
  const trpBefore = JSON.stringify(A.trp), hashBefore = A.hash();
  const json = toJSON(A), B = restore(json);
  assert.equal(B.hash(), hashBefore, "the state hash changed over a save and load");
  assert.equal(JSON.stringify(B.trp), trpBefore, "the trap ledger changed over a save");
  assert.deepEqual(B.wild.gk, [KEY]); assert.deepEqual(B.cm.pend, [KEY]);
  const dB = dungeonOf(B.def, coreByKey(B, KEY));
  const layout = diff(describe(dun), describe(dB));
  assert.deepEqual(layout, [], "layout differs after a load in: " + layout.join(", "));
  assert.equal(B.world.mat(c1.x, c1.y, c1.z), M.AIR, "the looted vault came back sealed");
  assert.equal(B.world.mat(wall[0], wall[1], wall[2]), M.AIR, "the dug wall came back");
  assert.ok(!trapHere(B, t1.x, t1.y, t1.z), "the disarmed trap is set again"); assert.ok(isSeenTrap(B, t2.x, t2.y, t2.z), "the spotted trap is unseen again");
  { const j2 = JSON.parse(toJSON(B)), j1 = JSON.parse(json), keys = Object.keys(j1).filter(k => JSON.stringify(j1[k]) !== JSON.stringify(j2[k])); assert.deepEqual(keys, [], "re-saving the loaded sim changed the save in: " + keys.join(", ")); }
  assert.equal(cells(B, dB, "rev"), cells(A, dun, "fwd"), "dungeon cells differ after a load");
  // harvest, save, load: the field fades the same
  const rest = restore(json);
  rest.cm.pend = []; rest.cm.gone.push([KEY, rest.tick]);
  const rest2 = restore(JSON.stringify(Object.assign(JSON.parse(toJSON(rest)))));
  assert.equal(rest2.hash(), rest.hash(), "a harvested core's ledger changed over a save");
  ok("trap disarmed, vault looted, guardian slain, wall dug, core harvested: all survive a save; cells and state hash equal");
}
