// Build mode (GDD §07, §12.2): a palette of walls / floors / roofs / doors / beds / racks, drag to paint
// ghosts on the viewed level, a cost preview, erase, dig, blueprint capture and stamping.
//
// The mode is registered as game.modes.build = {enter, leave, down, move, up, draw}; input.js runs
// those first. The map level you are VIEWING is the level you build on (stand cell = viewed z), so
// "[" and "]" change it; walls fill that cell, floors are the cell below, roofs the cell above.
// Everything reaches the sim through sim.apply({type:"build" | "erase" | "blueprint" | "order"}).
import { BMAT, checkPlace, costOf } from "../sim/build.js";
import { survey } from "../sim/items.js";
import { stampCells, oriented } from "../sim/blueprint.js";
import { ghostCell } from "../render/ghosts.js";
import { esc } from "./dom.js";
import { itemName } from "./text.js";

const TOOLS = [
  ["wall", "Wall", "Walls block movement and keep the wind out. Drag a rectangle to outline a room."],
  ["floor", "Floor", "A packed-dirt floor (needs dirt from digging)."],
  ["roof", "Roof", "A roof is built one level above. It needs a wall within 3 cells to hold it up. Rooms only get warm when roofed."],
  ["door", "Door", "A door closes a room in but lets villagers through. Built last."],
  ["bed", "Bed", "A leaf bed. Villagers prefer beds in warm rooms when it is cold."],
  ["rack", "Rack", "A drying rack for berries."],
  ["erase", "Erase", "Drag a rectangle to remove planned pieces (delivered materials come back)."],
  ["deconstruct", "Deconstruct", "Drag a rectangle over BUILT walls, floors, roofs, doors, beds and racks to have villagers take them down (about 75% of the materials come back). Erase removes plans; this removes finished pieces."],
  ["dig", "Dig", "Order the selected villagers to dig out the rock or soil you click (a 5x5 patch). Gives stone and dirt."],
  ["capture", "Capture", "Drag a rectangle around a finished building to save it as a blueprint."],
];
const SHAPES = {
  wall: [["box", "Outline"], ["line", "Line"], ["fill", "Fill"]], floor: [["fill", "Fill"], ["line", "Line"], ["box", "Outline"]],
  roof: [["fill", "Fill"], ["box", "Outline"], ["line", "Line"]], door: [["point", "Point"], ["line", "Line"]],
  bed: [["point", "Point"], ["line", "Line"]], rack: [["point", "Point"], ["line", "Line"]],
};
const MATS = { wall: ["wattle", "log", "stone"], roof: ["thatch", "logroof"], floor: ["dirt"] };
const REASON = { bounds: "outside the map", blocked: "something is in the way", ground: "nothing solid to stand it on", exists: "already planned", stockpile: "that is the stockpile", material: "wrong material" };

export function buildState() {
  return { tool: "wall", mat: { wall: "wattle", roof: "thatch", floor: "dirt" }, shape: { wall: "box", floor: "fill", roof: "fill", door: "point", bed: "point", rack: "point" },
    drag: null, bp: null, prevZ: 17, last: "" };
}

/** Cells of a drag from a to b for a shape. */
export function shapeCells(shape, a, b) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y), out = [];
  if (shape === "point") return [{ x: a.x, y: a.y }];
  if (shape === "line") {
    if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) for (let x = x0; x <= x1; x++) out.push({ x, y: a.y });
    else for (let y = y0; y <= y1; y++) out.push({ x: a.x, y });
    return out;
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (shape === "fill" || x === x0 || x === x1 || y === y0 || y === y1) out.push({ x, y });
  return out;
}

export function createBuildMode(game, root) {
  const { ui, cam, renderer } = game;
  const B = ui.build = buildState();
  root.innerHTML = `<div class="bb-row bb-tools"></div><div class="bb-row bb-opts"></div><div class="bb-row bb-stamp" style="display:none"></div><div class="bb-status"></div>`;
  const rowTools = root.querySelector(".bb-tools"), rowOpts = root.querySelector(".bb-opts"), rowStamp = root.querySelector(".bb-stamp"), status = root.querySelector(".bb-status");
  const btn = (parent, label, title, fn, cls = "") => { const b = document.createElement("button"); b.textContent = label; b.title = title; if (cls) b.className = cls; b.onclick = fn; parent.appendChild(b); return b; };

  const toolBtns = {};
  for (const [k, label, tip] of TOOLS) toolBtns[k] = btn(rowTools, label, tip, () => setTool(k), "tool-" + k);
  const sp = document.createElement("span"); sp.className = "bb-lvl"; rowTools.appendChild(sp);
  btn(rowTools, "−", "View and build one level lower ([)", () => renderer.setZ(renderer.z - 1));
  btn(rowTools, "+", "View and build one level higher (])", () => renderer.setZ(renderer.z + 1));
  btn(rowTools, "Done", "Leave build mode (Esc or B)", () => game.setMode("select"), "bb-done");

  // options row: shape + material buttons for the current tool, the capture name
  const shapeBox = document.createElement("span"), matBox = document.createElement("span"), nameBox = document.createElement("span");
  rowOpts.append(shapeBox, matBox, nameBox);
  nameBox.innerHTML = `<label>Blueprint name <input class="bp-name" type="text" maxlength="30" value="House"></label>`;
  const nameIn = nameBox.querySelector("input");
  nameIn.addEventListener("keydown", (e) => e.stopPropagation());
  game.bpName = () => nameIn.value.trim() || "Blueprint";

  // stamp row
  rowStamp.innerHTML = `<b class="bs-name"></b> <button class="bs-rot" title="Rotate 90 degrees (R)">Rotate (R)</button>
    <label>Copies <input class="bs-n" type="number" min="1" max="12" value="1"></label>
    <label>Walls <select class="bs-wall"><option value="">same as captured</option><option value="wattle">wattle</option><option value="log">log</option><option value="stone">dry stone</option></select></label>
    <label>Roof <select class="bs-roof"><option value="">same as captured</option><option value="thatch">thatch</option><option value="logroof">log</option></select></label>
    <button class="bs-x">Stop</button>`;
  const qs = (s) => rowStamp.querySelector(s);
  qs(".bs-rot").onclick = () => rotate();
  qs(".bs-x").onclick = () => { B.bp = null; setTool("wall"); };
  for (const s of [".bs-n"]) qs(s).addEventListener("keydown", (e) => e.stopPropagation());
  qs(".bs-n").onchange = () => { if (B.bp) B.bp.count = Math.max(1, Math.min(12, Number(qs(".bs-n").value) || 1)); };
  qs(".bs-wall").onchange = () => { if (B.bp) B.bp.over.wall = qs(".bs-wall").value; };
  qs(".bs-roof").onchange = () => { if (B.bp) B.bp.over.roof = qs(".bs-roof").value; };

  function setTool(k) { B.tool = k; B.drag = null; if (k !== "stamp") B.bp = null; }
  function rotate() { if (B.bp) B.bp.rot = (B.bp.rot + 1) % 4; }
  /** Start stamping blueprint `id` (called by the Blueprints panel). */
  game.startStamp = (id) => {
    const bp = game.sim.bps.list.find(b => b.id === id); if (!bp) return;
    if (ui.mode !== "build") game.setMode("build");
    B.tool = "stamp"; B.drag = null; B.bp = { id, rot: 0, count: 1, over: { wall: "", roof: "", floor: "" } };
    qs(".bs-n").value = 1; qs(".bs-wall").value = ""; qs(".bs-roof").value = "";
  };
  game.buildRotate = rotate;
  game.buildErase = () => setTool("erase");

  // ---- geometry helpers ----
  const level = () => renderer.z;
  function cellAt(e) {
    const [wx, wy] = cam.toWorld(e.clientX, e.clientY);
    return { x: Math.floor(wx), y: Math.floor(wy) };
  }
  function mouseCell() { return ui.mouse && ui.mouse.over ? (() => { const [wx, wy] = cam.toWorld(ui.mouse.x, ui.mouse.y); return { x: Math.floor(wx), y: Math.floor(wy) }; })() : null; }
  const inMap = (c) => c && c.x >= 0 && c.y >= 0 && c.x < 128 && c.y < 128;

  /** What the current drag/hover would place: [{w, m, x, y, z, bad}] */
  function pending() {
    const z = level(), t = B.tool;
    if (SHAPES[t]) {
      const a = B.drag ? B.drag.a : mouseCell(), b = B.drag ? B.drag.b : a;
      if (!inMap(a)) return [];
      return shapeCells(B.drag ? B.shape[t] : "point", a, b).map(c => ({ w: t, m: BMAT[B.mat[t]] ? B.mat[t] : "", ...c, z }));
    }
    if (t === "stamp" && B.bp) {
      const bp = game.sim.bps.list.find(b => b.id === B.bp.id), c = mouseCell();
      if (!bp || !inMap(c)) return [];
      const dims = oriented(bp, B.bp.rot, B.bp.over), out = [];
      for (let i = 0; i < B.bp.count; i++) out.push(...stampCells(bp, c.x + i * (dims.w + 1), c.y, z, B.bp.rot, B.bp.over));
      return out;
    }
    return [];
  }
  const validate = (cells) => cells.map(c => { const r = checkPlace(game.sim, c.w, c.m, c.x, c.y, c.z); return { ...c, bad: !!r, why: r }; });

  function costText(cells) {
    const sv = survey(game.sim), need = {};
    let ok = 0, bad = 0; const reasons = {};
    for (const c of cells) {
      if (c.bad) { bad++; reasons[c.why] = (reasons[c.why] || 0) + 1; continue; }
      ok++; const k = costOf(c.w, c.m); need[k.item] = (need[k.item] || 0) + k.n;
    }
    const parts = Object.keys(need).map(i => `${need[i]} ${itemName(i)} <span class="${sv.stock[i] >= need[i] ? "dim" : "short"}">(stock ${sv.stock[i]})</span>`);
    let h = ok ? `<b>${ok}</b> piece${ok === 1 ? "" : "s"}: needs ${parts.join(", ")}` : "";
    if (bad) h += `${ok ? " · " : ""}<span class="short">${bad} cell${bad === 1 ? "" : "s"} can't be placed (${Object.keys(reasons).map(r => REASON[r] || r).join(", ")})</span>`;
    return h;
  }

  // ---- the mode ----
  game.modes.build = {
    enter(g) { B.prevZ = renderer.z; renderer.setZ(g.sim.stock.z); B.drag = null; },
    leave() { B.drag = null; B.bp = null; renderer.setZ(B.prevZ); },
    down(g, e) {
      if (e.button !== 0) return false;
      const c = cellAt(e);
      if (SHAPES[B.tool] || B.tool === "erase" || B.tool === "capture" || B.tool === "deconstruct") B.drag = { a: c, b: c };
      return false;
    },
    move(g, e) {
      ui.box = null;
      if (B.drag) B.drag.b = cellAt(e);
    },
    up(g, e, p) {
      if (e.button === 2 && !p.moved) { if (B.drag || B.bp) { B.drag = null; B.bp = null; if (B.tool === "stamp") B.tool = "wall"; } else game.setMode("select"); return true; }
      if (e.button !== 0) return false;
      const c = cellAt(e), z = level(), sim = game.sim, t = B.tool;
      const d = B.drag; B.drag = null;
      if (!inMap(c)) return true;
      if (SHAPES[t] && d) {
        const cells = validate(shapeCells(B.shape[t], d.a, c).map(q => ({ w: t, m: BMAT[B.mat[t]] ? B.mat[t] : "", ...q, z })));
        const good = cells.filter(q => !q.bad);
        if (!good.length) { game.toast("Nothing to plan there: " + (REASON[cells[0] && cells[0].why] || "no valid cells") + "."); return true; }
        sim.apply({ type: "build", cells: good.map(({ w, m, x, y, z: zz }) => ({ w, m, x, y, z: zz })) });
        game.toast(`Planned ${good.length} ${t}${good.length === 1 ? "" : "s"}. Villagers fetch the materials and build them as ordinary chores.`);
      } else if (t === "erase" && d) {
        const ok = sim.apply({ type: "erase", x0: d.a.x, y0: d.a.y, x1: c.x, y1: c.y, z });
        game.toast(ok ? "Planned pieces removed; delivered materials are dropped for hauling." : "No planned pieces there.");
      } else if (t === "deconstruct" && d) {
        const ok = sim.apply({ type: "deconstruct", x0: d.a.x, y0: d.a.y, x1: c.x, y1: c.y, z });
        game.toast(ok ? "Marked for taking down. Villagers do it as a chore and bring the materials back." : "No built pieces on this level in that rectangle.");
      } else if (t === "capture" && d) {
        const ok = sim.apply({ type: "blueprint", op: "capture", name: game.bpName(), x0: d.a.x, y0: d.a.y, x1: c.x, y1: c.y, z });
        game.toast(ok ? "Blueprint “" + game.bpName() + "” saved (see the Blueprints panel)." : "Nothing built in that rectangle to capture. Drag around a finished building.");
      } else if (t === "dig") {
        const vs = ui.sel.map(id => sim.ents.get(id)).filter(v => v && v.kind === "villager");
        if (!vs.length) { game.toast("Select villagers first, then click rock or soil to dig."); return true; }
        const top = game.renderer.tops[c.y * 128 + c.x];
        if (top < 0) return true;
        const ok = sim.apply({ type: "order", ids: vs.map(v => v.id), verb: "dig", x: c.x, y: c.y, z: top });
        game.toast(ok ? "Dig order: " + vs.length + " villager" + (vs.length === 1 ? "" : "s") + "." : "They are already digging there.");
      } else if (t === "stamp" && B.bp) {
        const bp = sim.bps.list.find(b => b.id === B.bp.id); if (!bp) return true;
        const dims = oriented(bp, B.bp.rot, B.bp.over);
        let placed = 0, blocked = 0;
        for (let i = 0; i < B.bp.count; i++) {       // each copy is its own build command (one group, supports-first within it)
          const cells = stampCells(bp, c.x + i * (dims.w + 1), c.y, z, B.bp.rot, B.bp.over);
          const good = cells.filter(q => !checkPlace(sim, q.w, q.m, q.x, q.y, q.z));
          if (good.length === cells.length && sim.apply({ type: "build", bp: bp.id, cells })) placed++; else blocked++;
        }
        game.toast(placed ? `Stamped ${placed} cop${placed === 1 ? "y" : "ies"} of “${bp.name}”.` + (blocked ? ` ${blocked} did not fit.` : "") : "It does not fit there (red cells are blocked).");
      }
      return true;
    },
    draw(g, ctx) {
      const t = B.tool, z = level();
      const cells = validate(pending());
      for (const c of cells) ghostCell(ctx, cam, c.w, c.x, c.y, { alpha: 0.5, bad: c.bad });
      if (B.drag && (t === "erase" || t === "capture" || t === "deconstruct")) {
        const { a, b } = B.drag, [ax, ay] = cam.toScreen(Math.min(a.x, b.x), Math.min(a.y, b.y)), [bx, by] = cam.toScreen(Math.max(a.x, b.x) + 1, Math.max(a.y, b.y) + 1);
        const red = t !== "capture"; ctx.fillStyle = red ? "rgba(230,70,60,.18)" : "rgba(124,196,255,.18)"; ctx.strokeStyle = red ? "#e6463c" : "#7cc4ff"; ctx.lineWidth = 2;
        ctx.fillRect(ax, ay, bx - ax, by - ay); ctx.strokeRect(ax, ay, bx - ax, by - ay);
      } else if (!B.drag && (t === "erase" || t === "capture" || t === "dig" || t === "deconstruct")) {
        const c = mouseCell();
        if (inMap(c)) {
          const [sx, sy] = cam.toScreen(c.x, c.y);
          ctx.strokeStyle = t === "erase" || t === "deconstruct" ? "#e6463c" : t === "dig" ? "#c9a2ff" : "#7cc4ff"; ctx.lineWidth = 2;
          if (t === "dig") ctx.strokeRect(sx - 2 * cam.zoom, sy - 2 * cam.zoom, 5 * cam.zoom, 5 * cam.zoom); else ctx.strokeRect(sx, sy, cam.zoom, cam.zoom);
        }
      }
      status._cost = cells.length ? costText(cells) : "";
      void z;
    },
  };

  let lastKey = "";
  root.addEventListener("click", (e) => {            // delegated: the shape / material buttons are rebuilt per tool
    const s = e.target.closest("[data-shape]"), m = e.target.closest("[data-mat]");
    if (s) { B.shape[B.tool] = s.dataset.shape; lastKey = ""; }
    if (m) { B.mat[B.tool] = m.dataset.mat; lastKey = ""; }
  });
  return {
    update() {
      const on = ui.mode === "build";
      root.style.display = on ? "block" : "none";
      if (!on) return;
      const t = B.tool;
      for (const k in toolBtns) toolBtns[k].classList.toggle("on", k === t);
      sp.textContent = "Level " + renderer.z;
      rowOpts.style.display = SHAPES[t] || t === "capture" ? "flex" : "none";
      rowStamp.style.display = t === "stamp" ? "flex" : "none";
      const bp = B.bp && game.sim.bps.list.find(b => b.id === B.bp.id);
      if (t === "stamp" && !bp) { B.bp = null; B.tool = "wall"; }
      if (bp) qs(".bs-name").textContent = "Stamping “" + bp.name + "”" + (B.bp.rot ? " (rotated " + B.bp.rot * 90 + "°)" : "");
      shapeBox.style.display = SHAPES[t] ? "" : "none"; matBox.style.display = MATS[t] ? "" : "none"; nameBox.style.display = t === "capture" ? "" : "none";
      const key = t + JSON.stringify(B.shape) + JSON.stringify(B.mat);
      if (key !== lastKey) {
        lastKey = key;
        shapeBox.innerHTML = SHAPES[t] ? `<span class="dim">Shape</span> ` + SHAPES[t].map(([k, l]) => `<button data-shape="${k}" class="${B.shape[t] === k ? "on" : ""}">${l}</button>`).join("") : "";
        matBox.innerHTML = MATS[t] ? `<span class="dim">Material</span> ` + MATS[t].map(k => `<button data-mat="${k}" class="${B.mat[t] === k ? "on" : ""}" title="${esc(costOf(t, k).n + " " + itemName(costOf(t, k).item) + " each")}">${esc(BMAT[k].label)}</button>`).join("") : "";
      }
      const help = t === "dig" ? "Select villagers, then click rock or soil." : t === "capture" ? "Drag a rectangle around a finished building." : t === "deconstruct" ? "Drag over finished pieces to take them down." : t === "erase" ? "Drag over planned pieces to remove them." : t === "stamp" ? "Click to place; R rotates; right-click stops." : SHAPES[t] ? "Drag on the map to plan. Right-click cancels." : "";
      const cost = status._cost || "";
      const h = `<span class="dim">${esc(help)}</span> ${cost}`;
      if (h !== status._h) { status._h = h; status.innerHTML = h; }
    },
  };
}
