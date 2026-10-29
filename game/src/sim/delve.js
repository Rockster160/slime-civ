// The delve expedition (7.23): a crew goes into a labyrinth, maps it room by room, disarms the traps it spots, opens the caches it finds and comes home with the haul.
// It extends the S8/S17 expedition record (expedition.js: `kind: "delve"`, the same crew link, the same Recall button) but searches nothing: it drives its members with the ORDERS the player
// could give by hand (scout to the ruin's mouth, move into the labyrinth, disarm a spotted trap, move to a room or beside a cache), one at a time per member, every 20 ticks.
//
//   x = {kind: "delve", core (key "x,y"), name ("the north ridge"), ent {x, y, z, mx, my} (the door and the ruin's mouth; mx = -1 for a cave door), light (ticks of brand left),
//        vis [room indexes seen], skip [targets given up], pos {villager: [cell, tick]}, cw {cache cell: ticks of work}, dp {villager: the trap they went to disarm}, dn [traps dealt with], idle, loot {item: n}, opened, disarmed, rooms (total), ...the usual record}
//
// Recall rules suit the danger (a labyrinth hurts): a member below 60% health, the party's brands running low (DELVE_LIGHT ticks inside), hunger, DELVE_TIME in all, the whole labyrinth mapped,
// or the player's Recall. The guardian's chamber is left alone until the guardian is slain (a delve party does not fight; possession is the way). The stall summary names the trap or monster
// that blocks them: `x.stall` = "TRAP:<kind>" | "MONSTER:<species>" | "NO_PATH".
// Loot: a cache a party opens is packed straight into `x.loot` (it arrives with them, and is lost with them), and loose finds beside them (trap parts, a monster's drops) are swept in as well.
// Autonomy never delves (R8): lair.restricted still says "dungeon" for everyone but a delving party, and only the `expedition` command starts one.
import { World, M, F } from "./world.js";
import { dungeonOf, cacheAt, trapAt, roomAt, standable, cacheList, isAir } from "./dungeon.js";
import { coresNear, coreKey } from "./core.js";
import { ORDER_COMMANDS } from "./orders.js";
import { isSeen } from "./seen.js";
import { seenTraps, openCache } from "./traps.js";
import { coreByKey, coreName } from "./cm.js";
import { ITEMS, storeInZone, dropLoose } from "./items.js";
import { maxHp, fitness, ageDays } from "./villager.js";
import { CAMP } from "./board.js";
import { log } from "./chronicle.js";

export const DELVE_TIME = 14000;          // ticks in all (the walk there and back included)
export const DELVE_LIGHT = 6000;         // ticks of brand a party carries, burned only while somebody is inside the labyrinth
export const DELVE_RECALL_HP = 0.6;      // anyone below this share of their health -> turn back (a labyrinth hurts: the plain expedition says 0.5)
export const DELVE_RECALL_FOOD = 0.3;
export const DELVE_HOME_TIME = 2400;     // ticks to get back before the report is written anyway
export const CACHE_TICKS = 120;          // working a sealed cache open, standing beside it
export const STUCK_TICKS = 300;          // a member who has not moved this long with an order is stalled; twice this and the target is given up
const TRAP_R = 10;                       // a spotted trap this near is disarmed first
const HOME_R = 7;

const idx = World.idx, cheb = (a, b, c, d) => Math.max(Math.abs(a - c), Math.abs(b - d));

/** Where a delve can go in: the core's labyrinth and the door to use. -> {core, dun, name, ent} or null. `c.core` is a core key; else the dungeon nearest to the first member. */
export function delveTarget(sim, c, v0) {
  let core = c.core ? coreByKey(sim, c.core) : null;
  if (!core && !c.core && v0) {
    let bd = 1e9;
    for (const q of coresNear(sim.def, v0.x, v0.y, v0.x, v0.y, 260)) {
      const d = cheb(q.x, q.y, v0.x, v0.y);
      if (d < bd && dungeonOf(sim.def, q)) { bd = d; core = q; }
    }
  }
  const dun = core ? dungeonOf(sim.def, core) : null;
  if (!dun) return null;
  let en = dun.entrances.find(e => e.kind === "ruin") || dun.entrances[0];
  if (!en) return null;
  return { core: coreKey(core), dun, name: coreName(sim, core), ent: { x: en.x, y: en.y, z: en.z, mx: en.mouth ? en.mouth.x : -1, my: en.mouth ? en.mouth.y : -1 } };
}

/** The labyrinth of a record (cached on the sim: derived, never saved). */
export function dunOfDelve(sim, x) { const c = coreByKey(sim, x.core); return c ? dungeonOf(sim.def, c) : null; }
export const delving = (sim, v) => { if (!v.xp) return false; const x = sim.exp.list.find(q => q.id === v.xp && q.st !== "done"); return !!x && x.kind === "delve"; };
/** In the labyrinth: on its air, or under the ground within its footprint (a cave tunnel linking it counts: they are still delving). */
const inside = (sim, dun, v) => !!(sim.world.flags(v.x, v.y, v.z) & F.DUNGEON) || (v.x >= dun.bb.x0 && v.x <= dun.bb.x1 && v.y >= dun.bb.y0 && v.y <= dun.bb.y1 && v.z < sim.world.hsAt(v.x, v.y) - 1);

function order(sim, v, verb, x, y, z) { return ORDER_COMMANDS.order(sim, { type: "order", ids: [v.id], verb, x, y, z }); }
const orderKey = (o) => o.verb + ":" + o.x + "," + o.y + "," + o.z;

/** A cell beside (x, y, z) on its level that a villager can stand on, nearest to (fx, fy): [x, y, z] or null. */
function standBeside(w, x, y, z, fx, fy) {
  let best = null, bd = 1e9;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (!w.isWalkable(nx, ny, z)) continue;
    const d = Math.abs(nx - fx) + Math.abs(ny - fy);
    if (d < bd) { bd = d; best = [nx, ny, z]; }
  }
  return best;
}

/** The room's nearest stand cell to its middle, or null. */
function roomStand(dun, r) {
  const z = dun.s[r.j], mx = (r.x0 + r.x1) >> 1, my = (r.y0 + r.y1) >> 1;
  let best = null, bd = 1e9;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    if (!standable(dun, x, y, z)) continue;
    const d = Math.abs(x - mx) + Math.abs(y - my);
    if (d < bd) { bd = d; best = [x, y, z]; }
  }
  return best;
}

const skey = (x, y, z) => ((x + 100000) * 262144 + (y + 100000)) * 32 + z;
/** Steps from (x0, y0, z0) to every stand cell of the labyrinth within `limit` steps, under the pathfinder's own rules (dungeon.js reachable): Map(cell key -> steps), or null if the start is not on its floor. */
export function walkDist(dun, x0, y0, z0, limit) {
  if (!standable(dun, x0, y0, z0)) {                                        // on a stair step (solid) or in a tunnel: start from the floor cell beside or over/under it
    let st = null;
    for (const [dx, dy, dz] of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 0, -1], [-1, 0, -1], [0, 1, -1], [0, -1, -1]]) if (!st && standable(dun, x0 + dx, y0 + dy, z0 + dz)) st = [x0 + dx, y0 + dy, z0 + dz];
    if (!st) return null;
    [x0, y0, z0] = st;
  }
  const out = new Map([[skey(x0, y0, z0), 0]]), q = [[x0, y0, z0]];
  for (let h = 0; h < q.length; h++) {
    const [x, y, z] = q[h], d = out.get(skey(x, y, z));
    if (d >= limit) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      let nz = null;
      if (standable(dun, nx, ny, z)) nz = z;
      else if (standable(dun, nx, ny, z + 1) && isAir(dun, x, y, z + 1)) nz = z + 1;
      else if (standable(dun, nx, ny, z - 1) && isAir(dun, nx, ny, z)) nz = z - 1;
      if (nz === null || out.has(skey(nx, ny, nz))) continue;
      out.set(skey(nx, ny, nz), d + 1); q.push([nx, ny, nz]);
    }
  }
  return out;
}

/** The next thing for an idle member inside the labyrinth: {verb, x, y, z} or null (nothing left for them within reach). Targets are chosen by steps along the floor, not as the crow flies. */
function nextFor(sim, x, dun, v) {
  const w = sim.world, skip = x.skip, dm = walkDist(dun, v.x, v.y, v.z, 160);
  if (!dm) return null;                                                           // not on its floor (a cave link, a shaft): the next look finds them
  const at = (px, py, pz) => { const d = dm.get(skey(px, py, pz)); return d === undefined ? 1e9 : d; };
  // 1. a spotted trap close by: disarm it (the plain order; a slip sets it off)
  let best = null, bd = 1e9;
  for (const t of seenTraps(sim)) {
    if (!trapAt(dun, t.x, t.y, t.z) || skip.includes("disarm:" + t.x + "," + t.y + "," + t.z)) continue;
    const d = at(t.x, t.y, t.z);
    if (d <= 2 * TRAP_R && d < bd) { bd = d; best = t; }
  }
  if (best) return { verb: "disarm", x: best.x, y: best.y, z: best.z };
  // 2. a cache we can see: stand beside it (the work itself is done in `workCaches`)
  bd = 1e9; best = null;
  for (const c of dun.cacheCells || (dun.cacheCells = cacheList(dun))) {
    if (w.mat(c.x, c.y, c.z) !== M.CACHE || !isSeen(sim, c.x, c.y, c.z)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const sx = c.x + dx, sy = c.y + dy, d = at(sx, sy, c.z), key = "move:" + sx + "," + sy + "," + c.z;
      if (d < bd && !skip.includes(key)) { bd = d; best = { verb: "move", x: sx, y: sy, z: c.z }; }
    }
  }
  if (best) return best;
  // 3. the nearest room nobody has seen (the core chamber only once its guardian is dead)
  const slain = (sim.wild.gk || []).includes(x.core);
  bd = 1e9; best = null;
  dun.rooms.forEach((r, i) => {
    if (x.vis.includes(i) || (r.kind === "core" && !slain)) return;
    const st = roomStand(dun, r);
    if (!st) return;
    const key = "move:" + st[0] + "," + st[1] + "," + st[2], d = at(st[0], st[1], st[2]);
    if (d < bd && !skip.includes(key)) { bd = d; best = { verb: "move", x: st[0], y: st[1], z: st[2] }; }
  });
  return best;
}

/** A member standing beside a sealed cache works it open (CACHE_TICKS in all); the loot goes into the party's pack. */
function workCaches(sim, x, dun, vs) {
  const w = sim.world;
  for (const v of vs) {
    if (!inside(sim, dun, v)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = v.x + dx, cy = v.y + dy;
      if (!cacheAt(dun, cx, cy, v.z) || w.mat(cx, cy, v.z) !== M.CACHE) continue;
      const ci = idx(cx, cy, v.z);
      x.cw[ci] = (x.cw[ci] || 0) + 20;
      if (x.cw[ci] >= CACHE_TICKS) {
        w.set(cx, cy, v.z, M.AIR, w.flags(cx, cy, v.z) & ~F.PLAYER);
        openCache(sim, v, cx, cy, v.z, x.loot);
        delete x.cw[ci]; x.opened++; sim.cache.iv++;
      }
      break;
    }
  }
}
/** Loose things lying beside a member inside the labyrinth (trap parts, a monster's drop) are packed. */
function sweep(sim, x, dun, vs) {
  for (const v of vs) {
    if (!inside(sim, dun, v)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const id of sim.ents.at(v.x + dx, v.y + dy, v.z).slice()) {
      const e = sim.ents.get(id);
      if (!e || e.kind !== "item" || e.rv) continue;
      x.loot[e.item] = (x.loot[e.item] || 0) + e.n;
      sim.ents.remove(e.id); sim.cache.iv++;
    }
  }
}

/** Name what holds a stalled party up: the nearest seen trap, else the nearest monster, else no way through. */
function stallCause(sim, dun, vs, stuck) {
  let best = "", bd = 1e9;
  for (const v of stuck) {
    for (const t of seenTraps(sim)) { const d = cheb(t.x, t.y, v.x, v.y); if (d <= 6 && Math.abs(t.z - v.z) <= 3 && d < bd) { bd = d; best = "TRAP:" + t.k; } }
    for (const e of sim.ents.ofKind("fauna")) { if (!e.mon) continue; const d = cheb(e.x, e.y, v.x, v.y); if (d <= 9 && Math.abs(e.z - v.z) <= 3 && d - 0.5 < bd) { bd = d - 0.5; best = "MONSTER:" + e.sp; } }
  }
  return best || (stuck.length ? "NO_PATH" : "");
}

/** Every 20 ticks for a delve record: the recall rule, the party's orders, caches, finds and the stall summary. */
export function delveStep(sim, x, vs) {
  const dun = dunOfDelve(sim, x);
  if (x.st === "home") return delveHome(sim, x, vs);
  if (!dun) return "nothing";
  const w = sim.world, nin = vs.filter(v => inside(sim, dun, v));
  if (nin.length) x.light = Math.max(0, x.light - 20);
  for (const v of vs) v.br = x.light > 0 ? 1 : 0;
  for (const v of nin) {                                                       // rooms are mapped by being in them
    const r = roomAt(dun, v.x, v.y, v.z), i = r ? dun.rooms.indexOf(r) : -1;
    if (i >= 0 && !x.vis.includes(i)) x.vis.push(i);
  }
  workCaches(sim, x, dun, vs); sweep(sim, x, dun, vs);
  // the recall rule
  let why = "";
  if (vs.some(v => v.hp < DELVE_RECALL_HP * maxHp(v, fitness(v, ageDays(sim, v))))) why = "wounded";
  else if (x.light <= 0) why = "light";
  else if (vs.some(v => v.hunger < DELVE_RECALL_FOOD)) why = "food";
  else if (sim.tick >= x.deadline) why = "time";
  // the orders
  const stuck = [];
  let busy = 0;
  for (const v of vs) {
    const ci = idx(v.x, v.y, v.z), p = x.pos[v.id];
    if (!p || p[0] !== ci) x.pos[v.id] = [ci, sim.tick];
    const still = sim.tick - x.pos[v.id][1];
    const dp = x.dp[v.id];
    if (dp && !v.order && sim.trp.done.includes(idx(dp[0], dp[1], dp[2]))) { if (!x.dn.includes(idx(dp[0], dp[1], dp[2]))) { x.dn.push(idx(dp[0], dp[1], dp[2])); x.disarmed++; } delete x.dp[v.id]; }         // a trap they went for is gone (defused, or set off in their face)
    if (v.order && !v.poss) {
      busy++;
      if (still >= STUCK_TICKS && v.order.verb !== "scout") stuck.push(v);
      if (still >= 2 * STUCK_TICKS) { x.skip.push(orderKey(v.order)); v.order = null; x.pos[v.id] = [ci, sim.tick]; busy--; }
      else continue;
    }
    if (v.poss) continue;
    if (!inside(sim, dun, v)) {                                                     // on the way in: the ruin's mouth by scouting, then down the stair to the door
      const e = x.ent, far = e.mx >= 0 && cheb(v.x, v.y, e.mx, e.my) > 4 && v.z >= w.hsAt(v.x, v.y) - 1;
      if (far) order(sim, v, "scout", e.mx, e.my, 0); else order(sim, v, "move", e.x, e.y, e.z);
      busy++;
      continue;
    }
    const nx = nextFor(sim, x, dun, v);
    if (nx) { order(sim, v, nx.verb, nx.x, nx.y, nx.z); busy++; if (nx.verb === "disarm") x.dp[v.id] = [nx.x, nx.y, nx.z]; }
  }
  const fear = vs.filter(v => (v.fear || 0) > 0.6);
  x.stall = stallCause(sim, dun, stuck.concat(fear), stuck.concat(fear));
  x.rooms = dun.rooms.length; x.mapped = x.vis.length;
  x.idle = busy || vs.some(v => v.order) || nin.length < vs.length ? 0 : x.idle + 1;
  if (!why && x.idle >= 5) why = "mapped";                                        // nothing left for 100 ticks and everybody is in
  return why;
}

function delveHome(sim, x, vs) {
  const c = CAMP(sim.stock);
  for (const v of vs) {
    v.br = 0;
    if (!v.order && !v.poss && cheb(v.x, v.y, c.x, c.y) > HOME_R) order(sim, v, "scout", c.x, c.y, 0);
  }
  x.stall = "";
  const back = vs.every(v => cheb(v.x, v.y, c.x, c.y) <= HOME_R);
  return back || sim.tick - x.t1 > DELVE_HOME_TIME ? "done" : "";
}

/** The party is home (or gone): unpack the haul into the stockpile, write the report. */
export function finishDelve(sim, x) {
  let n = 0;
  const bits = [];
  for (const [item, c] of Object.entries(x.loot)) {
    if (!ITEMS[item] || c <= 0) continue;
    const rest = storeInZone(sim, item, c);
    if (rest > 0) dropLoose(sim, item, rest, sim.stock.x0, sim.stock.y0, sim.stock.z);
    n += c; bits.push(c + " " + ITEMS[item].label);
  }
  x.st = "done";
  const names = x.ids.map(id => sim.ents.get(id)).filter(Boolean).map(v => v.name);
  const reason = { mapped: "mapped it", wounded: "turned back, someone hurt", light: "turned back, the brands burned low", food: "turned back, short of food", time: "out of time", recall: "recalled", lost: "lost", nothing: "found no way in" }[x.why] || x.why;
  x.rep = "The delve into the labyrinth of " + x.name + " is over (" + reason + "): " + x.mapped + " of " + x.rooms + " rooms mapped, " + x.disarmed + (x.disarmed === 1 ? " trap" : " traps") + " disarmed, " + x.opened + (x.opened === 1 ? " cache" : " caches") + " opened"
    + (n ? ", " + bits.join(", ") + " brought home" : ", nothing brought home") + (x.lost ? ". Lost: " + x.lost + (x.lost === 1 ? " villager" : " villagers") : "") + (names.length ? ". Back: " + names.join(", ") : "") + ".";
  log(sim, "MILESTONE", x.rep, x.ids, { exp: x.id, brought: n, lost: x.lost || 0, mapped: x.mapped }, 2);
  for (const id of x.ids) { const v = sim.ents.get(id); if (v) { delete v.xp; delete v.br; v.order = null; v.rp = 1; } }
  sim.board.ep++;
  const done = sim.exp.list.filter(q => q.st === "done");
  while (done.length > 1) sim.exp.list.splice(sim.exp.list.indexOf(done.shift()), 1);
}
