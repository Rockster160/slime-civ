// Wires sim + renderer + UI. The loop is a fixed-timestep accumulator: real
// elapsed time is converted to whole sim ticks (20/s x speed); rendering runs
// once per animation frame regardless. If a frame is slow we cap the ticks
// we run (and drop the backlog) rather than spiral: better the sim slows down
// than the page freezes.
//
// `game` is the one object the UI shares: { sim, cam, renderer, state, ui, modes, ... }.
// The UI reads game.sim and changes it ONLY through game.sim.apply(cmd).
import { Sim } from "./sim/sim.js";
import { seenAt } from "./sim/seen.js";
import { TICKS_PER_SEC } from "./sim/clock.js";
import { D, F, M } from "./sim/world.js";
import { Camera } from "./render/camera.js";
import { Renderer } from "./render/renderer.js";
import { drawOverlays } from "./render/overlays.js";
import { createTopBar } from "./ui/topbar.js";
import { createPanel, esc } from "./ui/dom.js";
import { createVillagePanel } from "./ui/village.js";
import { createWhyPanel, createInspector } from "./ui/inspector.js";
import { createChroniclePanel, createDigest, watch } from "./ui/chronicle.js";
import { createNotables } from "./ui/notables.js";
import { createOrderBar } from "./ui/orders.js";
import { createHelp } from "./ui/help.js";
import { createAlmanacPanel } from "./ui/almanac.js";
import { createBuildMode } from "./ui/build.js";
import { createBlueprintPanel } from "./ui/blueprints.js";
import { createExpeditionPanel } from "./ui/expedition.js";
import { createCrewsPanel } from "./ui/crews.js";
import { createConcernsPanel } from "./ui/concernpanel.js";
import { createReveal } from "./ui/reveal.js";
import { remember } from "./ui/dom.js";
import { createKeymap } from "./ui/keys.js";
import { createAccess } from "./ui/access.js";
import { createSettings } from "./ui/settings.js";
import { autosaveTick } from "./ui/saves.js";
import { setupInput, panKeys } from "./ui/input.js";
import { createSkip, SLICE_MS } from "./ui/skip.js";
import { createPossess } from "./ui/possess.js";
import { describe, explain } from "./ui/text.js";
import { survey } from "./sim/items.js";

const MAX_TICKS_PER_FRAME = 40;     // floor of the per-frame tick cap; it grows with speed (see frame())
const TIME_BUDGET_MS = 20;          // stop stepping early if a frame is already this slow (the spiral guard)
const POSSESS_CAP = 2;              // GDD §07: game speed is capped while guiding a villager
const DRAW_MS_FAST = 200;           // the map redraws a few times a second at MAX / while skipping
const PANEL_MS = 150;               // panels refresh at ~7 Hz; the map redraws every frame

const params = new URLSearchParams(location.search);
const canvas = document.getElementById("view");
const cam = new Camera();
const renderer = new Renderer(canvas, cam);
const $ = (id) => document.getElementById(id);

const game = {
  sim: Sim.create(Number(params.get("seed")) || 1, params.get("spawn") ? { spawn: { x: Number(params.get("spawn").split(",")[0]), y: Number(params.get("spawn").split(",")[1]) } } : {}),     // ?spawn=64,64 pins the camp (tests that hard-code positions); the game searches for a fair start
  cam, renderer,
  state: { speed: 1, paused: false, fps: 60, msPerTick: 0 },
  // Everything the player is looking at / doing. Not part of the sim, not saved.
  ui: {
    sel: [], focus: 0, other: null,           // selected villager ids, the one shown in the panels, a selected non-villager {kind:"entity",id}|{kind:"stock"}
    hover: null, mouse: null, press: null, box: null, markers: [], targeting: null, follow: 0,
    overlays: { zones: false, jobs: false, temp: false }, hoverStock: false,
    help: false, digest: null, attn: { tick: 0, id: 0 }, toastedId: 0, autoPause: false,
    editKeep: null, partsOpen: false, showTrace: false, crewTarget: 0,
    progression: params.get("tools") !== "all", showAll: remember("showall") === "1",     // S11: tools appear as the village earns them (ui/reveal.js); ?tools=all or the Game menu setting shows everything
    mode: "select",                           // "select" | "build" (game.setMode switches; build is registered by ui/build.js)
  },
  modes: {},
  keymap: createKeymap(),                      // S12: remappable keys (browser storage, not the save)
};

// ---- helpers the panels call ----
game.setSpeed = (s) => { if (game.skipper.active) return; game.state.speed = s; game.state.paused = false; };
/** The speed actually run: the chosen one, capped while possessing. Speed is a view setting, never a sim command. */
game.effectiveSpeed = () => (game.possessed() ? Math.min(game.state.speed, POSSESS_CAP) : game.state.speed);
/** Run `n` ticks right now, synchronously (tools and Playwright playtests). No stop conditions. Returns the new tick. */
game.fastForward = (n) => { game.skipper.cancel("Stopped."); for (let i = 0; i < n; i++) game.sim.step(); return game.sim.tick; };
/** Synchronous skip-to ("morning" | "season" | "event") with the same stop rules as the buttons. Returns the stop message. */
game.skipTo = (kind, maxTicks = 400000) => {
  if (!game.skipper.start(kind)) return "";
  game.skipper.run(1e9, maxTicks);
  if (game.skipper.active) game.skipper.cancel("Stopped: tick limit.");
  return game.skipper.msg;
};
/** S15: hand the player a text file (the chronicle export). The only DOM part of it; the text comes from a pure function. A test may replace this to capture the text. */
game.downloadText = (name, text, mime = "text/plain") => {
  const url = URL.createObjectURL(new Blob([text], { type: mime + ";charset=utf-8" })), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
game.togglePause = () => { game.state.paused = !game.state.paused; };
game.toast = (msg, ms = 3500) => {
  const root = $("toasts"), last = root.lastChild;
  if (last && last.textContent === msg) { last.classList.remove("toast"); void last.offsetWidth; last.classList.add("toast"); return; }     // the same message again (e.g. planning four beds): show it once
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg; root.appendChild(el);
  while (root.children.length > 4) root.firstChild.remove();
  setTimeout(() => el.remove(), ms);
};
function sync() {                       // keep focus inside the selection
  const ui = game.ui;
  if (!ui.sel.includes(ui.focus)) ui.focus = ui.sel[0] || 0;
  if (ui.sel.length) ui.other = null;
}
function reveal(v) {                    // bring a villager into view if it is off-screen
  const [sx, sy] = cam.toScreen(v.x + 0.5, v.y + 0.5);
  if (sx < 360 || sx > cam.vw - 360 || sy < 80 || sy > cam.vh - 80) { cam.x = v.x + 0.5; cam.y = v.y + 0.5; }
  if (renderer.z < v.z) renderer.setZ(v.z);
}
game.selectOnly = (id, center) => {
  const v = game.sim.ents.get(id); if (!v) return;
  game.ui.sel = [id]; game.ui.focus = id; game.ui.other = null; sync();
  if (center) reveal(v);
};
game.selectMany = (ids) => { game.ui.sel = ids.slice(); game.ui.other = null; sync(); };
game.toggleSelect = (id) => {
  const s = game.ui.sel, i = s.indexOf(id);
  if (i >= 0) s.splice(i, 1); else s.push(id);
  game.ui.focus = i >= 0 ? s[0] || 0 : id; sync();
};
/** Cancel orders (through the sim) and remember it, so "order finished" toasts only fire for orders that ran out by themselves. */
game.cancelOrders = (ids) => {
  const ok = game.sim.apply({ type: "cancel", ids: ids.slice() });
  for (const id of ids) orderSeen.delete(id);
  game.toast(ok ? "Orders cancelled." : "No orders to cancel.");
  return ok;
};
const orderSeen = new Map();             // villager id -> verb of the order seen last frame
/** Toast when an order ends on its own (area cleared / arrived), grouped by verb. */
function orderEnds(sim) {
  const done = {};
  for (const v of sim.ents.ofKind("villager")) {
    const had = orderSeen.get(v.id);
    if (v.order) orderSeen.set(v.id, v.order.verb);
    else if (had) { orderSeen.delete(v.id); if (had !== "move") (done[had] = done[had] || []).push(v.name); }
  }
  for (const verb in done) game.toast(`${verb[0].toUpperCase() + verb.slice(1)} order finished: ${done[verb].join(", ")} (nothing left to do in the area).`);
}
/** Switch input mode; modes may define enter(game) / leave(game). */
game.setMode = (m) => {
  const ui = game.ui, old = game.modes[ui.mode];
  if (m === ui.mode) return;
  if (old && old.leave) old.leave(game);
  ui.mode = m; ui.targeting = null;
  const nu = game.modes[m];
  if (nu && nu.enter) nu.enter(game);
};
game.clearSelection = () => { game.ui.sel = []; game.ui.focus = 0; game.ui.other = null; game.ui.follow = 0; game.ui.targeting = null; };
game.selectOther = (o) => { game.ui.sel = []; game.ui.focus = 0; game.ui.other = o; };
/** Replace the whole sim (load / new game). */
/** Has this cell been seen? (the fog; the smoke test asks) */
game.seenAt = (x, y, z) => seenAt(game.sim.seen, x, y, z) === 1;
game.setSim = (sim) => {
  game.setMode("select");
  game.sim = sim;
  game.clearSelection();
  game.skipper.active = null;
  const ui = game.ui, es = sim.chron.entries;
  ui.digest = null; ui.advisor = null; ui.cnOrder = []; ui.attn = { tick: sim.tick, id: es.length ? es[es.length - 1].id : 0 }; ui.toastedId = ui.attn.id; ui.markers = []; ui.editKeep = null; ui.unlock = {}; ui.revealInit = false; ui.crewTarget = 0; if (ui.strip) ui.strip.crew = 0;
  game.state.paused = true;
  game.lastAutoDay = -1;                  // S12: the autosave clock restarts from this game's day
  orderSeen.clear();
  possessCtl.resume();                    // a loaded save may be mid-possession
};

createSkip(game);
const possessCtl = createPossess(game);

// ---- DOM ----
createAccess(game);                     // S12: UI scale, contrast, colour-blind marks, reduced flashing
const bar = createTopBar($("topbar"), game);
const colL = $("colL"), colR = $("colR");
const concernsP = createConcernsPanel(colL, game);
const village = createVillagePanel(colL, game);
const bps = createBlueprintPanel(colL, game);
const expd = createExpeditionPanel(colL, game);
const crewsP = createCrewsPanel(colL, game);
const revealer = createReveal(game);
const alm = createAlmanacPanel(colL, game);
const chron = createChroniclePanel(colL, game);
game.openAlmanac = () => { alm.setOpen(true); alm.root.scrollIntoView({ block: "nearest" }); alm.root.classList.add("flash"); setTimeout(() => alm.root.classList.remove("flash"), 1200); };
const why = createWhyPanel(colR, game);
const insp = createInspector(colR, game);
const notables = createNotables($("notables"), game);
const orderbar = createOrderBar($("orderbar"), game);
const buildbar = createBuildMode(game, $("buildbar"));
const digest = createDigest($("digest"), game);
const help = createHelp($("helpOverlay"), game);
const settings = createSettings($("settingsOverlay"), game);
const tip = $("tip");
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button"); if (b && !(b instanceof HTMLInputElement)) b.blur(); });   // so Space pauses, not "presses" the last button

function resize() { renderer.resize(); }
window.addEventListener("resize", resize);
resize();
// Start centred on the clearing (nudged left of the side panels), zoomed to show a village-sized patch.
cam.zoom = Math.min(24, Math.max(8, Math.floor(Math.min(cam.vw, cam.vh) / 40)));
cam.x = game.sim.site.x + 150 / cam.zoom; cam.y = game.sim.site.y;
setupInput(game, canvas);

function tooltip() {
  const { sim, ui } = game, h = ui.hover;
  let text = "";
  if (h && ui.mouse && ui.mouse.over && !ui.press && !ui.box) {
    if (h.villager) {
      const x = explain(sim, h.villager);
      text = describe(sim, h.villager) + (x ? "\n" + x.headline : "");
    } else if (h.ents.length) text = h.ents.map(e => describe(sim, e)).join("\n");
    else if (h.kind === "stock") text = "Stockpile - where food and materials are kept";
  }
  if (!text) { tip.style.display = "none"; return; }
  tip.style.display = "block";
  if (tip.dataset.t !== text) { tip.dataset.t = text; tip.innerHTML = text.split("\n").map(esc).join("<br>"); }
  tip.style.left = Math.min(ui.mouse.x + 14, cam.vw - tip.offsetWidth - 8) + "px";
  tip.style.top = Math.min(ui.mouse.y + 16, cam.vh - tip.offsetHeight - 8) + "px";
}

// ---- loop ----
let acc = 0, prev = performance.now(), panelT = 0, lastDraw = 0, fitT = 0;
function frame(now) {
  const dtMs = Math.min(250, now - prev); prev = now;
  const { state, ui } = game;
  state.fps += (1000 / Math.max(1, dtMs) - state.fps) * 0.1;
  const sim = game.sim;

  let ran = false;
  if (game.skipper.active) {
    game.skipper.run(SLICE_MS); ran = true;
  } else if (!state.paused) {
    const sp = game.effectiveSpeed();
    if (sp === Infinity) {                                      // MAX: as many ticks as fit in SLICE_MS
      const t0 = performance.now(); let n = 0;
      do { sim.step(); n++; } while ((n & 15) !== 0 || performance.now() - t0 < SLICE_MS);
      state.msPerTick += ((performance.now() - t0) / n - state.msPerTick) * 0.1; acc = 0; ran = true;
    } else {
      const tickMs = 1000 / (TICKS_PER_SEC * sp), cap = Math.max(MAX_TICKS_PER_FRAME, Math.ceil(sp * TICKS_PER_SEC * 0.25));
      acc = Math.min(acc + dtMs, tickMs * cap);
      const t0 = performance.now();
      let n = 0;
      while (acc >= tickMs && n < cap) {
        sim.step(); acc -= tickMs; n++;
        if (performance.now() - t0 > TIME_BUDGET_MS) { acc = 0; break; }
      }
      if (n) state.msPerTick += ((performance.now() - t0) / n - state.msPerTick) * 0.1;
      ran = n > 0;
    }
  } else acc = 0;

  // Drop selections of villagers that died.
  const live = ui.sel.filter(id => sim.ents.get(id));
  if (live.length !== ui.sel.length) { ui.sel = live; sync(); }
  if (ui.other && ui.other.kind === "entity" && !sim.ents.get(ui.other.id)) ui.other = null;

  panKeys(game, dtMs / 1000);
  possessCtl.frame();
  watch(game);
  orderEnds(sim);
  const fast = game.skipper.active || (ran && game.effectiveSpeed() === Infinity);
  if (!fast || now - lastDraw > DRAW_MS_FAST) {
    lastDraw = now;
    renderer.draw(sim, { zones: ui.overlays.zones || ui.hoverStock || (ui.other && ui.other.kind === "stock") });
    drawOverlays(game);
  }

  if (now - fitT > 1000) { fitT = now; game.fitTopbar(); }           // S12: the top bar scales to what fits
  if (autosaveTick(game, now) && game.lastAutoKey) game.autoToast = now;      // S12: once a game day, a ring of slots (one in an ironman game)

  if (now - panelT > PANEL_MS) {
    panelT = now;
    const sv = survey(sim), vs = sim.ents.ofKind("villager");
    const popText = (sim.ironman ? "IRONMAN  ·  " : "") + `Pop ${vs.length}  ·  food ${sv.rations} (${sim.board.runway >= 99 ? "-" : sim.board.runway.toFixed(1)} d)`
      + (sim.board.fc ? "  ·  FOOD LOW" : "") + (sim.board.sc ? "  ·  NEEDS SHELTER" : "");
    bar.update({ tick: sim.tick, popText });
    possessCtl.update();
    revealer.update(); concernsP.update(); village.update(); bps.update(); crewsP.update(); expd.update(); alm.update(); buildbar.update(); chron.update(); why.update(); insp.update(); notables.update(); orderbar.update(); digest.update(); help.update(); settings.update();
    $("perf").textContent = `${state.fps.toFixed(0)} fps · ${state.msPerTick.toFixed(2)} ms/tick · seed ${sim.seed} · tick ${sim.tick} · z ${renderer.z}`;
    $("hint").textContent = game.possessed() ? "Guiding a villager: WASD walk · E / click use what is next to you · Esc release" : ui.mode === "build" ? "Build mode: drag to plan, R rotates a stamp, [ ] changes level, Esc leaves" : ui.targeting ? "Click the map to place the order" : ui.sel.length ? "Right-click to order · Tab next · F follow · Esc deselect" : "Click a villager to see what it is doing and why · H: help";
    document.body.classList.toggle("building", ui.mode === "build");
    colR.style.display = ui.sel.length || ui.other ? "" : "none";
    canvas.style.cursor = ui.targeting ? "crosshair" : "";
  }
  tooltip();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handle for tools/*.js and the console. sim is a getter-like field kept current by setSim.
window.__game = game;
game.D = D; game.F = F; game.M = M;
