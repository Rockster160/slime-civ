// World depth (S14): the switch for everything this stage adds, the per-seed property perturbation (OD-22, GDD §11.5) and the "This world" facts.
//
// sim.dp (saved + hashed) = {on, cases, deaths, ot, oc, lt}
//   on      1 = this world has the S14 content (illness, wolves and grazers, salt/peat/herb, the alternates' discovery rows, perturbed properties); 0 = a world made before it.
//           New games get 1 (WORLD.depth in worldgen.js); a save without `dp` loads as 0, so every older fixture and save plays exactly as it did.
//   cases, deaths  illness so far;  ot/oc  the current outbreak (start tick or -1, cases in it);  lt  tick of the latest case.
// The perturbation is a pure function of the seed (its own named stream, so no other stream moves): each material property is the base value x (0.90 .. 1.10).
import { Rng } from "./rng.js";
import { depositsIn } from "./terrain.js";
import { BIOMES, HIGHLAND, biomeAt } from "./biome.js";
import { seasonIdx } from "./season.js";

export function newDepth(on) { return { on: on ? 1 : 0, cases: 0, deaths: 0, ot: -1, oc: 0, lt: -1 }; }
export const depthOn = (sim) => !!(sim.dp && sim.dp.on);
/** S16: the S14 deposits of a kind ('salt' | 'peat' | 'herb') within `r` cells of a point, [{x, y, r}] ascending by position. A pure function of the seed: nothing is stored. */
export function deposits(sim, kind, x, y, r) {
  return sim.def.depth ? depositsIn(sim.def, kind, x - r, y - r, x + r, y + r).filter(d => Math.abs(d.x - x) <= r && Math.abs(d.y - y) <= r).sort((a, b) => a.x - b.x || a.y - b.y) : [];
}

/** The perturbed properties and how to say each deviation: [keyword up, keyword down]. For spoil rates "up" is worse. */
export const PERTURB = {
  fuel_log:      ["Logs burn long here", "Logs burn short here"],
  fuel_stick:    ["Sticks burn long here", "Sticks burn short here"],
  fuel_peat:     ["Peat here burns hot", "Peat here burns poorly"],
  spoil_meat:    ["Meat spoils quickly here", "Meat keeps well here"],
  spoil_plant:   ["Fruit and roots spoil quickly here", "Fruit and roots keep well here"],
  ore_copper:    ["The green stone is rich here", "The green stone is lean here"],
  ore_iron:      ["The iron is rich here", "The iron is lean here"],
  ore_clay:      ["The clay banks are generous here", "The clay banks are meagre here"],
  ore_salt:      ["The salt is thick here", "The salt is thin here"],
};
export const PERTURB_KEYS = Object.keys(PERTURB);
export const PERTURB_SPAN = 0.10;           // +-10% (OD-22)

/** {key: factor in [0.90, 1.10]} for a seed, to two decimals. Own named stream "perturb" on a fresh Rng: it draws nothing from the sim's own streams. */
export function perturbOf(seed) {
  const s = new Rng(seed).stream("perturb"), out = {};
  for (const k of PERTURB_KEYS) out[k] = Math.round((1 - PERTURB_SPAN + 2 * PERTURB_SPAN * s.float()) * 100) / 100;
  return out;
}
/** The factor for a property in this sim (1 in a world without S14). */
export function pt(sim, key) {
  if (!sim.dp || !sim.dp.on) return 1;
  const c = sim.cache;
  if (!c.pt) c.pt = perturbOf(sim.seed);
  return c.pt[key] === undefined ? 1 : c.pt[key];
}

/** Is the air dry and cold enough to dry meat on the rack: winter anywhere, or the highland wind in any season (only in a world with the S14 content). */
export function dryAir(sim, st) { return depthOn(sim) && (seasonIdx(sim.tick) === 3 || biomeAt(sim.world, st.x, st.y) === HIGHLAND); }

/** Burn-time factor of a hearth fuel item. */
export const fuelMul = (sim, item) => pt(sim, item === "dried_peat" ? "fuel_peat" : item === "log" ? "fuel_log" : item === "stick" ? "fuel_stick" : "");
const ORE_KEY = { malachite: "ore_copper", iron_ore: "ore_iron", clay: "ore_clay", salt: "ore_salt" };
/** How many units a dug cell gives: the base count scaled by the world's richness, the fraction settled per cell by a hash (deterministic, no stream). */
export function oreYield(sim, item, n, cellIdx) {
  const m = ORE_KEY[item] ? pt(sim, ORE_KEY[item]) : 1;
  if (m === 1) return n;
  const exact = n * m, base = Math.floor(exact);
  return base + (((cellIdx * 2654435761) >>> 0) % 1000 < Math.round((exact - base) * 1000) ? 1 : 0);
}

/** The "This world" Almanac section: [{k, text}] deviations of at least 3%, then what the map offers. Pure. */
export function thisWorld(sim) {
  if (!depthOn(sim)) return { on: 0, props: [], facts: [] };
  const f = perturbOf(sim.seed), props = [];
  for (const k of PERTURB_KEYS) {
    const d = Math.round((f[k] - 1) * 100);
    if (Math.abs(d) >= 3) props.push({ k, pct: d, text: PERTURB[k][d > 0 ? 0 : 1] + " (" + (d > 0 ? "+" : "") + d + "%)" });
  }
  const facts = [], w = sim.world, st = sim.site, n = [0, 0, 0];
  for (const k of w.chunkKeys()) { const c = w.chunks.get(k); if (c.act) for (let i = 0; i < 256; i++) n[c.bm[i]]++; }
  const tot = n[0] + n[1] + n[2] || 1;
  facts.push("Land: " + BIOMES.map((b, i) => b.name.toLowerCase() + " " + Math.round(100 * n[i] / tot) + "%").join(", ") + " (round the camp).");
  const salt = deposits(sim, "salt", st.x, st.y, 60), peat = deposits(sim, "peat", st.x, st.y, 60), herb = deposits(sim, "herb", st.x, st.y, 60);
  facts.push(salt.length ? "Salt licks lie at " + salt.slice(0, 3).map(c => c.x + "," + c.y).join(" and ") + "." : "No salt lick near: meat keeps by smoke or wind.");
  facts.push(peat.length ? "Peat bogs lie in the marsh (" + peat.length + ")." : "No peat near: wood is the fuel.");
  facts.push(herb.length ? "Marsh herb grows in " + herb.length + " beds." : "No marsh herb near.");
  const fa = sim.ents.ofKind("fauna"), wolves = fa.filter(e => e.sp === "wolf").length, gr = fa.filter(e => e.sp === "grazer").length;
  facts.push((wolves ? "A wolf pack hunts here (" + wolves + ")." : "No wolves seen on this map.") + " " + (gr ? "Grazers roam (" + gr + "): bone, hide and big meat." : "No grazers: no bone tools."));
  return { on: 1, props, facts };
}
