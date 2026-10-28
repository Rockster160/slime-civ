// Notables strip: one coloured blob per villager with alert badges
// (H hungry, W thirsty, C cold, Z exhausted, + hurt, ! stuck, > ordered).
// Click to select. Up to COLLAPSE villagers all fit; beyond that the strip collapses to the ones with alerts (and the selected),
// with a "Show all" toggle that makes it a scrolling list, and a filter by crew (S11: it has to work at 20-60 villagers).
import { DAY } from "../sim/clock.js";
import { LIFE_DAYS } from "../sim/villager.js";
import { alerts } from "./text.js";
import { esc } from "./dom.js";
import { svg } from "./icons.js";
import { avatar, tipAttr, sr } from "./kit.js";
import { depthBadge } from "../render/obmath.js";

const ALERT_ICON = { hungry: "food", thirsty: "water", cold: "cold", tired: "energy", sick: "sick", hurt: "hurt", stuck: "blocked", ordered: "move" };

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
        h += `<span class="ntf"><button data-filter="0" class="${st.crew === 0 ? "on" : ""}" title="Everyone">${svg("people", 13)}${vs.length}</button>`;
        for (const c of crews) h += `<button data-filter="${c.id}" class="${st.crew === c.id ? "on" : ""}" title="Only the members of ${esc(c.name)}">${esc(c.name)} ${c.ids.length}</button>`;
        h += `<button data-filter="-1" class="${st.crew === -1 ? "on" : ""}" title="Only villagers with an alert">${svg("warn", 13)}</button></span>`;
      }
      if (st.crew > 0) { const c = crews.find(q => q.id === st.crew); rows = rows.filter(r => c.ids.includes(r.v.id)); }
      else if (st.crew === -1) rows = rows.filter(r => r.al.some(a => a.k !== "ordered") || ui.sel.includes(r.v.id));
      const all = rows.length;
      let shown = rows;
      const collapsed = big && st.crew === 0 && !st.all;
      if (collapsed) shown = rows.filter(r => r.al.some(a => a.k !== "ordered") || ui.sel.includes(r.v.id)).slice(0, COLLAPSE);
      if (big && st.crew === 0) h += `<button data-filter="all" class="ntf-all ${st.all ? "on" : ""}" title="${st.all ? "Collapse to the villagers with alerts" : "Show every villager (the strip scrolls)"}">${st.all ? svg("chev-d", 13) : svg("people", 13) + vs.length}</button>`;
      for (const { v, al } of shown) {
        const kid = (sim.tick - v.born) / DAY < 0.2 * LIFE_DAYS;
        h += `<button data-id="${v.id}" data-test="strip-villager" class="nt ${ui.sel.includes(v.id) ? "on" : ""}"${tipAttr(v.name + (v.ti && v.ti.length ? " (" + v.ti.join("; ") + ")" : "") + (al.length ? "\n" + al.map(a => a.title).join("\n") : ""))}>`
          + avatar(v.hue, v.lin, 20, kid) + (ui.sel.includes(v.id) && ui.sel.length <= 4 ? `<span class="nn">${esc(v.name.split(" ")[0])}</span>` : sr(v.name))
          + (v.ti && v.ti.length ? `<span class="ti">${svg("star", 12)}</span>` : "")
          + (game.cam.oblique ? (() => { const b = depthBadge(game.renderer.z, v.z, game.renderer.topAt(v.x, v.y), game.D); return b ? `<span class="db" data-test="depth-badge" data-tip="${b[0] === "\u2193" ? "Below the level you are viewing" : "Above the level you are viewing"}">${b}</span>` : ""; })() : "")
          + (al.length ? `<span class="al">${al.slice(0, 2).map(a => svg(ALERT_ICON[a.k] || "warn", 13)).join("")}</span>` : "") + `</button>`;
      }
      if (collapsed && !shown.length) h += `<span class="more">${svg("check", 13)}<span class="sr">no alerts among ${vs.length} villagers</span></span>`;
      else if (all > shown.length) h += `<span class="more">+${all - shown.length}<span class="sr"> more</span></span>`;
      root.classList.toggle("scroll", big && (st.all || st.crew !== 0));
      if (h !== last) { last = h; root.innerHTML = h; }
    },
  };
}
