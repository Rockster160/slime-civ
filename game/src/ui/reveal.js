// Command scale as progression (GDD §06, PROPOSED): tools appear when the civilization can use them, not when the player has ground for them.
//   standing orders  - after the first stockpile (items in the yard)
//   blueprints       - after the first built room
//   crews            - at CREW_AT villagers, or after the first expedition
// A UI reveal only: the sim accepts every command at any time. A toast announces each new tool. "Show all tools" (Game menu, remembered)
// shows everything from the start for experienced players; the URL parameter ?tools=all does the same (tests load fixtures that way).
import { survey } from "../sim/items.js";

export const CREW_AT = 9;
export const TOOLS = {
  standing: { label: "Standing orders", msg: "New command: standing orders. Click a stock bar in the Village panel to keep that much of it stocked.", when: (sim) => Object.values(survey(sim).stock).some(n => n > 0) },
  blueprints: { label: "Blueprints", msg: "New command: blueprints. In build mode, Capture a finished room to save it, then stamp copies of it.", when: (sim) => sim.rooms.list.size > 0 || sim.bps.list.length > 0 },
  crews: { label: "Crews", msg: "New command: crews. Name the selected villagers in the Crews panel and give them a default task.", when: (sim) => sim.ents.ofKind("villager").length >= CREW_AT || sim.exp.n > 0 || sim.crews.list.length > 0 },
};

export function createReveal(game) {
  const { ui } = game;
  ui.unlock = {}; ui.revealInit = false;
  game.unlocked = (k) => !ui.progression || ui.showAll || !!ui.unlock[k];
  return {
    update() {
      for (const k in TOOLS) {
        if (ui.unlock[k]) continue;
        if (!TOOLS[k].when(game.sim)) continue;
        ui.unlock[k] = true;
        if (ui.revealInit && ui.progression && !ui.showAll) game.toast(TOOLS[k].msg, 6000);
      }
      ui.revealInit = true;                                          // what was already true when the page opened is not news
      document.body.classList.toggle("no-crews", !game.unlocked("crews"));
    },
    reset() { ui.unlock = {}; ui.revealInit = false; },
  };
}
