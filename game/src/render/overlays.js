// Everything drawn ON TOP of the world for the player: selection rings, hover
// outline, drag box, order markers, and the optional overlays (zones, job
// lines, warmth). Reads sim + ui state, never writes the sim.
import { tempAt, warmthAt, isNight } from "../sim/season.js";
import { COMFORT } from "../sim/villager.js";
import { inZone } from "../sim/items.js";
import { CLASS } from "../ui/text.js";
import { drawSites, drawRoom, drawMarks, drawMining } from "./ghosts.js";
import { drawDecor, drawTraps } from "./mapdecor.js";
import { provisionalRoom } from "../sim/proom.js";
import { drawIcon } from "../ui/icons.js";
import { TOKENS } from "../ui/kit.js";
import { concernPlaces } from "../ui/concernplace.js";
import { litHearths, flames, FIRE_R, FIRE_WARM } from "../sim/fire.js";

const TAU = 6.2832;

export function drawOverlays(game) {
  const { sim, cam, renderer, ui } = game, ctx = renderer.ctx, ts = cam.zoom;
  ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
  const at = (e) => { const p = renderer.drawPos ? renderer.drawPos(e) : [e.x + 0.5, e.y + 0.5]; return cam.toScreen(p[0], p[1], e.z); };      // where a thing stands (its feet); villagers glide, so this follows the drawn position
  const sel = new Set(ui.sel);

  drawSites(game, ctx);
  drawMining(game, ctx);
  drawMarks(game, ctx);
  if (ui.other && ui.other.kind === "proom") drawProom(game, ctx);
  if (ui.other && ui.other.kind === "room") { const r = sim.rooms.list.get(ui.other.id); if (r) drawRoom(game, ctx, r, "pick"); }
  if (ui.overlays.temp) warmth(game, ctx, at);
  if (ui.overlays.zones || ui.hoverStock || (ui.other && ui.other.kind === "stock")) zones(game, ctx, at, ts);
  if (ui.overlays.jobs) jobLines(game, ctx, at, sel, ts);

  if (game.cam.oblique) drawDecor(game, ctx); else drawTraps(game, ctx);
  concernMarkers(game, ctx);
  drawLight(game, ctx);

  // Hover outline: the cell, or a ring if a villager is under the cursor.
  const h = ui.hover;
  if (h && h.kind !== "none" && !ui.press) {
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,.65)";
    if (h.villager) { const [sx, sy] = at(h.villager); ring(ctx, sx, sy, ts * 0.55, cam.sinP); }
    else if (h.face && cam.oblique && h.face[1] === 1) { const [sx, sy] = cam.toScreen(h.x, h.y + 1, h.cz), rh = cam.riseH; ctx.strokeRect(sx + .5, sy - rh + .5, ts - 1, rh - 1); }      // the front face of a block
    else { const [sx, sy, cw, th] = cam.rect(h.x, h.y, h.x + 1, h.y + 1, cam.oblique && h.cz !== undefined ? h.cz + 1 : h.z); ctx.strokeRect(sx + .5, sy + .5, cw - 1, th - 1); }
  }

  // A selected non-villager thing.
  const o = ui.other && ui.other.kind === "entity" ? sim.ents.get(ui.other.id) : null;
  if (o) { const [sx, sy, cw, th] = cam.rect(o.x, o.y, o.x + 1, o.y + 1, o.z); ctx.lineWidth = 2; ctx.strokeStyle = "#ffd166"; ctx.strokeRect(sx + 1, sy + 1, cw - 2, th - 2); }

  // Selected villagers: bright ring (thicker on the focused one) and their standing order's target.
  for (const id of ui.sel) {
    const v = sim.ents.get(id); if (!v || !renderer.isShown(v)) continue;
    const [sx, sy] = at(v), r = Math.max(6, ts * 0.58);
    ctx.lineWidth = id === ui.focus ? 3 : 2; ctx.strokeStyle = id === ui.focus ? "#ffe27a" : "#fff";
    ring(ctx, sx, sy - (cam.oblique ? 0 : 0), r, cam.sinP);
    if (id === ui.focus) { ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,226,122,.35)"; ring(ctx, sx, sy, r + 4, cam.sinP); }
    if (v.order) orderFlag(ctx, cam, v.order, ts);
  }
  for (const r of sim.clr ? sim.clr.list : []) {                       // D58: the Clear area rectangles (everyone sees them: the player marked them)
    const [ax, ay, cw, th] = cam.rect(r.x0, r.y0, r.x1 + 1, r.y1 + 1, r.z);
    ctx.fillStyle = "rgba(110,200,90,.12)"; ctx.fillRect(ax, ay, cw, th);
    ctx.strokeStyle = "rgba(124,207,90,.9)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(ax, ay, cw, th); ctx.setLineDash([]);
    drawIcon(ctx, "cleararea", ax + 4, ay + 4, 14, "#7ccf5a");
  }

  // Transient markers where orders were given.
  const now = performance.now();
  ui.markers = ui.markers.filter(m => now - m.t < 1500);
  for (const m of ui.markers) {
    const k = (now - m.t) / 1500, [sx, sy] = cam.toScreen(m.x + 0.5, m.y + 0.5, m.z0);
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = "#7cc4ff"; ctx.lineWidth = 2;
    ring(ctx, sx, sy, ts * (0.4 + 0.8 * k) + 3, cam.sinP);
    ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    label(ctx, m.label, sx, sy - ts * 0.6 - k * 14 - 4, "#cfeaff");
    ctx.globalAlpha = 1;
  }

  if (ui.box) {
    const b = ui.box;
    ctx.fillStyle = "rgba(255,226,122,.10)"; ctx.strokeStyle = "rgba(255,226,122,.9)"; ctx.lineWidth = 1;
    ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.strokeRect(b.x0 + .5, b.y0 + .5, b.x1 - b.x0, b.y1 - b.y0);
  }
  if (ui.mode !== "select" && game.modes[ui.mode] && game.modes[ui.mode].draw) game.modes[ui.mode].draw(game, ctx);   // S4: build-mode ghosts etc.
}

/** A ring on the ground: a circle seen from above, an ellipse (foreshortened by sinP) in the angled view. */
function ring(ctx, x, y, r, sp = 1) { ctx.beginPath(); if (sp === 1) ctx.arc(x, y, r, 0, TAU); else ctx.ellipse(x, y, r, r * sp, 0, 0, TAU); ctx.stroke(); }
function label(ctx, text, x, y, color) {
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

function orderFlag(ctx, cam, o, ts) {
  const [sx, sy] = cam.toScreen(o.x + 0.5, o.y + 0.5, o.z);
  ctx.strokeStyle = "rgba(124,196,255,.8)"; ctx.lineWidth = 1.5;
  if (o.verb === "clear" || o.verb === "capture") { ctx.setLineDash([4, 3]); ring(ctx, sx, sy, 10 * ts, cam.sinP); ctx.setLineDash([]); }   // the area these two cover (radius 10: a den's monsters, the hoppers round a pen); the gather verbs have no area (D58)
  if (o.verb === "clear_area") return;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - ts * 0.9); ctx.lineTo(sx + ts * 0.6, sy - ts * 0.7); ctx.lineTo(sx, sy - ts * 0.5); ctx.stroke();
}

function zones(game, ctx, at, ts) {
  const { sim, cam } = game, z = sim.stock;
  if (z) {
    const [ax, ay, zw, zh] = cam.rect(z.x0, z.y0, z.x1 + 1, z.y1 + 1, z.z);
    ctx.fillStyle = "rgba(240,220,150,.14)"; ctx.fillRect(ax, ay, zw, zh);
    ctx.strokeStyle = "rgba(240,220,150,.7)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(ax, ay, zw, zh); ctx.setLineDash([]);
    ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    label(ctx, "STOCKPILE", ax + 3, ay - 2, "#f0dc96");
  }
  if (sim.zones) for (const q of sim.zones.list) {                       // S17: drawn zones, named by what they take
    const [ax, ay, zw, zh] = cam.rect(q.x0, q.y0, q.x1 + 1, q.y1 + 1, q.z !== undefined ? q.z : sim.stock && sim.stock.z);
    ctx.fillStyle = "rgba(240,220,150,.10)"; ctx.fillRect(ax, ay, zw, zh);
    ctx.strokeStyle = "rgba(240,220,150,.6)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(ax, ay, zw, zh); ctx.setLineDash([]);
    ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    label(ctx, "ZONE " + q.id + ": " + ({ all: "ANYTHING", food: "FOOD", mat: "MATERIALS" }[q.f || "all"]), ax + 3, ay - 2, "#f0dc96");
  }
  // beds -> owners, so "who sleeps where" is visible
  ctx.lineWidth = 1; ctx.strokeStyle = "rgba(143,208,106,.55)";
  for (const f of sim.ents.ofKind("furniture")) {
    if (f.f !== "bed" || !f.owner) continue;
    const o = sim.ents.get(f.owner); if (!o) continue;
    const [bx, by] = at(f), [ox, oy] = at(o);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ox, oy); ctx.stroke();
  }
}

/** Lines from each selected villager to what their job targets and holds reserved. */
function jobLines(game, ctx, at, sel, ts) {
  const { sim, cam } = game;
  for (const id of sel) {
    const v = sim.ents.get(id); if (!v || !v.job) continue;
    const [vx, vy] = at(v), col = (CLASS[v.job.c] || CLASS.leisure).color;
    const targets = new Set(v.job.res || []); if (v.job.tid) targets.add(v.job.tid);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([6, 3]);
    for (const tid of targets) {
      const e = sim.ents.get(tid); if (!e) continue;
      const [ex, ey] = at(e);
      ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.setLineDash([]); ctx.strokeRect(ex - ts * 0.45, ey - ts * 0.45 * cam.sinP, ts * 0.9, ts * 0.9 * cam.sinP); ctx.setLineDash([6, 3]);
    }
    ctx.setLineDash([]);
    const a = v.action; // walking destination
    if (a && a.type === "Move" && a.tx !== undefined) { const [gx, gy] = cam.toScreen(a.tx + 0.5, a.ty + 0.5, v.z); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(gx, gy, 3, 0, TAU); ctx.fill(); }
  }
}

/** Air temperature is the same outdoors; enclosed roofed rooms add their own warmth bonus (shaded, labelled). Each villager's ring shows how warm they are. */
function warmth(game, ctx, at) {
  const { sim, cam, renderer } = game, w = tempAt(sim.tick);
  const cold = w < COMFORT;
  ctx.fillStyle = cold ? "rgba(70,130,255," + Math.min(0.32, (COMFORT - w) * 0.9).toFixed(3) + ")" : "rgba(255,170,60," + Math.min(0.2, (w - COMFORT) * 0.35).toFixed(3) + ")";
  ctx.fillRect(0, 0, cam.vw, cam.vh);
  for (const r of sim.rooms.all()) drawRoom(game, ctx, r, "warm");
  for (const h of litHearths(sim)) {                       // a fire warms the open air around it, fading to nothing at FIRE_R cells
    if (!renderer.isShown(h)) continue;
    const [fx, fy] = at(h), rad = (FIRE_R + 1) * cam.zoom, g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, "rgba(255,150,40,.50)"); g.addColorStop(1, "rgba(255,150,40,0)");
    ctx.save(); ctx.translate(fx, fy); ctx.scale(1, cam.sinP); ctx.fillStyle = g; ctx.fillRect(-rad, -rad, rad * 2, rad * 2); ctx.restore();
    ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    label(ctx, "fire +" + FIRE_WARM[h.hl].toFixed(2), fx, fy - cam.zoom * 0.7, "#ffd9a0");
  }
  for (const f of flames(sim)) {
    if (!renderer.isShown(f)) continue;
    const [fx, fy] = at(f), rad = 4 * cam.zoom, g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, "rgba(255,120,40,.4)"); g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.save(); ctx.translate(fx, fy); ctx.scale(1, cam.sinP); ctx.fillStyle = g; ctx.fillRect(-rad, -rad, rad * 2, rad * 2); ctx.restore();
  }
  for (const v of sim.ents.ofKind("villager")) {
    if (!renderer.isShown(v)) continue;
    const [sx, sy] = at(v), t = v.warm;
    ctx.beginPath(); ctx.ellipse(sx, sy, Math.max(7, cam.zoom * 0.7), Math.max(7, cam.zoom * 0.7) * cam.sinP, 0, 0, TAU);
    ctx.strokeStyle = t < 0.3 ? "#6fe0ff" : t < 0.55 ? "#b9ecff" : "#ffcf70"; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
  label(ctx, "Warmth overlay: air " + w.toFixed(2) + (isNight(sim.tick) ? " (night)" : "") + ", comfort " + COMFORT.toFixed(2) + " - ring = how warm each villager is (cyan cold, gold warm); shaded rooms keep the heat in", 340, cam.vh - 58, "#dff3ff");
}

/** The provisional room: dashed amber outline, the gap marked with "door?". */
function drawProom(game, ctx) {
  const { cam, ui, sim } = game, pr = provisionalRoom(sim, ui.other.x, ui.other.y, ui.other.z);
  if (!pr) return;
  const ts = cam.zoom, pz = pr.z;
  ctx.fillStyle = "rgba(255,200,90,.16)";
  for (const [x, y] of pr.cells) { const [sx, sy, cw, th] = cam.rect(x, y, x + 1, y + 1, pz); ctx.fillRect(sx, sy, cw, th); }
  ctx.strokeStyle = "#ffb259"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
  for (const [x, y] of pr.gaps) {
    const [sx, sy, cw, th] = cam.rect(x, y, x + 1, y + 1, pz); ctx.strokeRect(sx + 1, sy + 1, cw - 2, th - 2);
    ctx.setLineDash([]); ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(pr.planned ? "door planned" : "needs a door", sx + ts / 2, sy - 2);
    ctx.fillStyle = "#ffe0a8"; ctx.fillText(pr.planned ? "door planned" : "needs a door", sx + ts / 2, sy - 2);
    ctx.setLineDash([5, 4]);
  }
  ctx.setLineDash([]);
}

/**
 * Underground light (S8, GDD §13.5; S12 generalised): while guiding a villager who stands under rock, everything beyond their own few cells
 * of light is dark, except where a torch, a lamp or a fire shines (the radius is the light's reach). Render-side only.
 */
const LIGHT_R = 6.5;
function drawLight(game, ctx) {
  const { sim, cam, renderer } = game, v = game.possessed ? game.possessed() : null;
  if (cam.oblique || !v || !renderer.isShown(v)) return;               // (the angled view lights the land itself)
  let under = false;
  for (let k = 1; k <= 4 && !under; k++) under = sim.world.isSolid(v.x, v.y, v.z + k);
  if (!under) return;
  const ts = cam.zoom, w = cam.vw, h = cam.vh;
  let m = renderer.darkCanvas;
  if (!m) m = renderer.darkCanvas = document.createElement("canvas");
  if (m.width !== w || m.height !== h) { m.width = w; m.height = h; }
  const mc = m.getContext("2d");
  mc.globalCompositeOperation = "source-over"; mc.clearRect(0, 0, w, h);
  mc.fillStyle = "rgba(3,5,12,.86)"; mc.fillRect(0, 0, w, h);
  mc.globalCompositeOperation = "destination-out";
  const hole = (x, y, r0, r1) => { const [sx, sy] = cam.toScreen(x + 0.5, y + 0.5), g = mc.createRadialGradient(sx, sy, ts * r0, sx, sy, ts * r1); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)"); mc.fillStyle = g; mc.fillRect(sx - ts * r1, sy - ts * r1, ts * r1 * 2, ts * r1 * 2); };
  hole(v.x, v.y, 2.4, LIGHT_R);
  for (const [lx, ly, lz, lr] of renderer.lights || []) if (Math.abs(lz - v.z) <= 1) hole(lx, ly, lr * 0.45, lr + 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(m, 0, 0, w, h, 0, 0, w * renderer.dpr, h * renderer.dpr);
  ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
}


/** UI_SPEC §3.4 / a9: a concern of level 2 or more that sits on screen gets an icon + severity pip above its place (off-screen ones are DOM edge pointers, ui/pointers.js). */
function concernMarkers(game, ctx) {
  const list = game.ui.concerns; if (!list || !list.length) return;
  for (const pl of concernPlaces(game)) {                                       // 6.20: the same projection and the same on/off decision (with hysteresis) as the edge pointers
    if (!pl.on) continue;
    const c = pl.c, sx = pl.sx, sy = pl.sy;
    const col = c.sev >= 3 ? TOKENS.danger : TOKENS.warm, y = sy - 22;                    // (no bob: a marker that moves is a marker you cannot click or read)
    ctx.fillStyle = TOKENS.s2; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, y, 12, 0, TAU); ctx.fill(); ctx.stroke();
    drawIcon(ctx, c.icon, sx - 7, y - 7, 14, TOKENS.tx);
    ctx.fillStyle = col;                                                       // the pip shape: triangle (2) or diamond (3)
    ctx.beginPath();
    if (c.sev >= 3) { ctx.moveTo(sx + 11, y - 14); ctx.lineTo(sx + 16, y - 9); ctx.lineTo(sx + 11, y - 4); ctx.lineTo(sx + 6, y - 9); } else { ctx.moveTo(sx + 11, y - 15); ctx.lineTo(sx + 16, y - 6); ctx.lineTo(sx + 6, y - 6); }
    ctx.closePath(); ctx.fill();
    if (pl.badge) { ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; const w = ctx.measureText(pl.badge).width + 8; ctx.fillStyle = TOKENS.s2; ctx.fillRect(sx - w / 2, y + 12, w, 14); ctx.fillStyle = TOKENS.tx; ctx.fillText(pl.badge, sx, y + 19); }      // "↓3": the place is on another level
  }
}
