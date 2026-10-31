// The save browser (8.27): every slot in one sheet (Menu > Saves), listed from the manifests alone: a mini map of the explored chunks, the in-game date, villagers, size and
// when it was written, with Load, Export and Delete. No save is opened to draw it. Delete asks twice (the button turns to "Sure?").
import { esc } from "./dom.js";
import { svg } from "./icons.js";
import { chunkKX, chunkKY } from "../sim/cellkey.js";
import { browserSlots, deleteSlot, exportSlot, openFromBrowser, fmtBytes } from "./saves.js";

const PW = 76, PH = 46;
/** The explored area as a tiny map: one square per chunk the save has a record for, scaled to fit. */
export function previewSvg(keys) {
  if (!keys.length) return `<svg width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}"><rect width="${PW}" height="${PH}" fill="#1b222b"/></svg>`;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const pts = keys.map(k => [chunkKX(k), chunkKY(k)]);
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, u = Math.max(1, Math.min((PW - 6) / w, (PH - 6) / h)), ox = (PW - w * u) / 2, oy = (PH - h * u) / 2;
  const cells = pts.map(([x, y]) => `<rect x="${(ox + (x - x0) * u).toFixed(1)}" y="${(oy + (y - y0) * u).toFixed(1)}" width="${u.toFixed(1)}" height="${u.toFixed(1)}"/>`).join("");
  return `<svg width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}"><rect width="${PW}" height="${PH}" fill="#1b222b"/><g fill="#7fd1a0" opacity=".85" shape-rendering="crispEdges">${cells}</g></svg>`;
}
/** "now", "5 min", "3 h", "2 d", or a date. */
export function ago(at, now = Date.now()) {
  if (!at) return "";
  const s = Math.max(0, (now - at) / 1000);
  return s < 60 ? "now" : s < 3600 ? Math.round(s / 60) + " min" : s < 86400 ? Math.round(s / 3600) + " h" : s < 86400 * 14 ? Math.round(s / 86400) + " d" : new Date(at).toISOString().slice(0, 10);
}

export function createSaveBrowser(root, game) {
  const { ui } = game;
  let last = "", arm = "", armT = 0;
  const render = () => {
    const rows = browserSlots();
    const body = rows.length ? rows.map(s => `<div class="srow" data-test="save-row" data-slot="${esc(s.slot)}">
        <span class="sprev" data-test="save-preview">${previewSvg(s.chunks)}</span>
        <span class="smain"><span><b>${esc(s.name)}</b><span class="dim"> ${s.iron ? "Ironman · " : ""}${s.year ? "Y" + s.year + " " : ""}D${s.day === undefined ? "?" : s.day}</span></span>
          <span class="dim smeta"><span data-tip="Villagers">${svg("people", 13)} ${s.pop === undefined ? "?" : s.pop}</span> <span>${esc(fmtBytes(s.bytes))}</span> <span>${esc(ago(s.at))}</span>${s.prev ? ` <span data-tip="An older copy is kept in case this one is damaged">Backup</span>` : ""}</span></span>
        <span class="sbtn"><button class="btn" data-sact="load" data-test="save-load" ${game.sim.ironman && s.slot !== "iron" ? "disabled" : ""}>${svg("load", 14)}Load</button><button class="btn" data-sact="export" data-test="save-export">${svg("save", 14)}Export</button><button class="btn ${arm === s.slot ? "warn" : ""}" data-sact="del" data-test="save-delete">${arm === s.slot ? "Sure?" : svg("close", 14) + "Delete"}</button></span>
      </div>`).join("") : `<div class="dim sempty" data-test="saves-empty">None</div>`;
    const h = `<div class="card helpcard savecard" data-test="saves"><div class="sheet-head"><h2>Saves</h2><button class="btn ico xbtn sclose2" data-test="saves-close" data-tip="Close" aria-label="Close">${svg("close", 16)}</button></div>${body}</div>`;
    if (h !== last) { last = h; root.innerHTML = h; }
  };
  game.openSaves = () => { ui.saves = true; arm = ""; };
  root.addEventListener("click", async (e) => {
    if (e.target === root || e.target.closest(".sclose2")) { ui.saves = false; return; }
    const b = e.target.closest("[data-sact]"), row = e.target.closest("[data-slot]");
    if (!b || !row) return;
    const slot = row.dataset.slot, a = b.dataset.sact;
    if (a === "load") { ui.saves = false; await openFromBrowser(game, slot); }
    else if (a === "export") await exportSlot(game, slot);
    else if (a === "del") {
      if (arm !== slot) { arm = slot; armT = performance.now(); return; }
      arm = ""; await deleteSlot(game, slot); last = "";
    }
  });
  return { update() {
    const on = !!ui.saves;
    root.style.display = on ? "flex" : "none";
    if (!on) { arm = ""; return; }
    if (arm && performance.now() - armT > 4000) arm = "";
    render();
  } };
}
