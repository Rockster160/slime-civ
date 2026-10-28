// Blueprints (GDD §12.6): capture a built rectangle, rotate it, stamp it as ghosts.
//
//   bp = {id, name, w, h, cells:[[dx, dy, piece, mat]], auto: 0|1, rev, hist?:{rev:{w,h,cells}}}   (S11: hist keeps every earlier revision, for diffing)
//   sim.bps.inst = [{id, bp, rev, ox, oy, z, rot, over, q:[queued cells], g}]   (S11, K10: every stamp remembers its blueprint, revision, corner, rotation and overrides)
//   piece wall|floor|roof|door|bed|rack; mat is a BMAT key for wall/floor/roof, "" otherwise.
// A blueprint is one level (the stand level it was captured at). Its material
// CLASSES are the roles wall/floor/roof: at stamp time the player may swap every
// wall for another wall material (`over = {wall:"stone"}`), or leave "same as
// captured" (over[role] falsy). Saved in the game save (sim.bps) and, by the UI,
// in a localStorage library.
import { World, F } from "./world.js";
import { BMAT, BMAT_OF, DEFAULT_MAT, checkPlace, csiteAt, placeGhosts, costOf, builtPiece, markPiece, replaceOk, removeSite } from "./build.js";
import { once } from "./chronicle.js";

export const MAX_BP_CELLS = 1500;

export function newBps() { return { n: 0, list: [], inst: [], ni: 0 }; }

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


// ---- instances and revisions (S11, K10) ----

const layerOf = (p) => (p === "floor" ? 1 : p === "roof" ? 2 : 0);
const keyOf = (dx, dy, p) => dx + "," + dy + "," + layerOf(p);
export const MAX_REV_HIST = 8;
const ROLE = { wall: 1, floor: 1, roof: 1 };

/** Remember a stamp: which blueprint, which revision, where, turned how. */
export function addInstance(sim, bp, ox, oy, z, rot = 0, over = {}) {
  const L = sim.bps;
  if (L.inst.length >= 300) L.inst.shift();
  const inst = { id: ++L.ni, bp: bp.id, rev: bp.rev || 1, ox, oy, z, rot: rot | 0, over: { wall: over.wall || "", roof: over.roof || "", floor: over.floor || "" }, q: [], g: 0 };
  L.inst.push(inst);
  return inst;
}
export const instancesOf = (sim, bpId) => sim.bps.inst.filter(i => i.bp === bpId);

/** Make revision n+1 of a blueprint from new geometry; the old one is kept in hist so instances can be diffed against what they were built from. */
export function revise(sim, bp, w, h, cells) {
  if (!bp.hist) bp.hist = {};
  bp.hist[bp.rev || 1] = { w: bp.w, h: bp.h, cells: bp.cells };
  const keys = Object.keys(bp.hist).map(Number).sort((a, b) => a - b);
  while (keys.length > MAX_REV_HIST) delete bp.hist[keys.shift()];
  bp.rev = (bp.rev || 1) + 1; bp.w = w; bp.h = h; bp.cells = cells;
}
const sameCells = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const revCells = (bp, rev) => (rev === bp.rev ? { w: bp.w, h: bp.h, cells: bp.cells } : bp.hist && bp.hist[rev]) || null;

/** Edit-in-place: set/replace cells (by position and layer) and delete cells. set: [[dx,dy,piece,mat]], del: [[dx,dy,piece]]. Grows the footprint if a cell lies outside. */
export function editCells(bp, set = [], del = []) {
  const m = new Map(bp.cells.map(c => [keyOf(c[0], c[1], c[2]), c]));
  for (const [dx, dy, p] of del) m.delete(keyOf(dx, dy, p));
  for (const [dx, dy, p, mat] of set) { if (dx >= 0 && dy >= 0 && dx < 40 && dy < 40) m.set(keyOf(dx, dy, p), [dx | 0, dy | 0, String(p), String(mat || "")]); }
  const cells = [...m.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0] || layerOf(a[2]) - layerOf(b[2]));
  let w = bp.w, h = bp.h;
  for (const c of cells) { w = Math.max(w, c[0] + 1); h = Math.max(h, c[1] + 1); }
  return { w, h, cells };
}

/** Redraw the same house in other material classes (the shelter ladder). A floor material adds a floor under every roof cell that has none. */
export function rethemeCells(bp, over) {
  const cells = bp.cells.map(([dx, dy, p, m]) => [dx, dy, p, (p === "wall" || p === "floor" || p === "roof") && over[p] ? over[p] : m]);
  if (over.floor) {
    const has = new Set(cells.filter(c => c[2] === "floor").map(c => c[0] + "," + c[1]));
    for (const c of bp.cells) if (c[2] === "roof" && !has.has(c[0] + "," + c[1])) cells.push([c[0], c[1], "floor", over.floor]);
  }
  return { w: bp.w, h: bp.h, cells };
}

/**
 * The difference between an instance's revision and the blueprint's current one, in world cells (stand level z):
 *   keep = pieces already as wanted (left alone), rep = swap a material in place, del = take down, add = build.
 * Pure: it reads cells, not the world, except for `edited` (built pieces that are not what the instance's own revision says).
 */
export function diffInstance(sim, bp, inst) {
  const out = { keep: [], rep: [], del: [], add: [] };
  const oldR = revCells(bp, inst.rev), newR = revCells(bp, bp.rev);
  if (!oldR || !newR) return out;
  const o = oriented({ w: oldR.w, h: oldR.h, cells: oldR.cells }, inst.rot, inst.over), n = oriented({ w: newR.w, h: newR.h, cells: newR.cells }, inst.rot, inst.over);
  const om = new Map(o.cells.map(c => [keyOf(c[0], c[1], c[2]), c])), nm = new Map(n.cells.map(c => [keyOf(c[0], c[1], c[2]), c]));
  const at = (c) => ({ w: c[2], m: c[3], x: inst.ox + c[0], y: inst.oy + c[1], z: inst.z });
  for (const [k, c] of nm) {
    const old = om.get(k);
    if (old && old[2] === c[2] && old[3] === c[3]) out.keep.push(at(c));
    else if (old && ROLE[old[2]] && old[2] === c[2]) out.rep.push(at(c));
    else { if (old) out.del.push(at(old)); out.add.push(at(c)); }
  }
  for (const [k, c] of om) if (!nm.has(k)) out.del.push(at(c));
  return out;
}

/** Has anyone changed the building by hand? Built pieces that are neither what the instance's revision says nor missing. */
export function handEdited(sim, bp, inst) {
  const r = revCells(bp, inst.rev);
  if (!r) return false;
  for (const c of oriented({ w: r.w, h: r.h, cells: r.cells }, inst.rot, inst.over).cells) {
    if (c[2] !== "wall" && c[2] !== "floor" && c[2] !== "roof") continue;
    const p = builtPiece(sim, c[2], inst.ox + c[0], inst.oy + c[1], inst.z);
    if (p && p.key !== c[3]) return true;
  }
  return false;
}

/** Try to place queued adds whose cells are free now (an old piece has been taken down). Cells already as wanted, or stale, drop out. */
function flushQueue(sim, inst) {
  if (!inst.q.length) return 0;
  const left = [];
  let placed = 0;
  for (const c of inst.q) {
    if (c.until < sim.tick) continue;
    if (builtPiece(sim, c.w, c.x, c.y, c.z)) continue;
    if (!checkPlace(sim, c.w, c.m, c.x, c.y, c.z) && !csiteAt(sim, c.x, c.y, c.z, c.w)) { placed += placeGhosts(sim, [c], inst.g).placed; continue; }
    left.push(c);
  }
  inst.q = left;
  return placed;
}

/** Push the current revision to one instance: mark removals, place swaps and additions (queue those whose cell is still occupied). Returns {rep, del, add, keep}. */
export function pushInstance(sim, bp, inst) {
  const d = diffInstance(sim, bp, inst), g = ++sim.board.sg;
  inst.g = g;
  let del = 0, rep = 0, add = 0;
  for (const c of d.del) {
    const s = csiteAt(sim, c.x, c.y, c.z, c.w);
    if (s) removeSite(sim, s); else if (markPiece(sim, c.w, c.x, c.y, c.z)) del++;
  }
  const reps = [], adds = d.add.slice();
  for (const c of d.rep) (replaceOk(sim, c.w, c.m, c.x, c.y, c.z) ? reps : adds).push(c);        // a swap needs the old piece to stand; if it never got built, it is just an addition
  rep = placeGhosts(sim, reps.map(c => ({ ...c, rp: 1 })), g).placed;
  for (const c of adds) {
    if (builtPiece(sim, c.w, c.x, c.y, c.z)) continue;                       // already there as wanted
    if (!checkPlace(sim, c.w, c.m, c.x, c.y, c.z)) { add += placeGhosts(sim, [c], g).placed; continue; }
    inst.q.push({ ...c, until: sim.tick + 9000 }); add++;                      // still occupied (a piece is coming down): retry when it is free
  }
  inst.rev = bp.rev;
  sim.board.ep++;
  return { rep, del, add, keep: d.keep.length };
}

/** Every 100 ticks: queued additions of pushed revisions wait for the old piece to come down. */
export function instanceTick(sim) {
  for (const i of sim.bps.inst) if (i.q.length) flushQueue(sim, i);
}

/** Work still to do on an instance after a push: ghosts, takedown marks and queued adds in its footprint. */
export function pendingWork(sim, bp, inst) {
  const dims = oriented(bp, inst.rot, inst.over), inside = (e) => e.z === inst.z && e.x >= inst.ox && e.y >= inst.oy && e.x < inst.ox + dims.w && e.y < inst.oy + dims.h;
  return sim.ents.ofKind("csite").filter(inside).length + sim.ents.ofKind("dsite").filter(inside).length + inst.q.length;
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
    const bp = L.list[i];
    if (c.op === "recapture") {                            // S11: capture again over the original: revision n+1 (nothing changed = no new revision)
      const nb = capture(sim, bp.name, c.x0, c.y0, c.x1, c.y1, c.z);
      if (!nb || sameCells(nb.cells, bp.cells) && nb.w === bp.w && nb.h === bp.h) return false;
      revise(sim, bp, nb.w, nb.h, nb.cells);
      return true;
    }
    if (c.op === "edit") {                                 // S11: edit in place: {set:[[dx,dy,piece,mat]], del:[[dx,dy,piece]]}
      const r = editCells(bp, c.set, c.del);
      if (!r.cells.length || r.cells.length > MAX_BP_CELLS || (sameCells(r.cells, bp.cells) && r.w === bp.w && r.h === bp.h)) return false;
      revise(sim, bp, r.w, r.h, r.cells);
      return true;
    }
    if (c.op === "retheme") {                              // S11: the same house in other materials (wall/roof/floor BMAT keys)
      const over = {};
      for (const role of ["wall", "roof", "floor"]) if (c[role] && BMAT[c[role]] && BMAT[c[role]].role === role) over[role] = c[role];
      if (!Object.keys(over).length) return false;
      const r = rethemeCells(bp, over);
      if (sameCells(r.cells, bp.cells)) return false;
      revise(sim, bp, r.w, r.h, r.cells);
      return true;
    }
    if (c.op === "push") {                                 // S11: bring the instances up to the current revision
      let n = 0;
      for (const inst of instancesOf(sim, bp.id)) {
        if (inst.rev >= bp.rev || (!c.force && handEdited(sim, bp, inst))) continue;
        pushInstance(sim, bp, inst); n++;
      }
      return n > 0;
    }
    if (c.op === "remove") { L.list.splice(i, 1); L.inst = L.inst.filter(q => q.bp !== bp.id); }
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
      const bp = c.bp && c.at ? sim.bps.list.find(b => b.id === c.bp) : null;
      if (bp) addInstance(sim, bp, c.at.ox | 0, c.at.oy | 0, c.at.z | 0, c.at.rot | 0, c.at.over || {}).g = g;
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
    addInstance(sim, bp, ox, oy, z, 0, {}).g = g;
    b.ag = g; b.ep++;
    return true;
  }
  return false;
}
