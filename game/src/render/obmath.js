// The angled map view's pure parts (6.19b): the projection matrix, exact picking through the cell grid, and the level words. No DOM, no GL, no sim: tests/oblique.js covers them.
import { castCells } from "./fpvmath.js";

export const KZ = 1 / 140;                       // clip-z per unit of view depth (the scene is about 280 cells deep at most)

/** The orthographic view-projection for the angled camera (GL axes: X = x east, Y = z up, Z = y south), column-major. A point's clip x/y match camera.toScreen. */
export function obliqueVP(cam) {
  const W = cam.vw, H = cam.vh, s = cam.zoom, sp = cam.sinP, cp = cam.cosP, a = 2 * s / W, b = 2 * s / H;
  const cX = cam.x, cY = cam.zf, cZ = cam.y, m = new Float32Array(16);
  // clip.x = a (X - cX); clip.y = b (cp (Y - cY) - sp (Z - cZ)); clip.z = KZ (-sp (Y - cY) - cp (Z - cZ)); clip.w = 1
  m[0] = a;  m[12] = -a * cX;
  m[5] = b * cp; m[9] = -b * sp; m[13] = -b * (cp * cY - sp * cZ);
  m[6] = -KZ * sp; m[10] = -KZ * cp; m[14] = KZ * (sp * cY + cp * cZ);
  m[15] = 1;
  return m;
}
/** Apply a matrix to a sim-axes point -> pixels (for the round-trip test). */
export function projectVP(m, x, y, z, w, h) {
  const X = x, Y = z, Z = y, cx = m[0] * X + m[4] * Y + m[8] * Z + m[12], cy = m[1] * X + m[5] * Y + m[9] * Z + m[13];
  return [(cx * 0.5 + 0.5) * w, (1 - (cy * 0.5 + 0.5)) * h];
}

/**
 * The cell under a pixel: walk the line of sight through the grid from above the world down, stopping at the first cell that is solid (or water) and not cut away.
 * `solidAt(x, y, z)` says a cell stops the ray; clipN = the highest level drawn (the slice; D - 1 draws everything). -> {x, y, z, nx, ny, nz, t} or null.
 */
export function pickCell(cam, sx, sy, solidAt, clipN, D) {
  const r = cam.ray(sx, sy, D + 1);
  return castCells(r.o, r.d, (D + 2) / cam.sinP + 8, (x, y, z) => z <= clipN && z >= 0 && solidAt(x, y, z));
}

/** The words for a viewed level N (N >= D - 1 is the Surface view) relative to the camp's standing level. */
export function levelLabel(N, campZ, D) {
  if (N >= D - 1) return "Surface";
  const d = campZ - N;
  return d === 0 ? "Ground level" : d > 0 ? d + " below ground" : -d + " above ground";
}
/** A level badge for something that is not on the viewed level: "↑2" above the cut, "↓3" below it; in the Surface view only things under their column's top get one (how far under). "" = none. */
export function depthBadge(viewN, z, top, D) {
  if (viewN >= D - 1) { const d = top + 1 - z; return top >= 0 && d >= 2 ? "↓" + (d - 1) : ""; }
  return z > viewN ? "↑" + (z - viewN) : z < viewN ? "↓" + (viewN - z) : "";
}
/** Which view a "show me" jump needs: the Surface when the target stands on (or above) its column's top, else the slice at its level. */
export function viewLevelFor(top, z, D) { return top >= 0 && z > top ? D - 1 : z; }
/**
 * The rows of the depth gauge, top to bottom: Surface, then every level from `hi` down to `lo`. Each row {n (the level the click goes to), label, slimes (count), dug, cur}.
 * counts: Map level -> slimes standing there; dug: Set of levels with carved space.
 */
export function gaugeRows(cur, campZ, D, counts, dug) {
  let hi = campZ + 2, lo = campZ - 6;
  for (const k of counts.keys()) { hi = Math.max(hi, k); lo = Math.min(lo, k); }
  for (const k of dug) lo = Math.min(lo, k);
  if (cur < D - 1) { lo = Math.min(lo, cur); hi = Math.max(hi, cur); }
  hi = Math.min(hi, D - 2); lo = Math.max(lo, 1);
  const rows = [{ n: D - 1, label: "Surface", slimes: 0, dug: false, cur: cur >= D - 1, surface: true }];
  for (let n = hi; n >= lo; n--) rows.push({ n, label: levelLabel(n, campZ, D), slimes: counts.get(n) || 0, dug: dug.has(n), cur: cur === n, camp: n === campZ });
  return rows;
}
/** The depth band of a face h cells under the cut plane: 0 = this level (full colour) .. 4 (darkest). The shader repeats this formula. */
export const depthBand = (under) => Math.max(0, Math.min(4, Math.floor(under - 0.999)));
