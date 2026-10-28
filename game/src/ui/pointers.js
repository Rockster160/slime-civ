// Concern edge pointers (UI_SPEC §3.4): a concern of level 2 or more whose place is OFF screen gets a 30 px chip (class icon + severity pip shape) pinned to the edge of
// the free map area along the ray from the view centre to that place; click = look at it. At most 4, beyond that a "+N" chip. A concern that is ON screen is drawn in place
// on the canvas (render/overlays.js) and has NO pointer. 6.20: ui/concernplace.js is the one projection and the one on/off decision (with hysteresis) for both; the chips are
// persistent DOM elements whose position is eased along the edge (and only moved when it changed by more than half a pixel), so a pointer never jumps and never flickers.
// Positions are in real pixels (this layer is not scaled by the interface zoom).
import { svg } from "./icons.js";
import { pip, tipAttr } from "./kit.js";
import { concernPlaces } from "./concernplace.js";

export function createPointers(root, game) {
  const els = new Map();                                // concern class -> {el, x, y, sig}
  let more = null, lastT = performance.now();
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-i]"); if (!t) return;
    const c = game.ui.concerns && game.ui.concerns[Number(t.dataset.i)];
    if (c && c.loc) game.locate(c.loc);
  });
  const place = (o, x, y) => { if (!o.set || Math.abs(x - o.px) > 0.4 || Math.abs(y - o.py) > 0.4) { o.px = x; o.py = y; o.set = true; o.el.style.left = x.toFixed(1) + "px"; o.el.style.top = y.toFixed(1) + "px"; } };
  return {
    update() {
      const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000), k = 1 - Math.exp(-dt * 14); lastT = now;
      const places = concernPlaces(game), want = new Set();
      let n = 0, extra = 0, f = null;
      for (const p of places) {
        f = p.f;
        if (p.on) continue;                             // on screen: the canvas draws it in place
        if (n >= 4) { extra++; continue; }
        n++;
        const c = p.c, cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2, dx = p.sx - cx, dy = p.sy - cy;
        const kk = Math.min((f.x1 - cx) / Math.max(1e-6, Math.abs(dx)), (f.y1 - cy) / Math.max(1e-6, Math.abs(dy)), 1e9);       // along the ray from the centre to the place...
        const tx = Math.max(f.x0, Math.min(f.x1, cx + dx * kk)), ty = Math.max(f.y0, Math.min(f.y1, cy + dy * kk)), ang = Math.atan2(dy, dx) * 180 / Math.PI;
        let o = els.get(p.key);
        const sig = c.sev + "|" + c.text + "|" + p.badge + "|" + c.icon;
        if (!o) { const el = document.createElement("div"); o = { el, x: tx, y: ty, sig: "", set: false }; els.set(p.key, o); root.appendChild(el); }
        if (o.sig !== sig) {
          o.sig = sig; o.el.className = "ptr l" + c.sev; o.el.dataset.test = "pointer"; o.el.dataset.class = c.k;
          o.el.innerHTML = `${svg(c.icon, 16)}${p.badge ? `<span class="db">${p.badge}</span>` : ""}<span class="pip-w">${pip(c.sev, 10)}</span><svg class="parr" width="12" height="12" viewBox="0 0 12 12"><path d="M0 0L9 6L0 12z" fill="currentColor"/></svg><span class="sr">${c.text}</span>`;
          o.el.setAttribute("data-tip", c.text); o.arr = o.el.querySelector(".parr");
        }
        o.el.dataset.i = String(p.i);
        if (!o.set) { o.x = tx; o.y = ty; } else { o.x += (tx - o.x) * k; o.y += (ty - o.y) * k; }          // eased along the edge
        place(o, o.x, o.y);
        const a = Math.round(ang / 3) * 3;               // the arrow turns in 3 degree steps (no shimmer from sub-pixel motion)
        if (o.a !== a) { o.a = a; o.arr.style.transform = `rotate(${a}deg) translate(21px,0)`; }
        want.add(p.key);
      }
      for (const [key, o] of els) if (!want.has(key)) { o.el.remove(); els.delete(key); }
      if (extra) {
        if (!more) { more = document.createElement("div"); more.className = "ptr more"; more.dataset.test = "pointer-more"; }
        if (!more.parentNode) root.appendChild(more);
        more.innerHTML = `<b>+${extra}</b>`; more.style.left = (f.x1 - 10).toFixed(0) + "px"; more.style.top = f.y0.toFixed(0) + "px";
      } else if (more && more.parentNode) more.remove();
    },
  };
}
