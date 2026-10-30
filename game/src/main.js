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
import { ObliqueRenderer } from "./render/oblique.js";
import { drawOverlays } from "./render/overlays.js";
import { createTopBar } from "./ui/topbar.js";
import { esc } from "./ui/dom.js";
import { createHud } from "./ui/hud.js";
import { installSprite, svg } from "./ui/icons.js";
import { installTip } from "./ui/tip.js";
import { createWhisper } from "./ui/whisper.js";
import { createVillageHud } from "./ui/village_hud.js";
import { createBook } from "./ui/book.js";
import { createPointers } from "./ui/pointers.js";
import { createInspector } from "./ui/inspector.js";
import { createDigest, watch } from "./ui/chronicle.js";
import { createNotables } from "./ui/notables.js";
import { createOrderBar } from "./ui/orders.js";
import { createBuildMode } from "./ui/build.js";
import { createBlueprintPanel } from "./ui/blueprints.js";
import { createExpeditionPanel } from "./ui/expedition.js";
import { createCoreChoice } from "./ui/corechoice.js";
import { createReveal } from "./ui/reveal.js";
import { remember } from "./ui/dom.js";
import { createKeymap } from "./ui/keys.js";
import { createAccess } from "./ui/access.js";
import { createSettings } from "./ui/settings.js";
import { autosaveTick, randomSeed } from "./ui/saves.js";
import { setupInput, panKeys } from "./ui/input.js";
import { createSkip, SLICE_MS } from "./ui/skip.js";
import { createMinimap } from "./ui/minimap.js";
import { createPossess } from "./ui/possess.js";
import { createFpv } from "./ui/fpv.js";
import { createLevels } from "./ui/levels.js";
import { createGuide } from "./ui/guide.js";
import { viewLevelFor } from "./render/obmath.js";
import { describe, explain, BLOCKER_TEXT } from "./ui/text.js";
import { survey } from "./sim/items.js";

const MAX_TICKS_PER_FRAME = 40;     // floor of the per-frame tick cap; it grows with speed (see frame())
const TIME_BUDGET_MS = 20;          // stop stepping early if a frame is already this slow (the spiral guard)
const POSSESS_CAP = 2;              // GDD §07: game speed is capped while guiding a villager
const DRAW_MS_FAST = 200;           // the map redraws a few times a second at MAX / while skipping
const PANEL_MS = 150;               // panels refresh at ~7 Hz; the map redraws every frame

const params = new URLSearchParams(location.search);
const canvas = document.getElementById("view");
const cam = new Camera();
// 6.19b: the map is the angled (3/4 oblique, WebGL2) view; the canvas2D top-down renderer stays for `?flat=1` and for browsers without WebGL
let renderer = params.get("flat") === "1" ? null : new ObliqueRenderer(canvas, cam, document.getElementById("glview"));
let mapNote = "";
if (renderer && !renderer.ok) { mapNote = "no-webgl"; renderer = null; }
if (!renderer) { cam.setPitch(Math.PI / 2); renderer = new Renderer(canvas, cam); document.getElementById("glview").style.display = "none"; }
const $ = (id) => document.getElementById(id);

const game = {
  sim: Sim.create(Number(params.get("seed")) || randomSeed(), params.get("spawn") ? { spawn: { x: Number(params.get("spawn").split(",")[0]), y: Number(params.get("spawn").split(",")[1]) } } : {}),     // ?spawn=64,64 pins the camp (tests that hard-code positions); the game searches for a fair start
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
/** S17: centre the view on the camp (the Home key and the minimap's button). */
/** UI_SPEC §12.4: every "show me" jump (concern chip, pointer, minimap, Tab, chronicle, trip card) lands on a view where the thing and its surroundings are visible:
 *  the Surface view for something on the surface, else the slice at its level with a lit radius round it (viewing only, the sim's fog is not touched). */
game.viewAt = (x, y, z) => {
  cam.x = x + 0.5; cam.y = y + 0.5; game.ui.follow = 0;
  if (z === undefined || z < 0) return;
  const top = renderer.view ? renderer.view.topZ(x, y, D - 1) : renderer.topAt(x, y), want = viewLevelFor(top, z, D);      // the Surface for something standing on its column's top, else the slice at its level
  if (want >= D - 1) { renderer.peek = null; game.setLevel ? game.setLevel(D - 1) : renderer.setZ(D - 1); }
  else { (game.setLevel || ((n) => renderer.setZ(n)))(want); renderer.peek = { x, y, z: renderer.z, r: 7 }; }       // lit and shown for viewing only; the sim's fog is untouched
};
game.goHome = () => { const s = game.sim.site; cam.x = s.x + 0.5; cam.y = s.y + 0.5; game.ui.follow = 0; game.renderer.peek = null; (game.setLevel || ((n) => game.renderer.setZ(n)))(D - 1); };
/** S17: send the selected villagers to scout (walk to and reveal) a cell. */
game.scoutTo = (x, y) => {
  const vs = game.ui.sel.map(id => game.sim.ents.get(id)).filter(v => v && v.kind === "villager");
  if (!vs.length) { game.toast("Select villagers first, then right-click the map to send them scouting."); return false; }
  const ok = game.sim.apply({ type: "scout", ids: vs.map(v => v.id), x, y });
  game.toast(ok ? "Scouting: " + vs.length + (vs.length === 1 ? " villager heads" : " villagers head") + " there." : "Cannot scout there: " + (BLOCKER_TEXT[game.sim.lastBlocker] || "they cannot (children stay at camp)") + ".");
  if (ok) game.ui.markers.push({ x, y, z: 0, label: "Scout", t: performance.now(), verb: "scout" });
  return ok;
};
game.togglePause = () => { game.state.paused = !game.state.paused; };
function sync() {                       // keep focus inside the selection
  const ui = game.ui;
  if (!ui.sel.includes(ui.focus)) ui.focus = ui.sel[0] || 0;
  if (ui.sel.length) ui.other = null;
}
/** A split replaces a slime with 2-5 selves: move the selection, focus and follow onto them (the sim notes the last split; it is not saved). */
let lastSplit = null;
function followSplit() {
  const s = game.sim.lastSplit, ui = game.ui;
  if (!s || s === lastSplit) return;
  lastSplit = s;
  if (ui.sel.includes(s.from)) { ui.sel = ui.sel.flatMap(id => (id === s.from ? s.to : [id])); if (ui.focus === s.from) ui.focus = s.to[0]; }
  if (ui.follow === s.from) ui.follow = s.to[0];
  sync();
}
function reveal(v) {                    // bring a villager into view if it is off-screen
  const [sx, sy] = cam.toScreen(v.x + 0.5, v.y + 0.5, v.z);
  const top = renderer.view ? renderer.view.topZ(v.x, v.y, D - 1) : renderer.topAt(v.x, v.y), want = viewLevelFor(top, v.z, D);
  if (sx < 320 || sx > cam.vw - 360 || sy < 80 || sy > cam.vh - 100 || renderer.z !== want) game.viewAt(v.x, v.y, v.z);
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
  if (game.guide && game.guide.rearm) game.guide.rearm();      // 6.20: hints restart their 4 s clock for the new world
};

installSprite();
{                                                              // 6.20: the build stamp ("v6.20 · a1b2c3d+ · 10-28 14:05"), shown only in Menu > About this world; window.__BUILD is injected by tools/build.js. Not part of the sim or any save.
  const B = window.__BUILD || { stage: "dev", commit: "src", dirty: false, time: "" };
  game.build = B; game.buildText = "v" + B.stage + " · " + B.commit + (B.dirty ? "+" : "") + (B.time ? " · " + B.time.slice(5) : "");
}
createAccess(game);                     // S12: UI scale, contrast, colour-blind marks, reduced flashing
const slots = createHud(game, params);  // the HUD grid (ui/hud.js): every panel is mounted into one of its slots
createSkip(game);
const possessCtl = createPossess(game);
createFpv(game);                          // S18: the first-person view (a second renderer on the same sim; off until the player asks)

// ---- DOM ----
installTip();
createWhisper(slots.whisper, game, svg, esc);       // game.toast is now the whisper: one line, never stacked
const bar = createTopBar(slots.topbar, game);
const village = createVillageHud(slots.village, game);
const revealer = createReveal(game);
const inspector = createInspector(slots.inspector, game);
const expd = createExpeditionPanel(slots.inspector, game);
const cchoice = createCoreChoice($("corechoice"), game);
const bps = createBlueprintPanel(slots.popover, game);
const notables = createNotables(slots.strip, game);
const orderbar = createOrderBar(slots.orders, game);
const minimap = createMinimap(slots.minimap, game);
const buildbar = createBuildMode(game, slots.build);
const pointers = createPointers(slots.pointers, game);
const levels = createLevels(game, slots.gauge);
const guide = createGuide(game, slots.guide);
const digest = createDigest($("digest"), game);
const book = createBook($("book"), game);
const settings = createSettings($("settingsOverlay"), game);
const tip = $("tip");
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button"); if (b && !(b instanceof HTMLInputElement)) b.blur(); });   // so Space pauses, not "presses" the last button

function resize() { renderer.resize(); }
window.addEventListener("resize", resize);
resize();
// Start centred on the clearing (nudged left of the side panels), zoomed to show a village-sized patch.
cam.zoom = Math.min(24, Math.max(8, Math.floor(Math.min(cam.vw, cam.vh) / 40)));
cam.x = game.sim.site.x + 150 / cam.zoom; cam.y = game.sim.site.y;
renderer.sim = game.sim; renderer.setZ(D - 1);
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
let acc = 0, prev = performance.now(), panelT = 0, lastDraw = 0;
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
  followSplit();
  possessCtl.frame();
  watch(game);
  orderEnds(sim);
  levels.follow();                                                      // 6.19b: the view follows a slime into a shaft and back up
  const fast = game.skipper.active || (ran && game.effectiveSpeed() === Infinity);
  const inFpv = game.fpv.frame(now, dtMs / 1000);                      // S18: first person draws its own canvas; the top-down map is not drawn meanwhile
  if (!inFpv && (!fast || now - lastDraw > DRAW_MS_FAST)) {
    lastDraw = now;
    renderer.draw(sim, { zones: ui.overlays.zones || ui.hoverStock || (ui.other && ui.other.kind === "stock") || (ui.mode === "build" && ui.build.tool === "stockpile") });
    drawOverlays(game);
  }
  minimap.update(now);                                                  // S17: the corner map (its own throttle; reads the render cache and the seen data only)

  if (autosaveTick(game, now) && game.lastAutoKey) game.autoToast = now;      // S12: once a game day, a ring of slots (one in an ironman game)

  if (now - panelT > PANEL_MS) {
    panelT = now;
    bar.update({ tick: sim.tick });
    possessCtl.update();
    revealer.update(); levels.update(); guide.update(); village.update(); bps.update(); expd.update(); cchoice.update(); buildbar.update(); inspector.update(); notables.update(); orderbar.update(); digest.update(); book.update(); settings.update(); pointers.update();
    slots.popover.style.display = ui.mode === "build" && ui.bpOpen && game.unlocked("blueprints") ? "block" : "none";
    slots.dock.style.display = (ui.mode === "build" || ui.sel.length || game.possessed()) ? "flex" : "none";
    $("perf").textContent = `${state.fps.toFixed(0)} fps · ${state.msPerTick.toFixed(2)} ms/tick · seed ${sim.seed} · tick ${sim.tick} · z ${renderer.z}`;
    $("hint").textContent = game.possessed() ? "Guiding a villager: WASD walk · E / click use what is next to you · Esc release" : ui.mode === "build" ? "Build mode: drag to plan, R rotates a stamp, [ ] changes level, Esc leaves" : ui.targeting ? "Click the map to place the order" : ui.sel.length ? "Right-click to order · Tab next · F follow · Esc deselect" : "Click a villager to see what it is doing and why · H: help";
    document.body.classList.toggle("building", ui.mode === "build");
    slots.inspector.style.display = ui.sel.length || ui.other ? "" : "none";
    canvas.style.cursor = ui.targeting ? "crosshair" : "";
  }
  tooltip();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handle for tools/*.js and the console. sim is a getter-like field kept current by setSim.
window.__game = game;
game.D = D; game.F = F; game.M = M;
game.mapNote = mapNote;
/** The map pixel under a screen point as [r, g, b, a]: the angled view's GL canvas under the overlay canvas, or just the 2D canvas (tests and screenshots). */
game.mapPixel = (sx, sy) => {
  const t = document.createElement("canvas"); t.width = t.height = 1; const c = t.getContext("2d", { willReadFrequently: true });
  const gl = document.getElementById("glview"), dpr = renderer.dpr || 1;
  if (renderer.glCanvas && renderer.ok) c.drawImage(gl, sx / cam.vw * gl.width, sy / cam.vh * gl.height, 1, 1, 0, 0, 1, 1);
  c.drawImage(canvas, sx * dpr, sy * dpr, 1, 1, 0, 0, 1, 1);
  return Array.from(c.getImageData(0, 0, 1, 1).data);
};
