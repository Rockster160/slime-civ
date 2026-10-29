// The inspector's Memories words (experiment, MEMORY_SYSTEM.md): at most 3 chips ("Loves caves", "Fears cave crawlers") and the vivid episodes as 1-3 word lines. No sentences.
import { subjWord } from "../sim/memory.js";

export const CHIP_AT = 150;           // a feeling this strong earns a chip
const LIKE = { cave: "Loves", gem: "Drawn to", ore: "Likes", treasure: "Loves", deep: "Drawn to", trap: "Curious about" };
const BAD_EPI = { cave: "Scared underground", deep: "Scared deep down", trap: "Caught by a trap" };
const GOOD_EPI = { cave: "Loved the dark", deep: "Delved deep", ore: "Struck ore", gem: "Found gems", treasure: "Found treasure", trap: "Sprang a trap" };
const short = (s) => (s === "crawler" ? "crawler" : s);

/** [{text, tip}] strongest first, at most 3: what the slime likes (liking above fear) or fears (fear above liking). */
export function memChips(v) {
  const out = [];
  for (const s of (v.mem || []).slice().sort((a, b) => Math.max(b[1], b[2]) - Math.max(a[1], a[2]))) {
    const [sj, p, n] = s;
    if (Math.max(p, n) < CHIP_AT || p === n) continue;
    const text = p > n ? (LIKE[sj] || "Unafraid of") + " " + subjWord(sj) : "Fears " + subjWord(sj);
    out.push({ text, tip: subjWord(sj)[0].toUpperCase() + subjWord(sj).slice(1) + ": liking " + p + ", fear " + n });
    if (out.length === 3) break;
  }
  return out;
}
/** The vivid episodes, newest first, as short lines. */
export function episodeLines(v) {
  const out = [];
  for (const [, sj, k] of (v.epi || []).slice().reverse()) { const t = k === "bad" ? (BAD_EPI[sj] || "Hurt by " + short(sj)) : (GOOD_EPI[sj] || "Beat " + short(sj)); if (!out.includes(t)) out.push(t); }
  return out;
}
