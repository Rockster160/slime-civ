// Blueprints (GDD §12.6): capture a built rectangle, rotate it, stamp it as ghosts.
//
//   bp = {id, name, w, h, cells:[[dx, dy, piece, mat]], auto: 0|1, rev}
//   piece wall|floor|roof|door|bed|rack; mat is a BMAT key for wall/floor/roof, "" otherwise.
// A blueprint is one level (the stand level it was captured at). Its material
// CLASSES are the roles wall/floor/roof: at stamp time the player may swap every
// wall for another wall material (`over = {wall:"stone"}`), or leave "same as
// captured" (over[role] falsy). Saved in the game save (sim.bps) and, by the UI,
// in a localStorage library.
import { World, F } from "./world.js";
import { BMAT, BMAT_OF, DEFAULT_MAT, checkPlace, csiteAt, placeGhosts, costOf } from "./build.js";
import { once } from "./chronicle.js";

export const MAX_BP_CELLS = 1500;

export function newBps() { return { n: 0, list: [] }; }

/** Read built pieces in a rectangle at stand level z (terrain is not captured). Returns the blueprint (not yet stored) or null if empty. */
export function capture(sim, name, x0, y0, x1, y1, z) {
  const w = sim.world, ax = Math.min(x0, x1), ay = Math.min(y0, y1), bx = Math.max(x0, x1), by = Math.max(y0, y1);
  const cells = [];
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    const pieceAt = (cz, role) => {
      const m = w.mat(x, y, cz), k = BMAT_OF[m];
      return k && BMAT[k].role === role && (w.flags(x, y, cz) & F.PLAYER) ? k : null;
    };
    const f = pieceAt(z - 1, "floor"), wl = pieceAt(z, "wall"), r = pieceAt(z + 1, "roof");
    if (f) cells.push([x - ax, y - ay, "floor", f]);
    if (wl) cells.push([x - ax, y - ay, "wall", wl]);
    if (r) cells.push([x - ax, y - ay, "roof", r]);
    for (const id of sim.ents.at(x, y, z)) {
      const e = sim.ents.get(id);
      if (e.kind === "furniture") cells.push([x - ax, y - ay, e.f, ""]);
    }
  }
  if (!cells.length || cells.length > MAX_BP_CELLS) return null;
  return { name: String(name || "Blueprint").slice(0, 40), w: bx - ax + 1, h: by - ay + 1, cells, auto: 0, rev: 1 };
}

/** Rotate a footprint r quarter-turns clockwise. Returns {w, h, cells} with swapped materials applied. */
export function oriented(bp, rot, over = {}) {
  let { w, h } = bp, cells = bp.cells.map(c => [c[0], c[1], c[2], c[3]]);
  for (let i = 0; i < (((rot % 4) + 4) % 4); i++) {
    cells = cells.map(([dx, dy, p, m]) => [h - 1 - dy, dx, p, m]);
    [w, h] = [h, w];
  }
  cells = cells.map(([dx, dy, p, m]) => [dx, dy, p, (p === "wall" || p === "floor" || p === "roof") && over[p] ? over[p] : m]);
  return { w, h, cells };
}

/** Build-command cells for a stamp with its corner at (ox, oy) on level z. */
export function stampCells(bp, ox, oy, z, rot, over) {
  return oriented(bp, rot, over).cells.map(([dx, dy, p, m]) => ({ w: p, m, x: ox + dx, y: oy + dy, z }));
}

/** Materials a stamp needs: {item: n}. */
export function needs(bp, over) {
  const out = {};
  for (const [, , p, m] of oriented(bp, 0, over).cells) { const c = costOf(p, m); if (c) out[c.item] = (out[c.item] || 0) + c.n; }
  return out;
}
export const bedCount = (bp) => bp.cells.filter(c => c[2] === "bed").length;
/** True if every piece of a stamp could be placed (used to find a spot for auto-build). */
export function fits(sim, cells) {
  for (const c of cells) {
    if (checkPlace(sim, c.w, c.m, c.x, c.y, c.z) || csiteAt(sim, c.x, c.y, c.z, c.w)) return false;
  }
  return true;
}

// ---- commands ----

export const BP_COMMANDS = {
  /** {type:"blueprint", op:"capture", name, x0,y0,x1,y1,z} | "remove" {id} | "auto" {id, on} | "rename" {id, name} | "add" {bp} (library import) */
  blueprint(sim, c) {
    const L = sim.bps;
    if (c.op === "capture") {
      const bp = capture(sim, c.name, c.x0, c.y0, c.x1, c.y1, c.z);
      if (!bp) return false;
      L.list.push({ id: ++L.n, ...bp });
      return true;
    }
    if (c.op === "add" && c.bp && Array.isArray(c.bp.cells) && c.bp.cells.length <= MAX_BP_CELLS) {
      const b = c.bp;
      if (!(b.w > 0 && b.h > 0)) return false;
      L.list.push({ id: ++L.n, name: String(b.name || "Blueprint").slice(0, 40), w: b.w | 0, h: b.h | 0, cells: b.cells.map(q => [q[0] | 0, q[1] | 0, String(q[2]), String(q[3] || "")]), auto: 0, rev: 1 });
      return true;
    }
    const i = L.list.findIndex(b => b.id === c.id);
    if (i < 0) return false;
    if (c.op === "remove") L.list.splice(i, 1);
    else if (c.op === "auto") L.list[i].auto = c.on ? 1 : 0;
    else if (c.op === "rename") L.list[i].name = String(c.name || "Blueprint").slice(0, 40);
    else return false;
    return true;
  },
  /** {type:"build", cells:[{w, m?, x, y, z}], bp?: blueprintId}: paint ghosts. One command = one group for supports-first ordering. */
  build(sim, c) {
    if (!Array.isArray(c.cells) || c.cells.length > 4000) return false;
    const g = ++sim.board.sg;
    const r = placeGhosts(sim, c.cells, g);
    if (r.placed) {
      sim.board.ep++;
      if (c.bp) once(sim, "firstStamp", "MILESTONE", "The first blueprint was stamped: “" + ((sim.bps.list.find(b => b.id === c.bp) || {}).name || "a design") + "”.", [], {}, 1);
    }
    return r.placed > 0;
  },
};

// ---- the village starts an auto-build blueprint itself (R8) ----

const SPOTS = [];
for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) SPOTS.push([dx, dy]);
SPOTS.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);

/**
 * Every 200 ticks: if the village wants beds and the player flagged a blueprint
 * "auto-build", place one copy on the nearest flat free spot beyond the stockpile.
 * Villagers never DESIGN a room (R8); this only repeats the player's design.
 */
export function autoBuild(sim) {
  const b = sim.board;
  if (!(b.sneed > 0) || !(b.dem.shelter > 0 || b.sc)) return false;
  if (sim.ents.ofKind("csite").some(s => s.g === b.ag)) return false;          // the last one is still going up
  const bps = sim.bps.list.filter(p => p.auto && p.cells.length);
  if (!bps.length) return false;
  const bp = bps.find(p => bedCount(p) > 0) || bps[0], z = sim.stock.z, st = sim.stock;
  const cx = (st.x0 + st.x1) >> 1, cy = (st.y0 + st.y1) >> 1;
  for (const [dx, dy] of SPOTS) {
    const ox = cx + dx, oy = cy + dy;
    if (ox + bp.w > st.x0 - 2 && ox < st.x1 + 3 && oy + bp.h > st.y0 - 2 && oy < st.y1 + 3) continue;     // keep off the stockpile
    const cells = stampCells(bp, ox, oy, z, 0, {});
    if (!fits(sim, cells)) continue;
    const g = ++b.sg;
    placeGhosts(sim, cells, g);
    b.ag = g; b.ep++;
    return true;
  }
  return false;
}
