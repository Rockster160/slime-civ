// The Blueprints panel (GDD §12.6): saved designs, with stamp, rename-free delete, the
// auto-build flag (R8), and a browser-wide library so designs outlive a game.
import { createPanel, esc, remember } from "./dom.js";
import { needs, bedCount } from "../sim/blueprint.js";
import { itemName } from "./text.js";

const LIB_KEY = "bplib";
export function readLibrary() {
  try { const raw = remember(LIB_KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function writeLibrary(list) { try { remember(LIB_KEY, JSON.stringify(list)); } catch (e) { /* storage full or blocked */ } }

export function createBlueprintPanel(parent, game) {
  const p = createPanel(parent, "bps", "Blueprints");
  p.body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-bp]"); if (!t) return;
    const [act, arg] = t.dataset.bp.split(":"), id = Number(arg);
    const sim = game.sim, bp = sim.bps.list.find(b => b.id === id);
    if (act === "stamp") game.startStamp(id);
    else if (act === "del") sim.apply({ type: "blueprint", op: "remove", id });
    else if (act === "auto") sim.apply({ type: "blueprint", op: "auto", id, on: !(bp && bp.auto) });
    else if (act === "save" && bp) {
      const lib = readLibrary().filter(b => b.name !== bp.name);
      lib.push({ name: bp.name, w: bp.w, h: bp.h, cells: bp.cells }); writeLibrary(lib);
      game.toast("“" + bp.name + "” saved to this browser's library.");
    } else if (act === "lib") {
      const lib = readLibrary(), b = lib[id];
      if (b) { sim.apply({ type: "blueprint", op: "add", bp: b }); game.toast("Added “" + b.name + "” to this game."); }
    } else if (act === "libdel") { const lib = readLibrary(); lib.splice(id, 1); writeLibrary(lib); }
  });
  p.update = () => {
    const { sim, ui } = game, list = sim.bps.list, lib = readLibrary();
    p.show(ui.mode === "build" || list.length > 0);
    p.setHint(list.length ? String(list.length) : "");
    let h = list.length ? "" : `<p class="dim">Nothing saved yet. In build mode choose Capture and drag around a finished building.</p>`;
    for (const b of list) {
      const n = needs(b, {}), cost = Object.keys(n).map(i => n[i] + " " + itemName(i)).join(", ");
      h += `<div class="bp"><b>${esc(b.name)}</b> <span class="dim">${b.w}x${b.h}, ${b.cells.length} pieces, ${bedCount(b)} beds</span>`
        + `<div class="dim2">needs ${esc(cost || "nothing")}</div>`
        + `<div class="btnrow"><button data-bp="stamp:${b.id}" title="Place copies as ghosts. R rotates.">Stamp</button>`
        + `<label class="auto" title="Villagers start a copy by themselves when the village is short of beds (they never design anything themselves)"><input type="checkbox" data-bp="auto:${b.id}" ${b.auto ? "checked" : ""}> auto-build</label>`
        + `<button data-bp="save:${b.id}" title="Keep in this browser's library">Library</button><button data-bp="del:${b.id}" title="Delete">✕</button></div></div>`;
    }
    if (lib.length) {
      h += `<div class="sub">Library <span class="dim">(this browser)</span></div>`;
      lib.forEach((b, i) => { h += `<div class="bp"><b>${esc(b.name)}</b> <span class="dim">${b.w}x${b.h}</span> <button data-bp="lib:${i}">Add to game</button> <button data-bp="libdel:${i}">✕</button></div>`; });
    }
    p.html(h);
  };
  return p;
}
