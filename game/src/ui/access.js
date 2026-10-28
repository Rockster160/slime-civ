// Accessibility baseline (S12, GDD §22): a UI scale, a high-contrast theme, colour-blind marks (letters and patterns beside every colour that carries
// meaning: lineage in the blob, ore in the rock, the biomes), and reduced flashing (hit flashes, fire flicker, flickering cracks). Remembered in the
// browser (localStorage "slimeciv.access"), applied to the page (CSS variable and body class) and to the renderer (renderer.access).
import { remember } from "./dom.js";

export const SCALES = [0.85, 1, 1.15, 1.3, 1.5];
export const DEFAULTS = { scale: 1, contrast: false, cb: false, calm: false };

/** Read the stored settings (anything odd falls back to the defaults). Pure but for the storage read. */
export function loadAccess(read = () => remember("access")) {
  let raw = null, o = {};
  try { raw = read(); o = raw ? JSON.parse(raw) : {}; } catch (e) { o = {}; }
  return {
    scale: SCALES.includes(o.scale) ? o.scale : DEFAULTS.scale,
    contrast: o.contrast === true, cb: o.cb === true, calm: o.calm === true,
  };
}

export function createAccess(game) {
  const a = game.access = loadAccess();
  /** The top bar is one row: it takes the interface scale only as far as the whole row still fits the window. */
  const fitTopbar = () => {
    const tb = document.getElementById("topbar"); if (!tb) return;
    tb.style.zoom = "1";
    const need = tb.scrollWidth + 4;
    tb.style.zoom = String(Math.round(Math.max(0.72, Math.min(a.scale, window.innerWidth / need)) * 100) / 100);       // never above the chosen scale, shrinking a little when the row would run off the window
  };
  game.fitTopbar = fitTopbar;
  const apply = () => {
    const root = document.documentElement;
    root.style.setProperty("--ui", String(a.scale));
    document.body.classList.toggle("hc", a.contrast);
    document.body.classList.toggle("calm", a.calm);
    game.renderer.access = { calm: a.calm, cb: a.cb, contrast: a.contrast };
    game.accessVersion = (game.accessVersion || 0) + 1;
    fitTopbar();
  };
  window.addEventListener("resize", fitTopbar);
  game.setAccess = (patch) => {
    Object.assign(a, patch);
    try { remember("access", JSON.stringify(a)); } catch (e) { /* the setting lasts this session */ }
    apply();
  };
  apply();
  return a;
}
