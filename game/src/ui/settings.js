// The Settings panel (S12): every key and what it does (click Change, press a key), and the accessibility switches. Opened from the top bar or the Game
// menu. Key changes live in the browser, not in the save; the help overlay reads the same table (ui/keys.js).
import { esc } from "./dom.js";
import { ACTIONS, keyName, keyId } from "./keys.js";
import { SCALES } from "./access.js";

const GROUPS = [["global", "Everywhere"], ["map", "On the map"], ["pan", "Camera, and walking while you guide a villager"], ["guide", "While guiding a villager (Q)"]];

export function createSettings(root, game) {
  const { ui } = game, km = game.keymap;
  let capture = "", msg = "", last = "";
  game.openSettings = () => { ui.settings = true; };
  const render = () => {
    const a = game.access;
    let h = `<div class="setcard"><button class="sclose">Close</button><h2>Settings</h2><h3>Controls</h3>
      <div class="dim2">Click Change, then press the key. Esc, the number row (speed) and Ctrl/Alt+number (crews) are fixed. Changes are kept in this browser, not in your save.</div>
      <table>`;
    for (const [ctx, title] of GROUPS) {
      h += `<tr class="hd"><td colspan="4">${esc(title)}</td></tr>`;
      for (const act of ACTIONS.filter(q => q.ctx === ctx)) {
        const cap = capture === act.id;
        h += `<tr class="${cap ? "cap" : ""}" data-act="${act.id}"><td class="act">${esc(act.label)}</td><td>${cap ? "<b>press a key...</b>" : km.keysOf(act.id).map(k => `<kbd>${esc(keyName(k))}</kbd>`).join(" ") || '<span class="dim">no key</span>'}</td>
          <td><button class="chg" data-chg="${act.id}">${cap ? "Cancel" : "Change"}</button> ${km.isCustom(act.id) ? `<button data-reset="${act.id}" title="Back to the default">Reset</button>` : ""}</td><td class="note">${esc(act.note || "")}</td></tr>`;
      }
    }
    h += `</table><div class="btnrow"><button data-resetall="1">Reset every key</button></div><div class="msg">${esc(msg)}</div>
      <h3>Accessibility</h3><div class="acc">
      <span>Interface size</span><span><select class="a-scale">${SCALES.map(s => `<option value="${s}" ${a.scale === s ? "selected" : ""}>${Math.round(s * 100)}%</option>`).join("")}</select> <span class="why">panels, bars and text; the map keeps its own zoom</span></span>
      <span>High contrast</span><label><input type="checkbox" class="a-hc" ${a.contrast ? "checked" : ""}> white on black, heavier outlines</label>
      <span>Colour-blind marks</span><label><input type="checkbox" class="a-cb" ${a.cb ? "checked" : ""}> letters and patterns beside colour: lineage (A B C) in each villager, ore (F flint, M malachite, c clay, I iron, K coal), biomes (^ highland, ~ marsh)</label>
      <span>Reduced flashing</span><label><input type="checkbox" class="a-calm" ${a.calm ? "checked" : ""}> no hit rings, steady flames, no flickering cracks</label></div></div>`;
    if (h !== last) { last = h; root.innerHTML = h; }
  };
  root.addEventListener("click", (e) => {
    if (e.target === root || e.target.closest(".sclose")) { capture = ""; ui.capturing = false; ui.settings = false; return; }
    const c = e.target.closest("[data-chg]"), r = e.target.closest("[data-reset]");
    if (c) { capture = capture === c.dataset.chg ? "" : c.dataset.chg; ui.capturing = !!capture; msg = capture ? "" : msg; render(); }
    else if (r) { km.reset(r.dataset.reset); msg = ""; render(); }
    else if (e.target.closest("[data-resetall]")) { km.reset(); msg = "Every key is back to its default."; render(); }
  });
  root.addEventListener("change", (e) => {
    if (e.target.matches(".a-scale")) game.setAccess({ scale: Number(e.target.value) });
    else if (e.target.matches(".a-hc")) game.setAccess({ contrast: e.target.checked });
    else if (e.target.matches(".a-cb")) game.setAccess({ cb: e.target.checked });
    else if (e.target.matches(".a-calm")) game.setAccess({ calm: e.target.checked });
  });
  // while a row is waiting for a key: the next key press binds (Esc cancels); it must not also act as a command
  window.addEventListener("keydown", (e) => {
    if (!capture) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
    if (e.key === "Escape") { capture = ""; ui.capturing = false; msg = "Cancelled."; render(); return; }
    const why = km.set(capture, keyId(e));
    msg = why || "Bound to " + keyName(keyId(e)) + ".";
    if (!why) { capture = ""; ui.capturing = false; }
    render();
  }, true);
  km.onChange(() => { last = ""; });
  return { update() { const on = !!ui.settings; root.style.display = on ? "flex" : "none"; if (on) render(); else if (capture) { capture = ""; ui.capturing = false; } } };
}
