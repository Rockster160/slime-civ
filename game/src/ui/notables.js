// Notables strip: one coloured blob per villager with alert badges
// (H hungry, W thirsty, C cold, Z exhausted, + hurt, ! stuck, > ordered).
// Click to select. Beyond MAX_SHOWN only villagers with alerts (and the selected) get a place.
import { alerts } from "./text.js";
import { esc } from "./dom.js";

const MAX_SHOWN = 22;

export function createNotables(root, game) {
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    const id = Number(b.dataset.id);
    if (e.shiftKey) game.toggleSelect(id); else game.selectOnly(id, true);
  });
  let last = "";
  return {
    update() {
      const { sim, ui } = game, vs = sim.ents.ofKind("villager");
      const rows = vs.map(v => ({ v, al: alerts(sim, v) }));
      let shown = rows;
      if (rows.length > MAX_SHOWN) shown = rows.filter(r => r.al.some(a => a.k !== "ordered") || ui.sel.includes(r.v.id)).slice(0, MAX_SHOWN);
      let h = "";
      for (const { v, al } of shown) {
        const kid = (sim.tick - v.born) / 1800 < 80;
        h += `<button data-id="${v.id}" class="nt ${ui.sel.includes(v.id) ? "on" : ""}" title="${esc(v.name + (al.length ? ": " + al.map(a => a.title).join(", ") : ""))}">`
          + `<i class="blob ${kid ? "kid" : ""}" style="background:hsl(${v.hue},75%,62%)"></i><span class="nn">${esc(v.name)}</span>`
          + (al.length ? `<span class="al">${al.map(a => `<u style="background:${a.color}" title="${esc(a.title)}">${a.ch}</u>`).join("")}</span>` : "") + `</button>`;
      }
      if (rows.length > shown.length) h += `<span class="more">+${rows.length - shown.length} more</span>`;
      if (h !== last) { last = h; root.innerHTML = h; }
    },
  };
}
