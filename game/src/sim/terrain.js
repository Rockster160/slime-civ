// Terrain for an endless world (S16): a PURE function of (seed, coordinates).
//
//   genChunk(def, cx, cy) -> {cx, cy, mats, flgs, hs, bm}   16 x 16 columns x D cells
//
// Order independence is the whole contract: generating chunk A then B gives the same cells as B then A, and the cells either side of a
// chunk border are what one continuous map would give, because nothing here is a whole-map pass. Every feature is a coordinate rule:
//   height / biome / water   value noise over (x, y) (noise.js; integer maths, no sin/exp/random)
//   rivers                   the contour of a noise field (distance to the 128-contour from the field's gradient), tapering out under a mask
//   lakes                    low basins where a slow noise is high
//   strata, flint, ores      per-cell hashes and noise thresholds per depth band
//   clay banks               next to the water, by the same distance field
//   ridges                   strict local height maxima over 5x5 (the halo columns are computed too)
//   caves                    7.20 networks (caves.js): tunnels between per-region nodes, spurs, rooms, entrance ramps; each chunk asks the owners round it
//   cores, mana              7.20 (core.js): a core per 256-cell region; ore weights, gems, crystal, outcrops and the mana bands read the field
//   gas pockets, deposits    per-region seeds, checked from the neighbouring regions
// The camp is the one place the rules bend: a "spawn" (spawn.js picks it) flattens a clearing, forces meadow round it, and stamps the
// slice-critical content (a lake with a stream and clay banks, a cave with the thornback's lair, malachite stains) from a pure rule keyed to
// the spawn. A `def` is {seed, biomes, depth, spawn|null, stamps|null, ...} - everything genChunk reads.
import { mix32 } from "./rng.js";
import { vnoise, hash2, hash3, clamp } from "./noise.js";
import { D, M, F } from "./world.js";
import { MEADOW, HIGHLAND, MARSH } from "./biome.js";
import { coresNear, manaOf, bandOf, oct, MANA_R } from "./core.js";
import { carveChunk } from "./caves.js";
import { carveHome } from "./worms.js";
import { dungeonOf, carveDungeon } from "./dungeon.js";

export const WATER_LEVEL = 11;     // water fills columns up to and including this z
export const SOFT_THICK = 5;       // cells of soft rock under the soil (the 2-8 band of §11.5, trimmed to the slice)
export const SITE_R = 8;
export const SITE_Z = 13;       // (one export per line: the bundler only sees the first name in `export const a, b`)
export const BIOME_CLEAR = 36;     // round the camp the land is always meadow
export const NAT_R = 46;           // ... and the natural lakes and rivers keep out (the stamped lake and stream stand in)
const CLEAR2 = BIOME_CLEAR * BIOME_CLEAR, NAT2 = NAT_R * NAT_R;
export const LAKE_T = 222;         // value-noise threshold of a lake basin

/** Soil depth under the topmost cell, 3 or 4. */
export const dirtAt = (seed, x, y) => 3 + (hash2(seed ^ 0xd17, x, y) & 1);

/** Cache of small per-region facts (worms, deposit centres), per def. Bounded: cleared when it grows. */
function rcache(def) { const c = def.rc || (def.rc = new Map()); if (c.size > 4096) c.clear(); return c; }

/** Per-seed options every def carries: how much highland / marsh (the thresholds). */
export function baseDef(seed, opts = {}) {
  seed = seed >>> 0;
  const pick = mix32(seed ^ 0xb10e, 7);
  const d = { seed, biomes: opts.biomes !== false, depth: !!opts.depth, hiT: 142 + (pick & 31), maT: 142 + ((pick >> 5) & 31), spawn: null, stamps: null, geo: null, rc: null, spawnCore: null, hAt: null, dunOf: null, dc: null };
  d.hAt = (x, y) => heightAt(d, x, y);
  d.dunOf = (c) => dungeonOf(d, c);                  // (caves.js asks for a core's dungeon through the def, so it need not import dungeon.js)               // (core.js and caves.js read the ground through this, so they need not import this file)
  return d;
}

// ---- one column ---------------------------------------------------------------------------------------------------------

/**
 * The surface of column (x, y): o.h (z of the topmost solid cell), o.b (biome), o.clay (0 none, 1 natural bank, 2 stamped bank),
 * o.wet (1 = under water at the surface). Pure; `o` is scratch the caller reuses.
 */
export function colInto(def, x, y, o) {
  const seed = def.seed, sp = def.spawn;
  const n = (vnoise(seed, 1, x, y, 32) * 5 + vnoise(seed, 2, x, y, 13) * 2 + vnoise(seed, 3, x, y, 5)) >> 3;
  let h = clamp(Math.floor(12 + ((n - 80) * 7) / 128), 11, 17);          // never below the waterline: water is only lake / river / pond
  const ddx = sp ? x - sp.x : 1e6, ddy = sp ? y - sp.y : 1e6, r2 = ddx * ddx + ddy * ddy;
  let b = MEADOW, clay = 0;
  if (def.biomes && r2 >= CLEAR2) {
    if (vnoise(seed, 31, x, y, 36) > def.hiT) b = HIGHLAND;
    else if (vnoise(seed, 32, x, y, 30) > def.maT) b = MARSH;
  }
  if (r2 >= NAT2) {
    // lake: a basin where a slow noise is high, a shore ramp around it
    const L = vnoise(seed, 51, x, y, 56);
    if (L > LAKE_T) h = Math.min(h, clamp(WATER_LEVEL - 1 - ((L - LAKE_T) >> 2), 2, WATER_LEVEL - 1));
    else if (L > LAKE_T - 14) { h = Math.min(h, WATER_LEVEL + 1 + ((LAKE_T - L) >> 1)); if (h > WATER_LEVEL && h <= WATER_LEVEL + 5) clay = 1; }
    // river: the contour R = 128 of a noise field, its distance estimated from the field's gradient (tenths of a cell); it exists where a slow mask is high and tapers out
    const m = vnoise(seed, 54, x, y, 96), half = clamp((m - 150) * 3, 0, 15);
    if (half > 0) {
      const R = vnoise(seed, 52, x, y, 48), Rx = vnoise(seed, 52, x + 1, y, 48), Ry = vnoise(seed, 52, x, y + 1, 48);
      const d = Math.abs(R + ((vnoise(seed, 53, x, y, 13) - 128) >> 3) - 128), g = Math.max(Math.abs(Rx - R), Math.abs(Ry - R), 2);
      const dist10 = Math.floor((d * 10) / g);
      if (dist10 <= half) h = Math.min(h, WATER_LEVEL - 1);
      else if (dist10 <= half + 55) { h = Math.min(h, WATER_LEVEL + Math.floor((dist10 - half + 5) / 10)); if (dist10 <= half + 40 && h > WATER_LEVEL && h <= WATER_LEVEL + 5) clay = 1; }
    }
  }
  if (sp) {                                                               // the stamped lake and the stream that feeds it
    const lk = def.lake;
    const dl = Math.sqrt((x - lk.lx) * (x - lk.lx) + (y - lk.ly) * (y - lk.ly)) - lk.r;
    if (dl < 0) h = WATER_LEVEL - 1 - Math.floor((-dl * 4) / lk.r);
    else if (dl < 6) h = Math.min(h, WATER_LEVEL + 1 + Math.floor(dl));
    const pn = def.pond;
    if (pn) {                                                             // S17: the pond by the camp
      const dp = Math.sqrt((x - pn.x) * (x - pn.x) + (y - pn.y) * (y - pn.y)) - pn.r;
      if (dp < 0) h = WATER_LEVEL - 1 - Math.floor((-dp * 2) / pn.r);
      else if (dp < 4) h = Math.min(h, WATER_LEVEL + 1 + Math.floor(dp));
    }
    if (y < lk.ly && y > lk.ly - 72) {
      const wob = Math.floor((((vnoise(seed, 4, y, 0, 24) - 128) * 14) / 128) * Math.min(1, (lk.ly - y) / 50));
      const dx = Math.abs(x - (lk.lx + wob));
      if (dx <= 1) h = Math.min(h, WATER_LEVEL - 1);
      else if (dx < 6) {
        h = Math.min(h, WATER_LEVEL + dx - 1);
        if (dx >= 2 && dx <= 4) for (const back of [15, 27]) if (Math.abs(y - (lk.ly - back)) <= 2) clay = 2;
      }
    }
    if (r2 <= SITE_R * SITE_R) h = sp.z;                                  // the starting clearing: flat, blended into the surroundings over 6 cells
    else if (r2 < (SITE_R + 6) * (SITE_R + 6)) h = sp.z + Math.trunc(((h - sp.z) * (Math.sqrt(r2) - SITE_R)) / 6);
  }
  h = clamp(h, 2, D - 6);
  // the highland stands two cells higher; the marsh is low and flat with ponds. Only dry land is touched.
  if (b === HIGHLAND && h > WATER_LEVEL + 2) h = clamp(h + 2, 2, D - 6);
  else if (b === MARSH && h > WATER_LEVEL + 2) h = vnoise(seed, 34, x, y, 6) > 186 ? WATER_LEVEL - 1 : WATER_LEVEL + 2;
  o.h = h; o.b = b; o.clay = clay; o.wet = h <= WATER_LEVEL ? 1 : 0;
  return o;
}

/** Surface height and biome of a column, for callers that want one number. */
const _t = { h: 0, b: 0, clay: 0, wet: 0 };
export function heightAt(def, x, y) { return colInto(def, x, y, _t).h; }
export function biomeOf(def, x, y) { return colInto(def, x, y, _t).b; }

// ---- region features ----------------------------------------------------------------------------------------------------

export const RS = 64;                       // landmark region cell (landmarks.js, scout.js)

const DEP = { salt: { salt: 71, p: 60, r: 2, b: [HIGHLAND, MARSH], m: M.SALT }, peat: { salt: 72, p: 65, r: 3, b: [MARSH], m: M.PEAT }, herb: { salt: 73, p: 70, r: 2, b: [MARSH], m: M.HERB } };
export const DEP_RS = 24;
/** The deposit of one kind seeded in region cell (rx, ry) (S14 salt / peat / herb), or null: {x, y, r}. By biome at its centre. */
export function depositOf(def, kind, rx, ry) {
  const rc = rcache(def), key = kind + rx + "," + ry;
  let d = rc.get(key);
  if (d !== undefined) return d;
  d = null;
  const row = DEP[kind], hh = hash2(def.seed ^ (row.salt * 0x9e37), rx, ry);
  if (hh % 100 < row.p) {
    const x = rx * DEP_RS + 4 + ((hh >>> 8) % 16), y = ry * DEP_RS + 4 + ((hh >>> 16) % 16), t = { h: 0, b: 0, clay: 0, wet: 0 };
    colInto(def, x, y, t);
    if (row.b.includes(t.b) && t.h >= WATER_LEVEL + 2) d = { x, y, r: row.r, kind };
  }
  rc.set(key, d);
  return d;
}
/** Deposits of a kind whose disc can touch the box. */
export function depositsIn(def, kind, x0, y0, x1, y1) {
  const out = [], r = DEP[kind].r;
  for (let rx = Math.floor((x0 - r) / DEP_RS); rx <= Math.floor((x1 + r) / DEP_RS); rx++) for (let ry = Math.floor((y0 - r) / DEP_RS); ry <= Math.floor((y1 + r) / DEP_RS); ry++) {
    const d = depositOf(def, kind, rx, ry);
    if (d) out.push(d);
  }
  return out;
}

export const GAS_RS = 32;
/** The gas pocket seeded in region cell (rx, ry), or null: {x, y, z} the centre of a 3x3 pocket of rock 7-9 below the surface. */
export function pocketOf(def, rx, ry) {
  const rc = rcache(def), key = "g" + rx + "," + ry;
  let p = rc.get(key);
  if (p !== undefined) return p;
  p = null;
  const hh = hash2(def.seed ^ 0x6a5, rx, ry);
  if (hh % 100 < 40) {
    const x = rx * GAS_RS + 4 + ((hh >>> 8) % 24), y = ry * GAS_RS + 4 + ((hh >>> 16) % 24), t = { h: 0, b: 0, clay: 0, wet: 0 };
    colInto(def, x, y, t);
    const sp = def.spawn, r2 = sp ? (x - sp.x) * (x - sp.x) + (y - sp.y) * (y - sp.y) : 1e9;
    if (t.h >= WATER_LEVEL + 4 && r2 >= 144) p = { x, y, z: t.h - 7 - ((hh >>> 24) % 3) };
  }
  rc.set(key, p);
  return p;
}

// ---- the chunk ----------------------------------------------------------------------------------------------------------

export const CELLS = 16 * 16 * D;
const HALO = 2, HW = 16 + 2 * HALO;
/** Index of a cell in a chunk's arrays (x, y may be any integers: only their low 4 bits count). */
export const localIdx = (x, y, z) => ((z << 4) | (y & 15)) << 4 | (x & 15);
const L = localIdx;

const _o = { h: 0, b: 0, clay: 0, wet: 0 };
/** A strict local height maximum over the 5x5 round (x, y)? `halo` is the height grid with a 2-cell margin. Ties go to the larger hash, so one cell of a plateau wins. */
function isPeak(def, halo, hx, hy, x, y, h) {
  const key = hash2(def.seed ^ 0x71d6e, x, y);
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    if (!i && !j) continue;
    const g = halo[(hy + j) * HW + hx + i];
    if (g > h || (g === h && hash2(def.seed ^ 0x71d6e, x + i, y + j) >= key)) return false;
  }
  return true;
}


// ---- 7.20: what a core's field does to the rock and the surface ----
const GEM_P = [0, 5, 18, 45, 100];                 // gems per 10000 rock cells, by band
const CRY_T = [999, 999, 246, 238, 228];           // crystal: value-noise threshold per band (bands 2+)
const CORE_T = [999, 999, 999, 240, 230];          // core-touched ore: bands 3+
/** Gems, crystal clusters and core-touched ore replace plain rock (and the ore veins) where the mana is. Pure per cell. */
function richen(def, cores, X0, Y0, mats, hs) {
  const seed = def.seed;
  for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
    const x = X0 + lx, y = Y0 + ly, h = hs[ly * 16 + lx];
    let near = false;
    for (const c of cores) if (oct(x - c.x, y - c.y) < MANA_R) { near = true; break; }
    if (!near || h < WATER_LEVEL + 3) continue;
    for (let z = h - dirtAt(seed, x, y) - 1; z >= 1; z--) {
      const i = L(lx, ly, z), m = mats[i];
      if (m !== M.SOFT && m !== M.STONE && m !== M.DEEP && m !== M.IRONORE && m !== M.COAL) continue;
      const band = bandOf(manaOf(cores, x, y, z, true));
      if (!band) continue;
      if (hash3(seed ^ 0x6e6d, x, y, z) % 10000 < GEM_P[band]) mats[i] = M.GEM;
      else if (band >= 2 && vnoise(seed, 81 + (z >> 1), x, y, 5) > CRY_T[band]) mats[i] = M.CRYSTAL;
      else if (band >= 3 && vnoise(seed, 85 + (z >> 1), x, y, 6) > CORE_T[band]) mats[i] = M.COREORE;
    }
  }
}
/** Over a SHALLOW core the rock breaks the surface: scattered hard-rock outcrops, crystal and gems close in; a spired core stands up a crystal spire. */
function outcrops(def, cores, X0, Y0, mats, flgs, hs) {
  const seed = def.seed;
  for (const c of cores) {
    if (!c.sh || c.x < X0 - 12 || c.x > X0 + 27 || c.y < Y0 - 12 || c.y > Y0 + 27) continue;
    for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
      const x = X0 + lx, y = Y0 + ly, d = oct(x - c.x, y - c.y), h = hs[ly * 16 + lx];
      if (d > 11 || h < WATER_LEVEL + 3) continue;
      const r = hash2(seed ^ 0x0c0a, x, y) % 100, i = L(lx, ly, h);
      if (c.spire && d <= 2) {                                           // the spire: a plus of crystal two cells high with a tall point
        const hgt = d === 0 ? 5 : d === 1 ? 3 : 2;
        for (let k = 0; k <= hgt && h + k < D; k++) mats[L(lx, ly, h + k)] = M.CRYSTAL;
        flgs[i] |= F.NOGROW;
      } else if (r < 46 - 3 * d) {
        mats[i] = d <= 4 && r % 3 === 0 ? M.CRYSTAL : r % 11 === 0 && d <= 8 ? M.GEM : M.STONE;
        flgs[i] |= F.NOGROW;
      }
    }
  }
}

export function genChunk(def, cx, cy) {
  const seed = def.seed, X0 = cx << 4, Y0 = cy << 4, sp = def.spawn;
  const mats = new Uint8Array(CELLS), flgs = new Uint8Array(CELLS), hs = new Int16Array(256), bm = new Uint8Array(256), cl = new Uint8Array(256);
  const halo = new Int16Array(HW * HW);
  const cores = coresNear(def, X0, Y0, X0 + 15, Y0 + 15), mb = new Uint8Array(256), md = new Uint8Array(256);       // 7.20: the cores whose field touches this chunk; the mana band at each column's surface and 8 cells under it (the map tint)
  for (let j = 0; j < HW; j++) for (let i = 0; i < HW; i++) {
    const inner = i >= HALO && i < HALO + 16 && j >= HALO && j < HALO + 16;
    colInto(def, X0 + i - HALO, Y0 + j - HALO, _o);
    halo[j * HW + i] = _o.h;
    if (inner) { const c = (j - HALO) * 16 + (i - HALO); hs[c] = _o.h; bm[c] = _o.b; cl[c] = _o.clay; }
  }
  // strata, ores and the ground cover of every column
  for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
    const x = X0 + lx, y = Y0 + ly, c = ly * 16 + lx, h = hs[c], b = bm[c];
    const dirt = dirtAt(seed, x, y), sb = h - dirt - SOFT_THICK;
    const dx = sp ? x - sp.x : 1e6, dy = sp ? y - sp.y : 1e6, r2 = dx * dx + dy * dy;
    const outcrop = h >= 14 && r2 > (SITE_R + 6) * (SITE_R + 6) && vnoise(seed, 5, x, y, 9) > 150;
    const marshClay = b === MARSH && h > WATER_LEVEL + 1 && vnoise(seed, 33, x, y, 7) > 148;
    let top = h <= WATER_LEVEL + 1 ? M.SAND : marshClay ? M.CLAY : outcrop ? M.STONE : M.GRASS;
    const bank = cl[c] === 2 || (cl[c] === 1 && (hash2(seed ^ 0xc1a9, x, y) % 100) < 55);
    for (let z = 0; z <= h; z++) {
      let m = z === h ? top : z >= h - dirt ? M.DIRT : z >= sb ? M.SOFT : M.STONE;
      if (bank && h > WATER_LEVEL && h <= WATER_LEVEL + 5 && z >= h - 2) m = M.CLAY;
      mats[L(lx, ly, z)] = m;
    }
    for (let z = h + 1; z <= WATER_LEVEL; z++) mats[L(lx, ly, z)] = M.WATER;
    for (let z = Math.min(sb - 3, D - 1); z >= 1; z--) if (mats[L(lx, ly, z)] === M.STONE) mats[L(lx, ly, z)] = M.DEEP;       // the deep rock: only iron tools dig it
    // flint nodules: single cells scattered through the soft rock
    for (let z = h - dirt - 1; z >= h - dirt - SOFT_THICK && z >= 0; z--) {
      if (mats[L(lx, ly, z)] === M.SOFT && (hash3(seed ^ 0xf11a7, x, y, z) % 1000) < 24) mats[L(lx, ly, z)] = M.FLINT;
    }
    if (h < WATER_LEVEL + 3) continue;                                    // no ore under the lake and the river beds
    // iron and coal: flat veins in the first two layers of the hard rock band; richer, rarer ones in the deep rock under it
    const bonus = cores.length ? manaOf(cores, x, y, sb - 2, true) >> 3 : 0;      // 7.20: ore is richer in a core's field (up to 31 off the threshold)
    if (vnoise(seed, 41, x, y, 9) > 214 - bonus) for (let z = sb - 1; z >= sb - 2 && z >= 1; z--) if (mats[L(lx, ly, z)] === M.STONE) mats[L(lx, ly, z)] = M.IRONORE;
    if (vnoise(seed, 42, x, y, 9) > 214 - bonus) for (let z = sb - 1; z >= sb - 2 && z >= 1; z--) if (mats[L(lx, ly, z)] === M.STONE) mats[L(lx, ly, z)] = M.COAL;
    for (let z = sb - 3; z >= 1; z--) {
      if (mats[L(lx, ly, z)] !== M.DEEP) continue;
      if (vnoise(seed, 44 + (z >> 1), x, y, 7) > 226 - bonus) mats[L(lx, ly, z)] = M.IRONORE;
      else if (vnoise(seed, 60 + (z >> 1), x, y, 7) > 226 - bonus) mats[L(lx, ly, z)] = M.COAL;
    }
    // malachite: stain blobs in the soft rock; the core of a blob has a seam up to a green stain on the surface (the tell)
    const mv = vnoise(seed, 47, x, y, 8);
    if (mv > 222) {
      for (let z = sb + 3; z >= sb + 1; z--) { const q = mats[L(lx, ly, z)]; if (q === M.SOFT || q === M.FLINT) mats[L(lx, ly, z)] = M.MALACHITE; }
      if (mv > 236 && b === MEADOW) for (let z = sb + 4; z <= h; z++) if (mats[L(lx, ly, z)] !== M.AIR && mats[L(lx, ly, z)] !== M.WATER) mats[L(lx, ly, z)] = M.MALACHITE;
    }
    // the highland shows iron at the surface and holds more of it just under the soil
    if (b === HIGHLAND) {
      const hv = vnoise(seed, 49, x, y, 10);
      if (hv > 226 && top === M.GRASS) mats[L(lx, ly, h)] = M.IRONORE;
      if (hv > 206) { const q = mats[L(lx, ly, sb + SOFT_THICK - 1)]; if (q === M.SOFT) mats[L(lx, ly, sb + SOFT_THICK - 1)] = M.IRONORE; }
    }
  }
  if (cores.length) richen(def, cores, X0, Y0, mats, hs);
  // S14 deposits: salt licks, peat bogs and herb beds on the surface of their biome
  if (def.depth) for (const kind of ["salt", "peat", "herb"]) {
    for (const d of depositsIn(def, kind, X0, Y0, X0 + 15, Y0 + 15)) {
      for (let y = Math.max(Y0, d.y - d.r); y <= Math.min(Y0 + 15, d.y + d.r); y++) for (let x = Math.max(X0, d.x - d.r); x <= Math.min(X0 + 15, d.x + d.r); x++) {
        if ((x - d.x) * (x - d.x) + (y - d.y) * (y - d.y) > d.r * d.r + 1) continue;
        const c = (y - Y0) * 16 + (x - X0), h = hs[c], i = L(x - X0, y - Y0, h);
        if (h >= WATER_LEVEL + 2 && mats[i] === M.GRASS) mats[i] = DEP[kind].m;
      }
    }
  }
  if (cores.length) outcrops(def, cores, X0, Y0, mats, flgs, hs);
  // gas pockets: 3x3 of rock that releases foul air when dug into
  for (let rx = Math.floor((X0 - 2) / GAS_RS); rx <= Math.floor((X0 + 17) / GAS_RS); rx++) for (let ry = Math.floor((Y0 - 2) / GAS_RS); ry <= Math.floor((Y0 + 17) / GAS_RS); ry++) {
    const p = pocketOf(def, rx, ry);
    if (!p) continue;
    for (let y = p.y - 1; y <= p.y + 1; y++) for (let x = p.x - 1; x <= p.x + 1; x++) {
      if (x < X0 || x > X0 + 15 || y < Y0 || y > Y0 + 15) continue;
      const i = L(x - X0, y - Y0, p.z), m = mats[i];
      if (m === M.SOFT || m === M.STONE || m === M.DEEP) flgs[i] |= F.GAS;
    }
  }
  // natural caves (7.20): the tunnel networks round this chunk, then the cores' own cells
  carveHome(def, X0, Y0, mats, flgs, hs);
  carveChunk(def, X0, Y0, mats, flgs, hs);
  carveDungeon(def, X0, Y0, mats, flgs, hs);          // 7.21: the labyrinths round the cores (walls, rooms, caches; dungeon.js)
  for (const c of cores) if (c.x >= X0 && c.x <= X0 + 15 && c.y >= Y0 && c.y <= Y0 + 15 && c.z < hs[(c.y - Y0) * 16 + c.x - X0]) { const i = L(c.x - X0, c.y - Y0, c.z); mats[i] = M.CORE; flgs[i] &= ~F.NATURAL; }
  if (cores.length) for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
    const c = ly * 16 + lx, h = hs[c];
    mb[c] = bandOf(manaOf(cores, X0 + lx, Y0 + ly, h, true)); md[c] = bandOf(manaOf(cores, X0 + lx, Y0 + ly, Math.max(1, h - 8), true));
  }
  // ridges: the windy cells, local height maxima, for a draft furnace
  for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
    const c = ly * 16 + lx, h = hs[c];
    if (h < 16 || mats[L(lx, ly, h)] === M.WATER || mats[L(lx, ly, h)] === M.AIR) continue;
    if (isPeak(def, halo, lx + HALO, ly + HALO, X0 + lx, Y0 + ly, h)) flgs[L(lx, ly, h)] |= F.RIDGE | F.NOGROW;
  }
  // stamps: the content placed round the spawn
  const st = def.stamps && def.stamps.get(chunkKeyOf(cx, cy));
  if (st) for (let k = 0; k < st.length; k += 4) {
    const i = st[k]; if (st[k + 1] !== 255) mats[i] = st[k + 1]; flgs[i] = (flgs[i] | st[k + 2]) & ~st[k + 3];
  }
  return { cx, cy, mats, flgs, hs, bm, mb, md };
}
const chunkKeyOf = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
