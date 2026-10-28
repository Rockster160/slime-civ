// The Blueprints panel (GDD §12.6): saved designs, with stamp, rename-free delete, the
// auto-build flag (R8), and a browser-wide library so designs outlive a game.
import { createPanel, esc, remember } from "./dom.js";
import { needs, bedCount, instancesOf, pendingWork } from "../sim/blueprint.js";
import { BMAT } from "../sim/build.js";
import { can } from "../sim/knowledge.js";
import { itemName } from "./text.js";

const LIB_KEY = "bplib";
/** Redraw presets for the shelter ladder (K10): a design in other material classes. A preset shows once its wall material can be worked. */
const PRESETS = [["hide", "Hide", { wall: "hide", roof: "hideroof" }], ["timber", "Timber", { wall: "timber", roof: "logroof", floor: "plank" }], ["dressed", "Dressed stone", { wall: "dressed", roof: "logroof" }], ["brick", "Brick", { wall: "brick", roof: "logroof", floor: "plank" }]];
export function readLibrary() {
  try { const raw = remember(LIB_KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function writeLibrary(list) { try { remember(LIB_KEY, JSON.stringify(list)); } catch (e) { /* storage full or blocked */ } }

export function createBlueprintPanel(parent, game) {
  const p = createPanel(parent, "bps", "Blueprints");
  p.body.addEventListener("change", (e) => {
    const t = e.target.closest("select[data-bp]"); if (!t || !t.value) return;
    const sim = game.sim, id = Number(t.dataset.bp.split(":")[1]), bp = sim.bps.list.find(b => b.id === id);
    const pr = PRESETS.find(q => q[0] === t.value);
    if (bp && pr && sim.apply({ type: "blueprint", op: "retheme", id, ...pr[2] })) game.toast("“" + bp.name + "” is now revision " + bp.rev + " in " + pr[1].toLowerCase() + ". Push it to rebuild the buildings.");
    else if (bp && pr) game.toast("That is already how it is drawn.");
    t.value = "";
  });
  p.body.addEventListener("click", (e) => {
    if (e.target.closest("select")) return;
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
    } else if (act === "revise") { game.ui.reviseBp = id; if (game.ui.mode !== "build") game.setMode("build"); game.ui.build.tool = "capture"; game.toast("Drag around the edited building to capture it over “" + bp.name + "” as the next revision.");
    } else if (act === "push") {
      const n = instancesOf(sim, id).filter(i => i.rev < bp.rev).length;
      if (sim.apply({ type: "blueprint", op: "push", id })) game.toast("Revision " + bp.rev + " pushed to " + n + (n === 1 ? " building" : " buildings") + ": villagers rebuild only what differs.");
      else if (n && sim.apply({ type: "blueprint", op: "push", id, force: true })) game.toast("Some buildings were changed by hand; pushed anyway.");
      else game.toast("Every building is already on revision " + bp.rev + ".");
    } else if (act === "libdel") { const lib = readLibrary(); lib.splice(id, 1); writeLibrary(lib); }
  });
  p.update = () => {
    const { sim, ui } = game, list = sim.bps.list, lib = readLibrary();
    p.show(ui.mode === "build" || list.length > 0);
    p.setHint(list.length ? String(list.length) : "");
    let h = list.length ? "" : `<p class="dim">Nothing saved yet. In build mode choose Capture and drag around a finished building.</p>`;
    for (const b of list) {
      const n = needs(b, {}), cost = Object.keys(n).map(i => n[i] + " " + itemName(i)).join(", ");
      const inst = instancesOf(sim, b.id), behind = inst.filter(i => i.rev < b.rev), left = inst.reduce((a, i) => a + pendingWork(sim, b, i), 0);
      const presets = PRESETS.filter(q => BMAT[q[2].wall] && (!BMAT[q[2].wall].need || can(sim, BMAT[q[2].wall].need)));
      h += `<div class="bp"><b>${esc(b.name)}</b> <span class="dim">${b.w}x${b.h}, ${b.cells.length} pieces, ${bedCount(b)} beds</span> <span class="rev" title="Editing a design makes the next revision; Push rebuilds the buildings that follow it">rev ${b.rev || 1}</span>`
        + `<div class="dim2">needs ${esc(cost || "nothing")}</div>`
        + (inst.length ? `<div class="dim2">${inst.length} ${inst.length === 1 ? "building follows" : "buildings follow"} it${behind.length ? `, <span class="rev">${behind.length} behind</span>` : ", all up to date"}${left ? `, <span class="pushed">${left} pieces left to rebuild</span>` : ""}</div>` : "")
        + `<div class="btnrow"><button data-bp="revise:${b.id}" title="Capture the edited building over this design: revision ${(b.rev || 1) + 1}">Revise</button>`
        + (presets.length ? `<select data-bp="theme:${b.id}" title="Redraw this design in another material class (the shelter ladder): a new revision"><option value="">Redraw in...</option>${presets.map(q => `<option value="${q[0]}">${q[1]}</option>`).join("")}</select>` : "")
        + `<button data-bp="push:${b.id}" ${behind.length ? "" : "disabled"} title="Mark the buildings behind this revision: villagers rebuild only the pieces that differ and keep the rest">Push revision${behind.length ? " to " + behind.length : ""}</button></div>`
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
