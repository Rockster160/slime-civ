// What grows on a chunk when the sim activates it (S16): trees, berry bushes, tufts and tubers, from a chunk-keyed RNG stream. Pure:
// floraOf(def, chunk) depends only on the seed, the spawn and the chunk's own cells, so a chunk that is thrown away and activated
// again grows exactly what it grew the first time (until the villagers have changed it, and then it is never thrown away).
import { Rng, mix32 } from "./rng.js";
import { vnoise } from "./noise.js";
import { M, F } from "./world.js";
import { chunkKey } from "./cellkey.js";
import { FLORA } from "./biome.js";
import { newPlant } from "./plants.js";
import { localIdx } from "./terrain.js";

export const TUBER_NEAR = 9;     // permille of grass cells within 30 of camp that hold a tuber plant (S6)
export const TUBER_FAR = 3;
export const BERRY_NEAR = 45;     // permille of grass cells within 28 of camp that hold a bush (tuned in S2)

/** [{sp, x, y, z}] for one chunk, in row order. Exactly one roll per grass cell, so streams stay aligned whatever the thresholds are. */
export function floraOf(def, chunk) {
  const seed = def.seed, sp = def.spawn, X0 = chunk.cx << 4, Y0 = chunk.cy << 4, out = [];
  const fl = new Rng(mix32(seed ^ 0xf10a, chunkKey(chunk.cx, chunk.cy))).stream("flora");
  for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
    const c = ly * 16 + lx, h = chunk.hs[c], i = localIdx(lx, ly, h);
    if (chunk.mats[i] !== M.GRASS) continue;
    const roll = fl.int(1000);
    if (chunk.flgs[i] & F.NOGROW) continue;
    const x = X0 + lx, y = Y0 + ly, r = sp ? Math.sqrt((x - sp.x) * (x - sp.x) + (y - sp.y) * (y - sp.y)) : 99;
    if (sp && r < sp.r) continue;                                 // the clearing stays bare
    const forest = vnoise(seed, 6, x, y, 20) > 140, fb = FLORA[chunk.bm[c]];
    const treeP = fb ? (forest ? fb[0] : fb[1]) : forest ? 130 : r < 16 ? 25 : 12;          // S12: highland pines, marsh reeds (FLORA rows) away from the meadow
    const berryP = fb ? fb[2] : r < 28 ? BERRY_NEAR : 6;           // forage patches around camp (§11.16), sparse beyond
    const tuftN = fb ? fb[3] : 40, tuberP = fb ? fb[4] : r < 30 ? TUBER_NEAR : TUBER_FAR;
    const z = h + 1;
    if (roll < treeP) out.push({ sp: "tree", x, y, z });
    else if (roll < treeP + berryP) out.push({ sp: "berry", x, y, z });
    else if (roll < treeP + berryP + tuftN) out.push({ sp: "tuft", x, y, z });
    else if (roll < treeP + berryP + tuftN + tuberP) out.push({ sp: "tuber", x, y, z });
  }
  return out;
}

/** Make the chunk resident and grow its flora (entities, and a tree's OBSTACLE). `ents` null: only the OBSTACLE flags (a loaded save already holds the plants). */
export function activateChunk(world, ents, def, cx, cy, tick = 0) {
  const c = world.resident(cx, cy);
  if (c.act) return false;
  for (const p of floraOf(def, c)) {
    if (ents) newPlant(ents, p.sp, p.x, p.y, p.z);
    if (p.sp === "tree") world.setFlagsQuiet(p.x, p.y, p.z, world.flags(p.x, p.y, p.z) | F.OBSTACLE);
  }
  c.act = 1; c.last = tick; world.dk.add(chunkKey(cx, cy));
  return true;
}
