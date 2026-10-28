// Top bar: calendar, speed controls, population read-out, overlay toggles, the
// Build button (build mode, B), and the Game menu (save / load / new / settings).
// Plain DOM, built once; update() only writes text when it changed.
import { dateOf, SEASON_NAMES } from "../sim/clock.js";
import { SPEEDS } from "./skip.js";
import { saveLocal, loadLocal, downloadSave, loadFile, newGame, savedInfo } from "./saves.js";

export function createTopBar(root, game) {
  const { ui, state } = game;
  root.innerHTML = `
    <span class="tb-time"></span>
    <span class="tb-speed"></span>
    <span class="tb-pop"></span>
    <span class="tb-skip"><button data-skip="morning" title="Run at top speed until the next morning (stops early if something notable happens)">Next morning</button><button data-skip="season" title="Run at top speed until the next season">Next season</button><button data-skip="event" title="Run at top speed until anything happens: a birth, a death, a new chronicle entry, a finished build">Until something happens</button><span class="tb-prog"></span><button class="tb-stop" title="Stop fast-forward (Esc)" style="display:none">Stop</button></span>
    <span class="tb-spacer"></span>
    <span class="tb-ov"><span class="dim">Overlays</span></span>
    <button class="tb-build" title="Plan walls, floors, roofs, doors and beds (B)">Build</button>
    <span class="tb-menuwrap"><button class="tb-game">Game ▾</button>
      <div class="tb-menu" style="display:none">
        <button data-m="save">Save to browser <kbd>Shift-S</kbd></button>
        <button data-m="load">Load from browser <kbd>Shift-O</kbd></button>
        <button data-m="dl">Download save (.json)</button>
        <button data-m="file">Load save from file...</button>
        <input type="file" accept=".json,application/json" style="display:none">
        <div class="mrow"><label>New game, seed <input class="seed" type="number" value="1" min="0"></label><button data-m="new">Start</button></div>
        <label class="mrow"><input type="checkbox" class="autop"> Pause when a villager dies</label>
        <div class="dim saveinfo"></div>
      </div></span>
    <button class="tb-help" title="Help (H or ?)">? Help</button>`;
  const q = (s) => root.querySelector(s);
  const time = q(".tb-time"), pop = q(".tb-pop"), speedEl = q(".tb-speed"), menu = q(".tb-menu"), file = q("input[type=file]");
  const buttons = [];
  const pause = document.createElement("button");
  pause.textContent = "❚❚"; pause.title = "Pause (Space)";
  pause.onclick = () => game.togglePause(); speedEl.appendChild(pause);
  for (let i = 0; i < SPEEDS.length; i++) {
    const sp = SPEEDS[i], b = document.createElement("button");
    b.textContent = sp === Infinity ? "MAX" : sp + "x";
    b.title = (sp === Infinity ? "Maximum speed: as many ticks as fit in each frame" : "Speed " + sp + "x") + " (key " + (i + 1) + ")";
    if (sp === 4) b.style.display = "none";                     // 4x stays on key 4 but is not worth a button
    b.onclick = () => game.setSpeed(sp); speedEl.appendChild(b); buttons.push(b);
  }
  root.querySelectorAll("[data-skip]").forEach((b) => { b.onclick = () => game.skipper.start(b.dataset.skip); });
  q(".tb-stop").onclick = () => game.skipper.cancel("Stopped: you pressed Stop.");
  const ovBtns = {};
  for (const [k, label, tip] of [["zones", "Stockpile", "Stockpile area and bed owners (Z)"], ["jobs", "Job lines", "Lines to what the selected villagers are working on (L)"], ["temp", "Warmth", "Temperature and how warm each villager is (T)"]]) {
    const b = document.createElement("button"); b.textContent = label; b.title = tip;
    b.onclick = () => { ui.overlays[k] = !ui.overlays[k]; };
    q(".tb-ov").appendChild(b); ovBtns[k] = b;
  }
  q(".tb-build").onclick = () => game.setMode(ui.mode === "build" ? "select" : "build");
  q(".tb-help").onclick = () => { ui.help = !ui.help; };
  q(".tb-game").onclick = (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "none" ? "block" : "none";
    const i = savedInfo();
    q(".saveinfo").textContent = i ? "Browser save: " + i.label + " (seed " + i.seed + ", " + i.kb + " KB)" : "No browser save yet.";
    q(".seed").value = game.sim.seed;
  };
  window.addEventListener("click", (e) => { if (!menu.contains(e.target)) menu.style.display = "none"; });
  menu.addEventListener("click", (e) => {
    const m = e.target.closest("[data-m]"); if (!m) return;
    const a = m.dataset.m;
    if (a === "save") saveLocal(game);
    else if (a === "load") loadLocal(game);
    else if (a === "dl") downloadSave(game);
    else if (a === "file") file.click();
    else if (a === "new") newGame(game, q(".seed").value);
    if (a !== "file") menu.style.display = "none";
  });
  file.addEventListener("change", () => { if (file.files[0]) loadFile(game, file.files[0]); file.value = ""; menu.style.display = "none"; });
  q(".autop").addEventListener("change", (e) => { ui.autoPause = e.target.checked; });
  q(".seed").addEventListener("keydown", (e) => e.stopPropagation());

  const last = {};
  const put = (el, k, text) => { if (last[k] !== text) { last[k] = text; el.textContent = text; } };
  return {
    update({ tick, popText }) {
      const t = dateOf(tick);
      put(time, "t", `Day ${t.day}, ${SEASON_NAMES[t.season]}, Year ${t.year}`);
      put(pop, "pop", popText || "");
      pop.classList.toggle("alarm", /LOW|SHELTER/.test(popText || ""));
      pause.classList.toggle("on", state.paused);
      q(".tb-build").classList.toggle("on", ui.mode === "build");
      const sk = game.skipper, eff = game.effectiveSpeed();
      buttons.forEach((b, i) => b.classList.toggle("on", !state.paused && !sk.active && state.speed === SPEEDS[i]));
      const poss = !!game.possessed();
      root.querySelectorAll("[data-skip]").forEach((b) => { b.disabled = poss || !!sk.active; b.title = poss ? "Fast-forward is off while you guide a villager" : b.title; });
      put(q(".tb-prog"), "prog", sk.active ? sk.progress() + "  (Esc stops)" : poss && state.speed > eff ? "speed capped at 2x while guiding" : "");
      q(".tb-stop").style.display = sk.active ? "" : "none";
      for (const k in ovBtns) ovBtns[k].classList.toggle("on", !!ui.overlays[k]);
    },
  };
}
