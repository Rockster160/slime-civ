// Onboarding by showing (UI_SPEC §6, 6.19b): no help wall, no modal. A small state machine watches the game for capability moments and plays ONE hint at a time:
// a pulse ring round the thing to use, a ghost hand that moves (and clicks or drags) to it, and a 1-3 word caption. A hint finishes the moment the player does the thing,
// is shown at most twice, yields to anything urgent and to guiding a slime, never comes more than once per 20 s (the first at 4 s), and is off with Settings > Show tips
// and in tests that load fixtures (`?tools=all`). `calm` makes the ring static. Seen counts are remembered in browser storage.
import { remember } from "./dom.js";
import { D } from "../sim/world.js";

const FIRST_MS = 4000, GAP_MS = 20000, MAX_SHOWN = 2;

export function createGuide(game, root) {
  const { ui } = game, params = new URLSearchParams(location.search);
  const G = game.guide = { on: remember("tips") !== "0" && ui.progression && params.get("tips") !== "0" || params.get("tips") === "1", cur: null, t0: performance.now(), last: 0, shown: {}, done: {}, log: [] };
  try { G.shown = JSON.parse(remember("tips.seen") || "{}"); } catch (e) { G.shown = {}; }
  game.setTips = (on) => { G.on = !!on; remember("tips", on ? "1" : "0"); if (!on) stop(); };
  game.resetTips = () => { G.shown = {}; G.done = {}; G.last = 0; G.t0 = performance.now(); stop(); remember("tips.seen", "{}"); };
  root.dataset.test = "guide";
  root.style.cssText += "inset:0;z-index:7;";
  const ring = document.createElement("div"), hand = document.createElement("div"), cap = document.createElement("div");
  ring.className = "gd-ring"; hand.className = "gd-hand"; cap.className = "gd-cap";
  ring.dataset.test = "guide-ring"; cap.dataset.test = "guide-caption"; hand.dataset.test = "guide-hand";
  hand.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24"><path d="M9 11V5a1.5 1.5 0 0 1 3 0v5l4 1.2a2 2 0 0 1 1.4 2.3L16.5 19a2 2 0 0 1-2 1.5H11a2 2 0 0 1-1.6-.8L6 14.5a1.5 1.5 0 0 1 2.2-2z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  root.append(ring, hand, cap); root.style.display = "none";

  document.addEventListener("mouseover", (e) => { if (e.target.closest && e.target.closest("[data-test=why-chain]")) ui.whyHover = 1; });
  const ent = (k) => game.sim.ents.ofKind(k);
  const dom = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) / 2 + 6 } : null; };
  const at = (e) => { const [x, y] = game.cam.toScreen(e.x + 0.5, e.y + 0.5, e.z); return { x, y: y - game.cam.zoom * 0.4, r: Math.max(18, game.cam.zoom * 0.9) }; };
  const clearSpot = (p) => p.x > 330 && p.x < game.cam.vw - 340 && p.y > 130 && p.y < game.cam.vh - 130;
  const HINTS = [
    { id: "select", at: 0, words: "Click a slime", act: "click", when: () => !ui.sel.length, done: () => ui.sel.length > 0, target: () => { const v = ent("villager").find(v => game.renderer.isShown(v) && clearSpot(at(v))); return v && at(v); } },
    { id: "why", at: 1, words: "See why they act", act: "point", when: () => ui.sel.length > 0 && !!document.querySelector("[data-test=why-chain]"), done: () => !!ui.whyHover, target: () => dom("[data-test=why-chain]") },
    { id: "order", at: 1, words: "Right-click to order", act: "rclick", when: () => ui.sel.length > 0, done: () => game.sim.ents.ofKind("villager").some(v => v.order), target: () => { const t = ent("plant").find(p => p.species === "tree" && game.renderer.isShown(p) && clearSpot(at(p))); return t && at(t); } },
    { id: "stock", at: 1, words: "Click to keep a stock", act: "click", when: () => !!document.querySelector("[data-test=stock-tile]"), done: () => Object.keys(game.sim.board.keeps || {}).length > 0, target: () => dom("[data-test=stock-tile]") },
    { id: "build", at: 1, words: "Drag to plan", act: "drag", when: () => game.unlocked && game.unlocked("build") && ui.mode === "select", done: () => game.sim.ents.ofKind("csite").length > 0, target: () => dom("[data-test=build-toggle]") },
    { id: "possess", at: 1, words: "Q: guide them", act: "click", when: () => ui.focus && ui.sel.length && performance.now() - G.t0 > 300000, done: () => !!game.possessed(), target: () => dom("[data-act=possess]") },
    { id: "book", at: 1, words: "Something was learned", act: "click", when: () => !!game.sim.disc && Object.keys(game.sim.disc.known || {}).length > 0, done: () => !!ui.book, target: () => dom("[data-test=book]") },
  ];
  function stop() { G.cur = null; root.style.display = "none"; ring.style.display = hand.style.display = cap.style.display = "none"; }
  function start(h, now) {
    G.cur = h; G.last = now; G.shown[h.id] = (G.shown[h.id] || 0) + 1; G.cur.t = now; remember("tips.seen", JSON.stringify(G.shown)); G.log.push(h.id);
    root.style.display = ""; ring.style.display = hand.style.display = cap.style.display = "";
    cap.textContent = h.words; root.dataset.hint = h.id; root.className = "act-" + h.act;
  }
  return {
    update() {
      const now = performance.now();
      if (!G.on || game.possessed()) { if (G.cur) stop(); return; }
      const urgent = (ui.concerns || []).some(c => c.sev >= 3);
      if (G.cur) {
        const h = G.cur;
        if (h.done()) { G.done[h.id] = 1; stop(); return; }
        if (urgent || now - h.t > 25000) { stop(); return; }
        const p = h.target();
        if (!p) { stop(); return; }
        ring.style.left = p.x + "px"; ring.style.top = p.y + "px"; ring.style.width = ring.style.height = p.r * 2 + "px";
        hand.style.left = p.x + "px"; hand.style.top = p.y + "px"; cap.style.left = p.x + "px"; cap.style.top = (p.y + p.r + 10) + "px";
        return;
      }
      if (urgent || now - G.t0 < FIRST_MS || (G.last && now - G.last < GAP_MS)) return;
      for (const h of HINTS) {
        if (G.done[h.id] || (G.shown[h.id] || 0) >= MAX_SHOWN || !h.when() || !h.target()) continue;
        start(h, now); return;
      }
    },
  };
}
