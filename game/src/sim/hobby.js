// Hobbies (S13, GDD §10 leisure): pure flavour. In free time (Wander, tinkering) a villager follows the pastime their
// temperament leans to; it earns a little hobby XP, a label, and a small lift to the mood they get back from leisure.
// No economic effect at all (nothing here is read by a job score, a work rate or a yield).
//   v.hb = {xp, n}   xp: hobby experience; n: 1 once the chronicle has noted them as a notable hobbyist
import { mix32 } from "./rng.js";
import { expNeg } from "./util.js";

// Each hobby leans on two traits (weights x trait). The pick is the best lean plus a stable per-villager jitter.
export const HOBBIES = {
  carving: { name: "carving", doer: "carver", lean: { strength: 1, intelligence: 0.5 }, verb: "whittling a bit of wood", note: "carves small figures from wood" },
  singing: { name: "singing", doer: "singer", lean: { leisure: 1, drive: 0.3 }, verb: "humming a song", note: "sings to the others at rest" },
  stargazing: { name: "stargazing", doer: "stargazer", lean: { intelligence: 1, leisure: 0.4 }, verb: "watching the sky", note: "knows the stars by name" },
  stones: { name: "collecting stones", doer: "stone collector", lean: { stamina: 0.7, hardiness: 0.7 }, verb: "turning over pebbles", note: "keeps a hoard of fine pebbles" },
  weaving: { name: "weaving grass", doer: "weaver", lean: { speed: 1, drive: 0.4 }, verb: "plaiting grass stems", note: "plaits grass into small trinkets" },
};
export const HOBBY_IDS = Object.keys(HOBBIES);
export const HOBBY_XP = 0.0015;      // per need step (10 ticks) spent in free time: about 1.8 per 1800 ticks of pure leisure (flat per tick)
export const HOBBY_K = 40;                // level = 1 - e^(-xp/K)
export const HOBBY_MOOD = 0.25;           // a hobbyist's free time restores mood up to this much faster, at full level
export const NOTABLE_AT = 0.5;            // hobby level at which the chronicle notes them

/** The pastime for these traits (stable for a villager: traits and id only). */
export function hobbyOf(v) {
  let best = "", bs = -1;
  for (const id of HOBBY_IDS) {
    let s = (mix32(v.id, HOBBY_IDS.indexOf(id) + 101) / 4294967296) * 0.35;
    for (const k in HOBBIES[id].lean) s += HOBBIES[id].lean[k] * v.t[k];
    if (s > bs) { bs = s; best = id; }
  }
  return best;
}
export const hobbyLevel = (v) => (v.hb ? 1 - expNeg(v.hb.xp / HOBBY_K) : 0);
export const hobbyWord = (l) => (l < 0.1 ? "dabbler" : l < 0.3 ? "keen amateur" : l < 0.5 ? "accomplished" : "renowned");
/** One need step of free time. Returns the mood multiplier for the leisure recovery this step. */
export function hobbyStep(v) {
  if (!v.hb) v.hb = { xp: 0, n: 0 };
  v.hb.xp = Math.round((v.hb.xp + HOBBY_XP) * 100000) / 100000;
  return 1 + HOBBY_MOOD * hobbyLevel(v);
}
