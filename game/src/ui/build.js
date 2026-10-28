// Build mode (GDD §07, §12.2): a palette of walls / floors / roofs / doors / beds / racks, drag to paint
// ghosts on the viewed level, a cost preview, erase, dig, blueprint capture and stamping.
//
// The mode is registered as game.modes.build = {enter, leave, down, move, up, draw}; input.js runs
// those first. The map level you are VIEWING is the level you build on (stand cell = viewed z), so
// "[" and "]" change it; walls fill that cell, floors are the cell below, roofs the cell above.
// Everything reaches the sim through sim.apply({type:"build" | "erase" | "blueprint" | "order"}).
import { BMAT, checkPlace, costOf, PLACE_NEEDS } from "../sim/build.js";
import { survey } from "../sim/items.js";
import { stampCells, oriented } from "../sim/blueprint.js";
import { ghostCell } from "../render/ghosts.js";
import { esc } from "./dom.js";
import { itemName, BLOCKER_TEXT } from "./text.js";
import { SEEK_ALL as SEEK_ITEMS } from "../sim/mine.js";
import { can } from "../sim/knowledge.js";

const TOOLS = [
  ["wall", "Wall", "Walls block movement and keep the wind out. Drag a rectangle to outline a room."],
  ["floor", "Floor", "A packed-dirt floor (needs dirt from digging)."],
  ["roof", "Roof", "A roof is built one level above. It needs a wall within 3 cells to hold it up. Rooms only get warm when roofed."],
  ["door", "Door", "A door closes a room in but lets villagers through. Built last."],
  ["bed", "Bed", "A leaf bed. Villagers prefer beds in warm rooms when it is cold."],
  ["rack", "Rack", "A drying rack for berries."],
  ["hearth", "Fire ring", "A ring of stakes round a fire: warms people nearby (and a whole closed room), cooks raw food eaten close by. Villagers feed it sticks and logs as a chore. Needs someone who knows how to keep a fire."],
  ["kiln", "Kiln", "A pit lined with clay (4 clay). Burns a batch loaded into it for a day: fired clay, jars, and with charcoal and a draft (a bellows beside it, or place it on a windy ridge) the heat copper needs. Click it afterwards to see its heat and why it is not hotter."],
  ["mound", "Charcoal mound", "A pit of wood covered with earth (4 dirt, from digging). Wood burnt without air becomes charcoal, a hotter fuel."],
  ["bellows", "Bellows", "A bag of air with a clay nozzle (2 fired clay). Put it beside a kiln for a stronger draft."],
  ["workbench", "Workbench", "Where tools are made (2 logs). Put one inside a room set to Workshop and the work comes out better (up to 15%)."],
  ["smoker", "Covered rack", "A rack under a cover of boughs (6 sticks). Put it within three cells of a lit fire ring and meat hung in it keeps."],
  ["forge", "Brick forge", "A lidded, vented furnace of brick (6 bricks). With coal and a second draft (a bellows beside it, or place it on the windy ridge) it reaches heat 5, the Forge level, which iron needs. Click it to see why it is not hotter."],
  ["waterjar", "Water jar", "A jar villagers drink from and fill from the stream as a chore. Put it near where people work, far from water, to save them the walk."],
  ["torch", "Torch", "A stake with a flame (1 stick), set on a tunnel floor. Lights about 5 cells round it: work in its light is not slowed and the tunnel is seen as far as it shines. Needs someone who keeps fire. Villagers also place torches along a tunnel they are digging."],
  ["lamp", "Copper lamp", "A copper-housed lamp (1 copper sheet): a steadier, wider light (about 7 cells). Needs someone who can hammer copper."],
  ["vent", "Vent", "A stick-lined shaft (4 sticks) that moves air: foul air near it is cleared, and a dead-end tunnel next to it stays fresh. Villagers place one beside bad air they have seen."],
  ["shelf", "Shelf", "A shelf (5 sticks). Put them in a room set to Storage: the room becomes a stockpile whose food and hides spoil slower, the better it is."],
  ["field", "Field", "Drag a rectangle of bare grass (up to 12 by 12) to mark a field. Villagers till it, sow seed from the stockpile, water and harvest it as chores. Crops grow in spring and summer; the first frost kills any that are not ripe. Needs someone who has seen a seed come up."],
  ["pen", "Pen", "Drag a rectangle (2 to 8 cells a side) for a hopper pen. Villagers stake out a fence of sticks with a gate on the south side; then the Capture order brings wild hoppers in, grass in the stockpile feeds them and they breed. Needs husbandry."],
  ["cellar", "Cold cellar", "Drag over a room you have dug at least 3 levels down (roofed, reachable): food is carried there and spoils at 40% of the open rate. Use the level buttons to view the room's level first."],
  ["erase", "Erase", "Drag a rectangle to remove planned pieces (delivered materials come back)."],
  ["deconstruct", "Deconstruct", "Drag a rectangle over BUILT walls, floors, roofs, doors, beds and racks to have villagers take them down (about 75% of the materials come back). Erase removes plans; this removes finished pieces."],
  ["dig", "Dig", "Mark ground for villagers to dig as a chore: a region (drag), a stair down (click), a vein to follow (click an ore cell) or an item to seek (flint, malachite, clay). Or order the selected villagers to dig a 5x5 patch."],
  ["capture", "Capture", "Drag a rectangle around a finished building to save it as a blueprint."],
];
const SHAPES = {
  wall: [["box", "Outline"], ["line", "Line"], ["fill", "Fill"]], floor: [["fill", "Fill"], ["line", "Line"], ["box", "Outline"]],
  roof: [["fill", "Fill"], ["box", "Outline"], ["line", "Line"]], door: [["point", "Point"], ["line", "Line"]],
  bed: [["point", "Point"], ["line", "Line"]], rack: [["point", "Point"], ["line", "Line"]], hearth: [["point", "Point"]],
  kiln: [["point", "Point"]], mound: [["point", "Point"]], bellows: [["point", "Point"]], workbench: [["point", "Point"]], waterjar: [["point", "Point"]], smoker: [["point", "Point"]], forge: [["point", "Point"]], torch: [["point", "Point"]], lamp: [["point", "Point"]], vent: [["point", "Point"]], shelf: [["point", "Point"], ["line", "Line"]],
};
const MATS = { wall: ["wattle", "hide", "log", "timber", "stone", "dressed", "brick", "support"], roof: ["thatch", "hideroof", "logroof"], floor: ["dirt", "plank"] };      // S9: a material shows once someone can work it (BMAT.need)
const REASON = { bounds: "outside the map", blocked: "something is in the way", ground: "nothing solid to stand it on", exists: "already planned", stockpile: "that is the stockpile", material: "wrong material", unknown: "nobody in the village knows how to make that yet" };

const RECT_TOOLS = ["field", "pen", "cellar"];
const RECT_COLOR = { field: ["rgba(150,110,60,.28)", "#c49a5a"], pen: ["rgba(200,160,100,.25)", "#e8c070"], cellar: ["rgba(150,200,255,.22)", "#8fc6ff"] };

export function buildState() {
  return { tool: "wall", mat: { wall: "wattle", roof: "thatch", floor: "dirt" }, shape: { wall: "box", floor: "fill", roof: "fill", door: "point", bed: "point", rack: "point", hearth: "point", kiln: "point", mound: "point", bellows: "point", workbench: "point", waterjar: "point", smoker: "point", forge: "point", torch: "point", lamp: "point", vent: "point", shelf: "point" },
    drag: null, bp: null, prevZ: 17, last: "",
    dig: { intent: "region", layers: 3, levels: 6, item: "malachite" } };
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
  const shapeBox = document.createElement("span"), matBox = document.createElement("span"), nameBox = document.createElement("span"), digBox = document.createElement("span");
  rowOpts.append(shapeBox, matBox, nameBox, digBox);
  digBox.className = "bb-dig";
  digBox.addEventListener("keydown", (e) => e.stopPropagation());
  nameBox.innerHTML = `<label>Blueprint name <input class="bp-name" type="text" maxlength="30" value="House"></label>`;
  const nameIn = nameBox.querySelector("input");
  nameIn.addEventListener("keydown", (e) => e.stopPropagation());
  game.bpName = () => nameIn.value.trim() || "Blueprint";

  // stamp row
  rowStamp.innerHTML = `<b class="bs-name"></b> <button class="bs-rot" title="Rotate 90 degrees (R)">Rotate (R)</button>
    <label>Copies <input class="bs-n" type="number" min="1" max="12" value="1"></label>
    <label>Walls <select class="bs-wall"><option value="">same as captured</option><option value="wattle">wattle</option><option value="log">log</option><option value="hide">hide</option><option value="timber">timber</option><option value="stone">dry stone</option><option value="dressed">dressed stone</option><option value="brick">brick</option></select></label>
    <label>Roof <select class="bs-roof"><option value="">same as captured</option><option value="thatch">thatch</option><option value="hideroof">hide</option><option value="logroof">log</option></select></label>
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
  const inMap = (c) => !!c;                          // S16: the land has no edge

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
    leave() { B.drag = null; B.bp = null; ui.reviseBp = 0; renderer.setZ(B.prevZ); },
    down(g, e) {
      if (e.button !== 0) return false;
      const c = cellAt(e);
      if (SHAPES[B.tool] || RECT_TOOLS.includes(B.tool) || B.tool === "erase" || B.tool === "capture" || B.tool === "deconstruct" || (B.tool === "dig" && B.dig.intent === "region")) B.drag = { a: c, b: c };
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
      } else if (RECT_TOOLS.includes(t) && d) {
        const ok = sim.apply({ type: t, x0: d.a.x, y0: d.a.y, x1: c.x, y1: c.y, z });
        const WHAT = { field: "Field marked: villagers till, sow, water and harvest it as chores.", pen: "Pen marked: villagers stake out the fence with sticks, then you can capture hoppers into it.", cellar: "Cold cellar marked: food is carried there from now on." };
        game.toast(ok ? WHAT[t] : "Cannot mark that: " + (BLOCKER_TEXT[sim.lastBlocker] || (t === "cellar" ? "it must be a dug, roofed room at least 3 levels below the surface" : "no free ground there")) + ".");
      } else if (t === "erase" && d) {
        const ok = sim.apply({ type: "erase", x0: d.a.x, y0: d.a.y, x1: c.x, y1: c.y, z }), ok2 = sim.apply({ type: "unzone", x0: d.a.x, y0: d.a.y, x1: c.x, y1: c.y, z });
        game.toast(ok || ok2 ? "Removed. Delivered materials are dropped for hauling; fields, pens and the cellar under the rectangle are cleared." : "No planned pieces there.");
      } else if (t === "deconstruct" && d) {
        const ok = sim.apply({ type: "deconstruct", x0: d.a.x, y0: d.a.y, x1: c.x, y1: c.y, z });
        game.toast(ok ? "Marked for taking down. Villagers do it as a chore and bring the materials back." : "No built pieces on this level in that rectangle.");
      } else if (t === "capture" && d) {
        const rid = ui.reviseBp, rbp = rid && sim.bps.list.find(b => b.id === rid);
        if (rbp) {                                                  // S11: capture over a saved design = revision n+1
          ui.reviseBp = 0;
          const ok = sim.apply({ type: "blueprint", op: "recapture", id: rid, x0: d.a.x, y0: d.a.y, x1: c.x, y1: c.y, z });
          game.toast(ok ? "“" + rbp.name + "” is now revision " + rbp.rev + ". Push it from the Blueprints panel to rebuild the buildings that follow it." : "Nothing changed (or nothing built there): the design stays at revision " + rbp.rev + ".");
        } else {
          const ok = sim.apply({ type: "blueprint", op: "capture", name: game.bpName(), x0: d.a.x, y0: d.a.y, x1: c.x, y1: c.y, z });
          game.toast(ok ? "Blueprint “" + game.bpName() + "” saved (see the Blueprints panel)." : "Nothing built in that rectangle to capture. Drag around a finished building.");
        }
      } else if (t === "dig") {
        const top = game.renderer.topAt(c.x, c.y), I = B.dig.intent, fail = () => { game.toast("Cannot mark that: " + (BLOCKER_TEXT[sim.lastBlocker] || "nothing to dig there") + "."); return true; };
        if (top < 0) return true;
        if (I === "region") {
          const a = d ? d.a : c, zt = game.renderer.topAt(a.x, a.y);
          if (zt < 0) return true;
          if (!sim.apply({ type: "mine", op: "region", x0: a.x, y0: a.y, x1: c.x, y1: c.y, z: zt, layers: B.dig.layers })) return fail();
          game.toast(`Marked ${Math.abs(c.x - a.x) + 1} x ${Math.abs(c.y - a.y) + 1} to dig, ${B.dig.layers} level${B.dig.layers === 1 ? "" : "s"} down (stepped on one side so villagers can climb out). Villagers dig it as a chore.`);
        } else if (I === "depth") {
          if (!sim.apply({ type: "mine", op: "depth", x: c.x, y: c.y, z: top + 1, levels: B.dig.levels })) return fail();
          game.toast(`Stair down ${B.dig.levels} levels marked. Villagers dig it as a chore.`);
        } else if (I === "vein") {
          if (!sim.apply({ type: "mine", op: "vein", x: c.x, y: c.y, z: top })) return fail();
          game.toast("Following that vein: villagers dig the connected cells as they uncover them.");
        } else if (I === "seek") {
          if (!sim.apply({ type: "mine", op: "seek", item: B.dig.item, x: c.x, y: c.y })) return fail();
          game.toast(`Looking for ${itemName(B.dig.item)} around that spot: they tunnel in a pattern and dig what they uncover. They only know what they have seen.`);
        } else {
          const vs = ui.sel.map(id => sim.ents.get(id)).filter(v => v && v.kind === "villager");
          if (!vs.length) { game.toast("Select villagers first, then click rock or soil to order a dig."); return true; }
          const ok = sim.apply({ type: "order", ids: vs.map(v => v.id), verb: "dig", x: c.x, y: c.y, z: top });
          game.toast(ok ? "Dig order: " + vs.length + " villager" + (vs.length === 1 ? "" : "s") + "." : "They are already digging there.");
        }
      } else if (t === "stamp" && B.bp) {
        const bp = sim.bps.list.find(b => b.id === B.bp.id); if (!bp) return true;
        const dims = oriented(bp, B.bp.rot, B.bp.over);
        let placed = 0, blocked = 0;
        for (let i = 0; i < B.bp.count; i++) {       // each copy is its own build command (one group, supports-first within it)
          const cells = stampCells(bp, c.x + i * (dims.w + 1), c.y, z, B.bp.rot, B.bp.over);
          const good = cells.filter(q => !checkPlace(sim, q.w, q.m, q.x, q.y, q.z));
          if (good.length === cells.length && sim.apply({ type: "build", bp: bp.id, cells, at: { ox: c.x + i * (dims.w + 1), oy: c.y, z, rot: B.bp.rot, over: { ...B.bp.over } } })) placed++; else blocked++;
        }
        game.toast(placed ? `Stamped ${placed} cop${placed === 1 ? "y" : "ies"} of “${bp.name}”.` + (blocked ? ` ${blocked} did not fit.` : "") : "It does not fit there (red cells are blocked).");
      }
      return true;
    },
    draw(g, ctx) {
      const t = B.tool, z = level();
      const cells = validate(pending());
      for (const c of cells) ghostCell(ctx, cam, c.w, c.x, c.y, { alpha: 0.5, bad: c.bad });
      if (RECT_TOOLS.includes(t)) {
        const a = B.drag ? B.drag.a : mouseCell(), b = B.drag ? B.drag.b : a;
        if (inMap(a)) {
          const [ax, ay] = cam.toScreen(Math.min(a.x, b.x), Math.min(a.y, b.y)), [bx, by] = cam.toScreen(Math.max(a.x, b.x) + 1, Math.max(a.y, b.y) + 1);
          ctx.fillStyle = RECT_COLOR[t][0]; ctx.strokeStyle = RECT_COLOR[t][1]; ctx.lineWidth = 2; ctx.fillRect(ax, ay, bx - ax, by - ay); ctx.strokeRect(ax, ay, bx - ax, by - ay);
        }
      }
      if (B.drag && (t === "erase" || t === "capture" || t === "deconstruct" || t === "dig")) {
        const { a, b } = B.drag, [ax, ay] = cam.toScreen(Math.min(a.x, b.x), Math.min(a.y, b.y)), [bx, by] = cam.toScreen(Math.max(a.x, b.x) + 1, Math.max(a.y, b.y) + 1);
        const red = t !== "capture" && t !== "dig"; ctx.fillStyle = t === "dig" ? "rgba(201,162,255,.28)" : red ? "rgba(230,70,60,.18)" : "rgba(124,196,255,.18)"; ctx.strokeStyle = t === "dig" ? "#c9a2ff" : red ? "#e6463c" : "#7cc4ff"; ctx.lineWidth = 2;
        ctx.fillRect(ax, ay, bx - ax, by - ay); ctx.strokeRect(ax, ay, bx - ax, by - ay);
      } else if (!B.drag && (t === "erase" || t === "capture" || t === "dig" || t === "deconstruct")) {
        const c = mouseCell();
        if (inMap(c)) {
          const [sx, sy] = cam.toScreen(c.x, c.y);
          ctx.strokeStyle = t === "erase" || t === "deconstruct" ? "#e6463c" : t === "dig" ? "#c9a2ff" : "#7cc4ff"; ctx.lineWidth = 2;
          if (t === "dig" && B.dig.intent === "order") ctx.strokeRect(sx - 2 * cam.zoom, sy - 2 * cam.zoom, 5 * cam.zoom, 5 * cam.zoom); else ctx.strokeRect(sx, sy, cam.zoom, cam.zoom);
        }
      }
      status._cost = cells.length ? costText(cells) : "";
      void z;
    },
  };

  digBox.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dig]"), it = e.target.closest("[data-ditem]"), cn = e.target.closest("[data-dig-cancel]");
    if (b) { B.dig.intent = b.dataset.dig; B.drag = null; }
    if (it) B.dig.item = it.dataset.ditem;
    if (cn && !cn.disabled) { game.sim.apply({ type: "mine", op: "cancel" }); game.toast("Marked digs cancelled."); }
  });
  digBox.addEventListener("change", (e) => {
    const l = e.target.closest(".dg-layers"), v = e.target.closest(".dg-levels");
    if (l) B.dig.layers = Math.max(1, Math.min(12, Number(l.value) || 1));
    if (v) B.dig.levels = Math.max(1, Math.min(12, Number(v.value) || 1));
  });
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
      const fireOk = can(game.sim, "FIRE_TENDING");
      toolBtns.hearth.disabled = !fireOk; toolBtns.hearth.style.opacity = fireOk ? "" : "0.5";
      toolBtns.hearth.title = fireOk ? TOOLS.find(q => q[0] === "hearth")[2] : "Nobody knows how to keep a fire yet. Fire is found, not researched: watch for lightning, or let villagers experiment.";
      for (const k of ["kiln", "mound", "bellows", "waterjar", "smoker", "forge"]) {          // S7b: stations appear once someone knows the craft behind them (the palette never spoils what is still to find)
        const ok = PLACE_NEEDS[k].some(c => can(game.sim, c));
        toolBtns[k].style.display = ok ? "" : "none";
        if (!ok && B.tool === k) B.tool = "wall";
      }
      for (const k of ["torch", "lamp"]) {                                                     // S12: light appears once someone can make it
        const ok = PLACE_NEEDS[k].some(c => can(game.sim, c));
        toolBtns[k].style.display = ok ? "" : "none";
        if (!ok && B.tool === k) B.tool = "wall";
      }
      toolBtns.field.style.display = can(game.sim, "CULTIVATION") ? "" : "none";            // S10: farming and pens appear once the village knows them
      toolBtns.pen.style.display = can(game.sim, "HUSBANDRY") ? "" : "none";
      if ((t === "field" && !can(game.sim, "CULTIVATION")) || (t === "pen" && !can(game.sim, "HUSBANDRY"))) B.tool = "wall";
      sp.textContent = "Level " + renderer.z;
      rowOpts.style.display = SHAPES[t] || t === "capture" || t === "dig" ? "flex" : "none";
      digBox.style.display = t === "dig" ? "" : "none";
      if (t === "dig") {
        const D = B.dig, n = game.sim.mine.list.length;
        const key = JSON.stringify(D) + "|" + game.sim.mine.list.map(d => d.id + d.kind).join();
        if (key !== digBox._k) {
          digBox._k = key;
          const INT = [["region", "Region (drag)", "Drag a box over what you see. It digs that many levels down."], ["depth", "Stair down (click)", "A straight stair going down from the cell you click."], ["vein", "Follow vein (click)", "Click a coloured ore or clay cell you have uncovered; villagers keep digging the cells connected to it."], ["seek", "Seek (click)", "Pick an item, then click where to start looking. They tunnel in a pattern through unseen rock until they sight it."], ["order", "Order selected (click)", "Send the selected villagers to dig a 5x5 patch."]];
          let h = `<span class="dim">Dig</span> ` + INT.map(([k, l, tip]) => `<button data-dig="${k}" title="${esc(tip)}" class="${D.intent === k ? "on" : ""}">${l}</button>`).join("");
          if (D.intent === "region") h += ` <label>Levels down <input class="dg-layers" type="number" min="1" max="12" value="${D.layers}" style="width:3.2em"></label>`;
          if (D.intent === "depth") h += ` <label>Levels <input class="dg-levels" type="number" min="1" max="12" value="${D.levels}" style="width:3.2em"></label>`;
          if (D.intent === "seek") h += ` ` + SEEK_ITEMS.map(k => `<button data-ditem="${k}" class="${D.item === k ? "on" : ""}">${esc(itemName(k))}</button>`).join("");
          h += ` <button data-dig-cancel="1" title="Cancel every marked dig" ${n ? "" : "disabled"}>Cancel digs${n ? " (" + n + ")" : ""}</button>`;
          digBox.innerHTML = h;
        }
      }
      rowStamp.style.display = t === "stamp" ? "flex" : "none";
      const bp = B.bp && game.sim.bps.list.find(b => b.id === B.bp.id);
      if (t === "stamp" && !bp) { B.bp = null; B.tool = "wall"; }
      if (bp) qs(".bs-name").textContent = "Stamping “" + bp.name + "”" + (B.bp.rot ? " (rotated " + B.bp.rot * 90 + "°)" : "");
      shapeBox.style.display = SHAPES[t] ? "" : "none"; matBox.style.display = MATS[t] ? "" : "none"; nameBox.style.display = t === "capture" ? "" : "none";
      const known = MATS[t] ? MATS[t].filter(k => !BMAT[k].need || can(game.sim, BMAT[k].need)) : [];
      if (MATS[t] && !known.includes(B.mat[t])) B.mat[t] = known[0];
      const key = t + JSON.stringify(B.shape) + JSON.stringify(B.mat) + known.join();
      if (key !== lastKey) {
        lastKey = key;
        shapeBox.innerHTML = SHAPES[t] ? `<span class="dim">Shape</span> ` + SHAPES[t].map(([k, l]) => `<button data-shape="${k}" class="${B.shape[t] === k ? "on" : ""}">${l}</button>`).join("") : "";
        matBox.innerHTML = MATS[t] ? `<span class="dim">Material</span> ` + known.map(k => `<button data-mat="${k}" class="${B.mat[t] === k ? "on" : ""}" title="${esc(costOf(t, k).n + " " + itemName(costOf(t, k).item) + " each")}">${esc(BMAT[k].label)}</button>`).join("") : "";
      }
      toolBtns.capture.style.display = game.unlocked("blueprints") ? "" : "none";
      if (t === "capture" && !game.unlocked("blueprints")) B.tool = "wall";
      const DH = { region: "Drag a box over the ground to dig. [ ] changes the level you see.", depth: "Click where the stair should start.", vein: "Click an ore or clay cell you have uncovered.", seek: "Click where to start looking.", order: "Select villagers, then click rock or soil." };
      const help = t === "dig" ? DH[B.dig.intent] : t === "field" ? "Drag a rectangle of bare grass for a field (up to 12 by 12)." : t === "pen" ? "Drag a rectangle, 2 to 8 cells a side, for a hopper pen." : t === "cellar" ? "Drag over a dug, roofed room at least 3 levels below the surface (view its level first)." : t === "capture" ? (ui.reviseBp ? "Drag around the edited building to capture it as the next revision of the design." : "Drag a rectangle around a finished building.") : t === "deconstruct" ? "Drag over finished pieces to take them down." : t === "erase" ? "Drag over planned pieces to remove them." : t === "stamp" ? "Click to place; R rotates; right-click stops." : SHAPES[t] ? "Drag on the map to plan. Right-click cancels." : "";
      const cost = status._cost || "";
      const h = `<span class="dim">${esc(help)}</span> ${cost}`;
      if (h !== status._h) { status._h = h; status.innerHTML = h; }
    },
  };
}
