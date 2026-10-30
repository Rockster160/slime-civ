// The harvest-or-leave choice (7.23). When a labyrinth's guardian falls the core lies bare, and the game waits on the player: a small card with two buttons, Harvest and Leave. It is never
// answered for them. The card shows while `sim.cm.pend` lists a core (in the map view and in first person), and all it does is send {type:"core", op:"harvest"|"leave", key}.
import { pending, HARVEST_SHARDS } from "../sim/cm.js";
import { esc } from "./dom.js";
import { svg } from "./icons.js";
import { tipAttr } from "./kit.js";

export function createCoreChoice(root, game) {
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-core]"); if (!t) return;
    const [op, key] = t.dataset.core.split("|");
    const ok = game.sim.apply({ type: "core", op, key });
    if (ok) game.toast(op === "harvest" ? "The core is harvested: " + HARVEST_SHARDS + " core shards go to the stockpile, and its field begins to fade." : "You leave the core as it is.");
    else game.toast("Nothing to decide there.");
  });
  let last = "";
  return {
    update() {
      const list = pending(game.sim);
      const html = list.map(c => `<div class="cc-card" data-test="core-choice-card"><div class="cc-head">${svg("star", 18)}<b>The guardian is down</b></div>`
        + `<p>The core of ${esc(c.name)} lies bare. Take it, or let it be?</p>`
        + `<div class="cc-btns"><button class="btn big" data-core="harvest|${c.key}" data-test="core-harvest"${tipAttr("Harvest\nA large one-time haul of core shards (" + HARVEST_SHARDS + ") to the stockpile. The core is gone for good, and it spawns no more monsters (ore and treasure stay where they are).")}>${svg("gather", 16)}<span>Harvest</span></button>`
        + `<button class="btn big" data-core="leave|${c.key}" data-test="core-leave"${tipAttr("Leave\nThe core stays as it is: rich caches, ores and monsters to match.")}>${svg("home", 16)}<span>Leave</span></button></div>`
        + `<p class="cc-sub"><b>Harvest</b>: shards now, a poorer and safer land. <b>Leave</b>: it stays rich and dangerous.</p></div>`).join("");
      if (html !== last) { last = html; root.innerHTML = html; root.style.display = html ? "block" : "none"; }
    },
  };
}
