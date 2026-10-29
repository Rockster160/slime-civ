// The camp's home caves (S16 worms, kept by 7.20): inside HOME_R cells of the camp the gentle S16 caves stay (a ramp from a hillside, then one roaming tunnel with
// chambers, seeded per 64 x 64 region). Beyond it the 7.20 networks (caves.js) take over. The early game, its fixtures and the thornback's cave were all validated on
// this ground, so the neighbourhood of the camp is exactly what it was; the networks and the cores' field start where the village does not go in its first seasons.
// A pure function of (seed, spawn, coordinates), like the rest of terrain.
import { mix32 } from "./rng.js";
import { hash2, clamp } from "./noise.js";
import { M, F, D } from "./world.js";

export const HOME_R = 100;
const WATER_LEVEL = 11;            // = terrain.js WATER_LEVEL (tests/cores.js checks they agree)
export const WORM_RS = 64;
const RS = WORM_RS;
function rcache(def) { const c = def.rc || (def.rc = new Map()); if (c.size > 4096) c.clear(); return c; }
const L = (lx, ly, z) => ((z << 4) | ly) << 4 | lx;

const DX8 = [1, 1, 0, -1, -1, -1, 0, 1], DY8 = [0, 1, 1, 1, 0, -1, -1, -1];
export const RAMP_N = 8;
/** The cave worm of region cell (rx, ry), or null: [{x, y, z, r, ramp}] steps. A pure function of the seed and the region. */
export function wormOf(def, rx, ry) {
  const rc = rcache(def), key = "w" + rx + "," + ry;
  let w = rc.get(key);
  if (w !== undefined) return w;
  w = null;
  const seed = def.seed, hh = hash2(seed ^ 0xca7e, rx, ry);
  if (hh % 100 < 55) {
    const x0 = rx * RS + 6 + ((hh >>> 8) % 52), y0 = ry * RS + 6 + ((hh >>> 16) % 52), t = { h: def.hAt(x0, y0) };
    const sp = def.spawn, near = sp && (x0 - sp.x) * (x0 - sp.x) + (y0 - sp.y) * (y0 - sp.y) < 44 * 44;
    if (!near && t.h >= WATER_LEVEL + 4 && t.h - RAMP_N >= 5) {
      const rd = (hh >>> 24) & 3, rdx = [1, 0, -1, 0][rd], rdy = [0, 1, 0, -1][rd];
      let dir = rd * 2, x = x0, y = y0, ok = true;
      const steps = [], z0 = t.h + 1, c2 = { h: 0 };
      for (let i = 1; i <= RAMP_N && ok; i++) {                           // the ramp must stay in the hill: the floor column is always solid
        x += rdx; y += rdy;
        c2.h = def.hAt(x, y);
        ok = c2.h >= z0 - i - 1 && c2.h >= WATER_LEVEL + 3;
        steps.push({ x, y, z: z0 - i, r: 0, ramp: 1 });
      }
      if (ok) {
        let zf = z0 - RAMP_N;
        for (let n = 0; n < 56; n++) {
          const rnd = mix32(hh, n + 1);
          if ((rnd & 3) === 0) dir = (dir + ((rnd >>> 4) & 1 ? 1 : 7)) & 7;
          x += DX8[dir]; y += DY8[dir];
          if (n % 7 === 6) zf = clamp(zf + ((rnd >>> 8) % 3) - 1, 3, z0 - 8);
          steps.push({ x, y, z: zf, r: n % 17 === 16 ? 3 : 1, ramp: 0 });
        }
        w = steps;
      }
    }
  }
  rc.set(key, w);
  return w;
}


/** Open the home caves of one chunk (only cells inside HOME_R of the camp; a def without a camp has none). */
export function carveHome(def, X0, Y0, mats, flgs, hs) {
  const sp = def.spawn;
  if (!sp) return;
  const h2 = HOME_R * HOME_R;
  if (Math.abs(X0 + 8 - sp.x) > HOME_R + 24 || Math.abs(Y0 + 8 - sp.y) > HOME_R + 24) return;
  for (let rx = Math.floor((X0 - 80) / RS); rx <= Math.floor((X0 + 96) / RS); rx++) for (let ry = Math.floor((Y0 - 80) / RS); ry <= Math.floor((Y0 + 96) / RS); ry++) {
    const w = wormOf(def, rx, ry);
    if (!w) continue;
    for (const s of w) {
      if (s.x + s.r < X0 || s.x - s.r > X0 + 15 || s.y + s.r < Y0 || s.y - s.r > Y0 + 15) continue;
      for (let y = Math.max(Y0, s.y - s.r); y <= Math.min(Y0 + 15, s.y + s.r); y++) for (let x = Math.max(X0, s.x - s.r); x <= Math.min(X0 + 15, s.x + s.r); x++) {
        if ((x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) > s.r * s.r + (s.r > 1 ? 1 : 0)) continue;
        if ((x - sp.x) * (x - sp.x) + (y - sp.y) * (y - sp.y) >= h2) continue;
        const h = hs[(y - Y0) * 16 + (x - X0)];
        for (let k = 0; k < (s.ramp ? 2 : 3); k++) {
          const z = s.z + k;
          if (z >= D || (!s.ramp && z > h - 3)) continue;
          const i = L(x - X0, y - Y0, z), m = mats[i];
          if (m !== M.AIR && m !== M.WATER) { mats[i] = M.AIR; flgs[i] |= F.NATURAL; }
        }
      }
    }
  }
}
