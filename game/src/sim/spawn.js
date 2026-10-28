// The spawn (S16): where the camp is, what is stamped round it, and the validator that decides whether a place is a fair start.
//
// The world is endless and the same everywhere, but the early game must be solvable (GDD §11.10), so the camp is the one place the rules bend:
//   * defOf(seed, opts) searches outward from the origin, deterministically (a fixed spiral of candidates), for the first spawn whose
//     surroundings pass validateSpawn: clay, flint, malachite, wood, a ridge, iron and coal each have at least two separate sources within
//     REACH_R of the camp (REACH_R is generous because the land is bigger now), a cave is reachable, and the S14 deposits exist where the
//     biome does. Moving the spawn replaces the old "re-roll the seed": the same seed always gives the same world and the same spawn.
//   * the slice-critical content is "placed": a lake with a stream and clay banks (terrain.js colInto reads def.lake), two malachite stains
//     with a seam up to a green tell, and one cave with the thornback's lair and a malachite face. They are stamped by a pure rule keyed to
//     the spawn (the cells go in def.stamps, applied by genChunk after everything else), so generating chunks in any order still agrees.
// Nothing here runs per tick: a def is built once per (seed, options) and cached.
import { Rng, mix32 } from "./rng.js";
import { hash3 } from "./noise.js";
import { World, M, F, D } from "./world.js";
import { Entities } from "./entities.js";
import { cellIdx, cellXyz, chunkKey } from "./cellkey.js";
import { baseDef, colInto, dirtAt, genChunk, localIdx, WATER_LEVEL, SOFT_THICK, SITE_R, SITE_Z } from "./terrain.js";
import { activateChunk } from "./flora.js";

export const REACH_R = 64;         // validator: key inputs within this many cells of the landing site (§11.10 item 3)
export const WATER_NEAR = 13, BERRY_NEAR_R = 15, BERRY_MIN = 3;     // S17: the camp the search prefers
export const MAX_CANDIDATES = 40;  // spawn candidates tried before the best of them is kept
const KEEP = 255;                  // a stamp entry whose material is KEEP only touches flags

const DX8 = [1, 1, 0, -1, -1, -1, 0, 1], DY8 = [0, 1, 1, 1, 0, -1, -1, -1];
/** The k-th spawn candidate: the origin, then rings of eight points round it every 28 cells, each nudged by a hash. */
export function candidate(seed, k) {
  if (k === 0) return { x: 0, y: 0 };
  const ring = 1 + ((k - 1) >> 3), slot = (k - 1) & 7, R = 28 * ring, j = mix32(seed ^ 0x5a17, k);
  return { x: DX8[slot] * R + ((j & 15) - 8), y: DY8[slot] * R + (((j >>> 4) & 15) - 8) };
}

/** A def with a spawn: the stamped lake parameters, the placed content, the geo facts. */
export function buildDef(seed, opts, at) {
  const def = baseDef(seed, opts);
  def.spawn = { x: at.x, y: at.y, z: SITE_Z, r: SITE_R };
  const g = new Rng(mix32(seed ^ 0x1a4e, mix32(at.x, at.y))).stream("lake");
  const lr = g.range(10, 13), llx = g.range(-4, 4), lly = g.range(8, 10);          // S17: the lake's near shore is 8-11 cells from the camp (it was 14-22: villagers walked far to drink)
  def.lake = { r: lr, lx: at.x + llx, ly: at.y - (lr + lly) };
  def.geo = { caves: [], malachite: [], ridge: [], tells: [] };
  def.stamps = buildStamps(def);
  return def;
}

/** The placed content, as Map chunkKey -> flat [localIdx, mat, setFlags, clearFlags, ...]. */
function buildStamps(def) {
  const sp = def.spawn, seed = def.seed, geo = def.geo;
  const g = new Rng(mix32(seed ^ 0x57a3, mix32(sp.x, sp.y))).stream("geo");
  const virt = new Map(), hm = new Map(), t = { h: 0, b: 0, clay: 0, wet: 0 };
  const hAt = (x, y) => { const k = cellIdx(x, y, 0); let h = hm.get(k); if (h === undefined) { h = colInto(def, x, y, t).h; hm.set(k, h); } return h; };
  const dry = (x, y) => hAt(x, y) >= WATER_LEVEL + 3;
  const dist = (x, y) => Math.sqrt((x - sp.x) * (x - sp.x) + (y - sp.y) * (y - sp.y));
  const softAt = (x, y, z) => { const h = hAt(x, y), d = dirtAt(seed, x, y); return z <= h - d - 1 && z >= h - d - SOFT_THICK; };
  const put = (x, y, z, mat, set = 0, clr = 0) => virt.set(cellIdx(x, y, z), [mat, set, clr]);
  const at = (x, y, z) => virt.get(cellIdx(x, y, z));
  const isCarved = (x, y, z) => { const v = at(x, y, z); return !!v && v[0] === M.AIR; };

  /** A flat blob of one material grown inside the soft rock: an ellipsoid with a ragged edge. -> [idx] */
  const blob = (cx, cy, cz, rx, ry, rz, mat, salt) => {
    const cells = [];
    for (let dz = -rz; dz <= rz; dz++) for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
      const x = cx + dx, y = cy + dy, z = cz + dz, e = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz + 0.4);
      const wall = (hash3(seed ^ salt, x, y, z) % 100) / 300;
      if (e >= 1 - wall || !softAt(x, y, z) || at(x, y, z)) continue;
      put(x, y, z, mat); cells.push(cellIdx(x, y, z));
    }
    return cells;
  };

  // ---- malachite stains: a vein in the soft rock, a seam up through the soil to a stain on the surface ----
  const stain = (minR, maxR) => {
    for (let tries = 0; tries < 300; tries++) {
      const x = sp.x + g.range(-maxR, maxR), y = sp.y + g.range(-maxR, maxR), r = dist(x, y);
      if (r < minR || r > maxR || !dry(x, y)) continue;
      const h = hAt(x, y), z = h - dirtAt(seed, x, y) - 3;
      if (!softAt(x, y, z)) continue;
      const cells = blob(x, y, z, g.range(3, 5), g.range(3, 4), 1, M.MALACHITE, 0x5ca1);
      if (cells.length < 20) { for (const i of cells) virt.delete(i); continue; }
      let top = cells[0]; for (const i of cells) if (cellXyz(i)[2] > cellXyz(top)[2]) top = i;
      const [vx, vy, vz] = cellXyz(top), vh = hAt(vx, vy), seam = [];
      for (let zz = vz + 1; zz <= vh; zz++) { put(vx, vy, zz, M.MALACHITE, zz === vh ? F.NOGROW : 0); seam.push(cellIdx(vx, vy, zz)); }
      geo.malachite.push({ kind: "stain", cells: cells.concat(seam), tell: [vx, vy, vh] });
      return true;
    }
    return false;
  };
  stain(22, 36);
  stain(38, 56);

  // ---- the cave: a ramp cut into a hillside down to a chamber (§11.6: one surface entrance), with a malachite face in its far wall ----
  for (let tries = 0; tries < 800 && !geo.caves.length; tries++) {
    const px = sp.x + g.range(-34, 34), py = sp.y + g.range(-34, 34), r = dist(px, py);
    if (r < 16 || r > 36 || !dry(px, py)) continue;
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][g.int(4)], rx = g.range(4, 6), ry = g.range(3, 4);
    const z0 = hAt(px, py) + 1, n = 8, zf = z0 - n;
    if (zf < 3) continue;
    let ok = true;
    for (let i = 1; i <= n && ok; i++) { const x = px + dx * i, y = py + dy * i; ok = dry(x, y) && hAt(x, y) >= z0 - i - 1; }       // the ramp must stay in the hill: the floor column is always solid
    if (!ok) continue;
    const cx = px + dx * (n + rx), cy = py + dy * (n + rx);      // chamber centre, beyond the foot of the ramp
    colInto(def, px, py, t); const b0 = t.b; colInto(def, cx, cy, t);
    if (b0 !== 0 || t.b !== 0) continue;                         // the cave is in the meadow (the highland and marsh change the rock depths it was cut for)
    for (let y = cy - ry - 1; y <= cy + ry + 1 && ok; y++) for (let x = cx - rx - 1; x <= cx + rx + 1 && ok; x++) ok = dry(x, y) && hAt(x, y) >= zf + 5;
    for (let y = Math.min(py, cy - ry) - 1; y <= Math.max(py, cy + ry) + 1 && ok; y++) for (let x = Math.min(px, cx - rx) - 1; x <= Math.max(px, cx + rx) + 1 && ok; x++) for (let z = zf; z <= z0 + 1; z++) { const v = at(x, y, z); if (v && v[0] === M.MALACHITE) ok = false; }     // keep the hall out of the veins already placed
    if (!ok) continue;
    const air = [], floor = [];
    put(px, py, hAt(px, py), KEEP, F.NOGROW);                      // no tree on the mouth
    const carve = (x, y, z) => { if (z <= hAt(x, y) && !isCarved(x, y, z)) { put(x, y, z, M.AIR, F.NATURAL); air.push(cellIdx(x, y, z)); } };
    for (let i = 1; i <= n; i++) { const x = px + dx * i, y = py + dy * i; carve(x, y, z0 - i); carve(x, y, z0 - i + 1); }
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      const ex = (x - cx) / rx, ey = (y - cy) / ry, wall = (hash3(seed ^ 0xca7e, x, y, zf) % 100) / 300;     // ragged edge
      if (ex * ex + ey * ey >= 1 - wall) continue;
      for (let k = 0; k < 3; k++) if (k === 1 || ex * ex + ey * ey < 0.64) carve(x, y, zf + k);
      floor.push(cellIdx(x, y, zf));
    }
    for (let i = 0; i <= rx; i++) { const x = px + dx * (n + i), y = py + dy * (n + i); for (let k = 0; k < 3; k++) carve(x, y, zf + k); if (i > 0) floor.push(cellIdx(x, y, zf)); }   // the axis row joins ramp and hall
    geo.caves.push({ id: 0, mouth: [px, py, z0], cells: air, floor, cx, cy, zf, dir: [dx, dy] });
    for (let off = 0; off < 4; off++) {                          // a malachite face in the far wall of the hall
      const fx = cx + dx * (rx + 1 + off), fy = cy + dy * (rx + 1 + off), fz = zf + 1;
      if (softAt(fx, fy, fz) && !at(fx, fy, fz)) {
        const cells = blob(fx, fy, fz, 3, 3, 1, M.MALACHITE, 0xfa5e);
        if (cells.length) { geo.malachite.push({ kind: "cave", cells, tell: null }); break; }
      }
    }
    // one group of cells at the far end of the hall is foul from the start (underground.js decides what it fouls)
    let far = null, fd = -1;
    for (const i of floor) { const [x, y, z] = cellXyz(i), d = Math.abs(x - px) + Math.abs(y - py); if (d > fd) { fd = d; far = [x, y, z]; } }
    if (far && Math.abs(far[0] - cx) + Math.abs(far[1] - cy) >= 6) {
      for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if (isCarved(far[0] + xx, far[1] + yy, far[2])) put(far[0] + xx, far[1] + yy, far[2], M.AIR, F.NATURAL | F.GAS);
    }
  }

  const out = new Map();
  for (const [i, [mat, set, clr]] of virt) {
    const [x, y, z] = cellXyz(i), k = chunkKey(x >> 4, y >> 4);
    let a = out.get(k); if (!a) { a = []; out.set(k, a); }
    a.push(localIdx(x, y, z), mat, set, clr);
  }
  return out;
}

// ---- the validator ------------------------------------------------------------------------------------------------------

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** The chunks (sorted) within a radius of the spawn, made resident and grown in a throwaway world. */
function grow(def, R) {
  const sp = def.spawn, world = new World((cx, cy) => genChunk(def, cx, cy), def), ents = new Entities();
  for (let cx = (sp.x - R) >> 4; cx <= (sp.x + R) >> 4; cx++) for (let cy = (sp.y - R) >> 4; cy <= (sp.y + R) >> 4; cy++) activateChunk(world, ents, def, cx, cy, 0);
  return { world, ents };
}
/** Walk distance (path.js moves) from the landing site, up to `limit` steps. Map cellIdx -> steps. */
function walkMap(world, sp, limit) {
  const dist = new Map(), z0 = world.standZ(sp.x, sp.y);
  if (z0 < 0) return dist;
  const q = [cellIdx(sp.x, sp.y, z0)];
  dist.set(q[0], 0);
  for (let h = 0; h < q.length; h++) {
    const [x, y, z] = cellXyz(q[h]), d = dist.get(q[h]);
    if (d >= limit) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      let nz = -1;
      if (world.isWalkable(nx, ny, z)) nz = z;
      else if (world.isWalkable(nx, ny, z + 1) && !world.isSolid(x, y, z + 1)) nz = z + 1;
      else if (world.isWalkable(nx, ny, z - 1) && !world.isSolid(nx, ny, z)) nz = z - 1;
      if (nz < 0) continue;
      const n = cellIdx(nx, ny, nz);
      if (!dist.has(n)) { dist.set(n, d + 1); q.push(n); }
    }
  }
  return dist;
}

/**
 * Check the slice's capability chain against the land round a candidate spawn: clay, flint, malachite, iron, coal, wood and a draft ridge each have at
 * least two separate sources that a villager can walk to (or dig from the surface) within REACH_R of the camp. Also fills def.geo.ridge.
 * -> {ok, fails:[names], counts:{...}, cave:boolean, alt:{salt, peat, herb}}
 */
export function validateSpawn(def, parts) {
  const sp = def.spawn, { world, ents } = parts || grow(def, REACH_R + 16);
  const wd = walkMap(world, sp, 2 * REACH_R);
  const near = (x, y) => (x - sp.x) * (x - sp.x) + (y - sp.y) * (y - sp.y) <= REACH_R * REACH_R;
  const stand = (x, y, z) => wd.has(cellIdx(x, y, z));
  const access = (x, y, z) => {                    // a usable source: something reachable stands beside it (a cave floor, a clay bank), or the surface above it does (dig down)
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (z + dz >= 1 && stand(x + dx, y + dy, z + dz)) return true;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (stand(x + dx, y + dy, world.hsAt(x + dx, y + dy) + 1)) return true;
    return false;
  };
  const b = { clay: new Set(), flint: new Set(), malachite: new Set(), iron: new Set(), coal: new Set(), salt: new Set(), peat: new Set(), herb: new Set() };
  const MAT_KEY = { [M.CLAY]: "clay", [M.FLINT]: "flint", [M.MALACHITE]: "malachite", [M.IRONORE]: "iron", [M.COAL]: "coal", [M.SALT]: "salt", [M.PEAT]: "peat", [M.HERB]: "herb" };
  const ridges = [];
  for (const k of world.chunkKeys()) {
    const c = world.chunks.get(k), X0 = c.cx << 4, Y0 = c.cy << 4;
    if (!near(X0 + 8, Y0 + 8) && !near(X0, Y0) && !near(X0 + 15, Y0 + 15) && !near(X0 + 15, Y0) && !near(X0, Y0 + 15)) continue;
    for (let i = 0; i < c.mats.length; i++) {
      const m = c.mats[i], key = MAT_KEY[m];
      if (!key && !(c.flgs[i] & F.RIDGE)) continue;
      const lx = i & 15, ly = (i >> 4) & 15, z = i >> 8, x = X0 + lx, y = Y0 + ly;
      if (!near(x, y)) continue;
      if (c.flgs[i] & F.RIDGE) { if (stand(x, y, z + 1)) ridges.push([-z, Math.floor(Math.sqrt((x - sp.x) * (x - sp.x) + (y - sp.y) * (y - sp.y))), x, y, z + 1]); continue; }
      const hs = c.hs[ly * 16 + lx], deep = z <= hs - dirtAt(def.seed, x, y) - SOFT_THICK - 3;
      if ((key === "iron" || key === "coal") && deep) continue;           // the deep veins are a bonus: two shallow sources of each
      const bk = (x >> 4) + 4096 * (y >> 4);
      if (!b[key].has(bk) && access(x, y, z)) b[key].add(bk);
    }
  }
  ridges.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
  const geoRidge = [];
  for (const [, r, x, y, z] of ridges) {
    if (r < 14 || r > 52 || geoRidge.some(q => Math.abs(q.x - x) + Math.abs(q.y - y) < 12)) continue;
    geoRidge.push({ x, y, z });
    if (geoRidge.length === 2) break;
  }
  def.geo.ridge = geoRidge;
  const counts = { clay: b.clay.size, flint: b.flint.size, malachite: b.malachite.size, wood: 0, ridge: geoRidge.length, kilnsite: 0, stumptree: 0, iron: b.iron.size, coal: b.coal.size };
  for (const k of ["clay", "flint", "malachite", "iron", "coal"]) counts[k] = Math.min(counts[k], 2);
  let trees = 0, stumps = 0;
  for (const p of ents.ofKind("plant")) {
    if (p.species !== "tree" || !DIRS.some(([dx, dy]) => stand(p.x + dx, p.y + dy, p.z))) continue;
    if (near(p.x, p.y)) trees++;
    const d = Math.max(Math.abs(p.x - sp.x), Math.abs(p.y - sp.y));
    if (d >= 3 && d <= 40) stumps++;
  }
  counts.wood = trees >= 12 ? 2 : trees >= 4 ? 1 : 0;                           // a grove is a source; two groves' worth of trees counts twice
  counts.stumptree = Math.min(2, stumps);                                       // the smouldering-stump event has trees to burn within its widest search ring (3-40 cells)
  // S7b: a heat-4 layout can be BUILT in two ways (a kiln with a bellows beside it on flat ground near the camp, or a kiln on a ridge: counted above)
  const sites = new Set();
  for (let y = sp.y - 14; y <= sp.y + 14; y++) for (let x = sp.x - 14; x <= sp.x + 14; x++) {
    if (Math.max(Math.abs(x - sp.x), Math.abs(y - sp.y)) < 5) continue;
    const z = world.standZ(x, y);
    if (z < 0 || !wd.has(cellIdx(x, y, z)) || ents.at(x, y, z).length) continue;
    if (!DIRS.every(([dx, dy]) => world.standZ(x + dx, y + dy) === z && !ents.at(x + dx, y + dy, z).length)) continue;      // flat, with room for a bellows on every side
    sites.add((x >> 2) + 4096 * (y >> 2));                                      // one site per 4x4 block
  }
  counts.kilnsite = sites.size;
  const fails = Object.keys(counts).filter(k => counts[k] < 2);
  // S14: where the land has the biome, its deposit is within reach (land with none of the biome needs none: the base routes stand)
  const alt = { salt: b.salt.size, peat: b.peat.size, herb: b.herb.size };
  if (def.depth) {
    const area = [0, 0, 0];
    for (const k of world.chunkKeys()) {
      const c = world.chunks.get(k);
      for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) if (c.hs[ly * 16 + lx] >= WATER_LEVEL + 2 && near((c.cx << 4) + lx, (c.cy << 4) + ly)) area[c.bm[ly * 16 + lx]]++;
    }
    if (area[1] + area[2] >= 300 && alt.salt < 1) fails.push("salt");
    if (area[2] >= 200 && (alt.peat < 1 || alt.herb < 1)) fails.push("marsh");
  }
  let cave = false;
  for (const cv of def.geo.caves) cave = cave || cv.floor.some(i => wd.has(i));
  if (!cave) fails.push("cave");
  // S17 preferences (not requirements): drinkable water within WATER_NEAR cells and berry bushes within BERRY_NEAR_R, so the first days are not spent walking
  let water = 1e9, berries = 0;
  for (const k of world.chunkKeys()) {
    const c = world.chunks.get(k), X0 = c.cx << 4, Y0 = c.cy << 4;
    if (Math.abs(X0 + 8 - sp.x) > WATER_NEAR + 24 || Math.abs(Y0 + 8 - sp.y) > WATER_NEAR + 24) continue;
    for (let i = 0; i < c.mats.length; i++) {
      if (c.mats[i] !== M.WATER) continue;
      const x = X0 + (i & 15), y = Y0 + ((i >> 4) & 15), z = i >> 8;
      for (const [dx, dy] of DIRS) if (stand(x + dx, y + dy, z + 1)) { const d = Math.sqrt((x + dx - sp.x) * (x + dx - sp.x) + (y + dy - sp.y) * (y + dy - sp.y)); if (d < water) water = d; }
    }
  }
  for (const p of ents.ofKind("plant")) if (p.species === "berry" && Math.max(Math.abs(p.x - sp.x), Math.abs(p.y - sp.y)) <= BERRY_NEAR_R) berries++;
  const pref = [];
  if (water > WATER_NEAR) pref.push("water");
  if (berries < BERRY_MIN) pref.push("berries");
  return { ok: fails.length === 0, fails, counts, cave, alt, water: Math.round(water), berries, pref };
}

// ---- the search ---------------------------------------------------------------------------------------------------------

/** Natural land check before the (dearer) validator: the origin-side land must be dry enough that the stamped lake and clearing sit in real country. */
function landOk(seed, opts, at) {
  const d0 = baseDef(seed, opts);
  let dry = 0, n = 0;
  const t = { h: 0, b: 0, clay: 0, wet: 0 };
  for (let k = 0; k < 16; k++) { n++; if (colInto(d0, at.x + DX8[k & 7] * (k < 8 ? 52 : 70), at.y + DY8[k & 7] * (k < 8 ? 52 : 70), t).h >= WATER_LEVEL + 2) dry++; }
  return dry >= 12;
}

const memo = new Map();
/**
 * The definition of the world of a seed: options, spawn, stamps. `opts.spawn` {x, y} pins the camp (saves record it; no search); `opts.prefer` {x, y} is tried first and kept only if it passes the validator. Memoised (bounded). `def.gen` = {seed, attempts, ok, fails, counts, spawn} says how the
 * search went; if no candidate passes, the best one is kept (fewest failed checks) so a world always exists.
 */
export function defOf(seed, opts = {}) {
  seed = seed >>> 0;
  const key = seed + "|" + (opts.biomes !== false ? 1 : 0) + (opts.depth ? 1 : 0) + (opts.spawn ? "|" + opts.spawn.x + "," + opts.spawn.y : "") + (opts.prefer ? "|p" + opts.prefer.x + "," + opts.prefer.y : "");
  let def = memo.get(key);
  if (def) return def;
  if (opts.spawn) {                                          // a pinned spawn (a loaded save knows where its camp is; tests that hard-code positions pin it): no search
    def = buildDef(seed, opts, opts.spawn);
    const rep = validateSpawn(def);
    def.gen = { seed, attempts: 1, candidate: -1, ok: rep.ok, fails: rep.fails, counts: rep.counts, spawn: { x: opts.spawn.x, y: opts.spawn.y }, pinned: 1 };
    if (memo.size >= 48) memo.delete(memo.keys().next().value);
    memo.set(key, def);
    return def;
  }
  let best = null, bestRep = null, bestScore = 1e9, tried = 0;
  const first = opts.prefer ? 1 : 0;                      // a preferred spawn (tests that hard-code positions) is tried before the origin, and only if it is a fair start
  for (let k = -first; k < MAX_CANDIDATES; k++) {
    const at = k < 0 ? opts.prefer : candidate(seed, k);
    if (k > 0 && !landOk(seed, opts, at)) continue;
    tried++;
    const d = buildDef(seed, opts, at), rep = validateSpawn(d);
    d.gen = { seed, attempts: tried, candidate: k, ok: rep.ok, fails: rep.fails, counts: rep.counts, spawn: { x: at.x, y: at.y }, water: rep.water, berries: rep.berries, pref: rep.pref };
    const score = rep.fails.length * 10 + rep.pref.length;                  // a fair start first, then the one with water and berries at the door
    if (!best || score < bestScore) { best = d; bestRep = rep; bestScore = score; }
    if (rep.ok && !rep.pref.length) break;
  }
  def = best;
  if (memo.size >= 48) memo.delete(memo.keys().next().value);
  memo.set(key, def);
  return def;
}
