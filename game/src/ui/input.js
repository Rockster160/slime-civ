// Mouse and keyboard. Left = select (click, drag a box, shift adds), right =
// order, middle or right-drag = pan. Input goes through game.modes[ui.mode]
// first: S4 registers a "build" mode there (see README) and the select mode
// below is simply the default.
import { pickAt, villagersIn } from "./pick.js";
import { issueOrder, rightClick, optionsAt, closeMenu } from "./orders.js";
import { saveLocal, loadLocal } from "./saves.js";
import { SPEEDS } from "./skip.js";

export function setupInput(game, canvas) {
  const { ui, cam } = game;
  const keys = game.keys = new Set();
  const PAN_KEYS = ["a", "s", "d", "w", "arrowleft", "arrowright", "arrowup", "arrowdown", "shift"];

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const k = e.key;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.shiftKey && k === "S") { saveLocal(game); e.preventDefault(); return; }
    if (e.shiftKey && k === "O") { loadLocal(game); e.preventDefault(); return; }
    if (game.skipper.active) { game.skipper.cancel("Stopped: you pressed a key."); if (k === "Escape" || k === " ") { e.preventDefault(); return; } }
    if (k === " ") { game.togglePause(); e.preventDefault(); return; }
    if (k >= "1" && k <= "9") { game.setSpeed(SPEEDS[Number(k) - 1]); return; }      // 1-5: 1x-5x, 6: 10x, 7: 25x, 8: 50x, 9: MAX
    if (ui.mode === "possess") {                    // guiding: WASD / arrows step, E and C V N G act (ui/possess.js); no follow toggle, no Tab
      const lk = k.toLowerCase();
      if (k === "Escape") { if (ui.help) ui.help = false; else { ui.digest = null; game.release(); } return; }     // letting go always works, even with the digest up
      if (game.possessKey(lk)) { e.preventDefault(); return; }
      if (PAN_KEYS.includes(lk) && lk !== "shift") { keys.add(lk); if (k.startsWith("Arrow")) e.preventDefault(); return; }
      if (lk === "q") { game.release(); return; }
      if (lk === "tab" || lk === "f" || lk === "b") return;
    }
    if ((k === "q" || k === "Q") && ui.focus) { game.possess(ui.focus); return; }
    if (k === "Escape") { escape(); return; }
    if (k === "h" || k === "H" || k === "?") { ui.help = !ui.help; return; }
    if (k === "Tab") { cycle(e.shiftKey ? -1 : 1); e.preventDefault(); return; }
    if (k === "f" || k === "F") { if (ui.focus) ui.follow = ui.follow === ui.focus ? 0 : ui.focus; return; }
    if (k === "b" || k === "B") { game.setMode(ui.mode === "build" ? "select" : "build"); return; }
    if ((k === "r" || k === "R") && ui.mode === "build") { game.buildRotate(); return; }
    if ((k === "e" || k === "E") && ui.mode === "build") { game.buildErase(); return; }
    if (k === "x" || k === "X") { if (ui.sel.length) game.cancelOrders(ui.sel); return; }
    if (k === "z" || k === "Z") { ui.overlays.zones = !ui.overlays.zones; return; }
    if (k === "l" || k === "L") { ui.overlays.jobs = !ui.overlays.jobs; return; }
    if (k === "t" || k === "T") { ui.overlays.temp = !ui.overlays.temp; return; }
    if (k === "p" || k === "P") { document.body.classList.toggle("nopanels"); return; }
    if (k === "[" || k === "PageDown") { game.renderer.setZ(game.renderer.z - 1); e.preventDefault(); return; }
    if (k === "]" || k === "PageUp") { game.renderer.setZ(game.renderer.z + 1); e.preventDefault(); return; }
    if (k === "0") { cam.fit(); ui.follow = 0; return; }
    const lk = k.toLowerCase();
    if (PAN_KEYS.includes(lk)) { keys.add(lk); if (lk !== "shift") ui.follow = 0; if (k.startsWith("Arrow")) e.preventDefault(); }
  });
  window.addEventListener("mousedown", (e) => { if (game.skipper.active && !e.target.closest(".tb-skip")) game.skipper.cancel("Stopped: you clicked."); }, true);
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());

  function escape() {
    closeMenu();
    if (ui.help) ui.help = false;
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
  canvas.addEventListener("mousedown", (e) => {
    closeMenu();
    ui.press = { btn: e.button, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, shift: e.shiftKey, moved: false };
    if (e.button === 1) e.preventDefault();
    if (mode() && mode().down && mode().down(game, e)) ui.press = null;
  });
  window.addEventListener("mousemove", (e) => {
    ui.mouse = { x: e.clientX, y: e.clientY, over: e.target === canvas };
    const p = ui.press;
    if (!p) { ui.hover = ui.mouse.over ? pickAt(game, e.clientX, e.clientY) : null; return; }
    const d = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (p.btn === 0) {
      if (d > 4) p.moved = true;
      if (p.moved) ui.box = { x0: p.x, y0: p.y, x1: e.clientX, y1: e.clientY };
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
    if (mode() && mode().up && mode().up(game, e, p)) { ui.box = null; return; }
    if (p.btn === 0) {
      if (ui.box) {
        const b = ui.box; ui.box = null;
        const vs = villagersIn(game, b.x0, b.y0, b.x1, b.y1).map(v => v.id);
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
      else if (pick.kind === "ground" || pick.kind === "none") game.clearSelection();
      else if (pick.kind === "stock") game.selectOther({ kind: "stock" });
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

/** Per-frame: WASD / arrow panning. */
export function panKeys(game, dt) {
  const { cam, keys, ui } = game;
  const v = (600 * dt) / cam.zoom * (keys.has("shift") ? 2.5 : 1);
  if (ui.mode === "possess") {                    // WASD walks the villager; the camera only follows it
    const f = game.sim.ents.get(ui.follow);
    if (f) { cam.x += (f.x + 0.5 - cam.x) * 0.2; cam.y += (f.y + 0.5 - cam.y) * 0.2; }
    return;
  }
  if (keys.has("a") || keys.has("arrowleft")) cam.x -= v;
  if (keys.has("d") || keys.has("arrowright")) cam.x += v;
  if (keys.has("w") || keys.has("arrowup")) cam.y -= v;
  if (keys.has("s") || keys.has("arrowdown")) cam.y += v;
  if (ui.follow) {
    const f = game.sim.ents.get(ui.follow);
    if (!f) ui.follow = 0;
    else { cam.x += (f.x + 0.5 - cam.x) * 0.12; cam.y += (f.y + 0.5 - cam.y) * 0.12; }
  }
}
