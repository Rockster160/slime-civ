// First-person view controller (S18): the camera, the controls and the DOM HUD around render/fpv.js. It sends the SAME commands the top-down possession
// does (pinput: dx, dy, tid or a verb with a cell) - the crosshair only chooses the target - and changes nothing in the sim. Always on
// while guiding (only without WebGL, or with ?fpv=0, does the top-down guide stay). HUD structure follows UI_SPEC §7 (plate, verb chip, need rings, held item, hazard icons,
// vignette) so S19 can re-skin it: every part is a DOM node with a class named fv-*, filled from the same data as the possession banner.
import { MAT } from "../sim/world.js";
import { maxHp, fitness, ageDays, SOFT } from "../sim/villager.js";
import { hazardLines } from "../sim/underground.js";
import { FpvRenderer, FOV } from "../render/fpv.js";
import { RenderView } from "../render/renderer.js";
import { item as paintItem } from "../render/sprites.js";
import { lookDir, walkDir, faceOfYaw, clampLook, swayTarget, easeLook } from "../render/fpvmath.js";
import { pickTarget } from "./fpvpick.js";
import { esc, remember } from "./dom.js";
import { svg as iconSvg } from "./icons.js";
import { ring as kitRing, meter } from "./kit.js";
import { describe, blockerText, itemName, shortBlocker, JOB } from "./text.js";
import { doingWord, faunaWord } from "./labels.js";

export const EYE = 0.74;                 // eye height above the floor, in cells
const PITCH = -0.16, TURN_MS = 150;         // UI_SPEC §12.3: a grid crawler: four facings, a fixed slight downward look, 90 degree turns that take ~150 ms; no mouse-look, no pointer lock

const IC = { warm: "warmth", hp: "health", "bad-air": "warn", "cave-in": "underground", dark: "night", strike: "hunt", take: "use" };     // the old local glyph names -> the shared registry (ui/icons.js)
const svg = (n, cls = "") => iconSvg(IC[n] || n, 16, "fv-i " + cls);
const VERB = { chop: ["Chop", "chop"], forage: ["Pick", "take"], cut: ["Cut", "take"], haul: ["Take", "take"], strike: ["Strike", "strike"], dig: ["Dig", "dig"], sleep: ["Sleep", "sleep"], eat: ["Eat", "food"], dry: ["Hang to dry", "take"], build_site: ["Build", "build"], craft_site: ["Build", "build"], store: ["Put down", "take"], drink: ["Drink", "water"] };
const NEEDS = [["hunger", "Food", "food"], ["thirst", "Water", "water"], ["energy", "Energy", "energy"], ["warm", "Warmth", "warm"]];
const RING_CAP = { Energy: "Rest", Warmth: "Warm" };
const HAZ_ICON = (t) => /roof/i.test(t) ? "cave-in" : /air/i.test(t) ? "bad-air" : "dark";

export function createFpv(game) {
  const { ui, cam } = game, canvas = document.getElementById("fpv"), hud = document.getElementById("fpvhud");
  const S = game.fpv = {
    lk: { yaw: 0, pitch: 0, ty: 0, tp: 0, hold: null, nudge: 0, cell: "" },       // the look-around offset on top of the facing (hold right or middle mouse and move; a small sway follows the cursor)
    on: false, yaw: 0, tyaw: 0, face: 0, pitch: PITCH, pos: null, locked: false, nolock: true, target: null, R: null, why: "", mouse: null,
    frames: [], cpu: [], last: 0, lastUnlock: 0, popMs: 1000,         // popMs: how long a floating pop stays (screenshot tools raise it)
  };
  let hudHtml = "", hudAt = 0, held = "", chip = null, host = null, lastFb = "";

  game.fpvDevOff = new URLSearchParams(location.search).get("fpv") === "0";      // dev path (?fpv=0, or ui_smoke setting it): keep the top-down guide, to cover the fallback
  game.fpvDir = () => {                                                  // the walking step for the held keys while in first person (null: not in first person)
    if (!S.on) return null;
    const k = game.keys, f = (k.has("panUp") ? 1 : 0) - (k.has("panDown") ? 1 : 0), s = (k.has("panRight") ? 1 : 0) - (k.has("panLeft") ? 1 : 0);
    return walkDir(S.tyaw, f, s);
  };
  game.fpvEscape = () => S.on && performance.now() - S.lastUnlock < 150;      // the Esc that just released the mouse is not also "let go of the villager"
  game.fpvUse = () => {                                                   // E / click: the thing under the crosshair (false: nothing, so the caller falls back to the cell you face)
    if (!S.on || !S.target) return false;
    return game.useTarget(S.target.tgt) || true;
  };
  game.fpvAuto = () => { if (!game.fpvDevOff && !S.on) enter(); };                  // possession just began: guiding a villager is always first person (S18b request); the top-down guide is only the fallback when WebGL is missing

  function enter() {
    const v = game.possessed();
    if (!v) return false;
    if (!S.R) S.R = new FpvRenderer(canvas);
    if (!S.R.ok) { game.toast("No WebGL here, so you are guiding from above."); return false; }
    const f = ui.face || { dx: 0, dy: 1 };
    S.face = faceOfYaw(Math.atan2(f.dy, f.dx)) && ((Math.round(Math.atan2(f.dy, f.dx) / (Math.PI / 2)) % 4) + 4) % 4; S.yaw = S.tyaw = S.face * Math.PI / 2; S.pitch = PITCH; S.pos = null; S.on = true; S.lk.yaw = S.lk.pitch = S.lk.ty = S.lk.tp = S.lk.nudge = 0; S.lk.hold = null; S.frames.length = 0; S.cpu.length = 0; S.last = 0;
    document.body.classList.add("fpv"); canvas.style.display = "block"; hud.style.display = "block";
    if (!S.hinted) game.toast("First person: turn with the arrows, " + game.keymap.label("use") + " uses what is ahead.", 4000);
    S.hinted = true;
    return true;
  }
  function leave() {
    S.on = false; S.target = null;
    document.body.classList.remove("fpv"); canvas.style.display = "none"; hud.style.display = "none";
    hudHtml = "";
  }

  // ---- turning and the mouse (§12.3): arrows / , . / the wheel turn 90 degrees; the mouse only points at things, it never rotates the view ----
  /** Tests and tools: face an exact yaw at once (and optionally a pitch). */
  S.look = (yaw, pitch) => { S.yaw = S.tyaw = yaw; S.face = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) & 3; S.pitchFix = pitch === undefined ? null : pitch; };
  game.fpvTurn = (d) => { if (!S.on) return; S.face = (S.face + d + 4) & 3; S.tyaw += d * Math.PI / 2; resetLook(); };
  /** A turn or a step puts the view back on the facing. */
  function resetLook() { const L = S.lk; L.hold = null; L.ty = L.tp = 0; L.nudge = 0; }
  game.fpvNudge = (d) => { if (!S.on) return; S.lk.nudge = Math.max(-0.5, Math.min(0.5, S.lk.nudge + d * 0.1)); };
  /** Settings > Mouse sway. */
  game.sway = remember("sway") !== "0"; game.setSway = (on) => { game.sway = !!on; remember("sway", on ? "1" : "0"); };
  /** The camera's pitch and yaw the frame shows: the facing (eased) plus the look offset. */
  const camYaw = () => S.yaw + S.lk.yaw, camPitch = () => { const [, p] = clampLook(0, S.lk.pitch + S.lk.nudge, S.pitch); return S.pitch + p; };
  canvas.addEventListener("wheel", (e) => { if (!S.on) return; e.preventDefault(); if (performance.now() - (S.wheelAt || 0) > 180) { S.wheelAt = performance.now(); game.fpvTurn(e.deltaY > 0 ? 1 : -1); } }, { passive: false });
  canvas.addEventListener("mousemove", (e) => { S.mouse = { x: e.clientX, y: e.clientY }; });
  window.addEventListener("mousemove", (e) => {
    const h = S.lk.hold; if (!S.on || !h) return;
    if (!(e.buttons & (h.btn === 2 ? 2 : 4))) { S.lk.hold = null; S.lk.ty = S.lk.tp = 0; return; }          // the button came up out of sight
    const [y, p] = clampLook(h.yaw + (e.clientX - h.x) * 0.006, h.pitch - (e.clientY - h.y) * 0.005, S.pitch); S.lk.ty = y; S.lk.tp = p;
  });
  window.addEventListener("mouseup", (e) => { const h = S.lk.hold; if (h && (e.button === h.btn)) { S.lk.hold = null; S.lk.ty = S.lk.tp = 0; } });
  canvas.addEventListener("mouseleave", () => { S.mouse = null; });
  canvas.addEventListener("mousedown", (e) => {
    if (S.on && (e.button === 2 || e.button === 1)) { e.preventDefault(); S.lk.hold = { x: e.clientX, y: e.clientY, yaw: S.lk.ty, pitch: S.lk.tp, btn: e.button }; return; }          // hold right (or middle) and move to look around
    if (!S.on || e.button !== 0) return;
    e.preventDefault(); S.mouse = { x: e.clientX, y: e.clientY };
    S.target = aimTarget(game.sim, game.possessed());
    if (!game.fpvUse()) game.useTarget(null);
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  /** The ray under the mouse (or straight ahead when the mouse is off the view or parked) -> the same pick the crosshair used. */
  function aimDir() {
    const yw = camYaw(), pt = camPitch(), f = lookDir(yw, pt), m = S.mouse;
    if (!m) return f;
    const W = cam.vw, H = cam.vh, ty = Math.tan(FOV / 2), nx = (m.x / W * 2 - 1) * (W / H) * ty, ny = (1 - m.y / H * 2) * ty;
    const r = [-Math.sin(yw), Math.cos(yw), 0], u = [-Math.sin(pt) * Math.cos(yw), -Math.sin(pt) * Math.sin(yw), Math.cos(pt)];
    const d = [f[0] + nx * r[0] + ny * u[0], f[1] + nx * r[1] + ny * u[1], f[2] + nx * r[2] + ny * u[2]], l = Math.hypot(d[0], d[1], d[2]);
    return [d[0] / l, d[1] / l, d[2] / l];
  }
  function aimTarget(sim, v) {
    if (!v || !S.pos) return null;
    return pickTarget(sim, v, game.renderer.view, [S.pos.x, S.pos.y, S.pos.z], aimDir(), S.R.targets);
  }

  // ---- the per-frame call from main.js: true = this frame was drawn in first person ----
  S.frame = (now, dt) => {
    if (!S.on) return false;
    const sim = game.sim, v = game.possessed();
    if (!v) { leave(); return false; }
    const k = game.keys;
    { const diff = S.tyaw - S.yaw, step = (Math.PI / 2) / (TURN_MS / 1000) * dt; S.yaw = (game.access && game.access.calm) || Math.abs(diff) <= step ? S.tyaw : S.yaw + Math.sign(diff) * step; }     // the smooth 90 degree turn (calm: at once)
    S.pitch = S.pitchFix === null || S.pitchFix === undefined ? PITCH : S.pitchFix;
    const f = faceOfYaw(S.tyaw); ui.face = { dx: f[0], dy: f[1] };          // movement and the default target follow the facing, never the look offset
    { const L = S.lk, calm = !!(game.access && game.access.calm), cell = v.x + "," + v.y;
      if (L.cell && L.cell !== cell) resetLook(); L.cell = cell;
      let ty = L.ty, tp = L.tp;
      if (!L.hold && game.sway && !calm && S.mouse) { const sw = swayTarget(S.mouse.x, S.mouse.y, cam.vw, cam.vh); ty = sw[0]; tp = sw[1]; }
      L.yaw = easeLook(L.yaw, ty, dt, calm && !L.hold); L.pitch = easeLook(L.pitch, tp, dt, calm && !L.hold); }
    
    // the eye eases between cells (the sim moves on a grid; the camera must not teleport with it)
    const tx = v.x + 0.5, ty = v.y + 0.5, tz = v.z + EYE;
    if (!S.pos || Math.abs(S.pos.x - tx) + Math.abs(S.pos.y - ty) > 4 || Math.abs(S.pos.z - tz) > 3) S.pos = { x: tx, y: ty, z: tz };
    else { const a = 1 - Math.exp(-dt * 13); S.pos.x += (tx - S.pos.x) * a; S.pos.y += (ty - S.pos.y) * a; S.pos.z += (tz - S.pos.z) * a; }
    const R = S.R, rd = game.renderer;
    if (!rd.view || rd.view.world !== sim.world) rd.view = new RenderView(sim.world);        // the renderer's own chunk cache: reading land the sim has not made resident never touches the sim
    R.resize(cam.vw, cam.vh);
    const t0 = performance.now();
    const eye = [S.pos.x, S.pos.y, S.pos.z];
    S.target = pickTarget(sim, v, rd.view, eye, aimDir(), R.targets);
    R.draw(sim, rd.view, { x: eye[0], y: eye[1], z: eye[2], yaw: camYaw(), pitch: camPitch() }, { calm: !!(game.access && game.access.calm), target: S.target && S.target.hit ? S.target.hit : null });
    if (S.wantSample) { S.sampled = R.sample(S.wantSample); S.wantSample = 0; }
    S.cpu.push(performance.now() - t0); if (S.cpu.length > 240) S.cpu.shift();
    if (S.last) { S.frames.push(now - S.last); if (S.frames.length > 240) S.frames.shift(); }
    S.last = now;
    updateHud(sim, v, now);
    return true;
  };
  /** Ask for a grid of pixels read back right after the next draw (tests: "the canvas is not blank"). Read S.sampled afterwards. */
  S.sample = (n = 9) => { S.sampled = null; S.wantSample = n; };
  /** Frame-time summary for the smoke test and the console: real frame intervals and the CPU cost of the draw call (JS: meshing, sprites, GL submission). */
  S.stats = () => {
    const q = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
    const m = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    return { frames: S.frames.length, frameMs: m(S.frames), p95Ms: q(S.frames, 0.95), fps: S.frames.length ? 1000 / m(S.frames) : 0, cpuMs: m(S.cpu), cpuP95Ms: q(S.cpu, 0.95), faces: S.R ? S.R.facesDrawn : 0, sprites: S.R ? S.R.spritesDrawn : 0, builds: S.R ? S.R.stats.builds : 0 };
  };

  // ---- HUD ----
  function ensureHud() {
    if (host) return;
    host = hud;
    host.innerHTML = '<div class="fv-vig"></div><div class="fv-edge"></div><div class="fv-plate"></div><div class="fv-haz"></div><div class="fv-cross"><i></i><i></i></div><div class="fv-tags"></div><div class="fv-chip" style="display:none"></div><div class="fv-rings"></div><div class="fv-state"></div><div class="fv-held"><canvas width="32" height="32"></canvas><span class="fv-heldt"></span></div><div class="fv-msg"></div>';
    chip = host.querySelector(".fv-chip");
  }
  function ring(label, v, soft, crit, ic, extra = "") {
    return `<span class="rc">` + kitRing({ icon: IC[ic] || ic, v, soft, crit, px: 30, tip: `${label} ${Math.round(v * 100)}%`, cls: extra }) + `<span class="cap">${RING_CAP[label] || label}</span></span>`;
  }
  // ---- 6.19c: a real progress ring. The sim keeps a step's work done (`action.p`) but not its length, so the length per verb is learned from the largest value seen before it resets (a step's own `dur` is used when it has one); until then the ring spins ----
  const durs = new Map(); let wk = { a: null, si: -1, peak: 0 };
  function workFrac(v) {
    const a = v.action; if (!a || a.type !== "Task" || a.ph !== 1) { wk = { a: null, si: -1, peak: 0 }; return -1; }
    const s = a.steps[a.si]; if (!s) return -1;
    if (wk.a === a && wk.si === a.si) { if (a.p < wk.peak * 0.5) { durs.set(s.v, Math.max(durs.get(s.v) || 0, wk.peak)); wk.peak = 0; } wk.peak = Math.max(wk.peak, a.p); }
    else { if (wk.a && wk.peak > 0 && wk.stepV) durs.set(wk.stepV, Math.max(durs.get(wk.stepV) || 0, wk.peak)); wk = { a, si: a.si, peak: a.p, stepV: s.v }; }
    wk.stepV = s.v;
    const dur = s.dur || durs.get(s.v) || 0;
    return dur > 0 ? Math.max(0, Math.min(1, a.p / dur)) : -1;
  }
  // ---- 6.19c: what the others nearby are doing, as small floating labels (UI_SPEC §12.2): slimes and creatures within 6 cells, in front of the eye ----
  const TAG_R = 6, tagEls = new Map();
  function tags(sim, v) {
    const host2 = host.querySelector(".fv-tags"), R = S.R, seen = new Set(), cand = [];
    if (!R || !R.toScreen) return;
    for (const e of sim.ents.ofKind("villager")) if (e !== v) cand.push(e);
    for (const e of sim.ents.ofKind("fauna")) cand.push(e);
    for (const e of cand) {
      const dx = e.x - v.x, dy = e.y - v.y, d = Math.hypot(dx, dy);
      if (d > TAG_R || Math.abs(e.z - v.z) > 3) continue;
      const word = e.kind === "villager" ? doingWord(e) : faunaWord(e);
      if (!word) continue;
      const p = R.toScreen(e.x + 0.5, e.y + 0.5, e.z + (e.kind === "villager" ? 1.25 : 1.1));
      if (!p || p[0] < 30 || p[0] > cam.vw - 30 || p[1] < 100 || p[1] > cam.vh - 90) continue;
      seen.add(e.id);
      let el = tagEls.get(e.id);
      if (!el) { el = document.createElement("div"); el.className = "fv-tag"; host2.appendChild(el); tagEls.set(e.id, el); }
      const txt = (e.kind === "villager" ? (e.name || "").split(" ")[0] + ": " : "") + word;
      if (el.dataset.t !== txt) { el.dataset.t = txt; el.textContent = txt; }
      el.className = "fv-tag" + (e.kind === "fauna" ? (e.hostile || (e.sp === "wolf" || e.sp === "thornback") ? " foe" : " beast") : "");
      el.style.transform = `translate(${p[0].toFixed(0)}px,${p[1].toFixed(0)}px) translate(-50%,-100%)`;
      el.style.opacity = String(Math.max(0.45, 1 - d / (TAG_R + 1)).toFixed(2));
    }
    for (const [id, el] of tagEls) if (!seen.has(id)) { el.remove(); tagEls.delete(id); }
  }
  // ---- §12.2 action feedback: floating pops for hits and misses, food, items and failures; the state label ----
  const prev = { hunger: null, carry: "", fb: 0, ht: new Map(), hp: -1 };
  function pop(text, icon, cls, x, y) {
    const el = document.createElement("div");
    el.className = "fv-pop " + cls + (game.access && game.access.calm ? " calm" : ""); el.style.left = x + "px"; el.style.top = y + "px";
    el.innerHTML = (icon ? svg(icon) : "") + "<b>" + esc(text) + "</b>";
    host.appendChild(el); setTimeout(() => el.remove(), S.popMs);
  }
  function feedback(sim, v, now) {
    const W = cam.vw, H = cam.vh, T = S.target;
    if (prev.hunger !== null && v.hunger > prev.hunger + 0.02) pop("+food", "food", "good", 70, H - 110);
    prev.hunger = v.hunger;
    const ck = v.carry ? v.carry.item + ":" + v.carry.n : "";
    if (ck !== prev.carry) { const was = prev.carry.split(":"); if (v.carry && (was[0] !== v.carry.item || Number(was[1]) < v.carry.n)) pop("+" + (was[0] === v.carry.item ? v.carry.n - Number(was[1]) : v.carry.n) + " " + itemName(v.carry.item), "haul", "good", W / 2, H - 100); prev.carry = ck; }
    const fb = v.poss ? v.poss.fb : null;
    if (fb && fb[1] !== prev.fb && sim.tick - fb[1] < 40 && fb[0]) { prev.fb = fb[1]; pop(shortBlocker(fb[0]), "blocked", "bad", W / 2, H / 2 + 40); }
    for (const e of sim.ents.ofKind("fauna")) {                    // hits and misses on creatures near the guided villager: a number or "miss", a flash on the chip, a nudge of the view
      if (Math.abs(e.x - v.x) > 6 || Math.abs(e.y - v.y) > 6) continue;
      const seen = prev.ht.get(e.id) || 0;
      if (e.ht > seen && sim.tick - e.ht < 30) {
        const p = S.R && S.R.toScreen ? S.R.toScreen(e.x + 0.5, e.y + 0.5, e.z + 0.6) : null;
        pop(e.hd > 0 ? "-" + e.hd : "miss", e.hd > 0 ? "hurt" : "", e.hd > 0 ? "hit" : "miss", p ? Math.max(60, Math.min(W - 60, p[0])) : W / 2, p ? Math.max(80, Math.min(H - 120, p[1])) : H / 2);
        if (chip) { chip.classList.remove("flash"); void chip.offsetWidth; chip.classList.add("flash"); }
        if (!(game.access && game.access.calm)) { host.classList.remove("nudge"); void host.offsetWidth; host.classList.add("nudge"); }
      }
      prev.ht.set(e.id, e.ht);
    }
    if (v.ht && v.hd > 0 && v.ht !== prev.hp && sim.tick - v.ht < 30) { prev.hp = v.ht; pop("-" + v.hd, "hurt", "hit", W / 2, H - 150); }
    const st = v.slp === 1 ? "Sleeping…" : v.action ? ((v.job && JOB[v.job.k] ? JOB[v.job.k].noun : "Working") + "…") : "";
    const el = host.querySelector(".fv-state"); if (el && el.dataset.s !== st) { el.dataset.s = st; el.textContent = st; }
  }
  function updateHud(sim, v, now) {
    ensureHud();
    // the chip follows the target every frame (cheap)
    const T = S.target;
    if (T && !(ui.help)) {
      const p = S.R.toScreen(T.at[0], T.at[1], T.at[2]), far = !!T.blocker;
      const [name, ic] = T.task ? (VERB[T.task] || ["Use", "take"]) : ["", "take"];
      const label = far ? (T.blocker === "TOO_FAR" ? "Walk closer" : blockerText("", T.blocker)) : name;
      const what = T.ent ? describe(sim, T.ent).replace(/ - .*$/, "") : (MAT[T.mat] ? MAT[T.mat].name : "rock");
      const key = game.keymap.label("use").split(" / ")[0];
      const nm = what.split(" ").slice(0, 2).join(" "), fa = T.ent && T.ent.kind === "fauna" ? T.ent : null;      // §12.2: the verb plus the target's name, and a health bar on a creature
      const html = `${svg(far ? "fear" : ic)}<kbd>${esc(key)}</kbd><b>${esc(label)}</b><span>${esc(nm)}</span>${fa ? meter(fa.hp / fa.mhp, { color: "var(--danger)", tip: `${Math.max(0, Math.round(fa.hp))}/${fa.mhp}` }) : ""}${v.action && v.action.type === "Task" && v.action.ph === 1 ? `<svg class="fv-prog" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle class="bg" cx="10" cy="10" r="7.5"/><circle class="fg" cx="10" cy="10" r="7.5" transform="rotate(-90 10 10)"/></svg>` : ""}<span class="sr">${esc(what)}</span>`;
      if (chip.dataset.h !== html) { chip.dataset.h = html; chip.innerHTML = html; }
      chip.classList.toggle("far", far);
      const fg = chip.querySelector(".fv-prog .fg");
      if (fg) { const f = workFrac(v), C = 47.12; fg.parentNode.classList.toggle("ind", f < 0); if (f >= 0) fg.style.strokeDasharray = (f * C).toFixed(1) + " " + C; else fg.style.strokeDasharray = "14 " + C; }
      const px = p ? Math.max(70, Math.min(cam.vw - 70, p[0])) : cam.vw / 2, py = p ? Math.max(60, Math.min(cam.vh * 0.6, p[1] - 26)) : cam.vh / 2 + 40;      // (kept above the toasts at the foot of the screen)
      chip.style.display = ""; chip.style.transform = `translate(${px.toFixed(0)}px,${py.toFixed(0)}px) translate(-50%,-100%)`;
    } else chip.style.display = "none";
    feedback(sim, v, now);
    tags(sim, v);
    if (now - hudAt < 110) return;
    hudAt = now;
    const mh = maxHp(v, fitness(v, ageDays(sim, v))), fb = v.poss ? v.poss.fb : ["", 0], km = game.keymap;
    const slow = game.state.speed > 2 && !game.state.paused;
    let h = `${svg("possess")}<b>${esc(v.name)}</b><kbd>Esc</kbd><span class="sr">Guiding ${esc(v.name)}</span>${slow ? `<span class="fv-lock" data-tip="Game speed is capped at 2x while you guide a villager">${iconSvg("lock", 14)}</span>` : ""}`;
    const plate = h;
    let rings = "", lowNeed = "";
    for (const [k, label, ic] of NEEDS) { rings += ring(label, v[k], SOFT[k][0], SOFT[k][1], ic); if (v[k] < SOFT[k][1]) lowNeed = ic; }
    rings += ring("Health", v.hp / mh, 0.6, 0.3, "hp");
    if ((v.fear || 0) > 0) rings += ring("Fear", v.fear, -1, -1, "fear", v.fear > 0.6 ? "fear hot" : "fear");
    const haz = hazardLines(sim, v.x, v.y, v.z).map(t => `<span class="fv-hz" data-tip="${esc(t)}">${svg(HAZ_ICON(t))}<span class="sr">${esc(t)}</span></span>`).join("");
    const heldKey = v.carry ? "c" + v.carry.item + v.carry.n : v.eq ? "e" + v.eq.item : "";
    const heldTxt = v.carry ? `${v.carry.n} ${itemName(v.carry.item)}` : v.eq ? itemName(v.eq.item).replace(/s$/, "") : "bare hands";
    const hurt = v.ht && sim.tick - v.ht < 24 && v.hd > 0;
    const msg = sim.tick - fb[1] < 120 && fb[0] ? blockerText(v.job ? v.job.k : "", fb[0]) : "";
    const state = [plate, rings, haz, heldKey, heldTxt, msg, lowNeed, hurt].join("|");
    if (state === hudHtml) return;
    hudHtml = state;
    host.querySelector(".fv-plate").innerHTML = plate;
    host.querySelector(".fv-rings").innerHTML = rings;
    host.querySelector(".fv-haz").innerHTML = haz;
    lastFb = msg;
    const ht = host.querySelector(".fv-heldt"), hk = `<kbd>${esc(km.label("drop"))}</kbd> put down`;
    ht.innerHTML = (v.carry ? `<b>${v.carry.n}</b>` : "") + `<span class="sr">${esc(heldTxt)}</span>` + (v.carry ? ` <kbd>${esc(km.label("drop"))}</kbd>` : "");
    if (heldKey !== held) {
      held = heldKey; const cv = host.querySelector(".fv-held canvas"), c = cv.getContext("2d");
      c.clearRect(0, 0, 32, 32);
      if (v.carry) paintItem(c, v.carry.item, { n: Math.min(3, v.carry.n) }); else if (v.eq) paintItem(c, v.eq.item, { n: 1 });
    }
    const edge = host.querySelector(".fv-edge");
    edge.className = "fv-edge" + (hurt ? " hurt" : "") + (lowNeed ? " low" : "") + (game.access && game.access.calm ? " calm" : "");
    edge.dataset.need = lowNeed;
  }
}
