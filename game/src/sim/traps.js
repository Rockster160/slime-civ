// Traps, caches and ancient workshops at run time (7.21). dungeon.js says WHERE (pure rows); this file keeps what has happened to them.
//
//   sim.trp = {n, seen: [cell...], done: [cell...], gas: [[cell, until]...], ws: [[craft, x, y, z]...]}   (saved and hashed; cells are World.idx of the STAND cell, ascending)
//     seen   a villager has spotted the trap: it is marked (the cell gets F.OBSTACLE, so every path avoids it, the drawn glyph appears) until it is disarmed or goes off
//     done   the trap has gone off or been disarmed: it is gone for good
//     gas    a gas trap's cloud: bad air within GAS_R cells of the cell until the tick
//     ws     an ancient workshop somebody has stood in: its craft is "seen", which makes the craft much easier to rediscover (knowledge.js evidenceOf)
//
// A TRAP is a hazard, not a puzzle (data rows below). Hidden until a villager is near enough to notice: every tick within SPOT cells of it, a villager spots it with a
// chance that grows with intelligence and craft skill, and a light widens the distance (light.js sightAt). Anyone who steps on an unseen trap sets it off. Autonomous villagers
// never come here (lair.js: "dungeon"); the player delves by possession or by order. Disarming is a craft job (jobs.js genDisarm, tasks.js "disarm"): a skilled hand mostly
// succeeds and gets the trap's parts; a failure sets it off in their face.
import { World, M, F } from "./world.js";
import { dungeonAt, trapAt, cacheAt, lootAt, relicName, roomAt, trapList } from "./dungeon.js";
import { sightAt } from "./light.js";
import { dropLoose } from "./items.js";
import { kill } from "./population.js";
import { level } from "./skills.js";
import { once } from "./chronicle.js";
import { noteKnown } from "./cm.js";
import { CRAFT_IDS } from "./phenomena.js";
import { mix32 } from "./rng.js";

/** The trap rows. dmg = hit points; parts = what disarming gives; hard = how much harder than a plain task it is to disarm. */
export const TRAPS = {
  dart:     { label: "Darts",    dmg: 25, parts: 1, hard: 0.15 },
  pit:      { label: "Pit",      dmg: 20, parts: 1, hard: 0.25 },
  collapse: { label: "Collapse", dmg: 40, parts: 2, hard: 0.30 },
  gas:      { label: "Gas",      dmg: 12, parts: 1, hard: 0.20 },
};
export const TRAP_LABEL = Object.fromEntries(Object.entries(TRAPS).map(([k, t]) => [k, t.label]));
export const SPOT_BASE = 0.045;           // chance per tick that a villager of average mind spots a trap within sight
export const SPOT_SKILL = 0.05;           // ... plus this much at craft level 1
export const GAS_TICKS = 600;             // a gas cloud lingers this long
export const GAS_R = 2;                   // ... and fouls the air this far round the plate
export const FALL = 3;                    // a pit drops one level (levels are 3 cells apart)

export function newTrp() { return { n: 0, seen: [], done: [], gas: [], ws: [] }; }

const idx = World.idx;
function sorted(a, v) { let i = a.length; while (i > 0 && a[i - 1] > v) i--; if (i > 0 && a[i - 1] === v) return false; a.splice(i, 0, v); return true; }

/** Sets over seen / done, derived and rebuilt when the ledger changes (never saved). */
function sets(sim) {
  const k = sim.cache, t = sim.trp;
  if (!k.trs || k.trn !== t.n) { k.trs = { seen: new Set(t.seen), done: new Set(t.done) }; k.trn = t.n; k.trl = null; }
  return k.trs;
}
/** The dungeon holding the column (remembered between calls: a villager in a dungeon asks every tick). */
function dunAt(sim, x, y) {
  const k = sim.cache, d = k.dun;
  if (d && x >= d.bb.x0 && x <= d.bb.x1 && y >= d.bb.y0 && y <= d.bb.y1) return d;
  const n = dungeonAt(sim.def, x, y);
  if (n) k.dun = n;
  return n;
}

/** The trap at a stand cell that is still set (hidden or seen): its kind, or "". */
export function trapHere(sim, x, y, z) {
  const d = dunAt(sim, x, y);
  if (!d) return "";
  const k = trapAt(d, x, y, z);
  return k && !sets(sim).done.has(idx(x, y, z)) ? k : "";
}
export const isSeenTrap = (sim, x, y, z) => sets(sim).seen.has(idx(x, y, z)) && !sets(sim).done.has(idx(x, y, z));
/** A spotted, still-set trap in the column within a level of z (the click on a marked cell): {x, y, z, k} or null. */
export function seenTrapNear(sim, x, y, z) {
  for (const dz of [0, -1, 1]) { const k = trapHere(sim, x, y, z + dz); if (k && isSeenTrap(sim, x, y, z + dz)) return { x, y, z: z + dz, k }; }
  return null;
}
/** Every spotted, still-set trap: [{x, y, z, k}] (ascending by cell; the map draws these). */
export function seenTraps(sim) {
  sets(sim);
  const c = sim.cache;
  if (!c.trl) {
    c.trl = [];
    for (const ci of sim.trp.seen) { if (sim.trp.done.includes(ci)) continue; const [x, y, z] = World.xyz(ci), k = trapHere(sim, x, y, z); if (k) c.trl.push({ x, y, z, k }); }
  }
  return c.trl;
}
/** Live gas clouds: [{x, y, z}] (the map draws them; underground.js badAt counts them as foul air). */
export function gasClouds(sim) { return sim.trp.gas.filter(g => sim.tick < g[1]).map(g => { const [x, y, z] = World.xyz(g[0]); return { x, y, z }; }); }

/** Mark the trap at a stand cell as spotted (trapStep does this; exported for tests). */
export function spot(sim, x, y, z) {
  const ci = idx(x, y, z);
  if (!sorted(sim.trp.seen, ci)) return;
  sim.trp.n++;
  sim.world.setFlags(x, y, z, sim.world.flags(x, y, z) | F.OBSTACLE);            // a spotted trap blocks the path: everybody walks round it (or disarms it)
  sim.cache.iv++;
}
function finish(sim, x, y, z) {
  const ci = idx(x, y, z);
  sorted(sim.trp.done, ci); sim.trp.n++;
  const w = sim.world;
  if (w.flags(x, y, z) & F.OBSTACLE) w.setFlags(x, y, z, w.flags(x, y, z) & ~F.OBSTACLE);
  sim.cache.iv++;
}

/** Hit points lost; a villager at zero is dead. Returns true if they died. */
function hurt(sim, v, n, cause) {
  v.hp -= n; v.rp = 1;
  if (v.hp <= 0) { kill(sim, v, cause); return true; }
  return false;
}

/** A trap goes off under (or beside) villager v. */
export function springTrap(sim, v, x, y, z, k) {
  const row = TRAPS[k], w = sim.world;
  finish(sim, x, y, z);
  if (k === "dart") hurt(sim, v, row.dmg, "a dart trap");
  else if (k === "gas") { sim.trp.gas.push([idx(x, y, z), sim.tick + GAS_TICKS]); sim.trp.n++; hurt(sim, v, row.dmg, "bad air"); }
  else if (k === "pit") {
    if (hurt(sim, v, row.dmg, "a fall")) return;
    w.set(x, y, z - 1, M.AIR, (w.flags(x, y, z - 1) | F.NATURAL | F.DUNGEON) & ~F.PLAYER);        // the floor gives way: a shaft into the level below
    if (w.isWalkable(x, y, z - FALL)) sim.ents.move(v, x, y, z - FALL);
  } else if (k === "collapse") {
    if (hurt(sim, v, row.dmg, "a cave-in")) return;
    let moved = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!moved && w.isWalkable(x + dx, y + dy, z)) { sim.ents.move(v, x + dx, y + dy, z); moved = true; }
    w.set(x, y, moved ? z : z + 1, M.RUBBLE, w.flags(x, y, z) & ~F.PLAYER & ~F.OBSTACLE);        // the ceiling comes down: rubble plugs the passage (it digs out quickly)
  }
  v.lf = ["trap", k, sim.tick];
}

/** Once a tick for each villager standing in a labyrinth (sim.js): a trap under them goes off; the ones near enough may be spotted; a workshop they stand in is noted. */
export function trapStep(sim, v) {
  const d = dunAt(sim, v.x, v.y);
  if (!d) return;
  noteKnown(sim, d.core.x + "," + d.core.y);
  if (!sim.chron.f.firstLabyrinth) once(sim, "firstLabyrinth", "MILESTONE", v.name + " was the first to enter a labyrinth.", [v.id], { x: v.x, y: v.y }, 2);       // 7.23 deed
  const k0 = trapHere(sim, v.x, v.y, v.z);
  if (k0) { springTrap(sim, v, v.x, v.y, v.z, k0); if (!sim.ents.get(v.id)) return; }
  const R = Math.max(1, Math.min(3, sightAt(sim, v.x, v.y, v.z, 3, v) - 1)), st = sets(sim);
  const p = SPOT_BASE * v.t.intelligence * v.t.intelligence + SPOT_SKILL * level(v, "craft");
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = v.x + dx, y = v.y + dy, k = trapAt(d, x, y, v.z);
    if (!k) continue;
    const ci = idx(x, y, v.z);
    if (st.done.has(ci) || st.seen.has(ci)) continue;
    if (mix32(mix32(ci, v.id), sim.tick) / 4294967296 < p) spot(sim, x, y, v.z);
  }
  if ((sim.tick + v.id) % 20 === 0) {
    const r = roomAt(d, v.x, v.y, v.z);
    if (r && r.kind === "workshop" && !sim.trp.ws.some(q => q[1] === r.x0 && q[2] === r.y0 && q[3] === v.z)) {
      const craft = CRAFT_IDS[1 + (r.craft % (CRAFT_IDS.length - 1))];
      sim.trp.ws.push([craft, r.x0, r.y0, v.z]); sim.trp.n++;
      sim.disc.curio.push({ id: "ws:" + r.x0 + "," + r.y0 + "," + v.z, row: "", craft, wild: 0, t: sim.tick, x: v.x, y: v.y, z: v.z, text: "Benches and tools laid out as if the work stopped yesterday. Somebody knew how to use them." });
    }
  }
}

/** Every 20 ticks: old gas clouds go. */
export function trapTick(sim) {
  const g = sim.trp.gas;
  if (g.length && g.some(q => sim.tick >= q[1])) { sim.trp.gas = g.filter(q => sim.tick < q[1]); sim.trp.n++; }
}

/** Does an ancient workshop that somebody has seen carry this craft? (knowledge.js evidenceOf) */
export const workshopEvidence = (sim, craft) => !!sim.trp && sim.trp.ws.some(q => q[0] === craft);

// ---- disarming ----------------------------------------------------------------------------------------------------------

/** The chance a villager defuses a trap this try (a craft job). */
export function disarmChance(v, k) { return Math.max(0.15, Math.min(0.95, 0.55 + 0.4 * level(v, "craft") + 0.3 * (v.t.intelligence - 1) - TRAPS[k].hard)); }
/** Try to disarm the seen trap at (x, y, z). -> "ok" (parts dropped), "set" (it went off), or "gone". */
export function disarm(sim, v, x, y, z) {
  const k = trapHere(sim, x, y, z);
  if (!k || !isSeenTrap(sim, x, y, z)) return "gone";
  const roll = mix32(mix32(idx(x, y, z), v.id), sim.tick) / 4294967296;
  if (roll >= disarmChance(v, k)) { springTrap(sim, v, x, y, z, k); return "set"; }
  finish(sim, x, y, z);
  dropLoose(sim, "trap_parts", TRAPS[k].parts, v.x, v.y, v.z);
  return "ok";
}

// ---- caches -------------------------------------------------------------------------------------------------------------

/** A sealed cache at (x, y, z) was dug open: its loot lands loose on the floor where it stood (the caller removed the cell). Returns the units. */
export function openCache(sim, v, x, y, z, into) {
  const loot = lootAt(sim.def, x, y, z);
  let n = 0;
  for (const [item, c] of loot) {
    if (into) into[item] = (into[item] || 0) + c; else dropLoose(sim, item, c, x, y, z);       // 7.23: a delve party packs what it opens (`into`), a digger leaves it on the floor
    n += c;
    if (item === "relic") once(sim, "relic:" + x + "," + y + "," + z, "DISCOVERY", v.name + " brought up " + relicName(sim.def, x, y, z) + " from a sealed cache in the labyrinth.", [v.id], { x, y, z }, 2);
  }
  return n;
}
export { cacheAt, trapList };
