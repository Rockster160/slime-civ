// Possession UI (GDD §07): the player guides ONE villager. All it does is send commands
// (possess / pinput / release) - the sim turns them into the same Move and Task steps the AI uses.
//   WASD / arrows  step (hold to keep walking)      E or left-click  use what is next to you / under the cursor
//   C eat   V drink   N sleep   G put down what you carry     Esc or the button  release
// The camera follows closely, game speed is capped at 2x (main.js), fast-forward is off.
import { possessed } from "../sim/possess.js";
import { maxHp, fitness, ageDays, SOFT } from "../sim/villager.js";
import { diggable } from "../sim/tasks.js";
import { esc, bar, needColor } from "./dom.js";
import { pickAt } from "./pick.js";
import { blockerText, pct, itemName } from "./text.js";
import { hazardLines } from "../sim/underground.js";

const PRIORITY = { fauna: -1, csite: 0, item: 1, plant: 2, furniture: 3 };
const NEEDS = [["hunger", "Food"], ["thirst", "Water"], ["energy", "Energy"], ["warm", "Warmth"]];

export function createPossess(game) {
  const { ui, cam } = game;
  const root = document.getElementById("possbanner");
  ui.sent = { dx: 0, dy: 0 }; ui.face = { dx: 0, dy: 1 }; ui.prevZoom = 0; ui.fbSeen = 0;
  game.possessed = () => possessed(game.sim);

  game.possess = (id) => {
    const v = game.sim.ents.get(id);
    if (!v || v.kind !== "villager") return false;
    if (game.skipper.active) game.skipper.cancel("Stopped: you took control of a villager.");
    if (!game.sim.apply({ type: "possess", id })) { game.toast("Only grown villagers can be guided."); return false; }
    ui.pname = v.name;
    game.selectOnly(id, true);
    game.setMode("possess");
    return true;
  };
  game.release = () => { if (game.possessed()) game.sim.apply({ type: "release" }); ui.sent = { dx: 0, dy: 0 }; if (ui.mode === "possess") game.setMode("select"); };

  game.modes.possess = {
    enter() {
      const v = game.possessed(); if (!v) return;
      ui.prevZoom = cam.zoom;
      cam.zoom = Math.min(cam.maxZoom, Math.max(18, cam.zoom * 3));      // ~1/3 of the god-view distance
      ui.follow = v.id; ui.sent = { dx: 0, dy: 0 };
      if (game.renderer.z < v.z) game.renderer.setZ(v.z);
      game.toast("You are guiding " + v.name + ". WASD to walk, E to use what is next to you, Esc to let go.", 5000);
    },
    leave() {
      if (game.possessed()) game.sim.apply({ type: "release" });
      if (ui.prevZoom) cam.zoom = ui.prevZoom;
      ui.prevZoom = 0; ui.follow = 0; ui.sent = { dx: 0, dy: 0 };
    },
    down() { return false; },
    up(g, e, p) {
      if (e.button === 0 && !p.moved) { const pk = pickAt(game, e.clientX, e.clientY); interactAt(pk); }
      return true;                                   // no selection, no orders while guiding
    },
  };

  /** What to use: the clicked cell's entity if it is beside us, else rock. */
  function interactAt(pk) {
    const v = game.possessed(); if (!v) return;
    const near = (e) => Math.abs(e.x - v.x) + Math.abs(e.y - v.y) <= 1 && Math.abs(e.z - v.z) <= 1;
    const e = pk.ents.find(near);
    if (e) { send({ tid: e.id }); return; }
    if (pk.ents.length) { game.toast("Too far - walk next to it first (WASD)."); return; }
    const rock = pk.z > 0 && diggable(game.sim, pk.x, pk.y, pk.z - 1);
    if (rock) { send({ verb: "dig", x: pk.x, y: pk.y, z: pk.z - 1 }); return; }
    game.toast("Nothing there to use.");
  }
  /** E: the thing you are facing, else anything beside you, else the rock you face. */
  function interactKey() {
    const v = game.possessed(); if (!v) return;
    const sim = game.sim, f = ui.face, cells = [[v.x + f.dx, v.y + f.dy], [v.x, v.y], [v.x + 1, v.y], [v.x - 1, v.y], [v.x, v.y + 1], [v.x, v.y - 1]];
    let best = null, bk = 1e9;
    cells.forEach(([x, y], ci) => {
      for (const dz of [0, 1, -1]) for (const id of sim.ents.at(x, y, v.z + dz)) {
        const e = sim.ents.get(id);
        if (!(e.kind in PRIORITY) || id === v.id) continue;
        if (e.kind === "plant" && !(e.species === "tree" || (e.species === "berry" && e.yield > 0) || (e.species === "tuft" && e.yield > 0))) continue;
        if (e.kind === "item" && sim.stock && e.x >= sim.stock.x0 && e.x <= sim.stock.x1 && e.y >= sim.stock.y0 && e.y <= sim.stock.y1 && e.z === sim.stock.z && !(sim.ents.get(id).item === "berry" || sim.ents.get(id).item === "dried")) continue;
        const k = ci * 10 + PRIORITY[e.kind];
        if (k < bk) { bk = k; best = e; }
      }
    });
    if (best) { send({ tid: best.id }); return; }
    const fx = v.x + f.dx, fy = v.y + f.dy;
    if (diggable(sim, fx, fy, v.z)) { send({ verb: "dig", x: fx, y: fy, z: v.z }); return; }
    game.toast("Nothing next to you to use.");
  }
  function send(extra) {
    const v = game.possessed(); if (!v) return;
    game.sim.apply({ type: "pinput", id: v.id, dx: ui.sent.dx, dy: ui.sent.dy, tid: 0, verb: "", ...extra });
  }
  game.possessKey = (act) => {                           // called by input.js with the guide ACTION the pressed key is bound to (ui/keys.js)
    const verbs = { eat: "eat", drink: "drink", sleep: "sleep", drop: "drop", tool: "equip" };
    if (act === "use") { interactKey(); return true; }
    if (act === "torch" || act === "support") {                // S12: a torch on the cell you face (else your own), a support on the cell you face
      const v = game.possessed(); if (!v) return true;
      const f = ui.face, fx = v.x + f.dx, fy = v.y + f.dy, w = game.sim.world;
      let cell = [fx, fy, v.z];
      if (!w.isWalkable(fx, fy, v.z)) { const z = [v.z + 1, v.z - 1].find(q => w.isWalkable(fx, fy, q)); cell = z !== undefined ? [fx, fy, z] : act === "torch" ? [v.x, v.y, v.z] : null; }
      if (!cell) { game.toast("Face an open cell to put it in."); return true; }
      send({ verb: act, x: cell[0], y: cell[1], z: cell[2] });
      return true;
    }
    if (verbs[act]) {
      const v = game.possessed(); if (!v) return true;
      let tid = 0;
      if (act === "sleep") for (const dz of [0, 1, -1]) for (const id of game.sim.ents.at(v.x, v.y, v.z + dz)) { const e = game.sim.ents.get(id); if (e.kind === "furniture" && e.f === "bed") tid = id; }
      if (act === "eat" && !v.carry) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) for (const id of game.sim.ents.at(v.x + dx, v.y + dy, v.z)) { const e = game.sim.ents.get(id); if (e.kind === "plant" && e.species === "berry" && e.yield > 0) tid = id; }
      send({ verb: verbs[act], tid });
      return true;
    }
    return false;
  };

  if (root) root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pk]"); if (!b) return;
    if (b.dataset.pk === "release") game.release(); else game.possessKey(b.dataset.pk);      // data-pk is a guide action id
  });

  let last = "";
  const warned = {};
  return {
    /** Per frame: turn held WASD into a direction command when it changes, and keep the camera close. */
    frame() {
      const v = game.possessed();
      if (!v) { if (ui.mode === "possess") { game.toast("The guiding spirit let go of " + (ui.pname || "the villager") + "."); ui.mode = "select"; if (ui.prevZoom) cam.zoom = ui.prevZoom; ui.prevZoom = 0; ui.follow = 0; } return; }
      if (ui.mode !== "possess") return;
      let dx = 0, dy = 0;
      for (const k of game.keys) {                                  // insertion order: the most recently pressed wins (the walk actions, whatever keys they are bound to)
        if (k === "panLeft") { dx = -1; dy = 0; } else if (k === "panRight") { dx = 1; dy = 0; }
        else if (k === "panUp") { dy = -1; dx = 0; } else if (k === "panDown") { dy = 1; dx = 0; }
      }
      if (dx || dy) ui.face = { dx, dy };
      if (dx !== ui.sent.dx || dy !== ui.sent.dy) {
        ui.sent = { dx, dy };
        game.sim.apply({ type: "pinput", id: v.id, dx, dy, tid: 0, verb: "" });
      }
    },
    /** The map-side effect of a collapse while we were not looking. */
    resume() { if (game.possessed() && ui.mode !== "possess") game.setMode("possess"); },
    update() {
      const v = game.possessed();
      if (!root) return;
      root.style.display = v ? "block" : "none";
      if (!v) { last = ""; return; }
      const sim = game.sim, fb = v.poss.fb, mh = maxHp(v, fitness(v, ageDays(sim, v)));
      let h = `<div class="pb-head"><b>POSSESSING ${esc(v.name)}</b> <span class="dim">game speed capped at 2x, fast-forward off</span><button data-pk="release">Release (Esc)</button></div><div class="pb-needs">`;
      for (const [k, label] of NEEDS) h += `<span>${label}</span>` + bar(v[k], { color: needColor(v[k], SOFT[k][0], SOFT[k][1]), text: pct(v[k]) });
      h += `<span>Health</span>` + bar(v.hp / mh, { color: needColor(v.hp / mh, 0.6, 0.3), text: Math.round(v.hp) + "/" + Math.round(mh), title: "Guidance ends below 10% of full health" });
      h += `<span>Fear</span>` + bar(v.fear || 0, { color: (v.fear || 0) > 0.6 ? "#e5594f" : "#9a86d6", marks: [{ at: 0.6, cls: "crit" }], text: pct(v.fear || 0) + ((v.fear || 0) > 0.6 ? " - steadfast" : ""), title: "Villagers run above 60% fear. You are Steadfast: you never flee." });
      h += `</div><div class="pb-line">${v.eq ? "Holding a " + esc(itemName(v.eq.item).replace(/s$/, "")) + ". " : "Bare-handed. "}${v.carry ? "Carrying " + v.carry.n + " " + esc(v.carry.item) + ". " : ""}${v.job ? "Doing: " + esc(v.job.k.replace("_", " ")) + "." : "Standing by."}`;
      if (sim.tick - fb[1] < 120 && fb[0]) h += ` <span class="pb-fb">${esc(blockerText(v.job ? v.job.k : "", fb[0]))}</span>`;
      const km = game.keymap, K = (id) => `<kbd>${esc(km.label(id))}</kbd>`;
      for (const t of hazardLines(sim, v.x, v.y, v.z)) h += `<div class="pb-haz">${esc(t)}</div>`;      // S12: a cracking roof, bad air, the dark
      h += `</div><div class="pb-hint">Walk (hold) ${K("panUp")}${K("panLeft")}${K("panDown")}${K("panRight")} · ${K("use")} or click: chop / pick / gather / lift / build / dig / STRIKE what is next to you · <button data-pk="tool" title="Take a copper spear (or pick) from the stockpile in hand: stand in the stockpile">Take tool (${esc(km.label("tool"))})</button> <button data-pk="eat">Eat</button> <button data-pk="drink">Drink</button> <button data-pk="sleep">Sleep</button> <button data-pk="drop">Put down</button> <button data-pk="torch" title="A torch on the cell you face (a stick in hand; fire must be known)">Torch (${esc(km.label("torch"))})</button> <button data-pk="support" title="A timber support on the cell you face (timber in hand; framing must be known)">Support (${esc(km.label("support"))})</button> · needs drain as usual: you must feed them yourself</div>`;
      for (const [k, label] of NEEDS) {                                  // nothing relieves a guided villager's needs but you: say so when one turns critical
        const crit = v[k] < SOFT[k][1];
        if (crit && !warned[k]) game.toast(v.name + " is critically low on " + label.toLowerCase() + " - feed, water or rest them (" + km.label("eat") + ", " + km.label("drink") + ", " + km.label("sleep") + "), or release (Esc).", 6000);
        warned[k] = crit;
      }
      if (h !== last) { last = h; root.innerHTML = h; }
    },
  };
}
