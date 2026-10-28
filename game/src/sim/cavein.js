// The underground tick (S12): cracks, falls, and the planner that answers them. The rules live in underground.js (pure queries);
// this file changes the world: it flags and collapses unstable cells, widens the seen frontier by torchlight, and every 100 ticks
// lets the village shore up a cracking roof, light a dark working face and vent foul air, all through ordinary ghosts (csites)
// that villagers build like any piece, so the player can do the same by hand.
import { World, M, F } from "./world.js";
import { SPAN_R, CRACK_TICKS, COLLAPSE_DMG, unstableAt, airMap, badAt } from "./underground.js";
import { lightSources, underground, inLight, TORCH_R } from "./light.js";
import { look, isSeen } from "./seen.js";
import { log } from "./chronicle.js";
import { kill } from "./population.js";
import { cancelAction } from "./jobstate.js";
import { checkPlace, placeGhosts } from "./build.js";
import { survey } from "./items.js";
import { can } from "./knowledge.js";

const idx = World.idx;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const MAX_VENTS = 6;

/** Every 20 ticks (sim.js): re-check what changed, collapse what has cracked long enough, let light show the way. */
export function ugTick(sim) {
  const w = sim.world, ug = sim.ug, t = sim.tick;
  if (w.ugd.length) {
    const cand = new Set(), crOn = ug.cr.length > 0;
    for (const i of w.ugd) {
      const [x, y, z] = World.xyz(i);
      if (!crOn && w.mat(x, y, z) !== M.AIR) continue;                     // a new solid can only matter to a roof that is already cracked
      for (let dz = -1; dz <= 1; dz++) for (let dy = -SPAN_R; dy <= SPAN_R; dy++) for (let dx = -SPAN_R; dx <= SPAN_R; dx++) {
        if (World.inBounds(x + dx, y + dy, z + dz)) cand.add(idx(x + dx, y + dy, z + dz));
      }
    }
    w.ugd.length = 0;
    const cr = new Map(ug.cr);
    let changed = false;
    for (const i of [...cand].sort((a, b) => a - b)) {
      const [x, y, z] = World.xyz(i), bad = unstableAt(sim, x, y, z), has = cr.has(i);
      if (bad && !has) {
        cr.set(i, t); changed = true;
        if (!ug.warned) { ug.warned = 1; log(sim, "DISASTER", "Cracks run across a roof at (" + x + ", " + y + "): a span too wide for the rock. Timber supports would hold it; villagers keep out of it.", [], { x, y, z, ev: "cracks" }, 1); }
      } else if (!bad && has) { cr.delete(i); changed = true; }
    }
    if (changed) ug.cr = [...cr].sort((a, b) => a[0] - b[0]);
  }
  if (ug.cr.length) {
    const due = ug.cr.filter(e => t - e[1] >= CRACK_TICKS).map(e => e[0]);
    if (due.length) collapse(sim, due);
  }
  for (const [x, y, z, r] of lightSources(sim)) if (r >= TORCH_R && underground(w, x, y, z)) look(sim, x, y, z, r);       // a torch maps the tunnel as far as it shines
}

/** Rubble fills the open cells under the fallen roofs; whoever was under it is hurt and set down beside it. */
export function collapse(sim, list) {
  const w = sim.world, ug = sim.ug, fall = new Set();
  for (const i of list) {
    const [x, y, z] = World.xyz(i);
    for (let dz = 0; dz <= 1; dz++) if (w.mat(x, y, z + dz) === M.AIR) fall.add(idx(x, y, z + dz));
  }
  const cells = [...fall].sort((a, b) => a - b), victims = [];
  for (const i of cells) {
    const [x, y, z] = World.xyz(i);
    for (const id of sim.ents.at(x, y, z).slice()) {
      const e = sim.ents.get(id);
      if (e.kind === "villager" || e.kind === "fauna") victims.push(e);
      else if (e.kind !== "plant") sim.ents.remove(id);                       // loose items, a torch, a ghost: buried
    }
  }
  for (const i of cells) {
    const [x, y, z] = World.xyz(i);
    w.set(x, y, z, M.RUBBLE, (w.flags(x, y, z) & ~(F.OBSTACLE | F.PLAYER)) | F.USED);
  }
  let hurt = 0, dead = 0;
  const gone = new Set(list);
  ug.cr = ug.cr.filter(e => !gone.has(e[0]));
  for (const e of victims) {
    if (!sim.ents.get(e.id)) continue;
    if (e.kind === "villager") {
      cancelAction(sim, e);
      e.hp -= COLLAPSE_DMG; hurt++; e.rp = 1;
      if (e.hp <= 0) { kill(sim, e, "a cave-in"); dead++; continue; }
    }
    const r = rescue(sim, e, fall);
    if (r) sim.ents.move(e, r[0], r[1], r[2]);
  }
  ug.n++; ug.c = (ug.c || 0) + cells.length;
  const [x, y, z] = World.xyz(list[0]);
  log(sim, "DISASTER", "The roof gave way at (" + x + ", " + y + "), level " + z + ": " + cells.length + " cells of rock came down" + (hurt ? ", " + hurt + (hurt === 1 ? " villager was" : " villagers were") + " caught under it" : "") + ".", [], { x, y, z, ev: "cavein", cells: cells.length, hurt, dead }, 2);
  sim.board.ep++; sim.cache.iv++;
}

/** The nearest stand cell outside the fall (the pathfinder's neighbours first, then a widening ring), else the middle of the camp. */
function rescue(sim, e, fall) {
  const w = sim.world;
  for (let r = 1; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      for (const dz of [0, 1, -1]) {
        const x = e.x + dx, y = e.y + dy, z = e.z + dz;
        if (w.isWalkable(x, y, z) && !fall.has(idx(x, y, z)) && !sim.ents.at(x, y, z).some(id => sim.ents.get(id).kind === "villager")) return [x, y, z];
      }
    }
  }
  const s = sim.stock, x = (s.x0 + s.x1) >> 1, y = (s.y0 + s.y1) >> 1, z = w.standZ(x, y);
  return z >= 0 ? [x, y, z] : null;
}

// ---- the village's own answers (every 100 ticks) -------------------------------------------------------------------------

const ghost = (sim, w, m, x, y, z) => {
  if (checkPlace(sim, w, m, x, y, z)) return false;
  const r = placeGhosts(sim, [{ w, m, x, y, z }], ++sim.board.sg);
  if (r.placed) sim.board.ep++;
  return r.placed > 0;
};
const outstanding = (sim, f) => sim.ents.ofKind("csite").some(s => s.w === f || (f === "support" && s.w === "wall" && s.m === "support"));

/** Shore up a cracking roof, light a dark working face, vent known bad air. Returns the kinds planned this call. */
export function ugAuto(sim) {
  const did = [], st = survey(sim).stock, w = sim.world;
  // a timber support where it holds the most cracked cells (the post is a wall piece: one cell of timber, two timber)
  if (sim.ug.cr.length && can(sim, "FRAMING") && (st.timber || 0) >= 2 && !outstanding(sim, "support")) {
    let best = null, bc = 0, bd = 1e9, sx = 0, sy = 0;
    for (const [i] of sim.ug.cr) { const [x, y] = World.xyz(i); sx += x; sy += y; }
    sx = Math.round(sx / sim.ug.cr.length); sy = Math.round(sy / sim.ug.cr.length);       // ties go to the middle of the cracked cells
    for (const [i] of sim.ug.cr) {
      const [x, y, z] = World.xyz(i);
      let n = 0;
      for (const [j] of sim.ug.cr) { const [a, b, c] = World.xyz(j); if (c === z && Math.abs(a - x) <= SPAN_R && Math.abs(b - y) <= SPAN_R) n++; }
      const d = Math.abs(x - sx) + Math.abs(y - sy);
      if (n > bc || (n === bc && d < bd)) { bc = n; bd = d; best = [x, y, z]; }
    }
    if (best && ghost(sim, "wall", "support", best[0], best[1], best[2])) did.push("support");
  }
  // a torch beside the next cell to be dug, when it is dark there
  if (can(sim, "FIRE_TENDING") && (st.stick || 0) >= 2 && !outstanding(sim, "torch") && sim.mine.list.length) {
    const lights = lightSources(sim);
    spot: for (const d of sim.mine.list) {
      for (const i of d.q.slice(0, 4)) {
        const [cx, cy, cz] = World.xyz(i);
        for (const [dx, dy] of DIRS) for (const dz of [0, 1, -1]) {
          const x = cx + dx, y = cy + dy, z = cz + dz;
          if (!w.isWalkable(x, y, z) || !underground(w, x, y, z) || inLight(lights, x, y, z)) continue;
          if (ghost(sim, "torch", "", x, y, z)) { did.push("torch"); break spot; }
        }
      }
    }
  }
  // a vent within a few steps of bad air somebody has seen
  if ((st.stick || 0) >= 4 && !outstanding(sim, "vent") && sim.ents.ofKind("furniture").filter(e => e.f === "vent").length < MAX_VENTS) {
    const air = airMap(sim), bads = [...air.bad].sort((a, b) => a - b);
    for (const b of bads) {
      const [bx, by, bz] = World.xyz(b);
      if (!isSeen(sim, bx, by, bz) || !w.isWalkable(bx, by, bz)) continue;
      const site = ventSite(sim, bx, by, bz) || (sim.ents.at(bx, by, bz).length ? null : [bx, by, bz]);      // a clean cell close by, else the foul cell itself (fitting a vent is the one job villagers do in foul air)
      if (site && ghost(sim, "vent", "", site[0], site[1], site[2])) { did.push("vent"); break; }
    }
  }
  return did;
}
/** The nearest stand cell with clean air within four steps of a bad one (walking through the network). */
function ventSite(sim, x0, y0, z0) {
  const w = sim.world, seen = new Set([idx(x0, y0, z0)]), q = [[x0, y0, z0, 0]];
  for (let h = 0; h < q.length; h++) {
    const [x, y, z, d] = q[h];
    if (d > 0 && !badAt(sim, x, y, z) && !sim.ents.at(x, y, z).length) return [x, y, z];
    if (d >= 4) continue;
    for (const [dx, dy] of DIRS) for (const dz of [0, 1, -1]) {
      const nx = x + dx, ny = y + dy, nz = z + dz, i = idx(nx, ny, nz);
      if (seen.has(i) || !w.isWalkable(nx, ny, nz)) continue;
      if (dz === 1 && w.isSolid(x, y, z + 1)) continue;
      if (dz === -1 && w.isSolid(nx, ny, z)) continue;
      seen.add(i); q.push([nx, ny, nz, d + 1]);
    }
  }
  return null;
}
