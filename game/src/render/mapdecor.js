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
import { seenTraps, gasClouds, TRAP_LABEL } from "../sim/traps.js";
import { dungeonsIn, isAir } from "../sim/dungeon.js";
import { isSeen } from "../sim/seen.js";
import { boardsOf } from "../sim/notices.js";
import { noticeChips } from "../ui/boardtext.js";
import { factMark } from "../ui/beltext.js";
import { STALE } from "../sim/belief.js";
import { ROLE } from "../sim/orders.js";

const TAU = Math.PI * 2;
const ALERT_ICON = { hungry: "food", thirsty: "water", cold: "cold", tired: "energy", sick: "sick", hurt: "hurt", stuck: "blocked" };
function tag(ctx, text, x, y, color = "#fff") {
  ctx.font = "600 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = "rgba(10,14,20,.78)"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - 14, w, 18, 9) : ctx.rect(x - w / 2, y - 14, w, 18); ctx.fill();
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

/** 7.21: spotted traps as a warning glyph and a one-to-three word label, and live gas clouds, on the level being looked at. Drawn in both views (the flat fallback calls it from overlays). */
export function drawTraps(game, ctx) {
  const { sim, cam, renderer } = game, ts = cam.zoom, view = cam.visible();
  if (renderer.z >= D - 1) return;
  drawDungeonOutline(game, ctx);
  const COL = { dart: "#ff7a4a", pit: "#ffc23a", collapse: "#e5594f", gas: "#9bd83a" };
  for (const g of gasClouds(sim)) {
    if (g.x < view.x0 - 3 || g.x > view.x1 + 3 || g.y < view.y0 - 3 || g.y > view.y1 + 3 || renderer.topAt(g.x, g.y) !== g.z - 1) continue;
    const [sx, sy, cw, th] = cam.rect(g.x - 2, g.y - 2, g.x + 3, g.y + 3, g.z);
    ctx.fillStyle = "rgba(160,200,40,.28)"; ctx.fillRect(sx, sy, cw, th);
  }
  for (const t of seenTraps(sim)) {
    if (t.x < view.x0 - 2 || t.x > view.x1 + 2 || t.y < view.y0 - 2 || t.y > view.y1 + 2 || renderer.topAt(t.x, t.y) !== t.z - 1) continue;
    const [sx, sy, cw, th] = cam.rect(t.x, t.y, t.x + 1, t.y + 1, t.z), cx = sx + cw / 2, cy = sy + th / 2, r = Math.max(4, Math.min(cw, th) * 0.42);
    ctx.fillStyle = COL[t.k]; ctx.strokeStyle = "rgba(20,10,4,.9)"; ctx.lineWidth = Math.max(1, r * 0.2);
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 1.05, cy + r * 0.8); ctx.lineTo(cx - r * 1.05, cy + r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (r >= 6) trapMark(ctx, t.k, cx, cy, r);
    if (ts >= 9) tag(ctx, TRAP_LABEL[t.k], cx, cy - r - 4, COL[t.k]);
  }
}

/** 7.23: each trap kind has its own mark inside the warning triangle, so the glyph does not rest on colour alone: darts an exclamation mark, a pit a dark hole, a collapse a falling slash pair, gas three bubbles. */
function trapMark(ctx, k, cx, cy, r) {
  ctx.fillStyle = ctx.strokeStyle = "rgba(20,10,4,.95)"; ctx.lineWidth = Math.max(1, r * 0.16);
  if (k === "pit") { ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.28, r * 0.42, r * 0.22, 0, 0, TAU); ctx.fill(); }
  else if (k === "collapse") { ctx.beginPath(); ctx.moveTo(cx - r * 0.35, cy - r * 0.2); ctx.lineTo(cx - r * 0.05, cy + r * 0.55); ctx.moveTo(cx + r * 0.1, cy - r * 0.25); ctx.lineTo(cx + r * 0.38, cy + r * 0.5); ctx.stroke(); }
  else if (k === "gas") { for (const [dx, dy, q] of [[-0.3, 0.45, 0.15], [0.05, 0.1, 0.18], [0.3, 0.5, 0.13]]) { ctx.beginPath(); ctx.arc(cx + r * dx, cy + r * dy, r * q, 0, TAU); ctx.fill(); } }
  else { ctx.fillRect(cx - r * 0.09, cy - r * 0.35, r * 0.18, r * 0.65); ctx.fillRect(cx - r * 0.09, cy + r * 0.42, r * 0.18, r * 0.18); }
}

/** 7.23: the labyrinth as far as it has been explored: a violet outline round the floor cells somebody has seen (and a faint wash inside), on the level being looked at. Nothing for cells nobody has seen. */
export function drawDungeonOutline(game, ctx) {
  const { sim, cam, renderer } = game, view = cam.visible();
  const duns = dungeonsIn(sim.def, view.x0 - 1, view.y0 - 1, view.x1 + 1, view.y1 + 1);
  if (!duns.length) return;
  ctx.strokeStyle = "rgba(214,140,255,.9)"; ctx.fillStyle = "rgba(154,107,255,.13)"; ctx.lineWidth = Math.max(1.2, cam.zoom * 0.09); ctx.lineCap = "round";
  for (const dun of duns) {
    const cache = new Map();
    const at = (x, y) => {                                                    // the stand z of an explored labyrinth floor cell in this column, or -1
      const k = (y - view.y0 + 2) * 4096 + (x - view.x0 + 2);
      let z = cache.get(k);
      if (z === undefined) { const t = renderer.topAt(x, y); z = t >= 0 && isAir(dun, x, y, t + 1) && isSeen(sim, x, y, t) ? t + 1 : -1; cache.set(k, z); }
      return z;
    };
    for (let y = view.y0 - 1; y <= view.y1 + 1; y++) for (let x = view.x0 - 1; x <= view.x1 + 1; x++) {
      const z = at(x, y);
      if (z < 0) continue;
      const [sx, sy, cw, th] = cam.rect(x, y, x + 1, y + 1, z);
      ctx.fillRect(sx, sy, cw, th);
      ctx.beginPath();
      if (at(x, y - 1) !== z) { ctx.moveTo(sx, sy); ctx.lineTo(sx + cw, sy); }
      if (at(x, y + 1) !== z) { ctx.moveTo(sx, sy + th); ctx.lineTo(sx + cw, sy + th); }
      if (at(x - 1, y) !== z) { ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + th); }
      if (at(x + 1, y) !== z) { ctx.moveTo(sx + cw, sy); ctx.lineTo(sx + cw, sy + th); }
      ctx.stroke();
    }
  }
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
  drawTraps(game, ctx);
  // creatures: health bars once hurt, and the hit flash
  const flash = (e, sx, sy) => {
    const age = sim.tick - (e.ht || 0);
    if (!e.ht || age > 24 || age < 0) return;
    const miss = e.hd < 0, txt = miss ? "miss" : "-" + e.hd, k = calm ? 0 : age / 24;
    ctx.globalAlpha = 1 - k; ctx.font = `bold ${Math.floor(Math.max(12, ts * 0.6))}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    if (!calm) { ctx.strokeStyle = miss ? "#cfd6e4" : "#ff3b3b"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(sx, sy, ts * (0.35 + 0.5 * k), ts * (0.35 + 0.5 * k) * cam.sinP, 0, 0, TAU); ctx.stroke(); }
    const ty = sy - ts * 0.9 - k * ts * 0.9; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(txt, sx, ty); ctx.fillStyle = miss ? "#cfd6e4" : "#ffd2d2"; ctx.fillText(txt, sx, ty); ctx.globalAlpha = 1;
  };
  for (const e of sim.ents.ofKind("fauna")) {                           // 7.22: a monster's blow: a red slash (melee) or a green streak (a spitter's shot) from it to the one aimed at, for a moment
    if (!e.sh || sim.tick - e.sh[3] > 14 || !inView(e.x, e.y) || !renderer.isShown(e)) continue;
    const [ax, ay] = cam.toScreen(...renderer.drawPos(e), e.z), [bx, by] = cam.toScreen(e.sh[0] + 0.5, e.sh[1] + 0.5, e.sh[2]), k = (sim.tick - e.sh[3]) / 14;
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = e.sh[4] ? "#ff4a4a" : "#b6ee4a"; ctx.lineWidth = Math.max(2, ts * (e.sh[4] ? 0.2 : 0.14)); ctx.beginPath(); ctx.moveTo(ax, ay - ts * 0.4); ctx.lineTo(ax + (bx - ax) * Math.min(1, 0.4 + k * 1.2), ay - ts * 0.4 + (by - ay) * Math.min(1, 0.4 + k * 1.2)); ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const e of sim.ents.ofKind("fauna")) {
    if (!inView(e.x, e.y) || !renderer.isShown(e)) continue;
    const [sx, sy] = cam.toScreen(...renderer.drawPos(e), e.z);
    if (e.hp < e.mhp && ts >= 5) { const w = ts * 0.9, y = sy - ts * (e.sp === "guardian" ? 2.6 : e.sp === "thornback" ? 1.9 : e.sp === "coreback" ? 1.7 : 1.1); ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(sx - w / 2, y, w, 3); ctx.fillStyle = e.hp / e.mhp > 0.5 ? "#6fbf73" : "#e5594f"; ctx.fillRect(sx - w / 2, y, w * Math.max(0, e.hp / e.mhp), 3); }
    flash(e, sx, sy);
    if ((ui.hover && ui.hover.ents && ui.hover.ents.includes(e)) || (e.mon && e.st === "attack" && ts >= 10)) tag(ctx, faunaWord(e), sx, sy - ts * 1.2 - 6);       // 7.22: a monster in a fight says what it is doing ("Crawler: Biting")
  }
  // 9.31: a board hovered or selected shows its notices as icon + count chips (a request: the amount short; a pin on a claimed one)
  for (const b of boardsOf(sim)) {
    if (!inView(b.x, b.y) || !renderer.isShown(b) || !((ui.hover && ui.hover.ents && ui.hover.ents.includes(b)) || ui.sel.includes(b.id))) continue;
    const [sx, sy] = cam.toScreen(...renderer.drawPos(b), b.z), ch = noticeChips(b, sim.tick, (id) => { const o = sim.ents.get(id); return o ? o.name : ""; }).slice(0, 7);
    ctx.font = "700 11px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    let x = sx - ch.length * 21, y = sy - ts * 1.5;
    for (const c of ch) {
      const w = 22 + ctx.measureText(c.text).width + (c.claimed ? 10 : 0);
      ctx.globalAlpha = c.old ? 0.55 : 1;                                   // 9.32: an old notice is faded
      ctx.fillStyle = "rgba(10,14,20,.82)"; ctx.strokeStyle = c.claimed ? TOKENS.warm : "#c9a468"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y - 10, w, 20, 10) : ctx.rect(x, y - 10, w, 20); ctx.fill(); ctx.stroke();
      drawIcon(ctx, c.icon, x + 4, y - 7, 14, TOKENS.tx); ctx.fillStyle = "#fff"; ctx.fillText(c.text, x + 20, y + 1);
      if (c.claimed) drawIcon(ctx, "pin", x + w - 13, y - 6, 11, TOKENS.warm);
      if (c.who) { ctx.font = "600 9px system-ui, sans-serif"; ctx.fillStyle = "#e6d9b8"; ctx.fillText(c.who, x + 4, y + 17); ctx.font = "700 11px system-ui, sans-serif"; }      // 9.32: whose hand wrote it
      ctx.globalAlpha = 1;
      x += w + 3;
    }
  }
  // 9.32: the one selected slime's beliefs as faint marks where it thinks things are (fresh = green, ageing = amber, stale = grey with a "?"): the map it carries in its head, not the map that is
  if (ui.sel.length === 1 && ts >= 6) {
    const bv = sim.ents.get(ui.sel[0]);
    if (bv && bv.kind === "villager" && bv.bel) {
      ctx.font = "700 10px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      for (const f of bv.bel) {
        const m = factMark(f, sim.tick);
        if (!m || !inView(f[1], f[2])) continue;
        const [sx, sy] = cam.toScreen(f[1] + 0.5, f[2] + 0.5, f[3]), r = Math.max(6, ts * 0.3), col = m.stale ? "#9aa3b2" : m.age > STALE / 2 ? "#e0b24a" : "#6fbf73";
        ctx.globalAlpha = m.stale ? 0.6 : 0.9; ctx.fillStyle = "rgba(10,14,20,.8)"; ctx.beginPath(); ctx.arc(sx, sy - ts * 0.5, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.lineWidth = 4; ctx.stroke();                              // a dark outer line so the ring reads on green grass
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
        drawIcon(ctx, m.icon, sx - r * 0.62, sy - ts * 0.5 - r * 0.62, r * 1.24, col, 1.5);
        if (m.stale) { ctx.fillStyle = "#fff"; ctx.fillText("?", sx + r * 0.7, sy - ts * 0.5 - r * 0.7); }
        ctx.globalAlpha = 1;
      }
    }
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
    if (v.job && v.job.rq && ts >= 6) { const r = Math.max(6, ts * 0.32), ax = sx - ts * 0.42, ay = head + 2; ctx.fillStyle = TOKENS.s2; ctx.strokeStyle = "#c9a468"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ax, ay, r, 0, TAU); ctx.fill(); ctx.stroke(); drawIcon(ctx, v.job.rq === "grass" ? "gather" : "chop", ax - r * 0.62, ay - r * 0.62, r * 1.24, TOKENS.tx); }     // 9.31: off to fill a request from the board: the request's icon
    const al = ts >= 8 ? alerts(sim, v).filter(a => ALERT_ICON[a.k]) : [];
    if (!focus && al.length) { const r = Math.max(6, ts * 0.32), ax = sx + ts * 0.42, ay = head + 2; ctx.fillStyle = TOKENS.s2; ctx.strokeStyle = TOKENS.warm; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ax, ay, r, 0, TAU); ctx.fill(); ctx.stroke(); drawIcon(ctx, ALERT_ICON[al[0].k], ax - r * 0.6, ay - r * 0.6, r * 1.2, TOKENS.tx, 1.5); }
    if (v.as && ROLE[v.as.task] && ts >= 8) {                       // D58: the role under the slime, as an icon and one word (the icon alone when zoomed out)
      const ro = ROLE[v.as.task], word = ts >= 12 ? ro.name : "";
      ctx.font = "700 10px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const w = 20 + (word ? ctx.measureText(word).width + 4 : 0), x0 = sx - w / 2, y0 = sy + ts * 0.5;
      ctx.fillStyle = "rgba(10,14,20,.82)"; ctx.strokeStyle = CLASS.order.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y0, w, 16, 8) : ctx.rect(x0, y0, w, 16); ctx.fill(); ctx.stroke();
      drawIcon(ctx, ro.icon, x0 + 3, y0 + 2, 12, TOKENS.tx);
      if (word) { ctx.fillStyle = "#fff"; ctx.fillText(word, x0 + 17, y0 + 9); }
    }
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
