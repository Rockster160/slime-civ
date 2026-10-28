// Top bar (UI_SPEC §5, §11): the time dial and Day, pause/play, and on the right Build, Book, Layers and Menu. Nothing else is for the player: game speed, MAX and
// skip-to are developer tools, shown only with ?debug=1 or Settings > Developer tools (keys 1-9 keep working either way). Plain DOM, built once;
// update() writes only what changed.
import { dateOf, SEASON_NAMES } from "../sim/clock.js";
import { phase, isNight } from "../sim/season.js";
import { SPEEDS } from "./skip.js";
import { randomSeed } from "./saves.js";
import { saveLocal, loadLocal, downloadSave, loadFile, newGame, savedInfo, autoList, continueAuto } from "./saves.js";
import { svg } from "./icons.js";
import { btn, tipAttr } from "./kit.js";
import { dialSvg } from "./dial.js";

const OVERLAYS = [["zones", "stockpile", "Stockpile area and bed owners", "Z"], ["jobs", "jobs-lines", "Lines to what the selected villagers are working on", "L"], ["temp", "thermo", "Temperature and how warm each villager is", "T"]];

/** Morning / Noon / Afternoon / Dusk / Night, from the day's phase (season.js: night is phase < .10 or >= .80). */
export function timeOfDay(tick) {
  if (isNight(tick)) return "Night";
  const p = phase(tick);
  return p < 0.35 ? "Morning" : p < 0.60 ? "Noon" : p < 0.74 ? "Afternoon" : "Dusk";
}

export function createTopBar(root, game) {
  const { ui, state } = game;
  root.dataset.test = "topbar";
  root.innerHTML = `
    <span class="tb-dialw" data-test="dial" data-tip="Day 1"></span><span class="tb-day" data-test="day"></span><span class="tb-tod" data-test="tod"></span>
    ${btn({ icon: "pause", tip: "Pause\nSpace pauses and resumes", key: "", cls: "tb-pause", test: "pause" })}
    <span class="tb-dev" data-test="dev-speed">
      <span class="tb-sep"></span>
      <span class="tb-speed"></span>
      <span class="tb-menuwrap">${btn({ icon: "ff", tip: "Fast-forward (developer)", cls: "tb-ffb", test: "ff" })}<div class="pop ff" style="right:auto;left:0"></div></span>
      <span class="tb-skipst"><button class="tb-stop" data-test="stop" data-tip="Stop fast-forward\nEsc also stops it" style="display:none">${svg("close", 14)}</button></span>
    </span>
    <span class="tb-prog" data-test="skip-progress"></span>
    <span class="tb-spacer"></span>
    ${btn({ icon: "build", label: "Build", tip: "Build\nPlan walls, floors, roofs, doors and beds", key: "", cls: "tb-build", test: "build-toggle", attrs: 'data-key="B"' })}
    ${btn({ icon: "book", label: "Book", tip: "Book\nThe story, what the village knows, its people, the keys", cls: "tb-book", test: "book-btn", attrs: 'data-key="K"' })}
    <span class="tb-menuwrap">${btn({ icon: "layers", tip: "Layers\nWhat to draw on the map", cls: "tb-layers", test: "layers" })}<div class="pop layers-pop" data-test="layers-pop"></div></span>
    <span class="tb-menuwrap">${btn({ icon: "menu", tip: "Menu\nSave, load, new game, settings, keys", cls: "tb-game", test: "menu" })}
      <div class="pop menu" data-test="menu-pop">
        <button data-m="save" data-test="m-save">${svg("save", 16)}Save to browser <kbd>Shift-S</kbd></button>
        <button data-m="load" data-test="m-load">${svg("load", 16)}Load from browser <kbd>Shift-O</kbd></button>
        <button data-m="dl" data-test="m-dl">${svg("save", 16)}Download save (.json)</button>
        <button data-m="file" data-test="m-file">${svg("load", 16)}Load save from file...</button>
        <input type="file" accept=".json,application/json" style="display:none">
        <div class="mrow" data-test="about-world" data-tip="The seed names this world: the same seed makes the same land. Share it to replay it.">About this world: seed <b class="aboutseed" data-test="about-seed"></b></div>
        <div class="mrow"><label>New game <select class="seedmode" data-test="seed-mode"><option value="random" selected>Random</option><option value="enter">Enter seed</option></select></label><input class="seed" type="number" value="1" min="0" style="display:none" data-test="seed-input"></div>
        <div class="mrow"><button data-m="new" data-test="m-new">${svg("plus", 14)}Start</button></div>
        <label class="mrow" data-tip="One autosave slot, written once a game day. No manual saving, no loading: what happens, happens."><input type="checkbox" class="iron" data-test="ironman"> <span class="iron">Ironman</span></label>
        <div class="lbl autos-l">Autosaves</div><div class="autos"></div>
        <button data-m="settings" data-test="m-settings">${svg("gear", 16)}Settings</button>
        <button data-m="keys" data-test="m-keys">${svg("help", 16)}Keys</button>
        <div class="tb-debug" style="display:none"><div class="lbl">Debug</div>
          <button data-m="lightning" data-tip="Lightning strikes a tree near the camp (GDD 11.8)">${svg("bolt", 16)}Force lightning</button>
          <button data-m="stump" data-tip="A stump near the camp smoulders under a mound of earth">${svg("hearth", 16)}Force smouldering stump</button>
          <button data-m="ill" data-tip="The selected villager, or the first adult, falls ill">${svg("sick", 16)}Make someone ill</button></div>
        <div class="dim saveinfo"></div>
      </div></span>`;
  const q = (s) => root.querySelector(s);
  const dialw = q(".tb-dialw"), dayEl = q(".tb-day"), todEl = q(".tb-tod"), speedEl = q(".tb-speed"), menu = q(".pop.menu"), file = q("input[type=file]"), ffp = q(".pop.ff"), lay = q(".layers-pop");
  const pop = [menu, ffp, lay];
  const closePops = () => pop.forEach(p => p.classList.remove("open"));
  const toggle = (p) => { const was = p.classList.contains("open"); closePops(); if (!was) p.classList.add("open"); };

  // developer speed controls (hidden for players)
  const buttons = [];
  SPEEDS.slice(0, 3).forEach((sp, i) => {
    const b = document.createElement("button");
    b.className = "btn ico"; b.dataset.test = "speed-" + sp + "x"; b.dataset.tip = "Speed " + sp + "x\nKey " + (i + 1); b.innerHTML = svg(i === 0 ? "play" : i === 1 ? "speed2" : "speed3", 16); b.setAttribute("aria-label", "Speed " + sp + "x");
    b.onclick = () => game.setSpeed(sp); speedEl.appendChild(b); buttons.push([b, sp]);
  });
  ffp.innerHTML = SPEEDS.slice(3).map((sp, i) => `<button class="spd" data-sp="${sp}" data-test="speed-${sp === Infinity ? "max" : sp + "x"}">${svg("speed3", 16)}${sp === Infinity ? "MAX" : sp + "x"} <kbd>${i + 4}</kbd></button>`).join("")
    + `<div class="lbl">Skip to</div><button data-skip="morning" data-test="skip-morning">${svg("day", 16)}Next morning</button><button data-skip="season" data-test="skip-season">${svg("autumn", 16)}Next season</button><button data-skip="event" data-test="skip-event">${svg("ff", 16)}Until something happens</button>`;
  ffp.querySelectorAll(".spd").forEach(b => { const sp = b.dataset.sp === "Infinity" ? Infinity : Number(b.dataset.sp); b.onclick = () => { game.setSpeed(sp); closePops(); }; buttons.push([b, sp]); });
  ffp.querySelectorAll("[data-skip]").forEach(b => { b.onclick = () => { game.skipper.start(b.dataset.skip); closePops(); }; });
  q(".tb-ffb").onclick = (e) => { e.stopPropagation(); toggle(ffp); };
  q(".tb-stop").onclick = () => game.skipper.cancel("Stopped: you pressed Stop.");
  q(".tb-pause").onclick = () => game.togglePause();

  // layers
  const ovBtns = {};
  lay.innerHTML = `<div class="lbl">On the map</div><div class="layers"></div>`;
  for (const [k, icon, tip, key] of OVERLAYS) {
    const b = document.createElement("button"); b.className = "btn ico"; b.dataset.test = "layer-" + k; b.dataset.tip = tip + "\n" + "Key " + key; b.innerHTML = svg(icon, 16); b.setAttribute("aria-label", tip);
    b.onclick = () => { ui.overlays[k] = !ui.overlays[k]; };
    lay.querySelector(".layers").appendChild(b); ovBtns[k] = b;
  }
  q(".tb-layers").onclick = (e) => { e.stopPropagation(); toggle(lay); };
  q(".tb-book").onclick = () => game.openBook();
  q(".tb-build").onclick = () => game.setMode(ui.mode === "build" ? "select" : "build");
  q(".tb-game").onclick = (e) => {
    e.stopPropagation(); toggle(menu);
    const i = savedInfo();
    q(".saveinfo").textContent = i ? "Browser save: " + i.label + " (seed " + i.seed + ", " + i.kb + " KB)" : "";
    q(".seed").value = game.sim.seed; q(".aboutseed").textContent = game.sim.seed;
    const iron = game.sim.ironman, autos = autoList();                    // S12: autosaves on offer; an ironman game can load nothing, and its own slot only from another game
    for (const id of ["save", "load", "dl", "file"]) { const b = menu.querySelector(`[data-m="${id}"]`); b.disabled = iron; b.dataset.tip = iron ? "Ironman: no manual saving or loading" : ""; }
    q(".autos-l").style.display = autos.length ? "" : "none"; q(".autos").innerHTML = autos.length ? autos.map(a => `<button data-auto="${a.key}" ${iron ? "disabled" : ""}>${svg("load", 14)}${a.iron ? "Ironman: " : ""}Day ${a.day}, ${a.pop} villagers (seed ${a.seed}, ${a.kb} KB)</button>`).join("") : "";
  };
  window.addEventListener("click", (e) => { if (!e.target.closest || !e.target.closest(".tb-menuwrap")) closePops(); });
  menu.addEventListener("click", (e) => {
    const au = e.target.closest("[data-auto]");
    if (au && !au.disabled) { continueAuto(game, au.dataset.auto); closePops(); return; }
    const m = e.target.closest("[data-m]"); if (!m) return;
    const a = m.dataset.m;
    if (a === "save") saveLocal(game);
    else if (a === "load") loadLocal(game);
    else if (a === "dl") downloadSave(game);
    else if (a === "file") file.click();
    else if (a === "new") newGame(game, q(".seedmode").value === "random" ? randomSeed() : q(".seed").value, { ironman: q(".iron").checked });
    else if (a === "settings") ui.settings = true;
    else if (a === "keys") ui.help = true;
    else if (a === "ill") { const id = ui.sel.find(i => game.sim.ents.get(i) && game.sim.ents.get(i).kind === "villager") || (game.sim.ents.ofKind("villager").find(v => !v.ill) || {}).id; game.toast(id && game.sim.apply({ type: "ill", id }) ? "A villager has fallen ill." : "Nobody can be made ill (this world has no sickness, or they already are)."); }
    else if (a === "lightning" || a === "stump") game.toast(game.sim.apply({ type: "force", ev: a }) ? (a === "lightning" ? "Lightning strikes a tree near the camp." : "A stump near the camp starts to smoulder.") : "No tree to strike.");
    if (a !== "file") closePops();
  });
  file.addEventListener("change", () => { if (file.files[0]) loadFile(game, file.files[0]); file.value = ""; closePops(); });
  q(".seed").addEventListener("keydown", (e) => e.stopPropagation());
  q(".seedmode").addEventListener("change", () => { q(".seed").style.display = q(".seedmode").value === "enter" ? "" : "none"; });

  const last = {};
  const put = (el, k, text) => { if (last[k] !== text) { last[k] = text; el.textContent = text; } };
  const html = (el, k, h) => { if (last[k] !== h) { last[k] = h; el.innerHTML = h; } };
  return {
    update({ tick }) {
      const t = dateOf(tick), full = `Day ${t.day}, ${SEASON_NAMES[t.season]}, Year ${t.year}`;
      html(dialw, "dial", dialSvg(tick, state.paused && !game.skipper.active, performance.now() - (game.skipper.msgT || 0) < 900) + `<span class="sr">${full}</span>`);
      dialw.dataset.tip = full + (state.paused ? "\nPaused" : "");
      put(dayEl, "d", SEASON_NAMES[t.season] + " · Day " + t.day);
      put(todEl, "tod", timeOfDay(tick));
      const pb = q(".tb-pause"), pi = state.paused ? "play" : "pause";
      if (last.pi !== pi) { last.pi = pi; pb.innerHTML = svg(pi, 16); pb.dataset.tip = state.paused ? "Play\nSpace resumes" : "Pause\nSpace pauses"; }
      pb.classList.toggle("on", state.paused);
      q(".tb-build").classList.toggle("on", ui.mode === "build");
      q(".tb-book").classList.toggle("on", !!ui.book);
      const sk = game.skipper, poss = !!game.possessed();
      buttons.forEach(([b, sp]) => b.classList.toggle("on", !state.paused && !sk.active && state.speed === sp));
      root.querySelectorAll("[data-skip]").forEach((b) => { b.disabled = poss || !!sk.active; });
      put(q(".tb-prog"), "prog", sk.active ? sk.progress() : "");
      q(".tb-stop").style.display = sk.active ? "" : "none";
      for (const k in ovBtns) ovBtns[k].classList.toggle("on", !!ui.overlays[k]);
      q(".tb-debug").style.display = game.dev ? "" : "none";
    },
  };
}
