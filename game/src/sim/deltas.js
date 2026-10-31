// Terrain deltas in their compact per-chunk form (shared by save.js and paging.js, which must not import each other).
import { cellXyz, chunkKX, chunkKY, chunkKey, cellIdx } from "./cellkey.js";

/** [idx, mat, flags, ...] (any order) -> [[chunkKey, [localDelta, mat, flags, ...]]] ascending: a cell's number inside its chunk (z << 8 | y << 4 | x), delta-coded. */
export function packDeltas(flat) {
  const by = new Map();
  for (let k = 0; k < flat.length; k += 3) {
    const [x, y, z] = cellXyz(flat[k]), ck = chunkKey(x >> 4, y >> 4);
    let a = by.get(ck); if (!a) by.set(ck, a = []);
    a.push([(z << 8) | ((y & 15) << 4) | (x & 15), flat[k + 1], flat[k + 2]]);
  }
  return [...by.keys()].sort((a, b) => a - b).map(ck => {
    const a = by.get(ck).sort((p, q) => p[0] - q[0]), out = [];
    let prev = 0;
    for (const [l, m, f] of a) { out.push(l - prev, m, f); prev = l; }
    return [ck, out];
  });
}
export function unpackDeltas(dc) {
  const out = [];
  for (const [ck, a] of dc) {
    const X0 = chunkKX(ck) << 4, Y0 = chunkKY(ck) << 4;
    let l = 0;
    for (let k = 0; k < a.length; k += 3) { l += a[k]; out.push(cellIdx(X0 + (l & 15), Y0 + ((l >> 4) & 15), l >> 8), a[k + 1], a[k + 2]); }
  }
  return out;
}
