// 9.32 player commands, possession, go-and-look, the guard rails and the patch cache. Fixture based, a few seconds.   node tests/knowhard.js
//   a designation (build, deconstruct) reaches an idle slime only through the board; a direct order is still delivered; possession writes beliefs;
//   go-and-look refreshes (or drops) a stale fact; a slime with no food in mind still finds food; a child is never blind; the year2 rack deadlock; the patch cache is exact; determinism.
import "./legacy.js";
import assert from "node:assert/strict";
import { loadFixture } from "./fixture.js";
import { plan } from "../src/sim/jobs.js";
import { flags, STALE, stats } from "../src/sim/belief.js";
import { newPlant } from "../src/sim/plants.js";
import { isAdult } from "../src/sim/villager.js";
import { berrySeason } from "../src/sim/season.js";
import { storeInZone, survey } from "../src/sim/items.js";
import { boardsOf, boardTick } from "../src/sim/notices.js";
import { spawnChild } from "../src/sim/population.js";

let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
const t00 = Date.now();

const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v) && v.slp === 0);
function bare(sim, cx, cy, keep = [], r = 16) {
  for (const k of ["plant", "furniture", "site", "csite", "dsite", "fauna", "plot", "item"]) for (const e of sim.ents.ofKind(k).slice()) {
    const inYard = k === "item" && sim.stock && e.x >= sim.stock.x0 && e.x <= sim.stock.x1 && e.y >= sim.stock.y0 && e.y <= sim.stock.y1;
    if (Math.abs(e.x - cx) <= r && Math.abs(e.y - cy) <= r && !inYard && !(k === "furniture" && e.f === "board")) sim.ents.remove(e.id);
  }
  for (const o of sim.ents.ofKind("villager").slice()) if (!keep.includes(o)) sim.ents.remove(o.id);
  sim.board.keeps = [];
  sim.cache.iv++;
}
const calm = (v) => { v.bel = []; v.carry = null; v.order = null; v.bad = []; v.job = null; v.action = null; v.hunger = v.thirst = v.energy = v.warm = v.mood = 1; v.rq = null; delete v.bp; delete v.br; delete v.lg; delete v.sf; delete v.sfT; v.par = []; v.gp = []; v.sp = 0; v.rel = []; v.mate = 0; };
const put = (sim, v, x, y) => { const z = sim.world.standZ(x, y); assert.ok(z >= 0, "no ground at " + x + "," + y); sim.ents.move(v, x, y, z); return z; };
const knowBoard = (sim, v) => { const b = boardsOf(sim)[0]; v.bel.push(["furn:board", b.x, b.y, b.z, 1, sim.tick, 0]); return b; };
const cands = (sim, v) => { let out = []; plan(sim, v, false, (cs) => { out = cs.map(c => ({ kind: c.kind, cls: c.cls, blocker: c.blocker || "" })); }, true); return out; };
const east = (sim, x, y, d) => { for (let k = 0; k < 14; k++) for (const s of [1, -1]) { const px = x + s * (d + k), z = sim.world.standZ(px, y); if (z >= 0) return [px, y, z]; } throw new Error("no ground"); };
const season = (sim) => { if (!berrySeason(sim.tick)) { let t = sim.tick; while (!berrySeason(t)) t += 100; sim.tick = t; } };
function run(sim, max, until, hold = []) {
  const at = hold.map(v => [v.x, v.y, v.z]);
  for (let i = 1; i <= max; i++) {
    sim.step();
    hold.forEach((v, k) => { if (sim.ents.get(v.id) && (v.x !== at[k][0] || v.y !== at[k][1] || v.z !== at[k][2])) sim.ents.move(v, ...at[k]); });
    if (until()) return i;
  }
  return -1;
}

/** A build designation 22 cells from the board, one slime beside the board that knows it, another held far away. Returns what a test needs. */
function designated() {
  const sim = loadFixture("settled"), [a, c] = adults(sim);
  const bd = boardsOf(sim)[0];
  bare(sim, bd.x, bd.y, [a, c], 30);
  calm(a); calm(c);
  put(sim, a, bd.x + 1, bd.y); knowBoard(sim, a);
  put(sim, c, bd.x - 28, bd.y); knowBoard(sim, c);
  const [sx, sy, sz] = east(sim, bd.x, bd.y, 22);
  assert.ok(sim.apply({ type: "build", cells: [{ w: "wall", m: "stone", x: sx, y: sy, z: sz }] }), "a build designation: " + sim.lastBlocker);
  return { sim, a, c, bd, site: [sx, sy, sz] };
}

// 1. a build designation reaches an idle slime only through the board
{
  const { sim, a, c, bd, site } = designated();
  const note = bd.notes.find(x => x[0] === "site");
  assert.ok(note && note[7] === 0, "the designation is written on the board by the player: " + JSON.stringify(bd.notes));
  assert.ok(!a.bel.some(f => f[0] === "site"), "A has not seen the site (22 cells off)");
  const before = cands(sim, a).find(k => k.kind === "build_site");
  assert.ok(!before || before.blocker === "UNKNOWN_PLACE", "before it reads the board A has no site to build: " + JSON.stringify(before));
  const rd = run(sim, 900, () => a.bel.some(f => f[0] === "site" && f[6] === 2), [c]);
  assert.ok(rd > 0, "A went to the board and read the site (src 2)");
  const after = cands(sim, a).find(k => k.kind === "build_site");
  assert.ok(after && after.blocker !== "UNKNOWN_PLACE", "after reading, the site is something A can plan for: " + JSON.stringify(after));
  assert.ok(!c.bel.some(f => f[0] === "site"), "C, held far from the board and the site, never learned of it");
  // the work done, the notice comes off
  for (const e of sim.ents.ofKind("csite").slice()) sim.ents.remove(e.id);
  sim.cache.iv++;
  boardTick(sim);
  assert.ok(!bd.notes.some(x => x[0] === "site" && x[7] === 0), "a finished designation is taken off the board");
  ok("a build designation sat on the board as a player's notice; idle A had no site job until it read the board (" + rd + " ticks), then did; C, away, never knew; the notice left with the work");
}

// 1b. a deconstruction is posted too
{
  const sim = loadFixture("settled"), [a] = adults(sim);
  const bd = boardsOf(sim)[0];
  bare(sim, bd.x, bd.y, [a], 30);
  const [x, y, z] = east(sim, bd.x, bd.y, 10);
  sim.ents.add("furniture", { f: "bed", x, y, z, owner: 0, rv: 0, rt: 0 });
  sim.cache.iv++;
  assert.ok(sim.apply({ type: "deconstruct", x0: x, y0: y, x1: x, y1: y, z }), "marked: " + sim.lastBlocker);
  assert.ok(bd.notes.some(k => k[0] === "site" && k[7] === 0 && Math.abs(k[1] - x) <= 3), "the takedown is on the board: " + JSON.stringify(bd.notes));
  ok("a deconstruction mark is written on the board");
}

// 2. a direct order is still delivered to the slime, not broadcast
{
  const { sim, a, c, bd } = designated();
  const notes0 = JSON.stringify(bd.notes);
  const [mx, my, mz] = east(sim, bd.x, bd.y, 8);
  assert.ok(sim.apply({ type: "order", ids: [a.id], verb: "move", x: mx, y: my, z: mz }), "the order");
  assert.ok(a.order && a.order.verb === "move" && a.rp === 1, "the order is on the slime it was given to");
  assert.ok(!c.order, "and on nobody else");
  assert.equal(JSON.stringify(bd.notes), notes0, "an order to a slime is not a notice");
  const got = run(sim, 300, () => a.job && a.job.c === "order", [c]);
  assert.ok(got > 0, "A took the order up: " + JSON.stringify(a.job));
  ok("a direct order is delivered to its slime (job class order after " + got + " ticks) and posts nothing");
}

// 3. possession writes beliefs: stepping, pointing at a thing, reading the board
{
  const sim = loadFixture("settled"), [a, b] = adults(sim);
  const bd = boardsOf(sim)[0];
  bare(sim, bd.x, bd.y, [a, b], 30);
  calm(a); calm(b);
  season(sim);
  const [bx, by, bz] = east(sim, bd.x, bd.y, 16);
  put(sim, a, bx - 12, by);
  const bush = newPlant(sim.ents, "berry", bx, by, bz);
  const tree = (() => { const [tx, ty, tz] = east(sim, bd.x, bd.y + 6, 12); return newPlant(sim.ents, "tree", tx, ty, tz); })();
  sim.cache.iv++;
  assert.ok(sim.apply({ type: "possess", id: a.id }), "possessed");
  assert.ok(!a.bel.some(f => f[0] === "food"), "it knows no food yet");
  // pointing at a faraway tree: the slime has now seen it (it is too far to chop, the player just looked)
  sim.apply({ type: "pinput", id: a.id, dx: 0, dy: 0, tid: tree.id, verb: "" });
  sim.step();
  assert.ok(a.bel.some(f => f[0] === "tree" && f[1] === tree.x && f[6] === 0), "the thing it was pointed at is in its own beliefs (saw): " + JSON.stringify(a.bel));
  // walking: the look follows each new cell, not the 8-tick stagger
  let steps = 0, firstFood = -1;
  for (let i = 0; i < 400 && firstFood < 0; i++) {
    sim.apply({ type: "pinput", id: a.id, dx: bush.x > a.x ? 1 : 0, dy: 0, tid: 0, verb: "" });
    sim.step(); steps++;
    if (a.bel.some(f => f[0] === "food" && f[1] === bush.x)) firstFood = steps;
  }
  assert.ok(firstFood > 0, "walking to the bush put it in the slime's beliefs: " + JSON.stringify(a.bel.filter(f => f[0] === "food")));
  assert.ok(Math.abs(a.x - bush.x) <= 6 + 1, "it wrote the bush as it came within reach of sight (" + (bush.x - a.x) + " cells)");
  // the board: a notice it can read
  sim.apply({ type: "pinput", id: a.id, dx: 0, dy: 0, tid: 0, verb: "" });
  put(sim, a, bd.x + 1, bd.y);
  bd.notes.push(["water", bd.x + 30, bd.y, bd.z, 1, sim.tick, 0, b.id, 0, 0, ""]);
  sim.apply({ type: "pinput", id: a.id, dx: 0, dy: 0, tid: bd.id, verb: "" });
  const rd = run(sim, 80, () => a.bel.some(f => f[0] === "water" && f[6] === 2));
  assert.ok(rd > 0, "the possessed slime read the board like any other (src 2)");
  ok("possession: a pointed-at tree and a bush walked up to were written (" + firstFood + " steps), the board read after " + rd + " ticks");
}

// 4. go and look: a stale fact is refreshed (or dropped) by a trip, with nothing else to do
{
  const sim = loadFixture("settled"), [a] = adults(sim);
  const bd = boardsOf(sim)[0];
  bare(sim, bd.x, bd.y, [a], 30);
  calm(a); bd.notes.length = 0;
  season(sim);
  put(sim, a, bd.x - 2, bd.y + 2);
  const [bx, by, bz] = east(sim, bd.x, bd.y, 16);
  const bush = newPlant(sim.ents, "berry", bx, by, bz);
  sim.cache.iv++;
  const old = sim.tick - STALE - 500;
  const [gx, gy, gz] = east(sim, bd.x, bd.y + 8, 10);                  // a second stale fact, nothing stands there any more
  a.bel.push(["food", bush.x, bush.y, bush.z, bush.yield, old, 0], ["food", gx, gy, gz, 3, old, 0]);
  const looks = [];
  const isGhost = (g) => g[0] === "food" && g[1] === gx && g[2] === gy;
  const t = run(sim, 8000, () => {
    if (a.job && a.job.k === "look" && looks[looks.length - 1] !== a.job.key) looks.push(a.job.key);
    const f = a.bel.find(g => g[0] === "food" && g[1] === bush.x);
    return f && f[5] > old + STALE && !a.bel.some(isGhost);
  });
  assert.ok(t > 0 && looks.length >= 1, "A went to look; the old fact was refreshed and the empty one dropped: " + JSON.stringify([looks, a.job, a.bel.filter(f => f[0] === "food")]));
  assert.equal(a.bel.find(g => g[0] === "food" && g[1] === bush.x)[6], 0, "seen again, so src 0");
  ok("go-and-look: A made " + looks.length + " trip(s) to facts " + STALE + "+ ticks old: the bush refreshed, the empty patch dropped, after " + t + " ticks");
}

// 5. a slime with no food in mind still finds food, within a cap
{
  const sim = loadFixture("settled"), [a] = adults(sim);
  const bd = boardsOf(sim)[0];
  bare(sim, bd.x, bd.y, [a], 40);
  calm(a); bd.notes.length = 0;
  season(sim);
  const z0 = sim.stock;
  for (const e of sim.ents.ofKind("item").slice()) if (e.x >= z0.x0 && e.x <= z0.x1 && e.y >= z0.y0 && e.y <= z0.y1) sim.ents.remove(e.id);       // an empty larder
  sim.cache.iv++;
  put(sim, a, bd.x - 2, bd.y + 2);
  // a bush 8 cells out in every direction there is ground for (the search goes 8 cells the first time)
  let bushes = 0;
  for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
    const x = a.x + 8 * dx, y = a.y + 8 * dy, z = sim.world.standZ(x, y);
    if (z >= 0) { newPlant(sim.ents, "berry", x, y, z); bushes++; }
  }
  sim.cache.iv++;
  assert.ok(bushes >= 4, "bushes set out (" + bushes + ")");
  a.hunger = 0.25;
  assert.ok(!a.bel.some(f => f[0] === "food"), "no food in its beliefs");
  const c0 = cands(sim, a);
  assert.ok(c0.some(k => k.kind === "eat" && k.blocker === "UNKNOWN_PLACE") && c0.some(k => k.kind === "search_food" && !k.blocker), "eating is blocked (UNKNOWN_PLACE) and a search is on offer: " + JSON.stringify(c0));
  let searched = 0, last = "";
  const t = run(sim, 6000, () => { if (a.job && a.job.k !== last) { last = a.job.k; if (last === "search_food") searched++; } return a.hunger > 0.5; });
  assert.ok(searched >= 1, "it set out to look for food");
  assert.ok(t > 0 && a.bel.some(f => f[0] === "food"), "and found some, eating it (hunger " + a.hunger.toFixed(2) + " after " + t + " ticks, " + searched + " trips): " + JSON.stringify(a.bel.filter(f => f[0] === "food")));
  assert.ok(t < 6000, "within the cap");
  ok("a slime with no food beliefs and an empty larder looked round (" + searched + " trip(s)), found a bush and ate within " + t + " ticks");
}

// 6. a child is never blind: the camp's knowledge fills in a thin parent's
{
  const sim = loadFixture("settled"), [a, b] = adults(sim);
  a.bel = []; b.bel = [];
  const kid = spawnChild(sim, a, b);
  assert.ok(kid.bel.some(f => f[0] === "furn:board") && kid.bel.some(f => f[0] === "water") && kid.bel.some(f => f[0] === "stock"), "the child of two blind parents knows the camp: " + kid.bel.map(f => f[0]).join(","));
  assert.ok(kid.bel.every(f => f[6] >= 1 || f[0] === "folk"), "all of it heard, not seen");
  ok("a newborn of two slimes with empty stores starts with the camp's " + kid.bel.length + " facts (told)");
}

// 7. the year2 rack deadlock: 4 sticks in stock and 1 in someone's hands, no rack: somebody chops and a rack goes up
{
  const sim = loadFixture("year2");
  for (const f of sim.ents.ofKind("furniture").filter(f => f.f === "rack").slice()) sim.ents.remove(f.id);
  for (const e of sim.ents.ofKind("item").slice()) if (e.item === "stick") sim.ents.remove(e.id);
  sim.cache.iv++;
  storeInZone(sim, "stick", 4); storeInZone(sim, "berry", 20);
  const ad = adults(sim);
  ad[0].carry = { item: "stick", n: 1 };
  for (const v of ad) { v.job = null; v.action = null; }
  const racks = () => sim.ents.ofKind("furniture").filter(f => f.f === "rack").length + sim.ents.ofKind("csite").filter(c => c.w === "rack").length;
  assert.equal(racks(), 0);
  let chopped = false;
  const t = run(sim, 4000, () => { if (ad.some(v => v.job && v.job.k === "chop")) chopped = true; return racks() >= 1; });
  assert.ok(t > 0 && chopped, "a rack was started and someone chopped for the missing stick: " + JSON.stringify(ad.map(v => v.job && v.job.k)));
  ok("year2 rack deadlock (4 sticks + 1 carried, no rack): a slime chopped and a rack was started after " + t + " ticks");
}

// 8. the patch cache gives exactly the uncached result, and it is used
{
  const go = (nocache) => {
    flags.nocache = nocache;
    stats.hit = stats.miss = 0;
    const sim = loadFixture("crowd");
    for (let g = 0; sim.ents.ofKind("villager").length < 40 && g < 100; g++) sim.spawnVillager();
    for (let i = 0; i < 700; i++) sim.step();
    flags.nocache = false;
    return { h: sim.hash(), hit: stats.hit, miss: stats.miss };
  };
  const u = go(true), c = go(false);
  assert.equal(c.h, u.h, "same state hash with and without the cache");
  assert.ok(c.hit > c.miss, "the cache is hit more than it misses (" + c.hit + " / " + c.miss + ")");
  ok("patch cache: hash " + c.h + " identical to uncached over 700 ticks of 40 slimes; " + c.hit + " hits, " + c.miss + " misses");
}

// 9. determinism: the same designation, possession and look scenario twice gives the same hash
{
  const once = () => {
    const { sim, a } = designated();
    for (let i = 0; i < 250; i++) sim.step();
    sim.apply({ type: "possess", id: a.id });
    for (let i = 0; i < 120; i++) { if (i % 3 === 0) sim.apply({ type: "pinput", id: a.id, dx: i % 2 ? 1 : -1, dy: 0, tid: 0, verb: "" }); sim.step(); }
    return sim.hash();
  };
  const h1 = once(), h2 = once();
  assert.equal(h1, h2, "the same hash");
  ok("determinism: designation + possession scenario hashes equal (" + h1 + ")");
}
console.log("knowhard ok (" + ((Date.now() - t00) / 1000).toFixed(1) + " s)");
