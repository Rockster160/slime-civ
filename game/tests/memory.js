// Experience -> memory -> interest / fear -> autonomous action (experiment, notes/impl/MEMORY_SYSTEM.md). Quick set; fixture `memory` (a cave east of camp, unseen; a crawler 14 cells in; two bare-handed slimes at the stair head).
//   1. contrasting temperaments, identical events: bold+curious vs sensitive+timid are possessed through the SAME scripted walk into the cave and fight with the crawler (real pinput through the real pipeline) and end with different memories
//   2. after the release, within a capped window: the curious one takes `explore` toward the cave and maps new cells; the fearful one does not; near the same monster kind the fearful one is more afraid and keeps clear
//   3. liking and fear coexist; safe exposure lowers fear more for the bold slime; sensitisation for the sensitive one
//   4. save roundtrip mid-memory + hash-replay determinism; caps hold
//   5. a slime with no memory scores exactly as before; the memory term stays inside the clamp
//   6. stories: a told fear reaches a friend, small and capped
//   node game/tests/memory.js
import "./legacy.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixture } from "./fixture.js";
import { toJSON, restore } from "../src/sim/save.js";
import { feel, recall, memBias, fearMul, fears, avoids, decay, hashTemper, MEM_CAP, EPI_CAP, EXPLORE_P, HEARD_CAP, STRONG, MEM_CLAMP, DECAY_EVERY } from "../src/sim/memory.js";
import { fearStep, spawnFauna } from "../src/sim/fauna.js";
import { plan, WITHIN_CLAMP } from "../src/sim/jobs.js";
import { socialTick } from "../src/sim/people.js";
import { seenAt } from "../src/sim/seen.js";
import { explain } from "../src/ui/text.js";

const here = dirname(fileURLToPath(import.meta.url));
const ok = (m) => console.log("ok  " + m);
const BOLD = { b: 90, c: 90, s: 15 }, TIMID = { b: 15, c: 15, s: 90 };
const T0 = Date.now();

assert.ok(!/Math\.(exp|sin|cos|random|pow)|Date\.|performance/.test(readFileSync(join(here, "..", "src", "sim", "memory.js"), "utf8").replace(/\/\/.*$/gm, "")), "memory.js uses no exp / sin / random / clock");

/** The two slimes at the stair head (the fixture's pair), nearest the crawler's tunnel first. */
const pair = (sim) => { const c = sim.ents.ofKind("fauna").find(e => e.sp === "crawler"); return sim.ents.ofKind("villager").slice().sort((a, b) => Math.abs(a.x - c.x) + Math.abs(a.y - c.y) - Math.abs(b.x - c.x) - Math.abs(b.y - c.y) || a.id - b.id).slice(0, 2); };

/** The scripted experience, through real possession: walk east down the stair and along the tunnel, fight the crawler when it is next to us, stop three cells past where it stood. */
function experience(ps, cap = 1500) {
  const sim = loadFixture("memory"), v = pair(sim)[0], crawler0 = sim.ents.ofKind("fauna").find(e => e.sp === "crawler");
  const tunnel = [crawler0.x - 13, crawler0.x + 30, crawler0.y, crawler0.z];
  v.ps = { ...ps };
  assert.ok(sim.apply({ type: "possess", id: v.id }), "possessed");
  let cx = crawler0.x, t = 0;
  for (; t < cap; t++) {
    const cr = sim.ents.ofKind("fauna").find(e => e.sp === "crawler");
    if (cr) cx = cr.x; else if (v.x >= cx + 3) break;
    if (!v.action) {
      const adj = cr && Math.abs(cr.x - v.x) + Math.abs(cr.y - v.y) <= 1 && Math.abs(cr.z - v.z) <= 1;
      sim.apply({ type: "pinput", id: v.id, dx: adj ? 0 : 1, dy: 0, tid: adj ? cr.id : 0, verb: "" });
    }
    sim.step();
  }
  assert.ok(t < cap && !sim.ents.ofKind("fauna").some(e => e.sp === "crawler"), "the walk ended with the crawler beaten (tick " + t + ")");
  assert.ok(sim.ents.get(v.id) && v.poss, "still alive, still guided");
  sim.apply({ type: "release" });
  return { sim, v, tunnel, ticks: t, json: toJSON(sim) };
}

// ---- 1. contrasting temperaments, identical events ----
const A = experience(BOLD), B = experience(TIMID);
const mA = (s) => recall(A.v, s), mB = (s) => recall(B.v, s);
{
  const cnt = (v, s) => (v.mem.find(q => q[0] === s) || [0, 0, 0, 0])[3];
  assert.equal(A.ticks, B.ticks, "the same script took the same time");
  assert.equal(A.v.hp, B.v.hp, "the same blows landed on each (" + Math.round(A.v.hp) + " hp left)");
  assert.deepEqual(A.v.epi.map(e => [e[0], e[1], e[2]]), B.v.epi.map(e => [e[0], e[1], e[2]]), "the same vivid episodes at the same ticks: " + A.v.epi.map(e => e[1] + "/" + e[2]));
  assert.ok(cnt(A.v, "crawler") >= 3 && cnt(A.v, "cave") >= 5, "a fight and a walk in the dark: " + cnt(A.v, "crawler") + " crawler, " + cnt(A.v, "cave") + " cave events");
  assert.ok(mA("cave").p > mB("cave").p + 100 && mA("cave").p >= EXPLORE_P, "the curious slime came to like caves: " + mA("cave").p + " vs " + mB("cave").p);
  assert.ok(mB("cave").n > mA("cave").n && mB("cave").n > mB("cave").p, "the sensitive slime came to fear them: n " + mB("cave").n + " (p " + mB("cave").p + ") vs n " + mA("cave").n);
  assert.ok(mB("crawler").n > mA("crawler").n + 100, "mauled alike, the timid one is shaken more: " + mB("crawler").n + " vs " + mA("crawler").n);
  assert.ok(mA("crawler").p > mB("crawler").p, "and the bold one is prouder of the win: " + mA("crawler").p + " vs " + mB("crawler").p);
  assert.ok(A.v.epi.length > 0 && A.v.epi.length <= EPI_CAP, "vivid episodes kept: " + JSON.stringify(A.v.epi.map(e => e[1] + "/" + e[2])));
  assert.ok(B.sim.chron.entries.some(e => e.a[0] === B.v.id && /is afraid of cave crawlers/.test(e.text)), "the chronicle notes the strong fear");
  const n0 = B.sim.chron.entries.length; feel(B.sim, B.v, "crawler", "bad", 40);
  assert.equal(B.sim.chron.entries.filter(e => /is afraid of cave crawlers/.test(e.text) && e.a[0] === B.v.id).length, 1, "... once per slime and subject");
  assert.equal(B.sim.chron.entries.length, n0, "... no second line");
  B.v.mem.find(q => q[0] === "crawler")[2] = 412;                                    // (undo the extra blow)
  ok("1. same walk and fight, different slimes: cave p/n " + mA("cave").p + "/" + mA("cave").n + " vs " + mB("cave").p + "/" + mB("cave").n + "; crawler p/n " + mA("crawler").p + "/" + mA("crawler").n + " vs " + mB("crawler").p + "/" + mB("crawler").n + " (" + A.ticks + " ticks)");
}

// ---- 2. autonomy after the release ----
function window(S, cap) {
  const { sim, v } = S, [x0, x1, ty, tz] = S.tunnel;
  const known = () => { let n = 0; for (let x = x0; x <= x1; x++) n += seenAt(sim.seen, x, ty, tz); return n; };
  const k0 = known(), l0 = sim.seen.log.length;
  let explore = 0, first = -1, why = "", fled = 0;
  for (let t = 0; t < cap; t++) {
    sim.step();
    if (v.job && v.job.k === "explore") { explore++; if (first < 0) first = t; if (!why) { const x = explain(sim, v); why = x ? x.sentence : ""; } }
    if (v.job && v.job.k === "flee") fled++;
  }
  return { explore, first, why, gained: known() - k0, logged: sim.seen.log.length - l0, fled };
}
let wa, wb;
{
  const cap = 4500;
  const lA = A.v.mem.map(q => q.slice()), lB = B.v.mem.map(q => q.slice());
  wa = window(A, cap); wb = window(B, cap);
  assert.ok(wa.explore > 0 && wa.first >= 0, "the curious slime took explore on its own (" + wa.explore + " ticks, first at +" + wa.first + ")");
  assert.ok(wa.gained > 0, "... and mapped " + wa.gained + " more tunnel cells (" + wa.logged + " new cells seen in all)");
  assert.equal(wb.explore, 0, "the fearful slime never explored");
  assert.ok(wb.gained * 5 < wa.gained, "... and mapped next to nothing of the cave (" + wb.gained + " cells, only the step out)");
  assert.ok(/Curious: caves/.test(wa.why), "the Why text says it: " + wa.why);
  assert.ok(A.v.ps.c > 50 && lA.length && lB.length, "(set temperaments held)");
  ok("2a. released: bold explores (" + wa.explore + " ticks, +" + wa.gained + " tunnel cells known, \"" + wa.why + "\"); timid: " + wb.explore + " explore ticks, +" + wb.gained + " cells, fled " + wb.fled + " ticks");
}
{
  // the same crawler, the same distance, the same bare hands: the mauled-and-scared slime is more afraid and keeps its distance
  const peak = (S) => {
    const sim = restore(S.json), v = sim.ents.get(S.v.id);
    v.fear = 0; v.hp = 100; v.job = null; v.action = null; v.eq = null;
    const cr = spawnFauna(sim, "crawler", v.x + 8, v.y, v.z); cr.cd = 1e9;      // (a statue 8 cells on along the tunnel: only the rule is under test)
    assert.ok(sim.world.isWalkable(cr.x, cr.y, cr.z), "the statue stands in the tunnel");
    let m = 0, flee = false;
    for (let i = 0; i < 40; i++) { fearStep(sim, v); m = Math.max(m, v.fear); }
    plan(sim, v, false, (cs) => { flee = cs.some(c => c.kind === "flee" && !c.blocker); });
    return { peak: m, flee, avoids: avoids(sim, v, cr.x, cr.y, cr.z), mul: fearMul(v, "crawler") };
  };
  const pa = peak(A), pb = peak(B);          // (taken from the state at the release; the windows above ran on)
  assert.ok(pb.mul > 1.05 && pa.mul < 1, "the multiplier: " + pb.mul + " (mauled) vs " + pa.mul + " (won)");
  assert.ok(pb.peak > pa.peak, "the timid slime is more afraid of the same crawler at the same distance: " + pb.peak + " vs " + pa.peak);
  assert.ok(pb.flee && !pa.flee, "it flees where the bold one stands: flee " + pb.flee + " vs " + pa.flee);
  assert.ok(pb.avoids && !pa.avoids, "an idle wander will not pick a spot next to a crawler for the fearful one");
  ok("2b. crawler 8 cells away: peak fear " + pb.peak + " (flees " + pb.flee + ", avoids " + pb.avoids + ") vs " + pa.peak + " (flees " + pa.flee + ", avoids " + pa.avoids + ")");
}

// ---- 3. coexistence, habituation, sensitisation ----
{
  assert.ok(mA("crawler").p > 0 && mA("crawler").n > 0 && mB("crawler").p > 0 && mB("crawler").n > 0, "liking and fear of the same thing coexist in both slimes");
  const sim = loadFixture("memory"), [va, vb] = pair(sim);
  va.ps = { ...BOLD }; vb.ps = { ...TIMID };
  for (const v of [va, vb]) v.mem = [["crawler", 300, 250, 3, sim.tick]];       // (balance pass: liking above fear, a monster they have beaten; sight only breeds fondness there)
  const cr = spawnFauna(sim, "crawler", va.x - 11, va.y, sim.world.standZ(va.x - 11, va.y)); cr.cd = 1e9;
  const before = [recall(va, "crawler").n, recall(vb, "crawler").n];
  for (let i = 0; i < 60; i++) { fearStep(sim, va); fearStep(sim, vb); va.fear = 0; vb.fear = 0; }
  const dA = before[0] - recall(va, "crawler").n, dB = before[1] - recall(vb, "crawler").n;
  assert.ok(dA > 0 && dA > 3 * dB, "repeated safe exposure lowers the bold slime's fear far more: -" + dA + " vs -" + dB);
  assert.ok(recall(va, "crawler").p > 300, "and the curious enjoy the novelty (liking " + recall(va, "crawler").p + ")");
  // sensitisation: the same blows, the sensitive one's fear grows faster and faster once it is already high
  const steps = (ps) => { const s2 = loadFixture("memory"), v = pair(s2)[0]; v.ps = { ...ps }; v.mem = []; const out = []; let last = 0; for (let i = 0; i < 6; i++) { feel(s2, v, "trap", "bad", 30); const n = recall(v, "trap").n; out.push(n - last); last = n; } return out; };
  const sa = steps(BOLD), sb = steps(TIMID);
  assert.ok(sb[5] > sb[0] && sb[5] > sb[1] && sa[5] <= sa[0] + 1, "sensitisation: timid increments " + sb + " grow; bold " + sa + " do not");
  assert.ok(sb.reduce((a, b) => a + b) > 2 * sa.reduce((a, b) => a + b), "and add up to far more fear");
  ok("3. habituation: bold fear -" + dA + " vs sensitive -" + dB + " over 60 exposures; sensitisation increments " + sb + " vs " + sa);
}

// ---- 4. save roundtrip mid-memory, replay, caps ----
{
  const S = experience(BOLD);
  for (let i = 0; i < 700; i++) S.sim.step();
  const json = toJSON(S.sim), R = restore(json), rv = R.ents.get(S.v.id);
  assert.deepEqual([rv.ps, rv.mem, rv.epi], [S.v.ps, S.v.mem, S.v.epi], "temperament, memory and episodes round-trip");
  assert.equal(R.hash(), S.sim.hash(), "the loaded sim hashes the same");
  for (let i = 0; i < 900; i++) { S.sim.step(); R.step(); }
  assert.equal(R.hash(), S.sim.hash(), "... and keeps hashing the same: the replay is deterministic");
  // an older save has no temperament or memory: restore fills them (temperament from the hash) and the sim runs
  const old = JSON.parse(json);
  for (const e of old.entities.list) if (e.kind === "villager") { delete e.ps; delete e.mem; delete e.epi; }
  const O = restore(old), ov = O.ents.get(S.v.id);
  assert.deepEqual(ov.ps, hashTemper(O.seed, ov.id), "an old save gets its temperament from the hash");
  assert.deepEqual([ov.mem, ov.epi], [[], []]);
  for (let i = 0; i < 200; i++) O.step();
  // caps: many different subjects, many episodes
  const sim = loadFixture("memory"), v = pair(sim)[0];
  for (let i = 0; i < 300; i++) { feel(sim, v, "s" + (i % 23), i % 3 === 0 ? "good" : i % 3 === 1 ? "bad" : "safe", 20 + (i * 7) % 80); assert.ok(v.mem.length <= MEM_CAP && v.epi.length <= EPI_CAP); }
  for (const s of v.mem) assert.ok(s[1] >= 0 && s[1] <= 1000 && s[2] >= 0 && s[2] <= 1000 && Number.isInteger(s[1]) && Number.isInteger(s[2]), "p and n are integers in 0..1000");
  for (let i = 0; i < 400; i++) { decay(v); assert.ok(v.mem.length <= MEM_CAP); }
  assert.equal(v.mem.length, 0, "decay empties a memory nobody feeds");
  // and across a short live run the caps hold for every slime
  let worst = 0;
  for (let i = 0; i < 1500; i++) { S.sim.step(); if (i % 100 === 0) for (const q of S.sim.ents.ofKind("villager")) worst = Math.max(worst, q.mem.length, q.epi.length); }
  assert.ok(worst <= MEM_CAP);
  ok("4. save roundtrip + " + 900 + "-tick replay hash equal (" + R.hash() + "), old save filled, caps hold (worst " + worst + " slots), decay empties");
}

// ---- 5. no memory = the old scores ----
{
  const sim = loadFixture("memory"), v = pair(sim)[0];
  const score = (mut) => { const s2 = restore(toJSON(sim)), q = s2.ents.get(v.id); mut(q); const out = {}; plan(s2, q, false, (cs) => { for (const c of cs) out[c.key] = [c.score, Object.keys(c.parts).includes("mem")]; }, true); return out; };
  const empty = score(q => { q.mem = []; }), none = score(q => { delete q.mem; delete q.epi; }), prior = score(q => { q.mem = [["gem", 900, 0, 4, 0]]; });
  assert.deepEqual(empty, none, "an empty memory scores exactly like no memory field at all");
  assert.ok(Object.values(empty).every(x => !x[1]), "and adds no memory term");
  assert.deepEqual(Object.fromEntries(Object.entries(empty).map(([k, x]) => [k, x[0]])), Object.fromEntries(Object.entries(prior).map(([k, x]) => [k, x[0]])), "a memory of something no candidate touches changes no score");
  // a memory that applies: A, who likes caves, gets an explore candidate whose term is inside the clamp
  const sA = restore(A.json), qa = sA.ents.get(A.v.id); qa.fear = 0; qa.job = null; qa.action = null; qa.ex = -1e9;
  let ex = null; plan(sA, qa, false, (cs) => { ex = cs.find(c => c.kind === "explore"); }, true);
  assert.ok(ex && !ex.blocker && ex.parts.mem >= 1 && ex.parts.mem <= MEM_CLAMP, "explore carries a memory term of " + (ex && ex.parts.mem));
  const within = ex.parts.urg + ex.parts.fit + ex.parts.prox + ex.parts.path + ex.parts.pref + ex.parts.soc + ex.parts.ill + ex.parts.crew + ex.parts.tmp + ex.parts.sw + ex.parts.mem;
  assert.ok(Math.abs(ex.score - ex.parts.base) <= WITHIN_CLAMP && Math.abs(ex.score - ex.parts.base - Math.max(-WITHIN_CLAMP, Math.min(WITHIN_CLAMP, within))) < 1e-9, "the sum stays inside the +-" + WITHIN_CLAMP + " clamp");
  assert.equal(memBias({ mem: [["cave", 1000, 0, 9, 0]] }, ["cave"]), MEM_CLAMP); assert.equal(memBias({ mem: [["cave", 0, 1000, 9, 0]] }, ["cave"]), -MEM_CLAMP);
  assert.equal(memBias({ mem: [] }, ["cave"]), 0); assert.equal(fearMul({ mem: [] }, "crawler"), 1);
  assert.ok(fearMul({ mem: [["crawler", 0, 1000, 5, 0]] }, "crawler") <= 1.5 && fearMul({ mem: [["crawler", 1000, 0, 5, 0]] }, "crawler") >= 0.5);
  ok("5. empty memory: identical scores (" + Object.keys(empty).length + " candidates), no memory part; explore term " + ex.parts.mem + " inside the clamp");
}

// ---- 6. stories ----
{
  const sim = loadFixture("memory"), [a, b] = pair(sim);
  a.mem = [["crawler", 0, 600, 5, sim.tick]]; b.mem = [];
  a.rel = [{ o: b.id, k: "friend", s: 1, w: "", pri: 1 }]; b.rel = [{ o: a.id, k: "friend", s: 1, w: "", pri: 1 }];
  a.slp = b.slp = 0;
  socialTick(sim);
  assert.deepEqual(recall(b, "crawler"), { p: 0, n: 60 }, "10% of a strong fear reaches a friend standing near");
  assert.equal(b.epi.length, 0, "a heard memory is never an episode");
  for (let i = 0; i < 20; i++) socialTick(sim);
  assert.equal(recall(b, "crawler").n, HEARD_CAP, "stories stop at " + HEARD_CAP + " however often they are told");
  const f = (v) => { const s2 = restore(toJSON(sim)), q = s2.ents.get(v.id); q.fear = 0; const cr = spawnFauna(s2, "crawler", q.x - 8, q.y, s2.world.standZ(q.x - 8, q.y)); cr.cd = 1e9; for (let i = 0; i < 6; i++) fearStep(s2, q); return q.fear; };
  const heard = f(b), plain = (b.mem = [], f(b));
  assert.ok(heard > plain, "a told fear shakes the friend at the sight of the crawler: " + heard + " vs " + plain);
  ok("6. a fear told to a friend: 60 at first, capped at " + HEARD_CAP + ", fear at the sight of a crawler " + heard + " vs " + plain + " untold");
}

console.log("memory ok (" + ((Date.now() - T0) / 1000).toFixed(1) + "s)");
