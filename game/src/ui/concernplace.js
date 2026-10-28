// Where a concern's place is on screen: ONE projection decides both "is it on screen" and "where is it drawn" (6.20). The pointer layer (ui/pointers.js, DOM edge chips) and the
// canvas marker (render/overlays.js, in-place chips) both read `concernPlaces(game)`, so they can never disagree.
//   z      the target's real cell height in the CURRENT view: in the Surface view something underground is shown on the surface above it (with a "↓3" badge), in a slice a thing
//          above the slice is shown on the slice's plane (badge "↑2"); everything else is projected at its own z.
//   on     the target is inside the free map area. It has HYSTERESIS (it must cross 14 px inside to become "on" and 14 px outside to stop being "on"), so a target on the border
//          never flips between an edge pointer and an in-place marker frame by frame.
//   Edge pointers are never made for a target that is on; a target that is on is never hidden because of its depth.
import { depthBadge } from "../render/obmath.js";

const HYST = 14;

/** The free map area in real pixels (between the columns, under the top bar, above the dock). */
export function freeRect(game) {
  const el = (id) => document.getElementById(id), L = el("slotV").getBoundingClientRect(), R = el("slotI").getBoundingClientRect(), T = el("topbar").getBoundingClientRect();
  const rv = game.ui.sel.length || game.ui.other ? R.left : window.innerWidth;
  return { x0: L.right + 24, x1: Math.max(L.right + 80, rv - 24), y0: T.bottom + 56, y1: window.innerHeight - 90 };
}

/** The projection of one concern loc in the current view: {sx, sy, z, badge}. */
export function placeOf(game, loc) {
  const { cam, renderer } = game, D = game.D;
  const lz = loc.z !== undefined && loc.z >= 0 ? loc.z : undefined;
  if (!cam.oblique || lz === undefined || !renderer.view) { const [sx, sy] = cam.toScreen(loc.x + 0.5, loc.y + 0.5, lz); return { sx, sy, z: lz, badge: "" }; }
  const top = renderer.topAt(loc.x, loc.y), badge = depthBadge(renderer.z, lz, top, D);
  const z = renderer.z >= D - 1 ? (badge ? top + 1 : lz) : Math.min(lz, renderer.z);
  const [sx, sy] = cam.toScreen(loc.x + 0.5, loc.y + 0.5, z);
  return { sx, sy, z, badge };
}

/** Per concern index: {c, key, sx, sy, badge, on}. Idempotent within a frame (hysteresis reads the state left by the previous frame, not by an earlier call). */
export function concernPlaces(game) {
  const ui = game.ui, list = ui.concerns || [], st = ui.cplaceState || (ui.cplaceState = new Map()), f = freeRect(game), out = [];
  const stamp = f.x0 + "," + f.x1 + "," + game.cam.x + "," + game.cam.y + "," + game.cam.zoom + "," + game.renderer.z + "," + list.length + "," + ui.sel.length;
  if (ui.cplaceFor === list && ui.cplaceStamp === stamp && ui.cplace) return ui.cplace;
  list.forEach((c, i) => {
    if (c.sev < 2 || !c.loc) return;
    const p = placeOf(game, c.loc), was = st.get(c.k);
    const inner = p.sx >= f.x0 + HYST && p.sx <= f.x1 - HYST && p.sy >= f.y0 + HYST && p.sy <= f.y1 - HYST;
    const outer = p.sx >= f.x0 - HYST && p.sx <= f.x1 + HYST && p.sy >= f.y0 - HYST && p.sy <= f.y1 + HYST;
    const on = was ? (was.on ? outer : inner) : inner;
    st.set(c.k, { on });
    out.push({ c, i, key: c.k, sx: p.sx, sy: p.sy, badge: p.badge, on, f });
  });
  ui.cplaceFor = list; ui.cplaceStamp = stamp; ui.cplace = out;
  return out;
}
