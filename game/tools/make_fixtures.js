// Writes deterministic saves at key moments to tests/fixtures/<name>.json (one seed). This is the ONE long run;
// feature tests load a fixture and run a short window instead of replaying a year (see tests/README.md).
//   node tools/make_fixtures.js [name...]      (no names = all; a lone name still regenerates the whole run)
// Later stages add fixtures by appending to FIXTURES below (a name, and how to reach it).
import "../tests/legacy.js";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Sim } from "../src/sim/sim.js";
import { toJSON, restore } from "../src/sim/save.js";
import { M, F } from "../src/sim/world.js";
import { rampCells } from "../src/sim/mine.js";
import { look } from "../src/sim/seen.js";
import { storeInZone, inZone } from "../src/sim/items.js";
import { World } from "../src/sim/world.js";
import { seenAt } from "../src/sim/seen.js";
import { dayF, WINTER_START } from "../src/sim/season.js";
import { shelterBot } from "../tests/bots/shelter_plan.js";
import { grant, can, eraOf, erasHeld } from "../src/sim/knowledge.js";
import { hearths, fireTick } from "../src/sim/fire.js";
import { findSite } from "../src/sim/board.js";
import { isAdult } from "../src/sim/villager.js";
import { flatSpot, clearArea } from "../tests/helpers.js";
import { initFauna, spawnFauna } from "../src/sim/fauna.js";
import { CROP } from "../src/sim/farm.js";
import { DAY as DAY_TICKS, DUR_DAY } from "../src/sim/clock.js";
import { newDepth } from "../src/sim/depth.js";
import { coresNear } from "../src/sim/core.js";
import { dungeonOf, trapList, reachable, standable } from "../src/sim/dungeon.js";
import { coreKey } from "../src/sim/core.js";
import { guardianSlain } from "../src/sim/cm.js";

export const SEED = 7;
export const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures");
const YEAR = 100 * DAY_TICKS;

/**
 * A shaft dug straight into the soft rock east of camp (instantly, as if dug and walked): a stair of 6 levels, then a
 * tunnel of 6 cells at the foot. The tunnel's end wall is an exposed malachite face (3 cells, SEEN), flint nodules show in
 * the walls where the soft rock has them, and a second malachite pocket sits 3 cells behind it in rock nobody has seen.
 * Returns the facts tests need.
 */
export function carveMine(sim) {
  const w = sim.world, SITE = sim.site;
  let x = SITE.x + 11, y = SITE.y - 1, z0 = -1;
  for (; x < SITE.x + 24; x += 2) {            // first column with open ground, no tree on the stair, rock under it
    z0 = w.standZ(x, y);
    const cells = z0 > 0 ? rampCells(sim, x, y, z0, 6, [1, 0]) : null;
    const clear = cells && [1, 2, 3, 4, 5, 6].every(i => !sim.ents.at(x + i, y, z0 - i + 1).length && !sim.ents.at(x + i, y, z0 - i).length && !sim.ents.at(x + i, y, z0 - i + 2).length);
    if (clear) break;
    z0 = -1;
  }
  if (z0 < 0) throw new Error("no place for the mine fixture");
  const open = (cx, cy, cz) => { if (w.isSolid(cx, cy, cz)) w.set(cx, cy, cz, M.AIR, w.flags(cx, cy, cz) & ~F.PLAYER); look(sim, cx, cy, cz); };
  for (const i of rampCells(sim, x, y, z0, 6, [1, 0])) { const [a, b, c] = World.xyz(i); open(a, b, c); }
  const zb = z0 - 6, xs = x + 6;               // the foot of the stair, and the tunnel runs east from it
  for (let k = 1; k <= 6; k++) open(xs + k, y, zb);
  const head = xs + 6;
  for (let dy = -1; dy <= 1; dy++) { w.set(head + 1, y + dy, zb, M.MALACHITE, 0); }     // the exposed face
  w.set(head + 1, y, zb + 1, M.MALACHITE, 0);
  look(sim, head, y, zb);                       // standing at the head, they see the face (and the walls around it)
  for (let dx = 0; dx < 3; dx++) for (let dy = -1; dy <= 1; dy++) w.set(head + 4 + dx, y + dy, zb, M.MALACHITE, 0);   // the hidden pocket, behind two cells of plain rock
  return { x, y, z0, zb, head, face: [head + 1, y, zb], hidden: [head + 4, y, zb] };
}

/** The mine fixture's exposed malachite face and the hidden pocket three cells behind it (found, not hard-coded: they move with the world). */
export function mineSpots(sim) {
  const w = sim.world, S = sim.site;
  for (let y = S.y - 14; y < S.y + 16; y++) for (let x = S.x + 6; x < S.x + 56; x++) for (let z = 3; z < sim.stock.z - 3; z++) {
    if (w.mat(x, y, z) === M.MALACHITE && w.mat(x - 1, y, z) === M.AIR && w.mat(x + 3, y, z) === M.MALACHITE && w.mat(x + 2, y, z) !== M.AIR && seenAt(sim.seen, x, y, z)) return { FACE: [x, y, z], HID: [x + 3, y, z] };
  }
  throw new Error("no mine face");
}

/**
 * S7a: fire known (exactly two villagers hold FIRE_TENDING, 0.5 and 0.2), a burning hearth in camp with fuel, and logs and sticks in the
 * stockpile, a day before winter. Derived from `prewinter` (no extra run). Returns the hearth.
 */
export function prepFire(sim) {
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  // Exactly two holders (whoever learned it by day 74 is forgotten), so loss and spreading tests have something to lose and to teach.
  for (const v of sim.ents.ofKind("villager")) v.fam = {};
  sim.cache.kn = null;
  grant(sim, adults[0], "FIRE_TENDING", 0.5); grant(sim, adults[1], "FIRE_TENDING", 0.2);
  for (const s of sim.ents.ofKind("csite").filter(q => q.w === "hearth")) sim.ents.remove(s.id);
  let h = hearths(sim)[0];
  if (!h) {
    const st = findSite(sim, "hearth");
    h = sim.ents.add("furniture", { f: "hearth", x: st[0], y: st[1], z: st[2], owner: 0, rv: 0, rt: 0, fuel: 0, lit: 0, fi: "log", hl: 0 });
  }
  h.fuel = 3000; h.lit = 1; h.fi = "log";
  storeInZone(sim, "log", 10); storeInZone(sim, "stick", 20);
  storeInZone(sim, "dried", 30);                                   // S18b: a village at the end of autumn with a full winter larder, so it is not in a food crisis and its people are free to tinker
  sim.cache.iv++;
  fireTick(sim);                                          // heat level now
  return h;
}

/**
 * S7b: pottery known (adults 0 and 2 hold POTTERY, 0.5 and 0.2; adults 0 and 1 hold fire) and clay in stock. Derived from `hearth` (`settled` + prepFire: a mild season, so the chain tests run in ordinary weather). The village is in the Clay age.
 */
export function prepClay(sim) {
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  grant(sim, adults[0], "POTTERY", 0.5); grant(sim, adults[2], "POTTERY", 0.2);       // (adult 1 holds fire only: killing the potters leaves the Hearth age)
  storeInZone(sim, "clay", 12); storeInZone(sim, "dirt", 8); storeInZone(sim, "stick", 10);
  sim.cache.iv++;
}

/** A 3x3 patch of ground near camp cleared of plants and items, off the stockpile: the kiln goes at its centre. Returns {x, y, z}. */
export function kilnSpot(sim, skip = 0) {
  const [x0, y0, z] = flatSpot(sim, 3, 3, skip);
  clearArea(sim, x0, y0, 3, 3, z);
  return { x: x0 + 1, y: y0 + 1, z };
}
/** Put a station straight into the world (as if built). */
export function putStation(sim, f, x, y, z, extra = {}) {
  const base = { f, x, y, z, owner: 0, rv: 0, rt: 0 };
  const more = f === "kiln" || f === "mound" || f === "smoker" ? { lid: 0, inv: {}, rcp: "", bn: 0, bt: 0, lv: 0, by: 0, fq: 0 } : f === "forge" ? { lid: 2, inv: {}, rcp: "", bn: 0, bt: 0, lv: 0, by: 0, fq: 0 } : f === "workbench" ? { inv: {}, rcp: "" } : f === "waterjar" ? { fill: 0 } : {};
  sim.world.setFlags(x, y, z, sim.world.flags(x, y, z) | F.USED);
  sim.cache.iv++;
  return sim.ents.add("furniture", { ...base, ...more, ...extra });
}

/**
 * S7b: the copper kit. Derived from `clay`: charcoal and malachite in stock, a kiln built on flat ground (no draft yet: it tops out at the Kiln level with
 * charcoal), POTTERY, KILN and CHARCOAL known, SMELTING known by nobody.
 */
export function prepCopperReady(sim) {
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  grant(sim, adults[0], "KILN", 0.5); grant(sim, adults[2], "KILN", 0.2);
  grant(sim, adults[0], "CHARCOAL", 0.5); grant(sim, adults[2], "CHARCOAL", 0.2);
  storeInZone(sim, "charcoal", 10); storeInZone(sim, "malachite", 12); storeInZone(sim, "fired_clay", 4); storeInZone(sim, "log", 10);
  const k = kilnSpot(sim);
  putStation(sim, "kiln", k.x, k.y, k.z);
  sim.cache.iv++;
  return k;
}

/** A free standable cell within `r` of (x,y,z), not on the stockpile, no entity on it; nearest first. */
function freeNear(sim, x, y, z, r = 3, skip = []) {
  for (let d = 1; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
    const cx = x + dx, cy = y + dy;
    if (sim.world.standZ(cx, cy) !== z || sim.ents.at(cx, cy, z).length || skip.some(q => q[0] === cx && q[1] === cy)) continue;
    if (cx >= sim.stock.x0 - 1 && cx <= sim.stock.x1 + 1 && cy >= sim.stock.y0 - 1 && cy <= sim.stock.y1 + 1) continue;
    return [cx, cy, z];
  }
  return null;
}

/** Take whole kinds out of the stockpile (a derived fixture that adds stock must leave room: the last quarter of the cells is for food, so an over-full yard strands carriers with NO_STORAGE). */
function clearStock(sim, kinds) {
  for (const s of sim.ents.ofKind("item").slice()) if (kinds.includes(s.item) && inZone(sim.stock, s.x, s.y)) sim.ents.remove(s.id);
  sim.cache.iv++;
}

/**
 * S9: hand work. Derived from `hearth`: nobody knows stone dressing, cordage, hides, framing, smoking, a bench stands by the camp, a covered rack stands beside the lit hearth,
 * and the stockpile holds stone, flint, grass, hides, logs, sticks and raw meat (a fresh hunt). Returns {bench, smoker, hearth}.
 */
export function prepWorkshop(sim) {
  const h = hearths(sim)[0];
  const sp = flatSpot(sim, 3, 3, 1); clearArea(sim, sp[0], sp[1], 3, 3, sp[2]);
  const bench = putStation(sim, "workbench", sp[0] + 1, sp[1] + 1, sp[2]);
  const at = freeNear(sim, h.x, h.y, h.z, 2);
  const smoker = at ? putStation(sim, "smoker", at[0], at[1], at[2]) : null;
  storeInZone(sim, "stone", 16); storeInZone(sim, "flint", 6); storeInZone(sim, "grass", 20); storeInZone(sim, "hide", 6);
  storeInZone(sim, "log", 4); storeInZone(sim, "hopper_meat", 8);
  sim.cache.iv++;
  return { bench, smoker, hearth: h };
}

/**
 * S14: world depth. Derived from `workshop` (hearth, bench, covered rack, raw meat): the S14 content is switched on (illness, wolves and grazers when they are spawned, the
 * alternates' discovery rows, perturbed properties) in this meadow-only map, and the stockpile holds salt, peat, marsh herb and bone for the alternate recipes.
 * The wild-2 flag is set so no pack or herd is spawned unasked: a test places its own. Returns {bench, smoker, hearth}.
 */
export function prepDepth(sim) {
  const r = prepWorkshop(sim);
  sim.dp = newDepth(1);
  sim.wild.i2 = 1;
  clearStock(sim, ["stone", "grass", "hide"]);                                   // (room in the yard: a non-food keep-N needs free cells)
  storeInZone(sim, "salt", 6); storeInZone(sim, "peat", 8); storeInZone(sim, "herb", 6); storeInZone(sim, "bone", 6);
  sim.cache.iv++;
  return r;
}

/**
 * S9: copper age. Derived from `copperready`: SMELTING known by adults 0 and 2, ten copper ingots, charcoal and fired clay in stock, a bellows beside the kiln (heat 4 on charcoal),
 * and a workbench; nobody can cast or hammer. Returns {kiln, bench}.
 */
export function prepCopperAge(sim) {
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  grant(sim, adults[0], "SMELTING", 0.5); grant(sim, adults[2], "SMELTING", 0.2);
  const kiln = sim.ents.ofKind("furniture").find(f => f.f === "kiln");
  const nb = freeNear(sim, kiln.x, kiln.y, kiln.z, 1);
  putStation(sim, "bellows", nb[0], nb[1], nb[2]);
  const sp = flatSpot(sim, 3, 3, 1); clearArea(sim, sp[0], sp[1], 3, 3, sp[2]);
  const bench = putStation(sim, "workbench", sp[0] + 1, sp[1] + 1, sp[2]);
  clearStock(sim, ["clay", "dirt", "malachite"]);                                 // (room in the yard)
  storeInZone(sim, "copper", 12); storeInZone(sim, "fired_clay", 4); storeInZone(sim, "stick", 10);          // (S16: 8 -> 12 copper: the hammering and casting experiments eat some, and a cast pick needs 3 after them; on the new land 8 sometimes left 2)
  sim.cache.iv++;
  return { kiln, bench };
}

/**
 * S9: iron ready. Derived from `copperage`: KILN known, twelve bricks, twelve iron ore and twelve coal in stock, a brick forge built on flat ground with a bellows beside it (heat 5 on coal),
 * and the kiln's bellows left in place; nobody can smelt iron. Returns the forge.
 */
export function prepIronReady(sim) {
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  grant(sim, adults[0], "KILN", 0.5); grant(sim, adults[2], "KILN", 0.2);
  clearStock(sim, ["fired_clay", "charcoal"]);
  storeInZone(sim, "brick", 8); storeInZone(sim, "iron_ore", 16); storeInZone(sim, "coal", 16); storeInZone(sim, "charcoal", 4);      // (S10: 16 each, not 10: the welding try is chance, and ten ore ran out after about six tries)
  const sp = flatSpot(sim, 3, 3, 2); clearArea(sim, sp[0], sp[1], 3, 3, sp[2]);
  const forge = putStation(sim, "forge", sp[0] + 1, sp[1] + 1, sp[2]);
  putStation(sim, "bellows", sp[0] + 2, sp[1] + 1, sp[2]);
  sim.cache.iv++;
  return forge;
}

/**
 * S8: the thornback near the village. Derived from `settled`: the creatures are placed, then the thornback is moved out of its cave onto the
 * meadow 18 cells east of camp, just outside fear range of the stockpile (its home is where it stands, so it patrols there and bites anyone within 5 cells), and a copper spear sits in the
 * stockpile. The cave itself stays a restricted lair. Returns the thornback.
 */
export function prepThornback(sim) {
  initFauna(sim);
  const tb = sim.ents.ofKind("fauna").find(e => e.sp === "thornback");
  const w = sim.world;
  let at = null;
  for (let r = 18; r < 28 && !at; r++) for (let dy = 0; dy < 8 && !at; dy++) {
    for (const sy of [1, -1]) {
      const x = sim.site.x + r, y = sim.site.y + sy * dy, z = w.standZ(x, y);
      if (z >= 0 && z <= w.standZ(sim.site.x, sim.site.y) + 1 && !sim.ents.at(x, y, z).length) { at = [x, y, z]; break; }
    }
  }
  if (!at) throw new Error("no meadow for the thornback fixture");
  sim.ents.move(tb, at[0], at[1], at[2]); tb.home = at.slice(); tb.st = "patrol";
  storeInZone(sim, "copper_spear", 1);
  sim.cache.iv++;
  return tb;
}

/**
 * S8: ready for an expedition. Derived from `settled` (or a fresh sim of another seed, for the multi-seed property): the creatures are placed,
 * food and water are in hand, the stockpile holds berries. Returns the crew: the first three adults.
 */
export function prepExpedition(sim) {
  initFauna(sim);
  storeInZone(sim, "berry", 30);
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  for (const v of adults) { v.hunger = v.thirst = v.energy = 1; }
  sim.cache.iv++;
  return adults.slice(0, 3).map(v => v.id);
}

/**
 * S11: a village of 60. Derived from `settled`: extra adults are SPAWNED round the camp (not bred over years) up to `n`, with food in the yard and a bed each,
 * so a day at this size tests the board, the strip and the panels. Returns the villager ids.
 */
export function prepCrowd(sim, n = 60) {
  let guard = 0;
  while (sim.ents.ofKind("villager").length < n && guard++ < 400) sim.spawnVillager();
  const vs = sim.ents.ofKind("villager");
  for (const v of vs) { v.hunger = v.thirst = v.energy = 1; }
  storeInZone(sim, "dried", 40); storeInZone(sim, "berry", 40); storeInZone(sim, "tuber", 30);
  sim.cache.iv++;
  return vs.map(v => v.id);
}

/**
 * S10: farming known (adults 0 and 1 hold CULTIVATION), seed in the stockpile, and a 6x4 field beside the camp: row 0 sown and almost ripe (watered),
 * row 1 tilled and empty, rows 2-3 raw ground. Derived from `settled`. Returns {field, spot}.
 */
export function prepFarm(sim) {
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  grant(sim, adults[0], "CULTIVATION", 0.5); grant(sim, adults[1], "CULTIVATION", 0.2);
  const sp = flatSpot(sim, 6, 4, 1); clearArea(sim, sp[0], sp[1], 6, 4, sp[2]);
  if (!sim.apply({ type: "field", x0: sp[0], y0: sp[1], x1: sp[0] + 5, y1: sp[1] + 3, z: sp[2] })) throw new Error("no field for the farm fixture: " + sim.lastBlocker);
  const field = sim.farm.fields[sim.farm.fields.length - 1];
  for (const p of sim.ents.ofKind("plot")) {
    const row = p.y - sp[1];
    if (row <= 1) p.tl = 1;
    if (row === 0) { p.cr = "berry"; p.gr = CROP.berry.days - 1; p.wt = sim.tick + 3 * DUR_DAY; }
  }
  storeInZone(sim, "berry", 16); storeInZone(sim, "tuber", 10);
  sim.cache.iv++;
  return { field, spot: sp };
}

/**
 * S10: husbandry known (adults 0 and 1 hold HUSBANDRY), a finished 4x3 pen beside the camp with three adult tame hoppers and fodder, grass and sticks in
 * the stockpile. Derived from `settled`. Returns {pen, hoppers}.
 */
export function prepPen(sim) {
  initFauna(sim);                                          // the wild herd (and the thornback) exist before the pen's hoppers do
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  grant(sim, adults[0], "HUSBANDRY", 0.5); grant(sim, adults[1], "HUSBANDRY", 0.2);
  const sp = flatSpot(sim, 4, 3, 1); clearArea(sim, sp[0], sp[1], 4, 3, sp[2]);
  if (!sim.apply({ type: "pen", x0: sp[0], y0: sp[1], x1: sp[0] + 3, y1: sp[1] + 2, z: sp[2] })) throw new Error("no pen for the pen fixture: " + sim.lastBlocker);
  const pen = sim.farm.pens[sim.farm.pens.length - 1];
  pen.built = 1; pen.got = pen.need; pen.fod = 6;
  const hoppers = [];
  for (let i = 0; i < 3; i++) {
    const h = spawnFauna(sim, "hopper", sp[0] + i, sp[1] + 1, sp[2]);
    h.tame = 1; h.pen = pen.id; h.bd = sim.tick - 12 * DUR_DAY; h.home = [h.x, h.y, h.z];
    hoppers.push(h);
  }
  storeInZone(sim, "grass", 20); storeInZone(sim, "stick", 20);
  sim.cache.iv++;
  return { pen, hoppers };
}

/**
 * S15: settlement depth. Derived from `pen` (a finished 4x3 pen with fodder and three tame hoppers beside the camp): FRAMING known by two adults, a workbench by the camp,
 * a tame grazer in the pen (a cart's animal), and the stockpile holds timber, wheels, cordage, sticks, raw meat and tubers for the wagon and kitchen scenarios.
 * Returns {bench, pen, grazer}.
 */
export function prepSettle(sim) {
  const adults = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
  grant(sim, adults[0], "FRAMING", 0.5); grant(sim, adults[1], "FRAMING", 0.2);
  const pen = sim.farm.pens[sim.farm.pens.length - 1];
  const g = spawnFauna(sim, "grazer", pen.x0 + 3, pen.y0, pen.z);
  g.tame = 1; g.pen = pen.id; g.bd = sim.tick - 12 * DUR_DAY; g.home = [g.x, g.y, g.z];
  const sp = flatSpot(sim, 3, 3, 2); clearArea(sim, sp[0], sp[1], 3, 3, sp[2]);
  const bench = putStation(sim, "workbench", sp[0] + 1, sp[1] + 1, sp[2]);
  clearStock(sim, ["stick", "grass"]);
  storeInZone(sim, "timber", 12); storeInZone(sim, "wheel", 8); storeInZone(sim, "cordage", 6); storeInZone(sim, "stick", 10);
  storeInZone(sim, "hopper_meat", 8); storeInZone(sim, "tuber", 8);
  sim.cache.iv++;
  return { bench, pen, grazer: g };
}

/**
 * 7.22: monsters beside the camp. Derived from `settled`: a swarm of four cave crawlers and a spitter stand on the meadow about 12 cells east of the stockpile, a spear in stock, everybody fed.
 * There is no mana within 66 cells of a camp, so these are hand-placed: they carry `hr` (a home radius that stands in for the band >= 1 territory they would have in real mana) and `mon`,
 * and their home is where they stand, so they raid the camp (a crawler's home within RAID_R of the camp). Returns {crawlers: [ids], spitter: id, at}.
 */
export function prepMonsters(sim) {
  const w = sim.world, sz = w.standZ(sim.site.x, sim.site.y);
  let at = null;
  for (let r = 12; r < 22 && !at; r++) for (let dy = 0; dy < 8 && !at; dy++) for (const sy of [1, -1]) {
    const x = sim.site.x + r, y = sim.site.y + sy * dy, z = w.standZ(x, y);
    if (z >= 0 && z <= sz + 1 && !sim.ents.at(x, y, z).length) { at = [x, y, z]; break; }
  }
  if (!at) throw new Error("no meadow for the monsters fixture");
  const made = [], want = ["crawler", "crawler", "crawler", "crawler", "spitter"];
  for (let r = 0; r < 4 && made.length < want.length; r++) for (let dy = -r; dy <= r && made.length < want.length; dy++) for (let dx = -r; dx <= r && made.length < want.length; dx++) {
    const x = at[0] + dx, y = at[1] + dy, z = w.standZ(x, y);
    if (z < 0 || Math.abs(z - at[2]) > 1 || sim.ents.at(x, y, z).length) continue;
    const e = spawnFauna(sim, want[made.length], x, y, z);
    e.mon = 1; e.hr = 24; e.home = at.slice(); e.st = "patrol";
    made.push(e);
  }
  storeInZone(sim, "copper_spear", 2);
  for (const v of sim.ents.ofKind("villager")) { v.hunger = v.thirst = v.energy = 1; v.hp = 100; v.fear = 0; v.carry = null; }       // (empty hands: a villager carrying berries cannot take a spear)
  sim.cache.iv++;
  return { crawlers: made.filter(e => e.sp === "crawler").map(e => e.id), spitter: made.find(e => e.sp === "spitter").id, at };
}

/**
 * 7.21: a labyrinth, and a villager two cells from a hidden dart trap at the far end of a straight corridor (a trap in a corridor, so a seen one blocks it), a second villager
 * beside a hidden trap of another kind, and everybody fed. Derived from `settled`; the dungeon is the nearest one to the camp that has the shape. The villagers stand on cells of the labyrinth
 * with their chunks activated by the sim as it runs. Returns {dun, a: {id, trap}, b: {id, trap}} (trap = {x, y, z, k}).
 */
export function prepTrap(sim) {
  const def = sim.def, sp = sim.site, w = sim.world;
  const cs = coresNear(def, sp.x - 800, sp.y - 800, sp.x + 800, sp.y + 800, 0).map(c => [c, dungeonOf(def, c)]).filter(q => q[1])
    .sort((p, q) => Math.hypot(p[0].x - sp.x, p[0].y - sp.y) - Math.hypot(q[0].x - sp.x, q[0].y - sp.y));
  const line = (dun, t) => {                                           // a straight run: two stand cells west of the trap, and east of it
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const c1 = [t.x + dx, t.y + dy, t.z], c2 = [t.x + 2 * dx, t.y + 2 * dy, t.z];
      if (standable(dun, ...c1) && standable(dun, ...c2) && !dun.traps.has((t.z * dun.H + (c1[1] - dun.y0)) * dun.W + (c1[0] - dun.x0)) && !dun.traps.has((t.z * dun.H + (c2[1] - dun.y0)) * dun.W + (c2[0] - dun.x0))) return { at: c2, from: c1 };
    }
    return null;
  };
  for (const [core, dun] of cs) {
    const R = reachable(dun), ts = trapList(dun).filter(t => R.has(t.x, t.y, t.z));
    const a = ts.find(t => t.k === "dart" && line(dun, t)), b = ts.find(t => t.k !== "dart" && t !== a && line(dun, t) && Math.abs(t.x - (a ? a.x : 0)) + Math.abs(t.y - (a ? a.y : 0)) > 12);
    if (!a || !b) continue;
    const vs = sim.ents.ofKind("villager").filter(v => isAdult(sim, v));
    const place = (v, t) => { const l = line(dun, t); sim.ents.move(v, l.at[0], l.at[1], l.at[2]); look(sim, l.at[0], l.at[1], l.at[2]); };
    place(vs[0], a); place(vs[1], b);
    for (const v of sim.ents.ofKind("villager")) { v.hunger = v.thirst = v.energy = 1; v.hp = 100; }
    sim.cache.iv++;
    return { dun, a: { id: vs[0].id, trap: a }, b: { id: vs[1].id, trap: b }, core };
  }
  throw new Error("no labyrinth with the right traps near the camp for the trap fixture");
}

/** The labyrinths nearest the camp, nearest first: [{core, dun}]. */
function labyrinths(sim) {
  const def = sim.def, sp = sim.site;
  return coresNear(def, sp.x - 800, sp.y - 800, sp.x + 800, sp.y + 800, 0).map(c => [c, dungeonOf(def, c)]).filter(q => q[1])
    .sort((p, q) => Math.hypot(p[0].x - sp.x, p[0].y - sp.y) - Math.hypot(q[0].x - sp.x, q[0].y - sp.y)).map(([core, dun]) => ({ core, dun }));
}
function fedAll(sim) { for (const v of sim.ents.ofKind("villager")) { v.hunger = v.thirst = v.energy = 1; v.hp = 100; v.fear = 0; v.carry = null; } }

/**
 * 7.23: a crew at a labyrinth entrance. Derived from `settled`: the nearest labyrinth with at least 8 rooms, three adults standing on its first door (inside the labyrinth, as if they had walked in),
 * fed, with the surrounding rock already seen from the door. The test sends them with {type:"expedition", op:"start", kind:"delve", ids, core}. Returns {core: key, ids, ent}.
 */
export function prepDelve(sim) {
  const L = labyrinths(sim).find(q => q.dun.rooms.length >= 8 && q.dun.entrances.length);
  if (!L) throw new Error("no labyrinth for the delve fixture");
  const e = L.dun.entrances[0], vs = sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).slice(0, 3);
  const spots = [[e.x, e.y, e.z]];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) if (standable(L.dun, e.x + dx, e.y + dy, e.z)) spots.push([e.x + dx, e.y + dy, e.z]);
  vs.forEach((v, i) => { const c = spots[i % spots.length]; sim.ents.move(v, c[0], c[1], c[2]); look(sim, c[0], c[1], c[2]); });
  fedAll(sim); sim.cache.iv++;
  return { core: coreKey(L.core), ids: vs.map(v => v.id), ent: { x: e.x, y: e.y, z: e.z } };
}

/**
 * Experiment (notes/impl/MEMORY_SYSTEM.md): a cave beside the camp and two slimes at its mouth. Derived from `settled`. A stair of 6 levels goes down into the rock east of camp, then a tunnel of 44 cells
 * runs on east, all of it open natural ground and NOT yet seen (only what a walker sees is known). A cave crawler (made sturdier, 40 hp, so it lands a few blows) waits 14 cells along it. The first two adults stand at the stair head, fed, fit,
 * bare-handed (a blow is 12, so the 40 hp crawler takes a few and lands a few). Their temperament is set by the test. Returns {ids: [a, b], head: [x, y, z], tunnel: [x0, x1, y, z], crawler: id}.
 */
export function prepMemory(sim) {
  const w = sim.world, S = sim.site, len = 44;
  let x = S.x + 11, y = S.y - 3, z0 = -1;
  for (; x < S.x + 24 && z0 < 0; x += 2) {
    z0 = w.standZ(x, y);
    const cells = z0 > 0 ? rampCells(sim, x, y, z0, 6, [1, 0]) : null;
    let clear = !!cells;
    for (let i = 1; clear && i <= 6; i++) for (const dz of [0, 1, 2]) if (sim.ents.at(x + i, y, z0 - i + dz).length) clear = false;
    if (clear) { x -= 2; break; }
    z0 = -1;
  }
  if (z0 < 0) throw new Error("no place for the memory fixture");
  x += 2;
  const open = (cx, cy, cz) => { if (w.isSolid(cx, cy, cz)) w.set(cx, cy, cz, M.AIR, (w.flags(cx, cy, cz) & ~F.PLAYER) | F.NATURAL); };
  for (const i of rampCells(sim, x, y, z0, 6, [1, 0])) { const [a, b, c] = World.xyz(i); open(a, b, c); }
  const zb = z0 - 6, xs = x + 6;
  for (let k = 1; k <= len; k++) open(xs + k, y, zb);
  const vs = sim.ents.ofKind("villager").filter(q => isAdult(sim, q)).slice(0, 2);
  const spots = [[x - 1, y], [x - 1, y + 1], [x - 2, y], [x - 2, y + 1]].map(([a, b]) => [a, b, w.standZ(a, b)]).filter(c => c[2] >= 0);
  vs.forEach((v, i) => { sim.ents.move(v, ...spots[i]); v.eq = null; v.lk = null; });
  const cr = spawnFauna(sim, "crawler", xs + 14, y, zb);
  cr.mon = 1; cr.hp = cr.mhp = 40; cr.hr = 6; cr.home = [xs + 14, y, zb]; cr.st = "patrol";
  fedAll(sim); sim.cache.iv++;
  return { ids: vs.map(v => v.id), head: [x, y, z0], tunnel: [xs + 1, xs + len, y, zb], crawler: cr.id };
}

/** The labyrinth whose core chamber has room for a villager and a guardian: {core, dun, room, spots: [[x, y, z]...]} (stand cells of the chamber, nearest the core first). */
function chamberOf(sim) {
  for (const L of labyrinths(sim)) {
    const r = L.dun.rooms.find(q => q.kind === "core");
    if (!r) continue;
    const z = L.dun.s[r.j], spots = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (standable(L.dun, x, y, z) && (x !== L.core.x || y !== L.core.y)) spots.push([x, y, z]);
    spots.sort((a, b) => Math.abs(a[0] - L.core.x) + Math.abs(a[1] - L.core.y) - Math.abs(b[0] - L.core.x) - Math.abs(b[1] - L.core.y));
    if (spots.length >= 6) return { ...L, room: r, spots };
  }
  throw new Error("no core chamber for the guardian fixture");
}

/**
 * 7.23: a slime next to a weakened guardian. Derived from `settled`: the core chamber of the nearest labyrinth that has one, a villager standing in it, the guardian (as the spawner would have placed it,
 * `ck` = the core's key) two cells away with 15 hit points left, the villager fed and holding a copper spear. A test possesses the villager and strikes. Returns {core, id, guardian}.
 */
export function prepGuardian(sim) {
  const C = chamberOf(sim), v = sim.ents.ofKind("villager").find(q => isAdult(sim, q));
  const [vx, vy, vz] = C.spots[0], g = C.spots.find(c => Math.abs(c[0] - vx) + Math.abs(c[1] - vy) === 2) || C.spots[3];
  sim.ents.move(v, vx, vy, vz); look(sim, vx, vy, vz);
  const e = spawnFauna(sim, "guardian", g[0], g[1], g[2]);
  e.mon = 1; e.home = g.slice(); e.ck = coreKey(C.core); e.hp = 15; e.cd = 0;
  fedAll(sim); v.eq = { item: "copper_spear", u: 12 }; sim.cache.iv++;
  return { core: coreKey(C.core), id: v.id, guardian: e.id };
}

/**
 * 7.23: a slain guardian with the choice pending. Derived from `settled`: the same chamber, a villager in it, the guardian dead (remembered in `sim.wild.gk`, its deed in the chronicle) and the core
 * waiting on the player's answer (`sim.cm.pend`). Returns {core, id}.
 */
export function prepCoreSlain(sim) {
  const C = chamberOf(sim), v = sim.ents.ofKind("villager").find(q => isAdult(sim, q)), key = coreKey(C.core);
  const [vx, vy, vz] = C.spots[0];
  sim.ents.move(v, vx, vy, vz); look(sim, vx, vy, vz);
  (sim.wild.gk = sim.wild.gk || []).push(key);
  guardianSlain(sim, key, v);
  fedAll(sim); sim.cache.iv++;
  return { core: key, id: v.id };
}

/** name -> {run: sim ticks until this returns true (checked every tick), bot?: scripted player}. All from SEED. */
export const FIXTURES = {
  start: { until: () => true },
  settled: { until: (s) => s.tick >= 20 * DUR_DAY },
  prewinter: { until: (s) => s.tick > 50 * DAY_TICKS && dayF(s.tick) >= WINTER_START - 1 },
  midwinter: { until: (s) => s.tick > 50 * DAY_TICKS && dayF(s.tick) >= WINTER_START + 12 },
  year2: { until: (s) => s.tick >= YEAR },
  // S6: derived from `settled` (no extra run): a shaft into the soft rock with an exposed malachite face; and ore in the stockpile for S7's crafting.
  mine: { from: "settled", prep: carveMine },
  ores: { from: "settled", prep: (sim) => { storeInZone(sim, "flint", 12); storeInZone(sim, "clay", 12); storeInZone(sim, "malachite", 12); sim.cache.iv++; } },
  // S7a: fire known and a burning hearth in camp, a day before winter.
  fire: { from: "prewinter", prep: prepFire },
  // S7b: pottery known, clay in stock; then the copper kit (charcoal and malachite in stock, a kiln built, nobody knows smelting).
  hearth: { from: "settled", prep: prepFire },                         // summer, day ~24: fire known by two people, a lit hearth, nobody knows anything else
  clay: { from: "hearth", prep: prepClay },                            // + pottery known by the same two people, clay in stock
  copperready: { from: "clay", prep: prepCopperReady, chain: true },
  // S9: hand work (stone, fibre, hide, framing, smoking), the copper age (casting, hammering) and iron.
  workshop: { from: "hearth", prep: prepWorkshop },
  depth: { from: "workshop", prep: prepDepth },                        // S14: the same, with the world-depth content on and salt, peat, herb and bone in stock
  copperage: { from: "copperready", prep: prepCopperAge },
  ironready: { from: "copperage", prep: prepIronReady },
  // S8: the thornback on the meadow east of camp with a spear in stock; and a crew ready to go out.
  thornback: { from: "settled", prep: prepThornback },
  expedition: { from: "settled", prep: prepExpedition },
  // S10: farming known with a field in four states; husbandry known with a finished pen of tame hoppers.
  farm: { from: "settled", prep: prepFarm },
  pen: { from: "settled", prep: prepPen },
  settle: { from: "pen", prep: prepSettle },                           // S15: a bench, a penned grazer, FRAMING, timber and wheels, raw meat
  monsters: { from: "settled", prep: prepMonsters },                    // 7.22: four crawlers and a spitter on the meadow east of the stockpile, a spear in stock
  delve: { from: "settled", prep: prepDelve },                        // 7.23: three villagers on a labyrinth's first door, fed
  guardian: { from: "settled", prep: prepGuardian },                   // 7.23: a villager in the core chamber, the guardian two cells away with 15 hit points
  coreslain: { from: "settled", prep: prepCoreSlain },                  // 7.23: the guardian slain, the harvest-or-leave choice pending
  memory: { from: "settled", prep: prepMemory },                      // experiment: a cave (stair + 44-cell tunnel, unseen) east of camp, a crawler 14 cells in, two armed slimes at the stair head
  trap: { from: "settled", prep: prepTrap },                         // 7.21: two villagers in a labyrinth, each two cells from a hidden trap (a dart plate and another kind) in a straight corridor                           // S15: a bench, a penned grazer, FRAMING, timber and wheels, raw meat
  crowd: { from: "settled", prep: prepCrowd },                         // S11: 60 villagers (spawned adults) for the scale checks
  // 10.2 NATURAL saves: the sim played on by itself (seed 7 via year2, no player input, no edits; each is its own run of <= 5 min).
  // `autumn`: year2 (year-day 4) + 68 days = year-day 72, three days before winter. `midwinter3`: autumn + 15 days, year-day 87, the coldest stretch.
  autumn: { from: "year2", natural: true, days: 68, prep: (s) => runDays(s, 68) },
  midwinter3: { from: "autumn", natural: true, days: 15, prep: (s) => runDays(s, 15) },
  // A roofed shelter with beds, a stockpile and its purpose set, built by the scripted shelter player (separate run).
  hut: { bot: true, until: (s) => s.tick >= 14 * DUR_DAY && s.rooms.all().some(r => r.enclosed) },
};

/** 10.2: let the sim play on by itself (no input, no edits) for n game days. */
export function runDays(sim, n) { const end = sim.tick + n * DAY_TICKS; while (sim.tick < end) sim.step(); }

/**
 * S12: the played-through fixtures are written from a TIDIED copy: what the village's own hunts and sprouts taught it by now (farming, husbandry,
 * a hide and its skin Curiosity) is taken back, so a fixture is the same plain starting point the tests were written against ("nobody knows
 * farming at day 24") however the sim's behaviour has grown. The running sim is untouched.
 */
export function tidy(sim) {
  const t = restore(toJSON(sim));
  for (const v of t.ents.ofKind("villager")) { delete v.fam.CULTIVATION; delete v.fam.HUSBANDRY; delete v.fam.HIDE_WORKING; }
  for (const e of t.ents.ofKind("item").filter(i => i.item === "hide").slice()) t.ents.remove(e.id);
  t.disc.curio = t.disc.curio.filter(c => c.wild && c.id !== "wild:hopper");
  // S18b: with the flat clock the played-through village breeds on a 1800-tick rhythm and has 15-25 people by day 24 (it had 7-9); the tests are written for a small village, so a fixture keeps the eight longest-standing (lowest ids: the founders first) and the food stock is left as it is
  const vs = t.ents.ofKind("villager").slice();
  for (const v of vs.slice(8)) { if (v.bed) { const b = t.ents.get(v.bed); if (b) b.owner = 0; } t.ents.remove(v.id); }
  for (const v of t.ents.ofKind("villager")) { v.mate = vs.slice(0, 8).some(o => o.id === v.mate) ? v.mate : 0; v.par = v.par.map(id => id); }
  storeInZone(t, "dried", 24);                                                    // S18b: a fixture village is fed (no food demand pressing the standing orders): tests that are not about food do not wait on foraging
  t.disc.miss = {}; t.disc.dead = []; t.disc.cd = {};                            // S18b: the long free time of a 12000-tick day let the village tinker its way into near-misses and dead ends; a fixture starts with a clean slate of those
  t.wild.k = 0;                                                                   // hoppers hunted so far (the HUSBANDRY count)
  for (const c of ["CULTIVATION", "HUSBANDRY", "HIDE_WORKING"]) { delete t.disc.lost[c]; delete t.disc.sole[c]; delete t.chron.f["first_" + c]; }
  t.bps.list = t.bps.list.filter(b => b.name !== "Hide teepee"); if (t.disc.bpp) { delete t.disc.bpp.teepee; delete t.disc.bpp.hide; } delete t.chron.f.design_teepee; delete t.chron.f.design_hide;                // and the design hide working put in the Blueprints panel
  for (const v of t.ents.ofKind("villager")) v.ti = [];                           // S13: and the titles those firsts earned
  t.cache.kn = null; t.disc.era = eraOf(t); t.disc.eras = Object.fromEntries(erasHeld(t).map(l => [l, (t.disc.eras || {})[l] ?? 0])); t.cache.iv++;                           // S13: the era label follows what is still known
  return t;
}

function write(name, sim) {
  writeFileSync(join(DIR, name + ".json"), toJSON(sim));
  console.log("wrote " + name + " @tick " + sim.tick + " (day " + dayF(sim.tick).toFixed(1) + ")");
}

/** Write one derived fixture from its (already written) source. Entries are listed source-first, so the chain clay -> copperready works. */
export function makeDerived(name) {
  const f = FIXTURES[name], s = restore(readFileSync(join(DIR, f.from + ".json"), "utf8"));
  f.prep(s);
  write(name, s);
}

export function makeFixtures() {
  mkdirSync(DIR, { recursive: true });
  const sim = Sim.create(SEED);
  const main = Object.entries(FIXTURES).filter(([, f]) => !f.bot && !f.from);
  let i = 0;
  while (i < main.length) {
    if (main[i][1].until(sim)) { write(main[i][0], tidy(sim)); i++; continue; }
    sim.step();
  }
  for (const name of Object.keys(FIXTURES).filter(n => FIXTURES[n].from && !FIXTURES[n].natural)) makeDerived(name);      // cheap: a saved fixture plus a scripted edit
  for (const [name, f] of Object.entries(FIXTURES).filter(([, f]) => f.bot)) {
    const s = Sim.create(SEED), bot = shelterBot();
    for (let t = 0; t < YEAR && !f.until(s); t++) { bot(s); s.step(); }
    write(name, s);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // `natural` (or the names autumn / midwinter3) writes just the natural saves, each step its own run from the committed year2 file; no other fixture is touched.
  const names = process.argv.slice(2).filter(n => FIXTURES[n] && FIXTURES[n].natural);
  if (process.argv[2] === "natural") for (const n of Object.keys(FIXTURES).filter(n => FIXTURES[n].natural)) makeDerived(n);
  else if (names.length) for (const n of names) makeDerived(n);
  else makeFixtures();
}
