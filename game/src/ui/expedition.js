// The expedition card (GDD §13.4, S8): send the selected villagers to find something, watch the crew (members, target, status, stall reason),
// and call them back. All it does is send commands: {type:"expedition", op:"start"|"recall"}; the sim does the rest (expedition.js).
import { isAdult, maxHp, fitness, ageDays } from "../sim/villager.js";
import { EXP_N, EXP_TIME, WANT_LABEL, activeExp } from "../sim/expedition.js";
import { esc, createPanel } from "./dom.js";
import { svg } from "./icons.js";
import { avatar, meter, tipAttr } from "./kit.js";
import { ITEMS } from "../sim/items.js";
import { blockerText, EXP_WHY, itemName } from "./text.js";

const ITEMS_ASK = [["flint", "Flint"], ["clay", "Clay"], ["malachite", "Malachite"], ["any", "Anything new"]];

export function createExpeditionPanel(parent, game) {
  const p = createPanel(parent, "exp", "Expedition", { icon: "expedition" });
  const crew = () => game.ui.sel.map(id => game.sim.ents.get(id)).filter(v => v && isAdult(game.sim, v) && !v.xp && !v.poss);
  p.body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t || t.disabled) return;
    const [a, arg] = t.dataset.act.split(":"), sim = game.sim;
    if (a === "go") {
      const ids = crew().map(v => v.id);
      if (sim.apply({ type: "expedition", op: "start", ids, item: arg })) game.toast("Expedition away: " + ids.length + (ids.length === 1 ? " villager" : " villagers") + " to find " + WANT_LABEL[arg] + ".");
      else game.toast("They cannot go: " + blockerText("mine", sim.lastBlocker || "NO_TARGET"));
    } else if (a === "recall") { sim.apply({ type: "expedition", op: "recall", id: Number(arg) }); game.toast("Recall: the crew is coming home."); }
    else if (a === "again") {
      const x = sim.exp.list.find(q => q.id === Number(arg)), ids = x ? x.ids.filter(id => { const v = sim.ents.get(id); return v && !v.xp; }) : [];
      if (x && sim.apply({ type: "expedition", op: "start", ids, item: x.item })) game.toast("Sent again for " + WANT_LABEL[x.item] + ".");
    } else if (a === "focus") game.selectOnly(Number(arg), true);
  });
  p.update = () => {
    const { sim } = game, list = sim.exp.list, sel = crew();
    p.show(list.length > 0 || sel.length > 0);
    let h = "";
    if (sel.length) {
      h += `<div class="row" data-test="trip-send"><span class="rl tripl">Expedition: ${sel.length} ${sel.length === 1 ? "slime" : "slimes"}</span><span class="cap tripf">Find</span><span class="sr">Send ${sel.length} selected ${sel.length === 1 ? "villager" : "villagers"} to find:</span>`;
      for (const [k, label] of ITEMS_ASK) h += `<button class="btn" data-act="go:${k}" data-test="trip-go-${k}"${tipAttr(label + "\n" + (k === "any" ? "The material the village has least of" : "Dig toward " + label.toLowerCase() + " at least 3 levels down") + ". They carry on like any villager (eat, sleep, flee) and turn back when it is found, when someone is hurt or short of food, or when time runs out.")}>${k === "any" ? svg("knowledge", 16) : `<i class="sw" style="background:${ITEMS[k].color}"></i>`}<span>${k === "any" ? "Anything" : label}</span></button>`;
      h += `</div><span class="sr">The village carries on without them. Autonomy never sends anyone out.</span>`;
    }
    for (const x of list.slice().reverse()) {
      const act = x.st !== "done", vs = x.ids.map(id => sim.ents.get(id)).filter(Boolean), left = Math.max(0, x.deadline - sim.tick);
      h += `<div class="expcard" data-test="trip-card"><div class="row">${svg("expedition", 16)}<b class="rl">Finding ${x.item === "any" ? "anything" : esc(itemName(x.item).toLowerCase())}</b><span class="sr">Find ${esc(WANT_LABEL[x.item])}${x.item === "any" ? " (" + esc(itemName(x.want)) + ")" : ""}</span>${x.item === "any" ? svg("knowledge", 16) : `<i class="sw" style="background:${ITEMS[x.item === "any" ? x.want : x.item].color}"></i>`}`;
      h += vs.map(v => {
        const r = v.hp / maxHp(v, fitness(v, ageDays(sim, v)));
        return `<button class="btn sm" data-act="focus:${v.id}"${tipAttr(v.name + ": " + (v.job ? v.job.k.replace("_", " ") : "idle"))}>${avatar(v.hue, v.lin, 16)}<span class="nm">${esc(v.name.split(" ")[0])}</span>${r < 0.5 ? svg("hurt", 12) : ""}${(v.fear || 0) > 0.6 ? svg("fear", 12) : ""}</button>`;
      }).join("") + `</div>`;
      if (act) {
        // found pips (0..EXP_N), time left as a meter, a status icon: home / work / the blocker
        h += `<div class="row">${svg(x.st === "work" ? "dig" : "home", 16)}<span class="rk" data-test="found-pips"${tipAttr("Found " + x.got + " of " + EXP_N + (x.depth ? ", " + x.depth + " levels down" : ""))}>${Array.from({ length: EXP_N }, (_, i) => `<i class="${i < x.got ? "f" : ""}"></i>`).join("")}</span>`
          + (x.st === "work" ? meter(left / EXP_TIME, { color: "var(--water)", tip: `Time left ${(left / 1200).toFixed(1)} of ${(EXP_TIME / 1200).toFixed(1)} minutes at 1x` }) : "")
          + (x.stall ? `<span${tipAttr(x.stall === "UNSAFE" ? "Someone is afraid: a thornback is close, so they ran" : blockerText("mine", x.stall))}>${svg("blocked", 16)}</span>` : "")
          + (x.st === "work" ? `<button class="btn ico" data-act="recall:${x.id}" data-test="trip-recall"${tipAttr("Recall\nCall the crew home now")} aria-label="Recall">${svg("recall", 16)}<span class="sr">Recall</span></button>` : "") + `</div>`;
        h += `<div class="sr">Status: ${x.st === "work" ? "out, digging toward it" : "heading home: " + esc(EXP_WHY[x.why])}. Found ${x.got} of ${EXP_N}${x.depth ? ", " + x.depth + " levels down" : ""}. ${x.st === "work" ? "Time left " + (left / 1200).toFixed(1) + " of " + (EXP_TIME / 1200).toFixed(1) + " minutes at 1x. " : ""}Stalled? ${x.stall ? esc(x.stall === "UNSAFE" ? "someone is afraid: a thornback is close, so they ran" : blockerText("mine", x.stall)) : "no"}</div>`;
      } else {
        h += `<div class="row"><button class="btn" data-act="again:${x.id}" ${vs.length ? "" : "disabled"}${tipAttr("Send again")}>${svg("rotate", 16)}</button><span class="sr">${esc(x.rep)} Send again</span></div>`;
      }
      h += `</div>`;
    }
    p.html(h);
  };
  return p;
}
