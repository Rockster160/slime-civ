// What a planner may look at (Phase 9, 9.29; notes/impl/PHASE9_KNOWLEDGE.md): the slime's OWN beliefs, turned into the concrete things a job needs.
//
//   entsOf(ctx, kind)    the live entities in the patches this slime believes in for a belief kind ("food", "tree", "bed", "furn:hearth", "loose", "site", "plot", "game*" ...).
//                        A fact names a PATCH; the concrete thing is found with a local grid lookup round its centre (belief.js patchEnts), which a plan may do.
//                        `.ghost` is true when the slime believes in a patch of that kind but nothing stands in any of them any more (STALE_BELIEF, not UNKNOWN_PLACE).
//   noPlace(ctx, kind)   the blocker for "no target of this kind": STALE_BELIEF when a patch is believed but empty, else UNKNOWN_PLACE.
//   stored(sim)          the stacks in every store (yard, drawn zones, cellar, storage rooms): relaxed by OD-56 (a slime knows its own stockpile and walks in to take from it).
//   waterNear(ctx)       the drink spots inside the water patches this slime knows.
//   oreCells(ctx, mats)  the ore / clay cells inside the ore patches this slime knows (for the explore leisure job).
// With belief.flags.off every one of them falls back to the old whole-world scan (the telepathic baseline the end-of-phase comparison measures).
import { flags, patchEnts, kindOf, FORGET, PATCH_R } from "./belief.js";
import { World } from "./world.js";

const ENT_OF = (bk) => bk === "food" || bk === "tree" ? ["plant"] : bk === "bed" || bk.startsWith("furn:") ? ["furniture"] : bk === "site" ? ["site", "csite", "dsite"] : bk === "loose" ? ["item"] : bk === "plot" ? ["plot"] : bk === "wagon" ? ["wagon"] : ["fauna"];

/** The believed things of a kind (see the header). Cached on the plan's context; sorted by id, as the world scans were. */
export function entsOf(ctx, bk) {
  const c = ctx.kn || (ctx.kn = {});
  if (c[bk]) return c[bk];
  const { sim, v } = ctx, out = [];
  const wild = bk.endsWith("*"), base = wild ? bk.slice(0, -1) : bk, hit = (k) => (wild ? k.startsWith(base) : k === bk);
  if (flags.off || !v.bel) {                                       // the telepathic baseline: every such thing in the world
    for (const ek of ENT_OF(wild ? "game:" : bk)) for (const e of sim.ents.ofKind(ek)) { const k = kindOf(e, false, 0, sim); if (k && hit(k[0])) out.push(e); }
    out.sort((a, b) => a.id - b.id);
    out.ghost = false;
    return (c[bk] = out);
  }
  const seen = new Set();
  let facts = 0;
  for (const f of v.bel) {
    if (!hit(f[0]) || sim.tick - f[5] > FORGET) continue;
    facts++;
    patchEnts(sim, f, out, seen);
  }
  out.sort((a, b) => a.id - b.id);
  out.ghost = facts > 0 && out.length === 0;
  out.facts = facts;
  return (c[bk] = out);
}
/** Why a planner found no target of this belief kind. */
export function noPlace(ctx, bk) { return flags.off ? "NO_MATERIAL" : entsOf(ctx, bk).ghost ? "STALE_BELIEF" : "UNKNOWN_PLACE"; }
/** Does the slime know of any patch of this kind at all (for deciding whether a missing target is ignorance)? */
export const believes = (ctx, bk) => entsOf(ctx, bk).length > 0;

// ---- the stockpile (relaxed, OD-56) ----

/** Every item stack in a store, in id order, cached for the tick and the item version. */
export function stored(sim) {
  const c = sim.cache;
  if (c.stT === sim.tick && c.stV === c.iv && c.st) return c.st;
  const ents = sim.ents, ids = new Set(), out = [];
  const cells = (z, x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const id of ents.at(x, y, z)) ids.add(id);
  };
  const zn = sim.stock;
  if (zn) cells(zn.z, zn.x0, zn.y0, zn.x1, zn.y1);
  if (sim.zones) for (const q of sim.zones.list) cells(q.z, q.x0, q.y0, q.x1, q.y1);
  const cl = sim.farm && sim.farm.cellar;
  if (cl) cells(cl.z, cl.x0, cl.y0, cl.x1, cl.y1);
  if (sim.rooms.list.size) for (const r of sim.rooms.all()) {
    if (r.purpose !== "storage" || !r.enclosed) continue;
    for (const i of r.cells) { const [x, y, z] = World.xyz(i); for (const id of ents.at(x, y, z)) ids.add(id); }
  }
  for (const id of ids) { const e = ents.get(id); if (e && e.kind === "item") out.push(e); }
  out.sort((a, b) => a.id - b.id);
  c.stT = sim.tick; c.stV = c.iv; c.st = out;
  return out;
}

// ---- terrain facts ----

/** The drink spots (standable cells beside water) lying inside a water patch this slime knows. Terrain and pathing are relaxed; knowing WHERE the water is, is not. */
export function waterNear(ctx, edges) {
  if (flags.off) return edges;
  const c = ctx.kn || (ctx.kn = {});
  if (c.water) return c.water;
  const ws = ctx.v.bel.filter(f => f[0] === "water" && ctx.sim.tick - f[5] <= FORGET);
  const R = PATCH_R + 1;
  return (c.water = ws.length ? edges.filter(e => { for (const f of ws) if (Math.abs(e[0] - f[1]) <= R && Math.abs(e[1] - f[2]) <= R && Math.abs(e[2] - f[3]) <= 3) return true; return false; }) : []);
}

/** [[x, y, z]] of the cells of the given materials inside the ore patches this slime knows (the cell must still hold that ore). */
export function oreCells(ctx, mats) {
  const { sim, v } = ctx, w = sim.world, out = [];
  if (flags.off) { for (const m of mats) for (const i of sim.seen.known[m] || []) out.push(World.xyz(i)); return out; }
  for (const f of v.bel || []) {
    if (!f[0].startsWith("ore:") || sim.tick - f[5] > FORGET || !mats.includes(Number(f[0].slice(4)))) continue;
    const m = Number(f[0].slice(4));
    for (let dx = -PATCH_R; dx <= PATCH_R; dx++) for (let dy = -PATCH_R; dy <= PATCH_R; dy++) for (let dz = -2; dz <= 2; dz++) {
      const x = f[1] + dx, y = f[2] + dy, z = f[3] + dz;
      if (w.mat(x, y, z) === m) out.push([x, y, z]);
    }
  }
  return out;
}
