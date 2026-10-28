// The Concerns panel (GDD §22): a ranked list of what is wrong now, one line per threat class, each with a Show button that takes the camera there.
// S15: an icon per class, a count badge on the header, a display order that does not flicker (concerns.js stableOrder), and the advisory cards (ui/advisory.js):
// a small card in the corner when a class first rises to an alarming level, with Show, Snooze and Dismiss.
import { createPanel, esc } from "./dom.js";
import { concerns, stableOrder, CONCERN_ICON } from "./concerns.js";
import { advise, dismiss, snooze, newAdvisor } from "./advisory.js";

const PIP = { 3: "#e5594f", 2: "#e0a93b", 1: "#7cc4ff" };
export const LABEL = { food: "Food", cold: "Cold", illness: "Illness", danger: "Danger", underground: "Underground", crew: "Crew", knowledge: "Knowledge", spoilage: "Spoilage", hunting: "Hunting", idle: "Idle" };

export function createConcernsPanel(parent, game) {
  const p = createPanel(parent, "concerns", "Concerns");
  const adv = document.getElementById("advisories");
  p.body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-loc]"); if (!t) return;
    const c = game.ui.concerns && game.ui.concerns[Number(t.dataset.loc)];
    if (c && c.loc) game.locate(c.loc);
  });
  game.locate = (loc) => {
    if (!loc) return;
    const { cam, renderer } = game;
    cam.x = loc.x + 0.5; cam.y = loc.y + 0.5; game.ui.follow = 0;
    if (loc.z !== undefined && loc.z >= 0) renderer.setZ(loc.z);
    if (loc.id && game.sim.ents.get(loc.id)) game.selectOnly(loc.id);
  };
  if (adv) adv.addEventListener("click", (e) => {
    const b = e.target.closest("[data-adv]"); if (!b) return;
    const [a, k] = b.dataset.adv.split(":"), ui = game.ui;
    if (!ui.advisor) return;
    if (a === "show") { const card = ui.advCards && ui.advCards.find(c => c.k === k); if (card && card.loc) game.locate(card.loc); }
    else if (a === "dismiss") dismiss(ui.advisor, k);
    else if (a === "snooze") snooze(ui.advisor, k, game.sim.tick);
    p.update();
  });
  let lastAdv = "";
  p.update = () => {
    const ui = game.ui;
    if (!ui.advisor) ui.advisor = newAdvisor();
    if (!ui.cnOrder) ui.cnOrder = [];
    const list = stableOrder(concerns(game.sim), ui.cnOrder);
    ui.concerns = list;
    const top = list.reduce((m, c) => Math.max(m, c.level), 0);
    p.setHint(list.length ? String(list.length) : "all quiet");
    const hint = p.head.querySelector(".phint"); hint.classList.toggle("badge", list.length > 0); hint.classList.toggle("b3", top >= 3); hint.classList.toggle("b2", top === 2);
    let h = list.length ? "" : `<p class="dim">Nothing pressing. The village is eating, sheltered and busy.</p>`;
    list.forEach((c, i) => {
      h += `<div class="cn l${c.level}" data-k="${c.k}"><i class="pip" style="background:${PIP[c.level]}"></i><span class="cni" title="${esc(LABEL[c.k] || c.k)}">${CONCERN_ICON[c.k] || ""}</span><span class="cnk">${esc(LABEL[c.k] || c.k)}</span> <span class="cnt">${esc(c.text)}</span>`
        + (c.loc ? ` <button data-loc="${i}" title="Look at it on the map">Show</button>` : "") + `</div>`;
    });
    p.html(h);
    ui.advCards = advise(ui.advisor, list, game.sim.tick);
    if (adv) {
      let a = "";
      for (const c of ui.advCards) {
        a += `<div class="adv" data-k="${c.k}"><div class="at">${CONCERN_ICON[c.k] || ""} ${esc(LABEL[c.k] || c.k)}</div><div>${esc(c.text)}.</div><div class="btnrow">`
          + (c.loc ? `<button data-adv="show:${c.k}" title="Look at it on the map">Show</button>` : "") + `<button data-adv="snooze:${c.k}" title="Hide this for half a game day">Snooze</button><button data-adv="dismiss:${c.k}" title="Hide it until it has eased and returns">Dismiss</button></div></div>`;
      }
      if (a !== lastAdv) { lastAdv = a; adv.innerHTML = a; }
    }
  };
  return p;
}
