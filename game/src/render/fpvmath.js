// First-person view maths (S18). Pure functions, no DOM and no sim: the camera basis, the matrices, the cell ray (a 3D DDA), the sphere test used
// for creatures and the table that turns a facing and the held keys into one cell step. Axes: x east, y south, z up (the sim's);
// yaw 0 looks east, yaw grows clockwise seen from above (towards south); pitch > 0 looks up. The GL scene uses (X, Y, Z) = (x, z, y).
export const MAX_PITCH = 1.2;
export const TAU = Math.PI * 2;
export const clampPitch = (p) => Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p));
export const wrapYaw = (y) => { y %= TAU; return y < 0 ? y + TAU : y; };

/** The unit look direction in sim axes [x, y, z]. */
export function lookDir(yaw, pitch) { const c = Math.cos(pitch); return [c * Math.cos(yaw), c * Math.sin(yaw), Math.sin(pitch)]; }

// UI_SPEC §12.3: first person is a grid crawler. A facing is 0 east, 1 south, 2 west, 3 north; turns are 90 degree steps; the walk table is facing x keys -> a cell step.
export const FACE = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const facingYaw = (f) => (f & 3) * (Math.PI / 2);
export const turnFace = (f, d) => (f + d + 4) & 3;
/** facing + (forward, side) -> [dx, dy]; exactly walkDir at the facing's yaw. */
export const stepFor = (f, fwd, side) => walkDir(facingYaw(f), fwd, side);

/** The cardinal facing nearest to a yaw: [dx, dy] (the cell you face; what the torch and support keys use). */
export function faceOfYaw(yaw) {
  const k = Math.round(wrapYaw(yaw) / (Math.PI / 2)) & 3;
  return [[1, 0], [0, 1], [-1, 0], [0, -1]][k];
}

/**
 * Camera-relative walking -> the sim's step. The sim moves one cell at a time along an axis (sim/possess.js stepCell), so the held keys
 * (fwd and side in -1..1; side +1 = to the right) become a world vector and the dominant axis wins; a tie goes to the forward/back key.
 * -> [dx, dy] (both 0 = stand still).
 */
export function walkDir(yaw, fwd, side) {
  if (!fwd && !side) return [0, 0];
  const fx = Math.cos(yaw), fy = Math.sin(yaw);
  const vx = fx * fwd - fy * side, vy = fy * fwd + fx * side;
  const ax = Math.abs(vx), ay = Math.abs(vy);
  if (Math.abs(ax - ay) < 1e-6) {                      // a perfect diagonal (yaw on a half-step) with both keys held: forward/back wins
    const [dx, dy] = faceOfYaw(fwd ? yaw : yaw + Math.PI / 2);
    return fwd < 0 ? [0 - dx, 0 - dy] : [dx, dy];
  }
  return ax > ay ? [Math.sign(vx), 0] : [0, Math.sign(vy)];
}

// ---- matrices (column-major Float32Array(16), GL axes) ----
export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far);
  return m;
}
/** View matrix looking from `e` along the unit `f` (both GL axes, up = +Y). */
export function lookAlong(e, f) {
  let sx = -f[2], sz = f[0];                            // side = f x up = (-f2, 0, f0)
  const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
  const ux = -sz * f[1], uy = sz * f[0] - sx * f[2], uz = sx * f[1];     // up' = side x f
  const m = new Float32Array(16);
  m[0] = sx; m[4] = 0; m[8] = sz; m[1] = ux; m[5] = uy; m[9] = uz; m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
  m[12] = -(sx * e[0] + sz * e[2]); m[13] = -(ux * e[0] + uy * e[1] + uz * e[2]); m[14] = f[0] * e[0] + f[1] * e[1] + f[2] * e[2]; m[15] = 1;
  return m;
}
export function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
/** A GL-axes point -> [sx, sy, inFront] in pixels for a viewport (the verb chip is anchored with this). */
export function project(m, x, y, z, w, h) {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (cw <= 0.01) return [0, 0, false];
  return [(cx / cw * 0.5 + 0.5) * w, (1 - (cy / cw * 0.5 + 0.5)) * h, true];
}

// ---- rays ----
/**
 * Walk the cells a ray crosses (Amanatides-Woo), from a sim-axes origin along a unit direction, up to `max` cells of distance.
 * `solid(x, y, z)` says a cell stops it. -> {x, y, z, nx, ny, nz, t} for the first solid cell (n = the face normal it was entered through, t = distance), or null.
 * `visit(x, y, z)` (optional) is called for each open cell passed on the way.
 */
export function castCells(o, d, max, solid, visit) {
  let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
  const sx = d[0] > 0 ? 1 : -1, sy = d[1] > 0 ? 1 : -1, sz = d[2] > 0 ? 1 : -1;
  const tdx = d[0] ? Math.abs(1 / d[0]) : Infinity, tdy = d[1] ? Math.abs(1 / d[1]) : Infinity, tdz = d[2] ? Math.abs(1 / d[2]) : Infinity;
  let tx = d[0] ? (sx > 0 ? x + 1 - o[0] : o[0] - x) * tdx : Infinity, ty = d[1] ? (sy > 0 ? y + 1 - o[1] : o[1] - y) * tdy : Infinity, tz = d[2] ? (sz > 0 ? z + 1 - o[2] : o[2] - z) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 256 && t <= max; i++) {
    if (solid(x, y, z)) return { x, y, z, nx, ny, nz, t };
    if (visit) visit(x, y, z);
    if (tx <= ty && tx <= tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty <= tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

/** Distance along the ray (o, unit d) to the first hit of a sphere (c, r), or -1. */
export function raySphere(o, d, c, r) {
  const ox = c[0] - o[0], oy = c[1] - o[1], oz = c[2] - o[2], b = ox * d[0] + oy * d[1] + oz * d[2];
  if (b < 0) return -1;
  const q = ox * ox + oy * oy + oz * oz - b * b;
  if (q > r * r) return -1;
  return b - Math.sqrt(Math.max(0, r * r - q));
}

// ---- looking around (on top of the grid crawler): a look offset from the facing; the facing, the steps and the default target never use it ----
export const LOOK_YAW = 70 * Math.PI / 180, LOOK_PITCH_LO = -60 * Math.PI / 180, LOOK_PITCH_HI = 45 * Math.PI / 180, SWAY_YAW = 12 * Math.PI / 180, SWAY_PITCH = 8 * Math.PI / 180;
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
/** A look offset [yaw, pitch] kept inside +-70 degrees of yaw and a total pitch (base + offset) of -60..+45 degrees. */
export function clampLook(yaw, pitch, base) { return [clampN(yaw, -LOOK_YAW, LOOK_YAW), clampN(pitch, LOOK_PITCH_LO - base, LOOK_PITCH_HI - base)]; }
/** The passive sway for a cursor at (mx, my) on a W x H view: about +-12 degrees of yaw, +-8 of pitch. */
export function swayTarget(mx, my, W, H) { return [clampN(mx / W * 2 - 1, -1, 1) * SWAY_YAW, -clampN(my / H * 2 - 1, -1, 1) * SWAY_PITCH]; }
/** Ease an offset towards its target (back to the facing in about 250 ms); calm: at once. */
export function easeLook(cur, tgt, dt, calm) { return calm ? tgt : cur + (tgt - cur) * (1 - Math.exp(-dt * 14)); }
