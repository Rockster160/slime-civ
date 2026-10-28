// Debug renderer: top-down view of ONE z-level. For each column draw the
// topmost non-air cell at or below the viewed z, darker the deeper it is below
// that level. Plants and villagers are glyphs on top. Reads the sim, never
// writes it. Only tiles inside the camera view are touched.
import { DAY, DUR_DAY } from "../sim/clock.js";
import { LIFE_DAYS } from "../sim/villager.js";
import { D, M, MAT, World, CellReader } from "../sim/world.js";
import { chunkKey } from "../sim/cellkey.js";
import { seenAt, exploredAt } from "../sim/seen.js";
import { ITEMS } from "../sim/items.js";
import { isNight } from "../sim/season.js";
import { cropStage, CROP } from "../sim/farm.js";
import { BIOMES, HIGHLAND, MARSH, biomeAt } from "../sim/biome.js";
import { lightSources, inLight } from "../sim/light.js";
import { airMap, gasCells } from "../sim/underground.js";

const UNKNOWN = "#0f1218";
const SHADES = 12;                          // depth levels before the colour stops darkening
const fill = MAT.map(m => {
  const row = [];
  for (let d = 0; d < SHADES; d++) {
    const k = Math.max(0.3, 1 - 0.07 * d);
    row.push(`rgb(${Math.round(m.color[0] * k)},${Math.round(m.color[1] * k)},${Math.round(m.color[2] * k)})`);
  }
  return row;
});

// S16: unexplored land is drawn from the pure generator, dimmed, so the player sees the world's shape and wants to go there. The renderer keeps its OWN bounded
// cache of generated chunks (RENDER_CACHE, least recently used goes first) and reads the sim's resident chunks as they are; it never makes a chunk resident,
// never touches the sim's caches, and the sim never depends on what it has drawn.
export const RENDER_CACHE = 2400;            // chunks (about 13 KB each: 31 MB). A full-screen view at the farthest zoom is about 2000.
const dimFill = MAT.map(m => {
  const row = [];
  for (let d = 0; d < SHADES; d++) {
    const k = Math.max(0.3, 1 - 0.07 * d) * 0.62;
    row.push(`rgb(${Math.round(m.color[0] * k * 0.8 + 14)},${Math.round(m.color[1] * k * 0.8 + 18)},${Math.round(m.color[2] * k * 0.85 + 30)})`);
  }
  return row;
});
export class RenderView extends CellReader {
  constructor(world) { super(); this.world = world; this.lru = new Map(); this._cx = 1e9; this._cy = 1e9; this._c = null; this.made = 0; }
  reset() { this._cx = 1e9; this._c = null; }
  _get(cx, cy) {
    if (cx === this._cx && cy === this._cy) return this._c;
    const k = chunkKey(cx, cy);
    let c = this.world.chunks.get(k);                         // resident: authoritative, shared
    if (!c) {
      c = this.lru.get(k);
      if (c) { this.lru.delete(k); this.lru.set(k, c); }
      else {
        c = this.world.gen(cx, cy); this.made++;
        this.lru.set(k, c);
        if (this.lru.size > RENDER_CACHE) this.lru.delete(this.lru.keys().next().value);
      }
    }
    this._cx = cx; this._cy = cy; this._c = c;
    return c;
  }
}

export class Renderer {
  constructor(canvas, cam) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.cam = cam;
    this.z = D - 1;                         // viewed level; the top level = surface view (nothing above is cut away)
    this.tops = new Int16Array(0);          // per-frame: topmost visible z per column of the viewport (S16: sized to the view, origin tx0,ty0, width tw)
    this.tx0 = 0; this.ty0 = 0; this.tw = 0; this.th = 0; this.topsOk = false;
    this.view = null;                       // S16: reads the world through the renderer's own chunk cache
    this.access = { calm: false, cb: false, contrast: false };      // S12 accessibility (ui/access.js sets it): reduced flashing, colour-blind marks (letters and patterns beside colour), high contrast
  }

  setZ(z) { this.z = Math.max(0, Math.min(D - 1, z)); if (this.peek && this.peek.z !== this.z) this.peek = null; }
  /** UI_SPEC §12.4: a cell range drawn as seen for VIEWING only (a jump to something underground); the sim's fog is untouched. */
  peek = null;

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr); this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px";
    this.dpr = dpr;
    this.cam.resize(w, h);
  }

  /** Is this entity standing on the visible top of its column (so it is drawn, and can be picked)? */
  isShown(e) {
    const v = this.vis;
    return !!v && e.x >= v.x0 && e.x <= v.x1 && e.y >= v.y0 && e.y <= v.y1 && e.z <= this.z && this.topAt(e.x, e.y) === e.z - 1;
  }

  /** z of the topmost visible cell of a column (-1: none). Uses the frame's table when the column is in it, else asks the view. */
  topAt(x, y) {
    if (this.topsOk && x >= this.tx0 && y >= this.ty0 && x < this.tx0 + this.tw && y < this.ty0 + this.th) return this.tops[(y - this.ty0) * this.tw + (x - this.tx0)];
    return this.view ? this.view.topZ(x, y, this.z) : -1;
  }

  /** opts.zones: draw the stockpile zone (an overlay, off by default). */
  draw(sim, opts = {}) {
    const { ctx, cam, z } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(0, 0, cam.vw, cam.vh);
    const v = cam.visible();
    this.vis = v;
    const ts = cam.zoom, real = sim.world, seen = sim.seen;
    if (!this.view || this.view.world !== real) this.view = new RenderView(real);
    const world = this.view;
    world.reset();
    this.sim = sim;
    if (v.x1 < v.x0 || v.y1 < v.y0) return;
    const A = this.access, lights = lightSources(sim), bad = sim.ug.cr.length || gasCells(sim).length ? airMap(sim).bad : null;
    const cracked = new Set(sim.ug.cr.map(e => e[0]));
    this.lights = lights;
    const st = ts < 3 ? 2 : 1;                                   // zoomed far out: one square per 2x2 cells (the table of tops is skipped then)
    this.tx0 = v.x0; this.ty0 = v.y0; this.tw = v.x1 - v.x0 + 1; this.th = v.y1 - v.y0 + 1;
    if (this.tops.length < this.tw * this.th) this.tops = new Int16Array(this.tw * this.th);
    this.topsOk = st === 1;
    let lk = -1, sa = null, ce = null;

    for (let y = v.y0 - (((v.y0 % st) + st) % st); y <= v.y1; y += st) {
      for (let x = v.x0 - (((v.x0 % st) + st) % st); x <= v.x1; x += st) {
        const top = world.topZ(x, y, z);
        if (st === 1 && x >= v.x0 && y >= v.y0) this.tops[(y - v.y0) * this.tw + (x - v.x0)] = top;
        if (top < 0) continue;
        const m = world.mat(x, y, top);
        // Surface view (top level): shade by height so hills read lighter and valleys darker, 1 shade per 2 levels.
        // A lower level is a slice: shade by depth below it, as before.
        let depth = z === D - 1 ? Math.max(0, (D - 3 - top) >> 1) : z - top;
        if (m === M.WATER) {                // deeper water reads darker: count water cells down to the bed
          let bed = top; while (bed > 0 && world.mat(x, y, bed - 1) === M.WATER) bed--;
          depth += Math.min(3, top - bed);
        }
        const [sx, sy] = cam.toScreen(x, y), px = Math.floor(sx), py = Math.floor(sy), sz = Math.ceil(ts * st) + 1;
        const k = chunkKey(x >> 4, y >> 4);
        if (k !== lk) { lk = k; sa = seen.b.get(k); ce = seen.cs.get(k); }
        const col = ((y & 15) << 4) | (x & 15);
        if (!(sa && sa[(top << 8) | col]) && !(this.peek && this.peek.z === z && Math.abs(x - this.peek.x) <= this.peek.r && Math.abs(y - this.peek.y) <= this.peek.r)) {
          if (z === D - 1 && !(ce && ce[col])) {              // S16: land nobody has been near: dim, but there to see (the world's shape); no creatures, no marks
            ctx.fillStyle = dimFill[m][Math.min(SHADES - 1, depth)]; ctx.fillRect(px, py, sz, sz);
            const bi = world.biomeAt(x, y);
            if (bi && m !== M.WATER) { const t = BIOMES[bi].tint; ctx.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${t[3] * 0.7})`; ctx.fillRect(px, py, sz, sz); }
            continue;
          }
          ctx.fillStyle = UNKNOWN; ctx.fillRect(px, py, sz, sz);     // fog (§13.8): rock nobody has stood next to is shown as dark unknown
          continue;
        }
        ctx.fillStyle = fill[m][Math.min(SHADES - 1, depth)];
        ctx.fillRect(px, py, sz, sz);
        const bi = world.biomeAt(x, y);
        if (bi && m !== M.WATER && top >= world.hsAt(x, y)) {                  // S12: the biome tints the ground it covers (a letter-free pattern for the colour-blind below)
          const t = BIOMES[bi].tint; ctx.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${t[3]})`; ctx.fillRect(px, py, sz, sz);
          if (A.cb && ts >= 8) this.biomeMark(bi, px, py, ts);
        }
        if (top < z && z < D - 1 && world.isSolid(x, y, z + 1) && world.mat(x, y, z) === M.AIR) {      // open space under rock: a tunnel or cave floor
          ctx.fillStyle = "rgba(6,12,34,.42)"; ctx.fillRect(px, py, sz, sz);
          if (!inLight(lights, x, y, z)) { ctx.fillStyle = "rgba(2,4,12,.34)"; ctx.fillRect(px, py, sz, sz); }     // S12: beyond any torch it is dark
          const ci = World.idx(x, y, z);
          if (bad && bad.has(ci) && seenAt(seen, x, y, z)) this.foul(px, py, sz, ts);
          if (cracked.has(ci)) this.cracks(px, py, ts, ci);
        }
        if (ts >= 5 && (m === M.FLINT || m === M.MALACHITE || m === M.CLAY || m === M.IRONORE || m === M.COAL || m === M.SALT || m === M.PEAT || m === M.HERB)) {           // ore flecks, so a seam reads against plain rock
          ctx.fillStyle = m === M.MALACHITE ? "rgba(214,255,226,.55)" : m === M.FLINT ? "rgba(196,206,228,.5)" : m === M.IRONORE ? "rgba(255,170,130,.6)" : m === M.COAL ? "rgba(120,120,140,.6)" : m === M.SALT ? "rgba(255,255,255,.7)" : m === M.PEAT ? "rgba(40,24,14,.55)" : m === M.HERB ? "rgba(200,240,120,.6)" : "rgba(255,214,170,.4)";
          ctx.fillRect(px + ts * 0.3, py + ts * 0.3, ts * 0.4, ts * 0.4);
          if (A.cb && ts >= 9) {                               // a letter beside the colour: F flint, M malachite, c clay, I iron, K coal
            ctx.font = `bold ${Math.floor(ts * 0.55)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillStyle = "rgba(0,0,0,.9)"; ctx.fillText(ORE_LETTER[m], px + ts / 2 + 1, py + ts / 2 + 1); ctx.fillStyle = "#fff"; ctx.fillText(ORE_LETTER[m], px + ts / 2, py + ts / 2);
          }
        } else if (ts >= 7 && (m === M.SUPPORT || m === M.RUBBLE)) {             // S12: a post and cap; a heap of broken stone
          ctx.strokeStyle = m === M.SUPPORT ? "#f0d0a0" : "rgba(30,24,18,.7)"; ctx.lineWidth = Math.max(1, ts * 0.1); ctx.beginPath();
          if (m === M.SUPPORT) { ctx.moveTo(px + ts * 0.5, py + ts * 0.15); ctx.lineTo(px + ts * 0.5, py + ts * 0.85); ctx.moveTo(px + ts * 0.15, py + ts * 0.25); ctx.lineTo(px + ts * 0.85, py + ts * 0.25); }
          else { ctx.moveTo(px + ts * 0.2, py + ts * 0.7); ctx.lineTo(px + ts * 0.4, py + ts * 0.4); ctx.lineTo(px + ts * 0.6, py + ts * 0.75); ctx.lineTo(px + ts * 0.8, py + ts * 0.35); }
          ctx.stroke();
        }
      }
    }

    // Stockpile zone under everything that stands on it.
    if (sim.stock && opts.zones) {
      const z0 = sim.stock, [ax, ay] = cam.toScreen(z0.x0, z0.y0), [bx, by] = cam.toScreen(z0.x1 + 1, z0.y1 + 1);
      ctx.fillStyle = "rgba(240,220,150,.16)"; ctx.fillRect(ax, ay, bx - ax, by - ay);
      ctx.strokeStyle = "rgba(240,220,150,.65)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.strokeRect(ax, ay, bx - ax, by - ay); ctx.setLineDash([]);
    }
    if (sim.zones && opts.zones) for (const q of sim.zones.list) {            // S17: the zones the player drew; the colour says what each takes
      const [ax, ay] = cam.toScreen(q.x0, q.y0), [bx, by] = cam.toScreen(q.x1 + 1, q.y1 + 1), f = q.f || "all";
      ctx.fillStyle = f === "food" ? "rgba(220,120,120,.17)" : f === "mat" ? "rgba(140,170,230,.17)" : "rgba(240,220,150,.16)"; ctx.fillRect(ax, ay, bx - ax, by - ay);
      ctx.strokeStyle = f === "food" ? "rgba(230,130,130,.75)" : f === "mat" ? "rgba(150,180,240,.75)" : "rgba(240,220,150,.65)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(ax, ay, bx - ax, by - ay); ctx.setLineDash([]);
    }

    // Entities: shown only when standing on the visible top of their column. Ground things first, villagers last.
    const shown = (e) => this.isShown(e);
    for (const e of sim.ents.ofKind("plot")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.plot(e, sx, sy, ts, sim.tick); }
    if (sim.farm.cellar && opts.zones !== false) this.cellar(sim.farm.cellar, ts);
    for (const pn of sim.farm.pens) if (this.topAt(pn.x0, pn.y0) === pn.z - 1) this.pen(pn, ts);
    for (const e of sim.ents.ofKind("plant")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.plant(e, sx, sy, ts); }
    for (const e of sim.ents.ofKind("grave")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.grave(e, sx, sy, ts); }
    for (const e of sim.ents.ofKind("flame")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.flame(e, sx, sy, ts); }
    for (const e of sim.ents.ofKind("furniture")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.furniture(e, sx, sy, ts); }
    for (const e of sim.ents.ofKind("wagon")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.wagon(e, sx, sy, ts); }
    for (const e of sim.ents.ofKind("site")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.site(e, sx, sy, ts); }
    for (const e of sim.ents.ofKind("item")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.item(e, sx, sy, ts); }
    for (const e of sim.ents.ofKind("fauna")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.fauna(e, sx, sy, ts, sim); }
    const night = isNight(sim.tick);
    for (const e of sim.ents.ofKind("villager")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.villager(e, sx, sy, ts, sim); }
    this.night = night;
    if (night) { ctx.fillStyle = "rgba(10,16,48,.28)"; ctx.fillRect(0, 0, cam.vw, cam.vh); }
    // Firelight: a warm glow round every lit hearth and burning thing, strongest at night (drawn over the night tint).
    for (const e of sim.ents.ofKind("flame")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.glow(sx, sy, ts * (e.src === "tree" ? 5 : 2.5), night); }
    for (const [lx, ly, lz, lr] of lights) if (lr >= 5 && lz <= z && lz >= z - 1 && lx >= v.x0 - 8 && lx <= v.x1 + 8 && ly >= v.y0 - 8 && ly <= v.y1 + 8) { const [sx, sy] = cam.toScreen(lx + 0.5, ly + 0.5); this.torchGlow(sx, sy, ts * lr); }
    for (const e of sim.ents.ofKind("furniture")) if (((e.f === "hearth" && e.lit) || ((e.f === "kiln" || e.f === "mound" || e.f === "forge") && e.bn > 0)) && shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.glow(sx, sy, ts * 4.5, night); }

  }

  plant(e, sx, sy, ts) {
    const ctx = this.ctx;
    ctx.beginPath();
    if (e.species === "sapling") {
      ctx.strokeStyle = "#3f8a3a"; ctx.lineWidth = Math.max(1, ts * 0.08);
      ctx.moveTo(sx, sy + ts * 0.2); ctx.lineTo(sx, sy - ts * 0.15); ctx.moveTo(sx - ts * 0.12, sy - ts * 0.05); ctx.lineTo(sx, sy - ts * 0.2); ctx.lineTo(sx + ts * 0.12, sy - ts * 0.05);
      ctx.stroke();
    } else if (e.species === "stump") {         // a charred stump: dark disc with a pale ring of cut wood
      ctx.fillStyle = e.fl ? "#6b5238" : "#2a2018"; ctx.arc(sx, sy, ts * 0.3, 0, 6.2832); ctx.fill();      // a felled stump is pale wood, a burnt one is charred
      ctx.strokeStyle = e.fl ? "#c9ab7a" : "#5a4a3a"; ctx.lineWidth = Math.max(1, ts * 0.06); ctx.beginPath(); ctx.arc(sx, sy, ts * 0.2, 0, 6.2832); ctx.stroke();
    } else if (e.species === "tree" && !e.burn && this.sim && this.sim.world.biomeAt(e.x, e.y) === HIGHLAND) {     // S12: a pine: a dark triangle
      ctx.fillStyle = "#17492a"; ctx.moveTo(sx, sy - ts * 0.5); ctx.lineTo(sx + ts * 0.4, sy + ts * 0.4); ctx.lineTo(sx - ts * 0.4, sy + ts * 0.4); ctx.closePath(); ctx.fill();
      if (ts >= 8) { ctx.fillStyle = "#2f7a46"; ctx.beginPath(); ctx.moveTo(sx, sy - ts * 0.3); ctx.lineTo(sx + ts * 0.22, sy + ts * 0.1); ctx.lineTo(sx - ts * 0.22, sy + ts * 0.1); ctx.closePath(); ctx.fill(); }
    } else if (e.species === "tree") {
      ctx.fillStyle = e.burn ? "#3b2a1c" : "#1f5a28"; ctx.arc(sx, sy, ts * 0.46, 0, 6.2832); ctx.fill();
      if (ts >= 6) { ctx.fillStyle = "#6b4a2a"; ctx.fillRect(sx - ts * 0.08, sy - ts * 0.08, ts * 0.16, ts * 0.16); }
    } else if (e.species === "berry") {
      const young = e.gr !== undefined && e.gr < 4 ? 0.16 : e.gr !== undefined && e.gr < 9 ? 0.24 : 0.32;       // S10: a seedling is a small bush, a young one a little larger
      ctx.fillStyle = e.gr !== undefined && e.bt !== undefined && this.sim && (this.sim.tick - e.bt) / DAY > 48 ? "#6f7d3a" : "#3f7d3a"; ctx.arc(sx, sy, ts * young, 0, 6.2832); ctx.fill();       // an old bush yellows
      if (ts >= 5 && e.yield > 0) {
        ctx.fillStyle = "#d1405f";
        for (const [dx, dy] of [[-0.12, -0.08], [0.14, 0], [-0.02, 0.15], [0.05, -0.18]].slice(0, e.yield)) {
          ctx.beginPath(); ctx.arc(sx + dx * ts, sy + dy * ts, Math.max(1, ts * 0.07), 0, 6.2832); ctx.fill();
        }
      }
    } else if (ts >= 5 && e.yield > 0) {    // tuft (cut tufts are drawn as bare ground)
      ctx.strokeStyle = "#b5e07a"; ctx.lineWidth = Math.max(1, ts * 0.07);
      ctx.moveTo(sx - ts * 0.15, sy + ts * 0.15); ctx.lineTo(sx - ts * 0.2, sy - ts * 0.15);
      ctx.moveTo(sx, sy + ts * 0.15); ctx.lineTo(sx, sy - ts * 0.22);
      ctx.moveTo(sx + ts * 0.15, sy + ts * 0.15); ctx.lineTo(sx + ts * 0.2, sy - ts * 0.15);
      ctx.stroke();
    }
  }

  /** S10: one field cell. Raw ground is a faint outline; tilled soil is dark furrows; a crop grows through four stages (sprout, leafy, flowering, ripe). */
  plot(e, sx, sy, ts, tick) {
    const ctx = this.ctx, h = ts * 0.46;
    if (!e.tl) { ctx.strokeStyle = "rgba(140,100,60,.7)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.strokeRect(sx - h, sy - h, h * 2, h * 2); ctx.setLineDash([]); return; }
    ctx.fillStyle = e.wt > tick ? "#4a3322" : "#6b4a2e"; ctx.fillRect(sx - h, sy - h, h * 2, h * 2);               // wet soil is darker
    if (ts >= 6) { ctx.strokeStyle = "rgba(30,18,8,.45)"; ctx.lineWidth = 1; ctx.beginPath(); for (const k of [-0.5, 0, 0.5]) { ctx.moveTo(sx - h, sy + h * k); ctx.lineTo(sx + h, sy + h * k); } ctx.stroke(); }
    if (!e.cr) return;
    const st = cropStage(e), tub = e.cr === "tuber";
    ctx.strokeStyle = tub ? "#7fae4a" : "#4f9a3c"; ctx.lineWidth = Math.max(1, ts * 0.07);
    ctx.beginPath();
    if (st === 0) { ctx.moveTo(sx, sy + h * 0.4); ctx.lineTo(sx, sy - h * 0.1); }
    else { const up = st === 1 ? 0.45 : 0.7; for (const k of [-0.45, 0, 0.45]) { ctx.moveTo(sx + k * h, sy + h * 0.5); ctx.lineTo(sx + k * h * 1.2, sy - h * up); } }
    ctx.stroke();
    if (st === 2) { ctx.fillStyle = "#f2e27a"; for (const k of [-0.45, 0.45]) { ctx.beginPath(); ctx.arc(sx + k * h * 1.2, sy - h * 0.7, Math.max(1, ts * 0.07), 0, 6.2832); ctx.fill(); } }
    if (st === 3) {
      ctx.fillStyle = tub ? "#d9b98a" : "#d1405f";
      for (const [dx, dy] of [[-0.45, -0.3], [0.1, -0.5], [0.5, -0.1], [-0.1, 0.1]]) { ctx.beginPath(); ctx.arc(sx + dx * h, sy + dy * h, Math.max(1.2, ts * 0.1), 0, 6.2832); ctx.fill(); }
    }
  }

  /** S10: a pen. A fenced pen is a ring of posts and rails with a gap for the gate; a pen still to be staked is a dashed outline that fills as sticks go in. */
  pen(pn, ts) {
    const ctx = this.ctx, cam = this.cam, [ax, ay] = cam.toScreen(pn.x0, pn.y0), [bx, by] = cam.toScreen(pn.x1 + 1, pn.y1 + 1);
    ctx.lineWidth = Math.max(1.5, ts * 0.1);
    if (!pn.built) {
      ctx.strokeStyle = "rgba(200,160,100," + (0.35 + 0.5 * pn.got / pn.need).toFixed(2) + ")"; ctx.setLineDash([4, 4]); ctx.strokeRect(ax, ay, bx - ax, by - ay); ctx.setLineDash([]);
      return;
    }
    ctx.strokeStyle = "#a67c52";
    const [gx0] = cam.toScreen(pn.g[0], 0), [gx1] = cam.toScreen(pn.g[0] + 1, 0);
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, ay); ctx.lineTo(bx, by); ctx.lineTo(gx1, by);       // the south side stops at the gate
    ctx.moveTo(gx0, by); ctx.lineTo(ax, by); ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.fillStyle = "#6b4a2a";
    for (let x = pn.x0; x <= pn.x1 + 1; x++) for (const y of [pn.y0, pn.y1 + 1]) { const [px, py] = cam.toScreen(x, y); ctx.fillRect(px - 1.5, py - 1.5, 3, 3); }
    ctx.strokeStyle = "#e8c070"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx0 + 2, by); ctx.lineTo(gx1 - 2, by); ctx.stroke();      // the gate
  }

  /** S10: the cold cellar zone, drawn while its level is the one in view. */
  cellar(cz, ts) {
    if (this.topAt(cz.x0, cz.y0) !== cz.z - 1) return;
    const ctx = this.ctx, [ax, ay] = this.cam.toScreen(cz.x0, cz.y0), [bx, by] = this.cam.toScreen(cz.x1 + 1, cz.y1 + 1);
    ctx.fillStyle = "rgba(150,200,255,.14)"; ctx.fillRect(ax, ay, bx - ax, by - ay);
    ctx.strokeStyle = "rgba(150,200,255,.7)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(ax, ay, bx - ax, by - ay); ctx.setLineDash([]);
    void ts;
  }

  furniture(e, sx, sy, ts) {
    const ctx = this.ctx, h = ts * 0.42;
    if (e.f === "door") {                   // a wooden door: plank rectangle with a handle
      ctx.fillStyle = "#8a5a2c"; ctx.fillRect(sx - h, sy - h * 0.9, h * 2, h * 1.8);
      ctx.strokeStyle = "#3d2810"; ctx.lineWidth = 1; ctx.strokeRect(sx - h, sy - h * 0.9, h * 2, h * 1.8);
      ctx.fillStyle = "#e8c070"; ctx.fillRect(sx + h * 0.4, sy, Math.max(1.5, ts * 0.08), Math.max(1.5, ts * 0.08));
    } else if (e.f === "bed") {             // leaf bed: a green mat with a darker rim
      ctx.fillStyle = "#4f9a3c"; ctx.fillRect(sx - h, sy - h * 0.7, h * 2, h * 1.4);
      ctx.strokeStyle = "#2c5a22"; ctx.lineWidth = 1; ctx.strokeRect(sx - h, sy - h * 0.7, h * 2, h * 1.4);
      if (ts >= 8) { ctx.strokeStyle = "#8fd06a"; ctx.beginPath(); ctx.moveTo(sx - h * 0.6, sy); ctx.lineTo(sx + h * 0.6, sy); ctx.stroke(); }
    } else if (e.f === "hearth") {          // a fire ring: a circle of stones round the fire (or cold ash)
      const r = ts * 0.4;
      ctx.fillStyle = e.lit ? "#3a2a1c" : "#5a5650"; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "#9a9ea6";
      for (let i = 0; i < 8; i++) { const a = i * 0.7854; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * r, sy + Math.sin(a) * r, Math.max(1.5, ts * 0.09), 0, 6.2832); ctx.fill(); }
      if (e.lit) this.fire(sx, sy, ts, false);
    } else if (e.f === "kiln") {            // S7b: a clay-lined pit: a terracotta rim round a dark pit, fire while it burns, a heap of loaded material
      const r = ts * 0.44;
      ctx.fillStyle = "#b2603e"; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.2832); ctx.fill();
      ctx.fillStyle = e.bn > 0 ? "#2a1608" : "#4a2a1c"; ctx.beginPath(); ctx.arc(sx, sy, r * 0.64, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = "#7a3a22"; ctx.lineWidth = Math.max(1, ts * 0.06); ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.2832); ctx.stroke();
      if (e.lid) { ctx.fillStyle = "#c97a52"; ctx.beginPath(); ctx.arc(sx, sy, r * 0.7, 0, 6.2832); ctx.fill(); if (e.lid === 2) { ctx.fillStyle = "#20120a"; ctx.beginPath(); ctx.arc(sx, sy, r * 0.16, 0, 6.2832); ctx.fill(); } }
      else if (e.bn <= 0 && e.inv && Object.keys(e.inv).length) { ctx.fillStyle = "#d9b98a"; ctx.beginPath(); ctx.arc(sx, sy, r * 0.36, 0, 6.2832); ctx.fill(); }
      if (e.bn > 0) this.fire(sx, sy, ts, false);
    } else if (e.f === "forge") {           // S9: a brick furnace: a square of brick with a lid and a flue, white-hot while it burns
      ctx.fillStyle = "#a84a34"; ctx.fillRect(sx - h * 0.95, sy - h * 0.95, h * 1.9, h * 1.9);
      ctx.strokeStyle = "#5a2418"; ctx.lineWidth = Math.max(1, ts * 0.05); ctx.strokeRect(sx - h * 0.95, sy - h * 0.95, h * 1.9, h * 1.9);
      ctx.beginPath(); ctx.moveTo(sx - h * 0.95, sy); ctx.lineTo(sx + h * 0.95, sy); ctx.moveTo(sx, sy - h * 0.95); ctx.lineTo(sx, sy + h * 0.95); ctx.stroke();
      ctx.fillStyle = e.bn > 0 ? "#fff0c0" : "#20120a"; ctx.beginPath(); ctx.arc(sx, sy, h * 0.3, 0, 6.2832); ctx.fill();
      if (e.bn > 0) this.fire(sx, sy, ts, true);
    } else if (e.f === "smoker") {          // S9: a rack under a cover of boughs; a haze of smoke while a batch hangs
      ctx.fillStyle = "#6b8a4a"; ctx.fillRect(sx - h, sy - h * 0.9, h * 2, h * 0.7);
      ctx.strokeStyle = "#3a5226"; ctx.lineWidth = 1; ctx.strokeRect(sx - h, sy - h * 0.9, h * 2, h * 0.7);
      ctx.strokeStyle = "#a67c52"; ctx.lineWidth = Math.max(1.5, ts * 0.09); ctx.beginPath(); ctx.moveTo(sx - h, sy + h * 0.8); ctx.lineTo(sx - h, sy - h * 0.2); ctx.moveTo(sx + h, sy + h * 0.8); ctx.lineTo(sx + h, sy - h * 0.2); ctx.moveTo(sx - h, sy + h * 0.1); ctx.lineTo(sx + h, sy + h * 0.1); ctx.stroke();
      if (e.rcp && e.inv && Object.keys(e.inv).length) { ctx.fillStyle = e.bn > 0 ? "#6a3328" : "#c0605a"; for (let i = -1; i <= 1; i++) ctx.fillRect(sx + i * h * 0.55 - 1.5, sy + h * 0.1, 3, 5); }
      if (e.bn > 0) { const t = (performance.now() / 1800) % 1; for (let i = 0; i < 2; i++) { const k = (t + i / 2) % 1; ctx.fillStyle = "rgba(170,170,180," + (0.4 * (1 - k)).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(sx + Math.sin(k * 5 + i) * ts * 0.1, sy - h - k * ts * 0.9, ts * (0.1 + 0.12 * k), 0, 6.2832); ctx.fill(); } }
    } else if (e.f === "mound") {           // an earth-covered pit: a dome of soil, smoke while it smoulders
      const r = ts * 0.46;
      ctx.fillStyle = "#6e5236"; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "#8a6a45"; ctx.beginPath(); ctx.arc(sx - r * 0.15, sy - r * 0.2, r * 0.6, 0, 6.2832); ctx.fill();
      if (e.bn > 0) {
        const t = (performance.now() / 1800) % 1;
        for (let i = 0; i < 3; i++) { const k = (t + i / 3) % 1; ctx.fillStyle = "rgba(170,170,180," + (0.45 * (1 - k)).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(sx + Math.sin(k * 5 + i) * ts * 0.1, sy - r * 0.4 - k * ts * 1.1, ts * (0.1 + 0.14 * k), 0, 6.2832); ctx.fill(); }
      }
    } else if (e.f === "workbench") {       // a bench: a plank top on two trestles with a tool mark
      ctx.fillStyle = "#6b4a2a"; ctx.fillRect(sx - h, sy - h * 0.55, h * 2, h * 1.1);
      ctx.fillStyle = "#a67c52"; ctx.fillRect(sx - h, sy - h * 0.75, h * 2, h * 0.5);
      ctx.strokeStyle = "#3d2810"; ctx.lineWidth = 1; ctx.strokeRect(sx - h, sy - h * 0.75, h * 2, h * 1.3);
      if (e.rcp && e.inv && Object.keys(e.inv).length) { ctx.fillStyle = "#d98a4a"; ctx.fillRect(sx - h * 0.4, sy - h * 0.6, h * 0.8, h * 0.3); }
    } else if (e.f === "bellows") {         // a leather bag with a clay nozzle
      ctx.fillStyle = "#8a5a3a"; ctx.beginPath(); ctx.moveTo(sx - h, sy - h * 0.5); ctx.lineTo(sx + h * 0.3, sy - h * 0.25); ctx.lineTo(sx + h * 0.3, sy + h * 0.25); ctx.lineTo(sx - h, sy + h * 0.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#3d2810"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#b8613f"; ctx.fillRect(sx + h * 0.3, sy - h * 0.12, h * 0.7, h * 0.24);
    } else if (e.f === "torch" || e.f === "lamp") {     // S12: a stake with a flame; a lamp is a copper housing with a steady light
      if (e.f === "torch") {
        ctx.strokeStyle = "#7a5430"; ctx.lineWidth = Math.max(1.5, ts * 0.1); ctx.beginPath(); ctx.moveTo(sx, sy + h * 0.9); ctx.lineTo(sx, sy - h * 0.1); ctx.stroke();
        this.fire(sx, sy - h * 0.5, ts * 0.8, false);
      } else {
        ctx.fillStyle = "#c98a4a"; ctx.beginPath(); ctx.arc(sx, sy, h * 0.7, 0, 6.2832); ctx.fill(); ctx.strokeStyle = "#5a3a1a"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#fff0b0"; ctx.beginPath(); ctx.arc(sx, sy, h * 0.3, 0, 6.2832); ctx.fill();
      }
    } else if (e.f === "shelf") {           // S15: two uprights and three planks, a pot on the middle one
      ctx.strokeStyle = "#7a5430"; ctx.lineWidth = Math.max(1.5, ts * 0.1);
      ctx.beginPath(); ctx.moveTo(sx - h, sy + h * 0.8); ctx.lineTo(sx - h, sy - h * 0.8); ctx.moveTo(sx + h, sy + h * 0.8); ctx.lineTo(sx + h, sy - h * 0.8);
      for (const o of [-0.7, -0.05, 0.6]) { ctx.moveTo(sx - h, sy + h * o); ctx.lineTo(sx + h, sy + h * o); } ctx.stroke();
      ctx.fillStyle = "#b8613f"; ctx.fillRect(sx - h * 0.5, sy - h * 0.5, h * 0.4, h * 0.4); ctx.fillStyle = "#c9a85c"; ctx.fillRect(sx + h * 0.1, sy + h * 0.1, h * 0.5, h * 0.4);
    } else if (e.f === "vent") {            // a lined shaft: a dark mouth in a square of sticks, with air lines
      ctx.fillStyle = "#1a1410"; ctx.fillRect(sx - h * 0.8, sy - h * 0.8, h * 1.6, h * 1.6);
      ctx.strokeStyle = "#a67c52"; ctx.lineWidth = Math.max(1.5, ts * 0.1); ctx.strokeRect(sx - h * 0.8, sy - h * 0.8, h * 1.6, h * 1.6);
      ctx.strokeStyle = "rgba(190,230,255,.8)"; ctx.lineWidth = 1; ctx.beginPath(); for (const o of [-0.35, 0.05, 0.45]) { ctx.moveTo(sx + h * o, sy + h * 0.5); ctx.quadraticCurveTo(sx + h * (o + 0.25), sy, sx + h * o, sy - h * 0.5); } ctx.stroke();
    } else if (e.f === "waterjar") {        // a round-bellied jar, filled to the water line
      ctx.fillStyle = "#a8552f"; ctx.beginPath(); ctx.ellipse(sx, sy + h * 0.1, h * 0.8, h * 0.9, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "#e0b090"; ctx.fillRect(sx - h * 0.35, sy - h * 0.95, h * 0.7, h * 0.3);
      if (e.fill > 0) { ctx.fillStyle = "#4aa8ff"; ctx.beginPath(); ctx.ellipse(sx, sy + h * 0.25, h * 0.55, h * 0.4 * Math.min(1, e.fill / 40 + 0.2), 0, 0, 6.2832); ctx.fill(); }
    } else {                                // drying rack: two posts and rails, berries when it is being used
      ctx.strokeStyle = "#a67c52"; ctx.lineWidth = Math.max(1.5, ts * 0.09);
      ctx.beginPath(); ctx.moveTo(sx - h, sy + h * 0.8); ctx.lineTo(sx - h, sy - h * 0.8); ctx.moveTo(sx + h, sy + h * 0.8); ctx.lineTo(sx + h, sy - h * 0.8);
      ctx.moveTo(sx - h, sy - h * 0.4); ctx.lineTo(sx + h, sy - h * 0.4); ctx.moveTo(sx - h, sy + h * 0.1); ctx.lineTo(sx + h, sy + h * 0.1); ctx.stroke();
      if (e.rv) { ctx.fillStyle = "#8c4a3a"; for (let i = -1; i <= 1; i++) ctx.fillRect(sx + i * h * 0.55 - 1.5, sy - h * 0.4 - 2, 3, 4); }
    }
  }

  /** S12: foul air: a sickly haze with wavy marks (the marks are the pattern that does not rely on colour). */
  foul(px, py, sz, ts) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(160,200,40,.34)"; ctx.fillRect(px, py, sz, sz);
    if (ts >= 7) {
      ctx.strokeStyle = "rgba(235,255,150,.85)"; ctx.lineWidth = Math.max(1, ts * 0.07); ctx.beginPath();
      for (const o of [0.3, 0.62]) { ctx.moveTo(px + ts * 0.15, py + ts * o); ctx.quadraticCurveTo(px + ts * 0.32, py + ts * (o - 0.12), px + ts * 0.5, py + ts * o); ctx.quadraticCurveTo(px + ts * 0.68, py + ts * (o + 0.12), px + ts * 0.85, py + ts * o); }
      ctx.stroke();
    }
  }
  /** S12: cracks across a cell whose roof will come down (they flicker unless reduced flashing is on). */
  cracks(px, py, ts, ci) {
    const ctx = this.ctx, a = this.access.calm ? 0.9 : 0.55 + 0.4 * Math.abs(Math.sin(performance.now() / 260 + ci));
    ctx.strokeStyle = `rgba(255,120,90,${a})`; ctx.lineWidth = Math.max(1, ts * 0.09); ctx.beginPath();
    ctx.moveTo(px + ts * 0.1, py + ts * 0.2); ctx.lineTo(px + ts * 0.4, py + ts * 0.45); ctx.lineTo(px + ts * 0.3, py + ts * 0.7); ctx.lineTo(px + ts * 0.6, py + ts * 0.9);
    ctx.moveTo(px + ts * 0.4, py + ts * 0.45); ctx.lineTo(px + ts * 0.9, py + ts * 0.35);
    ctx.stroke();
  }
  /** Patterns that tell the biomes apart without colour: a small caret for highland, wave ticks for marsh. */
  biomeMark(bi, px, py, ts) {
    const ctx = this.ctx;
    ctx.strokeStyle = bi === HIGHLAND ? "rgba(235,242,255,.55)" : "rgba(220,255,235,.55)"; ctx.lineWidth = 1; ctx.beginPath();
    if (bi === HIGHLAND) { ctx.moveTo(px + ts * 0.2, py + ts * 0.8); ctx.lineTo(px + ts * 0.5, py + ts * 0.5); ctx.lineTo(px + ts * 0.8, py + ts * 0.8); }
    else { ctx.moveTo(px + ts * 0.15, py + ts * 0.8); ctx.quadraticCurveTo(px + ts * 0.32, py + ts * 0.62, px + ts * 0.5, py + ts * 0.8); ctx.quadraticCurveTo(px + ts * 0.68, py + ts * 0.98, px + ts * 0.85, py + ts * 0.8); }
    ctx.stroke();
  }
  /** A torch's warm light on the dark (the radius is the light's reach). */
  torchGlow(sx, sy, r) {
    const ctx = this.ctx, g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, "rgba(255,190,90,.26)"); g.addColorStop(1, "rgba(255,190,90,0)");
    ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }

  /** S15: a wagon (a plank bed on two wheels, a pole to push by) or an animal cart (the same with a longer pole and a yoke); a ring shows it hitched to someone. */
  wagon(e, sx, sy, ts) {
    const { ctx } = this, h = ts * 0.5, cart = e.t === "cart";
    ctx.fillStyle = cart ? "#b0803f" : "#a67c52"; ctx.fillRect(sx - h * 0.85, sy - h * 0.55, h * 1.7, h * 0.85);
    ctx.strokeStyle = "#3d2810"; ctx.lineWidth = 1; ctx.strokeRect(sx - h * 0.85, sy - h * 0.55, h * 1.7, h * 0.85);
    ctx.fillStyle = "#2c2118";
    for (const o of [-0.5, 0.5]) { ctx.beginPath(); ctx.arc(sx + h * o, sy + h * 0.38, h * 0.3, 0, 6.2832); ctx.fill(); ctx.strokeStyle = "#c9a85c"; ctx.beginPath(); ctx.moveTo(sx + h * o, sy + h * 0.08); ctx.lineTo(sx + h * o, sy + h * 0.68); ctx.stroke(); }
    ctx.strokeStyle = "#7a5430"; ctx.lineWidth = Math.max(1.5, ts * 0.08); ctx.beginPath(); ctx.moveTo(sx + h * 0.85, sy - h * 0.1); ctx.lineTo(sx + h * (cart ? 1.6 : 1.3), sy - h * 0.1); ctx.stroke();
    if (cart) { ctx.strokeStyle = "#d9c690"; ctx.beginPath(); ctx.arc(sx + h * 1.6, sy - h * 0.1, h * 0.22, 0, 6.2832); ctx.stroke(); }
    if (e.dr) { ctx.strokeStyle = "rgba(255,226,122,.9)"; ctx.lineWidth = 1.5; ctx.strokeRect(sx - h * 0.95, sy - h * 0.65, h * 1.9, h * 1.45); }
  }

  /** S13: a grave marker: a small upright stone in the villager's colour, with a mound of earth before it. */
  grave(e, sx, sy, ts) {
    const { ctx } = this, h = ts * 0.5;
    ctx.fillStyle = "rgba(70,52,34,.85)"; ctx.beginPath(); ctx.ellipse(sx, sy + h * 0.45, h * 0.75, h * 0.32, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "#b9b4a8"; ctx.beginPath(); ctx.moveTo(sx - h * 0.4, sy + h * 0.3); ctx.lineTo(sx - h * 0.4, sy - h * 0.5); ctx.quadraticCurveTo(sx, sy - h * 0.95, sx + h * 0.4, sy - h * 0.5); ctx.lineTo(sx + h * 0.4, sy + h * 0.3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#5e594f"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "hsl(" + e.hue + ",70%,55%)"; ctx.fillRect(sx - h * 0.18, sy - h * 0.35, h * 0.36, h * 0.36);
  }

  /** Animated flame: three tongues that sway at different rates (render-only; the clock is the wall clock, so a paused game still flickers). */
  fire(sx, sy, ts, big) {
    const ctx = this.ctx, t = this.access.calm ? 0 : performance.now() / 130, w = ts * (big ? 0.22 : 0.16), hh = ts * (big ? 0.95 : 0.65);
    for (let i = 0; i < 3; i++) {
      const ph = t + i * 2.1, h = hh * (i === 1 ? 1 : 0.72) * (0.8 + 0.2 * Math.sin(ph * 1.7)), ox = (i - 1) * w * 0.9 + Math.sin(ph) * ts * 0.04;
      ctx.fillStyle = i === 1 ? "#ffd84a" : "#ff7a1c";
      ctx.beginPath(); ctx.moveTo(sx + ox - w, sy + ts * 0.18); ctx.quadraticCurveTo(sx + ox - w * 0.2, sy + ts * 0.18 - h * 0.7, sx + ox + Math.sin(ph * 0.8) * w * 0.5, sy + ts * 0.18 - h);
      ctx.quadraticCurveTo(sx + ox + w * 0.2, sy + ts * 0.18 - h * 0.7, sx + ox + w, sy + ts * 0.18); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#fff4c2"; ctx.beginPath(); ctx.ellipse(sx, sy + ts * 0.08, w * 0.45, hh * 0.28, 0, 0, 6.2832); ctx.fill();
  }

  /** A burning tree (big flames over the crown) or a smouldering stump (embers and rising smoke). */
  flame(e, sx, sy, ts) {
    const ctx = this.ctx;
    if (e.src === "tree") { this.fire(sx, sy, ts, true); return; }
    ctx.fillStyle = "#ff8a2a"; ctx.globalAlpha = this.access.calm ? 0.65 : 0.55 + 0.25 * Math.sin(performance.now() / 260);
    ctx.beginPath(); ctx.arc(sx, sy, ts * 0.16, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
    const t = (performance.now() / 1500) % 1;
    for (let i = 0; i < 3; i++) {
      const k = (t + i / 3) % 1;
      ctx.fillStyle = "rgba(190,190,200," + (0.4 * (1 - k)).toFixed(2) + ")";
      ctx.beginPath(); ctx.arc(sx + Math.sin(k * 6) * ts * 0.08, sy - k * ts * 1.1, ts * (0.1 + 0.14 * k), 0, 6.2832); ctx.fill();
    }
  }

  /** Warm radial glow (the firelight). */
  glow(sx, sy, r, night) {
    const ctx = this.ctx, g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r), a = night ? 0.5 : 0.16;
    g.addColorStop(0, "rgba(255,170,70," + a + ")"); g.addColorStop(1, "rgba(255,170,70,0)");
    ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }

  site(e, sx, sy, ts) {                     // a construction site: dashed outline
    const ctx = this.ctx, h = ts * 0.42;
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.strokeRect(sx - h, sy - h, h * 2, h * 2); ctx.setLineDash([]);
  }

  item(e, sx, sy, ts) {                     // a stack: coloured chip, count when zoomed in
    const ctx = this.ctx, it = ITEMS[e.item], h = ts * 0.3;
    ctx.fillStyle = it.color; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 1;
    if (e.item === "log") { ctx.fillRect(sx - h * 1.2, sy - h * 0.5, h * 2.4, h); ctx.strokeRect(sx - h * 1.2, sy - h * 0.5, h * 2.4, h); }
    else if (e.item === "stick") { ctx.beginPath(); ctx.moveTo(sx - h, sy + h); ctx.lineTo(sx + h, sy - h); ctx.lineWidth = Math.max(1.5, ts * 0.1); ctx.strokeStyle = it.color; ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(sx, sy, h, 0, 6.2832); ctx.fill(); ctx.stroke(); }
    if (ts >= 11) {
      ctx.font = `bold ${Math.floor(ts * 0.42)}px system-ui, sans-serif`; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.strokeText(String(e.n), sx + ts * 0.46, sy + ts * 0.46);
      ctx.fillStyle = "#fff"; ctx.fillText(String(e.n), sx + ts * 0.46, sy + ts * 0.46);
    }
  }

  /** A creature (S8): a hopper is a small tan hopper with ears; the thornback is a big dark boar with a spiked back. Health bar once hurt. */
  fauna(e, sx, sy, ts, sim) {
    const ctx = this.ctx;
    if (e.sp === "hopper") {
      const r = Math.max(2, ts * 0.26);
      ctx.fillStyle = "#c2a572"; ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.2, r, r * 0.8, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = "#6b5530"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#c2a572"; ctx.fillRect(sx - r * 0.7, sy - r * 1.3, Math.max(1.5, r * 0.3), r * 0.8); ctx.fillRect(sx + r * 0.4, sy - r * 1.3, Math.max(1.5, r * 0.3), r * 0.8);
      if (e.tame) { ctx.strokeStyle = "#e5594f"; ctx.lineWidth = Math.max(1.5, ts * 0.08); ctx.beginPath(); ctx.moveTo(sx - r * 0.5, sy - r * 0.1); ctx.lineTo(sx + r * 0.5, sy - r * 0.1); ctx.stroke(); }      // S10: a penned hopper wears a red cord
    } else if (e.sp === "wolf") {                                       // S14: a lean grey wolf with a pale muzzle and pricked ears
      const r = Math.max(3, ts * 0.4);
      ctx.fillStyle = "#7d8591"; ctx.beginPath(); ctx.ellipse(sx, sy, r * 1.2, r * 0.7, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = e.st === "attack" || e.st === "hunt" ? "#ff5d5d" : "#2c3138"; ctx.lineWidth = Math.max(1.5, ts * 0.07); ctx.stroke();
      ctx.fillStyle = "#2c3138"; ctx.beginPath(); ctx.moveTo(sx + r * 0.7, sy - r * 0.5); ctx.lineTo(sx + r * 0.85, sy - r * 1.1); ctx.lineTo(sx + r * 1.0, sy - r * 0.5); ctx.fill();
      ctx.fillStyle = "#d9dde3"; ctx.beginPath(); ctx.arc(sx + r * 1.1, sy, Math.max(1.2, r * 0.25), 0, 6.2832); ctx.fill();
    } else if (e.sp === "grazer") {                                     // S14: a broad brown grazer with short horns
      const r = Math.max(4, ts * 0.7);
      ctx.fillStyle = e.tame ? "#9a7650" : "#7d5a3a"; ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.72, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = e.st === "turn" ? "#ff5d5d" : "#3b2916"; ctx.lineWidth = Math.max(1.5, ts * 0.07); ctx.stroke();
      ctx.strokeStyle = "#e9dcc0"; ctx.lineWidth = Math.max(1.5, ts * 0.1); ctx.beginPath(); ctx.moveTo(sx + r * 0.6, sy - r * 0.4); ctx.lineTo(sx + r * 0.95, sy - r * 0.85); ctx.moveTo(sx + r * 0.6, sy + r * 0.4); ctx.lineTo(sx + r * 0.95, sy + r * 0.85); ctx.stroke();
      if (e.tame) { ctx.strokeStyle = "#e5594f"; ctx.lineWidth = Math.max(1.5, ts * 0.08); ctx.beginPath(); ctx.moveTo(sx - r * 0.4, sy - r * 0.1); ctx.lineTo(sx + r * 0.4, sy - r * 0.1); ctx.stroke(); }
    } else {
      const r = Math.max(3, ts * 0.62);
      ctx.fillStyle = "#4a2f22"; ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.78, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = e.st === "attack" || e.st === "hunt" ? "#ff5d5d" : "#1c120c"; ctx.lineWidth = Math.max(1.5, ts * 0.07); ctx.stroke();
      ctx.fillStyle = "#1c120c";
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(sx + i * r * 0.32 - r * 0.12, sy - r * 0.55); ctx.lineTo(sx + i * r * 0.32, sy - r * 0.95); ctx.lineTo(sx + i * r * 0.32 + r * 0.12, sy - r * 0.55); ctx.fill(); }
      ctx.fillStyle = "#ff9a8a"; ctx.beginPath(); ctx.arc(sx + r * 0.45, sy - r * 0.1, Math.max(1.2, r * 0.1), 0, 6.2832); ctx.fill();
    }
    if (e.hp < e.mhp && ts >= 5) {
      const w = ts * 0.9; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(sx - w / 2, sy - ts * 0.85, w, 3);
      ctx.fillStyle = e.hp / e.mhp > 0.5 ? "#6fbf73" : "#e5594f"; ctx.fillRect(sx - w / 2, sy - ts * 0.85, w * Math.max(0, e.hp / e.mhp), 3);
    }
    this.flash(e, sx, sy, ts, sim);
  }

  /** Hit feedback (S8): a ring and a floating number on whoever was just struck ("miss" for a swing that did not land). Drawn from the entity's last hit (ht/hd), so it replays the same on a loaded save. */
  flash(e, sx, sy, ts, sim) {
    const age = sim.tick - (e.ht || 0);
    if (!e.ht || age > 24 || age < 0) return;
    if (this.access.calm) {                  // reduced flashing: no expanding ring, just the number held still for a moment
      const ctx = this.ctx, miss = e.hd < 0, txt = miss ? "miss" : "-" + e.hd;
      ctx.font = `bold ${Math.floor(Math.max(11, ts * 0.6))}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(txt, sx, sy - ts * 0.75); ctx.fillStyle = miss ? "#cfd6e4" : "#ffd2d2"; ctx.fillText(txt, sx, sy - ts * 0.75);
      return;
    }
    const ctx = this.ctx, k = age / 24, miss = e.hd < 0;
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = miss ? "#cfd6e4" : "#ff3b3b"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(sx, sy, ts * (0.35 + 0.5 * k), 0, 6.2832); ctx.stroke();
    ctx.font = `bold ${Math.floor(Math.max(11, ts * 0.6))}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    const txt = miss ? "miss" : "-" + e.hd, ty = sy - ts * 0.7 - k * ts * 0.9;
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(txt, sx, ty);
    ctx.fillStyle = miss ? "#cfd6e4" : "#ffd2d2"; ctx.fillText(txt, sx, ty);
    ctx.globalAlpha = 1;
  }

  /**
   * Blob tinted by its lineage hue (children smaller). Ring colour = state: sleeping blue,
   * cold pale cyan, thirsty/hungry orange; a small chip shows what it carries; the glyph
   * above says what it is doing (see GLYPH).
   */
  villager(e, sx, sy, ts, sim) {
    const ctx = this.ctx;
    const child = (sim.tick - e.born) / DAY < 0.2 * LIFE_DAYS;
    const r = Math.max(2, ts * (child ? 0.26 : 0.38));
    const asleep = e.slp === 1;
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.15, r, r * (asleep ? 0.6 : 0.85), 0, 0, 6.2832);
    ctx.fillStyle = `hsl(${e.hue},${asleep ? 40 : 75}%,${asleep ? 45 : 62}%)`; ctx.fill();
    const ring = e.ill ? "#a6d94a" : asleep ? "#6aa0ff" : e.warm < 0.35 ? "#bdf3ff" : e.hunger < 0.3 || e.thirst < 0.3 ? "#ff9a2e" : "rgba(0,0,0,.6)";
    if (this.access.contrast) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3.5; ctx.stroke(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.stroke(); }      // S12 high contrast: a white and black outline on every villager
    ctx.strokeStyle = ring; ctx.lineWidth = ring[0] === "r" ? (this.access.contrast ? 0.5 : 1) : 2; ctx.stroke();
    this.flash(e, sx, sy, ts, sim);
    if (this.access.cb && ts >= 8 && e.lin !== undefined) {         // S12: the lineage as a letter in the blob, for those who cannot tell the hues apart
      ctx.font = `bold ${Math.floor(Math.max(8, ts * 0.42))}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,.85)"; ctx.fillText("ABC"[e.lin % 3], sx, sy + r * 0.2 + 1);
    }
    if (e.carry) { ctx.fillStyle = ITEMS[e.carry.item].color; ctx.fillRect(sx + r * 0.5, sy - r * 0.9, Math.max(3, ts * 0.2), Math.max(3, ts * 0.2)); }
    if (ts >= 9) {
      const g = asleep ? "z" : (e.fear || 0) > 0.6 && !e.poss ? "!" : e.action ? (GLYPH[e.job && e.job.k] || (e.action.type === "Wander" ? "~" : "")) : "";
      if (g) {
        ctx.font = `bold ${Math.floor(Math.max(9, ts * 0.5))}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(g, sx, sy - r - 1);
        ctx.fillStyle = e.job && e.job.c === "vcrit" ? "#ffd166" : e.job && e.job.c === "order" ? "#9ad1ff" : "#fff"; ctx.fillText(g, sx, sy - r - 1);
      }
    }
  }
}

const ORE_LETTER = { [M.FLINT]: "F", [M.MALACHITE]: "M", [M.CLAY]: "c", [M.IRONORE]: "I", [M.COAL]: "K", [M.SALT]: "s", [M.PEAT]: "p", [M.HERB]: "h" };
// One letter per job kind (the S3 Why panel gives the full text).
const GLYPH = {
  forage: "f", cut: "g", chop: "c", haul: "h", store: "h", eat: "e", drink: "w", sleep: "z", huddle: "z",
  build_bed: "b", build_rack: "b", dry: "d", mine: "m", dig: "m", leisure: "~", goto: ">", flee: "!", defend: "x", hunt: "x", strike: "x", mend: "+", convalesce: "+", tend_sick: "+",
};
