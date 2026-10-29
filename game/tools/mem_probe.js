// Village-scale probe of the memory system (notes/impl/MEMORY_SYSTEM.md "Village playtest & balance"). ONE sim per process, bounded.
//   node tools/mem_probe.js <fixture> [ticks] [off]      e.g. settled 36000 | monsters 24000 off
import "../tests/legacy.js";
import { loadFixture } from "../tests/fixture.js";
import { mineSpots } from "./make_fixtures.js";
import { spawnFauna } from "../src/sim/fauna.js";
import { M } from "../src/sim/world.js";
import { flags, recall, FEAR_AT, EXPLORE_P } from "../src/sim/memory.js";
const [fx = "settled", tk = "36000", mode = "on", scen = ""] = process.argv.slice(2), N = Number(tk);
// scenarios (optional 4th arg): skirm = the monsters fixture with 2 crawlers left (survivable); mineface = the mine fixture with a dig order on its exposed malachite face;
// crowdmon = the 60-villager crowd fixture with 3 crawlers raiding the yard (a cascade test)
flags.off = mode === "off";
const T0 = Date.now(), sim = loadFixture(fx);
if (scen === "skirm") {       // a den 40+ cells off (out of raiding range), five spear carriers sent to clear it (as tests/monsters.js does), the rest left to the village
  const w = sim.world, f = sim.ents.ofKind("fauna");
  for (const e of f) { let best = null; for (let dx = 40; dx < 70 && !best; dx++) for (const dy of [0, 1, -1, 2, -2]) { const x = e.x + dx, y = e.y + dy, z = w.standZ(x, y); if (z >= 0 && !sim.ents.at(x, y, z).length && Math.abs(z - e.z) <= 2) { best = [x, y, z]; break; } } if (best) { e.home = best.slice(); sim.ents.move(e, best[0], best[1], best[2]); e.st = "patrol"; } }
  const crew = sim.ents.ofKind("villager").slice(0, 5), t = f.find(e => e.sp === "crawler");
  sim.apply({ type: "order", ids: crew.map(v => v.id), verb: "clear", tid: t.id }); sim.cache.iv++;
}
if (scen === "mineface") {      // the exposed face + hidden pocket, then a 12-cell run of ore (and a few gems) behind it, all ordered dug: a working mine
  const { FACE, HID } = mineSpots(sim), w = sim.world;
  for (let x = HID[0] + 3; x <= HID[0] + 14; x++) for (let y = FACE[1] - 1; y <= FACE[1] + 1; y++) for (const z of [FACE[2], FACE[2] - 1]) if (w.isSolid(x, y, z)) w.set(x, y, z, (x + y) % 5 === 0 ? M.GEM : M.MALACHITE, 0);
  sim.cache.iv++; sim.apply({ type: "mine", op: "region", x0: FACE[0], y0: FACE[1] - 1, x1: HID[0] + 14, y1: FACE[1] + 1, z: FACE[2], layers: 2 }); }
if (scen === "crowdmon") { const w = sim.world, S = sim.site; let n = 0; for (let r = 6; r < 20 && n < 3; r++) for (let d = -r; d <= r && n < 3; d += 3) { const x = S.x + r, y = S.y + d, z = w.standZ(x, y); if (z < 0 || sim.ents.at(x, y, z).length) continue; const e = spawnFauna(sim, "crawler", x, y, z); e.mon = 1; e.hr = 24; e.home = [x, y, z]; e.st = "patrol"; n++; } }
const vs0 = sim.ents.ofKind("villager").length;
const st = { jobs: 0, expl: 0, explSubj: {}, explBy: new Set(), idle: 0, samples: 0, hurt: 0, exDeaths: 0, mineExpl: 0 };
const after = sim.afterAction.bind(sim);
sim.afterAction = (v, s) => { const j = v.job; if (j && s === 1 && j.k !== "leisure") st.jobs++; if (j && j.k === "explore") { st.expl++; st.explSubj[j.key] = (st.explSubj[j.key] || 0) + 1; st.explBy.add(v.id); } return after(v, s); };
const hp = new Map(), exploring = new Set(); let food0 = sim.board.runway, seen0 = sim.seen.log.length, foodMin = food0;
const peakU = new Set(), hurtIds = new Set(), peakL = new Set(), peakF = new Set(), peakMax = {};
const dead0 = Object.keys(sim.chron.recs).length, minerPos = new Map();
for (let i = 0; i < N; i++) {
  if (i % 20 === 0) {
    for (const v of sim.ents.ofKind("villager")) {
      st.samples++; if (!v.job || v.job.k === "leisure") st.idle++;
      const h = hp.get(v.id); if (h !== undefined && v.hp < h - 2) { st.hurt++; hurtIds.add(v.id); if (v.job && v.job.k === "explore") st.exDeaths++; } hp.set(v.id, v.hp);
    }
    foodMin = Math.min(foodMin, sim.board.runway);
    if (i % 1000 === 0) for (const v of sim.ents.ofKind("villager")) for (const m of v.mem || []) { if (m[1] >= EXPLORE_P && m[1] > m[2]) peakL.add(v.id + ":" + m[0]); if (m[2] >= FEAR_AT && m[2] > m[1]) { peakF.add(v.id + ":" + m[0]); if (!(v.epi || []).some(e => e[1] === m[0])) peakU.add(v.id + ":" + m[0]); } if (m[1] > (peakMax[m[0]] || 0)) peakMax[m[0]] = m[1]; }
  }
  sim.step();
}
const vs = sim.ents.ofKind("villager"), adults = vs;
const subj = {}, chips = [], fearBy = {}, likeBy = {}, told = 0;
let slots = 0, strongP = 0, strongN = 0, fearNever = 0;
const profile = new Map();
for (const v of vs) {
  const m = v.mem || []; slots += m.length; chips.push(m.filter(s => s[1] >= 200 || s[2] >= FEAR_AT).length);
  for (const s of m) {
    const k = s[0]; subj[k] = subj[k] || { n: 0, p: 0, nn: 0, fear: 0, like: 0 }; const o = subj[k]; o.n++; o.p += s[1]; o.nn += s[2];
    if (s[2] >= FEAR_AT && s[2] > s[1]) { o.fear++; }
    if (s[1] >= EXPLORE_P && s[1] > s[2]) o.like++;
  }
  const f = m.filter(s => s[2] >= FEAR_AT && s[2] > s[1]).map(s => s[0]).sort().join("+"), l = m.filter(s => s[1] >= EXPLORE_P && s[1] > s[2]).map(s => s[0]).sort().join("+");
  profile.set(v.id, (l ? "likes:" + l : "") + (f ? " fears:" + f : "") || "-");
}
const recs = Object.keys(sim.chron.recs).length - dead0;
const causes = Object.values(sim.chron.recs).map(r => r.cause + "@" + r.death).join(" ");
const prof = {}; for (const p of profile.values()) prof[p] = (prof[p] || 0) + 1;
console.log(`== ${fx}${scen ? "/" + scen : ""} ${mode} ${N} ticks, wall ${((Date.now() - T0) / 1000).toFixed(1)}s, villagers ${vs0} -> ${vs.length}`);
console.log(`food runway ${food0.toFixed ? food0.toFixed(1) : food0} -> ${sim.board.runway.toFixed ? sim.board.runway.toFixed(1) : sim.board.runway} (min ${foodMin.toFixed ? foodMin.toFixed(1) : foodMin}); jobs done ${st.jobs}; idle share ${(100 * st.idle / Math.max(1, st.samples)).toFixed(1)}%; deaths ${recs}; hurt events ${st.hurt}`);
console.log("deaths:", causes, "| monsters alive at end:", sim.ents.ofKind("fauna").filter(e => e.mon).length);
console.log(`memory slots ${slots} (avg ${(slots / vs.length).toFixed(1)}/slime), strong chips avg ${(chips.reduce((a, b) => a + b, 0) / vs.length).toFixed(2)}`);
for (const [k, o] of Object.entries(subj).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(9)} holders ${o.n}  avg p ${Math.round(o.p / o.n)} n ${Math.round(o.nn / o.n)}  like>=${EXPLORE_P}: ${o.like}  fear>=${FEAR_AT}: ${o.fear}`);
console.log("interest profiles (count of slimes):", JSON.stringify(prof));
console.log(`explore trips ${st.expl} by ${st.explBy.size} slimes, subjects ${JSON.stringify(st.explSubj)}; hurt during explore ${st.exDeaths}; cells seen +${sim.seen.log.length - seen0}`);
const herdAfraid = {}; for (const v of vs) for (const s of v.mem || []) if (s[2] >= FEAR_AT && s[2] > s[1]) herdAfraid[s[0]] = (herdAfraid[s[0]] || 0) + 1;
console.log("EVER (sampled /1000 ticks): liked>=" + EXPLORE_P + " " + JSON.stringify([...peakL]) + " feared>=" + FEAR_AT + " " + JSON.stringify([...peakF]) + " peak p " + JSON.stringify(peakMax));
console.log(`CASCADE check: ${peakF.size} (slime,subject) fears ever >= ${FEAR_AT}; ${peakU.size} of them with no vivid episode of that subject (told or only seen, never badly hurt by it)`);
console.log("fear holders by subject:", JSON.stringify(herdAfraid), "of", vs.length);
