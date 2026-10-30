// Monsters and spawning (7.22): the magic cores make the dark dangerous. Monsters are ordinary `fauna` entities (rows below are spread into fauna.js FAUNA), so fear, the one melee
// swing, the inspector, the renderers and possession all treat them like the thornback; this file adds the rows, their one behaviour, and the SPAWNER.
//
// THE SPAWNER is world simulation, not a wave timer. Every PERIOD ticks it walks the ACTIVE chunks (monsters never spawn on sleeping or unloaded land; when a chunk is dropped or falls
// asleep its monsters go with it, which is the bounded entity budget: MAX live monsters at most, and a cap per 64 x 64 REGION that rises with mana). A chunk offers SPAWN POINTS (all pure
// functions of the seed, cached per chunk):
//   den      the centre of a dungeon room of kind "den" (dungeon.js)
//   cave     the centre of a dry chamber of a cave tunnel (caves.js chambersIn)
//   boss     the core chamber of a labyrinth: one guardian per core, spawned when its chunk is active, never again once slain (sim.wild.gk)
//   surface  a hashed column of the chunk, only where mana at the ground is band >= 2, and mostly at night
// A point rolls once per period with spawnRate(mana, kind, night) in 1/10000 (zero below band 1, rising with mana). The roll is a hash of (seed, point, period), so the spawner uses
// no random stream and the camp's history is untouched (there is no mana within 66 cells of a camp). A spawn needs: DARKNESS (no torch, lamp or fire within its radius + LIGHT_PAD), room under
// the region cap, nobody within SEE_R cells (monsters do not pop up in front of people), and for cave and den points an underground cell.
//
// BEHAVIOUR (`monster`): patrols round its home, hunts a villager who comes within `aggro` (a crawler RAIDS: from a home within RAID_R of the camp it reaches RAID_ADD farther), leashed to
// `leash` from home; a ranged row (the spitter) stands off and spits; a hurt one retreats. It walks greedily like every creature and so is stopped by what stops a creature: WALLS (solid cells),
// DOORS (a door cell is closed to monsters), and LIGHT (a `dark` row will not step into a lit cell). OD-49: it never steps onto a cell below band 1 (e.hr, a home radius, is the override a
// hand-placed monster carries, as in the pre-situated fixtures). Villagers flee by the thornback's rules (fear.js: `scare`), so walls, doors and light are the defence; there is no tower defence.
import { coresNear, manaOf, liveMana, bandOf, MANA_R } from "./core.js";
import { guardianSlain } from "./cm.js";
import { dungeonsIn } from "./dungeon.js";
import { chambersIn } from "./caves.js";
import { lightSources, inLight, underground } from "./light.js";
import { isNight } from "./season.js";
import { dropLoose } from "./items.js";
import { mix32 } from "./rng.js";
import { chunkKey } from "./cellkey.js";
import { NO_T } from "./util.js";

export const PERIOD = 100, PHASE = 55;     // the spawner runs when tick % PERIOD === PHASE
export const MAX = 90;                     // live monsters in the whole world (the entity budget)
export const REGION = 64;                  // cap region side (cells, all levels)
export const LIGHT_PAD = 3;                // a light keeps monsters from spawning this many cells beyond its own radius
export const SEE_R = 6;                    // no spawn this close to a villager
export const RAID_R = 40, RAID_ADD = 14;   // a crawler's home within RAID_R of the camp: it hunts RAID_ADD cells farther than its aggro
export const SURFACE_BAND = 2;             // surface spawns need this band at ground level
export const DAY_SURFACE = 8;              // by day a surface point rolls 1/8 as often

/** Rows. w = pick weight by mana band 0..4, where = spawn point kinds, drops = [{item, n:[lo,hi], p: percent}]. scare scales the fear it causes (1 = the thornback's). */
export const MONSTERS = {
  crawler: { label: "cave crawler", beh: "monster", mon: 1, hp: 16, tpc: 5, chase: 4, hostile: 1, scare: 0.35, fearDmg: 0.45, dmg: 5, hit: 0.6, cd: 40, aggro: 8, leash: 16, patrol: 5, dark: 1, raid: 1, swarm: [2, 4],
    w: [0, 6, 5, 4, 3], where: ["den", "cave", "surface"], drops: [{ item: "chitin", n: [1, 1], p: 60 }],
    curio: "A pale many-legged thing that lives in the dark of the deep caves and comes in swarms. Each is weak; together they are not. Light and doors keep them out." },
  coreback: { label: "coreback", beh: "monster", mon: 1, hp: 110, tpc: 8, chase: 6, hostile: 1, scare: 0.85, fearDmg: 0.8, dmg: 30, hit: 0.6, cd: 45, aggro: 7, leash: 18, patrol: 5, retreat: 0.3, regen: 2, old: 150,
    w: [0, 0, 2, 3, 4], where: ["den", "cave", "surface"], drops: [{ item: "core_hide", n: [1, 2], p: 100 }, { item: "core_shard", n: [1, 1], p: 35 }],
    curio: "A thornback that has lived too long near a core: its spines glow violet and it is not as heavy as it was, but it is quicker and meaner." },
  spitter: { label: "spitter", beh: "monster", mon: 1, hp: 26, tpc: 6, chase: 5, hostile: 1, scare: 0.5, fearDmg: 0.5, dmg: 9, hit: 0.55, cd: 70, aggro: 9, leash: 16, patrol: 4, range: 5, dark: 1,
    w: [0, 0, 2, 3, 3], where: ["den", "cave"], drops: [{ item: "venom_sac", n: [1, 1], p: 70 }, { item: "chitin", n: [1, 1], p: 40 }],
    curio: "A squat thing that lobs corrosive spit from a distance and backs away from anyone who closes in. Get in close with a spear, or keep out of its sight." },
  guardian: { label: "core guardian", beh: "monster", mon: 1, boss: 1, hp: 320, tpc: 7, chase: 6, hostile: 1, scare: 1, fearDmg: 0.9, dmg: 40, hit: 0.7, cd: 40, aggro: 9, leash: 12, patrol: 2, regen: 1,
    w: [0, 0, 0, 0, 0], where: ["boss"], drops: [{ item: "core_shard", n: [3, 5], p: 100 }, { item: "chitin", n: [2, 3], p: 100 }],
    curio: "A stone-skinned thing that stands over the core and does not leave it. Villagers will not go near it; a guided one might stand against it." },
};
export const ROSTER = Object.keys(MONSTERS);

// ---- the pure rules (tests call these) ----------------------------------------------------------------------------------

const KIND_X = { den: 15, cave: 10, surface: 10, boss: 0 };      // tenths
/** Spawn chance per period per point, in 1/10000. Zero below band 1; rises with mana (monotone); dens are richer, a surface point rolls rarely by day. */
export function spawnRate(mana, kind, night) {
  if (mana < 14) return 0;
  let r = Math.floor(((40 + 2 * mana) * (KIND_X[kind] || 0)) / 10);
  if (kind === "surface" && !night) r = Math.floor(r / DAY_SURFACE);
  return r;
}
/** The most monsters a 64 x 64 region carries, by the mana of the point that wants to spawn. Rises with mana. */
export function regionCap(mana) { return mana < 14 ? 0 : 2 + (mana >> 5); }
/** Is a point inside a light's reach (radius + LIGHT_PAD)? lights = lightSources(sim). */
export function lightBlocks(lights, x, y, z) {
  for (const [lx, ly, lz, r] of lights) {
    if (Math.abs(lz - z) > 1) continue;
    const dx = lx - x, dy = ly - y, rr = r + LIGHT_PAD;
    if (dx * dx + dy * dy <= rr * rr) return true;
  }
  return false;
}
/** Surface spawns happen only where the core's field reaches the ground strongly: band >= 2 at that cell. */
export const surfaceAllowed = (mana) => bandOf(mana) >= SURFACE_BAND;
/** The species a point of this kind and mana band offers, by weight, for the hash h. "" if none. */
export function pickSpecies(kind, band, h) {
  let tot = 0;
  for (const s of ROSTER) { const r = MONSTERS[s]; if (!r.boss && r.where.includes(kind)) tot += r.w[band]; }
  if (tot <= 0) return "";
  let n = h % tot;
  for (const s of ROSTER) { const r = MONSTERS[s]; if (r.boss || !r.where.includes(kind)) continue; if (n < r.w[band]) return s; n -= r.w[band]; }
  return "";
}

// ---- spawn points: pure per chunk, cached ----

/** {cores, pts:[{k, x, y, z, m, h}], boss:[{x, y, z, key}]} for chunk (cx, cy). A pure function of the seed. */
export function chunkInfo(def, cx, cy) {
  const X0 = cx << 4, Y0 = cy << 4, X1 = X0 + 15, Y1 = Y0 + 15, cores = coresNear(def, X0, Y0, X1, Y1, MANA_R), pts = [], boss = [];
  const add = (k, x, y, z) => { const m = manaOf(cores, x, y, z); if (m >= 14) pts.push({ k, x, y, z, m, h: mix32(mix32(x, y), z + 77) }); };
  if (cores.length) {
    for (const dun of dungeonsIn(def, X0, Y0, X1, Y1)) {
      for (const r of dun.rooms) {
        if (r.kind !== "den") continue;
        const x = (r.x0 + r.x1) >> 1, y = (r.y0 + r.y1) >> 1;
        if (x >= X0 && x <= X1 && y >= Y0 && y <= Y1) add("den", x, y, dun.s[r.j]);
      }
      const c = dun.core;
      if (c.x >= X0 && c.x <= X1 && c.y >= Y0 && c.y <= Y1) boss.push({ x: c.x, y: c.y, z: c.z, key: c.x + "," + c.y });
    }
    for (const c of chambersIn(def, X0, Y0, X1, Y1)) add("cave", c.x, c.y, c.z);
  }
  return { cores, pts, boss };
}
function infoOf(sim, cx, cy) {
  const k = sim.cache, key = chunkKey(cx, cy);
  if (!k.mi || k.mi.size > 3000) k.mi = new Map();
  let i = k.mi.get(key);
  if (!i) { i = chunkInfo(sim.def, cx, cy); k.mi.set(key, i); }
  return i;
}
/** Mana band at a cell (cached cores of its chunk). */
export function bandHere(sim, x, y, z) { const i = infoOf(sim, x >> 4, y >> 4); return i.cores.length ? bandOf(manaOf(i.cores, x, y, z)) : 0; }

// ---- the spawner ----

const REGION_KEY = (x, y) => (x >> 6) + "," + (y >> 6);
const monsters = (sim) => sim.ents.ofKind("fauna").filter(e => e.mon);
function freeStand(sim, x, y, z, h, lights) {
  const w = sim.world;
  for (let i = 0; i < 24; i++) {
    const g = mix32(h, i + 1), px = x + (i === 0 ? 0 : (g & 7) - 3), py = y + (i === 0 ? 0 : ((g >>> 3) & 7) - 3);
    if (!w.isWalkable(px, py, z) || lightBlocks(lights, px, py, z)) continue;
    if (sim.ents.at(px, py, z).some(id => sim.ents.get(id).kind === "fauna")) continue;
    return [px, py, z];
  }
  return null;
}
function place(sim, H, sp, c, home) {
  const e = H.spawnFauna(sim, sp, c[0], c[1], c[2]);
  e.mon = 1; e.home = home.slice();
  return e;
}

/** One spawner pass (called from faunaTick when tick % PERIOD === PHASE). H = fauna.js helpers (spawnFauna). Returns the number of monsters made. */
export function spawnPass(sim, H) {
  const w = sim.world, t = sim.tick, period = Math.floor(t / PERIOD), night = isNight(t);
  const live = monsters(sim), region = new Map();
  for (const e of live) if (!e.boss && !MONSTERS[e.sp].boss) { const k = REGION_KEY(e.home[0], e.home[1]); region.set(k, (region.get(k) || 0) + 1); }      // (a monster belongs to the region of its home; the guardian is outside the caps)
  let budget = MAX - live.length, made = 0, lights = null, vills = null;
  const gk = sim.wild.gk || [];
  for (const key of w.chunkKeys()) {
    const ch = w.chunks.get(key);
    if (!ch || ch.act !== 1 || ch.dz) continue;
    const info = infoOf(sim, ch.cx, ch.cy);
    if (!info.cores.length) continue;
    if (!lights) { lights = lightSources(sim); vills = sim.ents.ofKind("villager"); }
    const nearVillager = (x, y, z) => vills.some(v => Math.abs(v.x - x) <= SEE_R && Math.abs(v.y - y) <= SEE_R && Math.abs(v.z - z) <= 3);
    for (const b of info.boss) {                                  // the guardian: one per core, never again once slain
      if (gk.includes(b.key) || live.some(e => e.ck === b.key) || budget <= 0) continue;
      const c = freeStand(sim, b.x, b.y, b.z, mix32(b.x, b.y), []);
      if (!c) continue;
      const e = place(sim, H, "guardian", c, c); e.ck = b.key; e.cd = 20; budget--; made++;
    }
    const tries = info.pts.slice();
    const X0 = ch.cx << 4, Y0 = ch.cy << 4, sh = mix32(mix32(sim.seed ^ 0x5f3d, key), period);          // one hashed surface column per chunk per pass
    const sx = X0 + (sh & 15), sy = Y0 + ((sh >>> 4) & 15), sz = w.standZ(sx, sy);
    if (sz >= 0) { const m = liveMana(info.cores, sx, sy, sz); if (surfaceAllowed(m)) tries.push({ k: "surface", x: sx, y: sy, z: sz, m, h: sh }); }
    for (const p of tries) {
      if (budget <= 0) break;
      const mana = p.k === "surface" ? p.m : liveMana(info.cores, p.x, p.y, p.z);      // D48: a harvested core spawns nothing (the point only remembers where it is)
      if (mana < 14) continue;
      const roll = mix32(mix32(sim.seed ^ 0x6d6f6e, p.h), period) % 10000;
      if (roll >= spawnRate(mana, p.k, night)) continue;
      if (lightBlocks(lights, p.x, p.y, p.z) || nearVillager(p.x, p.y, p.z)) continue;
      if (p.k !== "surface" ? !underground(w, p.x, p.y, p.z) : underground(w, p.x, p.y, p.z)) continue;
      const home = freeStand(sim, p.x, p.y, p.z, p.h, lights);
      if (!home) continue;
      const rk = REGION_KEY(home[0], home[1]), have = region.get(rk) || 0, cap = regionCap(mana);
      if (have >= cap) continue;
      const sp = pickSpecies(p.k, bandOf(mana), mix32(roll, 3));
      if (!sp) continue;
      const row = MONSTERS[sp], n = Math.min(row.swarm ? row.swarm[0] + (mix32(roll, 5) % (row.swarm[1] - row.swarm[0] + 1)) : 1, cap - have, budget);
      for (let i = 0; i < n; i++) {
        const c = freeStand(sim, home[0], home[1], home[2], mix32(p.h, i + 9 + period), lights);
        if (!c) break;
        const e = place(sim, H, sp, c, home);
        if (p.k === "surface") e.sf = 1;                           // surface spawns burn off by day (below)
        region.set(rk, (region.get(rk) || 0) + 1); budget--; made++;
      }
    }
  }
  return made;
}

// ---- behaviour ----

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
function stepCell(w, e, dx, dy) {
  const nx = e.x + dx, ny = e.y + dy;
  if (w.isWalkable(nx, ny, e.z)) return [nx, ny, e.z];
  if (w.isWalkable(nx, ny, e.z + 1) && !w.isSolid(e.x, e.y, e.z + 1)) return [nx, ny, e.z + 1];
  if (w.isWalkable(nx, ny, e.z - 1) && !w.isSolid(nx, ny, e.z)) return [nx, ny, e.z - 1];
  return null;
}
function lightsNow(sim) {
  const k = sim.cache, key = sim.tick - (sim.tick % 20);
  if (k.mlt !== key || !k.ml) { k.ml = lightSources(sim); k.mlt = key; }
  return k.ml;
}
/** May this monster stand on the cell? Doors are closed to it, a `dark` row refuses light, and it keeps to its mana (band >= 1) or, hand-placed, its home radius. */
export function monsterMay(sim, e, row, x, y, z) {
  for (const id of sim.ents.at(x, y, z)) { const o = sim.ents.get(id); if (o.kind === "furniture" && o.f === "door") return false; }
  if (row.dark && inLight(lightsNow(sim), x, y, z)) return false;
  if (e.hr && Math.max(Math.abs(x - e.home[0]), Math.abs(y - e.home[1])) <= e.hr) return true;
  return bandHere(sim, x, y, z) >= 1;
}
function mwalk(sim, e, row, tx, ty, away) {
  let best = null, bd = away ? -1 : 1e9;
  const cur = Math.abs(e.x - tx) + Math.abs(e.y - ty);
  for (const [dx, dy] of DIRS) {
    const c = stepCell(sim.world, e, dx, dy);
    if (!c || !monsterMay(sim, e, row, c[0], c[1], c[2]) || sim.ents.at(c[0], c[1], c[2]).some(id => sim.ents.get(id).kind === "fauna")) continue;
    const d = Math.abs(c[0] - tx) + Math.abs(c[1] - ty);
    if (away ? d > bd : d < bd) { bd = d; best = c; }
  }
  if (!best || (away ? bd <= cur : bd >= cur)) return false;
  sim.ents.move(e, best[0], best[1], best[2]);
  return true;
}
/** Clear shot from a to b along the level (no solid cell between)? */
function clearShot(sim, a, b) {
  const n = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  for (let i = 1; i < n; i++) {
    const x = a.x + Math.round(((b.x - a.x) * i) / n), y = a.y + Math.round(((b.y - a.y) * i) / n);
    if (sim.world.isSolid(x, y, a.z) || sim.world.isSolid(x, y, a.z + 1)) return false;
  }
  return true;
}
const campOf = (sim) => (sim.stock ? { x: (sim.stock.x0 + sim.stock.x1) >> 1, y: (sim.stock.y0 + sim.stock.y1) >> 1 } : sim.site);

/** The one behaviour of every monster row. H = fauna.js helpers (FAUNA, nearestVillager, near1, swing). */
export function monster(sim, e, H) {
  const row = H.FAUNA[e.sp], t = sim.tick, home = e.home, r = sim.rng.stream("mon");
  if (e.sf && !isNight(t) && e.st !== "attack" && !H.nearestVillager(sim, e, 12) && t % 100 < 5 && r.int(30) === 0) { sim.ents.remove(e.id); sim.cache.iv++; return; }      // a surface spawn burns off by day
  const hd = Math.max(Math.abs(e.x - home[0]), Math.abs(e.y - home[1])), low = row.retreat && e.hp < row.retreat * e.mhp;
  const camp = campOf(sim), raider = row.raid && Math.max(Math.abs(home[0] - camp.x), Math.abs(home[1] - camp.y)) <= RAID_R;
  const see = row.aggro + (raider ? RAID_ADD : 0);
  const prey = !low && hd <= row.leash ? H.nearestVillager(sim, e, see) : null;
  if (prey) {
    const d = cheb(e, prey);
    if (row.range) {                                              // a spitter: stand off, spit, back away from anyone close
      if (d <= row.range && Math.abs(prey.z - e.z) <= 2 && clearShot(sim, e, prey)) {
        e.st = "attack";
        if (t >= e.ak) { e.ak = t + row.cd; e.sh = [prey.x, prey.y, prey.z, t, 0]; H.swing(sim, e, prey); }
        e.cd = d <= 2 && mwalk(sim, e, row, prey.x, prey.y, true) ? row.tpc : 8;
        return;
      }
      e.st = "hunt"; e.cd = mwalk(sim, e, row, prey.x, prey.y, false) ? row.chase : 20; return;
    }
    if (H.near1(e, prey)) {
      e.st = "attack";
      if (t >= e.ak) { e.ak = t + row.cd; e.sh = [prey.x, prey.y, prey.z, t, 1]; H.swing(sim, e, prey); }
      e.cd = 6; return;
    }
    e.st = d > row.aggro ? "raid" : "hunt";
    e.cd = mwalk(sim, e, row, prey.x, prey.y, false) ? row.chase : 20;
    return;
  }
  if (low || hd > row.patrol) {
    e.st = low ? "retreat" : "return";
    e.cd = mwalk(sim, e, row, home[0], home[1], false) ? row.tpc : 30;
    return;
  }
  e.st = "patrol";
  if (e.tx === NO_T) {
    e.cd = r.range(40, 160);
    e.tx = home[0] + r.range(-row.patrol, row.patrol); e.ty = home[1] + r.range(-row.patrol, row.patrol);
    return;
  }
  if ((e.x === e.tx && e.y === e.ty) || !mwalk(sim, e, row, e.tx, e.ty, false)) { e.tx = NO_T; e.cd = r.range(30, 90); return; }
  e.cd = row.tpc;
}

/** A monster died: its drops (core shards and parts as items), and a slain guardian is remembered so it never returns. */
export function monsterDrops(sim, tgt, att) {
  const row = MONSTERS[tgt.sp], r = sim.rng.stream("mon");
  for (const d of row.drops) if (r.int(100) < d.p) dropLoose(sim, d.item, r.range(d.n[0], d.n[1]), tgt.x, tgt.y, tgt.z);
  if (row.boss) { (sim.wild.gk = sim.wild.gk || []).push(tgt.ck); guardianSlain(sim, tgt.ck, att); }       // 7.23: the deed, and the harvest-or-leave choice (cm.js)
}
