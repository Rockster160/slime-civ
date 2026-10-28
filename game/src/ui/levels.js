// Levels you can read at a glance (UI_SPEC §10, 6.19b): the depth gauge on the right edge of the map, the keys that step through levels, and the view following a slime
// that goes underground. The map renderer (render/oblique.js) draws the five states; this module owns the words and the controls.
//   gauge     a vertical strip: Surface, then every level from a few above the camp to the deepest in use. It ALWAYS says what you are looking at ("Surface", "Ground level",
//             "3 below ground", relative to the camp's standing level, never a raw z). A dot beside a level = slimes there (the number is how many), a notch = carved space.
//             Click a row to go there, the arrows (and `[` `]`, PageUp/PageDown) step, Home returns to the Surface; a small toggle shows or hides the faint outline of the level above.
//   follow    selecting or following a slime that is underground switches the view to its level, and back to the Surface when it comes up. It triggers when that slime's own
//             level changes (or it is newly selected), so a level you pick by hand is never fought.
import { World, D, M } from "../sim/world.js";
import { svg } from "./icons.js";
import { levelLabel, gaugeRows, gaugeWindow, viewLevelFor } from "../render/obmath.js";

export function createLevels(game, root) {
  const { ui } = game, R = () => game.renderer;
  const st = ui.levels = { dug: new Set(), dugV: -1, dugAt: 0, auto: { id: 0, want: -2 }, hold: 0 };
  root.dataset.test = "gauge";
  const camp = () => game.sim.stock ? game.sim.stock.z : game.sim.site.z + 1;           // the camp's standing level (the floor the stockpile lies on)

  /** The words for a level: "Surface", "Ground level", "3 below ground". */
  game.levelLabel = (n) => levelLabel(n === undefined ? R().z : n, camp(), D);
  game.setLevel = (n) => { R().setZ(n); st.hold = performance.now(); };
  /** One step through the levels: from the Surface, down goes to the camp's level; above the camp's high ground, up returns to the Surface. */
  game.stepLevel = (dir) => {
    const z = R().z, c = camp();
    if (z >= D - 1) { if (dir < 0) game.setLevel(c); return; }
    const n = z + dir;
    game.setLevel(n > c + 6 ? D - 1 : Math.max(1, n));
  };
  game.toggleAbove = () => { const r = R(); if ("ghostAbove" in r) r.ghostAbove = !r.ghostAbove; };

  root.innerHTML = `<div class="g-now" data-test="gauge-now"></div><div class="g-ctl"><button class="btn ico sm" data-g="up" data-test="gauge-up" aria-label="Up one level" data-tip="Up one level\nPageUp or ]">${svg("level-up", 14)}</button>`
    + `<button class="btn ico sm" data-g="down" data-test="gauge-down" aria-label="Down one level" data-tip="Down one level\nPageDown or [">${svg("level-down", 14)}</button></div><div class="g-rows" data-test="gauge-rows"></div>`
    + `<div class="g-ctl"><button class="btn ico sm tog on" data-g="above" data-test="gauge-above" aria-label="Outline of the level above" data-tip="Outline of the level above\nshown faintly while you look at a level underneath">${svg("layers", 14)}</button></div>`;
  const now = root.querySelector(".g-now"), rowsEl = root.querySelector(".g-rows"), above = root.querySelector("[data-g=above]");
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-g]"), r = e.target.closest("[data-n]");
    if (r) { game.setLevel(Number(r.dataset.n)); return; }
    if (!b) return;
    if (b.dataset.g === "up") game.stepLevel(1); else if (b.dataset.g === "down") game.stepLevel(-1);
    else if (b.dataset.g === "above") { game.toggleAbove(); above.classList.toggle("on", !!R().ghostAbove); }
  });
  let last = "";

  /** Carved space: levels where a changed cell is now open under rock (read incrementally from the world's change log, at most twice a second). */
  function dugLevels(sim) {
    const w = sim.world, t = performance.now();
    if (st.dugV !== w.version && t - st.dugAt > 500 && w.log) {
      st.dugV = w.version; st.dugAt = t; st.dug.clear();
      for (const i of w.log) { const [x, y, z] = World.xyz(i); if (z > 0 && z < D - 1 && w.mat(x, y, z) === M.AIR && w.isSolid(x, y, z + 1) && w.isSolid(x, y, z - 1)) st.dug.add(z); }
    }
    return st.dug;
  }

  /** The level a slime wants the view on: the Surface when it stands on its column's top, else the slice at its own level (inside a roofed hut that is a cutaway). */
  function wantFor(v) { return viewLevelFor(R().view.topZ(v.x, v.y, D - 1), v.z, D); }

  return {
    update() {
      const sim = game.sim, r = R();
      if (!r.view || !game.cam.oblique) { root.style.display = "none"; return; }
      root.style.display = game.possessed && game.possessed() ? "none" : "";
      const counts = new Map();
      for (const v of sim.ents.ofKind("villager")) counts.set(v.z, (counts.get(v.z) || 0) + 1);
      const rows = gaugeWindow(gaugeRows(r.z, camp(), D, counts, dugLevels(sim)), 9, camp());      // a fixed 9-row window: it scrolls round the current level, the gauge never changes height
      const lab = game.levelLabel();
      let h = "";
      for (const q of rows) {
        if (!q) { h += `<span class="g-row g-pad" aria-hidden="true"></span>`; continue; }
        h += `<button class="g-row${q.cur ? " cur" : ""}${q.surface ? " surf" : ""}${q.camp ? " camp" : ""}" data-n="${q.n}" data-test="gauge-row" data-label="${lab === q.label ? "" : ""}" data-tip="${q.label}${q.slimes ? "\n" + q.slimes + (q.slimes === 1 ? " slime" : " slimes") : ""}${q.dug ? "\ncarved space" : ""}">`
          + `<span class="g-l">${q.surface ? svg("day", 12) : ""}</span><span class="g-t"></span>${q.slimes ? `<span class="g-dot" data-test="gauge-dot">${q.slimes > 1 ? q.slimes : ""}</span>` : ""}${q.dug ? `<span class="g-dug"></span>` : ""}<span class="sr">${q.label}</span></button>`;
      }
      const sig = rows.map(q => !q ? "-" : q.n + ":" + (q.cur ? 1 : 0) + ":" + q.slimes + ":" + (q.dug ? 1 : 0)).join("|") + lab;
      if (sig !== last) { last = sig; rowsEl.innerHTML = h; now.textContent = lab; now.classList.toggle("surf", r.z >= D - 1); }
      above.style.visibility = r.z < D - 1 ? "" : "hidden";                  // (hidden, not removed: the gauge's size never changes)
      // placement is CSS only (#gauge in shell.html): a fixed bottom-right slot at the edge of the map area, a fixed height, never moved by a panel
    },
    /** Every frame: follow the focused slime between levels. */
    follow() {
      const r = R(); if (!game.cam.oblique || !r.view || ui.mode === "build" || (game.possessed && game.possessed())) return;
      const id = ui.follow || (ui.sel.length === 1 ? ui.sel[0] : 0), v = id ? game.sim.ents.get(id) : null;
      if (!v) { st.auto.id = 0; return; }
      const want = wantFor(v);
      if (st.auto.id !== id || st.auto.want !== want) { const first = st.auto.id !== id; st.auto.id = id; st.auto.want = want; if (r.z !== want && (!first || true)) { game.setLevel(want); if (want < D - 1) r.peek = { x: v.x, y: v.y, z: want, r: 7 }; } }
    },
  };
}
