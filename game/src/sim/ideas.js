// 9.33 learning by seeing (PHASE9_KNOWLEDGE.md): what a built thing teaches, from data that already exists, and the one sighting that raises an idea (knowledge.js setIdea).
// belief.js (the look) cannot import build.js or knowledge.js (import cycles), so this file hands it three hooks (belief.js IDEA) when sim.js starts.
//   furniture -> craft: build.js PLACE_NEEDS (what placing it needs) then phenomena.js CRAFTS[].evidence.furniture;  wall / floor / roof material -> craft: build.js BMAT[].need (a hide wall is hide working).
import { BMAT, PLACE_NEEDS } from "./build.js";
import { CRAFTS, CRAFT_IDS } from "./phenomena.js";
import { setFam, tellIdeas, famOf, ideaOf, aptOf, IDEA_FIRST, IDEA_STEP, IDEA_CLOSE, IDEA_CLOSE_X, IDEA_GAP } from "./knowledge.js";
import { IDEA } from "./belief.js";

const FC = {}, MC = new Array(256).fill("");
for (const f in PLACE_NEEDS) FC[f] = PLACE_NEEDS[f].slice();
for (const c of CRAFT_IDS) for (const f of CRAFTS[c].evidence.furniture) { const l = FC[f] || (FC[f] = []); if (!l.includes(c)) l.push(c); }
for (const k in BMAT) if (BMAT[k].need) MC[BMAT[k].id] = BMAT[k].need;

/** The crafts a furniture piece or a ghost of one is the work of: an array, or null. */
export function craftsOfEnt(e) {
  if (e.kind === "furniture") return FC[e.f] || null;
  if (e.kind === "csite") return e.m && BMAT[e.m] && BMAT[e.m].need ? [BMAT[e.m].need] : FC[e.w] || null;
  return null;
}
/** One sighting of a built thing of `craft` at `ring` cells: raises the slime's idea (not for a craft it knows; at most once per IDEA_GAP per craft; a close look counts double). */
export function seeIdea(sim, v, craft, ring) {
  if (famOf(v, craft) > 0) return false;
  const have = v.idea && v.idea[craft];
  if (have && sim.tick - have[1] < IDEA_GAP) return false;
  const step = (have ? IDEA_STEP : IDEA_FIRST) * (ring <= IDEA_CLOSE ? IDEA_CLOSE_X : 1) * aptOf(v);
  return setFam(sim, v, craft, ideaOf(v, craft) + step, { kind: "saw" });
}
export function initIdeas() { IDEA.crafts = craftsOfEnt; IDEA.mc = MC; IDEA.see = seeIdea; IDEA.tell = tellIdeas; }
