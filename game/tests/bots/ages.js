// The competent player for the S9 segments of Property 6 (GDD §26, P11): ordinary commands only (keep, investigate, build, mine). Three small scripted
// players, one per fixture, each does the next sensible thing at most every 120 ticks. They never touch sim state.
//   handBot      workshop   : investigate stone, grass, a hide, meat at the covered rack; once known, keep cordage / leather / a backpack
//   copperBot    copperage  : beat copper cold; keep moulds; investigate copper with a mould at the kiln; once known, keep a cast pick
//   ironBot      ironready  : investigate ore at the forge; keep iron; investigate iron at the forge; once known, keep an iron pick
import { DUR_DAY } from "../../src/sim/clock.js";
import { can } from "../../src/sim/knowledge.js";
import { haveTotal } from "../../src/sim/items.js";
import { isAdult } from "../../src/sim/villager.js";

const furn = (sim, f) => sim.ents.ofKind("furniture").filter(e => e.f === f);
function toolkit() {
  const done = {};
  const once = (k, sim, gap) => { if (done[k] !== undefined && sim.tick - done[k] < gap) return false; done[k] = sim.tick; return true; };
  const asks = (sim, extra) => sim.apply({ type: "investigate", ids: sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).slice(0, 3).map(v => v.id), ...extra });
  const keep = (sim, item, n) => { const k = sim.board.keeps.find(q => q.item === item); if (!k || k.n !== n) sim.apply({ type: "keep", item, n }); };
  return { once, asks, keep };
}
const have = (sim, k) => haveTotal(sim, k);

export function handBot() {
  const { once, asks, keep } = toolkit();
  return (sim) => {
    if (sim.tick % 120 !== 7) return;
    const gap = 2 * DUR_DAY;
    if (!can(sim, "DRESS_STONE") && have(sim, "stone") && once("stone", sim, gap)) asks(sim, { item: "stone" });
    else if (!can(sim, "CORDAGE") && have(sim, "grass") && once("grass", sim, gap)) asks(sim, { item: "grass" });
    else if (!can(sim, "HIDE_WORKING") && have(sim, "hide") && once("hide", sim, gap)) asks(sim, { item: "hide" });
    else if (!can(sim, "SMOKING") && have(sim, "hopper_meat") && furn(sim, "smoker").length && once("meat", sim, gap)) asks(sim, { item: "hopper_meat", at: furn(sim, "smoker")[0].id });
    if (can(sim, "CORDAGE") && can(sim, "HIDE_WORKING")) { keep(sim, "leather", 2); if (have(sim, "leather") >= 2) keep(sim, "backpack", 1); }
    if (can(sim, "CORDAGE")) keep(sim, "cordage", 4);
  };
}

export function copperBot() {
  const { once, asks, keep } = toolkit();
  return (sim) => {
    if (sim.tick % 120 !== 7) return;
    const gap = 2 * DUR_DAY;
    keep(sim, "log", 8);
    if (!can(sim, "HAMMERING") && have(sim, "copper") && once("copper", sim, gap)) asks(sim, { item: "copper" });
    if (can(sim, "POTTERY") && !can(sim, "CASTING")) keep(sim, "mould", 2);
    const kiln = furn(sim, "kiln")[0];
    if (!can(sim, "CASTING") && kiln && have(sim, "mould") && have(sim, "copper") && have(sim, "charcoal") && once("cast", sim, gap)) asks(sim, { item: "copper", at: kiln.id });
    if (can(sim, "CASTING")) { keep(sim, "mould", 2); keep(sim, "cast_pick", 1); }
  };
}

export function ironBot() {
  const { once, asks, keep } = toolkit();
  return (sim) => {
    if (sim.tick % 120 !== 7) return;
    const gap = 2 * DUR_DAY, forge = furn(sim, "forge")[0];
    if (!forge) return;
    if (!can(sim, "IRON_SMELTING") && have(sim, "iron_ore") && have(sim, "coal") && once("ore", sim, gap)) asks(sim, { item: "iron_ore", at: forge.id });
    if (can(sim, "IRON_SMELTING")) keep(sim, "iron", 4);          // (a few spare: an experiment takes one in hand, and a held one is not in the yard)
    if (can(sim, "IRON_SMELTING") && !can(sim, "FORGING") && have(sim, "iron") >= 2 && have(sim, "coal") && once("weld", sim, gap)) asks(sim, { item: "iron", at: forge.id });
    if (can(sim, "FORGING")) keep(sim, "iron_pick", 1);
  };
}
