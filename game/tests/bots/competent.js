// The competent scripted player for Property 6 (GDD §26, PROTOTYPE_PLAN P11): a player who knows the chain and plays it with ordinary
// commands only (mine, build, keep, investigate, purpose). It never touches the sim's state directly. One bot, used by
//   tests/property6.js   fixture-to-fixture SEGMENTS of <= 10 game days each (quick set)
//   tests/bots/chainrun.js   `start` to copper in one run, one seed, <= 1 game year (--full ONLY; for the balance pass)
//
// Each call looks at the sim and does the next sensible thing, at most once every 120 ticks:
//   * fire known?  nothing to do (it is found, not researched) - the bot waits for the village to see it
//   * clay: seek it (the stream bank is on the surface, so it is seen from the start)
//   * pottery unknown and clay in hand: ask two villagers to investigate clay
//   * pottery known: a kiln beside the camp, a bellows next to it (keep fired clay), jars are not needed
//   * charcoal unknown: ask two villagers to investigate wood; known: dirt for a mound, a mound, keep charcoal
//   * malachite: seek it
//   * smelting unknown with kiln + bellows + charcoal + malachite in hand: investigate malachite AT THE KILN
//   * smelting known: keep copper, a workbench, keep copper picks
import { DUR_DAY } from "../../src/sim/clock.js";
import { can } from "../../src/sim/knowledge.js";
import { haveTotal } from "../../src/sim/items.js";
import { isAdult } from "../../src/sim/villager.js";
import { CAMP } from "../../src/sim/board.js";
import { checkPlace } from "../../src/sim/build.js";
import { stationHeat } from "../../src/sim/heat.js";

const have = (sim, item) => haveTotal(sim, item);
const stationsOf = (sim, f) => sim.ents.ofKind("furniture").filter(e => e.f === f);
const ghosts = (sim, w) => sim.ents.ofKind("csite").filter(s => s.w === w);

/** A free standable cell near the camp with a free standable neighbour (so a bellows can go beside it), off the stockpile; skip n matches. */
function pairSpot(sim, skip = 0) {
  const c = CAMP(sim.stock);
  let n = 0;
  for (let r = 5; r <= 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = c.x + dx, y = c.y + dy, z = sim.world.standZ(x, y);
    if (z < 0 || Math.abs(z - sim.stock.z) > 1 || checkPlace(sim, "workbench", "", x, y, z)) continue;       // (a bench is the piece with no craft requirement: this asks only "is the ground free?")
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([ax, ay]) => sim.world.standZ(x + ax, y + ay) === z && !sim.ents.at(x + ax, y + ay, z).length && !checkPlace(sim, "workbench", "", x + ax, y + ay, z));
    if (nb && n++ >= skip) return { x, y, z, nx: x + nb[0], ny: y + nb[1] };
  }
  return null;
}
/** A free single cell near the camp for a mound or a bench. */
function oneSpot(sim, w, skip = 0) {
  const c = CAMP(sim.stock);
  let n = 0;
  for (let r = 5; r <= 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = c.x + dx, y = c.y + dy, z = sim.world.standZ(x, y);
    if (z >= 0 && Math.abs(z - sim.stock.z) <= 1 && !checkPlace(sim, "workbench", "", x, y, z) && n++ >= skip) return { x, y, z };
  }
  return null;
}

export function competentBot() {
  const done = {};                                         // one-shot commands already given: key -> tick
  const once = (k, sim, gap = 1e9) => { if (done[k] !== undefined && sim.tick - done[k] < gap) return false; done[k] = sim.tick; return true; };
  const asks = (sim, extra) => {
    const ad = sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).slice(0, 3).map(v => v.id);
    sim.apply({ type: "investigate", ids: ad, ...extra });
  };
  const keep = (sim, item, n) => { const k = sim.board.keeps.find(q => q.item === item); if (!k || k.n !== n) sim.apply({ type: "keep", item, n }); };
  const mining = (sim, item) => sim.mine.list.some(d => d.kind === "seek" && d.item === item);
  return (sim) => {
    if (sim.tick % 120 !== 7) return;
    const fire = can(sim, "FIRE_TENDING"), pot = can(sim, "POTTERY") || can(sim, "KILN"), chr = can(sim, "CHARCOAL"), smelt = can(sim, "SMELTING");
    // supplies: wood for fuel and the charcoal mound, always
    keep(sim, "log", 12); keep(sim, "stick", 24);
    if (fire && have(sim, "clay") < 8 && !mining(sim, "clay") && once("seekclay", sim, 3 * DUR_DAY)) sim.apply({ type: "mine", op: "seek", item: "clay" });
    if (fire && !pot && have(sim, "clay") >= 1 && once("investclay", sim, 2 * DUR_DAY)) { const h = sim.ents.ofKind("furniture").find(f => f.f === "hearth"); asks(sim, { item: "clay", at: h ? h.id : 0 }); }
    if (pot) {
      const k = stationsOf(sim, "kiln")[0];
      if (!k && !ghosts(sim, "kiln").length && have(sim, "clay") >= 4 && once("kiln", sim, DUR_DAY)) {
        const p = pairSpot(sim);
        if (p) sim.apply({ type: "build", cells: [{ w: "kiln", x: p.x, y: p.y, z: p.z }] });
      }
      if (k && !stationsOf(sim, "bellows").length && !ghosts(sim, "bellows").length && have(sim, "fired_clay") >= 2) {
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ax, ay]) => [k.x + ax, k.y + ay, sim.world.standZ(k.x + ax, k.y + ay)]).find(([x, y, z]) => z === k.z && !checkPlace(sim, "bellows", "", x, y, z));
        if (nb && once("bellows", sim, DUR_DAY)) sim.apply({ type: "build", cells: [{ w: "bellows", x: nb[0], y: nb[1], z: nb[2] }] });
      }
      if (k && !stationsOf(sim, "bellows").length && have(sim, "fired_clay") < 2) keep(sim, "fired_clay", 4);
      if (k && stationsOf(sim, "bellows").length) { const kk = sim.board.keeps.find(q => q.item === "fired_clay"); if (kk && have(sim, "fired_clay") >= 4) sim.apply({ type: "unkeep", item: "fired_clay" }); }
    }
    if (pot && !chr && have(sim, "log") >= 1 && once("investlog", sim, 2 * DUR_DAY)) { const h = sim.ents.ofKind("furniture").find(f => f.f === "hearth"); asks(sim, { item: "log", at: h ? h.id : 0 }); }
    if (chr) {
      if (!stationsOf(sim, "mound").length && !ghosts(sim, "mound").length) {
        if (have(sim, "dirt") < 4 && !sim.mine.list.length && once("dirt", sim, 3 * DUR_DAY)) {
          const c = CAMP(sim.stock), x = c.x + 9, y = c.y + 9, z = sim.world.standZ(x, y) - 1;
          if (z > 0) sim.apply({ type: "mine", op: "region", x0: x, y0: y, x1: x + 2, y1: y + 2, z, layers: 1 });
        }
        if (have(sim, "dirt") >= 4 && once("mound", sim, DUR_DAY)) { const p = oneSpot(sim, "mound"); if (p) sim.apply({ type: "build", cells: [{ w: "mound", ...p }] }); }
      } else if (stationsOf(sim, "mound").length && have(sim, "charcoal") < 6) keep(sim, "charcoal", 6);
    }
    if (pot && have(sim, "malachite") < 4 && !mining(sim, "malachite") && once("seekmal", sim, 3 * DUR_DAY)) sim.apply({ type: "mine", op: "seek", item: "malachite" });
    const kiln = stationsOf(sim, "kiln").find(k => stationHeat(sim, k, "charcoal").level >= 4);
    if (!smelt && kiln && have(sim, "charcoal") >= 2 && have(sim, "malachite") >= 2 && once("investmal", sim, 2 * DUR_DAY)) asks(sim, { item: "malachite", at: kiln.id });
    if (smelt) {
      keep(sim, "copper", 2);
      if (!stationsOf(sim, "workbench").length && !ghosts(sim, "workbench").length && have(sim, "log") >= 2 && once("bench", sim, DUR_DAY)) { const p = oneSpot(sim, "workbench"); if (p) sim.apply({ type: "build", cells: [{ w: "workbench", ...p }] }); }
      if (stationsOf(sim, "workbench").length) keep(sim, "copper_pick", 1);
    }
  };
}

