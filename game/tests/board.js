// 9.31 job board and gossip (notices.js, boardjobs.js, tasks.js post / read, people.js, belief.js learn): what a slime writes on the board, what it can read, and how facts pass between friends.
// Fixture based, a few seconds (the crowd comparison is the longest).   node tests/board.js
//   founding board; a fact A holds is posted and B (who reads at the board) goes to it; a notice is never read without visiting;
//   a NO_MATERIAL shortage becomes a request, an idle slime reads, claims, chops and delivers, the request closes; a busy slime ignores it; a claim expires;
//   cap and merge; gossip A -> B -> C; the cry for help reaches only the near; a designation reaches an idle slime through the board; save round trip; determinism; the crowd.
import "./legacy.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixture } from "./fixture.js";
import { Sim } from "../src/sim/sim.js";
import { toJSON, restore, SAVE_VERSION } from "../src/sim/save.js";
import { plan } from "../src/sim/jobs.js";
import { look, flags, LOOK_R } from "../src/sim/belief.js";
import { newPlant } from "../src/sim/plants.js";
import { bump } from "../src/sim/bonds.js";
import { isAdult } from "../src/sim/villager.js";
import { berrySeason } from "../src/sim/season.js";
import { storeInZone } from "../src/sim/items.js";
import { CLAIM_EXPIRY } from "../src/sim/local.js";
import { boardsOf, addNotice, read, post, cryOut, gossip, BOARD_CAP, CRY_R, READ_N, POST_N, GOSSIP_N, boardNeed } from "../src/sim/notices.js";

const here = dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (m) => console.log("ok " + ++n + " " + m);
const t00 = Date.now();

const adults = (sim) => sim.ents.ofKind("villager").filter(v => isAdult(sim, v) && v.slp === 0);
/** Remove what a look would notice round (cx, cy) (the board and the yard's items stay) and send the other slimes away, so a test places exactly what it wants. */
function bare(sim, cx, cy, keep = [], r = 16) {
  for (const k of ["plant", "furniture", "site", "csite", "dsite", "fauna", "plot", "item"]) for (const e of sim.ents.ofKind(k).slice()) {
    const inYard = k === "item" && sim.stock && e.x >= sim.stock.x0 && e.x <= sim.stock.x1 && e.y >= sim.stock.y0 && e.y <= sim.stock.y1;
    if (Math.abs(e.x - cx) <= r && Math.abs(e.y - cy) <= r && !inYard && !(k === "furniture" && e.f === "board")) sim.ents.remove(e.id);
  }
  for (const o of sim.ents.ofKind("villager").slice()) if (!keep.includes(o)) sim.ents.remove(o.id);        // nobody else is about: the test's slimes are the whole village
  sim.board.keeps = [];                                                                          // no standing orders to pull anyone off the board
  sim.cache.iv++;
}
const calm = (v) => { v.bel = []; v.carry = null; v.order = null; v.bad = []; v.job = null; v.action = null; v.hunger = v.thirst = v.energy = v.warm = v.mood = 1; v.rq = null; delete v.bp; delete v.br; v.par = []; v.gp = []; v.sp = 0; v.rel = []; v.mate = 0; };   // (strangers: nothing here is passed by word of mouth unless a test makes them friends)
const put = (sim, v, x, y) => { const z = sim.world.standZ(x, y); assert.ok(z >= 0, "no ground at " + x + "," + y); sim.ents.move(v, x, y, z); return z; };
const knowBoard = (sim, v) => { const b = boardsOf(sim)[0]; v.bel.push(["furn:board", b.x, b.y, b.z, 1, sim.tick, 0]); return b; };
const emptyYard = (sim) => { const z = sim.stock; for (const e of sim.ents.ofKind("item").slice()) if (e.x >= z.x0 && e.x <= z.x1 && e.y >= z.y0 && e.y <= z.y1) sim.ents.remove(e.id); sim.cache.iv++; };
const cands = (sim, v) => { let out = []; plan(sim, v, false, (cs) => { out = cs.map(c => ({ kind: c.kind, cls: c.cls, tid: c.tid || 0, blocker: c.blocker || "", rq: c.rq || "" })); }, true); return out; };
/** A standable spot `d` cells east of (x, y) (or the nearest column that has ground). */
const east = (sim, x, y, d) => { for (let k = 0; k < 12; k++) for (const s of [1, -1]) { const px = x + s * (d + k), z = sim.world.standZ(px, y); if (z >= 0) return [px, y, z]; } throw new Error("no ground"); };
const withBoard = (sim, aside = 6) => { const b = boardsOf(sim)[0]; assert.ok(b, "the world has a board"); return b; };
/** Step the sim for up to `max` ticks, holding every slime in `hold` in place; returns the tick count when `until()` held, or -1. */
function run(sim, max, until, hold = []) {
  const at = hold.map(v => [v.x, v.y, v.z]);
  for (let i = 1; i <= max; i++) {
    sim.step();
    if (process.env.DBG && i % 40 === 0) console.log("  t+" + i, sim.ents.ofKind("villager").map(v => v.id + ":" + (v.job ? v.job.k + "/" + v.job.c : "-") + "@" + v.x + "," + v.y).join(" "));
    hold.forEach((v, k) => { if (sim.ents.get(v.id) && (v.x !== at[k][0] || v.y !== at[k][1] || v.z !== at[k][2])) sim.ents.move(v, ...at[k]); });
    if (until()) return i;
  }
  return -1;
}

// 0. the founding board: free, beside the yard, known to every founder; an old save gets one
{
  const sim = Sim.create(3);
  const bs = boardsOf(sim);
  assert.equal(bs.length, 1, "one founding board");
  const b = bs[0], z = sim.stock, gap = Math.max(z.x0 - b.x, b.x - z.x1, z.y0 - b.y, b.y - z.y1);
  assert.ok(gap >= 1 && gap <= 3, "it stands beside the yard (" + gap + " cells off)");
  assert.deepEqual(b.notes, [], "it starts empty");
  for (const v of sim.ents.ofKind("villager")) assert.ok(v.bel.some(f => f[0] === "furn:board"), "every founder knows the board");
  const old = loadFixture("settled");
  assert.equal(boardsOf(old).length, 1, "a fixture saved before the board gets one when it is opened");
  assert.equal(SAVE_VERSION, 20);
  ok("a founding board stands " + gap + " cells from the yard, empty; the founders know it; an older save gets one (SAVE_VERSION " + SAVE_VERSION + ")");
}

// 1. A holds berries at X and posts; B reads at the board and goes to X; a notice is never read without visiting
{
  const sim = loadFixture("settled"), [a, b, c] = adults(sim);
  const bd = withBoard(sim);
  bare(sim, bd.x, bd.y, [a, b, c], 30);
  if (!berrySeason(sim.tick)) { let t = sim.tick; while (!berrySeason(t)) t += 100; sim.tick = t; }
  calm(a); calm(b); calm(c);
  const [bx, by, bz] = east(sim, bd.x, bd.y, 22);
  const bush = newPlant(sim.ents, "berry", bx, by, bz);
  put(sim, a, bd.x + 1, bd.y);
  knowBoard(sim, a); knowBoard(sim, b); knowBoard(sim, c);
  a.bel.push(["food", bush.x, bush.y, bush.z, bush.yield, sim.tick, 0]);
  put(sim, b, bd.x - 2, bd.y + 1);
  put(sim, c, bd.x - 28, bd.y);                                          // far from the board and from the bush: it never walks up
  for (const v of [b, c]) v.bel.push(["need:food", bd.x + 60, bd.y + 60, bd.z, 2, sim.tick, 0]);     // they have seen a hungry neighbour (far from here): they want food, and know of none
  assert.ok(!b.bel.some(f => f[0] === "food"), "B knows of no food");
  const posted = run(sim, 600, () => bd.notes.some(x => x[0] === "food" && x[1] === bush.x), [c]);
  assert.ok(posted > 0, "A posted the berries (the post job: a leisure walk to the board and a write)");
  const note = bd.notes.find(x => x[0] === "food" && x[1] === bush.x);
  assert.ok(note[7] === a.id && note[1] === bush.x && note[2] === bush.y, "the notice carries the place and who wrote it: " + JSON.stringify(note));
  assert.ok(!c.bel.some(f => f[6] === 2 || (f[0] === "food" && f[1] === bush.x && f[2] === bush.y)), "C, far from the board, has not read it");
  const went = run(sim, 900, () => b.job && b.job.k === "forage" && b.job.tid === bush.id, [c]);
  assert.ok(went > 0, "B set off for the bush: " + JSON.stringify([b.job, b.bel.filter(f => f[0] === "food")]));
  assert.ok(b.br !== undefined && b.job.t0 >= b.br, "and only after it read the board (it read at " + b.br + ", chose the bush at " + b.job.t0 + ")");
  assert.ok(!c.bel.some(f => f[6] === 2 || (f[0] === "food" && f[1] === bush.x && f[2] === bush.y)), "C never visited, so it never read: " + JSON.stringify(c.bel));
  ok("A posted the berries after " + posted + " ticks; B read them at the board and was off to forage the bush " + went + " ticks later; C, held away, read nothing");
}

// 2. A NO_MATERIAL wood shortage is posted as a request; an idle slime reads, claims, chops and delivers; the request closes; a busy slime ignores it
{
  const sim = loadFixture("settled"), [a, d, e] = adults(sim);
  const bd = withBoard(sim);
  bare(sim, bd.x, bd.y, [a, d, e], 30);
  calm(a); calm(d); calm(e);
  emptyYard(sim);
  storeInZone(sim, "berry", 12); storeInZone(sim, "stick", 3);                              // sticks are short for a rack (it takes 5): 2 short
  const zn = sim.stock;
  put(sim, a, zn.x0 - 3, zn.y1 + 1);
  a.bel.push(["stock", zn.x0, zn.y0, zn.z, 6, sim.tick, 0]);
  knowBoard(sim, a);
  plan(sim, a, false);                                                                       // it hits the shortage (a rack wanted, no sticks): the plan writes it down
  const sh = a.bel.find(f => f[0] === "need:stick");
  assert.ok(sh && sh[4] === 2 && sh[6] === 0, "the shortage is in A's own beliefs, 2 sticks short: " + JSON.stringify(a.bel.filter(f => f[0].startsWith("need:"))));
  // A walks to the board and writes it (its job is cleared and a rack believed to be coming so it does not just go and chop)
  a.job = null; a.action = null;
  const rk = sim.ents.add("furniture", { f: "rack", x: zn.x0 - 6, y: zn.y0 - 6, z: sim.world.standZ(zn.x0 - 6, zn.y0 - 6), owner: 0, rv: 0, rt: 0 });
  a.bel.push(["furn:rack", rk.x, rk.y, rk.z, 1, sim.tick, 0]); sim.cache.iv++;
  const t0 = sim.tick;
  const posted = run(sim, 900, () => bd.notes.some(x => x[0] === "need:stick"), [d, e]);
  assert.ok(posted > 0, "A posted the shortage: " + JSON.stringify(bd.notes));
  const req = bd.notes.find(x => x[0] === "need:stick");
  assert.ok(req[4] === 2 && req[7] === a.id && req[8] === 0, "a request: the item, the amount short (2), who wrote it, unclaimed: " + JSON.stringify(req));
  assert.equal(boardNeed(sim, "need:bed") >= 0, true);
  // D, idle, with a tree it knows of, goes to the board, reads and claims; E is busy with an order and ignores the board
  const tree = (() => { const [x, y, z] = east(sim, zn.x1, zn.y1, 9); return newPlant(sim.ents, "tree", x, y, z); })();
  put(sim, d, bd.x + 1, bd.y + 1); knowBoard(sim, d); d.bel.push(["tree", tree.x, tree.y, tree.z, 1, sim.tick, 0]);
  put(sim, e, bd.x - 1, bd.y + 1); knowBoard(sim, e);
  const [fx, fy] = [zn.x0 - 20, zn.y0 - 20]; const fz = sim.world.standZ(fx, fy);
  if (fz >= 0) { e.order = { verb: "move", x: fx, y: fy, z: fz, done: 0, n: 1, t: sim.tick }; }
  sim.apply({ type: "order", ids: [e.id], verb: "move", x: fx, y: fy });
  sim.board.ep++;
  const claimed = run(sim, 700, () => d.rq && d.rq[0] === "stick" && req[8] === d.id);
  assert.ok(claimed > 0, "D read the board and claimed the request: " + JSON.stringify([d.rq, req, d.job]));
  assert.ok(d.bel.some(f => f[0] === "need:stick" && f[6] === 2), "the request is in D's beliefs (src 2)");
  assert.ok(!e.rq && e.br === undefined, "the busy slime (on an order) did not go to the board: " + JSON.stringify([e.rq, e.br, e.job]));
  const sticks0 = () => sim.ents.ofKind("item").filter(s => s.item === "stick" && s.x >= zn.x0 && s.x <= zn.x1 && s.y >= zn.y0 && s.y <= zn.y1).reduce((q, s) => q + s.n, 0);
  const before = sticks0();
  let sawChop = false, sawIcon = false;
  const closed = run(sim, 4000, () => { if (d.job && d.job.k === "chop") sawChop = true; if (d.job && d.job.rq === "stick") sawIcon = true; return !bd.notes.some(x => x[0] === "need:stick"); });
  assert.ok(closed > 0, "the request closed once the sticks landed: " + JSON.stringify([bd.notes, d.job, d.rq]));
  assert.ok(sawChop && sawIcon, "D chopped, and its job was tagged with the request (the map shows its icon)");
  assert.ok(sticks0() >= before + 2, "the sticks are in the yard (" + before + " -> " + sticks0() + ")");
  assert.ok(!d.rq, "its errand is over");
  ok("A's 2-stick shortage was posted after " + posted + " ticks; D claimed it at the board (" + claimed + "), chopped and hauled, the request closed " + closed + " ticks later; E, on an order, never read the board");
}

// 3. claim expiry frees the work
{
  const sim = loadFixture("settled"), [a, b] = adults(sim);
  const bd = withBoard(sim);
  calm(a); calm(b);
  addNotice(bd, "need:log", bd.x, bd.y, bd.z, 4, sim.tick, 0, 99999, "rack", sim.tick);
  const req = bd.notes.find(x => x[0] === "need:log");
  put(sim, a, bd.x + 1, bd.y); put(sim, b, bd.x - 1, bd.y);
  read(sim, a, bd);
  assert.equal(req[8], a.id, "A took the request");
  read(sim, b, bd);
  assert.ok(!b.rq && req[8] === a.id, "B finds it taken");
  sim.tick += CLAIM_EXPIRY + 10;                                    // A never came back
  const logged = bd.notes.find(x => x[0] === "need:log");
  if (logged) logged[5] = sim.tick;                                 // (the request itself is still wanted: its poster repeated it)
  read(sim, b, bd);
  assert.ok(b.rq && b.rq[0] === "log" && req[8] === b.id, "after CLAIM_EXPIRY the work is free and B takes it: " + JSON.stringify([b.rq, req]));
  ok("a claim holds for " + CLAIM_EXPIRY + " ticks; a second slime is turned away, then takes over once it lapses");
}

// 4. cap and merge
{
  const sim = loadFixture("settled"), [a] = adults(sim);
  const bd = withBoard(sim);
  bd.notes.length = 0;
  for (let i = 0; i < BOARD_CAP + 10; i++) addNotice(bd, "food", bd.x + 10 * i, bd.y, bd.z, 5, sim.tick + i, 0, a.id, "", sim.tick + i);
  assert.equal(bd.notes.length, BOARD_CAP, "the board holds BOARD_CAP notices");
  assert.ok(!bd.notes.some(x => x[1] === bd.x), "the oldest went first");
  assert.ok(bd.notes.some(x => x[1] === bd.x + 10 * (BOARD_CAP + 9)), "the newest stayed");
  bd.notes.length = 0;
  addNotice(bd, "food", bd.x + 8, bd.y, bd.z, 5, 100, 0, 1, "", 100);
  addNotice(bd, "food", bd.x + 9, bd.y + 1, bd.z, 9, 200, 0, 2, "", 200);                    // the same patch, later
  addNotice(bd, "food", bd.x + 9, bd.y + 1, bd.z, 2, 50, 0, 3, "", 200);                     // older news does not overwrite
  addNotice(bd, "need:log", bd.x, bd.y, bd.z, 7, 100, 0, 1, "rack", 100);
  addNotice(bd, "need:log", bd.x + 5, bd.y, bd.z, 3, 300, 0, 2, "", 300);                    // a request for the same item: one notice, the count updates
  assert.equal(bd.notes.filter(x => x[0] === "food").length, 1);
  assert.equal(bd.notes.find(x => x[0] === "food")[4], 9);
  assert.equal(bd.notes.filter(x => x[0] === "need:log").length, 1);
  assert.equal(bd.notes.find(x => x[0] === "need:log")[4], 3);
  // posting and reading are bounded
  const c = adults(sim)[1]; calm(c);
  for (let i = 0; i < 12; i++) c.bel.push(["food", bd.x + 20 + 9 * i, bd.y, bd.z, 3, sim.tick - i, 0]);
  const w = post(sim, c, bd);
  assert.ok(w <= POST_N + 3, "a visit writes at most POST_N facts (and the shortages, the claim): " + w);
  for (let i = 0; i < 20; i++) addNotice(bd, "tree", bd.x, bd.y + 7 * i, bd.z, 1, sim.tick, 0, 99, "", sim.tick);
  const d = adults(sim)[2]; calm(d);
  const got = read(sim, d, bd);
  assert.ok(got <= READ_N, "a visit reads at most READ_N: " + got);
  ok("BOARD_CAP " + BOARD_CAP + " holds and the oldest expire; the same patch and the same item merge (the fresher wins); a visit writes " + w + " and reads " + got + " (caps " + POST_N + " / " + READ_N + ")");
}

// 5. gossip: A -> B -> C within a capped number of ticks; heard facts are src 1; the listener's fresher fact is kept
{
  const sim = loadFixture("settled"), [a, b, c] = adults(sim);
  const bd = withBoard(sim);
  bare(sim, bd.x, bd.y, [a, b, c], 30);
  for (const v of [a, b, c]) calm(v);
  const [x0, y0] = [bd.x + 14, bd.y - 12];
  put(sim, a, x0, y0); put(sim, b, x0 + 3, y0); put(sim, c, x0 + 6, y0);
  assert.ok(Math.abs(a.x - c.x) > 3, "A and C are not within chat range");
  if (process.env.DBG) console.log("  gossip", [a, b, c].map(v => [v.x, v.y, v.z, v.slp, JSON.stringify(v.rel)].join(" ")));
  const fr = (v, o) => { v.rel = [{ o: o.id, k: "friend", s: 1, w: "work" }]; };
  fr(a, b); fr(b, a); b.rel.push({ o: c.id, k: "friend", s: 1, w: "work" }); fr(c, b);
  bump(a, b, 0, 200); bump(b, c, 0, 200);                          // (and the points behind it: the daily tier refresh keeps friends it can find points for)
  const X = [bd.x - 30, bd.y + 25];
  a.bel.push(["dig", X[0], X[1], 1, 1, sim.tick, 0]);            // (a kind no look writes, so its age is the age it was told with)
  const t0 = sim.tick;
  const got = run(sim, 400, () => c.bel.some(f => f[0] === "dig" && f[6] === 1), [a, b, c]);
  if (process.env.DBG) console.log("  gossip after", [a, b, c].map(v => JSON.stringify(v.bel.filter(f => f[0] === "dig")) + JSON.stringify(v.rel)));
  assert.ok(got > 0, "the fact reached C: " + JSON.stringify(c.bel.filter(f => f[0] === "dig")));
  assert.ok(got <= 300, "within a capped number of ticks (" + got + ")");
  const f = c.bel.find(f => f[0] === "dig");
  assert.equal(f[5], t0, "it keeps its own age (heard, not new)");
  // never one the listener holds fresher; at most GOSSIP_N a chat
  const d1 = { bel: [["food", 50, 50, 1, 4, 1000, 0], ["tree", 60, 60, 1, 1, 900, 0], ["water", 70, 70, 1, 1, 800, 0]] }, d2 = { bel: [["food", 50, 51, 1, 9, 2000, 0]] };
  const sent = gossip(sim, d1, d2);
  assert.ok(d2.bel.some(g => g[0] === "food" && g[4] === 9), "the fresher fact the listener holds was not overwritten");
  assert.ok(d2.bel.length - 1 <= GOSSIP_N, "at most GOSSIP_N facts passed: " + (d2.bel.length - 1));
  ok("a fact passed A -> B -> C in " + got + " ticks (friends 3 cells apart, one chat a 100 ticks); it stays old, src 1; a fresher fact is never overwritten; " + GOSSIP_N + " a chat");
}

// 6. the cry for help reaches only the near
{
  const sim = loadFixture("settled"), [a, b, c, d] = adults(sim);
  const bd = withBoard(sim);
  bare(sim, bd.x, bd.y, [a, b, c, d], 30);
  for (const v of [a, b, c, d]) calm(v);
  const [x0, y0] = [bd.x + 14, bd.y - 12];
  put(sim, a, x0, y0); put(sim, b, x0 + 4, y0 + 1); put(sim, d, x0 + CRY_R, y0); put(sim, c, x0 + CRY_R + 6, y0);
  assert.ok(CRY_R > LOOK_R && d.x - a.x > LOOK_R && d.x - a.x <= CRY_R, "D is out of sight of A but within earshot");
  a.hunger = 0.1;
  const heard = run(sim, 80, () => d.bel.some(f => f[0] === "need:food"), [a, b, c, d]);
  assert.ok(heard > 0, "D, " + (d.x - a.x) + " cells off and out of sight, heard the cry: " + JSON.stringify(d.bel));
  assert.ok(b.bel.some(f => f[0] === "need:food"), "B, 4 cells off, knows too");
  assert.ok(!c.bel.some(f => f[0] === "need:food"), "C, " + (CRY_R + 6) + " cells off, did not");
  assert.equal(d.bel.find(g => g[0] === "need:food")[6], 1, "heard, so src 1");
  const w = loadFixture("settled"); const [p, q] = adults(w); calm(p); calm(q); put(w, p, bd.x, bd.y); put(w, q, bd.x + 3, bd.y); p.warm = 0.05;
  cryOut(w, p);
  assert.ok(q.bel.some(g => g[0] === "need:warm"), "a freezing slime cries out too (need:warm)");
  ok("a starving slime's cry (need:food) reached the slime " + (d.x - a.x) + " cells away, out of sight, after " + heard + " ticks and not the one " + (CRY_R + 6) + " away; a freezing one cries need:warm");
}

// 7. a designation reaches an idle slime through the board (OD-58)
{
  const sim = loadFixture("settled"), [a, b] = adults(sim);
  const bd = withBoard(sim);
  bare(sim, bd.x, bd.y, [a, b], 12);
  calm(a); calm(b);
  // a rock column to dig within reach of the camp
  let spot = null;
  for (let r = 6; r < 40 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (const dy of [-r, r]) {
    const x = sim.site.x + dx, y = sim.site.y + dy, z = sim.world.standZ(x, y);
    if (z > 1 && sim.world.mat(x, y, z - 1) !== 0 && Math.abs(z - sim.stock.z) <= 1) { spot = [x, y, z - 1]; break; }
  }
  assert.ok(spot, "found ground to dig");
  assert.ok(sim.apply({ type: "mine", op: "region", x0: spot[0], y0: spot[1], x1: spot[0] + 1, y1: spot[1] + 1, z: spot[2], layers: 1 }), "a dig designation: " + sim.lastBlocker);
  assert.ok(bd.notes.some(x => x[0] === "dig"), "the designation is written on the board");
  put(sim, a, bd.x + 1, bd.y); knowBoard(sim, a);
  const before = cands(sim, a).find(c => c.kind === "mine");
  assert.ok(!before || before.blocker, "before it reads, the idle slime has no dig it can take: " + JSON.stringify(before));
  const rd = run(sim, 600, () => a.bel.some(f => f[0] === "dig"));
  assert.ok(rd > 0, "A went to the board and read the notice");
  const after = cands(sim, a).find(c => c.kind === "mine");
  assert.ok(after && !after.blocker, "after reading, the dig is a job it can take: " + JSON.stringify(after));
  ok("a dig designation was posted; an idle slime had no dig job until it read the board (" + rd + " ticks), then had one");
}

// 8. save round trip of the notices and the beliefs read off them; determinism
{
  const make = () => {
    const sim = loadFixture("settled"), [a, b] = adults(sim);
    const bd = boardsOf(sim)[0];
    bare(sim, bd.x, bd.y, [a, b], 20);
    calm(a); calm(b);
    put(sim, a, bd.x + 1, bd.y); put(sim, b, bd.x - 2, bd.y);
    knowBoard(sim, a); knowBoard(sim, b);
    a.bel.push(["food", bd.x + 12, bd.y + 5, bd.z, 4, sim.tick, 0], ["need:stick", sim.stock.x0, sim.stock.y0, sim.stock.z, 3, sim.tick, 0]);
    return sim;
  };
  const s1 = make();
  for (let i = 0; i < 500; i++) s1.step();
  const bd = boardsOf(s1)[0];
  assert.ok(bd.notes.length > 0, "the board has notices to save");
  const h1 = s1.hash();
  const s2 = restore(toJSON(s1));
  assert.deepEqual(boardsOf(s2)[0].notes, bd.notes, "the notices survive a save");
  assert.equal(s2.hash(), h1, "the same state hash after a round trip");
  for (let i = 0; i < 120; i++) { s1.step(); s2.step(); }
  assert.equal(s1.hash(), s2.hash(), "and they stay in step");
  const s3 = make();
  for (let i = 0; i < 500; i++) s3.step();
  assert.equal(s3.hash(), h1, "determinism: the same start gives the same hash");
  ok("the board's " + bd.notes.length + " notices round-trip through a save (hash equal) and replay identically");
}

// 9. no village-wide read is left where the board stands in for it (source check)
{
  const read1 = (f) => readFileSync(join(here, "..", "src", "sim", f), "utf8");
  assert.ok(!/b\.sneed|b\.dem\.|b\.sc\b/.test(read1("blueprint.js").split("export function autoBuild")[1] || ""), "autoBuild reads the board, not the village's bed count");
  assert.ok(!/board\.dem\./.test(read1("knowledge.js")), "keep_food reads the board's notices");
  assert.ok(/boardNeed/.test(read1("blueprint.js")) && /boardNeed/.test(read1("knowledge.js")));
  assert.ok(!/ofKind\("wagon"\)/.test(read1("jobs.js")), "wagonHaul reads believed wagons");
  ok("autoBuild and keep_food read the board's notices; wagonHaul reads believed wagons");
}

// 10. the crowd: 60 slimes; leisure %, build_bed %, forage %, deaths, ms/tick, against 9.30 (17% leisure, 43% forage, 3.8% build_bed, 18 beds, 0.46 ms/tick at 3000 ticks)
{
  const CAP = Number(process.env.CROWD_TICKS) || 3000, N = 60;
  const sim = loadFixture("crowd");
  for (let g = 0; sim.ents.ofKind("villager").length < N && g < 400; g++) sim.spawnVillager();
  const before = sim.ents.ofKind("villager").length;
  const beds0 = sim.ents.ofKind("furniture").filter(f => f.f === "bed").length;
  for (const v of sim.ents.ofKind("villager")) v.thirst = v.energy = 1;
  const tally = {}; let samples = 0, posts = 0, reads = 0;
  const t0 = performance.now();
  for (let i = 0; i < CAP; i++) {
    sim.step();
    if (i % 20 === 0) for (const v of sim.ents.ofKind("villager")) { if (!isAdult(sim, v)) continue; const k = v.job && v.action ? v.job.k : "idle"; tally[k] = (tally[k] || 0) + 1; samples++; }
  }
  const ms = (performance.now() - t0) / CAP;
  const pc = (k) => Math.round(1000 * (tally[k] || 0) / samples) / 10, r1 = (x) => Math.round(x * 10) / 10;
  const leisure = r1(pc("leisure") + pc("idle")), deaths = before - sim.ents.ofKind("villager").length;
  const beds = sim.ents.ofKind("furniture").filter(f => f.f === "bed").length - beds0;
  const bd = boardsOf(sim)[0];
  console.log("   crowd " + N + " slimes, " + CAP + " ticks: leisure " + leisure + "% (post " + pc("post") + "%, check_board " + pc("check_board") + "%), build_bed " + pc("build_bed") + "%, forage " + pc("forage") + "%, chop " + pc("chop") + "%, deaths " + deaths + ", beds built " + beds + ", " + ms.toFixed(2) + " ms/tick, board holds " + bd.notes.length + " notices");
  console.log("   (9.30: leisure 17%, forage 43%, build_bed 3.8%, 18 beds, 0.46 ms/tick at 3000 ticks)");
  assert.ok(ms < 3, "a tick stays cheap: " + ms.toFixed(2) + " ms");
  assert.ok(bd.notes.length <= BOARD_CAP);
  ok("crowd: leisure " + leisure + "%, build_bed " + pc("build_bed") + "%, forage " + pc("forage") + "%, deaths " + deaths + ", " + ms.toFixed(2) + " ms/tick");
}
console.log("board ok (" + ((Date.now() - t00) / 1000).toFixed(1) + " s)");
