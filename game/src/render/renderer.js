// Debug renderer: top-down view of ONE z-level. For each column draw the
// topmost non-air cell at or below the viewed z, darker the deeper it is below
// that level. Plants and villagers are glyphs on top. Reads the sim, never
// writes it. Only tiles inside the camera view are touched.
import { W, H, D, M, MAT } from "../sim/world.js";
import { ITEMS } from "../sim/items.js";
import { isNight } from "../sim/season.js";

const SHADES = 12;                          // depth levels before the colour stops darkening
const fill = MAT.map(m => {
  const row = [];
  for (let d = 0; d < SHADES; d++) {
    const k = Math.max(0.3, 1 - 0.07 * d);
    row.push(`rgb(${Math.round(m.color[0] * k)},${Math.round(m.color[1] * k)},${Math.round(m.color[2] * k)})`);
  }
  return row;
});

export class Renderer {
  constructor(canvas, cam) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.cam = cam;
    this.z = 17;                            // viewed level
    this.tops = new Int16Array(W * H);      // per-frame: topmost visible z per column
  }

  setZ(z) { this.z = Math.max(0, Math.min(D - 1, z)); }

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
    return !!v && e.x >= v.x0 && e.x <= v.x1 && e.y >= v.y0 && e.y <= v.y1 && e.z <= this.z && this.tops[e.y * W + e.x] === e.z - 1;
  }

  /** opts.zones: draw the stockpile zone (an overlay, off by default). */
  draw(sim, opts = {}) {
    const { ctx, cam, z } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(0, 0, cam.vw, cam.vh);
    const v = cam.visible();
    this.vis = v;
    const ts = cam.zoom, world = sim.world;
    if (v.x1 < v.x0 || v.y1 < v.y0) return;

    for (let y = v.y0; y <= v.y1; y++) {
      for (let x = v.x0; x <= v.x1; x++) {
        const top = world.topZ(x, y, z);
        this.tops[y * W + x] = top;
        if (top < 0) continue;
        const m = world.mat(x, y, top);
        let depth = z - top;
        if (m === M.WATER) {                // deeper water reads darker: count water cells down to the bed
          let bed = top; while (bed > 0 && world.mat(x, y, bed - 1) === M.WATER) bed--;
          depth = z - top + Math.min(3, top - bed);
        }
        ctx.fillStyle = fill[m][Math.min(SHADES - 1, depth)];
        const [sx, sy] = cam.toScreen(x, y);
        ctx.fillRect(Math.floor(sx), Math.floor(sy), Math.ceil(ts) + 1, Math.ceil(ts) + 1);
      }
    }

    // Stockpile zone under everything that stands on it.
    if (sim.stock && opts.zones) {
      const z0 = sim.stock, [ax, ay] = cam.toScreen(z0.x0, z0.y0), [bx, by] = cam.toScreen(z0.x1 + 1, z0.y1 + 1);
      ctx.fillStyle = "rgba(240,220,150,.16)"; ctx.fillRect(ax, ay, bx - ax, by - ay);
      ctx.strokeStyle = "rgba(240,220,150,.65)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.strokeRect(ax, ay, bx - ax, by - ay); ctx.setLineDash([]);
    }

    // Entities: shown only when standing on the visible top of their column. Ground things first, villagers last.
    const shown = (e) => this.isShown(e);
    for (const e of sim.ents.ofKind("plant")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.plant(e, sx, sy, ts); }
    for (const e of sim.ents.ofKind("furniture")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.furniture(e, sx, sy, ts); }
    for (const e of sim.ents.ofKind("site")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.site(e, sx, sy, ts); }
    for (const e of sim.ents.ofKind("item")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.item(e, sx, sy, ts); }
    const night = isNight(sim.tick);
    for (const e of sim.ents.ofKind("villager")) if (shown(e)) { const [sx, sy] = cam.toScreen(e.x + 0.5, e.y + 0.5); this.villager(e, sx, sy, ts, sim); }
    this.night = night;
    if (night) { ctx.fillStyle = "rgba(10,16,48,.28)"; ctx.fillRect(0, 0, cam.vw, cam.vh); }

    // Map border, so the edge is obvious when zoomed out.
    const [bx, by] = cam.toScreen(0, 0), [bx1, by1] = cam.toScreen(W, H);
    ctx.strokeStyle = "#445"; ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bx1 - bx, by1 - by);
  }

  plant(e, sx, sy, ts) {
    const ctx = this.ctx;
    ctx.beginPath();
    if (e.species === "sapling") {
      ctx.strokeStyle = "#3f8a3a"; ctx.lineWidth = Math.max(1, ts * 0.08);
      ctx.moveTo(sx, sy + ts * 0.2); ctx.lineTo(sx, sy - ts * 0.15); ctx.moveTo(sx - ts * 0.12, sy - ts * 0.05); ctx.lineTo(sx, sy - ts * 0.2); ctx.lineTo(sx + ts * 0.12, sy - ts * 0.05);
      ctx.stroke();
    } else if (e.species === "tree") {
      ctx.fillStyle = "#1f5a28"; ctx.arc(sx, sy, ts * 0.46, 0, 6.2832); ctx.fill();
      if (ts >= 6) { ctx.fillStyle = "#6b4a2a"; ctx.fillRect(sx - ts * 0.08, sy - ts * 0.08, ts * 0.16, ts * 0.16); }
    } else if (e.species === "berry") {
      ctx.fillStyle = "#3f7d3a"; ctx.arc(sx, sy, ts * 0.32, 0, 6.2832); ctx.fill();
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
    } else {                                // drying rack: two posts and rails, berries when it is being used
      ctx.strokeStyle = "#a67c52"; ctx.lineWidth = Math.max(1.5, ts * 0.09);
      ctx.beginPath(); ctx.moveTo(sx - h, sy + h * 0.8); ctx.lineTo(sx - h, sy - h * 0.8); ctx.moveTo(sx + h, sy + h * 0.8); ctx.lineTo(sx + h, sy - h * 0.8);
      ctx.moveTo(sx - h, sy - h * 0.4); ctx.lineTo(sx + h, sy - h * 0.4); ctx.moveTo(sx - h, sy + h * 0.1); ctx.lineTo(sx + h, sy + h * 0.1); ctx.stroke();
      if (e.rv) { ctx.fillStyle = "#8c4a3a"; for (let i = -1; i <= 1; i++) ctx.fillRect(sx + i * h * 0.55 - 1.5, sy - h * 0.4 - 2, 3, 4); }
    }
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

  /**
   * Blob tinted by its lineage hue (children smaller). Ring colour = state: sleeping blue,
   * cold pale cyan, thirsty/hungry orange; a small chip shows what it carries; the glyph
   * above says what it is doing (see GLYPH).
   */
  villager(e, sx, sy, ts, sim) {
    const ctx = this.ctx;
    const child = (sim.tick - e.born) / 1800 < 80;
    const r = Math.max(2, ts * (child ? 0.26 : 0.38));
    const asleep = e.slp === 1;
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.15, r, r * (asleep ? 0.6 : 0.85), 0, 0, 6.2832);
    ctx.fillStyle = `hsl(${e.hue},${asleep ? 40 : 75}%,${asleep ? 45 : 62}%)`; ctx.fill();
    const ring = asleep ? "#6aa0ff" : e.warm < 0.35 ? "#bdf3ff" : e.hunger < 0.3 || e.thirst < 0.3 ? "#ff9a2e" : "rgba(0,0,0,.6)";
    ctx.strokeStyle = ring; ctx.lineWidth = ring[0] === "r" ? 1 : 2; ctx.stroke();
    if (e.carry) { ctx.fillStyle = ITEMS[e.carry.item].color; ctx.fillRect(sx + r * 0.5, sy - r * 0.9, Math.max(3, ts * 0.2), Math.max(3, ts * 0.2)); }
    if (ts >= 9) {
      const g = asleep ? "z" : e.action ? (GLYPH[e.job && e.job.k] || (e.action.type === "Wander" ? "~" : "")) : "";
      if (g) {
        ctx.font = `bold ${Math.floor(Math.max(9, ts * 0.5))}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(g, sx, sy - r - 1);
        ctx.fillStyle = e.job && e.job.c === "vcrit" ? "#ffd166" : e.job && e.job.c === "order" ? "#9ad1ff" : "#fff"; ctx.fillText(g, sx, sy - r - 1);
      }
    }
  }
}

// One letter per job kind (the S3 Why panel gives the full text).
const GLYPH = {
  forage: "f", cut: "g", chop: "c", haul: "h", store: "h", eat: "e", drink: "w", sleep: "z", huddle: "z",
  build_bed: "b", build_rack: "b", dry: "d", leisure: "~", goto: ">",
};
