// The end card (UI only): when the last villager is gone (the chronicle's END entry), a centred sheet over the map with the date, generations and total slimes, and three ways on:
// Saves (the save browser), New village (the Menu's new-game action, random seed) and Log. The sim is paused once per world; loading a save or starting a village replaces the sim, which dismisses it.
import { svg } from "./icons.js";
import { newGame, randomSeed } from "./saves.js";
import { yearDay } from "../sim/chronicle.js";

export function createEndCard(root, game) {
  let seen = null, last = "";
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-end]"); if (!b) return;
    const a = b.dataset.end;
    if (a === "saves") game.openSaves();
    else if (a === "log") game.openBook("story");
    else if (a === "new") newGame(game, randomSeed());
  });
  return { update() {
    const sim = game.sim, dead = !sim.ents.ofKind("villager").length && sim.chron.f.end;
    if (dead && seen !== sim) { seen = sim; game.state.paused = true; }          // once per world: the player may resume afterwards
    const on = !!dead;
    root.style.display = on ? "flex" : "none";
    if (!on) { last = ""; return; }
    const e = sim.chron.entries.slice().reverse().find(x => x.kind === "END"), d = (e && e.data) || {};
    const h = `<div class="card helpcard endcard" data-test="end-card"><h2 data-test="end-title">The last slime has passed away</h2>
      <div class="dim" data-test="end-nums">${yearDay(sim)} · ${d.gens || 1} ${(d.gens || 1) === 1 ? "generation" : "generations"} · ${d.born || 0} ${d.born === 1 ? "slime" : "slimes"}</div>
      <div class="endbtn"><button class="btn" data-end="saves" data-test="end-saves">${svg("load", 14)}Saves</button><button class="btn" data-end="new" data-test="end-new">New village</button><button class="btn" data-end="log" data-test="end-log">${svg("book", 14)}Log</button></div></div>`;
    if (h !== last) { last = h; root.innerHTML = h; }
  } };
}
