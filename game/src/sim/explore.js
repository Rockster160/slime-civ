// Curiosity as an autonomous job (experiment, MEMORY_SYSTEM.md): a free slime that has come to like caves, ore or gems goes and looks at some more of it.
// A leisure-class candidate, so any real work outranks it. It walks to a place on the edge of what is known and the walk's own `watch` does the mapping.
// A strongly curious slime (p >= SCOUT_P and curiosity above 50) may walk into unmapped cave; labyrinth ("dungeon"), bad air, unstable roofs and the
// thornback's territory stay forbidden for everyone (lair.js restricted, and the plan's unsafeTask check).
import { Task } from "./tasks.js";
import { World, M } from "./world.js";
import { isSeen } from "./seen.js";
import { restricted } from "./lair.js";
import { steadfast } from "./possess.js";
import { EXPLORE_P, SCOUT_P, EXPLORE_LEASH } from "./memory.js";
import { dist3 } from "./util.js";

export const EXPLORE_GAP = 150;        // ticks between one explore walk and the next (a slime does not trail back and forth)
const LOG_SCAN = 500;                  // the newest cells seen are where a cave's frontier is
const KNOWN = { ore: [M.COAL, M.FLINT, M.MALACHITE, M.IRONORE], gem: [M.GEM, M.CRYSTAL, M.COREORE] };
const SUBJ_ORDER = ["cave", "gem", "ore"];

const inLeash = (sim, x, y) => Math.abs(x - sim.site.x) <= EXPLORE_LEASH && Math.abs(y - sim.site.y) <= EXPLORE_LEASH;

/** A cell the slime could stand on at the edge of the known cave: {x, y, z, open} (open = the stand cell itself is unseen, a scout's target), nearest first. */
function caveFrontier(sim, v, scout) {
  const w = sim.world, log = sim.seen.log;
  let best = null, bd = 1e9;
  for (let k = log.length - 1, n = 0; k >= 0 && n < LOG_SCAN; k--, n++) {
    const [x, y, z] = World.xyz(log[k]);
    if (!inLeash(sim, x, y) || !w.isWalkable(x, y, z) || !(w.isSolid(x, y, z + 1) || w.isSolid(x, y, z + 2) || w.isSolid(x, y, z + 3))) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (isSeen(sim, nx, ny, z) || w.isSolid(nx, ny, z)) continue;                       // an open, unseen cell beside a cell we know
      const open = scout && w.isWalkable(nx, ny, z), r = restricted(sim, open ? nx : x, open ? ny : y, z);
      if (r && !(open && r === "unmapped")) continue;
      const tx = open ? nx : x, ty = open ? ny : y, d = dist3(v.x, v.y, v.z, tx, ty, z);
      if (d >= 2 && d < bd) { bd = d; best = { x: tx, y: ty, z, open }; }
      break;
    }
  }
  return best;
}
/** A walkable cell beside a known ore or gem cell, nearest first (at least 4 away from where the slime already is). */
function outcrop(sim, v, subj) {
  const w = sim.world;
  let best = null, bd = 1e9;
  for (const m of KNOWN[subj]) for (const i of sim.seen.known[m] || []) {
    const [x, y, z] = World.xyz(i);
    if (!inLeash(sim, x, y)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dz of [0, 1, -1]) {
      const sx = x + dx, sy = y + dy, sz = z + dz;
      if (!w.isWalkable(sx, sy, sz) || restricted(sim, sx, sy, sz)) continue;
      const d = dist3(v.x, v.y, v.z, sx, sy, sz);
      if (d >= 4 && d < bd) { bd = d; best = { x: sx, y: sy, z: sz, open: false }; }
    }
  }
  return best;
}

/** The leisure candidate "explore" for the subject this slime is most drawn to (liking above EXPLORE_P and above its fear). H = jobs.js's {add, reach}. */
export function genExplore(ctx, H) {
  const { sim, v } = ctx;
  if (!v.mem || !v.mem.length || steadfast(v) || (v.fear || 0) > 0.1) return;
  const going = ctx.cur && ctx.cur.k === "explore";
  if (!going && ctx.t - (v.ex || -1e9) < EXPLORE_GAP) return;
  let subj = "", bs = 0;
  for (const sj of SUBJ_ORDER) for (const s of v.mem) if (s[0] === sj && s[1] >= EXPLORE_P && s[1] > s[2] && s[1] - s[2] > bs) { bs = s[1] - s[2]; subj = sj; }
  if (!subj) return;
  const p = v.mem.find(s => s[0] === subj)[1], scout = subj === "cave" && p >= SCOUT_P && v.ps.c > 50;
  const tg = subj === "cave" ? caveFrontier(sim, v, scout) : outcrop(sim, v, subj);
  if (!tg) return;
  H.add(ctx, { kind: "explore", cls: "leisure", urg: 0.8, grp: "explore", key: "explore:" + subj, sj: [subj], scout, d: dist3(v.x, v.y, v.z, tg.x, tg.y, tg.z), tid: 0, mk: () => {
    if (!H.reach(ctx, tg)) return { blocker: "NO_PATH" };
    v.ex = ctx.t;
    return { task: Task("explore", [{ v: "goto", x: tg.x, y: tg.y, z: tg.z }]), res: [] };
  } });
}
