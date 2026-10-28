// The map's own decorations, drawn on the 2D overlay canvas through cam.toScreen (so they work in the angled view and, where a thing makes sense there, in the flat fallback too):
// pens and the cellar, foul air and cracks, a job dot (and for the selected and hovered a job chip and a short label) above each slime, hit flashes and health bars,
// and the markers in the Surface view that say somebody is working underground (UI_SPEC §10, §4.7, §12.2).
import { D, World } from "../sim/world.js";
import { DAY } from "../sim/clock.js";
import { LIFE_DAYS } from "../sim/villager.js";
import { gasCells, airMap } from "../sim/underground.js";
import { drawIcon } from "../ui/icons.js";
import { TOKENS } from "../ui/kit.js";
import { CLASS, alerts } from "../ui/text.js";
import { doingWord, faunaWord } from "../ui/labels.js";
import { JOB_ICON } from "../ui/inspector.js";

const TAU = Math.PI * 2;
const ALERT_ICON = { hungry: "food", thirsty: "water", cold: "cold", tired: "energy", sick: "sick", hurt: "hurt", stuck: "blocked" };
function tag(ctx, text, x, y, color = "#fff") {
  ctx.font = "600 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = "rgba(10,14,20,.78)"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - 14, w, 18, 9) : ctx.rect(x - w / 2, y - 14, w, 18); ctx.fill();
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

export function drawDecor(game, ctx) {
  const { sim, cam, renderer, ui } = game, ts = cam.zoom, calm = game.access && game.access.calm, view = cam.visible();
  const inView = (x, y) => x >= view.x0 - 2 && x <= view.x1 + 2 && y >= view.y0 - 2 && y <= view.y1 + 2;
  const surface = renderer.z >= D - 1, now = performance.now();
  // pens and the cellar (they used to be part of the ground pass)
  for (const pn of sim.farm.pens) {
    if (renderer.topAt(pn.x0, pn.y0) !== pn.z - 1 || !inView(pn.x0, pn.y0)) continue;
    const [ax, ay, w, h] = cam.rect(pn.x0, pn.y0, pn.x1 + 1, pn.y1 + 1, pn.z);
    ctx.lineWidth = Math.max(1.5, ts * 0.1);
    if (!pn.built) { ctx.strokeStyle = "rgba(200,160,100," + (0.35 + 0.5 * pn.got / pn.need).toFixed(2) + ")"; ctx.setLineDash([4, 4]); ctx.strokeRect(ax, ay, w, h); ctx.setLineDash([]); continue; }
    const gx0 = (pn.g[0] - cam.x) * ts + cam.vw / 2, gx1 = gx0 + ts;
    ctx.strokeStyle = "#a67c52"; ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(ax + w, ay); ctx.lineTo(ax + w, ay + h); ctx.lineTo(gx1, ay + h); ctx.moveTo(gx0, ay + h); ctx.lineTo(ax, ay + h); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.fillStyle = "#6b4a2a";
    for (let x = pn.x0; x <= pn.x1 + 1; x++) for (const y of [pn.y0, pn.y1 + 1]) { const [px, py] = cam.toScreen(x, y, pn.z); ctx.fillRect(px - 1.5, py - 1.5, 3, 3); }
    ctx.strokeStyle = "#e8c070"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx0 + 2, ay + h); ctx.lineTo(gx1 - 2, ay + h); ctx.stroke();
  }
  const cz = sim.farm.cellar;
  if (cz && renderer.topAt(cz.x0, cz.y0) === cz.z - 1 && inView(cz.x0, cz.y0)) {
    const [ax, ay, w, h] = cam.rect(cz.x0, cz.y0, cz.x1 + 1, cz.y1 + 1, cz.z);
    ctx.fillStyle = "rgba(150,200,255,.14)"; ctx.fillRect(ax, ay, w, h);
    ctx.strokeStyle = "rgba(150,200,255,.7)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(ax, ay, w, h); ctx.setLineDash([]);
  }
  // foul air and cracking roofs, on the level you are looking at
  if (!surface && (sim.ug.cr.length || gasCells(sim).length)) {
    const bad = airMap(sim).bad, cr = new Set(sim.ug.cr.map(e => e[0]));
    const mark = (ci, foul) => {
      const [x, y, z] = World.xyz(ci);
      if (z !== renderer.z || !inView(x, y)) return;
      const [sx, sy, cw, th] = cam.rect(x, y, x + 1, y + 1, z);
      if (foul) { ctx.fillStyle = "rgba(160,200,40,.34)"; ctx.fillRect(sx, sy, cw, th); if (ts >= 7) { ctx.strokeStyle = "rgba(235,255,150,.85)"; ctx.lineWidth = Math.max(1, ts * 0.07); ctx.beginPath(); for (const o of [0.3, 0.62]) { ctx.moveTo(sx + cw * 0.15, sy + th * o); ctx.quadraticCurveTo(sx + cw * 0.32, sy + th * (o - 0.12), sx + cw * 0.5, sy + th * o); ctx.quadraticCurveTo(sx + cw * 0.68, sy + th * (o + 0.12), sx + cw * 0.85, sy + th * o); } ctx.stroke(); } }
      else { const a = calm ? 0.9 : 0.55 + 0.4 * Math.abs(Math.sin(now / 260 + ci)); ctx.strokeStyle = `rgba(255,120,90,${a})`; ctx.lineWidth = Math.max(1, ts * 0.09); ctx.beginPath(); ctx.moveTo(sx + cw * 0.1, sy + th * 0.2); ctx.lineTo(sx + cw * 0.4, sy + th * 0.45); ctx.lineTo(sx + cw * 0.3, sy + th * 0.7); ctx.lineTo(sx + cw * 0.6, sy + th * 0.9); ctx.moveTo(sx + cw * 0.4, sy + th * 0.45); ctx.lineTo(sx + cw * 0.9, sy + th * 0.35); ctx.stroke(); }
    };
    if (bad) for (const ci of bad) mark(ci, true);
    for (const ci of cr) mark(ci, false);
  }
  // creatures: health bars once hurt, and the hit flash
  const flash = (e, sx, sy) => {
    const age = sim.tick - (e.ht || 0);
    if (!e.ht || age > 24 || age < 0) return;
    const miss = e.hd < 0, txt = miss ? "miss" : "-" + e.hd, k = calm ? 0 : age / 24;
    ctx.globalAlpha = 1 - k; ctx.font = `bold ${Math.floor(Math.max(12, ts * 0.6))}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    if (!calm) { ctx.strokeStyle = miss ? "#cfd6e4" : "#ff3b3b"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(sx, sy, ts * (0.35 + 0.5 * k), ts * (0.35 + 0.5 * k) * cam.sinP, 0, 0, TAU); ctx.stroke(); }
    const ty = sy - ts * 0.9 - k * ts * 0.9; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(txt, sx, ty); ctx.fillStyle = miss ? "#cfd6e4" : "#ffd2d2"; ctx.fillText(txt, sx, ty); ctx.globalAlpha = 1;
  };
  for (const e of sim.ents.ofKind("fauna")) {
    if (!inView(e.x, e.y) || !renderer.isShown(e)) continue;
    const [sx, sy] = cam.toScreen(...renderer.drawPos(e), e.z);
    if (e.hp < e.mhp && ts >= 5) { const w = ts * 0.9, y = sy - ts * (e.sp === "thornback" ? 1.9 : 1.1); ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(sx - w / 2, y, w, 3); ctx.fillStyle = e.hp / e.mhp > 0.5 ? "#6fbf73" : "#e5594f"; ctx.fillRect(sx - w / 2, y, w * Math.max(0, e.hp / e.mhp), 3); }
    flash(e, sx, sy);
    if (ui.hover && ui.hover.ents && ui.hover.ents.includes(e)) tag(ctx, faunaWord(e), sx, sy - ts * 1.2 - 6);
  }
  // slimes: a class dot above each, the job chip and a short label for the selected / hovered, a need badge when something is wrong
  const sel = new Set(ui.sel), hov = ui.hover && ui.hover.villager;
  let n = 0;
  for (const v of sim.ents.ofKind("villager")) {
    if (!inView(v.x, v.y) || !renderer.isShown(v)) continue;
    const [sx, sy] = cam.toScreen(...renderer.drawPos(v), v.z), kid = (sim.tick - v.born) / DAY < 0.2 * LIFE_DAYS, head = sy - ts * (kid ? 0.62 : 0.9) - 4;
    flash(v, sx, sy);
    const focus = sel.has(v.id) || v === hov;
    const cls = v.job && CLASS[v.job.c] ? CLASS[v.job.c].color : null;
    if (!focus && cls && ts >= 6 && n++ < 140) { ctx.fillStyle = cls; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, head, Math.max(2, ts * 0.12), 0, TAU); ctx.fill(); ctx.stroke(); }
    const al = ts >= 8 ? alerts(sim, v).filter(a => ALERT_ICON[a.k]) : [];
    if (!focus && al.length) { const r = Math.max(6, ts * 0.32), ax = sx + ts * 0.42, ay = head + 2; ctx.fillStyle = TOKENS.s2; ctx.strokeStyle = TOKENS.warm; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ax, ay, r, 0, TAU); ctx.fill(); ctx.stroke(); drawIcon(ctx, ALERT_ICON[al[0].k], ax - r * 0.6, ay - r * 0.6, r * 1.2, TOKENS.tx, 1.5); }
    if (focus) {
      const icon = JOB_ICON[v.job && v.job.k] || (v.slp === 1 ? "sleep" : "idle"), r = 11;
      ctx.fillStyle = TOKENS.s2; ctx.strokeStyle = cls || "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, head - 6, r, 0, TAU); ctx.fill(); ctx.stroke();
      drawIcon(ctx, icon, sx - 7, head - 13, 14, TOKENS.tx);
      if (ts >= 7) tag(ctx, v.name.split(" ")[0] + ": " + doingWord(v), sx, head - 24);
    }
  }
  // the Surface view: somebody is working below (a pick mark and a count above the ground over each tunnel or shaft)
  if (surface) {
    const groups = new Map();
    for (const v of sim.ents.ofKind("villager")) {
      if (!inView(v.x, v.y)) continue;
      const top = renderer.topAt(v.x, v.y);
      if (top < 0 || top + 1 - v.z < 2) continue;
      const k = (v.x >> 2) + "," + (v.y >> 2), g = groups.get(k) || { x: 0, y: 0, n: 0, top: 0 };
      g.x += v.x + 0.5; g.y += v.y + 0.5; g.n++; g.top = Math.max(g.top, top + 1); groups.set(k, g);
    }
    for (const g of groups.values()) {
      const [sx, sy] = cam.toScreen(g.x / g.n, g.y / g.n, g.top), y = sy - 18, r = 11;
      ctx.fillStyle = TOKENS.s2; ctx.strokeStyle = TOKENS.water; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, y, r, 0, TAU); ctx.fill(); ctx.stroke();
      drawIcon(ctx, "dig", sx - 7, y - 7, 14, TOKENS.tx);
      if (g.n > 1) { ctx.fillStyle = TOKENS.water; ctx.font = "700 11px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(String(g.n), sx + r + 2, y); }
      ctx.fillStyle = TOKENS.water; ctx.beginPath(); ctx.moveTo(sx - 4, y + r + 1); ctx.lineTo(sx + 4, y + r + 1); ctx.lineTo(sx, y + r + 6); ctx.fill();      // a pointer down: look below
    }
  }
}
