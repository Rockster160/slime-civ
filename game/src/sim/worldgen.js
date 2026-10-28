// Terrain + flora from a seed (GDD §11.4, trimmed to a single surface map).
//
// A pure function of the seed. Randomness comes from named streams (rng.js) so
// a change to flora never moves the terrain. Noise is integer value noise with
// a fixed-point smoothstep - no Math.sin - so every machine builds the same map.
// (Math.sqrt is allowed: IEEE requires it to be correctly rounded.)
import { mix32 } from "./rng.js";
import { W, H, D, M, F } from "./world.js";
import { newPlant } from "./plants.js";

export const WATER_LEVEL = 11;     // water fills columns up to and including this z
export const BERRY_NEAR = 45;     // permille of grass cells within 28 of camp that hold a bush (tuned in S2)
export const SITE = { x: 64, y: 64, z: 13, r: 8 };   // the starting clearing

// ---- integer value noise -------------------------------------------------

/** Lattice value 0..255. */
function lat(seed, salt, gx, gy) { return mix32(mix32(seed, salt), mix32(gx + 4096, gy + 4096)) & 255; }

/** Smooth value noise 0..255 with feature size `cell` cells. */
function vnoise(seed, salt, x, y, cell) {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const fx = Math.floor(((x - gx * cell) * 256) / cell), fy = Math.floor(((y - gy * cell) * 256) / cell);
  const sx = (fx * fx * (768 - 2 * fx)) >> 16, sy = (fy * fy * (768 - 2 * fy)) >> 16;   // smoothstep, 0..256
  const a = lat(seed, salt, gx, gy), b = lat(seed, salt, gx + 1, gy);
  const c = lat(seed, salt, gx, gy + 1), d = lat(seed, salt, gx + 1, gy + 1);
  const top = a + (((b - a) * sx) >> 8), bot = c + (((d - c) * sx) >> 8);
  return top + (((bot - top) * sy) >> 8);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Surface height (z of the topmost solid cell) for every column. */
function heightmap(seed, rng) {
  const t = rng.stream("terrain");
  // Lake well away from the centre so the starting site is dry, and a stream
  // that runs from the lake to the north edge (it ends in the lake, so it
  // never cuts the map in two: you can always walk around the south shore).
  const lakeR = t.range(10, 13), lx = t.range(46, 82), ly = t.range(34, 40);   // S2: water within ~20 cells of camp (§11.16 stream at 20)
  const hs = new Int16Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = (vnoise(seed, 1, x, y, 32) * 5 + vnoise(seed, 2, x, y, 13) * 2 + vnoise(seed, 3, x, y, 5)) >> 3;
      let h = clamp(Math.floor(12 + ((n - 80) * 7) / 128), 11, 17)   // never below the waterline: water is only lake/stream;

      // Lake: bowl inside the radius, shore ramp outside it.
      const dl = Math.sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly)) - lakeR;
      if (dl < 0) h = WATER_LEVEL - 1 - Math.floor((-dl * 4) / lakeR);
      else if (dl < 6) h = Math.min(h, WATER_LEVEL + 1 + Math.floor(dl));

      // Stream channel, wobbling more the further it is from the lake.
      if (y < ly) {
        const wob = Math.floor((((vnoise(seed, 4, y, 0, 24) - 128) * 14) / 128) * ((ly - y) / ly));
        const dx = Math.abs(x - (lx + wob));
        if (dx <= 1) h = Math.min(h, WATER_LEVEL - 1);
        else if (dx < 6) h = Math.min(h, WATER_LEVEL + dx - 1);
      }

      // Starting clearing: flat, blended into the surroundings over 6 cells.
      const r = Math.sqrt((x - SITE.x) * (x - SITE.x) + (y - SITE.y) * (y - SITE.y));
      if (r <= SITE.r) h = SITE.z;
      else if (r < SITE.r + 6) h = SITE.z + Math.trunc(((h - SITE.z) * (r - SITE.r)) / 6);

      hs[y * W + x] = clamp(h, 2, D - 6);
    }
  }
  return hs;
}

export function generate(world, ents, rng, seed) {
  const hs = heightmap(seed, rng);

  // Strata: sand/grass/stone cap, ~3 cells of dirt, stone to the bottom.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const h = hs[y * W + x];
      const r = Math.sqrt((x - SITE.x) * (x - SITE.x) + (y - SITE.y) * (y - SITE.y));
      const outcrop = h >= 14 && r > SITE.r + 6 && vnoise(seed, 5, x, y, 9) > 150;
      const top = h <= WATER_LEVEL + 1 ? M.SAND : outcrop ? M.STONE : M.GRASS;
      const dirt = 3 + (mix32(seed, y * W + x) & 1);
      for (let z = 0; z <= h; z++) {
        world.set(x, y, z, z === h ? top : z >= h - dirt ? M.DIRT : M.STONE, 0);
      }
      for (let z = h + 1; z <= WATER_LEVEL; z++) world.set(x, y, z, M.WATER, 0);
    }
  }

  // Flora: exactly one roll per grass cell, so streams stay aligned whatever
  // the thresholds are. Permille chances; the ring around the clearing is
  // seeded with berries, and forest patches (a low-frequency mask) get trees.
  const fl = rng.stream("flora");
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const h = hs[y * W + x];
      if (world.mat(x, y, h) !== M.GRASS) continue;
      const roll = fl.int(1000);
      const r = Math.sqrt((x - SITE.x) * (x - SITE.x) + (y - SITE.y) * (y - SITE.y));
      if (r < SITE.r) continue;                                    // clearing stays bare
      const forest = vnoise(seed, 6, x, y, 20) > 140;
      const treeP = forest ? 130 : r < 16 ? 25 : 12;
      const berryP = r < 28 ? BERRY_NEAR : 6;   // forage patches around camp (§11.16), sparse beyond
      const z = h + 1;
      if (roll < treeP) {
        newPlant(ents, "tree", x, y, z);                              // lumber
        world.setFlags(x, y, z, F.OBSTACLE);
      } else if (roll < treeP + berryP) {
        newPlant(ents, "berry", x, y, z);                             // food
      } else if (roll < treeP + berryP + 40) {
        newPlant(ents, "tuft", x, y, z);                              // leaf-bed material
      }
    }
  }
}
