import { svg } from "./icons.js";
// Tiny DOM helpers shared by the panels. Panels render to HTML strings and only
// touch the DOM when the string changed, so a hover or click is never lost to a
// re-render of identical content.

export const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** A horizontal meter. marks: [{at:0..1, cls}] ticks drawn over it (soft / critical thresholds, targets). */
export function bar(frac, { color = "#7fd1a0", marks = [], text = "", title = "" } = {}) {
  const f = Math.max(0, Math.min(1, frac));
  const m = marks.map(k => `<b class="mk ${k.cls || ""}" style="left:${(Math.max(0, Math.min(1, k.at)) * 100).toFixed(1)}%"></b>`).join("");
  return `<div class="bar" title="${esc(title)}"><i style="width:${(f * 100).toFixed(1)}%;background:${color}"></i>${m}<span>${esc(text)}</span></div>`;
}

/** Green above soft, amber between soft and critical, red below critical. */
export function needColor(v, soft, crit) { return v > soft ? "#6fbf73" : v > crit ? "#e0a93b" : "#e5594f"; }

const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
export function remember(key, val) { try { if (store) { if (val === undefined) return store.getItem("slimeciv." + key); store.setItem("slimeciv." + key, val); } } catch (e) { /* private window: just forget */ } return null; }

/**
 * A collapsible panel in the one chrome (kit: `.pn` = header with icon, title, pill, chevron; body). Collapsed state is remembered per id.
 * `data-test="<id>"` is the stable hook for tests; `flat` drops the header (the panel becomes a plain card).
 */
export function createPanel(parent, id, title, { open = true, icon = "", flat = false } = {}) {
  const sec = document.createElement("section");
  sec.className = "pn" + (flat ? " flat" : ""); sec.dataset.test = id;
  sec.innerHTML = `<header><span class="pi">${icon ? svg(icon, 16) : ""}</span><span class="ptitle"></span><span class="phint"></span><span class="chev">${svg("chev-d", 14)}</span></header><div class="pbody"></div>`;
  parent.appendChild(sec);
  const saved = remember("panel." + id);
  const p = { root: sec, body: sec.querySelector(".pbody"), head: sec.querySelector("header"), open: flat ? true : saved === null ? open : saved === "1" };
  const t = sec.querySelector(".ptitle"), h = sec.querySelector(".phint");
  const apply = () => { sec.classList.toggle("closed", !p.open); };
  p.head.addEventListener("click", () => { p.open = !p.open; remember("panel." + id, p.open ? "1" : "0"); apply(); });
  p.setOpen = (on) => { p.open = on; remember("panel." + id, on ? "1" : "0"); apply(); };
  apply();
  t.textContent = title;
  p.setTitle = (s) => { if (t.textContent !== s) t.textContent = s; };
  p.setHint = (s) => { if (h.textContent !== s) h.textContent = s; };
  p.show = (on) => { sec.style.display = on ? "" : "none"; };
  let last = "";
  p.html = (s) => { if (s !== last) { last = s; p.body.innerHTML = s; } };
  return p;
}
