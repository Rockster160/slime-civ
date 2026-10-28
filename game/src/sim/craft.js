// S7b: stations, recipes and what they make (GDD §14.3, §14.4, §12.4, Appendix B). The clay -> charcoal -> copper chain.
//
//   station   = furniture {f: kiln | mound | workbench | bellows | waterjar, ...}
//     kiln / mound   {lid, inv:{item:n}, rcp (recipe key loaded), bn (burn ticks left), bt, lv (heat level lit at), by (who lit it), fq (quality)}
//     workbench      {inv, rcp}                       waterjar {fill}                 bellows: no state (it is a draft source, heat.js)
//   recipe    = inputs (loaded into the station by hand, one trip at a time) + station + craft + heat + time -> outputs
//
// A craft job (jobs.js genCraft) is a derived STANDING-class job that exists only when somebody asked for the product (a keep-N, which is the
// player's request, or a keep-N on something that needs it: copper needs charcoal) and a living villager knows the craft. Its steps are
// take / load (per trip) then `light` (a kiln or mound: the batch burns on its own for `dur` ticks) or `make` (a workbench: the work itself).
// When a batch ends (stationsTick) the products drop loose at the station for the baseline hauling, the lighter earns craft XP for what
// came out (difficulty 0.7 kiln, 0.9 smelt), the phenomena whose context matched fire with the lighter performing (so a kiln run teaches
// KILN_FIRING and a smelt teaches SMELTING), and the craft's familiarity is nudged up.
import { stationHeat } from "./heat.js";
import { smokeFire } from "./fire.js";
import { PICKS, SPEAR_USES } from "./gear.js";
import { PHENOMENA, matches, tagsOf } from "./phenomena.js";
import { can, famOf, useCraft } from "./knowledge.js";
import { observe, activeRows, sight } from "./discovery.js";
import { gain, level, VALUE } from "./skills.js";
import { dropLoose } from "./items.js";
import { once, log } from "./chronicle.js";
import { evaluate } from "./roomeval.js";
import { clamp } from "./util.js";
import { dryAir } from "./depth.js";
import { WAGON_OUT, spawnWagon } from "./wagon.js";

/** job: the board's job kind; station; craft: who must know it; inputs: loaded by hand; fuel: the item the heat is computed with; need/max: heat level window; dur: ticks burning (or working). */
export const RECIPES = {
  fired_clay:  { job: "fire_kiln",     station: "kiln",      craft: "POTTERY",   inputs: { clay: 4, stick: 4 },       fuel: "stick",    out: { fired_clay: 4 }, dur: 900,  need: 3, diff: 0.7, label: "fire clay" },
  jar:         { job: "fire_kiln",     station: "kiln",      craft: "VESSELS",   inputs: { clay: 4, stick: 4 },       fuel: "stick",    out: { jar: 2 },        dur: 900,  need: 3, diff: 0.7, label: "fire clay jars" },
  charcoal:    { job: "burn_charcoal", station: "mound",     craft: "CHARCOAL",  inputs: { log: 4 },                  fuel: "log",      out: { charcoal: 3 },   dur: 1200, need: 1, max: 1, diff: 0.5, label: "burn charcoal" },
  copper:      { job: "smelt",         station: "kiln",      craft: "SMELTING",  inputs: { malachite: 4, charcoal: 2 }, fuel: "charcoal", out: { copper: 2 },     dur: 1200, need: 4, diff: 0.9, label: "smelt copper" },
  copper_spear: { job: "make_tool", station: "workbench", craft: "SMELTING",  inputs: { copper: 1, stick: 1 },      fuel: "",         out: { copper_spear: 1 }, dur: 400, need: 0, diff: 0.6, label: "make a copper spear", work: true },
  copper_pick: { job: "make_tool",     station: "workbench", craft: "SMELTING",  inputs: { copper: 2, log: 1 },       fuel: "",         out: { copper_pick: 1 }, dur: 600, need: 0, diff: 0.7, label: "make a copper pick", work: true },
  // ---- S9 (GDD §15.7): the rest of the twelve. Bench work (`work`: the bench is the station, the maker's hands the heat) ... ----
  cordage:     { job: "make_tool", station: "workbench", craft: "CORDAGE",     inputs: { grass: 6 },                 fuel: "", out: { cordage: 3 },   dur: 300, need: 0, diff: 0.3, label: "twist cordage", work: true },
  basket:      { job: "make_tool", station: "workbench", craft: "CORDAGE",     inputs: { cordage: 3, stick: 3 },     fuel: "", out: { basket: 1 },    dur: 400, need: 0, diff: 0.4, label: "weave a basket", work: true },
  leather:     { job: "make_tool", station: "workbench", craft: "HIDE_WORKING", inputs: { hide: 1, cordage: 1 },      fuel: "", out: { leather: 2 },   dur: 400, need: 0, diff: 0.4, label: "work a hide", work: true },
  backpack:    { job: "make_tool", station: "workbench", craft: "HIDE_WORKING", inputs: { leather: 2, cordage: 2 },   fuel: "", out: { backpack: 1 },  dur: 600, need: 0, diff: 0.5, label: "sew a backpack", work: true },
  block:       { job: "make_tool", station: "workbench", craft: "DRESS_STONE", inputs: { stone: 3 },                 fuel: "", out: { block: 2 },     dur: 400, need: 0, diff: 0.5, label: "dress stone", work: true },
  stone_axe:   { job: "make_tool", station: "workbench", craft: "DRESS_STONE", inputs: { stone: 2, flint: 1, stick: 1 }, fuel: "", out: { stone_axe: 1 }, dur: 400, need: 0, diff: 0.5, label: "make a stone axe", work: true },
  timber:      { job: "make_tool", station: "workbench", craft: "FRAMING",     inputs: { log: 2 },                   fuel: "", out: { timber: 2 },    dur: 500, need: 0, diff: 0.5, label: "frame timber", work: true, tool: ["stone_axe", "copper_axe", "iron_axe", "bone_axe"] },
  mould:       { job: "make_tool", station: "workbench", craft: "POTTERY",     inputs: { fired_clay: 2 },            fuel: "", out: { mould: 1 },     dur: 300, need: 0, diff: 0.5, label: "shape a clay mould", work: true },
  sheet:       { job: "make_tool", station: "workbench", craft: "HAMMERING",   inputs: { copper: 1 },                fuel: "", out: { sheet: 2 },     dur: 400, need: 0, diff: 0.5, label: "hammer copper sheet", work: true },
  fitting:     { job: "make_tool", station: "workbench", craft: "HAMMERING",   inputs: { sheet: 1, stick: 1 },       fuel: "", out: { fitting: 2 },   dur: 300, need: 0, diff: 0.5, label: "make copper fittings", work: true },
  // ... the kiln (brick at the Kiln level, casting at the Furnace level) ...
  brick:       { job: "fire_kiln", station: "kiln", craft: "KILN",     inputs: { clay: 4, stick: 4 },          fuel: "stick",    out: { brick: 4 },      dur: 900,  need: 3, diff: 0.7, label: "fire bricks" },
  copper_axe:  { job: "smelt",     station: "kiln", craft: "CASTING",  inputs: { copper: 2, mould: 1, charcoal: 1 }, fuel: "charcoal", out: { copper_axe: 1 }, dur: 600, need: 4, diff: 0.8, label: "cast a copper axe" },
  cast_pick:   { job: "smelt",     station: "kiln", craft: "CASTING",  inputs: { copper: 3, mould: 1, charcoal: 1 }, fuel: "charcoal", out: { cast_pick: 1 },  dur: 600, need: 4, diff: 0.8, label: "cast a pick" },
  // ... the covered rack (a lit hearth beside it is the heat) ...
  smoked_meat: { job: "smoke",     station: "smoker", craft: "SMOKING", inputs: { hopper_meat: 4 },             fuel: "", fire: true, out: { smoked_meat: 4 }, dur: 1200, need: 1, diff: 0.4, label: "smoke meat" },
  // ... S14 (R13 alternates): salting at the bench, wind-drying on the covered rack (no fire: `air` = it needs cold dry air), peat dried at the bench, the remedy, the bone axe ...
  salted_meat: { job: "make_tool", station: "workbench", craft: "SALTING", inputs: { hopper_meat: 4, salt: 2 }, fuel: "", out: { salted_meat: 4 }, dur: 400, need: 0, diff: 0.4, label: "salt meat", work: true },
  dried_meat:  { job: "smoke", station: "smoker", craft: "DRYING", inputs: { hopper_meat: 4 }, fuel: "", air: 1, out: { dried_meat: 3 }, dur: 1500, need: 0, diff: 0.4, label: "dry meat in the wind" },
  dried_peat:  { job: "make_tool", station: "workbench", craft: "PEAT_CUTTING", inputs: { peat: 4 }, fuel: "", out: { dried_peat: 4 }, dur: 300, need: 0, diff: 0.3, label: "stack peat to dry", work: true },
  herbal_remedy: { job: "make_tool", station: "workbench", craft: "HERBAL", inputs: { herb: 3 }, fuel: "", out: { herbal_remedy: 2 }, dur: 300, need: 0, diff: 0.5, label: "steep a herbal remedy", work: true },
  bone_axe:    { job: "make_tool", station: "workbench", craft: "BONE_WORKING", inputs: { bone: 2, stick: 1 }, fuel: "", out: { bone_axe: 1 }, dur: 400, need: 0, diff: 0.4, label: "make a bone axe", work: true },
  // ... S15 (GDD §14.7): wheels and the two wagons, framed at the bench (best guess: a wagon is 4 timber on 4 wheels, a cart adds the harness of cordage) ...
  wheel:       { job: "make_tool", station: "workbench", craft: "FRAMING", inputs: { timber: 2, stick: 2 }, fuel: "", out: { wheel: 2 }, dur: 400, need: 0, diff: 0.5, label: "frame wheels", work: true },
  wagon:       { job: "make_tool", station: "workbench", craft: "FRAMING", inputs: { timber: 4, wheel: 4 }, fuel: "", out: { wagon: 1 }, dur: 700, need: 0, diff: 0.6, label: "build a wagon", work: true },
  cart:        { job: "make_tool", station: "workbench", craft: "FRAMING", inputs: { timber: 4, wheel: 4, cordage: 3 }, fuel: "", out: { cart: 1 }, dur: 800, need: 0, diff: 0.6, label: "build an animal cart", work: true },
  // ... and the forge (coal, a second draft: the Forge level, heat 5).
  iron:        { job: "smelt",     station: "forge", craft: "IRON_SMELTING", inputs: { iron_ore: 4, coal: 2 },  fuel: "coal",     out: { iron: 2 },       dur: 1200, need: 5, diff: 1.0, label: "smelt iron" },
  iron_pick:   { job: "smelt",     station: "forge", craft: "FORGING",  inputs: { iron: 2, log: 1, coal: 1 },    fuel: "coal",     out: { iron_pick: 1 },  dur: 600,  need: 5, diff: 1.0, label: "forge an iron pick" },
  iron_axe:    { job: "smelt",     station: "forge", craft: "FORGING",  inputs: { iron: 2, log: 1, coal: 1 },    fuel: "coal",     out: { iron_axe: 1 },   dur: 600,  need: 5, diff: 1.0, label: "forge an iron axe" },
};
export const RECIPE_IDS = Object.keys(RECIPES);
export const LIGHT_DUR = 120;               // ticks to light a kiln or mound (the lighter's own work)
export const PICK_X = 1.6;                  // a copper pick: tools are 1.5-5x (§14.4); a CAPABILITY too (it is made at the bench by a new job, and wears out). gear.js PICKS: cast 1.9, iron 2.4 (and deep rock)
export const PICK_USES = [40, 120];         // cells dug before it wears out, by quality 0..1 (copper)
export const JAR_CAP = 60, JAR_FETCH = 24;  // sips a water jar holds, and one trip's worth (a sip is one tick of drinking: a full drink is about 5)
export const BENCH_BAND = 0.15;             // a workshop's quality bonus is capped at +-15% (GDD §12.5)

const toolValue = (rc) => Object.keys(rc.out).reduce((a, k) => a + rc.out[k] * (VALUE[k] || 0.1), 0);

/** Stations that burn a batch by themselves (light -> bn countdown -> finish). */
export const BURNERS = ["kiln", "mound", "smoker", "forge"];
export const stations = (sim, f) => sim.ents.ofKind("furniture").filter(e => e.f === f);

/** Quality 0..1 (GDD §14.4): 0.5 + 0.5 x skill + the room's offset (workbench in a workshop only). */
export function makeQuality(sim, v, st) {
  const room = st && st.f === "workbench" ? sim.rooms.at(st.x, st.y, st.z) : null;
  const off = room && room.purpose === "workshop" ? roomOffset(sim, room) : 0;
  return Math.round(clamp(0.5 + 0.5 * level(v, "craft") + off, 0, 1) * 100) / 100;
}
/** A workshop's quality offset: (room quality - 0.5) scaled, capped at +-15% (§12.5). */
export function roomOffset(sim, room) {
  return clamp((evaluate(sim, room).quality - 0.5) * 0.3, -BENCH_BAND, BENCH_BAND);
}
export const QWORD = (q) => (q < 0.35 ? "crude" : q < 0.6 ? "serviceable" : q < 0.8 ? "good" : "fine");

/** The heat level a station reaches right now with the recipe's fuel. */
export function recipeHeat(sim, st, rc) { return rc.fire ? smokeFire(sim, st) : rc.fuel ? stationHeat(sim, st, rc.fuel).level : 0; }
/** Does the heat fit the recipe? -> null or "TOO_COLD" (a mound that is too hot for a smoulder does not occur: it is sealed). */
export function heatOk(sim, st, rc) {
  if (!rc.fuel && !rc.fire) return null;
  const lv = recipeHeat(sim, st, rc);
  return lv < rc.need || (rc.max !== undefined && lv > rc.max) ? "TOO_COLD" : null;
}

/** What is still to be loaded into a station for this recipe: {item: n} (empty = ready). A station holding another recipe's load is not free. */
export function missing(st, rc) {
  const out = {};
  for (const k of Object.keys(rc.inputs)) { const n = rc.inputs[k] - ((st.inv && st.inv[k]) || 0); if (n > 0) out[k] = n; }
  return out;
}
export const STALE_LOAD = 1800;      // ticks (a game day) an unlit load may sit in a station that nobody finished
/** May recipe `key` use this station? Yes if it is empty or loaded for `key`; with a tick, also if it has held another recipe's load unlit for a day (the job that loaded it was called off: S16 found a workbench stuck for good that way). */
export const loadedFor = (st, key, t) => !st.rcp || st.rcp === key || (t !== undefined && !(st.bn > 0) && t - (st.lt || 0) >= STALE_LOAD);

/** The phenomenon context of a batch (what the matcher sees, same shape as a tinker's). */
export function batchCtx(st, rc, lv) {
  const tags = [];
  for (const k of Object.keys(rc.inputs)) for (const t of tagsOf(k)) if (!tags.includes(t)) tags.push(t);
  const ctx = { tags, src: st.f === "smoker" ? "smoke" : "pit", heat: lv, enclosed: st.f === "mound" || st.f === "smoker" || st.lid > 0, duration: rc.dur };
  if (rc.air) ctx.dry = 1;                                                   // light() only starts an air-dried batch in dry air
  return ctx;
}

// ---- burning ---------------------------------------------------------------------------------------------------------

/** The lighter strikes it: the loaded inputs burn for `dur` ticks (the batch is out of everyone's hands until then). Returns null or a blocker. */
export function light(sim, v, st, key) {
  const rc = RECIPES[key];
  if (!rc || st.bn > 0) return "RESERVED";
  if (!can(sim, rc.craft)) return "UNKNOWN_CRAFT";
  if (Object.keys(missing(st, rc)).length) return "NO_MATERIAL";
  if (heatOk(sim, st, rc)) return "TOO_COLD";
  if (rc.air && !dryAir(sim, st)) return "NO_SEASON";
  st.rcp = key; st.bn = rc.dur; st.bt = rc.dur; st.lv = recipeHeat(sim, st, rc); st.by = v.id; st.fq = makeQuality(sim, v, st);
  sim.cache.iv++;
  return null;
}

/** Every 20 ticks: lit stations count down; a finished batch yields. */
export function stationsTick(sim) {
  for (const st of sim.ents.ofKind("furniture")) {
    if (!BURNERS.includes(st.f) || !(st.bn > 0)) continue;
    st.bn -= 20;
    if (st.bn <= 0) finish(sim, st);
  }
}

function spend(st, rc) { for (const k of Object.keys(rc.inputs)) { st.inv[k] = (st.inv[k] || 0) - rc.inputs[k]; if (st.inv[k] <= 0) delete st.inv[k]; } if (!Object.keys(st.inv).length) st.rcp = ""; }

/** A batch ends: products, XP, phenomena, the chronicle. The fire must still be hot enough (a bellows pulled away mid-burn spoils the batch). */
export function finish(sim, st) {
  const rc = RECIPES[st.rcp], by = sim.ents.get(st.by) || null;
  st.bn = 0;
  if (!rc) return;
  const lv = recipeHeat(sim, st, rc), bad = heatOk(sim, st, rc);
  spend(st, rc);
  sim.cache.iv++;
  if (bad) { log(sim, "MILESTONE", "A batch in the " + ({ mound: "mound", smoker: "covered rack", forge: "forge" }[st.f] || "kiln") + " came out spoiled: the fire was not right for it.", by ? [by.id] : [], { x: st.x, y: st.y }, 1); return; }
  for (const k of Object.keys(rc.out)) dropLoose(sim, k, rc.out[k], st.x, st.y, st.z, st.fq || undefined);
  settle(sim, st, rc, by, lv);
}

/** XP, familiarity, the phenomena that fired, and the firsts. */
function settle(sim, st, rc, by, lv) {
  const site = { key: st.f + ":" + st.id, id: st.id, kind: st.f, src: st.f === "smoker" ? "smoke" : "pit", x: st.x, y: st.y, z: st.z, heat: lv };
  const ctx = batchCtx(st, rc, lv);
  if (by && sim.ents.get(by.id)) {
    for (const row of activeRows()) if (matches(row, ctx).ok) observe(sim, row, site, by);
    gain(sim, by, "craft", toolValue(rc), true, rc.diff);
    useCraft(sim, by, rc.craft);
  }
  const first = { fired_clay: ["firstFired", "The first fired clay came out of the kiln."], charcoal: ["firstCharcoal", "The first charcoal was drawn from a mound."],
    copper: ["firstCopper", "The first copper ingots were drawn from the kiln."], jar: ["firstJar", "The first clay jar was fired."],
    brick: ["firstBrick", "The first bricks came out of the kiln."], smoked_meat: ["firstSmoked", "The first smoked meat hung ready for winter."], dried_meat: ["firstDried", "The first wind-dried meat hung ready for winter."], iron: ["firstIron", "The first iron was drawn from the forge."],
    copper_axe: ["firstCast", "The first casting came out of its mould."], cast_pick: ["firstCast", "The first casting came out of its mould."], iron_pick: ["firstIronTool", "The first iron tool was forged."], iron_axe: ["firstIronTool", "The first iron tool was forged."] };
  for (const k of Object.keys(rc.out)) if (first[k]) once(sim, first[k][0], "BUILT_FIRST", first[k][1], by ? [by.id] : [], {}, 1);
}

/** The bench finishes a piece of work (verb `make`): inputs consumed, product dropped, XP. */
export function makeAtBench(sim, v, st, key) {
  const rc = RECIPES[key];
  if (!rc || !rc.work) return "GONE";
  if (!can(sim, rc.craft)) return "UNKNOWN_CRAFT";
  if (Object.keys(missing(st, rc)).length) return "NO_MATERIAL";
  const q = makeQuality(sim, v, st);
  spend(st, rc);
  for (const k of Object.keys(rc.out)) { if (WAGON_OUT[k]) spawnWagon(sim, WAGON_OUT[k], st.x, st.y, st.z); else dropLoose(sim, k, rc.out[k], st.x, st.y, st.z, q); }      // S15: a wagon is made as an entity
  gain(sim, v, "craft", toolValue(rc), true, rc.diff);
  useCraft(sim, v, rc.craft);
  const firstMade = { copper_spear: ["firstSpear", "made the first copper spear."], copper_pick: ["firstTool", "made the first copper pick."], backpack: ["firstPack", "sewed the first backpack: more fits in the arms."],
    basket: ["firstBasket", "wove the first basket."], leather: ["firstLeather", "worked the first hide."], cordage: ["firstCord", "twisted the first cord."], block: ["firstBlock", "dressed the first stone block."],
    stone_axe: ["firstAxe", "made the first stone axe."], salted_meat: ["firstSalted", "salted the first meat."], dried_peat: ["firstPeat", "stacked the first peat to dry."], herbal_remedy: ["firstRem", "steeped the first herbal remedy."], bone_axe: ["firstBoneAxe", "made the first bone axe."], timber: ["firstTimber", "framed the first timber."], sheet: ["firstSheet", "hammered the first copper sheet."], wheel: ["firstWheel", "framed the first wheels."], wagon: ["firstWagon", "built the first wagon: a long haul needs fewer trips."], cart: ["firstCart", "built the first animal cart: a penned grazer can pull it."], mould: ["firstMould", "shaped the first clay mould."], fitting: ["firstFitting", "made the first copper fittings."] };
  if (firstMade[key]) once(sim, firstMade[key][0], "BUILT_FIRST", v.name + " " + firstMade[key][1], [v.id], {}, 2);
  if (key === "sheet" || key === "fitting") sight(sim, "HAMMER_NATIVE", "bench", st.x, st.y, st.z, v);
  sim.cache.iv++;
  return null;
}

// ---- tools: picks (copper -> cast -> iron) ---------------------------------------------------------------------------

/** Cells dug before a tool wears out, by quality (a pick by its tier, gear.js; a spear is SPEAR_USES). */
export const pickUses = (q, item = "copper_pick") => { const u = (PICKS[item] || PICKS.copper_pick).uses; return Math.round(u[0] + (u[1] - u[0]) * clamp(q === undefined ? 0.5 : q, 0, 1)); };
export const toolUses = (item, q) => (item === "copper_spear" ? SPEAR_USES : pickUses(q, item));
/** A dig finished with a pick in hand: it wears. */
export function wearPick(sim, v) {
  if (!v.eq || !PICKS[v.eq.item]) return;
  v.eq.u--;
  if (v.eq.u <= 0) {
    log(sim, "MILESTONE", v.name + "'s " + v.eq.item.replace("_", " ") + " wore out.", [v.id], {}, 0);
    v.eq = null;
    sim.disc.worn = (sim.disc.worn || 0) + 1;
  }
}
/** Digging speed multiplier of what v holds. */
export const toolRate = (v, verb) => (verb === "dig" && v.eq && PICKS[v.eq.item] ? PICKS[v.eq.item].rate : 1);
