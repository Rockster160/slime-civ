// The minimap (S17): a corner panel showing the land at a coarse scale. Explored land is in colour, the rest of the world dim, so the shape of the unknown is
// visible. It is drawn from the renderer's own chunk cache and the seen data ONLY: it never asks the sim for a chunk (it cannot make one resident or generate
// one in the sim's cache), and a chunk the render cache does not hold is generated through the render view (bounded, MM_BUDGET per redraw; the rest next time).
//
//   scale     cells per pixel (wheel zooms): MM_SCALES. Default 3 (a 192 px map shows ~580 cells).
//   centre    follows the camera (a click jumps the camera there, so the map re-centres: click again to walk further, or zoom out)
//   redraw    the terrain layer at most MM_MS apart (and on a zoom), the cheap overlay (camp, villagers, scouts, landmarks, the camera's rectangle) every frame
//   icons     camp, villagers (gold; orange on an expedition; cyan scouting), landmarks seen from afar (C cave mouth, S salt outcrop, R ruins, L lake)
//   input     click or drag = jump; wheel = zoom; right-click with villagers selected = send them to scout there; the header collapses it; the house button = Home
import { depthBadge } from "../render/obmath.js";
import { MAT, M } from "../sim/world.js";
import { chunkKey } from "../sim/cellkey.js";
import { exploredAt } from "../sim/seen.js";
import { BIOMES } from "../sim/biome.js";
import { WATER_LEVEL } from "../sim/terrain.js";
import { LM_LABEL } from "../sim/landmarks.js";
import { dungeonOf, isAir } from "../sim/dungeon.js";
import { coreByKey } from "../sim/cm.js";
import { bandAt } from "../sim/core.js";
import { isSeen } from "../sim/seen.js";
import { remember } from "./dom.js";
import { svg } from "./icons.js";

export const MM_SIZE = 192;
export const MM_SCALES = [1, 2, 3, 4, 6, 8, 12, 16];
export const MM_MS = 350;               // terrain layer redraw period
export const MM_BUDGET = 48;            // chunks the render view may generate per redraw
const LM_COLOR = { cave: "#1c1c24", salt: "#f2f2ec", ruin: "#b9a98c", lake: "#4a8bd8", core: "#8a5cd6" };
const BAND_PIP = ["", "#c9b5ff", "#9a6bff", "#ff9a2e", "#ff5d5d"];       // 7.23: danger pips by mana band 1..4 (the colours of the cell card's pip)
const LM_LETTER = { cave: "C", salt: "S", ruin: "R", lake: "L", core: "*" };

export function createMinimap(root, game) {
  const ui = game.ui, cam = game.cam;
  const mm = ui.mm = { open: remember("mm.open") !== "0", scale: Number(remember("mm.scale")) || 3, ox: 0, oy: 0, last: 0, key: "", pending: 0, redraws: 0, made: 0, pox: 0, poy: 0, ps: 3 };
  if (!MM_SCALES.includes(mm.scale)) mm.scale = 3;
  mm.auto = !remember("mm.scale");                                       // 6.19c: until the player zooms, the scale follows the explored area (a small camp patch on a 3 cells/px map was a black square)
  root.dataset.test = "minimap";
  root.innerHTML = `<header data-test="minimap-head"><span class="pi">${svg("map", 16)}</span><span class="ptitle">Map</span><span class="mm-btns"><button class="btn ico mm-home" data-test="minimap-home" data-tip="Centre on the camp" data-key="Home" aria-label="Home">${svg("home", 14)}</button><button class="btn ico mm-fold" data-test="minimap-fold" data-tip="Collapse or open the map" aria-label="Collapse"></button></span></header><canvas width="${MM_SIZE}" height="${MM_SIZE}" data-test="minimap-canvas"></canvas><div class="mm-foot sr"></div>`;
  const cv = root.querySelector("canvas"), ctx = cv.getContext("2d"), foot = root.querySelector(".mm-foot"), fold = root.querySelector(".mm-fold");
  const land = document.createElement("canvas"); land.width = land.height = MM_SIZE;                 // the terrain layer, kept between redraws
  const lctx = land.getContext("2d"), img = lctx.createImageData(MM_SIZE, MM_SIZE);
  const px32 = new Uint32Array(img.data.buffer);
  const rgb = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
  const DUNGEON_PX = rgb(214, 140, 255), DARK = rgb(20, 26, 38), PENDING = rgb(34, 44, 62), WATER = rgb(58, 111, 181);
  const pal = MAT.map(m => m.color);

  const setOpen = (on) => { mm.open = on; remember("mm.open", on ? "1" : "0"); apply(); };
  function apply() {
    root.classList.toggle("closed", !mm.open);
    fold.innerHTML = svg(mm.open ? "chev-d" : "chev-r", 14);
    document.documentElement.style.setProperty("--mm", (mm.open ? 24 + 160 + 8 : 24) + "px");
  }
  fold.onclick = (e) => { e.stopPropagation(); setOpen(!mm.open); };
  root.querySelector(".mm-home").onclick = (e) => { e.stopPropagation(); game.goHome(); };
  root.querySelector("header").onclick = () => setOpen(!mm.open);
  apply();

  /** The world cell at a canvas pixel / the pixel of a world cell. */
  const cellAt = (px, py) => [mm.pox + Math.floor(px * mm.ps), mm.poy + Math.floor(py * mm.ps)];
  const pixOf = (x, y) => [(x - mm.pox) / mm.ps, (y - mm.poy) / mm.ps];

  /** Redraw the terrain layer around (cx, cy). Reads: seen.cs (explored columns), the render view's chunks. */
  function paintLand() {
    const view = game.renderer.view, sim = game.sim, seen = sim.seen;
    if (!view) return;
    const s = mm.scale, ox = mm.ox, oy = mm.oy, world = sim.world;
    mm.pox = ox; mm.poy = oy; mm.ps = s;                                  // what the terrain layer was painted for: the overlay and the clicks use it until the next paint
    let lk = -1, ch = null, cs = null, budget = MM_BUDGET, pending = 0;
    for (let py = 0; py < MM_SIZE; py++) {
      const wy = oy + py * s + (s >> 1);
      for (let pxl = 0; pxl < MM_SIZE; pxl++) {
        const wx = ox + pxl * s + (s >> 1), k = chunkKey(wx >> 4, wy >> 4);
        if (k !== lk) {
          lk = k;
          cs = seen.cs.get(k) || null;
          ch = world.chunks.get(k) || view.lru.get(k) || null;               // what is already held: the sim's resident chunk (read only) or the render cache
          if (!ch && cs && budget > 0) { budget--; ch = view._get(wx >> 4, wy >> 4); mm.made++; }      // explored but not cached (evicted): regenerate in the render view
        }
        const o = py * MM_SIZE + pxl, col = ((wy & 15) << 4) | (wx & 15), explored = !!cs && cs[col] === 1;
        if (!ch) { px32[o] = explored ? (pending++, PENDING) : DARK; continue; }
        const h = ch.hs[col], m = h <= WATER_LEVEL ? M.WATER : ch.mats[(h << 8) | col];
        let r, g, b;
        if (m === M.WATER) { r = 58; g = 111; b = 181; const d = Math.min(3, WATER_LEVEL - h); r -= d * 6; g -= d * 8; b -= d * 10; }
        else { const c = pal[m] || pal[M.GRASS], k2 = 0.78 + 0.035 * (h - 12); r = c[0] * k2; g = c[1] * k2; b = c[2] * k2; }
        const bi = ch.bm[col];
        if (bi && m !== M.WATER) { const t = BIOMES[bi].tint; r = r * (1 - t[3]) + t[0] * t[3]; g = g * (1 - t[3]) + t[1] * t[3]; b = b * (1 - t[3]) + t[2] * t[3]; }
        if (!explored) { r = r * 0.42 + 8; g = g * 0.42 + 12; b = b * 0.45 + 24; }          // unexplored: dim, with a blue cast
        px32[o] = rgb(Math.max(0, Math.min(255, r | 0)), Math.max(0, Math.min(255, g | 0)), Math.max(0, Math.min(255, b | 0)));
      }
    }
    for (const key of sim.cm.known || []) {                                   // 7.23: a labyrinth somebody has entered, outlined as far as it is explored: its seen floor cells in violet (one pixel per cell sampled)
      const c = coreByKey(sim, key), dun = c ? dungeonOf(sim.def, c) : null;
      if (!dun || dun.bb.x1 < ox || dun.bb.x0 > ox + MM_SIZE * s || dun.bb.y1 < oy || dun.bb.y0 > oy + MM_SIZE * s) continue;
      for (let j = 0; j < dun.L; j++) for (let y = dun.y0; y < dun.y0 + dun.H; y++) for (let x = dun.x0; x < dun.x0 + dun.W; x++) {
        if (!isAir(dun, x, y, dun.s[j]) || !isSeen(sim, x, y, dun.s[j] - 1)) continue;
        const qx = Math.floor((x - ox) / s), qy = Math.floor((y - oy) / s);
        if (qx >= 0 && qy >= 0 && qx < MM_SIZE && qy < MM_SIZE) px32[qy * MM_SIZE + qx] = DUNGEON_PX;
      }
    }
    lctx.putImageData(img, 0, 0);
    mm.pending = pending; mm.redraws++;
  }

  /** The cheap layer, every frame. */
  function compose() {
    const sim = game.sim;
    ctx.drawImage(land, 0, 0);
    const [hx, hy] = pixOf(sim.site.x + 0.5, sim.site.y + 0.5);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx, hy - 4); ctx.lineTo(hx + 4, hy); ctx.lineTo(hx, hy + 4); ctx.lineTo(hx - 4, hy); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (const m of sim.seen.lm || []) {
      const [x, y] = pixOf(m[1] + 0.5, m[2] + 0.5);
      if (x < -6 || y < -6 || x > MM_SIZE + 6 || y > MM_SIZE + 6) continue;
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 6.2832); ctx.fillStyle = LM_COLOR[m[0]] || "#ccc"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.font = "bold 8px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = m[0] === "salt" || m[0] === "ruin" ? "#222" : "#fff"; ctx.fillText(LM_LETTER[m[0]] || "?", x, y + 0.5);
    }
    for (const m of sim.seen.lm || []) {                                      // 7.23: danger pips: the band at a core or ruin that has been seen (a ring: how deep), then the monsters in cells somebody has seen
      if (m[0] !== "core" && m[0] !== "ruin") continue;
      const b = bandAt(sim.def, m[1], m[2], 0) || bandAt(sim.def, m[1], m[2], 8);
      const [x, y] = pixOf(m[1] + 0.5, m[2] + 0.5);
      if (!b || x < -6 || y < -6 || x > MM_SIZE + 6 || y > MM_SIZE + 6) continue;
      ctx.beginPath(); ctx.arc(x + 5, y - 5, 3, 0, 6.2832); ctx.fillStyle = BAND_PIP[b]; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.stroke();
    }
    for (const v of sim.ents.ofKind("villager")) {
      const [x, y] = pixOf(v.x + 0.5, v.y + 0.5);
      if (x < -3 || y < -3 || x > MM_SIZE + 3 || y > MM_SIZE + 3) continue;
      const exp = v.xp, scout = v.order && v.order.verb === "scout", sel = ui.sel.includes(v.id);
      ctx.fillStyle = exp ? "#ff9a2e" : scout ? "#5fe0e8" : "#ffd75e";
      ctx.fillRect(Math.round(x) - 1.5, Math.round(y) - 1.5, 3, 3);
      if (sel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6); }
      if (cam.oblique) { const b = depthBadge(game.renderer.z, v.z, game.renderer.topAt(v.x, v.y), game.D); if (b) { ctx.font = "bold 9px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(b, Math.round(x) + 3, Math.round(y)); ctx.fillStyle = "#7cc4ff"; ctx.fillText(b, Math.round(x) + 3, Math.round(y)); } }      // "↓2": on another level than the one viewed
      if (scout) {                                                        // a scout's target
        const [tx, ty] = pixOf(v.order.x + 0.5, v.order.y + 0.5);
        if (tx > 0 && ty > 0 && tx < MM_SIZE && ty < MM_SIZE) { ctx.strokeStyle = "#5fe0e8"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx - 3, ty - 3); ctx.lineTo(tx + 3, ty + 3); ctx.moveTo(tx + 3, ty - 3); ctx.lineTo(tx - 3, ty + 3); ctx.stroke(); }
      }
    }
    for (const e of sim.ents.ofKind("fauna")) {
      if (!e.mon || !isSeen(sim, e.x, e.y, e.z - 1)) continue;
      const [x, y] = pixOf(e.x + 0.5, e.y + 0.5);
      if (x < -3 || y < -3 || x > MM_SIZE + 3 || y > MM_SIZE + 3) continue;
      ctx.fillStyle = "#ff4a4a"; ctx.strokeStyle = "#220808"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, e.boss || e.sp === "guardian" ? 3.6 : 2, 0, 6.2832); ctx.fill(); ctx.stroke();
    }
    const vis = cam.visible(), [ax, ay] = pixOf(vis.x0, vis.y0), [bx, by] = pixOf(vis.x1 + 1, vis.y1 + 1);
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.2; ctx.strokeRect(ax, ay, Math.max(3, bx - ax), Math.max(3, by - ay));
  }

  function jump(e) {
    const r = cv.getBoundingClientRect(), k = MM_SIZE / r.width;
    const [x, y] = cellAt((e.clientX - r.left) * k, (e.clientY - r.top) * k);
    game.viewAt(x, y, 1e3);                                               // §12.4: the minimap shows the surface, so the jump lands on the Surface view
    mm.last = 0;                                                          // redraw at once, centred on the new spot
  }
  let dragging = false;
  cv.addEventListener("mousedown", (e) => { if (e.button !== 0) return; dragging = true; jump(e); e.stopPropagation(); e.preventDefault(); });
  window.addEventListener("mousemove", (e) => { if (dragging) jump(e); });
  window.addEventListener("mouseup", () => { dragging = false; });
  cv.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), k = MM_SIZE / r.width, [x, y] = cellAt((e.clientX - r.left) * k, (e.clientY - r.top) * k);
    game.scoutTo(x, y);
  });
  cv.addEventListener("wheel", (e) => {
    e.preventDefault(); e.stopPropagation();
    const i = MM_SCALES.indexOf(mm.scale), j = Math.max(0, Math.min(MM_SCALES.length - 1, i + (e.deltaY > 0 ? 1 : -1)));
    if (j === i) return;
    const r = cv.getBoundingClientRect(), k = MM_SIZE / r.width, qx = (e.clientX - r.left) * k, qy = (e.clientY - r.top) * k;
    const wx = mm.pox + qx * mm.ps, wy = mm.poy + qy * mm.ps;              // the map point under the cursor stays under the cursor: the minimap is centred on the camera, so the camera moves
    mm.scale = MM_SCALES[j]; mm.auto = false; remember("mm.scale", String(mm.scale));
    const s = mm.scale;
    cam.x = wx - (qx - MM_SIZE / 2) * s; cam.y = wy - (qy - MM_SIZE / 2) * s;
    mm.ox = Math.floor(cam.x) - Math.floor((MM_SIZE * s) / 2); mm.oy = Math.floor(cam.y) - Math.floor((MM_SIZE * s) / 2);
    mm.key = mm.ox + "," + mm.oy + "," + s + "," + game.sim.seen.ver; mm.last = performance.now();
    paintLand();                                                          // repaint now so a click straight after maps to what is drawn
  }, { passive: false });
  cv.addEventListener("mousemove", (e) => {
    const r = cv.getBoundingClientRect(), k = MM_SIZE / r.width, [x, y] = cellAt((e.clientX - r.left) * k, (e.clientY - r.top) * k);
    let t = "";
    for (const m of game.sim.seen.lm || []) if (Math.abs(m[1] - x) <= 3 * mm.scale && Math.abs(m[2] - y) <= 3 * mm.scale) t = LM_LABEL[m[0]] || m[0];
    cv.dataset.tip = t; cv.title = "";
  });

  return {
    update(now) {
      root.style.display = "";
      if (!mm.open) return;
      const bb = game.sim.seen.bbox;
      if (mm.auto && bb) {                                                // smallest scale that fits the explored box (with a margin), never finer than 2 cells/px
        const need = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 1.5 / MM_SIZE, fit = MM_SCALES.find(q => q >= Math.max(2, need)) || MM_SCALES[MM_SCALES.length - 1];
        if (fit !== mm.scale) { mm.scale = fit; mm.last = 0; }
      }
      const s = mm.scale, cx = Math.floor(cam.x), cy = Math.floor(cam.y);
      mm.ox = cx - Math.floor((MM_SIZE * s) / 2); mm.oy = cy - Math.floor((MM_SIZE * s) / 2);
      const key = mm.ox + "," + mm.oy + "," + s + "," + game.sim.seen.ver;
      if (now - mm.last > MM_MS && (key !== mm.key || mm.pending)) { mm.last = now; mm.key = key; paintLand(); }
      compose();
      const sim = game.sim, ex = sim.seen.ncols;
      foot.textContent = "1 px = " + s + " cells · " + ex + " explored" + (sim.seen.lm && sim.seen.lm.length ? " · " + sim.seen.lm.length + " sights" : "");
    },
  };
}
