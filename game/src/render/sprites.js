// Procedural sprites (S18, minimal; S19 grows this into the shared sprite source - UI_SPEC §4.4 / §7). Each painter draws one thing on a 32 x 32 canvas, ground at
// the bottom edge, from the same palette as the top-down renderer (lineage hue, ITEMS colours, the creature colours), so a slime on the map and a billboard
// slime are the same slime. `view` is "side" (what a billboard shows); a later "top" view can reuse the bodies. No assets, no dependencies.
import { DAY } from "../sim/clock.js";
import { LIFE_DAYS } from "../sim/villager.js";
import { ITEMS } from "../sim/items.js";

export const SPR = 32;
const TAU = 6.2832;

function ell(c, x, y, rx, ry, fill, stroke) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); }
}
function poly(c, pts, fill, stroke) {
  c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.2; c.stroke(); }
}
function line(c, x0, y0, x1, y1, col, w = 1.5) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }

/** A villager: the lineage-hued blob. o = {hue, child, asleep, ill, back, lin, carry (item id)}. The lineage mark (dot / bar / triangle) is the pattern that does not rely on colour. */
export function slime(c, o, view = "side") {
  const s = o.child ? 0.68 : 1, cx = 16, base = 30, rx = 11 * s, ry = (o.asleep ? 6 : 9.5) * s, cy = base - ry;
  const hue = o.hue;
  ell(c, cx, cy, rx, ry, `hsl(${hue},${o.asleep ? 40 : 75}%,${o.asleep ? 45 : 62}%)`, o.ill ? "#a6d94a" : `hsl(${hue},65%,28%)`);
  ell(c, cx - rx * 0.35, cy - ry * 0.45, rx * 0.35, ry * 0.22, `hsla(${hue},90%,88%,.55)`);                        // a wet highlight
  if (o.lin !== undefined && !o.back) {
    c.fillStyle = `hsl(${hue},65%,26%)`;
    const m = o.lin % 3, mx = cx, my = cy - ry * 0.62;
    if (m === 0) { c.beginPath(); c.arc(mx, my, 1.6 * s + 0.4, 0, TAU); c.fill(); } else if (m === 1) c.fillRect(mx - 2.5 * s, my - 1, 5 * s, 2); else poly(c, [mx - 2.4 * s, my + 1.4, mx + 2.4 * s, my + 1.4, mx, my - 2], `hsl(${hue},65%,26%)`);
  }
  if (!o.back) {                                                                                                 // seen from behind: no face
    if (o.asleep) { line(c, cx - 5 * s, cy - 1, cx - 2 * s, cy - 1, "#222", 1.4); line(c, cx + 2 * s, cy - 1, cx + 5 * s, cy - 1, "#222", 1.4); }
    else {
      for (const dx of [-4.5, 4.5]) { ell(c, cx + dx * s, cy - 0.5, 2.6 * s + 0.4, 3.2 * s + 0.4, "#fff"); ell(c, cx + dx * s, cy + 0.2, 1.3 * s + 0.2, 1.8 * s + 0.2, "#1a1a22"); }
      line(c, cx - 2 * s, cy + 5 * s, cx + 2 * s, cy + 5 * s, `hsl(${hue},60%,26%)`, 1.2);
    }
  }
  if (o.carry && ITEMS[o.carry]) { c.fillStyle = ITEMS[o.carry].color; c.strokeStyle = "rgba(0,0,0,.6)"; c.lineWidth = 1; c.fillRect(cx + rx * 0.45, base - 8, 6, 6); c.strokeRect(cx + rx * 0.45, base - 8, 6, 6); }
}

/** An item stack lying on the ground, in the item's colour (log, sticks, stone read by shape; the rest are chips). o.n = how many (1..3 chips). */
export function item(c, kind, o = {}, view = "side") {
  const it = ITEMS[kind], col = it ? it.color : "#999", n = Math.min(3, Math.max(1, o.n || 1));
  c.strokeStyle = "rgba(0,0,0,.65)"; c.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const x = 16 + (i - (n - 1) / 2) * 7, y = 29 - (i === 1 ? 4 : 0);
    if (kind === "log") { c.fillStyle = col; c.fillRect(x - 6, y - 5, 12, 6); c.strokeRect(x - 6, y - 5, 12, 6); ell(c, x + 6, y - 2, 1.6, 3, "#c9ab7a"); }
    else if (kind === "stick") line(c, x - 5, y, x + 5, y - 9, col, 2);
    else if (kind === "stone" || kind === "flint" || kind === "malachite" || kind === "clay") poly(c, [x - 5, y, x - 3, y - 6, x + 2, y - 7, x + 5, y], col, "rgba(0,0,0,.65)");
    else ell(c, x, y - 3, 4.5, 3.8, col, "rgba(0,0,0,.65)");
  }
}

/** Plants: trees (pine in the highland), berry bushes, tufts, saplings, stumps, crops. o = {species, pine, burn, yield, young, fl, stage, crop, ripe}. */
export function plant(c, o, view = "side") {
  const sp = o.species;
  if (sp === "tree" && o.pine) { c.fillStyle = "#4a3320"; c.fillRect(14, 22, 4, 9); poly(c, [16, 1, 27, 24, 5, 24], "#17492a"); poly(c, [16, 7, 24, 20, 8, 20], "#2f7a46"); }
  else if (sp === "tree") {
    c.fillStyle = o.burn ? "#2a1c12" : "#6b4a2a"; c.fillRect(14, 17, 4, 14);
    const g = o.burn ? ["#3b2a1c", "#2a1c12"] : ["#1f5a28", "#2c7a36"];
    ell(c, 16, 10, 12, 9, g[0]); ell(c, 11, 13, 7, 6, g[1]); ell(c, 21, 12, 7, 6, g[1]); ell(c, 15, 6, 6, 4, o.burn ? "#4a3626" : "#3a9644");
  } else if (sp === "sapling") { line(c, 16, 30, 16, 17, "#3f8a3a", 2); poly(c, [16, 15, 11, 20, 16, 21], "#4fa84a"); poly(c, [16, 12, 22, 18, 16, 19], "#4fa84a"); }
  else if (sp === "stump") { ell(c, 16, 29, 7, 2.8, o.fl ? "#6b5238" : "#2a2018"); c.fillStyle = o.fl ? "#6b5238" : "#2a2018"; c.fillRect(9, 24, 14, 5); ell(c, 16, 24, 7, 2.8, o.fl ? "#c9ab7a" : "#5a4a3a"); }
  else if (sp === "berry") {
    const r = o.young === 0 ? 5 : o.young === 1 ? 7.5 : 10;
    ell(c, 16, 30 - r * 0.8, r + 2, r, o.old ? "#6f7d3a" : "#3f7d3a", "#27501f");
    if (o.yield > 0) for (const [dx, dy] of [[-4, -2], [4, 0], [0, -6], [-1, 2]].slice(0, o.yield)) ell(c, 16 + dx, 30 - r * 0.8 + dy, 1.8, 1.8, "#d1405f");
  } else if (sp === "tuft") { if (o.yield > 0) { for (const dx of [-5, 0, 5]) line(c, 16 + dx, 30, 16 + dx * 1.3, 18 - (dx === 0 ? 4 : 0), "#b5e07a", 2); } else ell(c, 16, 30, 6, 1.5, "#6b7a42"); }
  else if (sp === "crop") {                                                                                      // a field cell: o.stage 0..3, o.tuber
    ell(c, 16, 29, 12, 3, o.wet ? "#4a3322" : "#6b4a2e");
    if (o.stage >= 0) { const up = [5, 9, 14, 14][o.stage], col = o.tuber ? "#7fae4a" : "#4f9a3c"; for (const dx of [-6, 0, 6]) line(c, 16 + dx, 29, 16 + dx * 1.2, 29 - up, col, 2); if (o.stage === 3) for (const dx of [-6, 0, 6]) ell(c, 16 + dx * 1.2, 29 - up, 2.4, 2.4, o.tuber ? "#d9b98a" : "#d1405f"); }
  }
}

/** Creatures, in the colours of the map glyphs. o = {tame, hostile, back}. */
export function fauna(c, sp, o, view = "side") {
  if (sp === "hopper") {
    ell(c, 16, 24, 8, 6.5, "#c2a572", "#6b5530"); c.fillStyle = "#c2a572"; c.fillRect(10, 11, 3, 8); c.fillRect(19, 11, 3, 8);
    if (!o.back) { ell(c, 12.5, 22, 1.4, 1.6, "#222"); ell(c, 19.5, 22, 1.4, 1.6, "#222"); }
    if (o.tame) line(c, 11, 25, 21, 25, "#e5594f", 2);
  } else if (sp === "wolf") {
    ell(c, 16, 21, 12, 7, "#7d8591", o.hostile ? "#ff5d5d" : "#2c3138"); poly(c, [22, 15, 24, 7, 27, 15], "#2c3138"); poly(c, [9, 15, 11, 8, 14, 15], "#2c3138");
    ell(c, 26, 22, 3, 2.5, "#d9dde3"); c.fillStyle = "#2c3138"; c.fillRect(9, 26, 3, 5); c.fillRect(20, 26, 3, 5);
    if (!o.back) ell(c, 24, 19, 1.2, 1.2, "#ffdc8a");
  } else if (sp === "grazer") {
    ell(c, 16, 20, 13, 9, o.tame ? "#9a7650" : "#7d5a3a", o.hostile ? "#ff5d5d" : "#3b2916"); c.fillStyle = "#3b2916"; c.fillRect(7, 25, 3, 6); c.fillRect(21, 25, 3, 6);
    line(c, 6, 14, 3, 8, "#e9dcc0", 2.4); line(c, 26, 14, 29, 8, "#e9dcc0", 2.4);
    if (o.tame) line(c, 11, 18, 21, 18, "#e5594f", 2);
  } else if (sp === "crawler") {                                                                                 // 7.22: a low pale many-legged crawler, red-eyed
    for (const dx of [-8, -3, 3, 8]) { line(c, 16 + dx, 25, 16 + dx * 1.45, 30, "#4a4332", 1.6); line(c, 16 + dx, 22, 16 + dx * 1.35, 18, "#4a4332", 1.6); }
    ell(c, 15, 24, 11, 5, "#d8d0b8", o.hostile ? "#ff5d5d" : "#4a4332"); line(c, 9, 20, 9, 28, "#a89e84", 1); line(c, 15, 19, 15, 29, "#a89e84", 1);
    ell(c, 25, 23, 4.2, 3.4, "#b8ae92", "#4a4332"); if (!o.back) { ell(c, 27, 22, 1.2, 1.2, "#ff3b3b"); line(c, 28, 25, 31, 27, "#4a4332", 1.4); }
  } else if (sp === "coreback") {                                                                                // 7.22: a thornback gone violet: glowing spines, quicker and leaner
    ell(c, 16, 21, 13, 8, "#3a2a4a", o.hostile ? "#ff5d5d" : "#150d1f");
    for (let i = -2; i <= 2; i++) poly(c, [16 + i * 5 - 2, 14, 16 + i * 5, 5, 16 + i * 5 + 2, 14], "#b070ff");
    c.fillStyle = "#150d1f"; c.fillRect(6, 26, 4, 5); c.fillRect(22, 26, 4, 5);
    if (!o.back) { ell(c, 26, 21, 1.8, 1.8, "#e6b8ff"); poly(c, [28, 24, 31, 27, 27, 26], "#e9dcc0"); }
  } else if (sp === "spitter") {                                                                                 // 7.22: a squat green thing with a wide mouth; it spits when it attacks
    ell(c, 16, 23, 9, 7.5, "#6f8f3a", o.hostile ? "#ff5d5d" : "#2c3d14"); ell(c, 16, 14, 5, 4.5, "#85a84a", "#2c3d14");
    if (!o.back) { ell(c, 14, 13, 1.2, 1.2, "#ffec7a"); ell(c, 19, 13, 1.2, 1.2, "#ffec7a"); ell(c, 16, 17, 3, 1.6, o.hostile ? "#5a1010" : "#1c2a0c"); }
    if (o.hostile) { ell(c, 24, 17, 2, 2, "#c4f05a"); ell(c, 28, 16, 1.4, 1.4, "#c4f05a"); }
    c.fillStyle = "#2c3d14"; c.fillRect(9, 28, 4, 3); c.fillRect(19, 28, 4, 3);
  } else if (sp === "guardian") {                                                                                // 7.22: a tall stone figure with the core burning in its chest
    c.fillStyle = "#7d7a86"; c.fillRect(8, 10, 16, 20); c.strokeStyle = o.hostile ? "#ff5d5d" : "#34323b"; c.lineWidth = 1.6; c.strokeRect(8, 10, 16, 20);
    ell(c, 16, 7, 5.5, 5, "#8e8b98", "#34323b"); c.fillStyle = "#7d7a86"; c.fillRect(3, 12, 5, 14); c.fillRect(24, 12, 5, 14);
    ell(c, 16, 19, 3.8, 3.8, "#d68cff", "#6a2fa8"); if (!o.back) { ell(c, 14, 6.5, 1.1, 1.1, "#d68cff"); ell(c, 18, 6.5, 1.1, 1.1, "#d68cff"); }
    c.fillStyle = "#34323b"; c.fillRect(9, 28, 5, 3); c.fillRect(18, 28, 5, 3);
  } else {                                                                                                       // the thornback: a big dark boar with a spiked back
    ell(c, 16, 21, 14, 9, "#4a2f22", o.hostile ? "#ff5d5d" : "#1c120c");
    for (let i = -2; i <= 2; i++) poly(c, [16 + i * 5 - 2, 14, 16 + i * 5, 6, 16 + i * 5 + 2, 14], "#1c120c");
    c.fillStyle = "#1c120c"; c.fillRect(6, 26, 4, 5); c.fillRect(22, 26, 4, 5);
    if (!o.back) { ell(c, 26, 21, 1.8, 1.8, "#ff9a8a"); poly(c, [28, 24, 31, 27, 27, 26], "#e9dcc0"); }
  }
}

/** Furniture and stations. o = {lit, bn (burning), fill, rcp}. Fire parts are drawn in the flame colours (the renderer marks the whole sprite as glowing). */
export function furniture(c, f, o, view = "side") {
  const wood = "#a67c52", dark = "#3d2810";
  if (f === "door") { c.fillStyle = "#8a5a2c"; c.fillRect(8, 3, 16, 28); c.strokeStyle = dark; c.lineWidth = 1.2; c.strokeRect(8, 3, 16, 28); c.fillStyle = "#e8c070"; c.fillRect(20, 17, 2, 2); }
  else if (f === "bed") { c.fillStyle = "#4f9a3c"; c.fillRect(3, 22, 26, 8); c.strokeStyle = "#2c5a22"; c.strokeRect(3, 22, 26, 8); line(c, 7, 26, 25, 26, "#8fd06a", 1.2); }
  else if (f === "hearth") { ell(c, 16, 28, 11, 3.5, "#5a5650"); for (let i = 0; i < 7; i++) ell(c, 6 + i * 3.4, 28, 2.4, 2, "#9a9ea6"); if (o.lit) fire(c, 16, 27, 1); }
  else if (f === "kiln") { ell(c, 16, 26, 12, 6, "#b2603e", "#7a3a22"); ell(c, 16, 25, 7, 3.5, o.bn > 0 ? "#2a1608" : "#4a2a1c"); if (o.bn > 0) fire(c, 16, 25, 0.8); }
  else if (f === "forge") { c.fillStyle = "#a84a34"; c.fillRect(5, 12, 22, 19); c.strokeStyle = "#5a2418"; c.strokeRect(5, 12, 22, 19); line(c, 5, 22, 27, 22, "#5a2418", 1); ell(c, 16, 22, 4, 3, o.bn > 0 ? "#fff0c0" : "#20120a"); c.fillStyle = "#5a2418"; c.fillRect(13, 5, 6, 8); if (o.bn > 0) fire(c, 16, 12, 0.7); }
  else if (f === "smoker") { c.fillStyle = "#6b8a4a"; c.fillRect(4, 8, 24, 8); line(c, 5, 31, 5, 14, wood, 2.4); line(c, 27, 31, 27, 14, wood, 2.4); line(c, 5, 22, 27, 22, wood, 2); if (o.bn > 0) ell(c, 16, 4, 6, 3, "rgba(170,170,180,.7)"); }
  else if (f === "mound") { ell(c, 16, 27, 13, 9, "#6e5236"); ell(c, 13, 24, 8, 6, "#8a6a45"); }
  else if (f === "workbench") { c.fillStyle = "#6b4a2a"; c.fillRect(4, 18, 24, 13); c.fillStyle = wood; c.fillRect(3, 14, 26, 6); c.strokeStyle = dark; c.strokeRect(3, 14, 26, 17); if (o.rcp) { c.fillStyle = "#d98a4a"; c.fillRect(11, 10, 10, 4); } }
  else if (f === "bellows") { poly(c, [4, 20, 22, 23, 22, 29, 4, 31], "#8a5a3a", dark); c.fillStyle = "#b8613f"; c.fillRect(22, 24, 8, 3); }
  else if (f === "torch") { line(c, 16, 31, 16, 14, "#7a5430", 3); fire(c, 16, 15, 1); }
  else if (f === "lamp") { ell(c, 16, 22, 8, 8, "#c98a4a", "#5a3a1a"); ell(c, 16, 22, 4, 4, "#fff0b0"); }
  else if (f === "shelf") { line(c, 5, 31, 5, 3, "#7a5430", 2.4); line(c, 27, 31, 27, 3, "#7a5430", 2.4); for (const y of [8, 17, 27]) line(c, 5, y, 27, y, "#7a5430", 2.2); c.fillStyle = "#b8613f"; c.fillRect(9, 11, 6, 6); c.fillStyle = "#c9a85c"; c.fillRect(17, 20, 7, 7); }
  else if (f === "board") { line(c, 8, 31, 8, 12, "#7a5430", 2.6); line(c, 24, 31, 24, 12, "#7a5430", 2.6); c.fillStyle = "#c9a468"; c.fillRect(3, 3, 26, 17); c.strokeStyle = dark; c.lineWidth = 1.2; c.strokeRect(3, 3, 26, 17); const k = Math.min(5, o.nn | 0); for (let i = 0; i < k; i++) { c.fillStyle = i % 2 ? "#fff6d0" : "#f4e6b0"; c.fillRect(5 + (i % 3) * 8 + (i > 2 ? 3 : 0), 5 + (i > 2 ? 7 : 0) + (i % 2), 6, 6); } }
  else if (f === "vent") { c.fillStyle = "#1a1410"; c.fillRect(6, 14, 20, 17); c.strokeStyle = wood; c.lineWidth = 2; c.strokeRect(6, 14, 20, 17); }
  else if (f === "waterjar") { ell(c, 16, 22, 9, 9, "#a8552f"); c.fillStyle = "#e0b090"; c.fillRect(11, 8, 10, 5); if (o.fill > 0) ell(c, 16, 22, 6, 3, "#4aa8ff"); }
  else { line(c, 5, 31, 5, 5, wood, 2.6); line(c, 27, 31, 27, 5, wood, 2.6); line(c, 5, 12, 27, 12, wood, 2.2); line(c, 5, 21, 27, 21, wood, 2.2); if (o.rv) { c.fillStyle = "#8c4a3a"; for (let i = -1; i <= 1; i++) c.fillRect(15 + i * 6, 12, 3, 5); } }
}
function fire(c, x, y, k) {
  poly(c, [x - 5 * k, y, x - 1 * k, y - 11 * k, x + 1 * k, y - 8 * k, x + 5 * k, y], "#ff7a1c");
  poly(c, [x - 2.5 * k, y, x, y - 7 * k, x + 2.5 * k, y], "#ffd84a"); ell(c, x, y - 1, 1.6 * k + 0.4, 2 * k + 0.4, "#fff4c2");
}

/** A flame entity (a burning tree or a smouldering stump), a grave, a wagon, a construction ghost. */
export function misc(c, kind, o, view = "side") {
  if (kind === "flame") { if (o.tree) { fire(c, 16, 28, 2.2); fire(c, 9, 29, 1.4); fire(c, 23, 29, 1.4); } else { ell(c, 16, 29, 4, 2, "#ff8a2a"); ell(c, 16, 22, 3, 5, "rgba(190,190,200,.55)"); } }
  else if (kind === "grave") { ell(c, 16, 29, 11, 3, "rgba(70,52,34,.9)"); poly(c, [9, 28, 9, 11, 16, 5, 23, 11, 23, 28], "#b9b4a8", "#5e594f"); c.fillStyle = `hsl(${o.hue || 0},70%,55%)`; c.fillRect(13, 14, 6, 6); }
  else if (kind === "trap") { const col = { dart: "#ff7a4a", pit: "#ffc23a", collapse: "#e5594f", gas: "#9bd83a" }[o.t] || "#ff7a4a"; ell(c, 16, 27, 11, 3, "rgba(0,0,0,.45)"); poly(c, [16, 6, 28, 26, 4, 26], col, "#2a1208"); c.fillStyle = "#2a1208"; c.fillRect(15, 12, 2.4, 8); c.fillRect(15, 22, 2.4, 2.4); }
  else if (kind === "wagon") { c.fillStyle = o.cart ? "#b0803f" : "#a67c52"; c.fillRect(3, 12, 26, 12); c.strokeStyle = "#3d2810"; c.strokeRect(3, 12, 26, 12); ell(c, 9, 26, 5, 5, "#2c2118", "#c9a85c"); ell(c, 23, 26, 5, 5, "#2c2118", "#c9a85c"); }
  else { c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 1.5; c.setLineDash([3, 3]); c.strokeRect(5, 8, 22, 22); c.setLineDash([]); c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(5, 8, 22, 22); }       // a ghost: a dashed box
}

/** Fixed utility sprites: the ground shadow (a soft dark disc) and the target highlight (a bright frame). */
export function uiSprite(c, kind) {
  if (kind === "shadow") { const g = c.createRadialGradient(16, 16, 0, 16, 16, 15); g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(0.6, "rgba(0,0,0,.35)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, 32, 32); }
  else { c.fillStyle = "rgba(255,244,190,.10)"; c.fillRect(0, 0, 32, 32); c.strokeStyle = "rgba(255,244,190,.9)"; c.lineWidth = 1.6; c.strokeRect(0.8, 0.8, 30.4, 30.4); }
}

/** 7.23: a billboard's side in cells, by what the creature is. The painters draw the body across most of the 32 px square, so this is close to its body length: a slime is 0.9, and a 16-hit-point crawler is
 *  about half that (it filled the bottom third of the first-person view when it stood beside you at 1.0). */
export const FAUNA_SIZE = { guardian: 1.9, thornback: 1.6, coreback: 1.3, grazer: 1.3, wolf: 0.95, spitter: 0.62, crawler: 0.5, hopper: 0.6 };

/**
 * What to draw for an entity: {key, w, h (cells), em (0..1 glow), paint(ctx)} or null. `back` = the viewer is behind it (no face).
 * Keys are small strings so the atlas can cache them: the lineage hue is rounded to 6 degrees (a sprite per lineage, not per villager).
 */
export function spriteOf(e, sim, back, ctxInfo = {}) {
  const k = e.kind;
  if (k === "villager") {
    const child = (sim.tick - e.born) / DAY < 0.2 * LIFE_DAYS, hue = Math.round(e.hue / 6) * 6, asleep = e.slp === 1, bk = back ? 1 : 0;
    const o = { hue, child, asleep, ill: !!e.ill, back: !!back, lin: e.lin, carry: e.carry ? e.carry.item : "" };
    return { key: `v${hue}${child ? "c" : ""}${asleep ? "z" : ""}${e.ill ? "i" : ""}${bk}${e.lin === undefined ? "" : e.lin % 3}${o.carry}`, w: child ? 0.62 : 0.9, h: child ? 0.62 : 0.9, em: 0, paint: (c) => slime(c, o) };
  }
  if (k === "item") return { key: "i" + e.item + Math.min(3, e.n), w: 0.62, h: 0.62, em: 0, paint: (c) => item(c, e.item, { n: e.n }) };
  if (k === "plant") {
    const s = e.species;
    if (s === "tree") { const pine = ctxInfo.pine ? 1 : 0, burn = e.burn ? 1 : 0; return { key: `t${pine}${burn}`, w: 1.7, h: 1.7, em: 0, paint: (c) => plant(c, { species: "tree", pine: !!pine, burn: !!burn }) }; }
    if (s === "berry") { const y = e.yield | 0, yg = e.gr !== undefined && e.gr < 4 ? 0 : e.gr !== undefined && e.gr < 9 ? 1 : 2; return { key: `b${y}${yg}`, w: 0.8, h: 0.8, em: 0, paint: (c) => plant(c, { species: "berry", yield: y, young: yg }) }; }
    if (s === "tuft") { const y = e.yield > 0 ? 1 : 0; return { key: "u" + y, w: 0.6, h: 0.6, em: 0, paint: (c) => plant(c, { species: "tuft", yield: y }) }; }
    if (s === "sapling") return { key: "sa", w: 0.7, h: 0.7, em: 0, paint: (c) => plant(c, { species: "sapling" }) };
    if (s === "stump") { const fl = e.fl ? 1 : 0; return { key: "st" + fl, w: 0.7, h: 0.7, em: 0, paint: (c) => plant(c, { species: "stump", fl: !!fl }) }; }
    return null;
  }
  if (k === "plot") {
    if (!e.tl) return null;
    const stage = e.cr ? ctxInfo.stage | 0 : -1, tub = e.cr === "tuber", wet = ctxInfo.wet ? 1 : 0;
    return { key: `p${stage}${tub ? "t" : ""}${wet}`, w: 0.95, h: 0.95, em: 0, flat: true, paint: (c) => plant(c, { species: "crop", stage, tuber: tub, wet: !!wet }) };
  }
  if (k === "fauna") {
    const hostile = e.st === "attack" || e.st === "hunt" || e.st === "turn" || e.st === "raid", bk = back ? 1 : 0, big = FAUNA_SIZE[e.sp] || 0.6;
    return { key: `f${e.sp}${e.tame ? "t" : ""}${hostile ? "h" : ""}${bk}`, w: big, h: big, em: 0, paint: (c) => fauna(c, e.sp, { tame: !!e.tame, hostile, back: !!back }) };
  }
  if (k === "furniture") {
    const nn = e.f === "board" ? Math.min(5, (e.notes || []).length) : 0, lit = e.f === "hearth" ? !!e.lit : (e.bn > 0), fill = e.f === "waterjar" && e.fill > 0 ? 1 : 0, rcp = e.rcp && e.inv && Object.keys(e.inv).length ? 1 : 0, rv = e.rv ? 1 : 0;
    const em = e.f === "torch" || e.f === "lamp" ? 0.8 : lit ? 0.45 : 0, flat = e.f === "bed";
    const size = { door: [0.95, 1.3], bed: [1, 1], shelf: [0.9, 1.1], board: [1, 1.2], vent: [0.8, 0.8], workbench: [1, 0.8], torch: [0.7, 1.1], lamp: [0.6, 0.6], forge: [1, 1], waterjar: [0.7, 0.7], mound: [1, 0.9], hearth: [0.9, 0.9] }[e.f] || [0.95, 0.95];
    return { key: `m${e.f}${lit ? "l" : ""}${fill}${rcp}${rv}${nn}`, w: size[0], h: size[1], em, flat, paint: (c) => furniture(c, e.f, { lit: !!e.lit, bn: lit ? 1 : 0, fill, rcp, rv, nn }) };
  }
  if (k === "flame") { const tree = e.src === "tree"; return { key: "fl" + (tree ? "t" : "s"), w: tree ? 1.6 : 0.8, h: tree ? 1.6 : 0.8, em: 0.9, paint: (c) => misc(c, "flame", { tree }) }; }
  if (k === "grave") { const hue = Math.round((e.hue || 0) / 6) * 6; return { key: "g" + hue, w: 0.8, h: 0.9, em: 0, paint: (c) => misc(c, "grave", { hue }) }; }
  if (k === "wagon") { const cart = e.t === "cart" ? 1 : 0; return { key: "w" + cart, w: 1.4, h: 1.1, em: 0, paint: (c) => misc(c, "wagon", { cart: !!cart }) }; }
  if (k === "trap") return { key: "tr" + e.k, w: 0.8, h: 0.8, em: 0.3, paint: (c) => misc(c, "trap", { t: e.k }) };      // 7.21: a spotted trap (drawn from sim.trp, not an entity)
  if (k === "site" || k === "csite") return { key: "gh", w: 0.9, h: 0.9, em: 0.35, paint: (c) => misc(c, "ghost", {}) };
  return null;
}
