// Concern edge pointers (UI_SPEC §3.4): a concern of level 2 or more whose place is OFF screen gets a 30 px chip (class icon + severity pip shape) pinned to the edge of
// the free map area along the ray from the view centre to that place; click = look at it. At most 4 per side-less pool: beyond that a "+N" chip. On-screen concerns are
// drawn on the canvas (render/overlays.js). Positions are in real pixels (this layer is not scaled by the interface zoom).
import { svg } from "./icons.js";
import { pip, tipAttr } from "./kit.js";
import { depthBadge } from "../render/obmath.js";

export function createPointers(root, game) {
  let last = "";
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-i]"); if (!t) return;
    const c = game.ui.concerns && game.ui.concerns[Number(t.dataset.i)];
    if (c && c.loc) game.locate(c.loc);
  });
  const free = () => {                                  // the world area between the columns, in real px
    const L = document.getElementById("slotV").getBoundingClientRect(), R = document.getElementById("slotI").getBoundingClientRect(), T = document.getElementById("topbar").getBoundingClientRect();
    const rv = game.ui.sel.length || game.ui.other ? R.left : window.innerWidth;
    return { x0: L.right + 24, x1: rv - 24, y0: T.bottom + 56, y1: window.innerHeight - 90 };
  };
  return {
    update() {
      const list = game.ui.concerns || [], { cam } = game, f = free(), cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
      let h = "", n = 0, extra = 0;
      list.forEach((c, i) => {
        if (c.sev < 2 || !c.loc) return;
        const lz = c.loc.z !== undefined && c.loc.z >= 0 ? c.loc.z : undefined, [sx, sy] = cam.toScreen(c.loc.x + 0.5, c.loc.y + 0.5, lz);
        const badge = lz !== undefined && cam.oblique ? depthBadge(game.renderer.z, lz, game.renderer.topAt(c.loc.x, c.loc.y), game.D) : "";      // "↓3": the place is on another level
        if (!badge && sx >= f.x0 && sx <= f.x1 && sy >= f.y0 && sy <= f.y1) return;           // on screen: the canvas draws it
        if (n >= 4) { extra++; return; }
        n++;
        const dx = sx - cx, dy = sy - cy, k = Math.min((f.x1 - cx) / Math.max(1e-6, Math.abs(dx)), (f.y1 - cy) / Math.max(1e-6, Math.abs(dy)), 1e9);
        const px = Math.max(f.x0, Math.min(f.x1, cx + dx * k)), py = Math.max(f.y0, Math.min(f.y1, cy + dy * k)), ang = Math.atan2(dy, dx) * 180 / Math.PI;
        h += `<div class="ptr l${c.sev}" data-test="pointer" data-class="${c.k}" data-i="${i}" style="left:${px.toFixed(0)}px;top:${py.toFixed(0)}px"${tipAttr(c.text)}>${svg(c.icon, 16)}${badge ? `<span class="db">${badge}</span>` : ""}<span class="pip-w">${pip(c.sev, 10)}</span>`
          + `<svg class="parr" width="12" height="12" viewBox="0 0 12 12" style="transform:rotate(${ang.toFixed(0)}deg) translate(21px,0)"><path d="M0 0L9 6L0 12z" fill="currentColor"/></svg><span class="sr">${c.text}</span></div>`;
      });
      if (extra) h += `<div class="ptr more" style="left:${(f.x1 - 10).toFixed(0)}px;top:${(f.y0).toFixed(0)}px" data-test="pointer-more"><b>+${extra}</b></div>`;
      if (h !== last) { last = h; root.innerHTML = h; }
    },
  };
}
