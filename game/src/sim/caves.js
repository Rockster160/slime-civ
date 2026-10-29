// Cave networks (7.20): long, winding, multi-level systems that replace S16's simple worms. A pure function of (seed, coordinates), order independent:
//   * the world is cut into cave regions of CRS x CRS cells; ~3 in 4 hold a NODE (a junction at depth ZMIN..ZMAX, always one where a core stands).
//   * a region OWNS the tunnels that leave its node: east, south and (sometimes) south-east to the neighbouring nodes, one or more dead-end SPURS
//     that end in a chamber (more of them near a core), a SPUR TO THE CORE when a core stands in the region, and an ENTRANCE (a ramp from a hillside
//     down to the node). A tunnel strays at most ~205 cells east or south of its region and ~60 west or north, so a chunk only asks the owners round it.
//   * a tunnel is a noise-guided path: a straight line between its ends, pushed sideways by a slow noise (tapered to nothing at the ends), made
//     4-connected, then given depths: a smooth slide between the end depths plus a wander, kept under the ground (the ceiling needs 3 cells of
//     cover) and at a slope of at most one level per step, so it can always be walked. Flat stretches are 3 wide; slopes are one cell wide.
//   * chambers sit on flat stretches (round rooms r 3-5; some tall, "chasms"; some with a pool in the floor, "lakes"). Near a core they are bigger.
// 7.21: a core that has a dungeon (dungeon.js, reached through def.dunOf so this file need not import it) swaps its core spur for the dungeon's link tunnels.
// carveChunk(def, X0, Y0, mats, flgs, hs) opens the air of one chunk (flagged NATURAL: its rock vault holds). Inside HOME_R of the camp the S16 home caves (worms.js) stand instead.
import { hash2, hash3, vnoise } from "./noise.js";
import { D, M, F } from "./world.js";
import { manaFrom, bandOf, coresIn } from "./core.js";
import { HOME_R } from "./worms.js";

export const CRS = 96;               // cave region
const WATER = 11;                    // = terrain.js WATER_LEVEL (tests/cores.js checks they agree)
export const CAVE_WATER = WATER;
export const ZMIN = 3, ZMAX = 9;     // node depths
const SPAWN_KEEP = HOME_R;           // no carving within this many cells of the camp (worms.js: the S16 home caves stay there)
const DX4 = [1, 0, -1, 0], DY4 = [0, 1, 0, -1];

function cache(def) { const c = def.rc || (def.rc = new Map()); if (c.size > 4096) c.clear(); return c; }
const sq = (a) => a * a;

/** The node of cave region (rx, ry), or null: {x, y, z, band}. A region with a core in it always has one. */
export function nodeOf(def, rx, ry) {
  const rc = cache(def), key = "n" + rx + "," + ry;
  let n = rc.get(key);
  if (n !== undefined) return n;
  n = null;
  const hh = hash2(def.seed ^ 0xca7e, rx, ry), core = coresIn(def, rx * CRS, ry * CRS, rx * CRS + CRS - 1, ry * CRS + CRS - 1)[0];
  if (core || hh % 100 < 76) {
    const x = rx * CRS + 14 + ((hh >>> 8) % 68), y = ry * CRS + 14 + ((hh >>> 16) % 68), z = ZMIN + ((hh >>> 24) % 7);
    let band = 0;
    for (const c of coresIn(def, x - 84, y - 84, x + 84, y + 84)) band = Math.max(band, bandOf(manaFrom(c, x, y, z)));      // (a core may be a region away)
    n = { x, y, z, band, core: core || null, rx, ry };
  }
  rc.set(key, n);
  return n;
}

/**
 * A tunnel between two points. a/b = {x, y, z}; salt/ek decorrelate the noise per tunnel; amp = sideways wander; flatEnd = hold the last
 * steps level (a spur's chamber). -> {xs, ys, zs (-1 = not carved), rs (0 slope, 1 flat), ch: [{j, r, tall, pool}], x0, y0, x1, y1, ramp: 0}
 */
export function tunnel(def, a, b, salt, ek, amp, flatEnd, endChamber) {
  const seed = def.seed, dx = b.x - a.x, dy = b.y - a.y, L = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const px = [], py = [];
  for (let i = 0; i <= L; i++) {                                    // waypoints: the line plus a tapered sideways push
    const tp = Math.min(i, L - i, 22), o = Math.trunc((((vnoise(seed, salt, i, ek, 18) - 128) * amp) >> 7) * tp / 22);
    px.push(a.x + Math.round((dx * i) / L) + Math.trunc((o * -dy) / L)); py.push(a.y + Math.round((dy * i) / L) + Math.trunc((o * dx) / L));
  }
  const xs = [px[0]], ys = [py[0]];                                  // 4-connected: one axis step at a time
  for (let i = 1; i <= L; i++) {
    let x = xs[xs.length - 1], y = ys[ys.length - 1];
    while (x !== px[i] || y !== py[i]) {
      const ex = px[i] - x, ey = py[i] - y;
      if (Math.abs(ex) >= Math.abs(ey) && ex !== 0) x += ex > 0 ? 1 : -1; else y += ey > 0 ? 1 : -1;
      xs.push(x); ys.push(y);
    }
  }
  const N = xs.length, zs = new Int16Array(N), cap = new Int16Array(N);
  const slideEnd = flatEnd ? Math.max(1, N - 1 - flatEnd) : N - 1;
  for (let j = 0; j < N; j++) {
    const t = Math.min(1, j / slideEnd), sm = (t * t * (3 - 2 * t)), tp = Math.min(j, N - 1 - j, 16);
    const wz = Math.trunc((((vnoise(seed, salt + 1, j, ek, 22) - 128) * 7) >> 7) * tp / 16);            // wander of up to +-3 levels, none at the ends
    let z = a.z + Math.round((b.z - a.z) * sm) + (flatEnd && j >= slideEnd ? 0 : wz);
    zs[j] = Math.max(ZMIN, Math.min(ZMAX, z));
    const h = def.hAt(xs[j], ys[j]);
    cap[j] = h - 5;                                                   // the ceiling (z + 2) keeps 3 cells of cover: a tunnel passes under a river bed or a shallow lake, not a deep one (z < ZMIN: skipped)
    if (zs[j] > cap[j]) zs[j] = cap[j];
  }
  for (let j = N - 2; j >= 0; j--) if (zs[j] > zs[j + 1] + 1) zs[j] = zs[j + 1] + 1;                       // at most one level per step, by lowering
  for (let j = 1; j < N; j++) if (zs[j] > zs[j - 1] + 1) zs[j] = zs[j - 1] + 1;
  for (let j = 0; j < N; j++) if (zs[j] < ZMIN) zs[j] = -1;
  const rs = new Uint8Array(N);
  for (let j = 0; j < N; j++) rs[j] = zs[j] >= 0 && j > 0 && j < N - 1 && zs[j - 1] === zs[j] && zs[j + 1] === zs[j] ? 1 : 0;
  // chambers: round rooms on level stretches
  const ch = [], flat = (j, k) => { for (let i = Math.max(0, j - k); i <= Math.min(N - 1, j + k); i++) if (zs[i] !== zs[j]) return false; return zs[j] >= 0; };
  const room = (j, r, hh) => {
    if (!flat(j, r + 2)) return;
    const tall = (hh >>> 8) % 100 < 16 && zs[j] + 5 <= cap[j] + 2, pool = !tall && (hh >>> 16) % 100 < 22 && zs[j] <= 7;
    ch.push({ j, r, tall, pool });
  };
  for (let j = 12; j < N - 12; j += 22) { const hh = hash3(seed ^ 0xc4a3, xs[j], ys[j], salt); if (hh % 100 < 72) room(j, 3 + ((hh >>> 4) % 3), hh); }
  if (endChamber) room(endChamber.at < 0 ? N + endChamber.at : endChamber.at, endChamber.r, hash3(seed ^ 0xc4a3, xs[N - 1], ys[N - 1], 7));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let j = 0; j < N; j++) { if (xs[j] < x0) x0 = xs[j]; if (xs[j] > x1) x1 = xs[j]; if (ys[j] < y0) y0 = ys[j]; if (ys[j] > y1) y1 = ys[j]; }
  return { xs, ys, zs, rs, ch, x0: x0 - 6, y0: y0 - 6, x1: x1 + 6, y1: y1 + 6, ramp: 0, core: null };
}

/** An entrance ramp: from the node, one level up per step in a straight line, until it comes out of a hillside. Null if it meets water or the camp. */
function ramp(def, n, hh) {
  const sp = def.spawn;
  for (let k = 0; k < 4; k++) {
    const d = (hh + k) & 3, rdx = -DX4[d], rdy = -DY4[d], xs = [], ys = [], zs = [];
    let done = false, ok = true;
    for (let i = 0; i <= 24 && ok && !done; i++) {
      const x = n.x + rdx * i, y = n.y + rdy * i, z = n.z + i, h = def.hAt(x, y);
      ok = h >= WATER + 3 && !(sp && sq(x - sp.x) + sq(y - sp.y) < sq(SPAWN_KEEP));
      xs.push(x); ys.push(y); zs.push(z);
      if (z >= h + 1) done = true;
    }
    if (!ok || !done || xs.length < 5) continue;
    const m = { x: xs[xs.length - 1], y: ys[ys.length - 1] };
    return { xs, ys, zs: Int16Array.from(zs), rs: new Uint8Array(xs.length), ch: [], x0: Math.min(m.x, n.x) - 2, y0: Math.min(m.y, n.y) - 2, x1: Math.max(m.x, n.x) + 2, y1: Math.max(m.y, n.y) + 2, ramp: 1, core: null, mouth: m };
  }
  return null;
}

/** Every tunnel owned by cave region (rx, ry): [path]. */
export function ownedBy(def, rx, ry) {
  const rc = cache(def), key = "o" + rx + "," + ry;
  let out = rc.get(key);
  if (out !== undefined) return out;
  out = [];
  const n = nodeOf(def, rx, ry);
  if (n) {
    const hh = hash2(def.seed ^ 0x7e11, rx, ry), ek = (hh & 1023);
    const e = nodeOf(def, rx + 1, ry), s = nodeOf(def, rx, ry + 1), d = nodeOf(def, rx + 1, ry + 1);
    if (e && (hh >>> 10) % 100 < 88) out.push(tunnel(def, n, e, 101, ek, 16, 0, null));
    if (s && (hh >>> 17) % 100 < 88) out.push(tunnel(def, n, s, 111, ek + 1, 16, 0, null));
    if (d && (hh >>> 24) % 100 < 40) out.push(tunnel(def, n, d, 121, ek + 2, 14, 0, null));
    let spurs = 1 + ((hh >>> 3) & 1) + (n.band >= 2 ? 1 : 0) + (n.band >= 3 ? 1 : 0);
    for (let k = 0; k < spurs; k++) {                                // dead ends that wander off and finish in a room
      const sh = hash2(def.seed ^ 0x5b0a, n.x * 7 + k, n.y);
      const dir = sh & 7, len = 28 + ((sh >>> 4) % 28), f = (dir & 1) ? 0.7 : 1;
      const ex = n.x + Math.floor([1, 1, 0, -1, -1, -1, 0, 1][dir] * len * f), ey = n.y + Math.floor([0, 1, 1, 1, 0, -1, -1, -1][dir] * len * f);
      const ez = Math.max(ZMIN, Math.min(ZMAX, n.z + ((sh >>> 9) % 7) - 3));
      out.push(tunnel(def, n, { x: ex, y: ey, z: ez }, 131 + k * 10, ek + 3 + k, 12, 14, { at: -8, r: 4 + (n.band >= 3 ? 1 : 0) }));
    }
    if (n.core) {
      const dun = def.dunOf ? def.dunOf(n.core) : null;               // 7.21: a core with a labyrinth has its tunnels to the labyrinth's doors instead of a spur to the chamber (dungeon.js built and checked them)
      if (dun) for (const p of dun.links) out.push(p);
      else {                                                         // the core: a spur ending in its chamber
        const c = n.core, p = tunnel(def, n, { x: c.x, y: c.y, z: c.z }, 171, ek + 9, 8, 14, { at: -1, r: 4 });
        p.core = c;
        out.push(p);
      }
    }
    if ((hh >>> 12) % 100 < 45) { const r = ramp(def, n, hh >>> 20); if (r) out.push(r); }
  }
  rc.set(key, out);
  return out;
}

/** Owners round a box: the cave regions whose tunnels can reach it (a tunnel strays at most ~205 cells east or south of its node's region, ~60 west or north). */
function owners(x0, y0, x1, y1) {
  const out = [];
  for (let rx = Math.floor((x0 - 205) / CRS); rx <= Math.floor((x1 + 60) / CRS); rx++) for (let ry = Math.floor((y0 - 205) / CRS); ry <= Math.floor((y1 + 60) / CRS); ry++) out.push([rx, ry]);
  return out;
}
/** Every tunnel that can touch the box. */
export function pathsIn(def, x0, y0, x1, y1) {
  const out = [];
  for (const [rx, ry] of owners(x0, y0, x1, y1)) for (const p of ownedBy(def, rx, ry)) if (p.x1 >= x0 && p.x0 <= x1 && p.y1 >= y0 && p.y0 <= y1) out.push(p);
  return out;
}
/** The mouths of the entrance ramps inside a box: [{x, y}] (the landmark rule uses them). */
export function mouthsIn(def, x0, y0, x1, y1) {
  const out = [];
  for (const p of pathsIn(def, x0, y0, x1, y1)) if (p.ramp && p.mouth.x >= x0 && p.mouth.x <= x1 && p.mouth.y >= y0 && p.mouth.y <= y1) out.push(p.mouth);
  return out;
}

const L = (lx, ly, z) => ((z << 4) | ly) << 4 | lx;
/** Open the tunnels and rooms of one chunk. `hs` = the chunk's generated heights. */
export function carveChunk(def, X0, Y0, mats, flgs, hs) {
  const sp = def.spawn, k2 = sq(SPAWN_KEEP);
  const open = (x, y, z, wallOk) => {
    if (x < X0 || x > X0 + 15 || y < Y0 || y > Y0 + 15 || z < 1 || z >= D) return;
    const c = (y - Y0) * 16 + (x - X0);
    if (!wallOk && z > hs[c] - 3) return;
    if (sp && sq(x - sp.x) + sq(y - sp.y) < k2) return;
    const i = L(x - X0, y - Y0, z), m = mats[i];
    if (m !== M.AIR && m !== M.WATER) { mats[i] = M.AIR; flgs[i] |= F.NATURAL; }
  };
  for (const p of pathsIn(def, X0, Y0, X0 + 15, Y0 + 15)) {
    const N = p.xs.length;
    for (let j = 0; j < N; j++) {
      const x = p.xs[j], y = p.ys[j], z = p.zs[j];
      if (z < 0 || x < X0 - 1 || x > X0 + 16 || y < Y0 - 1 || y > Y0 + 16) continue;
      if (p.ramp) { open(x, y, z, true); open(x, y, z + 1, true); continue; }
      for (let k = 0; k < 3; k++) { open(x, y, z + k, false); if (p.rs[j]) { open(x + 1, y, z + k, false); open(x - 1, y, z + k, false); open(x, y + 1, z + k, false); open(x, y - 1, z + k, false); } }
    }
    for (const c of p.ch) {
      const cx = p.xs[c.j], cy = p.ys[c.j], z = p.zs[c.j], r = c.r;
      if (cx + r < X0 || cx - r > X0 + 15 || cy + r < Y0 || cy - r > Y0 + 15) continue;
      for (let y = Math.max(Y0, cy - r); y <= Math.min(Y0 + 15, cy + r); y++) for (let x = Math.max(X0, cx - r); x <= Math.min(X0 + 15, cx + r); x++) {
        const d2 = sq(x - cx) + sq(y - cy);
        if (d2 + (hash3(def.seed ^ 0xca7e, x, y, z) % (2 * r + 1)) > r * r + r) continue;
        for (let k = 0; k < (c.tall ? 6 : 3); k++) open(x, y, z + k, false);
        if (c.pool && d2 <= sq(r - 2) && x >= X0 && x <= X0 + 15 && y >= Y0 && y <= Y0 + 15 && z <= hs[(y - Y0) * 16 + (x - X0)] - 3) { const i = L(x - X0, y - Y0, z); mats[i] = M.WATER; flgs[i] |= F.NATURAL; }
      }
    }
  }
}

/** 7.22: the dry chambers of the cave tunnels whose centre lies in the box: [{x, y, z, r, tall}] (z = the stand level). Monsters take them for dark rooms. Pure. */
export function chambersIn(def, x0, y0, x1, y1) {
  const out = [];
  for (const p of pathsIn(def, x0 - 6, y0 - 6, x1 + 6, y1 + 6)) {
    if (p.ramp) continue;
    for (const c of p.ch) {
      const x = p.xs[c.j], y = p.ys[c.j], z = p.zs[c.j];
      if (c.pool || z < 0 || x < x0 || x > x1 || y < y0 || y > y1) continue;
      out.push({ x, y, z, r: c.r, tall: c.tall });
    }
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
}
