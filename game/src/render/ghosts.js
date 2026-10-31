// Construction ghosts and room shading, drawn over the map. Reads sim + ui only.
// A ghost is a translucent coloured cell: walls solid-ish, roofs hatched, floors
// faint, furniture as a small mark. A framed ghost (materials delivered) is brighter.
import { costOf } from "../sim/build.js";
import { World } from "../sim/world.js";
import { regionCells } from "../sim/mine.js";
import { roomFire } from "../sim/fire.js";

export const PIECE_COLOR = {
  wall: "176,138,84", floor: "150,118,80", roof: "214,190,100", door: "120,200,240", bed: "110,200,90", rack: "200,150,90", hearth: "240,130,60", kiln: "198,98,62", mound: "140,104,66", workbench: "166,124,82", bellows: "150,100,70", waterjar: "74,168,255", smoker: "107,138,74", forge: "168,74,52", torch: "255,170,60", lamp: "232,176,96", vent: "150,200,230", shelf: "190,150,100", board: "200,170,110",
};

/** Where a piece sits on the height axis: [the z of the plane its top is drawn on, the height of its body below that]. A wall is a block one cell tall, a roof lies one above it, the rest are flat on the floor. */
export function pieceLift(w, z) { return w === "wall" ? [z + 1, 1] : w === "roof" ? [z + 2, 0] : [z, 0]; }
const GLYPH_OF = (w) => w === "door" ? "D" : w === "bed" ? "b" : w === "hearth" ? "f" : w === "kiln" ? "K" : w === "mound" ? "M" : w === "workbench" ? "W" : w === "bellows" ? "B" : w === "waterjar" ? "J" : w === "smoker" ? "S" : w === "forge" ? "F" : w === "torch" ? "t" : w === "lamp" ? "L" : w === "vent" ? "V" : w === "shelf" ? "h" : w === "board" ? "n" : "r";

/** Draw one ghost cell at tile (x, y), standing level z (default: the ground there). `bad` draws it red. In the angled view a wall is a block (its front face shows) and a roof floats above it. */
export function ghostCell(ctx, cam, w, x, y, { alpha = 0.45, bad = false, framed = false, z } = {}) {
  const gz = z === undefined ? cam.groundAt(x + 0.01, y + 0.01) : z, [top, body] = cam.oblique ? pieceLift(w, gz) : [gz, 0];
  const [sx, sy, cw, th] = cam.rect(x, y, x + 1, y + 1, top), ts = cam.zoom;
  const col = bad ? "230,70,60" : PIECE_COLOR[w];
  if (w === "wall") alpha = Math.max(alpha, 0.55);
  const a1 = framed ? Math.min(0.9, alpha + 0.3) : alpha;
  if (body && cam.oblique) { ctx.fillStyle = `rgba(${col},${Math.min(0.9, a1 * 0.8)})`; ctx.fillRect(sx + 1, sy + th, cw - 2, cam.riseH * body); }      // the front face of the block, under its top
  ctx.fillStyle = `rgba(${col},${a1})`;
  if (w === "roof" || w === "floor") {
    const inset = w === "roof" ? 1 : 2;
    ctx.fillRect(sx + inset, sy + inset, cw - 2 * inset, th - 2 * inset);
    if (w === "roof" && ts >= 8) {                       // hatching reads as "above you"
      ctx.strokeStyle = `rgba(${col},${Math.min(0.9, alpha + 0.3)})`; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 4; k < ts * 2; k += 5) { ctx.moveTo(sx + Math.min(k, cw), sy + Math.max(0, (k - cw) * th / cw)); ctx.lineTo(sx + Math.max(0, k - cw), sy + Math.min(k * th / cw, th)); }
      ctx.stroke();
    }
  } else if (w === "wall") {
    ctx.fillRect(sx + 1, sy + 1, cw - 2, th - 2);
    ctx.strokeStyle = bad ? "rgba(255,120,110,.95)" : "rgba(255,238,200,.95)"; ctx.lineWidth = 1.5; ctx.setLineDash(framed ? [] : [3, 2]); ctx.strokeRect(sx + 1.5, sy + 1.5, cw - 3, th - 3);
    if (body && cam.oblique) ctx.strokeRect(sx + 1.5, sy + th, cw - 3, cam.riseH * body);
    ctx.setLineDash([]);
  } else {
    const m = ts * 0.12, mh = m * cam.sinP;
    ctx.fillRect(sx + m, sy + mh, cw - 2 * m, th - 2 * mh);
    ctx.strokeStyle = `rgba(${col},.95)`; ctx.lineWidth = 1.5; ctx.strokeRect(sx + m + .5, sy + mh + .5, cw - 2 * m - 1, th - 2 * mh - 1);
    if (ts >= 10) {
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = `bold ${Math.floor(ts * 0.5)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(GLYPH_OF(w), sx + cw / 2, sy + th / 2 + 1);
    }
  }
}

/** All planned pieces whose stand level is visible. */
export function drawSites(game, ctx) {
  const { sim, cam, renderer } = game, v = cam.visible();
  for (const s of sim.ents.ofKind("csite")) {
    if (s.z > renderer.z + 1 || s.x < v.x0 || s.x > v.x1 || s.y < v.y0 || s.y > v.y1) continue;
    const c = costOf(s.w, s.m);
    ghostCell(ctx, cam, s.w, s.x, s.y, { alpha: 0.32, framed: s.got >= (c ? c.n : 1), z: s.z });
    if (s.rv && sim.ents.get(s.rv)) {                     // someone is on it
      const [sx, sy, cw, th] = cam.rect(s.x, s.y, s.x + 1, s.y + 1, s.z);
      ctx.strokeStyle = "#ffe27a"; ctx.lineWidth = 1.5; ctx.strokeRect(sx + .5, sy + .5, cw - 1, th - 1);
    }
  }
}

/** Pieces marked for taking down: a red cross over the built piece. */
export function drawMarks(game, ctx) {
  const { sim, cam, renderer } = game, v = cam.visible();
  ctx.strokeStyle = "rgba(240,90,80,.95)"; ctx.lineWidth = 2;
  for (const d of sim.ents.ofKind("dsite")) {
    if (d.z > renderer.z + 1 || d.x < v.x0 || d.x > v.x1 || d.y < v.y0 || d.y > v.y1) continue;
    const [sx, sy, cw, th] = cam.rect(d.x, d.y, d.x + 1, d.y + 1, cam.oblique ? d.z + 1 : d.z), mx = cw * 0.15, my = th * 0.15;
    ctx.beginPath(); ctx.moveTo(sx + mx, sy + my); ctx.lineTo(sx + cw - mx, sy + th - my); ctx.moveTo(sx + cw - mx, sy + my); ctx.lineTo(sx + mx, sy + th - my); ctx.stroke();
    if (d.rv && sim.ents.get(d.rv)) { ctx.strokeStyle = "#ffe27a"; ctx.strokeRect(sx + .5, sy + .5, cw - 1, th - 1); ctx.strokeStyle = "rgba(240,90,80,.95)"; }
  }
}

/** Shade the cells of a room: tint by warmth, with the bonus written on it. kind: "warm" (overlay) | "pick" (selected room). */
export function drawRoom(game, ctx, room, kind) {
  const { cam } = game;
  let cx = 0, cy = 0;
  for (const c of room.cells) {
    const [x, y] = World.xyz(c), [sx, sy, cw, th] = cam.rect(x, y, x + 1, y + 1, room.z);
    cx += x; cy += y;
    ctx.fillStyle = kind === "pick" ? "rgba(255,226,122,.18)" : room.enclosed ? `rgba(255,${150 - Math.round(room.warm * 120)},40,${0.22 + room.warm * 0.45})` : "rgba(120,150,255,.14)";
    ctx.fillRect(sx, sy, cw, th);
  }
  if (kind === "pick") {
    ctx.strokeStyle = "#ffe27a"; ctx.lineWidth = 2;
    for (const c of room.cells) {
      const [x, y] = World.xyz(c), [sx, sy, cw, th] = cam.rect(x, y, x + 1, y + 1, room.z);
      for (const [dx, dy, ax, ay, bx, by] of [[1, 0, 1, 0, 1, 1], [-1, 0, 0, 0, 0, 1], [0, 1, 0, 1, 1, 1], [0, -1, 0, 0, 1, 0]]) {
        if (!game.sim.rooms.cellRoom.has(World.idx(x + dx, y + dy, room.z)) || game.sim.rooms.cellRoom.get(World.idx(x + dx, y + dy, room.z)) !== room) {
          ctx.beginPath(); ctx.moveTo(sx + ax * cw, sy + ay * th); ctx.lineTo(sx + bx * cw, sy + by * th); ctx.stroke();
        }
      }
    }
  }
  if (kind === "warm") {
    const [sx, sy] = cam.toScreen(cx / room.n + 0.5, cy / room.n + 0.5, room.z);
    ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const rf = room.enclosed ? roomFire(game.sim, room) : 0;
    const t = room.enclosed ? "warmth +" + room.warm.toFixed(2) + (rf ? " +" + rf.toFixed(2) + " fire" : "") : "open - no warmth";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(t, sx, sy); ctx.fillStyle = "#fff0d0"; ctx.fillText(t, sx, sy);
  }
}

/** Cells marked for mining that are what the map shows in their column (the top cell at or below the viewed level): a purple wash (brighter for the ones villagers dig next) with a dashed edge. */
export function drawMining(game, ctx) {
  const { sim, cam, renderer } = game, z = renderer.z, ts = cam.zoom, v = cam.visible();
  const cellsAt = new Map();                                    // idx -> next? (true = in the queue)
  const put = (i, next) => { const [x, y, cz] = World.xyz(i); if (x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1 && renderer.topAt(x, y) === cz && (next || !cellsAt.has(i))) cellsAt.set(i, next); };
  for (const d of sim.mine.list) {
    if (d.kind === "region") for (const i of regionCells(d)) put(i, false);
    else if (d.cells) for (const i of d.cells) put(i, false);
    for (const i of d.q) put(i, true);
  }
  for (const [i, next] of cellsAt) {
    const [x, y, cz] = World.xyz(i);
    if (!sim.world.isSolid(x, y, cz)) continue;
    const [sx, sy, cw, th] = cam.rect(x, y, x + 1, y + 1, cz + 1);                    // the top of the marked cell
    ctx.fillStyle = next ? "rgba(201,162,255,.5)" : "rgba(201,162,255,.26)"; ctx.fillRect(sx, sy, cw, th);
    if (ts >= 6) { ctx.strokeStyle = next ? "rgba(235,215,255,.95)" : "rgba(201,162,255,.6)"; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.strokeRect(sx + 0.5, sy + 0.5, cw - 1, th - 1); ctx.setLineDash([]); }
  }
}
