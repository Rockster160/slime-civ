// Magic cores and the mana field (7.20). A pure function of (seed, coordinates), like all terrain (S16):
//   * a core is placed per coarse region (CORE_RS = 256 cells) by a hashed rule; about 85 regions in 100 hold one. A core never stands within
//     SAFE_R of the camp, and the camp gets one extra "findable" core (def.spawnCore) 170-205 cells away whose crystal spire shows from high ground.
//   * mana(x, y, z) = the strongest core's falloff. The falloff is an INTEGER lookup table of a quadratic (no Math.exp / sin / random) over a
//     distance that counts depth twice: d = octagonal(dx, dy) + DZ_W * |dz|. Beyond MANA_R it is 0, so a core only touches the cells near it.
//   * bands 0..4: wild, stirring, charged, deep, heart. Everything that scales with the core (ore weights, cave size, later the dungeon, monsters
//     and danger) reads the band, never the raw number.
// A core is {x, y, z, h, sh, spire}: z is its cell, h the ground over it, sh = shallow (within 7 of the surface: outcrops and shimmer show above it).
// Surface heights come from def.hAt (terrain.js baseDef), so this file does not import terrain.js.
import { hash2 } from "./noise.js";

export const CORE_RS = 256;          // region cell of the core rule
export const SAFE_R = 150;           // no region core within this many cells of the camp
export const MANA_R = 84;            // total falloff distance (horizontal + 2 per level of depth difference)
export const DZ_W = 2;
export const SPAWN_CORE_MIN = 170;
export const SPAWN_CORE_SPAN = 36;   // ... up to 205
export const SHALLOW = 7;            // a core this close to the ground is shallow
export const BAND_MIN = [0, 14, 60, 130, 200];
export const BAND_NAME = ["Wild", "Stirring", "Charged", "Deep", "Heart"];
/** The falloff table: mana (0..255) at total distance d. Integer arithmetic only. */
export const MANA_TAB = (() => { const t = new Uint8Array(MANA_R + 1); for (let d = 0; d < MANA_R; d++) t[d] = Math.floor((255 * (MANA_R - d) * (MANA_R - d)) / (MANA_R * MANA_R)); return t; })();
const DX8 = [1, 1, 0, -1, -1, -1, 0, 1], DY8 = [0, 1, 1, 1, 0, -1, -1, -1];

/** Octagonal distance (never off by more than ~12%). */
export const oct = (dx, dy) => { const ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy; return ax > ay ? ax + (ay >> 1) : ay + (ax >> 1); };
/** Band 0..4 of a mana value. */
export const bandOf = (m) => (m >= 200 ? 4 : m >= 130 ? 3 : m >= 60 ? 2 : m >= 14 ? 1 : 0);
/**
 * 7.23 (D48): a harvested core never changes the world: `manaFrom`/`manaOf` always read the field as generated, so ore, caves, dungeon loot and the danger display stay as they were (anything first generated later too).
 * Only ongoing SPAWNING stops, at once: `liveMana` skips a core that has gone (it carries `gt`, the tick it went). Monsters already alive stay.
 */
/** Mana of one core at a cell (as generated). */
export function manaFrom(c, x, y, z) {
  const d = oct(x - c.x, y - c.y) + DZ_W * (z < c.z ? c.z - z : z - c.z);
  return d < MANA_R ? MANA_TAB[d] : 0;
}
/** The strongest mana over a list of cores. */
export function manaOf(cores, x, y, z) { let m = 0; for (let i = 0; i < cores.length; i++) { const v = manaFrom(cores[i], x, y, z); if (v > m) m = v; } return m; }
/** The field that drives new spawns: as `manaOf`, but a harvested core gives nothing. */
export function liveMana(cores, x, y, z) { let m = 0; for (let i = 0; i < cores.length; i++) { if (cores[i].gt !== undefined) continue; const v = manaFrom(cores[i], x, y, z); if (v > m) m = v; } return m; }
/** The key a core goes by (the guardian's `ck`, the harvest ledger). */
export const coreKey = (c) => c.x + "," + c.y;
/** A sim's own view of the (shared, memoised) world definition: reads fall through to it, but the harvested-core ledger (key -> tick) is the sim's own, so one sim's harvest never leaks into another's. */
export function ownDef(def) { const d = Object.create(def); d.gone = new Map(); return d; }
/** A core has been harvested at `tick`: it stops spawning from now. */
export function goCore(def, c, tick) { def.gone.set(coreKey(c), tick); }
const goneView = (def, c) => { const t = def.gone.get(coreKey(c)); return t === undefined ? c : Object.assign(Object.create(c), { gt: t }); };

/** A core as generated (a harvested core's view carries `gt`; anything cached in a pure structure keeps this copy, so what is cached never depends on when it was first asked for). */
export const plainCore = (c) => { const o = { x: c.x, y: c.y, z: c.z, h: c.h, sh: c.sh, spire: c.spire }; if (c.home) o.home = true; return o; };

function cache(def) { const c = def.rc || (def.rc = new Map()); if (c.size > 4096) c.clear(); return c; }

/** The core seeded in region (rx, ry), or null. */
export function coreOfRegion(def, rx, ry) {
  const rc = cache(def), key = "c" + rx + "," + ry;
  let c = rc.get(key);
  if (c !== undefined) return c;
  c = null;
  const hh = hash2(def.seed ^ 0xc0de, rx, ry);
  if (hh % 100 < 85) {
    const x = rx * CORE_RS + 24 + ((hh >>> 8) % 208), y = ry * CORE_RS + 24 + ((hh >>> 16) % 208), sp = def.spawn, sc = def.spawnCore;
    const nearSp = sp && (x - sp.x) * (x - sp.x) + (y - sp.y) * (y - sp.y) < SAFE_R * SAFE_R;
    const nearSc = sc && (x - sc.x) * (x - sc.x) + (y - sc.y) * (y - sc.y) < 100 * 100;
    const h = nearSp || nearSc ? 0 : def.hAt(x, y);
    if (h >= 13) {                                   // dry land only (the core stands under rock)
      const z = Math.min(3 + ((hh >>> 24) % 8), h - 6);
      c = { x, y, z, h, sh: h - z <= SHALLOW, spire: (hh >>> 4) % 3 === 0 && h - z <= SHALLOW };
    }
  }
  rc.set(key, c);
  return c;
}

/** The camp's own core: 170-205 cells out in one of eight directions (the first that lands on dry ground), shallow, with a spire. Built once per def. */
export function placeSpawnCore(def) {
  const sp = def.spawn, hh = hash2(def.seed ^ 0x5c0e, sp.x, sp.y), dist = SPAWN_CORE_MIN + ((hh >>> 8) % SPAWN_CORE_SPAN);
  for (let k = 0; k < 8; k++) {
    const dir = ((hh & 7) + k) & 7, f = DX8[dir] && DY8[dir] ? 0.7 : 1;
    const x = sp.x + Math.floor(DX8[dir] * dist * f), y = sp.y + Math.floor(DY8[dir] * dist * f), h = def.hAt(x, y);
    if (h >= 14) { def.spawnCore = { x, y, z: h - 6, h, sh: true, spire: true, home: true }; return def.spawnCore; }
  }
  def.spawnCore = null;
  return null;
}

/** Cores whose field can touch the box (inclusive), the camp's included. */
export function coresNear(def, x0, y0, x1, y1, pad = MANA_R) {
  const out = [];
  for (let rx = Math.floor((x0 - pad) / CORE_RS); rx <= Math.floor((x1 + pad) / CORE_RS); rx++) for (let ry = Math.floor((y0 - pad) / CORE_RS); ry <= Math.floor((y1 + pad) / CORE_RS); ry++) {
    const c = coreOfRegion(def, rx, ry);
    if (c && c.x >= x0 - pad && c.x <= x1 + pad && c.y >= y0 - pad && c.y <= y1 + pad) out.push(c);
  }
  const s = def.spawnCore;
  if (s && s.x >= x0 - pad && s.x <= x1 + pad && s.y >= y0 - pad && s.y <= y1 + pad) out.push(s);
  if (def.gone && def.gone.size) for (let i = 0; i < out.length; i++) out[i] = goneView(def, out[i]);       // 7.23: a harvested core carries `gt`
  return out;
}
/** Cores whose centre lies in the box. */
export const coresIn = (def, x0, y0, x1, y1) => coresNear(def, x0, y0, x1, y1, 0);

/** mana(x, y, z): 0..255. */
export function manaAt(def, x, y, z) { return manaOf(coresNear(def, x, y, x, y), x, y, z); }
/** The band 0..4 at a cell. */
export const bandAt = (def, x, y, z) => bandOf(manaAt(def, x, y, z));
