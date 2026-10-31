// Possession UI (GDD §07): the player guides ONE villager. All it does is send commands
// (possess / pinput / release) - the sim turns them into the same Move and Task steps the AI uses.
//   WASD / arrows  step (hold to keep walking)      E or left-click  use what is next to you / under the cursor
//   C eat   V drink   N sleep   G put down what you carry     Esc or the button  release
// The camera follows closely, game speed is capped at 2x (main.js), fast-forward is off.
import { possessed } from "../sim/possess.js";
import { maxHp, fitness, ageDays, SOFT } from "../sim/villager.js";
import { diggable } from "../sim/tasks.js";
import { PRIORITY, usable, useFor, targetOfPick, USE_ERR } from "./usecmd.js";
import { esc } from "./dom.js";
import { svg } from "./icons.js";
import { ring, avatar, tipAttr } from "./kit.js";
import { item as paintItem } from "../render/sprites.js";
import { pickAt } from "./pick.js";
import { blockerText, pct, itemName } from "./text.js";
import { hazardLines } from "../sim/underground.js";

const NEEDS = [["hunger", "Food"], ["thirst", "Water"], ["energy", "Energy"], ["warm", "Warmth"]];
const SHORT = { use: "Use", eat: "Eat", drink: "Drink", sleep: "Sleep", tool: "Tool", torch: "Torch", support: "Support", drop: "Put down" };
const NEED_ICON = { hunger: "food", thirst: "water", energy: "energy", warm: "warmth" };

export function createPossess(game) {
  const { ui, cam } = game;
  const root = document.getElementById("dkPossess"), plate = document.getElementById("plate");
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
      if (game.fpvAuto) game.fpvAuto();                                // S18: guiding is always first person (falls back to the top-down guide only without WebGL)
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

  /** What to use: the clicked cell's entity if it is beside us, else rock (ui/usecmd.js: the first-person view sends the same command for the same target). */
  function interactAt(pk) { const v = game.possessed(); if (v) game.useTarget(targetOfPick(game.sim, v, pk)); }
  /** Use a target ({ent} | {cell}): one pinput, or a plain sentence on why not. */
  game.useTarget = (tgt) => {
    const v = game.possessed(); if (!v) return false;
    const r = useFor(game.sim, v, tgt);
    if (r.err) { game.toast(USE_ERR[r.err]); return false; }
    send(r.extra); return true;
  };
  /** E: the thing you are facing, else anything beside you, else the rock you face. */
  function interactKey() {
    const v = game.possessed(); if (!v) return;
    const sim = game.sim, f = ui.face, cells = [[v.x + f.dx, v.y + f.dy], [v.x, v.y], [v.x + 1, v.y], [v.x - 1, v.y], [v.x, v.y + 1], [v.x, v.y - 1]];
    let best = null, bk = 1e9;
    cells.forEach(([x, y], ci) => {
      for (const dz of [0, 1, -1]) for (const id of sim.ents.at(x, y, v.z + dz)) {
        const e = sim.ents.get(id);
        if (id === v.id || !usable(sim, e)) continue;
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
    game.sim.apply({ type: "pinput", id: v.id, dx: ui.sent.dx, dy: ui.sent.dy, mx: ui.sent.mx || 0, my: ui.sent.my || 0, tid: 0, verb: "", ...extra });
  }
  game.possessKey = (act) => {                           // called by input.js with the guide ACTION the pressed key is bound to (ui/keys.js)
    const verbs = { eat: "eat", drink: "drink", sleep: "sleep", drop: "drop", tool: "equip" };
    if (act === "use") { if (!(game.fpvUse && game.fpvUse())) interactKey(); return true; }          // S18: in first person the crosshair chooses the target (ui/fpv.js)
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
      const fm = game.fpvMove ? game.fpvMove() : null;
      if (fm) {                                               // first person: free walk, fractions of a cell along where the camera looks
        if (fm[0] !== ui.sent.mx || fm[1] !== ui.sent.my) { ui.sent = { dx: 0, dy: 0, mx: fm[0], my: fm[1] }; game.sim.apply({ type: "pinput", id: v.id, dx: 0, dy: 0, mx: fm[0], my: fm[1], tid: 0, verb: "" }); }
        return;
      }
      const fd = game.fpvDir ? game.fpvDir() : null;                // S18: in first person the held keys are relative to where you look
      if (fd) { dx = fd[0]; dy = fd[1]; } else for (const k of game.keys) {                                  // insertion order: the most recently pressed wins (the walk actions, whatever keys they are bound to)
        if (k === "panLeft") { dx = -1; dy = 0; } else if (k === "panRight") { dx = 1; dy = 0; }
        else if (k === "panUp") { dy = -1; dx = 0; } else if (k === "panDown") { dy = 1; dx = 0; }
      }
      if ((dx || dy) && !fd) ui.face = { dx, dy };
      if (dx !== ui.sent.dx || dy !== ui.sent.dy) {
        ui.sent = { dx, dy };
        game.sim.apply({ type: "pinput", id: v.id, dx, dy, tid: 0, verb: "" });
      }
    },
    /** The map-side effect of a collapse while we were not looking. */
    resume() { if (game.possessed() && ui.mode !== "possess") game.setMode("possess"); },
    update() {
      const v = game.possessed();
      document.body.classList.toggle("possessing", !!v);
      if (!root) return;
      root.style.display = v ? "flex" : "none";
      if (plate) plate.style.display = "";
      if (!v) { last = ""; return; }
      const sim = game.sim, fb = v.poss.fb, mh = maxHp(v, fitness(v, ageDays(sim, v))), km = game.keymap;
      // the dock in Possess mode (UI_SPEC §7): avatar + need rings, the held item, action keycaps. Words are tips and a hidden copy.
      let h = `<div class="pk-av" data-test="possess-who">${avatar(v.hue, v.lin, 28)}<span class="pb-head sr"><b>POSSESSING ${esc(v.name)}</b> game speed capped at 2x, fast-forward off</span></div><div class="pk-rings">`;
      for (const [k, label] of NEEDS) h += ring({ icon: NEED_ICON[k], v: v[k], soft: SOFT[k][0], crit: SOFT[k][1], px: 30, tip: `${label} ${pct(v[k])}`, test: "pk-" + k });
      h += ring({ icon: "health", v: v.hp / mh, soft: 0.6, crit: 0.3, px: 30, tip: `Health ${Math.round(v.hp)}/${Math.round(mh)}\nGuidance ends below 10% of full health`, test: "pk-health" });
      if ((v.fear || 0) > 0) h += ring({ icon: "fear", v: v.fear, px: 30, tip: `Fear ${pct(v.fear)}${v.fear > 0.6 ? " - steadfast" : ""}\nVillagers run above 60% fear. You are Steadfast: a guided villager never flees.`, test: "pk-fear" });
      h += `</div><span class="sr">Food Water Energy Warmth Health ${Math.round(v.hp)}/${Math.round(mh)} Fear ${pct(v.fear || 0)}${(v.fear || 0) > 0.6 ? " - steadfast" : ""}. ${v.eq ? "Holding a " + esc(itemName(v.eq.item).replace(/s$/, "")) + ". " : "Bare-handed. "}${v.carry ? "Carrying " + v.carry.n + " " + esc(v.carry.item) + ". " : ""}${v.job ? "Doing: " + esc(v.job.k.replace("_", " ")) + ". " : ""}</span>`;
      const heldTxt = v.carry ? `${v.carry.n} ${itemName(v.carry.item)}` : v.eq ? itemName(v.eq.item).replace(/s$/, "") : "bare hands";
      h += `<div class="pk-held" data-test="held"${tipAttr(heldTxt + (v.carry ? "\nPut down" : ""), v.carry ? km.label("drop") : "")}><canvas width="32" height="32" data-held="${esc(v.carry ? "c" + v.carry.item : v.eq ? "e" + v.eq.item : "")}"></canvas>${v.carry ? `<b>${v.carry.n}</b>` : ""}</div>`;
      const ACT = [["use", "use", "Use what is next to you\nChop, pick, dig, strike, build"], ["eat", "eat", "Eat"], ["drink", "drink", "Drink"], ["sleep", "sleep", "Sleep"], ["tool", "tool", "Take the spear or pick"], ["torch", "torch", "Set a torch\nOn the cell you face (needs a stick in hand)"], ["support", "support", "Post a timber support\nOn the cell you face (needs timber in hand)"], ["drop", "drop", "Put down"]];
      h += `<div class="pk-act">` + ACT.map(([id, ic, tip]) => `<button class="btn big lab" data-pk="${id}" data-test="pk-${id}"${tipAttr(tip, km.label(id).split(" / ")[0])} aria-label="${esc(tip.split("\n")[0])}">${svg(ic, 20)}<span class="bl">${esc(SHORT[id])}</span><span class="kc">${esc(km.label(id).split(" / ")[0])}</span></button>`).join("")
        + `<button class="btn big lab" data-pk="release" data-test="pk-release"${tipAttr("Release\nLet go of them", "Esc")} aria-label="Release">${svg("release", 20)}<span class="bl">Release</span><span class="kc">Esc</span></button></div>`;
      const haz = hazardLines(sim, v.x, v.y, v.z);
      if (haz.length) h += `<div class="pk-haz">` + haz.map(t => `<span${tipAttr(t)}>${svg(/roof/i.test(t) ? "underground" : /air/i.test(t) ? "warn" : "night", 18)}<span class="sr">${esc(t)}</span></span>`).join("") + `</div>`;
      if (sim.tick - fb[1] < 120 && fb[0]) h += `<span class="pk-fb"${tipAttr(blockerText(v.job ? v.job.k : "", fb[0]))}>${svg("blocked", 18)}<span class="sr">${esc(blockerText(v.job ? v.job.k : "", fb[0]))}</span></span>`;
      if (plate) { const ph = `${svg("possess", 16)}<b>${esc(v.name)}</b><kbd>Esc</kbd><span class="sr">Guiding ${esc(v.name)}</span>` + (game.state.speed > 2 ? `<span class="fv-lock"${tipAttr("Game speed is capped at 2x while you guide a villager")}>${svg("lock", 14)}</span>` : ""); if (plate._h !== ph) { plate._h = ph; plate.innerHTML = ph; } }
      if (h !== last) {
        last = h; root.innerHTML = h;
        const cv = root.querySelector(".pk-held canvas"), k = cv && cv.dataset.held;
        if (cv && k) { const c = cv.getContext("2d"); if (k[0] === "c" && v.carry) paintItem(c, v.carry.item, { n: Math.min(3, v.carry.n) }); else if (v.eq) paintItem(c, v.eq.item, { n: 1 }); }
      }
      for (const [k, label] of NEEDS) {                                  // nothing relieves a guided villager's needs but you: say so when one turns critical
        const crit = v[k] < SOFT[k][1];
        if (crit && !warned[k]) game.toast(v.name + " is critically low on " + label.toLowerCase() + " - feed, water or rest them (" + km.label("eat") + ", " + km.label("drink") + ", " + km.label("sleep") + "), or release (Esc).", 6000);
        warned[k] = crit;
      }
    },
  };
}
