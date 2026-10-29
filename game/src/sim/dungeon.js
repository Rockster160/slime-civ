// Dungeons (7.21): a labyrinth round every magic core, a pure function of (seed, core), bounded and order independent (like all terrain, S16).
//
//   * The footprint is a grid of MS x MS-cell MODULES (6-10 a side: 48-80 cells across) with the core's module placed by a hash; the labyrinth stands in 2-5 LEVELS 3 cells
//     apart (a stand cell s, two cells of air, a one-cell slab: s+0, s+1 air, s+2 slab), the core on one of them. Levels are the core's z plus whole multiples of 3, kept at least
//     2 cells of cover over the slab under the lowest ground of the footprint (a dungeon is not built under a lake or a gorge: none, then).
//   * Per level, every module holds a ROOM (a rectangle of 3-6 cells, or one of the authored SET PIECES) or only a junction; a randomised Kruskal spanning tree over the modules
//     (plus a few extra edges: loops) is cut as one-cell CORRIDORS between the room anchors (an L: along the row, then the column), so every room is reachable, the leaves are dead
//     ends, and a few corridors sprout blind stubs. STAIRS join consecutive levels: a stair module has a fixed 6 x 4 room on both levels and a 3-step stair (see STAIR below).
//   * Rooms get a KIND by a rule that reads the distance to the core module: hall, trap hall, vault (treasure), den (7.22 puts monsters here), ancient workshop (carries a craft and a
//     Curiosity), the core chamber. TRAPS (dart, pit, collapse, gas) sit in trap halls and corridors; pits only in rooms with open floor under them. CACHES (M.CACHE cells) fill
//     vaults, workshops, the core chamber and some dead ends.
//   * ENTRANCES: up to two LINKS (a cave-network tunnel from the core's cave node to a door cell on the footprint edge, caves.js `tunnel`), and sometimes a RUIN: a straight stair
//     up from a top-level door to the surface, its mouth a landmark. A dungeon with neither does not exist (the core is plain, as in 7.20). The core's old spur is replaced by the links.
//   * Walls, floors and ceilings are M.DWALL; the air carries F.NATURAL | F.DUNGEON (a labyrinth's vault holds, and autonomy keeps out: lair.js).
// Nothing here reads the sim. carveDungeon(def, X0, Y0, mats, flgs, hs) writes one chunk; `dungeonAt`, `trapAt`, `cacheAt`, `lootAt`, `roomAt` answer questions about a cell.
import { Stream } from "./rng.js";
import { hash2, hash3 } from "./noise.js";
import { D, M, F } from "./world.js";
import { coresNear, bandOf, manaFrom, MANA_R } from "./core.js";
import { nodeOf, tunnel, CRS, ZMIN, ZMAX } from "./caves.js";
import { HOME_R } from "./worms.js";

export const MS = 8;                 // module
export const LEVEL_H = 3;
export const MIN_H = 12;             // the lowest ground a module may have over it (the shore of a lake is 12)
export const ROOM_KINDS = ["hall", "trap", "vault", "den", "workshop", "core"];
export const TRAP_KINDS = ["dart", "pit", "collapse", "gas"];
const WATER = 11;
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];           // W E N S

/** Authored set pieces: a picture of the room's floor ('.' open, '#' a pillar, 'c' a cache, 't' a trap, ' ' stone). */
export const SETPIECES = {
  pillars:  { kind: "hall",  rows: ["......", ".#..#.", "......", ".#..#.", "......"] },
  ossuary:  { kind: "vault", rows: ["c....c", "......", "......", "......"] },
  shrine:   { kind: "vault", rows: ["..c..", ".....", "c...c", ".....", "..t.."] },
  gauntlet: { kind: "trap",  rows: ["t.t.t.", "......", ".t.t.t"] },
};

const idxG = (dun, lx, ly) => ly * dun.W + lx;
/** Numeric key of a cell inside the footprint's levels: ((z * H) + ly) * W + lx (-1 outside the footprint). */
export const keyOf = (dun, x, y, z) => { const lx = x - dun.x0, ly = y - dun.y0; return lx < 0 || ly < 0 || lx >= dun.W || ly >= dun.H ? -1 : (z * dun.H + ly) * dun.W + lx; };

function dcache(def) { const c = def.dc || (def.dc = new Map()); if (c.size > 24) c.clear(); return c; }

/** The dungeon round a core, or null: pure and cached per def (bounded). */
export function dungeonOf(def, core) {
  const cache = dcache(def), key = core.x + "," + core.y;
  let d = cache.get(key);
  if (d !== undefined) return d;
  d = build(def, core);
  cache.set(key, d);
  return d;
}
/** The dungeon whose footprint (or ramp) holds the column, or null. */
export function dungeonAt(def, x, y) {
  for (const c of coresNear(def, x, y, x, y, 110)) {
    const d = dungeonOf(def, c);
    if (d && x >= d.bb.x0 && x <= d.bb.x1 && y >= d.bb.y0 && y <= d.bb.y1) return d;
  }
  return null;
}
/** Every dungeon whose box can touch the rectangle (inclusive). */
export function dungeonsIn(def, x0, y0, x1, y1) {
  const out = [];
  for (const c of coresNear(def, x0, y0, x1, y1, 110)) {
    const d = dungeonOf(def, c);
    if (d && d.bb.x1 >= x0 && d.bb.x0 <= x1 && d.bb.y1 >= y0 && d.bb.y0 <= y1) out.push(d);
  }
  return out;
}

function build(def, core) {
  const seed = hash2(def.seed ^ 0xd06e, core.x, core.y), R = new Stream(seed);
  const Gx = 6 + R.int(5), Gy = 6 + R.int(5), W = Gx * MS, H = Gy * MS;
  const gcx = Math.max(1, Math.min(Gx - 2, (Gx >> 1) + R.int(3) - 1)), gcy = Math.max(1, Math.min(Gy - 2, (Gy >> 1) + R.int(3) - 1));
  const x0 = core.x - (gcx * MS + 4), y0 = core.y - (gcy * MS + 4), sp = def.spawn;
  if (sp && Math.max(Math.abs(x0 + W / 2 - sp.x), Math.abs(y0 + H / 2 - sp.y)) < HOME_R + 40 + MS) return null;     // never near the camp
  const mh = new Int16Array(Gx * Gy).fill(99);                // the lowest ground over each module (and its rim): a module is dug only where the cover is deep and the land dry
  let hi = 0;
  for (let gy = 0; gy < Gy; gy++) for (let gx = 0; gx < Gx; gx++) {
    let m = 99;
    for (let y = y0 + gy * MS - 1; y <= y0 + gy * MS + MS; y += 2) for (let x = x0 + gx * MS - 1; x <= x0 + gx * MS + MS; x += 2) { const h = def.hAt(x, y); if (h < m) m = h; }
    mh[gy * Gx + gx] = m; if (m > hi) hi = m;
  }
  const cm = gcy * Gx + gcx;
  if (mh[cm] < MIN_H || mh[cm] < core.z + 4) return null;
  const S = [];                                                // the stand levels the ground allows: the core's z in steps of LEVEL_H
  for (let z = core.z % LEVEL_H; z + 4 <= hi; z += LEVEL_H) if (z >= 2) S.push(z);
  const ic = S.indexOf(core.z);
  if (ic < 0 || S.length < 2) return null;
  let L = Math.min(S.length, 2 + R.int(4));
  const st = Math.max(0, ic - L + 1) + R.int(Math.min(ic, S.length - L) - Math.max(0, ic - L + 1) + 1);
  let s = S.slice(st, st + L), jc = ic - st;
  // which modules are dug on which level: dry, with cover (stand + 4 under the lowest ground); only what the core's module can reach (through its level's neighbours, and by stairs between levels) is kept
  let use = s.map(z => Uint8Array.from(mh, v => (v >= MIN_H && v >= z + 4 ? 1 : 0)));
  const labels = use.map(u => {
    const lab = new Int16Array(Gx * Gy).fill(-1);
    let n = 0;
    for (let m0 = 0; m0 < Gx * Gy; m0++) {
      if (!u[m0] || lab[m0] >= 0) continue;
      const q = [m0]; lab[m0] = n;
      while (q.length) { const m = q.pop(), gx = m % Gx, gy = (m - gx) / Gx; for (const [dx, dy] of DIRS) { const a = gx + dx, b = gy + dy; if (a < 0 || b < 0 || a >= Gx || b >= Gy) continue; const k = b * Gx + a; if (u[k] && lab[k] < 0) { lab[k] = n; q.push(k); } } }
      n++;
    }
    return lab;
  });
  const stairs = [], usedM = new Set([cm]), reached = new Set([jc + ":" + labels[jc][cm]]), queue = [[jc, labels[jc][cm]]];
  const stairAt = (m, lo) => ({ j: lo, gx: m % Gx, gy: (m - (m % Gx)) / Gx, x: x0 + (m % Gx) * MS + 2, y: y0 + ((m - (m % Gx)) / Gx) * MS + 3 });
  while (queue.length) {
    const [j, c] = queue.pop();
    for (const j2 of [j - 1, j + 1]) {
      if (j2 < 0 || j2 >= L) continue;
      const cands = [];
      for (let m = 0; m < Gx * Gy; m++) if (labels[j][m] === c && use[j2][m] && !usedM.has(m)) cands.push([hash3(seed ^ 0x57a1, m, j, j2), m]);
      cands.sort((a, b) => a[0] - b[0]);
      for (const [, m] of cands) {
        const c2 = labels[j2][m];
        if (reached.has(j2 + ":" + c2)) continue;
        usedM.add(m); reached.add(j2 + ":" + c2); stairs.push(stairAt(m, Math.min(j, j2))); queue.push([j2, c2]);
        break;
      }
    }
  }
  for (let j = 0; j < L - 1; j++) {                            // a second stair between some levels: a loop
    const cands = [];
    for (let m = 0; m < Gx * Gy; m++) if (use[j][m] && use[j + 1][m] && reached.has(j + ":" + labels[j][m]) && reached.has((j + 1) + ":" + labels[j + 1][m]) && !usedM.has(m)) cands.push([hash3(seed ^ 0x57a2, m, j, 0), m]);
    cands.sort((a, b) => a[0] - b[0]);
    if (cands.length && cands[0][0] % 100 < 60) { usedM.add(cands[0][1]); stairs.push(stairAt(cands[0][1], j)); }
  }
  use = use.map((u, j) => Uint8Array.from(u, (v, m) => (v && reached.has(j + ":" + labels[j][m]) ? 1 : 0)));
  let jlo = 0, jhi = L - 1;
  while (jlo < jhi && !use[jlo].some(v => v)) jlo++;
  while (jhi > jlo && !use[jhi].some(v => v)) jhi--;
  if (jhi - jlo < 1) return null;
  s = s.slice(jlo, jhi + 1); use = use.slice(jlo, jhi + 1); jc -= jlo; L = s.length;
  for (const q of stairs) q.j -= jlo;
  let nm = 0;
  for (const u of use) for (const v of u) nm += v;
  if (nm < 10) return null;
  const dun = { core, seed, Gx, Gy, W, H, x0, y0, L, jc, s, use, mh, gcx, gcy, grid: [], ov: new Map(), rooms: [], stairs, traps: new Map(), caches: new Map(), doors: [], entrances: [], links: [], ramps: [], extra: new Set(), bb: null, zlo: s[0] - 1, zhi: s[L - 1] + 4 };
  for (let j = 0; j < L; j++) dun.grid.push(new Uint8Array(W * H));      // bit 1 open, 2 route (a corridor / anchor line: never furnished), 4 corridor cell outside a room
  layout(def, dun, R);
  doors(def, dun, R);
  if (!dun.entrances.length) return null;
  dun.bb = { x0: x0 - 2, y0: y0 - 2, x1: x0 + W + 1, y1: y0 + H + 1 };
  for (const r of dun.ramps) for (let i = 0; i < r.xs.length; i++) { const b = dun.bb; b.x0 = Math.min(b.x0, r.xs[i] - 2); b.x1 = Math.max(b.x1, r.xs[i] + 2); b.y0 = Math.min(b.y0, r.ys[i] - 2); b.y1 = Math.max(b.y1, r.ys[i] + 2); }
  return dun;
}

// ---- the layout ---------------------------------------------------------------------------------------------------------

function layout(def, dun, R) {
  const { Gx, Gy, W, H, x0, y0, L, jc, gcx, gcy, grid } = dun;
  const open = (j, x, y, route) => { const lx = x - x0, ly = y - y0; if (lx < 0 || ly < 0 || lx >= W || ly >= H) return; grid[j][ly * W + lx] |= route ? 3 : 1; };
  const mod = (gx, gy) => gy * Gx + gx;
  const stairAt = (j, gx, gy) => dun.stairs.some(q => q.gx === gx && q.gy === gy && (q.j === j || q.j === j - 1));
  const rooms = [];                                           // per level, per module
  for (let j = 0; j < L; j++) {
    rooms.push([]);
    for (let gy = 0; gy < Gy; gy++) for (let gx = 0; gx < Gx; gx++) {
      if (!dun.use[j][mod(gx, gy)]) { rooms[j].push(null); continue; }
      const mx = x0 + gx * MS, my = y0 + gy * MS, h = R.u32();
      let r;
      if (j === jc && gx === gcx && gy === gcy) r = { x0: mx + 1, y0: my + 1, x1: mx + 6, y1: my + 6, kind: "core", force: 1 };
      else if (stairAt(j, gx, gy)) r = { x0: mx + 1, y0: my + 2, x1: mx + 6, y1: my + 5, kind: "hall", force: 1 };
      else if (h % 100 < 80) {
        const w = 3 + ((h >>> 8) % 4), hh = 3 + ((h >>> 12) % 3);
        r = { x0: mx + 1 + ((h >>> 16) % (7 - w)), y0: my + 1 + ((h >>> 20) % (7 - hh)), x1: 0, y1: 0, kind: "hall", force: 0 };
        r.x1 = r.x0 + w - 1; r.y1 = r.y0 + hh - 1;
      } else r = null;                                        // a junction only
      if (r) { r.j = j; r.gx = gx; r.gy = gy; r.ax = r.x0 + ((r.x1 - r.x0 + 1) >> 1); r.ay = r.y0 + ((r.y1 - r.y0 + 1) >> 1); }
      rooms[j].push(r || { j, gx, gy, node: 1, ax: mx + 4, ay: my + 4, x0: mx + 4, y0: my + 4, x1: mx + 4, y1: my + 4, kind: "node", force: 0 });
    }
  }
  // corridors: a spanning tree of the modules per level, then a few loops
  const deg = rooms.map(() => new Uint8Array(Gx * Gy)), links = [];
  for (let j = 0; j < L; j++) {
    const edges = [];
    for (let gy = 0; gy < Gy; gy++) for (let gx = 0; gx < Gx; gx++) {
      if (!dun.use[j][mod(gx, gy)]) continue;
      if (gx + 1 < Gx && dun.use[j][mod(gx + 1, gy)]) edges.push([R.u32(), gx, gy, gx + 1, gy]);
      if (gy + 1 < Gy && dun.use[j][mod(gx, gy + 1)]) edges.push([R.u32(), gx, gy, gx, gy + 1]);
    }
    edges.sort((a, b) => a[0] - b[0]);
    const uf = new Int32Array(Gx * Gy).map((_, i) => i), find = (a) => { while (uf[a] !== a) { uf[a] = uf[uf[a]]; a = uf[a]; } return a; };
    const take = [];
    for (const e of edges) { const a = find(mod(e[1], e[2])), b = find(mod(e[3], e[4])); if (a !== b) { uf[a] = b; take.push(e); } else if (e[0] % 100 < 9) take.push(e); }
    for (const e of take) {
      const A = rooms[j][mod(e[1], e[2])], B = rooms[j][mod(e[3], e[4])];
      deg[j][mod(e[1], e[2])]++; deg[j][mod(e[3], e[4])]++;
      for (let x = Math.min(A.ax, B.ax); x <= Math.max(A.ax, B.ax); x++) open(j, x, A.ay, 1);
      for (let y = Math.min(A.ay, B.ay); y <= Math.max(A.ay, B.ay); y++) open(j, B.ax, y, 1);
      links.push([j, A, B]);
    }
  }
  // rooms open after the corridors: a cell in a room has bit 8, so the corridor cells outside a room are known (they are never furnished and may hold a trap)
  for (let j = 0; j < L; j++) for (const r of rooms[j]) {
    if (!r || r.node) continue;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) grid[j][(y - y0) * W + (x - x0)] |= 9;
  }
  // stairs
  for (const q of dun.stairs) {
    const sj = dun.s[q.j];
    dun.ov.set((q.y - y0) * W + (q.x + 1 - x0), { j: q.j, lo: sj + 1, hi: sj + 4 });          // the second step column: stand s+1, headroom through the slab
    dun.ov.set((q.y - y0) * W + (q.x + 2 - x0), { j: q.j, lo: sj + 2, hi: sj + 4 });          // the third: stand s+2
    for (let x = q.x - 1; x <= q.x + 4; x++) for (let y = q.y - 1; y <= q.y + 1; y++) for (const lv of [q.j, q.j + 1]) grid[lv][(y - y0) * W + (x - x0)] |= 2;   // keep the approach clear
  }
  // kinds, by distance to the core and by being a dead end
  const cand = [];
  for (let j = 0; j < L; j++) for (const r of rooms[j]) {
    if (!r || r.node) continue;
    r.d = Math.abs(r.gx - gcx) + Math.abs(r.gy - gcy) + 2 * Math.abs(j - jc);
    r.leaf = deg[j][mod(r.gx, r.gy)] <= 1;
    if (!r.force) cand.push(r);
  }
  const wsN = Math.min(cand.length, 1 + R.int(2));
  const byH = cand.map(r => [hash3(dun.seed, r.x0, r.y0, r.j), r]).sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < wsN; k++) { const r = byH[k][1]; r.kind = "workshop"; r.craft = byH[k][0] >>> 8; }
  for (const r of cand) {
    if (r.kind === "workshop") continue;
    const h = hash3(dun.seed ^ 0x6b1d, r.x0, r.y0, r.j) % 100, near = r.d <= 3;
    r.kind = r.leaf ? (h < (near ? 50 : 34) ? "vault" : h < 60 ? "trap" : h < 74 ? "den" : "hall") : (h < (near ? 9 : 4) ? "vault" : h < (near ? 28 : 20) ? "trap" : h < 38 ? "den" : "hall");
  }
  // set pieces replace the plain rectangle of some rooms
  for (const r of cand) {
    if (r.kind === "workshop" || r.kind === "den") continue;
    const h = hash3(dun.seed ^ 0x5e7b, r.x0, r.y0, r.j);
    if (h % 100 >= 30) continue;
    const names = Object.keys(SETPIECES).filter(n => SETPIECES[n].kind === r.kind);
    if (!names.length) continue;
    r.tpl = names[(h >>> 8) % names.length];
    const T = SETPIECES[r.tpl], w = T.rows[0].length, hh = T.rows.length, mx = x0 + r.gx * MS, my = y0 + r.gy * MS;
    const ox = mx + 1 + ((8 - w) >> 1) - 0, oy = my + 1 + ((8 - hh) >> 1) - 0;
    const nr = { x0: ox, y0: oy, x1: ox + w - 1, y1: oy + hh - 1 };
    // the old rectangle gives way to the new one; the corridors stay (their cells are route cells, open whatever the picture says)
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const k = (y - y0) * W + (x - x0); if (!(grid[r.j][k] & 2)) grid[r.j][k] = 0; }
    for (let y = nr.y0; y <= nr.y1; y++) for (let x = nr.x0; x <= nr.x1; x++) grid[r.j][(y - y0) * W + (x - x0)] |= 9;
    // the anchor must stay inside the new rectangle, and linked: join it to the old anchor along the module's row and column
    const na = { ax: Math.min(nr.x1, Math.max(nr.x0, r.ax)), ay: Math.min(nr.y1, Math.max(nr.y0, r.ay)) };
    for (let x = Math.min(r.ax, na.ax); x <= Math.max(r.ax, na.ax); x++) open(r.j, x, r.ay, 1);
    for (let y = Math.min(r.ay, na.ay); y <= Math.max(r.ay, na.ay); y++) open(r.j, na.ax, y, 1);
    r.x0 = nr.x0; r.y0 = nr.y0; r.x1 = nr.x1; r.y1 = nr.y1; r.ax = na.ax; r.ay = na.ay;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const ch = T.rows[y][x], gx = ox + x, gy = oy + y, k = (gy - y0) * W + (gx - x0), g = grid[r.j];
      if (g[k] & 2) continue;                                 // route cells stay open
      if (ch === "#") g[k] = 8;                              // a pillar: inside the room, not open
      else if (ch === "c") { g[k] = 8 | 16; }                // a cache (placed below)
      else if (ch === "t") g[k] |= 32;                       // a trap spot
    }
  }
  // stubs: blind corridors off a corridor (on the vertical run of an L when it has one, else on the horizontal run)
  for (const [j, A, B] of links) {
    const h = hash3(dun.seed ^ 0x57ab, A.ax, A.ay, j + B.ax);
    if (h % 100 >= 22) continue;
    const vert = A.ay !== B.ay, sx = vert ? B.ax : (A.ax + B.ax) >> 1, sy = vert ? (A.ay + B.ay) >> 1 : A.ay, sg = (h >>> 8) & 1 ? 1 : -1, len = 2 + ((h >>> 9) % 3);
    const at = (x, y) => (y - y0) * W + (x - x0), g = grid[j];
    if (sx < x0 + 1 || sy < y0 + 1 || sx >= x0 + W - 1 || sy >= y0 + H - 1 || !(g[at(sx, sy)] & 1) || (g[at(sx, sy)] & 8)) continue;
    const cells = [];
    for (let i = 1; i <= len; i++) {
      const cx = vert ? sx + sg * i : sx, cy = vert ? sy : sy + sg * i;
      if (cx < x0 + 1 || cy < y0 + 1 || cx >= x0 + W - 1 || cy >= y0 + H - 1 || (g[at(cx, cy)] & 11)) break;
      cells.push([cx, cy]);
    }
    if (cells.length < 2) continue;
    for (const [cx, cy] of cells) g[at(cx, cy)] |= 5;
    const [ex, ey] = cells[cells.length - 1];
    if (hash3(dun.seed ^ 0x57ac, ex, ey, j) % 100 < 35) { g[at(ex, ey)] = (g[at(ex, ey)] & ~1) | 16; dun.caches.set(keyOf(dun, ex, ey, dun.s[j]), { room: "niche" }); }      // a niche at the dead end
  }
  dun.rooms = rooms.flat().filter(r => r && !r.node);
  // features: caches and traps by room kind
  const isFree = (j, x, y) => { const v = grid[j][(y - y0) * W + (x - x0)]; return (v & 1) && !(v & 2) && !(v & 16); };
  const freeCells = (r, interior) => {
    const out = [];
    for (let y = r.y0 + (interior ? 1 : 0); y <= r.y1 - (interior ? 1 : 0); y++) for (let x = r.x0 + (interior ? 1 : 0); x <= r.x1 - (interior ? 1 : 0); x++) if (isFree(r.j, x, y)) out.push([x, y]);
    return out.sort((a, b) => hash3(dun.seed ^ 0xf3a7, a[0], a[1], r.j) - hash3(dun.seed ^ 0xf3a7, b[0], b[1], r.j));
  };
  const corners = (r) => [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]].filter(([x, y]) => isFree(r.j, x, y) && (grid[r.j][(y - y0) * W + (x - x0)] & 8));
  const lowerOpen = (j, x, y) => j > 0 && (grid[j - 1][(y - y0) * W + (x - x0)] & 1) && !dun.ov.has((y - y0) * W + (x - x0));
  const putCache = (j, x, y, r) => { grid[j][(y - y0) * W + (x - x0)] = (grid[j][(y - y0) * W + (x - x0)] & ~1) | 16; dun.caches.set(keyOf(dun, x, y, dun.s[j]), { room: r.kind }); };
  const putTrap = (j, x, y, k) => dun.traps.set(keyOf(dun, x, y, dun.s[j]), k);
  const trapKind = (h, room, j, x, y) => {
    const t = h % 100;
    if (room && t < 28 && lowerOpen(j, x, y) && !dun.ov.has((y - y0) * W + (x - x0))) return "pit";
    const u = (h >>> 8) % 100;
    return u < 42 ? "dart" : u < 68 ? "gas" : "collapse";
  };
  for (const r of dun.rooms) {
    const j = r.j, g = grid[j];
    // the picture's own caches and traps
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const v = g[(y - y0) * W + (x - x0)];
      if (v & 16) { dun.caches.set(keyOf(dun, x, y, dun.s[j]), { room: r.kind }); g[(y - y0) * W + (x - x0)] = 8 | 16; }
      else if ((v & 32) && !(v & 2)) putTrap(j, x, y, trapKind(hash3(dun.seed ^ 0x7a9, x, y, j), true, j, x, y));
    }
    if (r.kind === "vault") {
      const n = 1 + (r.d <= 3 ? 1 : 0) + (hash3(dun.seed ^ 0xca, r.x0, r.y0, j) % 3 === 0 ? 1 : 0);
      if (!r.tpl) for (const [x, y] of corners(r).slice(0, n)) putCache(j, x, y, r);
    } else if (r.kind === "workshop") {
      for (const [x, y] of corners(r).slice(0, 1)) putCache(j, x, y, r);
      for (const [x, y] of corners(r).slice(1, 3)) { g[(y - y0) * W + (x - x0)] = 8; }          // benches: pillars at the other corners
    } else if (r.kind === "core") {
      for (const [x, y] of corners(r).slice(0, 2)) putCache(j, x, y, r);
    } else if (r.kind === "trap" && !r.tpl) {
      const n = 2 + (hash3(dun.seed ^ 0x33, r.x0, r.y0, j) % 2), cs = freeCells(r, true);
      for (let k = 0; k < Math.min(n, cs.length); k++) putTrap(j, cs[k][0], cs[k][1], trapKind(hash3(dun.seed ^ 0x7a9, cs[k][0], cs[k][1], j), true, j, cs[k][0], cs[k][1]));
    }
  }
  // corridor traps: a cell in a corridor (not a room, not the stub's end)
  for (let j = 0; j < L; j++) for (let y = y0; y < y0 + H; y++) for (let x = x0; x < x0 + W; x++) {
    const v = grid[j][(y - y0) * W + (x - x0)];
    if (!(v & 1) || (v & 8) || (v & 16)) continue;
    if (dun.ov.has((y - y0) * W + (x - x0))) continue;
    if (x < x0 + 3 || y < y0 + 3 || x >= x0 + W - 3 || y >= y0 + H - 3) continue;                    // not near the edge doors
    const h = hash3(dun.seed ^ 0xc07, x, y, j);
    if (h % 100 < 2) {
      // only on a straight stretch (two open neighbours in line), never at a bend or junction
      const w = (grid[j][(y - y0) * W + (x - 1 - x0)] & 1) && (grid[j][(y - y0) * W + (x + 1 - x0)] & 1), n = (grid[j][(y - 1 - y0) * W + (x - x0)] & 1) && (grid[j][(y + 1 - y0) * W + (x - x0)] & 1);
      const nb = ((grid[j][(y - y0) * W + (x - 1 - x0)] & 1) + (grid[j][(y - y0) * W + (x + 1 - x0)] & 1) + (grid[j][(y - 1 - y0) * W + (x - x0)] & 1) + (grid[j][(y + 1 - y0) * W + (x - x0)] & 1));
      if (nb === 2 && (w || n)) putTrap(j, x, y, trapKind(h >>> 3, false, j, x, y));
    }
  }
  // the core's own cell is not a trap or a cache
  dun.traps.delete(keyOf(dun, dun.core.x, dun.core.y, dun.core.z));
  dun.caches.delete(keyOf(dun, dun.core.x, dun.core.y, dun.core.z));
}

// ---- entrances ----------------------------------------------------------------------------------------------------------

function doors(def, dun, R) {
  const { Gx, Gy, W, H, x0, y0, L, s, grid } = dun, core = dun.core, sp = def.spawn;
  const mod = (gx, gy) => dun.rooms.find(r => r.gx === gx && r.gy === gy);
  const roomAnchor = (j, gx, gy) => {
    // the room of that module on that level (rooms[] holds rooms only; a junction module has its anchor at the module centre)
    const r = dun.rooms.find(q => q.j === j && q.gx === gx && q.gy === gy);
    return r ? { ax: r.ax, ay: r.ay } : { ax: x0 + gx * MS + 4, ay: y0 + gy * MS + 4 };
  };
  void mod;
  const doorAt = (j, side, g) => {
    const gx = side < 2 ? (side === 0 ? 0 : Gx - 1) : g, gy = side < 2 ? g : (side === 2 ? 0 : Gy - 1);
    if (!dun.use[j][gy * Gx + gx]) return null;                // that edge module is not dug on that level
    const a = roomAnchor(j, gx, gy), cells = [];
    if (side < 2) { const ex = side === 0 ? x0 : x0 + W - 1; for (let x = Math.min(a.ax, ex); x <= Math.max(a.ax, ex); x++) cells.push([x, a.ay]); return { cells, x: ex, y: a.ay, j, z: s[j], side }; }
    const ey = side === 2 ? y0 : y0 + H - 1;
    for (let y = Math.min(a.ay, ey); y <= Math.max(a.ay, ey); y++) cells.push([a.ax, y]);
    return { cells, x: a.ax, y: ey, j, z: s[j], side };
  };
  const addDoor = (d) => { for (const [x, y] of d.cells) grid[d.j][(y - y0) * W + (x - x0)] |= 3; dun.doors.push(d); };
  const nodeRx = Math.floor(core.x / CRS), nodeRy = Math.floor(core.y / CRS), node = nodeOf(def, nodeRx, nodeRy);
  // links: tunnels from the node to a door, on the side that faces it first, then on a side that half faces it
  if (node) {
    const cx = x0 + W / 2, cy = y0 + H / 2, dx = node.x - cx, dy = node.y - cy;
    const sides = [[-dx, 0], [dx, 1], [-dy, 2], [dy, 3]].filter(q => q[0] > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, 2).map(q => q[1]);
    let made = 0;
    for (const side of sides) {
      const along = side < 2 ? Gy : Gx, target = side < 2 ? Math.floor((node.y - y0) / MS) : Math.floor((node.x - x0) / MS), order = [];
      for (let k = 0; k < along; k++) order.push(Math.max(0, Math.min(along - 1, Math.max(0, Math.min(along - 1, target)) + (k & 1 ? -1 : 1) * ((k + 1) >> 1))));
      for (let j = 0; j < L && made < 2; j++) {
        const jj = (j + dun.jc) % L;
        if (s[jj] < ZMIN || s[jj] > ZMAX) continue;
        for (let k = 0; k < order.length && made < 2; k++) {
          const g = order[k], d = doorAt(jj, side, g);
          if (!d) continue;
          if (dun.doors.some(q => q.side === side && Math.abs((side < 2 ? q.y - d.y : q.x - d.x)) < 5) || dun.doors.some(q => q.x === d.x && q.y === d.y)) continue;      // (a tunnel is 3 high: two doors never stack)
          let p = null;
          for (const amp of [10, 4, 0]) {                         // a winding tunnel if it clears the walls, else a straighter one
            const q0 = tunnel(def, node, { x: d.x, y: d.y, z: d.z }, 181 + made * 10, (dun.seed & 1023) + made, amp, 12, null), N = q0.xs.length;
            let ok = N > 6 && N < 170 && q0.zs[N - 1] === d.z;
            for (let q = 0; ok && q < N; q++) {
              if (q0.zs[q] < 0) ok = false;
              else if (sp && (q0.xs[q] - sp.x) ** 2 + (q0.ys[q] - sp.y) ** 2 < (HOME_R + 4) ** 2) ok = false;
              else if (q < N - 1 && q0.xs[q] >= x0 && q0.xs[q] < x0 + W && q0.ys[q] >= y0 && q0.ys[q] < y0 + H) ok = false;       // the approach stays outside the walls until the door (inside the footprint the labyrinth wins over every natural cave)
            }
            if (ok) { p = q0; break; }
          }
          if (!p) continue;
          addDoor(d); d.link = true;
          dun.links.push(p); made++;
          dun.entrances.push({ kind: "cave", x: d.x, y: d.y, z: d.z, j: jj });
        }
      }
    }
  }
  // a ruin: a stair from a door up to the surface (the highest levels first). Always tried when no link was made; otherwise 5 times in 12.
  if (!dun.links.length || R.int(12) < 5) {
    const first = R.int(4), off = R.int(16);
    for (let j = L - 1; j >= 0 && !dun.ramps.length; j--) {
      const sj = s[j];
      for (let sd = 0; sd < 4 && !dun.ramps.length; sd++) {
        const side = (first + sd) & 3, along = side < 2 ? Gy : Gx, [ux, uy] = DIRS[side];
        for (let gi = 0; gi < along && !dun.ramps.length; gi++) {
          const d = doorAt(j, side, (gi + off) % along);
          if (!d) continue;
          const xs = [], ys = [], zs = [];
          let done = false, ok = true;
          for (let i = 1; i <= 26 && ok && !done; i++) {
            const x = d.x + ux * i, y = d.y + uy * i, z = sj + i, h = def.hAt(x, y);
            ok = h >= WATER + 3 && !(sp && (x - sp.x) ** 2 + (y - sp.y) ** 2 < (HOME_R + 4) ** 2);
            xs.push(x); ys.push(y); zs.push(z);
            if (z >= h + 1) done = true;
          }
          if (!ok || !done || xs.length < 4) continue;
          addDoor(d);
          const ramp = { xs, ys, zs, mouth: { x: xs[xs.length - 1], y: ys[ys.length - 1], z: zs[zs.length - 1] }, side };
          dun.ramps.push(ramp);
          for (let i = 0; i < xs.length; i++) { dun.extra.add(extraKey(dun, xs[i], ys[i], zs[i])); dun.extra.add(extraKey(dun, xs[i], ys[i], zs[i] + 1)); }
          dun.entrances.push({ kind: "ruin", x: d.x, y: d.y, z: d.z, j, mouth: ramp.mouth });
        }
      }
    }
  }
}
const extraKey = (dun, x, y, z) => ((x + 100000) * 262144 + (y + 100000)) * 32 + z;

// ---- questions about a cell ---------------------------------------------------------------------------------------------

/** Is this cell the air of the labyrinth (rooms, corridors, stairs, the ramp)? A cache cell is not. */
export function isAir(dun, x, y, z) {
  const lx = x - dun.x0, ly = y - dun.y0;
  if (lx >= 0 && ly >= 0 && lx < dun.W && ly < dun.H) {
    const k = ly * dun.W + lx, rel = z - dun.s[0];
    if (rel >= 0) {
      const j = Math.floor(rel / LEVEL_H), r = rel - j * LEVEL_H;
      const o = dun.ov.get(k);
      if (o && j >= o.j && j <= o.j + 1 && z >= dun.s[o.j] && z <= dun.s[o.j] + 4) return z >= o.lo && z <= o.hi;
      if (j < dun.L && r < 2) return (dun.grid[j][k] & 1) === 1;
    }
    return false;
  }
  return dun.extra.size > 0 && dun.extra.has(extraKey(dun, x, y, z));
}
/** Is the cell a ruin-ramp cell (air outside the footprint)? */
export const isRamp = (dun, x, y, z) => dun.extra.has(extraKey(dun, x, y, z));
/** The trap kind at a stand cell, or "". */
export function trapAt(dun, x, y, z) { const k = keyOf(dun, x, y, z); return k < 0 ? "" : dun.traps.get(k) || ""; }
/** The cache at a cell, or null. */
export function cacheAt(dun, x, y, z) { const k = keyOf(dun, x, y, z); return k < 0 ? null : dun.caches.get(k) || null; }
/** The room whose floor rectangle holds the stand cell, or null. */
export function roomAt(dun, x, y, z) {
  const rel = z - dun.s[0];
  if (rel < 0) return null;
  const j = Math.floor(rel / LEVEL_H);
  for (const r of dun.rooms) if (r.j === j && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r;
  return null;
}
/** Every trap as [{x, y, z, k}] (ascending by key). */
export function trapList(dun) {
  const out = [];
  for (const [key, k] of [...dun.traps].sort((a, b) => a[0] - b[0])) { const lx = key % dun.W, ly = Math.floor(key / dun.W) % dun.H, z = Math.floor(key / (dun.W * dun.H)); out.push({ x: dun.x0 + lx, y: dun.y0 + ly, z, k }); }
  return out;
}
export function cacheList(dun) {
  const out = [];
  for (const [key, c] of [...dun.caches].sort((a, b) => a[0] - b[0])) { const lx = key % dun.W, ly = Math.floor(key / dun.W) % dun.H, z = Math.floor(key / (dun.W * dun.H)); out.push({ x: dun.x0 + lx, y: dun.y0 + ly, z, c }); }
  return out;
}

// ---- treasure -----------------------------------------------------------------------------------------------------------

/** Loot rows: item, count range, the lowest mana band it appears in, weight. Richer near the core: more rolls, larger counts, rarer rows. */
export const LOOT = [
  { item: "copper",     n: [1, 3], band: 0, w: 6 },
  { item: "gem",        n: [1, 2], band: 0, w: 5 },
  { item: "crystal",    n: [1, 3], band: 1, w: 4 },
  { item: "core_shard", n: [1, 2], band: 1, w: 3 },
  { item: "ancient_tool", n: [1, 1], band: 1, w: 3 },
  { item: "tablet",     n: [1, 1], band: 2, w: 2 },
  { item: "relic",      n: [1, 1], band: 2, w: 2 },
  { item: "core_ore",   n: [2, 3], band: 3, w: 3 },
];
/** What a unit of each loot item is worth, for tests and the chronicle (a best guess). */
export const LOOT_VALUE = { copper: 2, gem: 5, crystal: 4, core_shard: 8, ancient_tool: 10, tablet: 12, relic: 25, core_ore: 7 };
export const RELIC_A = ["Hollow", "Pale", "Last", "Sunken", "Quiet", "Bright", "Broken", "Old"];
export const RELIC_B = ["Crown", "Lamp", "Seal", "Ring", "Mask", "Chalice", "Key", "Comb"];
/** The loot of the cache at (x, y, z): [[item, n], ...]. Pure; the band is the mana at the cache. */
export function lootAt(def, x, y, z) {
  const dun = dungeonAt(def, x, y);
  if (!dun) return [];
  let mana = 0;
  for (const c of coresNear(def, x, y, x, y)) mana = Math.max(mana, manaFrom(c, x, y, z));
  const band = bandOf(mana), h0 = hash3(dun.seed ^ 0x100f, x, y, z);
  const rolls = 1 + (band >= 2 ? 1 : 0) + (band >= 4 ? 1 : 0) + (h0 % 4 === 0 ? 1 : 0), out = [];
  const rows = LOOT.filter(r => r.band <= band), tot = rows.reduce((a, r) => a + r.w, 0);
  for (let i = 0; i < rolls; i++) {
    const h = hash3(dun.seed ^ 0x100f, x + i * 7, y, z + i);
    let t = h % tot, row = rows[0];
    for (const r of rows) { if (t < r.w) { row = r; break; } t -= r.w; }
    const n = row.n[0] + ((h >>> 12) % (row.n[1] - row.n[0] + 1)) + (band >= 3 && row.n[1] > 1 ? 1 : 0);
    const e = out.find(q => q[0] === row.item);
    if (e) e[1] += n; else out.push([row.item, n]);
  }
  return out;
}
/** The name of the artefact in the cache at a cell. */
export function relicName(def, x, y, z) { const h = hash3(def.seed ^ 0x2e11c, x, y, z); return "the " + RELIC_A[h % RELIC_A.length] + " " + RELIC_B[(h >>> 8) % RELIC_B.length]; }

// ---- reachability (the generator's own check; tests walk the real pathfinder too) ----------------------------------------

const solidAt = (dun, x, y, z) => !isAir(dun, x, y, z);
export const standable = (dun, x, y, z) => isAir(dun, x, y, z) && solidAt(dun, x, y, z - 1) && !(x === dun.core.x && y === dun.core.y && z === dun.core.z);      // (the core itself stands in its chamber)
/** Every stand cell reachable from the entrances under the pathfinder's own step rules (4-neighbour, one level up or down): a Set of keys (cells inside the footprint only). */
export function reachable(dun) {
  const seen = new Set(), q = [], skey = (x, y, z) => ((x + 100000) * 262144 + (y + 100000)) * 32 + z;
  const go = (x, y, z) => { const k = skey(x, y, z); if (!seen.has(k)) { seen.add(k); q.push([x, y, z]); } };
  for (const e of dun.entrances) go(e.x, e.y, e.z);
  while (q.length) {
    const [x, y, z] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (standable(dun, nx, ny, z)) go(nx, ny, z);
      else if (standable(dun, nx, ny, z + 1) && !solidAt(dun, x, y, z + 1)) go(nx, ny, z + 1);
      else if (standable(dun, nx, ny, z - 1) && !solidAt(dun, nx, ny, z)) go(nx, ny, z - 1);
    }
  }
  return { has: (x, y, z) => seen.has(skey(x, y, z)), size: seen.size };
}

// ---- carving a chunk ----------------------------------------------------------------------------------------------------

const L16 = (lx, ly, z) => ((z << 4) | ly) << 4 | lx;
/**
 * Open the labyrinth round this chunk: first its air (rooms, corridors, stairs, the ramp; flagged NATURAL | DUNGEON), then the caches, then M.DWALL on every solid cell that touches
 * that air or a cache (the walls, floors and ceilings), and the stone arch at a ruin's mouth. Cells beyond the chunk are asked of the pure `isAir`, never read.
 */
export function carveDungeon(def, X0, Y0, mats, flgs, hs) {
  for (const dun of dungeonsIn(def, X0 - 1, Y0 - 1, X0 + 16, Y0 + 16)) {
    const inRamp = (x, y) => dun.ramps.some(r => { for (let i = 0; i < r.xs.length; i++) if (Math.abs(r.xs[i] - x) <= 1 && Math.abs(r.ys[i] - y) <= 1) return true; return false; });
    const ax0 = Math.max(X0, dun.bb.x0), ax1 = Math.min(X0 + 15, dun.bb.x1), ay0 = Math.max(Y0, dun.bb.y0), ay1 = Math.min(Y0 + 15, dun.bb.y1);
    for (let y = ay0; y <= ay1; y++) for (let x = ax0; x <= ax1; x++) {
      const c = (y - Y0) * 16 + (x - X0), h = hs[c], inGrid = x >= dun.x0 - 1 && x <= dun.x0 + dun.W && y >= dun.y0 - 1 && y <= dun.y0 + dun.H;
      const ramp = !inGrid && inRamp(x, y);
      if (!inGrid && !ramp) continue;
      const zlo = ramp ? 1 : Math.max(1, dun.zlo - 1), zhi = ramp ? D - 2 : Math.min(D - 2, dun.zhi + 1);
      for (let z = zlo; z <= zhi; z++) {
        const i = L16(x - X0, y - Y0, z), m = mats[i];
        if (!ramp && !isAir(dun, x, y, z) && !(z >= dun.zlo && z <= dun.zhi && cacheAt(dun, x, y, z)) && x >= dun.x0 && x < dun.x0 + dun.W && y >= dun.y0 && y < dun.y0 + dun.H && z >= dun.zlo && z <= dun.zhi && (m === M.AIR || m === M.WATER)) {
          mats[i] = M.DWALL; flgs[i] &= ~(F.NATURAL | F.GAS);          // inside the footprint the labyrinth wins over a natural cave or pool that ran through it (its cut ends face stonework)
          continue;
        }
        if (isAir(dun, x, y, z)) {
          if (m === M.WATER) continue;
          if (z > h - 2 && !isRamp(dun, x, y, z)) continue;               // (the footprint was chosen with cover; only the ramp climbs out)
          mats[i] = M.AIR; flgs[i] = (flgs[i] | F.NATURAL | F.DUNGEON) & ~F.GAS;
        } else if (dun.caches.size && z >= dun.zlo && z <= dun.zhi && cacheAt(dun, x, y, z) && m !== M.WATER) {
          mats[i] = M.CACHE; flgs[i] &= ~F.NATURAL;
        }
      }
    }
    // walls
    for (let y = ay0; y <= ay1; y++) for (let x = ax0; x <= ax1; x++) {
      const c = (y - Y0) * 16 + (x - X0), inGrid = x >= dun.x0 - 1 && x <= dun.x0 + dun.W && y >= dun.y0 - 1 && y <= dun.y0 + dun.H;
      if (!inGrid && !inRamp(x, y)) continue;
      const zlo = inGrid ? Math.max(1, dun.zlo - 1) : 1, zhi = inGrid ? Math.min(D - 2, dun.zhi + 1) : D - 2;
      for (let z = zlo; z <= zhi; z++) {
        const i = L16(x - X0, y - Y0, z), m = mats[i];
        if (m === M.AIR || m === M.WATER || m === M.DWALL || m === M.CACHE || m === M.CORE) continue;
        if (isAir(dun, x, y, z)) continue;
        if (isAir(dun, x + 1, y, z) || isAir(dun, x - 1, y, z) || isAir(dun, x, y + 1, z) || isAir(dun, x, y - 1, z) || isAir(dun, x, y, z + 1) || isAir(dun, x, y, z - 1)) { mats[i] = M.DWALL; flgs[i] &= ~F.GAS; }
        else if (inGrid && z >= dun.zlo && z <= dun.zhi && x >= dun.x0 - 1 && x <= dun.x0 + dun.W && y >= dun.y0 - 1 && y <= dun.y0 + dun.H && (cacheAt(dun, x + 1, y, z) || cacheAt(dun, x - 1, y, z) || cacheAt(dun, x, y + 1, z) || cacheAt(dun, x, y - 1, z))) { mats[i] = M.DWALL; flgs[i] &= ~F.GAS; }
      }
    }
    for (const r of dun.ramps) {                                           // the ruin's arch: two stone posts either side of the mouth
      const [ux, uy] = DIRS[r.side], px = -uy, py = ux, mx = r.mouth.x, my = r.mouth.y;
      for (const sg of [-1, 1]) {
        const x = mx + px * 2 * sg, y = my + py * 2 * sg;
        if (x < X0 || x > X0 + 15 || y < Y0 || y > Y0 + 15) continue;
        const h = hs[(y - Y0) * 16 + (x - X0)];
        for (let k = 1; k <= 3; k++) if (h + k < D && mats[L16(x - X0, y - Y0, h + k)] === M.AIR) { mats[L16(x - X0, y - Y0, h + k)] = M.DWALL; flgs[L16(x - X0, y - Y0, h + k)] |= F.NOGROW; }
        flgs[L16(x - X0, y - Y0, h)] |= F.NOGROW;
      }
    }
  }
}
export { MANA_R };
