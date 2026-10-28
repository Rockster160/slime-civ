// Hit-testing: what is under a screen point? Reads the renderer's per-frame
// column tops, so it only ever finds things that are actually drawn.
import { inZone } from "../sim/items.js";
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
  out.ents.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.id - b.id);
  if (!best) {
    if (out.ents.length) { out.ent = out.ents[0]; out.kind = out.ent.kind; }
    else if (sim.stock && out.z === sim.stock.z && inZone(sim.stock, x, y)) out.kind = "stock";
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
  const [ax, ay] = cam.toWorld(Math.min(x0, x1), Math.min(y0, y1)), [bx, by] = cam.toWorld(Math.max(x0, x1), Math.max(y0, y1));
  for (const v of sim.ents.ofKind("villager")) {
    if (!renderer.isShown(v)) continue;
    const cx = v.x + 0.5, cy = v.y + 0.5;
    if (cx >= ax && cx <= bx && cy >= ay && cy <= by) out.push(v);
  }
  return out;
}
