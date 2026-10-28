// The Book (UI_SPEC §3.7, step a7): one sheet that merges the Almanac, the Chronicle, the villager roster and the Keys reference.
// Tabs: Story (the chronicle, an icon per event), Know (the almanac), People (an avatar per villager, the graves), Keys (the controls table).
// Cut (reported): the separate World tab is part of Know ("This world" stays in the almanac page). Key K opens it; H opens it on Keys; Esc closes it.
import { createChroniclePanel } from "./chronicle.js";
import { createAlmanacPanel } from "./almanac.js";
import { createHelp } from "./help.js";
import { svg } from "./icons.js";
import { avatar, tipAttr, sr } from "./kit.js";
import { esc } from "./dom.js";
import { isAdult, isElder, maxHp, fitness, ageDays } from "../sim/villager.js";

const TABS = [["story", "Story", "book"], ["know", "Know", "knowledge"], ["people", "People", "people"], ["keys", "Keys", "help"]];

export function createBook(root, game) {
  const { ui } = game;
  root.innerHTML = `<div class="card" data-test="book-card"><button class="btn ico xbtn" data-test="book-close"${tipAttr("Close", "Esc")} aria-label="Close">${svg("close", 16)}</button><div class="book-tabs" data-test="book-tabs">`
    + TABS.map(([k, l, ic]) => `<button data-test="book-tab" data-tab="${k}">${svg(ic, 16)}${l}</button>`).join("")
    + `</div>` + TABS.map(([k]) => `<div class="book-page" data-test="book-${k}" data-page="${k}"></div>`).join("") + `</div>`;
  const page = (k) => root.querySelector(`[data-page="${k}"]`);
  const chron = createChroniclePanel(page("story"), game, { flat: true });
  const alm = createAlmanacPanel(page("know"), game, { flat: true });
  const keysInner = document.createElement("div"); page("keys").appendChild(keysInner);
  const help = createHelp(keysInner, game);
  const peopleEl = document.createElement("div"); peopleEl.className = "people"; page("people").appendChild(peopleEl);
  ui.book = null;
  game.openBook = (tab = "story") => { ui.book = tab; ui.help = tab === "keys"; };
  game.closeBook = () => { ui.book = null; ui.help = false; };
  game.openAlmanac = () => game.openBook("know");
  root.addEventListener("click", (e) => {
    if (e.target === root || e.target.closest(".xbtn") || e.target.closest(".hclose")) { game.closeBook(); return; }
    const t = e.target.closest("[data-tab]"); if (t) { ui.book = t.dataset.tab; ui.help = ui.book === "keys"; return; }
    const v = e.target.closest("[data-vid]"); if (v) { const id = Number(v.dataset.vid); if (game.sim.ents.get(id)) { game.selectOnly(id, true); game.closeBook(); } }
  });
  let lastPeople = "";
  return {
    update() {
      if (ui.help && ui.book !== "keys") ui.book = "keys";          // H / the Help action opens the Book on Keys
      if (!ui.help && ui.book === "keys") ui.book = null;
      const on = !!ui.book;
      root.style.display = on ? "flex" : "none";
      if (!on) return;
      root.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === ui.book));
      root.querySelectorAll(".book-page").forEach(p => p.classList.toggle("on", p.dataset.page === ui.book));
      if (ui.book === "story") chron.update(); else if (ui.book === "know") alm.update(); else if (ui.book === "keys") help.update();
      else if (ui.book === "people") {
        const { sim } = game;
        let h = "";
        for (const v of sim.ents.ofKind("villager")) {
          const hurt = v.hp < 0.5 * maxHp(v, fitness(v, ageDays(sim, v)));
          h += `<button class="nt ${ui.sel.includes(v.id) ? "on" : ""}" data-vid="${v.id}" data-test="people-card"${tipAttr(v.name + (v.ti && v.ti.length ? "\n" + v.ti.join("; ") : ""))}>${avatar(v.hue, v.lin, 26, !isAdult(sim, v))}<span class="nn">${esc(v.name)}</span>`
            + (v.ti && v.ti.length ? `<span class="ti">${svg("star", 12)}</span>` : "") + (isElder(sim, v) ? svg("spoilage", 13) : "") + (hurt ? svg("hurt", 13) : "") + (v.ill ? svg("sick", 13) : "") + `</button>`;
        }
        for (const g of sim.ents.ofKind("grave")) h += `<span class="nt" data-test="grave"${tipAttr(g.name + "\nDied of " + g.cause)}>${svg("grave", 20)}<span class="nn">${esc(g.name)}</span></span>`;
        if (h !== lastPeople) { lastPeople = h; peopleEl.innerHTML = h; }
      }
    },
    chron, alm, help,
  };
}
