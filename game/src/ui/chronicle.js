// Chronicle panel, the "while you were away" digest, and death alerts.
//
// "Away" is measured in sim time the player did not watch: ticks that passed
// while the tab was unfocused or the game ran at 3x and above. We keep
// ui.attn = {tick, id}: the sim tick (and newest chronicle entry) at the last
// moment the player was watching at <= 2x. When they are back and a day or more
// has passed, the digest summarises up to 10 entries since then.
import { DAY, SEASON_NAMES } from "../sim/clock.js";
import { esc, createPanel } from "./dom.js";
import { svg, EVENT_ICON } from "./icons.js";
import { tipAttr } from "./kit.js";
import { chronicleMarkdown, chronicleFileName } from "./chronicletext.js";

const AWAY_TICKS = 1800;        // 90 s at 1x of the sim running while you were not looking (S18b: it was "one game day", which is 10 minutes now)
const DIGEST_MAX = 10;

const when = (e) => `Y${e.y} D${e.d} ${SEASON_NAMES[Math.floor((e.d - 1) / 25)].slice(0, 3)}`;

/** Up to n entries after id, the important ones first, returned in time order. */
export function digestEntries(chron, afterId, n = DIGEST_MAX) {
  const fresh = chron.entries.filter(e => e.id > afterId);
  const picked = fresh.slice().sort((a, b) => b.sev - a.sev || b.id - a.id).slice(0, n);
  return { total: fresh.length, entries: picked.sort((a, b) => a.id - b.id) };
}

export function createChroniclePanel(parent, game, opts = {}) {
  const p = createPanel(parent, "chron", "Chronicle", { icon: "book", flat: !!opts.flat });
  p.body.classList.add("chronbody");
  p.body.addEventListener("click", (e) => {
    if (e.target.closest("[data-dl]")) { game.downloadText(chronicleFileName(game.sim), chronicleMarkdown(game.sim), "text/markdown"); game.toast("Chronicle saved as a Markdown file."); return; }
    const r = e.target.closest("[data-a]"); if (!r) return;
    const id = Number(r.dataset.a);
    if (id && game.sim.ents.get(id)) game.selectOnly(id, true);
    else game.toast("They are no longer with the village.");
  });
  p.update = () => {
    const { sim, ui } = game, es = sim.chron.entries;
    const dl = `<div class="btnrow"><button class="btn ico" data-dl="1" data-test="chron-dl"${tipAttr("Download chronicle\nSave the whole history (eras, firsts, births and deaths, notable people, graves, heirlooms) as a readable Markdown file")} aria-label="Download chronicle">${svg("save", 16)}</button></div>`;
    if (!es.length) { p.html(dl + `<p class="dim">Nothing has happened yet. Events - births, deaths, first beds, crises - will be written here.</p>`); return; }
    p.setHint(es.length + (es.length === 1 ? " entry" : " entries"));
    let h = dl;
    for (let i = es.length - 1; i >= 0 && i >= es.length - 80; i--) {
      const e = es[i];
      h += `<div class="ce s${e.sev}" ${e.a.length ? `data-a="${e.a[0]}"` : ""}>${svg(EVENT_ICON[e.kind] || "star", 14)}<span class="when">${when(e)}</span> <span>${esc(e.text)}</span></div>`;
    }
    p.html(h);
  };
  return p;
}

/** A short headline for a digest row: the sentence up to its first ":", "(" or ".", capped. */
export function headline(text, max = 44) {
  const t = text.split(/[:(]|\.(\s|$)/)[0].trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

export function createDigest(root, game) {
  root.addEventListener("click", (e) => {
    if (e.target.closest(".dg-close")) { game.ui.digest = null; return; }
    if (e.target.closest("[data-dgbook]")) { game.ui.digest = null; game.openBook("story"); return; }
    const r = e.target.closest("[data-a]"); if (!r) return;
    const id = Number(r.dataset.a);
    if (id && game.sim.ents.get(id)) game.selectOnly(id, true);
    else game.toast("They are no longer with the village.");
  });
  let last = "";
  return {
    update() {
      const d = game.ui.digest;
      root.style.display = d ? "block" : "none";
      let h = "";
      if (d) {
        h = `<div class="dg-head"><b>While you were away</b><span class="dim">${d.days >= 1 ? d.days + (d.days === 1 ? " day" : " days") : "a while"}</span><button class="btn ico dg-close" data-test="digest-close"${tipAttr("Dismiss", "Esc")} aria-label="Dismiss">${svg("close", 14)}</button></div>`;
        h += `<div class="dgl">` + d.entries.map(e => `<div class="dg-row${e.sev >= 2 ? " big" : ""}"${e.a.length ? ` data-a="${e.a[0]}"` : ""}${tipAttr(when(e) + "\n" + e.text)} data-test="digest-row">${svg(EVENT_ICON[e.kind] || "star", 14)}<span class="dg-t">${esc(headline(e.text))}</span><span class="when">${esc(when(e))}</span></div>`).join("") + `</div>`;
        if (d.total > d.entries.length) h += `<button class="btn dg-more" data-dgbook="1" data-test="digest-more">+${d.total - d.entries.length} more</button>`;
      }
      if (h !== last) { last = h; root.innerHTML = h; }
    },
  };
}

/** Called every frame. Maintains attention, raises the digest, toasts deaths, optionally pauses. */
export function watch(game) {
  const { sim, ui, state } = game, es = sim.chron.entries, newest = es.length ? es[es.length - 1].id : 0;
  const watching = document.hasFocus() && state.speed <= 2;
  if (watching || state.paused) {
    if (sim.tick - ui.attn.tick >= AWAY_TICKS) {
      const d = digestEntries(sim.chron, ui.attn.id);
      if (d.total) ui.digest = { days: Math.round((sim.tick - ui.attn.tick) / DAY), ...d };
      ui.toastedId = newest;                 // the digest covers these; do not toast them again
    }
    ui.attn.tick = sim.tick; ui.attn.id = newest;
  }
  // Death and crisis toasts for what just happened in front of the player.
  for (const e of es) {
    if (e.id <= ui.toastedId) continue;
    ui.toastedId = e.id;
    if (e.sev >= 2) game.toast(e.text, 6000);
    if (e.kind === "DEATH" && ui.autoPause) { state.paused = true; game.toast("Paused: " + e.text, 8000); }
  }
}
