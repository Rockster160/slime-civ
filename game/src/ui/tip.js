// One tooltip for the whole interface (UI_SPEC §2.4). Anything with `data-tip="First line\nmore lines"` gets it after a short delay, on hover and on keyboard focus.
// A native `title=` is promoted to data-tip the first time the pointer meets it (so the ~100 old call sites keep working and look the same). `data-key="B"` adds a keycap.
// Words live here, not on the resting HUD. The element keeps `aria-label` so screen readers still get them.
const DELAY = 250;

export function installTip(doc = document) {
  const el = doc.createElement("div");
  el.id = "htip"; el.setAttribute("role", "tooltip"); el.style.display = "none";
  doc.body.appendChild(el);
  let timer = 0, cur = null;
  const promote = (t) => {
    const n = t.closest("[data-tip],[title]");
    if (n && !n.dataset.tip && n.getAttribute("title")) { n.dataset.tip = n.getAttribute("title"); if (!n.getAttribute("aria-label") && !n.textContent.trim()) n.setAttribute("aria-label", n.dataset.tip.split("\n")[0]); n.removeAttribute("title"); }
    return n && n.dataset.tip ? n : null;
  };
  const hide = () => { clearTimeout(timer); cur = null; el.style.display = "none"; };
  const show = (n) => {
    const lines = n.dataset.tip.split("\n"), key = n.dataset.key;
    el.innerHTML = `<b>${lines[0].replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</b>` + (key ? `<kbd>${key}</kbd>` : "") + lines.slice(1).map(l => `<div>${l.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</div>`).join("");
    el.style.display = "block";
    const r = n.getBoundingClientRect(), zoom = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue("--ui")) || 1;
    const w = el.offsetWidth, h = el.offsetHeight, vw = innerWidth, vh = innerHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.bottom + 8;
    if (y + h > vh - 4) y = r.top - h - 8;
    el.style.left = Math.max(4, Math.min(vw - w - 4, x)) + "px"; el.style.top = Math.max(4, y) + "px";
    void zoom;
  };
  doc.addEventListener("mouseover", (e) => { const n = promote(e.target); if (n === cur) return; hide(); if (n) { cur = n; timer = setTimeout(() => cur === n && show(n), DELAY); } });
  doc.addEventListener("mouseout", (e) => { if (cur && !cur.contains(e.relatedTarget)) hide(); });
  doc.addEventListener("focusin", (e) => { const n = promote(e.target); if (n) { cur = n; show(n); } });
  doc.addEventListener("focusout", hide);
  doc.addEventListener("mousedown", hide);
  return { hide, el };
}
