// Notables strip: one coloured blob per villager with alert badges
// (H hungry, W thirsty, C cold, Z exhausted, + hurt, ! stuck, > ordered).
// Click to select. Up to COLLAPSE villagers all fit; beyond that the strip collapses to the ones with alerts (and the selected),
// with a "Show all" toggle that makes it a scrolling list, and a filter by crew (S11: it has to work at 20-60 villagers).
import { alerts } from "./text.js";
import { esc } from "./dom.js";

export const COLLAPSE = 22;

export function createNotables(root, game) {
  const st = game.ui.strip = { crew: 0, all: false };         // crew: 0 = everyone, -1 = alerts only, else a crew id
  root.addEventListener("click", (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { const v = f.dataset.filter; if (v === "all") st.all = !st.all; else st.crew = Number(v); return; }
    const b = e.target.closest("[data-id]"); if (!b) return;
    const id = Number(b.dataset.id);
    if (e.shiftKey) game.toggleSelect(id); else game.selectOnly(id, true);
  });
  let last = "";
  return {
    update() {
      const { sim, ui } = game, vs = sim.ents.ofKind("villager"), crews = sim.crews.list;
      if (st.crew > 0 && !crews.some(c => c.id === st.crew)) st.crew = 0;
      let rows = vs.map(v => ({ v, al: alerts(sim, v) }));
      const big = rows.length > COLLAPSE;
      let h = "";
      if (crews.length && game.unlocked("crews")) {
        h += `<span class="ntf"><button data-filter="0" class="${st.crew === 0 ? "on" : ""}" title="Everyone">All ${vs.length}</button>`;
        for (const c of crews) h += `<button data-filter="${c.id}" class="${st.crew === c.id ? "on" : ""}" title="Only the members of ${esc(c.name)}">${esc(c.name)} ${c.ids.length}</button>`;
        h += `<button data-filter="-1" class="${st.crew === -1 ? "on" : ""}" title="Only villagers with an alert">Alerts</button></span>`;
      }
      if (st.crew > 0) { const c = crews.find(q => q.id === st.crew); rows = rows.filter(r => c.ids.includes(r.v.id)); }
      else if (st.crew === -1) rows = rows.filter(r => r.al.some(a => a.k !== "ordered") || ui.sel.includes(r.v.id));
      const all = rows.length;
      let shown = rows;
      const collapsed = big && st.crew === 0 && !st.all;
      if (collapsed) shown = rows.filter(r => r.al.some(a => a.k !== "ordered") || ui.sel.includes(r.v.id)).slice(0, COLLAPSE);
      if (big && st.crew === 0) h += `<button data-filter="all" class="ntf-all ${st.all ? "on" : ""}" title="${st.all ? "Collapse to the villagers with alerts" : "Show every villager (the strip scrolls)"}">${st.all ? "Collapse" : "Show all " + vs.length}</button>`;
      for (const { v, al } of shown) {
        const kid = (sim.tick - v.born) / 1800 < 80;
        h += `<button data-id="${v.id}" class="nt ${ui.sel.includes(v.id) ? "on" : ""}" title="${esc(v.name + (v.ti && v.ti.length ? " (" + v.ti.join("; ") + ")" : "") + (al.length ? ": " + al.map(a => a.title).join(", ") : ""))}">`
          + `<i class="blob ${kid ? "kid" : ""}" style="background:hsl(${v.hue},75%,62%)"></i><span class="nn">${esc(v.name)}</span>`
          + (v.ti && v.ti.length ? `<span class="tt" title="${esc(v.name + " is known as: " + v.ti.join("; "))}">\u2605 ${esc(v.ti[0])}</span>` : "")
          + (al.length ? `<span class="al">${al.map(a => `<u style="background:${a.color}" title="${esc(a.title)}">${a.ch}</u>`).join("")}</span>` : "") + `</button>`;
      }
      if (collapsed && !shown.length) h += `<span class="more">no alerts among ${vs.length} villagers</span>`;
      else if (all > shown.length) h += `<span class="more">+${all - shown.length} more</span>`;
      root.classList.toggle("scroll", big && (st.all || st.crew !== 0));
      if (h !== last) { last = h; root.innerHTML = h; }
    },
  };
}
