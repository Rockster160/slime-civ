// Distant landmarks (S17): big things the endless land holds, found by coordinate rules (pure functions of the seed and a 64 x 64 region, like the cave worms).
// They are not terrain edits: each one stands on terrain that is already there, so nothing about generation changes. A landmark is "seen" when a villager comes
// within sight of it (sight is longer from high ground), and then it shows as an icon on the minimap and, far from camp, enters the Curiosities (R27).
//
//   cave   the mouth of a natural cave (terrain.js wormOf: the ramp's first step)
//   salt   a salt outcrop (the S14 deposit seeded in the 24-cell region; highland and marsh)
//   ruin   a placeholder: old worked stone half buried in dry ground (a region hash)
//   lake   a big lake: a water cell with a wide ring of water round it
import { hash2 } from "./noise.js";
import { colInto, wormOf, depositsIn, WATER_LEVEL, RS } from "./terrain.js";

export const LM_KINDS = ["cave", "salt", "ruin", "lake"];
export const LM_LABEL = { cave: "a large cave mouth", salt: "a salt outcrop", ruin: "old worked stones", lake: "a big lake" };
export const LM_TEXT = {
  cave: "A dark opening in a hillside, big enough to walk into. Nobody has been inside.",
  salt: "A pale crust on bare rock, bright in the sun. Animals lick at it.",
  ruin: "Old worked stones, half buried in the ground. Somebody made these, and they are gone.",
  lake: "A great sheet of still water, far wider than the stream at camp.",
};
export const SIGHT_BASE = 22, SIGHT_HIGH = 4, SIGHT_MAX = 60, HIGH_FROM = 14;
/** How far a villager standing on ground of height `h` sees a landmark: the eye climbs with the hill. */
export const sightFor = (h) => Math.min(SIGHT_MAX, SIGHT_BASE + SIGHT_HIGH * Math.max(0, h - HIGH_FROM));

const cache = new Map();
/** The landmarks of region (rx, ry): [{k, x, y}] in kind order. Pure. */
export function landmarksIn(def, rx, ry) {
  const key = def.seed + "|" + (def.spawn ? def.spawn.x + "," + def.spawn.y : "") + "|" + rx + "," + ry;
  let out = cache.get(key);
  if (out) return out;
  out = [];
  const t = { h: 0, b: 0, clay: 0, wet: 0 }, X0 = rx * RS, Y0 = ry * RS;
  const w = wormOf(def, rx, ry);
  if (w && w.length) out.push({ k: "cave", x: w[0].x, y: w[0].y });
  const dp = depositsIn(def, "salt", X0, Y0, X0 + RS - 1, Y0 + RS - 1).filter(d => d.x >= X0 && d.x < X0 + RS && d.y >= Y0 && d.y < Y0 + RS);
  if (dp.length) out.push({ k: "salt", x: dp[0].x, y: dp[0].y });
  const hh = hash2(def.seed ^ 0x7a1d, rx, ry);
  if (hh % 100 < 22) {
    const x = X0 + 6 + ((hh >>> 8) % 52), y = Y0 + 6 + ((hh >>> 16) % 52);
    if (colInto(def, x, y, t).h >= WATER_LEVEL + 3) out.push({ k: "ruin", x, y });
  }
  let best = null;                                                      // the middle of the widest water: a grid of probes, each judged by a ring of 5 x 5 samples 5 cells apart
  for (let gy = 8; gy < RS; gy += 8) for (let gx = 8; gx < RS; gx += 8) {
    const x = X0 + gx, y = Y0 + gy;
    if (colInto(def, x, y, t).h > WATER_LEVEL) continue;
    let n = 0;
    for (let dy = -10; dy <= 10; dy += 5) for (let dx = -10; dx <= 10; dx += 5) if (colInto(def, x + dx, y + dy, t).h <= WATER_LEVEL) n++;
    if (n >= 23 && (!best || n > best.n)) best = { n, x, y };
  }
  if (best) out.push({ k: "lake", x: best.x, y: best.y });
  if (cache.size > 4000) cache.clear();
  cache.set(key, out);
  return out;
}
