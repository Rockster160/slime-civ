// The UI kit (UI_SPEC §2): the design tokens for canvas code, and the small components every panel is built from. DOM versions return HTML strings (panels
// render to strings and write the DOM only when the string changed). Colour never carries meaning alone: severity is a pip SHAPE, a need is an icon, lineage is a
// pattern mark. The CSS for all of this lives in shell.html, keyed to the same token names.
import { svg } from "./icons.js";

/** Mirror of the CSS custom properties, for canvas code (overlays, pointers). */
export const TOKENS = {
  bg: "#0b0e13", s1: "rgba(18,22,28,.90)", s2: "#1a2029", s3: "#242c37", line: "#2c3541", lineHi: "#44556a",
  tx: "#e8edf3", tx2: "#a6b2c1", tx3: "#6f7c8c", sel: "#ffd166",
  danger: "#ff6b4a", warm: "#ffa63d", food: "#a7d86a", water: "#56b4e9", energy: "#9a9cff", ok: "#35d0a0", cold: "#b5ecff",
  sick: "#d4e04e", know: "#c79bff", stand: "#e08bd0", rot: "#8a6a4a", poss: "#ffe9a8",
};
/** Colour of each job class (text.js CLASS keeps its own palette for the map; the HUD uses these roles). */
export const CLASS_ROLE = { need: "warm", vcrit: "danger", order: "water", standing: "stand", demand: "ok", leisure: "tx3" };

export const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** Visually hidden words: screen readers and innerText keep them, eyes do not. */
export const sr = (t) => `<span class="sr">${esc(t)}</span>`;
/** data-tip attribute (+ aria-label for icon-only things). */
export const tipAttr = (t, key) => t ? ` data-tip="${esc(t)}"${key ? ` data-key="${esc(key)}"` : ""}` : "";

/** Severity pip: 1 hollow circle, 2 filled triangle, 3 filled diamond. Shape alone ranks it. */
export function pip(level, px = 10) {
  const sh = level >= 3 ? `<path d="M5 .5L9.5 5 5 9.5.5 5z" fill="currentColor"/>` : level === 2 ? `<path d="M5 .8L9.4 9H.6z" fill="currentColor"/>` : `<circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
  return `<svg class="pip p${level}" width="${px}" height="${px}" viewBox="0 0 10 10" aria-hidden="true">${sh}</svg>`;
}

/**
 * NeedRing: a ring gauge with the need's icon inside. v 0..1; the arc ends where the value does; a tick sits at the soft threshold; below `crit` it turns
 * danger-coloured and gets a gap notch. soft/crit < 0 draws no tick (fear). `tip` is the sentence for hover.
 */
export function ring({ icon, v, soft = -1, crit = -1, px = 28, tip = "", test = "", cls = "" }) {
  const f = Math.max(0, Math.min(1, v)), R = 11, C = 2 * Math.PI * R, state = crit >= 0 && v < crit ? "crit" : soft >= 0 && v < soft ? "soft" : "ok";
  const tick = soft >= 0 ? (() => { const a = soft * 2 * Math.PI - Math.PI / 2; return `<line class="tk" x1="${(14 + Math.cos(a) * 8.6).toFixed(1)}" y1="${(14 + Math.sin(a) * 8.6).toFixed(1)}" x2="${(14 + Math.cos(a) * 13).toFixed(1)}" y2="${(14 + Math.sin(a) * 13).toFixed(1)}"/>`; })() : "";
  const dash = state === "crit" ? `${(f * C * 0.92).toFixed(1)} ${C.toFixed(1)}` : `${(f * C).toFixed(1)} ${C.toFixed(1)}`;
  return `<span class="nr ${state} ${cls}"${test ? ` data-test="${test}"` : ""}${tipAttr(tip)} style="width:${px}px;height:${px}px"><svg viewBox="0 0 28 28" width="${px}" height="${px}" aria-hidden="true"><circle cx="14" cy="14" r="${R}" class="bg"/><circle cx="14" cy="14" r="${R}" class="fg" stroke-dasharray="${dash}" transform="rotate(-90 14 14)"/>${tick}</svg>${svg(icon, Math.round(px * 0.5), "nr-i")}</span>`;
}

/** A thin meter (8px). marks: [{at 0..1, cls: "soft"|"crit"|"tgt"}]. No text inside: numbers go in the tip. */
export function meter(frac, { color = "var(--ok)", marks = [], tip = "", test = "", cls = "" } = {}) {
  const f = Math.max(0, Math.min(1, frac));
  const m = marks.map(k => `<b class="mk ${k.cls || ""}" style="left:${(Math.max(0, Math.min(1, k.at)) * 100).toFixed(1)}%"></b>`).join("");
  return `<span class="mt ${cls}"${test ? ` data-test="${test}"` : ""}${tipAttr(tip)}><i style="width:${(f * 100).toFixed(1)}%;background:${color}"></i>${m}</span>`;
}

/** Five rank pips + a partial arc for the sixth: skill/ability 0..1. */
export function rankPips(l, rusty = false) {
  const n = Math.max(0, Math.min(5, l * 5)), full = Math.floor(n), part = n - full;
  let h = "";
  for (let i = 0; i < 5; i++) h += `<i class="${i < full ? "f" : i === full && part > 0.15 ? "h" : ""}"></i>`;
  return `<span class="rk ${rusty ? "rusty" : ""}">${h}</span>`;
}

/** Icon + optional count + optional caption. */
export function chip({ icon, count, cap = "", tip = "", cls = "", attrs = "", px = 16 }) {
  return `<span class="chip ${cls}"${tipAttr(tip)} ${attrs}>${svg(icon, px)}${count !== undefined && count !== "" ? `<b>${esc(count)}</b>` : ""}${cap ? `<span class="cap">${esc(cap)}</span>` : ""}</span>`;
}

/** A button. Icon-only buttons need `tip` (it becomes the aria-label too). */
export function btn({ icon, label = "", tip = "", key = "", cls = "", test = "", attrs = "", px = 16 }) {
  const only = !label;
  return `<button class="btn ${only ? "ico" : ""} ${cls}"${test ? ` data-test="${test}"` : ""}${tipAttr(tip, key)}${only && tip ? ` aria-label="${esc(tip.split("\n")[0])}"` : ""} ${attrs}>${icon ? svg(icon, px) : ""}${label ? `<span class="bl">${esc(label)}</span>` : ""}${key ? `<span class="kc">${esc(key)}</span>` : ""}</button>`;
}

const PATTERN = [
  `<circle cx="7" cy="8" r="1.4"/><circle cx="12.5" cy="12" r="1.4"/><circle cx="8.5" cy="14" r="1.2"/>`,                  // spots
  `<path d="M4 8h12M4 12h12M4 16h12"/>`,                                                                                // stripes
  `<circle cx="10" cy="11" r="4"/>`,                                                                                    // ring
  `<path d="M10 5v12M4 11h12"/>`,                                                                                       // cross
  `<path d="M4 9l6 4 6-4M4 13l6 4 6-4"/>`,                                                                              // chevron
  `<path d="M10 5l5 6-5 6-5-6z"/>`,                                                                                     // diamond
  `<path d="M4 11h.01M8 11h.01M12 11h.01M16 11h.01"/>`,                                                                 // dots-line
  ``,                                                                                                                   // plain
];
/** The slime as a small avatar: its own hue, a lineage pattern mark (so lineage is never colour alone), smaller when a child. */
export function avatar(hue, lin = 0, px = 18, kid = false) {
  const s = kid ? 0.74 : 1, id = lin % 8;
  return `<svg class="av" width="${px}" height="${px}" viewBox="0 0 20 20" aria-hidden="true"><g transform="translate(${10 - 10 * s} ${kid ? 3.2 : 1}) scale(${s})"><path d="M3 15c-1-5 1-11 7-11s8 6 7 11c0 1.3-1 2-2.4 2H5.4C4 17 3 16.3 3 15z" fill="hsl(${hue},75%,62%)" stroke="rgba(8,10,14,.75)" stroke-width="1.3"/><g class="lm" fill="none" stroke="rgba(8,10,14,.55)" stroke-width="1.1" stroke-linecap="round">${PATTERN[id]}</g><circle cx="7.4" cy="11" r="1" fill="#10141a"/><circle cx="12.6" cy="11" r="1" fill="#10141a"/></g></svg>`;
}

/** A segmented bar: parts [{n, cls, tip}] sharing the width. */
export function segbar(parts, { tip = "", cls = "" } = {}) {
  const tot = parts.reduce((a, p) => a + p.n, 0) || 1;
  return `<span class="sg ${cls}"${tipAttr(tip)}>${parts.filter(p => p.n > 0).map(p => `<i class="${p.cls || ""}" style="flex:${p.n / tot}"></i>`).join("")}</span>`;
}

/** The hot-key shown as a keycap. */
export const keycap = (k) => `<kbd class="kc">${esc(k)}</kbd>`;
