// Mouse and keyboard. Left = select (click, drag a box, shift adds), right =
// order, middle or right-drag = pan. Input goes through game.modes[ui.mode]
// first: S4 registers a "build" mode there (see README) and the select mode
// below is simply the default.
import { pickAt, villagersIn } from "./pick.js";
import { issueOrder, rightClick, optionsAt, closeMenu } from "./orders.js";
import { saveLocal, loadLocal } from "./saves.js";
import { SPEEDS } from "./skip.js";
import { keyId, PAN_IDS, HELD_IDS } from "./keys.js";

export function setupInput(game, canvas) {
  const { ui, cam } = game;
  const keys = game.keys = new Set();                                  // held pan / walk actions ("panLeft" ...), not raw keys, so a remapped key works the same
  const km = game.keymap;
  game.villagersIn = (x0, y0, x1, y1) => villagersIn(game, x0, y0, x1, y1).map(v => v);        // (the same hit test the drag box uses; tools and tests call it)

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (ui.capturing) return;                                          // the Settings panel is waiting for a key to bind
    const k = e.key;
    const dig = /^Digit([1-9])$/.exec(e.code || "");
    if (dig && (e.ctrlKey || e.altKey) && !e.metaKey) {                  // S11 crews: Ctrl+1..9 assigns the key, Alt+1..9 selects (1..9 alone stay the speeds)
      if (e.ctrlKey) game.crewAssignKey(Number(dig[1])); else game.crewKey(Number(dig[1]));
      e.preventDefault(); return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.shiftKey && k === "S") { saveLocal(game); e.preventDefault(); return; }
    if (e.shiftKey && k === "O") { loadLocal(game); e.preventDefault(); return; }
    const guide = ui.mode === "possess", act = km.actionOf(keyId(e), guide ? "guide" : "map");
    if (game.skipper.active) { game.skipper.cancel("Stopped: you pressed a key."); if (k === "Escape" || act === "pause") { e.preventDefault(); return; } }
    if (act === "pause") { game.togglePause(); e.preventDefault(); return; }
    if (k >= "1" && k <= "9" && k.length === 1) { game.setSpeed(SPEEDS[Number(k) - 1]); return; }      // 1-5: 1x-5x, 6: 10x, 7: 25x, 8: 50x, 9: MAX
    if (guide) {                                    // guiding: walk keys step, the guide keys act (ui/possess.js); no follow toggle, no Tab
      if (k === "Escape") { if (game.fpvEscape && game.fpvEscape()) return; if (ui.saves) ui.saves = false; else if (ui.book) game.closeBook(); else if (ui.help) ui.help = false; else { ui.digest = null; game.release(); } return; }     // letting go always works, even with the digest up
      if (e.shiftKey && (k === "ArrowUp" || k === "ArrowDown") && game.fpvNudge) { game.fpvNudge(k === "ArrowUp" ? 1 : -1); e.preventDefault(); return; }       // nudge the pitch
      if (act === "release") { game.release(); return; }
      if (act === "turnLeft" || act === "turnRight") { if (!e.repeat && game.fpvTurn) game.fpvTurn(act === "turnLeft" ? -1 : 1); e.preventDefault(); return; }
      if (game.possessKey(act)) { e.preventDefault(); return; }
      if (PAN_IDS.includes(act)) { keys.add(act); if (k.startsWith("Arrow")) e.preventDefault(); return; }
    }
    if (act === "possess" && ui.focus) { game.possess(ui.focus); return; }
    if (k === "Escape") { escape(); return; }
    if (act === "help") { ui.help = !ui.help; return; }
    if (act === "book") { if (ui.book) game.closeBook(); else game.openBook(); return; }
    if (act === "next" || act === "prev") { cycle(act === "prev" ? -1 : 1); e.preventDefault(); return; }
    if (act === "follow") { if (ui.focus) ui.follow = ui.follow === ui.focus ? 0 : ui.focus; return; }
    if (act === "build") { game.setMode(ui.mode === "build" ? "select" : "build"); return; }
    if (act === "rotate" && ui.mode === "build") { game.buildRotate(); return; }
    if (act === "erase" && ui.mode === "build") { game.buildErase(); return; }
    if (act === "cancel") { if (ui.sel.length) game.cancelOrders(ui.sel); return; }
    if (act === "zones") { ui.overlays.zones = !ui.overlays.zones; return; }
    if (act === "jobs") { ui.overlays.jobs = !ui.overlays.jobs; return; }
    if (act === "warmth") { ui.overlays.temp = !ui.overlays.temp; return; }
    if (act === "panels") { document.body.classList.toggle("nopanels"); return; }
    if (act === "levelDown") { game.stepLevel(-1); e.preventDefault(); return; }
    if (act === "levelUp") { game.stepLevel(1); e.preventDefault(); return; }
    if (act === "home") { game.goHome(); e.preventDefault(); return; }
    if (act === "fit") { const bb = game.sim.seen.bbox; cam.fit(bb ? { x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1 } : null); ui.follow = 0; return; }       // S16: key 0 frames the explored area
    if (PAN_IDS.includes(act)) { keys.add(act); ui.follow = 0; if (k.startsWith("Arrow")) e.preventDefault(); }
  });
  window.addEventListener("mousedown", (e) => { if (game.skipper.active && !e.target.closest(".tb-skip")) game.skipper.cancel("Stopped: you clicked."); }, true);
  window.addEventListener("keyup", (e) => { const kid = keyId(e); for (const id of HELD_IDS) if (km.keysOf(id).includes(kid)) keys.delete(id); if (e.key === "Shift") keys.delete("fast"); });
  window.addEventListener("blur", () => { keys.clear(); game.shiftDown = false; });
  window.addEventListener("keydown", (e) => { if (e.key === "Shift") game.shiftDown = true; });
  window.addEventListener("keyup", (e) => { if (e.key === "Shift") game.shiftDown = false; });

  function escape() {
    closeMenu();
    if (ui.saves) ui.saves = false;
    else if (ui.book) game.closeBook();
    else if (ui.help) ui.help = false;
    else if (ui.digest) ui.digest = null;
    else if (ui.targeting) ui.targeting = null;
    else if (ui.mode === "build" && (ui.build.drag || ui.build.bp)) { ui.build.drag = null; ui.build.bp = null; if (ui.build.tool === "stamp") ui.build.tool = "wall"; }
    else if (ui.mode !== "select") game.setMode("select");
    else if (ui.follow) ui.follow = 0;
    else if (ui.editKeep) ui.editKeep = null;
    else game.clearSelection();
  }

  function cycle(dir) {
    const vs = game.sim.ents.ofKind("villager");
    if (!vs.length) return;
    let i = vs.findIndex(v => v.id === ui.focus);
    i = i < 0 ? (dir > 0 ? 0 : vs.length - 1) : (i + dir + vs.length) % vs.length;
    game.selectOnly(vs[i].id, true);
  }

  const mode = () => game.modes[ui.mode];
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("contextmenu", (e) => { const t = e.target; if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) e.preventDefault(); });      // no browser menu anywhere on the game surface
  /** Start a press (select / box / order / pan). Also called for a press that lands on a pass-through HUD layer, so panning never depends on what happens to be on screen. */
  const PASS = new Set(["hud", "notables", "plate", "guide", "gauge", "pointers", "whisper", "dock", "fpvhud", "fadecv", "glview"]);
  const press = (e) => {
    closeMenu();
    ui.press = { btn: e.button, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, shift: e.shiftKey, moved: false };
    if (e.button === 1) e.preventDefault();
    if (mode() && mode().down && mode().down(game, e)) ui.press = null;
  };
  canvas.addEventListener("mousedown", press);
  /** A press that lands on the map's own overlays: a pass-through layer or ANY child of one (nameplates, notable chips, pointer chips, labels, floating text). Form controls keep their press. */
  const LAYERS = "#notables,#plate,#guide,#gauge,#pointers,#whisper,#dock,#fpvhud,#fadecv,#glview";
  const onMapOverlay = (t) => t instanceof Element && t !== canvas && (PASS.has(t.id) || (!!t.closest(LAYERS) && !t.closest("input,select,textarea,[contenteditable]")));
  window.addEventListener("mousedown", (e) => {
    if (!onMapOverlay(e.target) || ui.press || (game.fpv && game.fpv.on)) return;
    if (ui.mode !== "select" && e.target.id !== "hud" && !PASS.has(e.target.id)) return;          // other modes: a chip is just a chip
    press(e);
    if (ui.press && e.target.id !== "hud" && !PASS.has(e.target.id)) ui.press.fromEl = true;      // started on a chip: a plain click stays the chip's, a drag is the map's
  }, true);
  window.addEventListener("mousemove", (e) => {
    ui.mouse = { x: e.clientX, y: e.clientY, over: e.target === canvas };
    let p = ui.press;
    if (p && !(e.buttons & (p.btn === 0 ? 1 : p.btn === 2 ? 2 : 4))) { ui.press = null; ui.box = null; canvas.classList.remove("dragging"); p = null; }      // the button came up where we could not see it (outside the window): end the drag
    if (!p) { ui.hover = ui.mouse.over ? pickAt(game, e.clientX, e.clientY) : null; return; }
    const d = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (p.btn === 0) {
      if (d > 4) p.moved = true;
      if (p.moved) { ui.box = { x0: p.x, y0: p.y, x1: e.clientX, y1: e.clientY }; boxTrack(game); }
    } else if (p.btn === 1 || p.btn === 2) {
      if (d > 6) p.moved = true;
      if (p.moved) { cam.panBy(e.clientX - p.lx, e.clientY - p.ly); ui.follow = 0; canvas.classList.add("dragging"); }
    }
    p.lx = e.clientX; p.ly = e.clientY;
    if (mode() && mode().move) mode().move(game, e);
  });
  window.addEventListener("mouseup", (e) => {
    const p = ui.press; ui.press = null; canvas.classList.remove("dragging");
    if (!p || p.btn !== e.button) { ui.box = null; return; }
    if (p.fromEl) {
      if (!p.moved) return;                                                        // a click on a chip: the chip's own handler does the rest
      const eat = (c) => { c.stopPropagation(); c.preventDefault(); };                                // a drag that began on a chip is not a click on it
      window.addEventListener("click", eat, true); setTimeout(() => window.removeEventListener("click", eat, true), 0);
    }
    if (mode() && mode().up && mode().up(game, e, p)) { ui.box = null; return; }
    if (p.btn === 0) {
      if (ui.box) {
        const b = ui.box; boxTrack(game);
        const now = performance.now(), vs = [];
        for (const [id, t] of ui.boxSeen) if (now - t <= GRACE && game.sim.ents.get(id)) vs.push(id);      // inside now, or inside within the last 500 ms of the drag
        ui.box = null; ui.boxSeen = null; ui.boxLive = null;
        if (p.shift) game.selectMany(Array.from(new Set(ui.sel.concat(vs))));
        else game.selectMany(vs);
        return;
      }
      const pick = pickAt(game, e.clientX, e.clientY);
      if (ui.targeting) {
        const verb = ui.targeting, opt = optionsAt(game, pick).find(o => o.verb === verb) || { verb, tid: 0 };
        issueOrder(game, opt, pick);
        if (!p.shift) ui.targeting = null;
        return;
      }
      if (pick.villager) { if (p.shift) game.toggleSelect(pick.villager.id); else game.selectOnly(pick.villager.id); }
      else if (p.shift) { /* shift-click on empty ground keeps the selection */ }
      else if (pick.kind === "room") game.selectOther({ kind: "room", id: pick.room.id });
      else if (pick.kind === "proom") game.selectOther({ kind: "proom", x: pick.x, y: pick.y, z: pick.prov.z });
      else if (pick.kind === "ground" || pick.kind === "none") { game.clearSelection(); if (pick.kind === "ground" && pick.z > 0) game.selectOther({ kind: "cell", x: pick.x, y: pick.y, z: pick.z - 1 }); }
      else if (pick.kind === "stock") game.selectOther({ kind: "stock" });
      else if (pick.kind === "pen") game.selectOther({ kind: "pen", id: pick.pen.id });
      else if (pick.kind === "cellar") game.selectOther({ kind: "cellar" });
      else game.selectOther({ kind: "entity", id: pick.ent.id });
    } else if (p.btn === 2 && !p.moved) {
      rightClick(game, pickAt(game, e.clientX, e.clientY), e.clientX, e.clientY);
    }
  });
  canvas.addEventListener("dblclick", (e) => {
    const pick = pickAt(game, e.clientX, e.clientY);
    if (pick.villager) { game.selectOnly(pick.villager.id); ui.follow = pick.villager.id; }
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    cam.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });
  canvas.addEventListener("mouseleave", () => { ui.hover = null; });
}

const GRACE = 500;       // ms: a slime that was inside the box this recently still counts on release (they walk fast)
/** While a box is dragged: stamp every slime it covers right now (called per frame and on each move, so a slime walking out between mouse events is still seen). */
function boxTrack(game) {
  const { ui } = game;
  if (!ui.box) { if (ui.boxSeen) { ui.boxSeen = null; ui.boxLive = null; } return; }
  const now = performance.now(), b = ui.box, seen = ui.boxSeen || (ui.boxSeen = new Map()), live = villagersIn(game, b.x0, b.y0, b.x1, b.y1);
  ui.boxLive = live.map(v => v.id);
  for (const v of live) seen.set(v.id, now);
}

/** Per-frame: WASD / arrow panning. */
export function panKeys(game, dt) {
  const { cam, keys, ui } = game;
  boxTrack(game);
  const v = (600 * dt) / cam.zoom * (game.shiftDown ? 2.5 : 1);
  if (ui.mode === "possess") {                    // WASD walks the villager; the camera only follows it
    const f = game.sim.ents.get(ui.follow);
    if (f) { cam.x += (f.x + 0.5 - cam.x) * 0.2; cam.y += (f.y + 0.5 - cam.y) * 0.2; }
    return;
  }
  if (keys.has("panLeft")) cam.x -= v;
  if (keys.has("panRight")) cam.x += v;
  if (keys.has("panUp")) cam.y -= v;
  if (keys.has("panDown")) cam.y += v;
  if (ui.follow) {
    const f = game.sim.ents.get(ui.follow);
    if (!f) ui.follow = 0;
    else { cam.x += (f.x + 0.5 - cam.x) * 0.12; cam.y += (f.y + 0.5 - cam.y) * 0.12; }
  }
}
