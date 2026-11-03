// The chronicle as a readable history (GDD §21, S15): eras, firsts, births and deaths with their context, notable people with their titles, graves and heirlooms,
// as Markdown. PURE: a function of the sim (no DOM); ui/chronicle.js only offers the download. Names and dates come from the sim, nothing is invented.
import { dateOf, SEASON_NAMES, DAYS_PER_SEASON, DAY } from "../sim/clock.js";
import { ERA_RANK } from "../sim/phenomena.js";
import { eraOf } from "../sim/knowledge.js";
import { ageDays } from "../sim/villager.js";

const when = (t) => { if (t < 0) return "a founder"; const d = dateOf(t); return "Year " + d.year + ", day " + d.day + " (" + SEASON_NAMES[Math.min(3, Math.floor((d.day - 1) / DAYS_PER_SEASON))] + ")"; };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const FIRST_KINDS = new Set(["BUILT_FIRST", "DISCOVERY", "LOSS"]);

function nameOf(sim, id) {
  const e = sim.ents.get(id);
  if (e && e.name) return e.name;
  const r = sim.chron.recs[id];
  return r ? r.name : "someone";
}

/** The sections, as data: [{title, lines:[string]}]. */
export function chronicleSections(sim) {
  const es = sim.chron.entries, secs = [];
  const vs = sim.ents.ofKind("villager"), graves = sim.ents.ofKind("grave");
  const d = sim.disc || {}, reached = d.eras || {}, now = eraOf(sim);

  secs.push({ title: "The village today", lines: [
    "Seed " + sim.seed + ". " + when(sim.tick) + ", " + vs.length + (vs.length === 1 ? " villager" : " villagers") + " living" + (now ? ", in the " + now + " age" : "") + ".",
    graves.length ? graves.length + (graves.length === 1 ? " grave" : " graves") + " mark those who died here." : "Nobody has been buried yet.",
  ] });

  const eras = Object.keys(reached).sort((a, b) => reached[a] - reached[b] || (ERA_RANK[a] || 0) - (ERA_RANK[b] || 0));
  secs.push({ title: "Eras", lines: eras.length ? eras.map(n => "- The " + n + " age: first reached " + when(reached[n]) + (n === now ? " (the village is in it now)" : "") + ".") : ["- No age has dawned yet."] });

  const firsts = es.filter(e => FIRST_KINDS.has(e.kind) || (e.kind === "MILESTONE" && e.sev >= 1));
  secs.push({ title: "Firsts", lines: firsts.length ? firsts.map(e => "- " + when(e.t) + ": " + e.text) : ["- Nothing of note was recorded."] });

  const bd = es.filter(e => e.kind === "BIRTH" || e.kind === "DEATH");
  secs.push({ title: "Births and deaths", lines: bd.length ? bd.map(e => "- " + when(e.t) + (e.kind === "BIRTH" ? " (birth)" : " (death)") + ": " + e.text) : ["- No births or deaths yet."] });

  const notable = [];
  for (const v of vs) if ((v.ti && v.ti.length) || v.hl) notable.push({ name: v.name, born: v.born, ti: v.ti || [], living: true, mate: v.mate ? nameOf(sim, v.mate) : "", hl: v.hl, age: Math.round(ageDays(sim, v) / 100) });
  for (const id of Object.keys(sim.chron.recs)) {
    const r = sim.chron.recs[id];
    if (r.ti && r.ti.length) notable.push({ name: r.name, born: r.birth, ti: r.ti, living: false, died: r.death, cause: r.cause, age: Math.round((r.age || 0) / 100) });
  }
  secs.push({ title: "Notable people", lines: notable.length ? notable.map(p => "- " + p.name + (p.living ? " (living, " : " (died " + when(p.died) + " of " + p.cause + ", ") + "aged " + p.age + ")" + (p.ti.length ? ": " + p.ti.map(cap).join("; ") : "") + (p.mate ? ". Partner: " + p.mate : "") + (p.hl ? ". Keeps " + p.hl.n : "") + ".") : ["- Nobody has earned a title yet."] });

  secs.push({ title: "Graves", lines: graves.length ? graves.map(g => "- " + g.ins + (g.hl ? " Buried with " + g.hl + "." : "")) : ["- None."] });

  const heir = [];
  for (const v of vs) if (v.hl) heir.push("- " + cap(v.hl.n) + ": " + v.hl.h.map(h => h.n).join(" -> ") + " (now with " + v.name + ").");
  for (const g of graves) if (g.hl) heir.push("- " + cap(g.hl) + ": buried with " + g.name + ".");
  secs.push({ title: "Heirlooms", lines: heir.length ? heir : ["- No heirloom has been handed down."] });

  if (sim.chron.n > es.length) secs.push({ title: "Note", lines: ["The chronicle keeps its most recent " + es.length + " of " + sim.chron.n + " entries; the oldest minor ones have been dropped."] });
  return secs;
}

/** The whole history as Markdown text. */
export function chronicleMarkdown(sim) {
  let out = "# Chronicle of the slime village\n\n";
  for (const s of chronicleSections(sim)) out += "## " + s.title + "\n\n" + s.lines.join("\n") + "\n\n";
  return out.replace(/\n+$/, "\n");
}
export const chronicleFileName = (sim) => "chronicle-seed" + sim.seed + "-day" + Math.floor(sim.tick / DAY) + ".md";
