// Integer value noise over unbounded signed coordinates (S16). No Math.sin / exp / random: a lattice value is a hash of
// (seed, salt, gx, gy), and the interpolation is a fixed-point smoothstep, so every machine builds the same land and a point
// is a pure function of (seed, x, y) whatever was generated before it.
import { mix32 } from "./rng.js";

/** Lattice value 0..255. */
export function lat(seed, salt, gx, gy) { return mix32(mix32(seed, salt), mix32(gx + 4096, gy + 4096)) & 255; }

/** Smooth value noise 0..255 with feature size `cell` cells; defined for every integer (x, y), negative included. */
export function vnoise(seed, salt, x, y, cell) {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const fx = Math.floor(((x - gx * cell) * 256) / cell), fy = Math.floor(((y - gy * cell) * 256) / cell);
  const sx = (fx * fx * (768 - 2 * fx)) >> 16, sy = (fy * fy * (768 - 2 * fy)) >> 16;   // smoothstep, 0..256
  const a = lat(seed, salt, gx, gy), b = lat(seed, salt, gx + 1, gy);
  const c = lat(seed, salt, gx, gy + 1), d = lat(seed, salt, gx + 1, gy + 1);
  const top = a + (((b - a) * sx) >> 8), bot = c + (((d - c) * sx) >> 8);
  return top + (((bot - top) * sy) >> 8);
}

/** A per-cell hash (u32) of coordinates. */
export const hash3 = (seed, x, y, z) => mix32(mix32(seed, x), mix32(y, z));
export const hash2 = (seed, x, y) => mix32(mix32(seed, x), y);
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
