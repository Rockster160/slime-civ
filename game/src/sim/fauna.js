// Fauna (GDD §13.6, §13.7, Appendix B): data rows plus one small generic behaviour module, and the ONE melee swing.
//
// A creature is an entity {kind:"fauna", sp, x,y,z, hp, mhp, cd (ticks to its next action), st, tx,ty (wander target), n (flee steps left),
// home:[x,y,z], ak (tick it may swing again), ht/hd (last hit: tick, damage; -1 = a miss, for hit feedback), lh (tick last hurt), rv/rt (hunt reservation)}.
// Everything is plain data (saved + hashed with the entities). sim.wild = {init, tbd} (tbd = tick the thornback last died, -1 none).
// Randomness comes from named streams ("fauna", "melee"), so adding fauna reshuffles nothing else.
//
// hopper     small huntable game: wanders the meadow, breeds slowly, bolts in short bursts from anyone close (so a hunter can catch it).
// thornback  the one wounding fauna: 150 HP, lives in the cave lair, patrols near it, aggressive inside its territory, rare outside it
//            (aggro 5 beyond the territory, a leash), retreats when hurt, regenerates slowly, leaves carrion; a new one may move in after a long time.
// More fauna later = one more row (and a behaviour name).
import { DUR_DAY } from "./clock.js";
import { log, once } from "./chronicle.js";
import { award } from "./titles.js";
import { dropLoose } from "./items.js";
import { sight } from "./discovery.js";
import { geneMul, fitness, ageDays } from "./villager.js";
import { kill } from "./population.js";
import { lairHome, inTerritory } from "./lair.js";
import { r3, clamp, NO_T } from "./util.js";
import { penById } from "./farm.js";
import { floraCounts, REGION_R } from "./plants.js";
import { mix32 } from "./rng.js";
import { BIOMES, biomeAt, HIGHLAND, MARSH } from "./biome.js";
import { World } from "./world.js";
import { wolf as wolfBehave, grazer as grazerBehave, TURN_TICKS } from "./packs.js";
import { depthOn, dryAir, deposits } from "./depth.js";
import { feel, fearMul, placeOf } from "./memory.js";
import { MONSTERS, monster as monsterBehave, monsterDrops, spawnPass, PERIOD as SPAWN_PERIOD, PHASE as SPAWN_PHASE } from "./monsters.js";

export const FAUNA = {
  hopper: { label: "hopper", beh: "hopper", hp: 18, tpc: 7, huntable: 1, tamable: 1, scare: 0, meat: 2, hide: 1, roam: 6, flee: { r: 4, tpc: 5, steps: 4, rest: 40 },
    curio: "A small hopping creature that bolts the moment anyone comes close. It might be good eating." },
  thornback: { label: "thornback", beh: "thornback", hp: 150, tpc: 8, chase: 7, hostile: 1, scare: 1, dmg: 40, hit: 0.6, cd: 45, aggro: 5, leash: 17, patrol: 6, retreat: 0.3, regen: 2, meat: 6, respawn: 25 * DUR_DAY, old: 150,
    curio: "A heavy bristled beast that lives in the cave and mauls whatever walks in. Villagers will not go near it; a guided one might stand against it." },
  // S14 (packs.js): the pack predator and the large grazer. huntable 2 = dangerous prey: the village hunts it on its own only with a spear in the stockpile, never a wolf.
  wolf: { label: "wolf", beh: "wolf", hp: 45, tpc: 5, chase: 4, hostile: 1, scare: 1, huntable: 2, dmg: 13, hit: 0.6, cd: 50, meat: 2, hide: 2, roam: 12, flee: { r: 8, tpc: 4, steps: 10, rest: 220 },
    curio: "A lean grey hunter that runs in a pack. By day it chases hoppers; on a winter night it will go after anyone who is alone. It will not come near a crowd or a fire." },
  grazer: { label: "grazer", beh: "grazer", hp: 120, tpc: 9, chase: 6, huntable: 2, tamable: 1, scare: 0, dmg: 24, hit: 0.55, cd: 60, fearDmg: 0.45, meat: 8, hide: 3, bone: 4, roam: 7, flee: { r: 5, tpc: 8, steps: 3, rest: 60 },
    curio: "A heavy grazer that walks slowly off from anyone who comes near. It is a great deal of meat, hide and bone, and it turns on whoever it is struck by or crowded up against." },
  ...MONSTERS,        // 7.22: cave crawler, coreback, spitter, core guardian (monsters.js: rows, behaviour and the spawner)
};
export const FEAR_AT = 0.6;          // above this an autonomous villager drops what they do and runs (§13.7)
export const FEAR_STOP = 0.3;        // ... and keeps running until it falls below this
export const FEAR_R = 14;            // how far a scary creature is seen
export const ARMED_BOLD = 0.5, ARMED_FEAR = 0.2;      // 7.22: a villager with a spear in hand fears a weak thing (scare < ARMED_BOLD: crawlers, spitters) a fifth as much, so a spear crew can clear a den
const FEAR_RISE = 0.3, FEAR_FALL = 0.02, FEAR_COMPANY = 0.03;     // per 10 ticks
export const BARE = 12, SPEAR = 50;  // damage of a bare-handed blow and of a copper spear thrust (GDD §13.6: three thrusts kill the thornback)
export const SPEAR_USES = 30;
export const HOPPER_START = 10;
export const HUNTS_TO_SEE = 3;               // S10: after this many hopper kills each further hunt is a chance to see how they behave (HUSBANDRY)

export function newWild() { return { init: 0, tbd: -1 }; }
export const faunaOf = (sim) => sim.ents.ofKind("fauna");
export const label = (e) => FAUNA[e.sp].label;

export function spawnFauna(sim, sp, x, y, z) {
  const row = FAUNA[sp];
  return sim.ents.add("fauna", { sp, x, y, z, hp: row.hp, mhp: row.hp, cd: 10, st: "idle", tx: NO_T, ty: NO_T, n: 0, home: [x, y, z], ak: 0, ht: 0, hd: 0, lh: 0, rv: 0, rt: 0, bd: sim.tick, tame: 0, pen: 0 });
}

// ---- movement (greedy, 4-neighbour; the same step rule as the pathfinder) ----

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function stepCell(w, e, dx, dy) {
  const nx = e.x + dx, ny = e.y + dy;
  if (w.isWalkable(nx, ny, e.z)) return [nx, ny, e.z];
  if (w.isWalkable(nx, ny, e.z + 1) && !w.isSolid(e.x, e.y, e.z + 1)) return [nx, ny, e.z + 1];
  if (w.isWalkable(nx, ny, e.z - 1) && !w.isSolid(nx, ny, e.z)) return [nx, ny, e.z - 1];
  return null;
}
/** One step towards (or, `away`, from) a point. -> true if it moved. `keepOut`: do not step into the thornback's territory (hoppers). */
function walk(sim, e, tx, ty, away, keepOut, box) {
  let best = null, bd = away ? -1 : 1e9;
  const cur = Math.abs(e.x - tx) + Math.abs(e.y - ty);
  for (const [dx, dy] of DIRS) {
    const c = stepCell(sim.world, e, dx, dy);
    if (!c || (keepOut && inTerritory(sim, c[0], c[1], c[2]))) continue;
    if (box && (c[0] < box.x0 || c[0] > box.x1 || c[1] < box.y0 || c[1] > box.y1 || c[2] !== box.z)) continue;      // a penned hopper stays inside its fence
    const d = Math.abs(c[0] - tx) + Math.abs(c[1] - ty);
    if (away ? d > bd : d < bd) { bd = d; best = c; }
  }
  if (!best || (away ? bd <= cur : bd >= cur)) return false;
  sim.ents.move(e, best[0], best[1], best[2]);
  return true;
}
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const near1 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1 && Math.abs(a.z - b.z) <= 1;

/** Nearest villager within `r` cells on about the same level (ties: lowest id). */
function nearestVillager(sim, e, r, pred) {
  let best = null, bd = 1e9;
  for (const v of sim.ents.ofKind("villager")) {
    if (Math.abs(v.z - e.z) > 3 || cheb(e, v) > r || (pred && !pred(v))) continue;
    const d = Math.abs(v.x - e.x) + Math.abs(v.y - e.y);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

// ---- behaviours ----

function hopper(sim, e) {
  const row = FAUNA.hopper, r = sim.rng.stream("fauna");
  if (e.tame) {                                                        // S10: a penned hopper grazes inside the fence and never bolts
    const pn = penById(sim, e.pen);
    if (!pn) { e.tame = 0; e.pen = 0; return; }
    if (e.tx === NO_T || e.tx < pn.x0 || e.tx > pn.x1 || e.ty < pn.y0 || e.ty > pn.y1) {
      e.cd = r.range(30, 120); e.tx = r.range(pn.x0, pn.x1); e.ty = r.range(pn.y0, pn.y1); return;
    }
    if ((e.x === e.tx && e.y === e.ty) || !walk(sim, e, e.tx, e.ty, false, false, pn)) { e.tx = NO_T; e.cd = r.range(20, 60); return; }
    e.cd = row.tpc;
    return;
  }
  if (e.st === "flee") {
    const th = nearestVillager(sim, e, 12);
    if (e.n > 0 && th) { e.n--; walk(sim, e, th.x, th.y, true, true); e.cd = row.flee.tpc; if (e.n === 0) { e.st = "rest"; e.cd = row.flee.rest; } return; }
    e.st = "rest"; e.cd = row.flee.rest; return;
  }
  const th = nearestVillager(sim, e, row.flee.r);
  if (th && e.st !== "rest") { e.st = "flee"; e.n = row.flee.steps; e.tx = NO_T; e.cd = 1; return; }
  if (e.st === "rest") e.st = "idle";
  if (e.tx === NO_T) {                                       // pause, then pick somewhere to graze
    const tx = e.x + r.range(-row.roam, row.roam), ty = e.y + r.range(-row.roam, row.roam);
    e.cd = r.range(30, 120);
    if (sim.world.standZ(tx, ty) >= 0) { e.tx = tx; e.ty = ty; }
    return;
  }
  if ((e.x === e.tx && e.y === e.ty) || !walk(sim, e, e.tx, e.ty, false, true)) { e.tx = NO_T; e.cd = r.range(20, 60); return; }
  e.cd = row.tpc;
}

function thornback(sim, e) {
  const row = FAUNA.thornback, t = sim.tick, r = sim.rng.stream("fauna"), home = e.home;
  const hd = Math.max(Math.abs(e.x - home[0]), Math.abs(e.y - home[1])), low = e.hp < row.retreat * e.mhp;
  let prey = null;
  if (!low && hd <= row.leash) prey = nearestVillager(sim, e, TERRITORY_SEE, (v) => inTerritory(sim, v.x, v.y, v.z) || cheb(e, v) <= row.aggro);
  if (prey) {
    if (near1(e, prey)) {
      e.st = "attack";
      if (t >= e.ak) { e.ak = t + row.cd; swing(sim, e, prey); }
      e.cd = 6; return;
    }
    e.st = "hunt";
    e.cd = walk(sim, e, prey.x, prey.y, false, false) ? row.chase : 20;
    return;
  }
  if (low || hd > row.patrol) {
    e.st = low ? "retreat" : "return";
    e.cd = walk(sim, e, home[0], home[1], false, false) ? row.tpc : 30;
    return;
  }
  e.st = "patrol";                                     // stand a while, then wander round the lair
  if (e.tx === NO_T) {
    e.cd = r.range(60, 200);
    const tx = home[0] + r.range(-row.patrol, row.patrol), ty = home[1] + r.range(-row.patrol, row.patrol);
    if (sim.world.standZ(tx, ty) >= 0 || sim.world.isWalkable(tx, ty, home[2])) { e.tx = tx; e.ty = ty; }
    return;
  }
  if ((e.x === e.tx && e.y === e.ty) || !walk(sim, e, e.tx, e.ty, false, false)) { e.tx = NO_T; e.cd = r.range(30, 90); return; }
  e.cd = row.tpc;
}
const TERRITORY_SEE = 16;
const BEHAVE = { hopper, thornback, wolf: (sim, e) => wolfBehave(sim, e, HELP), grazer: (sim, e) => grazerBehave(sim, e, HELP), monster: (sim, e) => monsterBehave(sim, e, HELP) };

/** S14: walk towards a cell like `walk`, but when the greedy step is blocked (a tree, a pond) take the first step of a real path to it. Used by wolves and grazers, which range farther than a hopper. */
function chase(sim, e, tx, ty, tz) {
  if (walk(sim, e, tx, ty, false, false)) return true;
  if (tz === undefined || tz < 0) return false;
  const r = sim.path.find(World.idx(e.x, e.y, e.z), World.idx(tx, ty, tz));
  if (!r.ok || !r.path.length) return false;
  const [x, y, z] = World.xyz(r.path[0]);
  if (!sim.world.isWalkable(x, y, z)) return false;
  sim.ents.move(e, x, y, z);
  return true;
}
const HELP = { FAUNA, spawnFauna, walk, chase, nearestVillager, near1, swing: (sim, a, b) => swing(sim, a, b), penById };      // what packs.js uses (it cannot import this file)

// ---- the tick ----

export function faunaTick(sim) {
  const w = sim.wild, t = sim.tick;
  if (!w.init) initFauna(sim);
  if (!w.i2 && depthOn(sim)) initWild2(sim);
  for (const e of sim.ents.ofKind("fauna").slice()) {
    if (e.st === "held") {                                             // S10: a hopper being carried to a pen travels with its captor (or is let go if the job ends)
      const h = sim.ents.get(e.by);
      if (h && h.job && h.job.k === "capture") { if (h.x !== e.x || h.y !== e.y || h.z !== e.z) sim.ents.move(e, h.x, h.y, h.z); continue; }
      e.st = "idle"; e.by = 0; e.cd = 20;
    }
    if (!sim.world.activeAt(e.x, e.y)) continue;                      // S16: creatures only move where the land is active (S17 dormancy would simulate them coarsely instead)
    if (t % 100 === 0 && e.hp < e.mhp && t - e.lh > 600 && FAUNA[e.sp].regen) e.hp = Math.min(e.mhp, e.hp + FAUNA[e.sp].regen);     // slow regeneration once left alone
    if (--e.cd > 0) continue;
    BEHAVE[FAUNA[e.sp].beh](sim, e);
  }
  if (t % SPAWN_PERIOD === SPAWN_PHASE) spawnPass(sim, HELP);        // 7.22: monsters spawn from the mana of the active land (monsters.js)
  if (t % 50 === 33) sightings(sim);
}

/** The first time a creature is seen by anyone it becomes a Curiosity (R27): shown in the Almanac, never an itch to tinker. */
function sightings(sim) {
  const d = sim.disc;
  for (const e of sim.ents.ofKind("fauna")) {
    const id = "wild:" + e.sp;
    if (d.curio.some(c => c.id === id)) continue;
    if (nearestVillager(sim, e, 10)) {
      d.curio.push({ id, row: "", craft: "", wild: 1, t: sim.tick, x: e.x, y: e.y, z: e.z, text: FAUNA[e.sp].curio });
    }
  }
}

/** S14: a wolf pack in the highland (else the far meadow) and a herd of grazers at a salt lick or in the marsh (else the far meadow). Own stream "fauna2". */
function initWild2(sim) {
  const w = sim.wild, r = sim.rng.stream("fauna2"), SITE = sim.site, world = sim.world;
  w.i2 = 1;
  const cols = (pred, lo, hi) => {
    const out = [];
    for (let y = SITE.y - 60; y <= SITE.y + 60; y++) for (let x = SITE.x - 60; x <= SITE.x + 60; x++) {         // S16: the 121-cell window round the camp
      const d = Math.max(Math.abs(x - SITE.x), Math.abs(y - SITE.y));
      if (d < lo || d > hi || !pred(world.biomeAt(x, y)) || sim.world.standZ(x, y) < 0) continue;
      out.push([d, x, y]);
    }
    return out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  };
  const herd = (sp, n, list, pk) => {
    if (!list.length) return 0;
    const [, hx, hy] = list[r.int(Math.min(list.length, 60))];
    let made = 0;
    for (let tries = 0; made < n && tries < 80; tries++) {
      const x = hx + r.range(-3, 3), y = hy + r.range(-3, 3), z = sim.world.standZ(x, y);
      if (z < 0 || sim.ents.at(x, y, z).some(id => sim.ents.get(id).kind === "fauna")) continue;
      const e = spawnFauna(sim, sp, x, y, z); e.home = [hx, hy, sim.world.standZ(hx, hy)]; e.pk = pk; e.fd = 0; made++;
    }
    return made;
  };
  herd("wolf", 4, cols(b => b === HIGHLAND, 36, 70).length ? cols(b => b === HIGHLAND, 36, 70) : cols(() => true, 46, 62), 1);
  let lick = saltLicks(sim, SITE.x, SITE.y, 60).map(c => [0, c.x, c.y]).filter(c => sim.world.standZ(c[1], c[2]) >= 0);
  if (!lick.length) lick = cols(b => b === MARSH, 36, 70);
  if (!lick.length) lick = cols(() => true, 40, 58);
  herd("grazer", 5, lick, 2);
}

/** The salt licks (S14 deposits) within `r` cells of a point: [{x, y}] by position. A pure function of the seed. */
export function saltLicks(sim, x, y, r) {
  const placed = ((sim.world.geo && sim.world.geo.salt) || []).filter(c => Math.abs(c.at[0] - x) <= r && Math.abs(c.at[1] - y) <= r).map(c => ({ x: c.at[0], y: c.at[1], r: 2 }));      // (placed content, if a world ever stamps a lick; nothing does yet)
  return deposits(sim, "salt", x, y, r).concat(placed);
}

export function initFauna(sim) {
  const w = sim.wild, r = sim.rng.stream("fauna"), SITE = sim.site;
  w.init = 1;
  for (let n = 0, tries = 0; n < HOPPER_START && tries < 600; tries++) {
    const x = SITE.x + r.range(-32, 32), y = SITE.y + r.range(-32, 32), z = sim.world.standZ(x, y);
    if (z < 0 || Math.abs(x - SITE.x) + Math.abs(y - SITE.y) < 12 || inTerritory(sim, x, y, z)) continue;
    spawnFauna(sim, "hopper", x, y, z); n++;
  }
  moveIn(sim);
}
function moveIn(sim) {
  const h = lairHome(sim);
  if (h && !sim.ents.ofKind("fauna").some(e => e.sp === "thornback")) { spawnFauna(sim, "thornback", h[0], h[1], h[2]); return true; }
  return false;
}

// ---- lifecycles (S10, GDD §11.8): young -> adult -> old -> die; no hard cap, the land caps it ----

/** Hopper life, in days (best guesses): adult at 4, old at 45 (mortality climbs from there), breeding pairs, the wild trickle in from the edges. */
export const HOPPER_LIFE = { adult: 4, old: 45, base: 0.003, oldRate: 0.02, oldRamp: 0.01, breed: 0.12, edge: 0.35, arrive: 0.15 };
export const TUFTS_PER_HOPPER = 22;          // the meadow carries one wild hopper per this many grass tufts (forage bounds the herd)
export const HOPPER_MIN_CAP = 3, HOPPER_MAX_CAP = 30;
export const EDGE_RING = [33, 48];           // immigrants step onto the map this far (Chebyshev) from the camp: the edge of the village's ground

/** The wild herd the land carries: from the forage (grass tufts) on the map, clamped. */
export function hopperCap(sim) { return clamp(Math.round(floraCounts(sim).tuft / TUFTS_PER_HOPPER), HOPPER_MIN_CAP, HOPPER_MAX_CAP); }

/**
 * ONE day of a hopper population, pure (tests/creatures drives it over years with no sim). ages = days old of each hopper, cap = what the land carries,
 * rnd() -> float in [0,1). opt.breed overrides the breeding chance per adult pair (a pen: fed or not), opt.edge false = nobody walks in (a pen).
 * -> {die: [indices], born: n, arrive: n}. Deaths rise past old age and with crowding over the cap (the herd starves back to the forage); births fall to
 * nothing as the herd fills the cap; when the herd is thin a few arrive from outside.
 */
export function hopperDay(ages, cap, rnd, opt = {}) {
  const L = HOPPER_LIFE, n = ages.length, die = [];
  const crowd = n > cap ? (n - cap) / cap : 0;
  let adults = 0;
  for (let i = 0; i < n; i++) {
    const a = ages[i];
    const p = L.base + 0.1 * crowd + (a >= L.old ? L.oldRate + L.oldRamp * Math.floor((a - L.old) / 10) : 0);
    if (rnd() < p) die.push(i); else if (a >= L.adult) adults++;
  }
  const left = n - die.length, room = Math.max(0, 1 - left / cap), rate = opt.breed === undefined ? L.breed : opt.breed;
  let born = 0;
  for (let k = Math.floor(adults / 2); k > 0; k--) if (rnd() < rate * room) born++;
  let arrive = 0;
  if (opt.edge !== false && left + born < Math.ceil(cap * L.edge) && rnd() < L.arrive) arrive = left + born === 0 ? 2 : 1;
  return { die, born, arrive };
}
const ageD = (sim, e) => Math.floor((sim.tick - e.bd) / DUR_DAY);
/** Creatures made before S10 have no birth tick: give them one, spread over the first part of life, by a hash of their id. */
function ensureBirth(sim, e) {
  if (e.bd !== undefined) return;
  const span = (FAUNA[e.sp].old || HOPPER_LIFE.old) * 0.6;
  e.bd = sim.tick - Math.floor((mix32(e.id, 31) / 4294967296) * span) * DUR_DAY;
  if (e.tame === undefined) { e.tame = 0; e.pen = 0; }
}
export const wildHoppers = (sim) => sim.ents.ofKind("fauna").filter(e => e.sp === "hopper" && !e.tame && Math.abs(e.x - sim.site.x) <= REGION_R && Math.abs(e.y - sim.site.y) <= REGION_R);       // S16: the herd the land round the camp carries (hoppers in the far land are not counted against it)
/** Hunting pressure (S10 UI): the wild herd against what the land carries. */
export function huntingPressure(sim) {
  const n = wildHoppers(sim).length, cap = sim.wild.cap || hopperCap(sim);
  return { n, cap, low: n <= Math.max(2, Math.floor(cap * 0.35)), gone: n === 0 };
}

/** Free cell next to a creature (or the cell itself when it is boxed in). */
function cellBeside(sim, e) {
  for (const [dx, dy] of DIRS) { const c = stepCell(sim.world, e, dx, dy); if (c) return c; }
  return [e.x, e.y, e.z];
}

/** Once a day: the wild herd ages, breeds against the forage, dies and is topped up from the edges; the thornback ages; a dead one may be replaced after a long time. */
export function faunaDaily(sim) {
  const r = sim.rng.stream("fauna"), w = sim.wild;
  for (const e of sim.ents.ofKind("fauna")) ensureBirth(sim, e);
  const hs = wildHoppers(sim), cap = (w.cap = hopperCap(sim));
  const res = hopperDay(hs.map(h => ageD(sim, h)), cap, () => r.float());
  const adults = hs.filter((h, i) => !res.die.includes(i) && ageD(sim, h) >= HOPPER_LIFE.adult);
  for (const i of res.die) { if (hs[i].st !== "held") sim.ents.remove(hs[i].id); }
  for (let k = 0; k < res.born && adults.length; k++) {
    const mum = adults[r.int(adults.length)], c = cellBeside(sim, mum);
    if (inTerritory(sim, c[0], c[1], c[2])) continue;
    spawnFauna(sim, "hopper", c[0], c[1], c[2]);
  }
  for (let k = 0; k < res.arrive; k++) {                       // a pair wanders in from the edge of the village's ground
    const cp = sim.site;
    for (let tries = 0; tries < 100; tries++) {
      const ring = r.range(EDGE_RING[0], EDGE_RING[1]), side = r.int(4), off = r.range(-EDGE_RING[1], EDGE_RING[1]);
      const x = cp.x + (side < 2 ? (side === 0 ? -ring : ring) : off), y = cp.y + (side < 2 ? off : (side === 2 ? -ring : ring)), z = sim.world.standZ(x, y);
      if (z >= 0 && !inTerritory(sim, x, y, z)) {
        const herd = BIOMES[biomeAt(sim.world, x, y)].herd;           // S12: few hoppers wander down from the highland
        if (herd < 100 && r.int(100) >= herd) continue;
        spawnFauna(sim, "hopper", x, y, z); break;
      }
    }
  }
  const tb = sim.ents.ofKind("fauna").find(e => e.sp === "thornback");      // the thornback ages by the same rules; an old one dies in its cave and the respawn rule below brings the next
  if (tb) {
    const a = ageD(sim, tb);
    if (a >= FAUNA.thornback.old && r.float() < 0.02 + 0.01 * Math.floor((a - FAUNA.thornback.old) / 10)) {
      sim.ents.remove(tb.id); w.tbd = sim.tick;
      log(sim, "MILESTONE", "The old thornback died in its cave.", [], { sp: "thornback", age: 1 }, 1);
    }
  }
  if (w.tbd >= 0 && sim.tick - w.tbd >= FAUNA.thornback.respawn + r.range(0, 5 * DUR_DAY) && moveIn(sim)) {
    w.tbd = -1;
    log(sim, "MILESTONE", "A new thornback has moved into the cave.", [], {}, 1);
  }
}

// ---- fear (per villager, every NEED_STEP ticks; sim.js) ----

/** Fear rises with how close a scary creature is and falls over time, faster in company (§13.7). Returns the new fear. */
export function fearStep(sim, v) {
  let near = 1e9, rise = 0, seen = "";
  for (const e of faunaOf(sim)) {
    const sc = FAUNA[e.sp].scare;
    if (!sc || Math.abs(e.z - v.z) > 3) continue;
    const d = cheb(e, v);
    if (d < near) near = d;
    if (d <= FEAR_R) { let q = sc * (1 - d / FEAR_R); if (sc < ARMED_BOLD && v.eq && v.eq.item === "copper_spear") q *= ARMED_FEAR; q *= fearMul(v, e.sp); if (q > rise) { rise = q; seen = e.sp; } }        // 7.22: a row's `scare` scales the fear it causes (1 = the thornback); the strongest creature in sight counts
  }
  let f = v.fear || 0;
  if (near === 1e9 && f === 0) return 0;
  if (seen && f < FEAR_AT) feel(sim, v, seen, "safe", 3);                                  // experiment: a scary creature in sight that has not yet frightened them is exposure without harm (habituation)
  let company = false;
  if (f > 0) for (const o of sim.ents.ofKind("villager")) if (o !== v && Math.abs(o.x - v.x) <= 3 && Math.abs(o.y - v.y) <= 3 && Math.abs(o.z - v.z) <= 1) { company = true; break; }
  f += (near <= FEAR_R ? FEAR_RISE * rise : 0) - (company ? FEAR_COMPANY : FEAR_FALL);
  return (v.fear = r3(Math.max(0, Math.min(1, f))));
}
/** The nearest scary creature within sight, or null. */
export function threatOf(sim, v) {
  let best = null, bd = 1e9;
  for (const e of faunaOf(sim)) {
    if (!FAUNA[e.sp].scare || Math.abs(e.z - v.z) > 3) continue;
    const d = cheb(e, v);
    if (d <= FEAR_R && d < bd) { bd = d; best = e; }
  }
  return best;
}

// ---- the melee swing: ONE function for the AI, the player and the creatures (§13.7: "one verb, same for AI and possessed") ----

/** What a blow from `a` looks like right now: {hit chance, damage}. A spear in hand, strength, hardiness and fitness count (§13.7). */
export function attackOf(sim, a) {
  if (a.kind === "fauna") { const r = FAUNA[a.sp]; return { hit: r.hit, dmg: r.dmg }; }
  const spear = !!(a.eq && a.eq.item === "copper_spear"), fit = fitness(a, ageDays(sim, a));
  return { hit: spear ? 0.8 : 0.7, dmg: (spear ? SPEAR : BARE) * geneMul(a.t.strength) * (0.85 + 0.15 * a.t.hardiness) * (0.5 + 0.5 * fit) };
}
/** One swing of `att` at `tgt` (both entities). Marks the target for hit feedback; returns true on a hit. */
export function swing(sim, att, tgt) {
  const r = sim.rng.stream("melee"), a = attackOf(sim, att), hit = r.chance(a.hit);
  const dmg = hit ? Math.max(1, Math.round(a.dmg * (0.85 + 0.3 * r.float()))) : 0;
  tgt.ht = sim.tick; tgt.hd = hit ? dmg : -1;
  if (!hit) return false;
  tgt.hp -= dmg;
  if (tgt.kind === "fauna") {
    tgt.lh = sim.tick;
    if (tgt.sp === "hopper") { tgt.st = "flee"; tgt.n = FAUNA.hopper.flee.steps; tgt.cd = 1; }
    else if (tgt.sp === "grazer" && !tgt.tame && att.kind === "villager") { tgt.st = "turn"; tgt.tg = att.id; tgt.tu = sim.tick + TURN_TICKS; tgt.cd = 2; }     // S14: struck, it comes back at whoever struck it
  } else {
    tgt.fear = Math.max(tgt.fear || 0, att.kind === "fauna" && FAUNA[att.sp].fearDmg !== undefined ? FAUNA[att.sp].fearDmg : 0.8);                   // damage is fear (§13.7); a grazer's blow frightens less than a beast's (hunters stand)
    once(sim, "firstWound", "DISASTER", tgt.name + " was wounded by the " + label(att) + ".", [tgt.id], {}, 2);
    if (tgt.hp > 0 && att.kind === "fauna") {                                // experiment (memory.js): hurt by this kind, and where it happened
      const mag = clamp(20 + dmg * 3, 20, 100), pl = placeOf(sim, tgt.x, tgt.y, tgt.z);
      feel(sim, tgt, att.sp, "bad", mag);
      if (pl) feel(sim, tgt, pl, "bad", mag >> 1);
    }
  }
  if (att.kind === "villager" && att.eq && att.eq.item === "copper_spear" && --att.eq.u <= 0) {
    log(sim, "MILESTONE", att.name + "'s copper spear broke.", [att.id], {}, 0);
    att.eq = null;
  }
  if (tgt.hp <= 0) defeat(sim, att, tgt);
  return true;
}
function defeat(sim, att, tgt) {
  if (tgt.kind === "villager") { kill(sim, tgt, label(att)); return; }
  const row = FAUNA[tgt.sp];
  if (att.kind === "villager") {                                           // experiment (memory.js): a win over this kind (a monster is a big one), and where it happened
    const mag = row.mon ? 80 : tgt.sp === "hopper" ? 6 : 50, pl = placeOf(sim, tgt.x, tgt.y, tgt.z);
    feel(sim, att, tgt.sp, "good", mag);
    if (pl && row.mon) feel(sim, att, pl, "good", mag >> 1);
  }
  if (row.mon) monsterDrops(sim, tgt, att);                                 // 7.22: core shards and parts, not meat
  if (row.meat) dropLoose(sim, "hopper_meat", row.meat, tgt.x, tgt.y, tgt.z);       // carrion / game: the baseline hauling brings it in
  if (row.hide) { dropLoose(sim, "hide", row.hide, tgt.x, tgt.y, tgt.z); sight(sim, "HIDE_WORKING", "skin", tgt.x, tgt.y, tgt.z, null); }     // S9: the skin comes off the carcass; whoever sees it worked may understand hide working
  if (row.bone) { dropLoose(sim, "bone", row.bone, tgt.x, tgt.y, tgt.z); sight(sim, "BONE_TOOL", "carcass", tgt.x, tgt.y, tgt.z, null); }    // S14: a big carcass leaves bone; one may split on a rock into an edge
  if (depthOn(sim) && row.meat >= 2) carcassSights(sim, tgt);
  sim.ents.remove(tgt.id);
  sim.cache.iv++;
  if (tgt.sp === "thornback") {
    sim.wild.tbd = sim.tick;
    log(sim, "MILESTONE", att.name + (att.poss ? ", guided, " : "") + " killed the thornback" + (att.kind === "villager" ? "." : "."), att.kind === "villager" ? [att.id] : [], { sp: "thornback", guided: att.poss ? 1 : 0 }, 2);
    if (att.kind === "villager") award(sim, att, "thornback slayer", false);                // S13
  } else if (att.kind === "villager" && tgt.sp !== "hopper") {
    once(sim, "firstKill_" + tgt.sp, "MILESTONE", att.name + " killed the first " + row.label + ".", [att.id], { sp: tgt.sp }, 2);
  } else if (att.kind === "villager") {
    if (once(sim, "firstHunt", "MILESTONE", att.name + " brought down the first hopper: fresh meat.", [att.id], {}, 1)) award(sim, att, "first hunter", false);
    if (!tgt.tame && ((sim.wild.k = (sim.wild.k || 0) + 1) >= HUNTS_TO_SEE)) sight(sim, "HUSBANDRY", "hunt", tgt.x, tgt.y, tgt.z, att);     // S10: the hunters notice how the young stay near a fed mother
  }
}

/** S14: meat left lying where it fell is a chance to see it keep: beside a salt lick (SALT_FOOD), or out in the cold dry wind (DRY_FOOD). Whoever is there may understand. */
export const LICK_R = 6;
function carcassSights(sim, e) {
  if (saltLicks(sim, e.x, e.y, LICK_R).length) sight(sim, "SALT_FOOD", "lick", e.x, e.y, e.z, null);
  if (dryAir(sim, e)) sight(sim, "DRY_FOOD", "wind", e.x, e.y, e.z, null);
}
