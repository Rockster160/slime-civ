// Hit-testing: what is under a screen point? Reads the renderer's per-frame
// column tops, so it only ever finds things that are actually drawn.
import { inZone, stockZoneAt } from "../sim/items.js";
import { provisionalRoom } from "../sim/proom.js";

const PRIORITY = { fauna: -1, item: 0, furniture: 1, grave: 1, wagon: 1, csite: 2, site: 2, plant: 3, plot: 4 };

/**
 * -> {x, y, z, wx, wy, villager, ents, ent, kind}
 *    villager: nearest drawn villager within ~0.6 cell (or null)
 *    ents: other entities on the clicked cell (items first, plants last)
 *    ent / kind: the best single thing ("villager", "item", ..., "stock", "ground")
 */
export function pickAt(game, sx, sy) {
  const { sim, cam, renderer } = game;
  if (cam.oblique && renderer.cellAt) return pickAngled(game, sx, sy);
  const [wx, wy] = cam.toWorld(sx, sy);
  const x = Math.floor(wx), y = Math.floor(wy);
  const out = { x, y, z: -1, wx, wy, villager: null, ents: [], ent: null, kind: "none", room: null };
  const top = renderer.topAt(x, y);
  if (top < 0) return out;
  out.z = top + 1;

  let best = null, bd = 0.62 * 0.62 * 2;                 // generous: blobs are small when zoomed out
  const reach = Math.max(0.62, 5 / cam.zoom);             // at least ~5 px
  bd = reach * reach;
  for (const v of sim.ents.ofKind("villager")) {
    if (!renderer.isShown(v)) continue;
    const dx = v.x + 0.5 - wx, dy = v.y + 0.5 - wy, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = v; }
  }
  if (best) { out.villager = best; out.ent = best; out.kind = "villager"; }

  const ids = sim.ents.at(x, y, out.z);
  for (let i = 0; i < ids.length; i++) {
    const e = sim.ents.get(ids[i]);
    if (e.kind !== "villager") out.ents.push(e);
  }
  for (const f of sim.ents.ofKind("fauna")) {          // creatures move: pick the nearest drawn one under the pointer, not only on the clicked cell
    if (!renderer.isShown(f) || out.ents.includes(f)) continue;
    const dx = f.x + 0.5 - wx, dy = f.y + 0.5 - wy;
    if (dx * dx + dy * dy < reach * reach) out.ents.push(f);
  }
  return finish(game, out, best, x, y);
}

/** What stands on the cell and what the cell is, once the cell, the best villager and the nearby things are known (shared by the flat and the angled view). */
function finish(game, out, best, x, y) {
  const { sim } = game;
  out.ents.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.id - b.id);
  if (!best) {
    if (out.ents.length) { out.ent = out.ents[0]; out.kind = out.ent.kind; }
    else if (sim.stock && stockZoneAt(sim, x, y, out.z)) out.kind = "stock";
    else if (sim.farm.pens.find(p => p.z === out.z && inZone(p, x, y))) { out.pen = sim.farm.pens.find(p => p.z === out.z && inZone(p, x, y)); out.kind = "pen"; }
    else if (sim.farm.cellar && sim.farm.cellar.z === out.z && inZone(sim.farm.cellar, x, y)) out.kind = "cellar";
    else out.kind = "ground";
  }
  // A room: the stand cell under the pointer, whichever level is viewed (the roof hides the floor from above).
  for (let dz = 0; dz < 5 && !out.room; dz++) out.room = sim.rooms.at(x, y, out.z - dz) || null;
  if (out.kind === "ground" && out.room) out.kind = "room";
  else if (out.kind === "ground") { const pr = provisionalRoom(sim, x, y, out.z); if (pr) { out.prov = pr; out.kind = "proom"; } }   // walls + roof but no door yet
  return out;
}

/** Villagers drawn inside a screen rectangle. */
export function villagersIn(game, x0, y0, x1, y1) {
  const { sim, cam, renderer } = game, out = [];
  if (cam.oblique && renderer.drawn) {                                                  // the angled view: a slime is in the box when its DRAWN sprite rectangle overlaps it (any overlap counts)
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
    for (const d of renderer.drawn) { if (d.pri !== "villager") continue; if (d.r >= ax && d.l <= bx && d.b >= ay && d.t <= by && renderer.isShown(d.e) && !out.includes(d.e)) out.push(d.e); }
    return out;
  }
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);   // the flat view: the same rule in screen space, on the DRAWN disc (its glided position when the renderer has one), any overlap counts
  const rad = Math.max(2, cam.zoom * 0.38);
  for (const v of sim.ents.ofKind("villager")) {
    if (!renderer.isShown(v)) continue;
    const p = renderer.drawPos ? renderer.drawPos(v) : [v.x + 0.5, v.y + 0.5], [sx, sy] = cam.toScreen(p[0], p[1], v.z);
    if (sx + rad >= ax && sx - rad <= bx && sy + rad >= ay && sy - rad <= by) out.push(v);
  }
  return out;
}

/**
 * The angled view (6.19b): the cell is exact (a ray through the grid from the pixel, down the line of sight, stopping at the first solid or water cell that is not cut away by the
 * slice), the things are what their sprites cover on screen (a tree's crown picks the tree, a slime's body the slime). {face, cz} describe the cell face hit (for the hover outline).
 */
function pickAngled(game, sx, sy) {
  const { sim, cam, renderer } = game;
  const hit = renderer.cellAt(sx, sy);
  const [gx, gy] = cam.toWorld(sx, sy);
  const x = hit ? hit.x : Math.floor(gx), y = hit ? hit.y : Math.floor(gy);
  const out = { x, y, z: hit ? hit.z + 1 : -1, wx: hit ? (hit.ny || hit.nx ? x + 0.5 : gx) : gx, wy: hit ? (hit.ny || hit.nx ? y + 0.5 : gy) : gy, villager: null, ents: [], ent: null, kind: "none", room: null, cz: hit ? hit.z : undefined, face: hit ? [hit.nx, hit.ny, hit.nz] : null };
  if (!hit) return out;
  let best = null, bd = 1e9;
  for (const d of renderer.drawn) {
    if (d.pri !== "villager" || sx < d.l - 4 || sx > d.r + 4 || sy < d.t - 4 || sy > d.b + 4 || !renderer.isShown(d.e)) continue;
    const dd = Math.hypot(sx - d.fx, sy - (d.fy - 0.3 * (d.fy - d.t)));          // nearest to the lower body: overlapping slimes resolve to the one you aimed at
    const key = Math.round(dd / 3) * 1e6 + d.e.id;                         // within 3 px it is a tie: the older slime wins, so two on one cell resolve the same way each time
    if (key < bd) { bd = key; best = d.e; }
  }
  if (best) { out.villager = best; out.ent = best; out.kind = "villager"; }
  const ids = sim.ents.at(x, y, out.z);
  for (let i = 0; i < ids.length; i++) { const e = sim.ents.get(ids[i]); if (e.kind !== "villager" && !out.ents.includes(e)) out.ents.push(e); }
  for (let i = renderer.drawn.length - 1; i >= 0; i--) {                              // sprites under the pointer (front to back): a tree's crown, a creature, a stack of logs
    const d = renderer.drawn[i];
    if (d.pri === "villager" || d.pri === "plot" || sx < d.l - 3 || sx > d.r + 3 || sy < d.t - 3 || sy > d.b + 3 || out.ents.includes(d.e) || !renderer.isShown(d.e)) continue;
    out.ents.push(d.e);
  }
  return finish(game, out, best, x, y);
}
