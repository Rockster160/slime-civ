// Giving orders: which verbs make sense for a target, issuing them through
// sim.apply, the order bar (selected count + verb buttons) and the small popup
// shown when a right-click is ambiguous. The sim only ever sees apply(cmd).
import { isAdult } from "../sim/villager.js";
import { inZone } from "../sim/items.js";
import { berrySeason } from "../sim/season.js";
import { itemName, BLOCKER_TEXT } from "./text.js";
import { DIG } from "../sim/dig.js";
import { FAUNA } from "../sim/fauna.js";
import { can } from "../sim/knowledge.js";

export const VERBS = [
  { verb: "forage", label: "Forage", tip: "Pick berries from bushes around the target" },
  { verb: "chop", label: "Chop", tip: "Fell trees around the target for logs" },
  { verb: "gather", label: "Gather", tip: "Cut grass tufts around the target" },
  { verb: "haul", label: "Haul", tip: "Carry loose items around the target to the stockpile" },
  { verb: "dig", label: "Dig", tip: "Dig out the rock or soil around the target (a 5x5 patch). Gives stone and dirt for building" },
  { verb: "hunt", label: "Hunt", tip: "Hunt the hoppers around the target; the meat is hauled to the stockpile. Villagers fight nothing else on their own" },
  { verb: "capture", label: "Capture", tip: "Catch the wild hoppers around the target alive and walk them to a finished pen (needs husbandry and a staked-out pen)" },
  { verb: "move", label: "Move", tip: "Walk to the spot" },
];
const VERB_LABEL = Object.fromEntries(VERBS.map(v => [v.verb, v.label]));

/** Orders that make sense for what is on the clicked cell: [{verb, tid?, what}] ("Move here" is always last). */
export function optionsAt(game, pick) {
  const sim = game.sim, out = [], seen = new Set();
  const add = (verb, e, what) => { if (!seen.has(verb)) { seen.add(verb); out.push({ verb, tid: e ? e.id : 0, what }); } };
  for (const e of pick.ents) {
    if (e.kind === "plant") {
      if (e.species === "tree" && !e.burn) add("chop", e, "tree");
      else if (e.species === "berry") add("forage", e, "berry bush");
      else if (e.species === "tuft") add("gather", e, "grass tuft");
    } else if (e.kind === "item" && !inZone(sim.stock, e.x, e.y)) add("haul", e, e.n + " " + itemName(e.item));
    else if (e.kind === "fauna" && FAUNA[e.sp].huntable && !e.tame) { add("hunt", e, FAUNA[e.sp].label); if (can(sim, "HUSBANDRY") && sim.farm.pens.some(p => p.built)) add("capture", e, FAUNA[e.sp].label + " alive"); }
  }
  if (pick.z > 0 && DIG[game.sim.world.mat(pick.x, pick.y, pick.z - 1)] && game.sim.world.mat(pick.x, pick.y, pick.z - 1) > 2 && game.sim.world.mat(pick.x, pick.y, pick.z - 1) !== 4) add("dig", null, "the rock here");     // rock (hard, soft, flint, malachite) or clay offers digging
  add("move", null, "here");
  return out;
}

/** The selected villagers that can take orders. */
export function orderable(game) {
  return game.ui.sel.map(id => game.sim.ents.get(id)).filter(v => v && isAdult(game.sim, v));
}

/** Issue one order for the current selection at a pick. opt = {verb, tid, what}. Returns true if anything changed. */
export function issueOrder(game, opt, pick) {
  const { sim, ui } = game;
  const vs = orderable(game);
  if (!ui.sel.length) { game.toast("Select villagers first (click or drag a box)."); return false; }
  if (!vs.length) { game.toast("Children cannot take orders. Select an adult."); return false; }
  if (opt.verb === "forage" && !berrySeason(sim.tick) && opt.tid) { game.toast("Berry bushes bear nothing in winter."); return false; }
  if (opt.verb === "move" && (pick.z < 0 || !sim.world.isWalkable(pick.x, pick.y, pick.z))) { game.toast("They cannot stand there."); return false; }
  const cmd = { type: "order", ids: vs.map(v => v.id), verb: opt.verb };
  if (opt.tid) cmd.tid = opt.tid; else { cmd.x = pick.x; cmd.y = pick.y; cmd.z = opt.verb === "dig" ? pick.z - 1 : pick.z; }
  const ok = sim.apply(cmd);
  if (ui.crewTarget && sim.crews.list.some(c => c.id === ui.crewTarget)) {          // S11: aimed from the Crews panel: this order is also the crew's default task
    const t = { t: "order", verb: opt.verb, x: opt.tid ? sim.ents.get(opt.tid).x : cmd.x, y: opt.tid ? sim.ents.get(opt.tid).y : cmd.y, z: opt.tid ? sim.ents.get(opt.tid).z : cmd.z, tid: opt.tid || 0 };
    sim.apply({ type: "crew", op: "task", id: ui.crewTarget, task: t });
    ui.crewTarget = 0;
  }
  const area = opt.verb !== "move" && !opt.tid;
  const label = VERB_LABEL[opt.verb] + (area ? " (area)" : "");
  ui.markers.push({ x: pick.x, y: pick.y, z: pick.z, label, t: performance.now(), verb: opt.verb });
  game.toast(ok ? label + ": " + vs.length + (vs.length === 1 ? " villager" : " villagers") + "." : opt.verb === "capture" ? "Cannot capture: " + (BLOCKER_TEXT[sim.lastBlocker] || "no pen") + "." : "They are already on that order.");
  return ok;
}

/** Right-click: one-click default; a popup only when several verbs fit. */
export function rightClick(game, pick, sx, sy) {
  const opts = optionsAt(game, pick);
  if (pick.ents.some(e => e.kind === "fauna" && FAUNA[e.sp].hostile)) { game.toast("Villagers will not fight a thornback on their own. Guide one yourself (select it, press Q), with a copper spear."); return; }
  if (!game.ui.sel.length) { game.toast("Select villagers first, then right-click to give an order."); return; }
  if (opts.length === 1) { issueOrder(game, opts[0], pick); return; }
  if (opts.length === 2 && opts[0].verb !== "move" && opts[1].verb === "move") { issueOrder(game, opts[0], pick); return; }   // target + "move here": the target wins
  openMenu(game, opts, pick, sx, sy);
}

// ---- DOM ----

let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
function openMenu(game, opts, pick, sx, sy) {
  closeMenu();
  menuEl = document.createElement("div");
  menuEl.className = "ctxmenu";
  menuEl.style.left = Math.min(sx, window.innerWidth - 190) + "px";
  menuEl.style.top = Math.min(sy, window.innerHeight - 40 - opts.length * 28) + "px";
  for (const o of opts) {
    const b = document.createElement("button");
    b.textContent = VERB_LABEL[o.verb] + (o.verb === "move" ? " here" : " " + o.what);
    b.onclick = () => { closeMenu(); issueOrder(game, o, pick); };
    menuEl.appendChild(b);
  }
  document.body.appendChild(menuEl);
}
export { closeMenu };

export function createOrderBar(root, game) {
  const { ui } = game;
  root.innerHTML = `<span class="ob-count"></span><span class="ob-verbs"></span>
    <button class="ob-cancel" title="Clear the orders of the selected villagers (X)">Cancel orders</button>
    `;
  const count = root.querySelector(".ob-count"), verbs = root.querySelector(".ob-verbs");
  const btns = {};
  for (const v of VERBS) {
    const b = document.createElement("button");
    b.textContent = v.label; b.title = v.tip + ". Click, then click the map. (Or just right-click.)";
    b.onclick = () => { ui.targeting = ui.targeting === v.verb ? null : v.verb; };
    verbs.appendChild(b); btns[v.verb] = b;
  }
  root.querySelector(".ob-cancel").onclick = () => {
    if (game.ui.sel.length) game.cancelOrders(game.ui.sel);
  };
  let last = "";
  return {
    update() {
      const n = ui.sel.length, adults = orderable(game).length;
      root.style.display = n ? "flex" : "none";
      for (const k in btns) btns[k].classList.toggle("on", ui.targeting === k);
      if (!ui.targeting) ui.crewTarget = 0;
      btns.capture.style.display = can(game.sim, "HUSBANDRY") ? "" : "none";                // S10: shown once the village knows husbandry
      const s = n + (n === 1 ? " villager" : " villagers") + " selected" + (adults < n ? " (" + adults + " can take orders)" : "");
      root.style.display = n && ui.mode !== "build" ? "flex" : "none";
      const h = ui.targeting ? "Click the map to " + VERB_LABEL[ui.targeting].toLowerCase() + " (Esc to stop)" : "Right-click a target";
      const key = s + h;
      if (key !== last) { last = key; count.textContent = ui.targeting ? s + ". " + h : s; }
    },
  };
}
