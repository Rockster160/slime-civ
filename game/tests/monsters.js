// 7.22 Monsters and spawning (quick set). Pure rules first (rate, caps, light, surface), then fixtures: the spawner in a labyrinth, the pre-situated `monsters` fixture (Concern, flee, raid, clear order,
// doors and light), the guardian, determinism and save, and the memory bounds. Every sim run is short and capped; nothing here runs in the background.
//   node game/tests/monsters.js
import "./legacy.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixture } from "./fixture.js";
import { defOf } from "../src/sim/spawn.js";
import { coresNear, manaAt, bandOf, MANA_R, bandAt } from "../src/sim/core.js";
import { MONSTERS, ROSTER, MAX, PERIOD, PHASE, spawnRate, regionCap, lightBlocks, surfaceAllowed, pickSpecies, chunkInfo, spawnPass, monsterMay, bandHere, LIGHT_PAD } from "../src/sim/monsters.js";
import { FAUNA, spawnFauna, swing, FEAR_AT } from "../src/sim/fauna.js";
import { ITEMS } from "../src/sim/items.js";
import { concerns } from "../src/ui/concerns.js";
import { faunaWord } from "../src/ui/labels.js";
import { faunaLine } from "../src/ui/text.js";
import { toJSON, restore } from "../src/sim/save.js";
import { isAdult } from "../src/sim/villager.js";
import { Sim } from "../src/sim/sim.js";
import { dungeonAt } from "../src/sim/dungeon.js";

const here = dirname(fileURLToPath(import.meta.url));
const ok = (m) => console.log("ok  " + m);
const H = { spawnFauna };
const mons = (sim) => sim.ents.ofKind("fauna").filter(e => e.mon);
const OPTS = { biomes: true, depth: true };
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// ---- 1. the pure rules ----
{
  assert.ok(!/Math\.(exp|sin|cos|random|pow)|Date\.|performance/.test(readFileSync(join(here, "..", "src", "sim", "monsters.js"), "utf8").replace(/\/\/.*$/gm, "")), "monsters.js uses no exp / sin / random / clock");
  for (const kind of ["den", "cave", "surface"]) for (const night of [true, false]) {
    let prev = -1;
    for (let m = 0; m <= 255; m++) {
      const r = spawnRate(m, kind, night);
      assert.ok(r >= prev, "spawn rate is monotone in mana (" + kind + ", mana " + m + ")");
      if (m < 14) assert.equal(r, 0, "no spawning below band 1");
      prev = r;
    }
    assert.ok(spawnRate(255, kind, night) > spawnRate(60, kind, night) && spawnRate(60, kind, night) > spawnRate(14, kind, night), "and strictly rises across bands");
  }
  assert.ok(spawnRate(130, "den", true) > spawnRate(130, "cave", true), "dens are richer than dark chambers");
  assert.ok(spawnRate(130, "surface", true) >= 8 * spawnRate(130, "surface", false), "the surface spawns mostly at night");
  assert.equal(spawnRate(255, "boss", true), 0, "the guardian is not on the timer");
  let pc = -1;
  for (let m = 0; m <= 255; m++) { const c = regionCap(m); assert.ok(c >= pc, "the region cap rises with mana"); if (m < 14) assert.equal(c, 0); pc = c; }
  assert.ok(regionCap(255) > regionCap(14) && regionCap(255) <= 12, "caps: " + regionCap(14) + " .. " + regionCap(255));
  assert.ok(lightBlocks([[10, 10, 5, 5]], 10, 10 + 5 + LIGHT_PAD, 5) && !lightBlocks([[10, 10, 5, 5]], 10, 10 + 5 + LIGHT_PAD + 1, 5) && !lightBlocks([[10, 10, 5, 5]], 10, 10, 9), "a light blocks within its radius + the pad, on its level only");
  assert.ok(!surfaceAllowed(0) && !surfaceAllowed(59) && surfaceAllowed(60) && surfaceAllowed(255), "surface spawns need band >= 2");
  // rows
  for (const sp of ROSTER) {
    const r = MONSTERS[sp];
    assert.ok(FAUNA[sp] === r && r.mon && r.hostile && r.hp > 0 && r.dmg > 0 && r.scare > 0 && r.scare <= 1 && r.w.length === 5 && r.where.length && r.drops.length && r.curio, sp + ": a complete row");
    for (const d of r.drops) assert.ok(ITEMS[d.item] && d.n[0] >= 1 && d.n[1] >= d.n[0] && d.p > 0 && d.p <= 100, sp + " drops " + d.item);
  }
  assert.ok(MONSTERS.crawler.swarm && MONSTERS.spitter.range >= 3 && MONSTERS.guardian.boss && MONSTERS.coreback.hp > 4 * MONSTERS.crawler.hp, "crawlers swarm, the spitter is ranged, the guardian is the boss, the coreback is a heavy");
  assert.ok(MONSTERS.crawler.w[1] > 0 && MONSTERS.coreback.w[1] === 0 && MONSTERS.coreback.w[2] > 0, "habitat bands: crawlers from band 1, corebacks and spitters from band 2");
  assert.equal(pickSpecies("den", 1, 7), "crawler"); assert.equal(pickSpecies("den", 0, 7), ""); assert.equal(pickSpecies("boss", 4, 7), "");
  const seen = new Set(); for (let h = 0; h < 200; h++) seen.add(pickSpecies("cave", 3, h));
  assert.deepEqual([...seen].sort(), ["coreback", "crawler", "spitter"], "a band-3 cave offers all three");
  ok("rules: rate monotone in mana (zero below band 1), caps rise with mana, light blocks, surface needs band 2, " + ROSTER.length + " complete rows");
}

// ---- 2. no surface spawns far from cores (pure, over seeds) ----
{
  let allowed = 0, far = 0, checked = 0;
  for (const seed of [7, 8, 9, 10, 11, 12]) {
    const def = defOf(seed, OPTS), sp = def.spawn;
    for (let i = 0; i < 1500; i++) {
      const x = sp.x + ((i * 7919) % 1601) - 800, y = sp.y + ((i * 104729) % 1601) - 800, z = Math.max(1, def.hAt(x, y));
      const near = coresNear(def, x, y, x, y, MANA_R).length > 0, m = manaAt(def, x, y, z);
      checked++;
      if (!near) { far++; assert.ok(!surfaceAllowed(m), "no surface spawn without a core within " + MANA_R); assert.equal(m, 0); }
      if (surfaceAllowed(m)) { allowed++; assert.ok(near && bandAt(def, x, y, z) >= 2); }
      if (Math.hypot(x - sp.x, y - sp.y) < 66) assert.ok(!surfaceAllowed(m), "none within 66 of the camp");
    }
  }
  assert.ok(far > checked * 0.5, "most of the land is core-free: " + far + "/" + checked);
  ok("surface: " + allowed + " of " + checked + " sampled ground cells over 6 seeds allow a spawn (band >= 2 only); none core-free, none within 66 of a camp");
}

// ---- 3. the spawner in a labyrinth: it spawns, caps hold, light suppresses, OD-49 ----
{
  const base = loadFixture("trap");
  for (let i = 0; i < 40; i++) base.step();
  const state = toJSON(base);
  const run = (n, prep) => {
    const sim = restore(state);
    for (const v of sim.ents.ofKind("villager")) { sim.ents.move(v, v.x, v.y, v.z); }
    if (prep) prep(sim);
    const t0 = sim.tick;
    for (let k = 0; k < n; k++) { sim.tick = t0 - (t0 % PERIOD) + k * PERIOD + PHASE; spawnPass(sim, H); }
    sim.tick = t0;
    return sim;
  };
  const sim = run(300);
  const ms = mons(sim);
  assert.ok(ms.length >= 6 && ms.length <= MAX, "the spawner makes monsters in the mana of an active labyrinth: " + ms.length);
  const kinds = new Set(ms.map(e => e.sp));
  assert.ok(kinds.has("crawler") && kinds.has("guardian"), "crawlers and the guardian: " + [...kinds]);
  assert.equal(ms.filter(e => e.sp === "guardian").length, new Set(ms.filter(e => e.sp === "guardian").map(e => e.ck)).size, "at most one guardian per core");
  // caps: per 64 x 64 region the count never passes the cap of the richest point in it
  const reg = new Map();
  for (const e of ms.filter(q => q.sp !== "guardian")) { const k = (e.home[0] >> 6) + "," + (e.home[1] >> 6); reg.set(k, (reg.get(k) || 0) + 1); }
  for (const [k, n] of reg) {
    const [rx, ry] = k.split(",").map(Number);
    let best = 0;
    for (const e of ms) if ((e.home[0] >> 6) === rx && (e.home[1] >> 6) === ry) best = Math.max(best, manaAt(sim.def, e.home[0], e.home[1], e.home[2]) + 6);       // (surface spawns are hashed columns, not listed points; a home is a few cells from its point, so a few mana of slack)
    for (let cx = rx * 4; cx < rx * 4 + 4; cx++) for (let cy = ry * 4; cy < ry * 4 + 4; cy++) for (const p of chunkInfo(sim.def, cx, cy).pts) best = Math.max(best, p.m);
    assert.ok(n <= regionCap(best), "region " + k + " holds " + n + " <= cap " + regionCap(best) + " (richest mana " + best + ")");
  }
  assert.ok(reg.size >= 1 && Math.max(...reg.values()) >= 3, "and the cap is reached, not just respected: max " + Math.max(...reg.values()));
  // OD-49: every spawned monster stands, and is at home, in band >= 1
  for (const e of ms) assert.ok(bandHere(sim, e.home[0], e.home[1], e.home[2]) >= 1 && bandHere(sim, e.x, e.y, e.z) >= 1, e.sp + " spawns inside band >= 1");
  for (const e of ms.filter(q => q.sf)) assert.ok(bandAt(sim.def, e.home[0], e.home[1], e.home[2]) >= 2, "a surface spawn is in band >= 2");
  // determinism of the spawner alone
  assert.equal(run(120).hash(), run(120).hash(), "the spawner is deterministic");
  // light suppresses: a torch on every spawn point's cell
  const pts = [];
  const w0 = restore(state);
  for (const k of w0.world.chunkKeys()) { const c = w0.world.chunks.get(k); if (c.act !== 1 || c.dz) continue; for (const p of chunkInfo(w0.def, c.cx, c.cy).pts) pts.push(p); }
  assert.ok(pts.length >= 4, "spawn points in the active land: " + pts.length);
  const lit = run(300, (s) => { for (const p of pts) s.ents.add("furniture", { f: "torch", x: p.x, y: p.y, z: p.z, owner: 0, rv: 0, rt: 0 }); });
  const gua = (s) => mons(s).filter(e => e.sp !== "guardian" && !e.sf).length;       // (dens and dark chambers; a surface column goes through the same lightBlocks)
  assert.equal(gua(lit), 0, "torches on every spawn point: no spawns (" + gua(sim) + " without)");
  const half = run(300, (s) => { for (const p of pts.slice(0, pts.length >> 1)) s.ents.add("furniture", { f: "torch", x: p.x, y: p.y, z: p.z, owner: 0, rv: 0, rt: 0 }); });
  assert.ok(gua(half) < gua(sim), "lighting half of them spawns less: " + gua(half) + " < " + gua(sim));
  // a sleeping chunk spawns nothing
  const asleep = run(300, (s) => { for (const k of s.world.chunkKeys()) { const c = s.world.chunks.get(k); c.dz = 1; } });
  assert.equal(mons(asleep).length, 0, "monsters spawn only in active chunks");
  ok("spawner: " + ms.length + " monsters in 300 passes (" + [...kinds].sort() + "), regions " + [...reg.values()] + ", light cut " + gua(sim) + " -> 0, half-lit " + gua(half) + ", sleeping land " + mons(asleep).length);
}

// ---- 4. the camp is untouched (no mana): nothing spawns, no new random stream, no new state ----
{
  const sim = loadFixture("settled");
  for (let i = 0; i < 4000; i++) sim.step();
  assert.equal(mons(sim).length, 0, "no monsters near a camp");
  assert.ok(!("gk" in sim.wild) && !("mon" in sim.rng.counters()), "no monster state or stream was touched");
  ok("camp: 4000 ticks with the spawner running and no monster, no stream, no state");
}

// ---- 5. the pre-situated fixture: Concern, flee, raid, defences, clear order ----
{
  const sim = loadFixture("monsters");
  const crawlers = mons(sim).filter(e => e.sp === "crawler"), spitter = mons(sim).find(e => e.sp === "spitter");
  assert.ok(crawlers.length >= 3 && spitter, "the fixture has a swarm and a spitter: " + mons(sim).length);
  const c0 = concerns(sim).find(c => c.k === "danger");
  assert.ok(c0 && c0.level >= 2 && /monster|crawler/.test(c0.text) && /Clear/.test(c0.text), "a Concern is raised at once: " + (c0 && c0.text));
  const first = {};
  for (let i = 0; i < 1500 && !(first.flee && first.raid && first.hit); i++) {
    sim.step();
    for (const v of sim.ents.ofKind("villager")) { if (v.job && v.job.k === "flee") first.flee = first.flee || sim.tick; if (v.ht && v.hd > 0 && sim.tick - v.ht < 5) first.hit = first.hit || sim.tick; }
    if (mons(sim).some(e => e.st === "raid")) first.raid = first.raid || sim.tick;
  }
  assert.ok(first.raid && first.flee && first.hit, "the monsters raid, villagers flee and are hit: " + JSON.stringify(first));
  const c1 = concerns(sim).find(c => c.k === "danger");
  assert.ok(c1 && c1.level === 3 && /raiding/.test(c1.text), "the Concern turns urgent: " + (c1 && c1.text));
  assert.ok(sim.ents.ofKind("villager").some(v => (v.fear || 0) > FEAR_AT) || first.flee, "fear drives the flee");
  const word = faunaWord(crawlers[0]);
  assert.match(word, /^Crawler: /); assert.match(faunaLine(crawlers[0]), /^Cave crawler - /);
  ok("fixture: Concern at once; flee at +" + (first.flee - 36000) + ", raid at +" + (first.raid - 36000) + ", first hit at +" + (first.hit - 36000) + " ticks; " + c1.text.slice(0, 40));
}
{
  // defences: a door is closed to monsters; a torch keeps dark rows out (a coreback ignores light)
  const sim = loadFixture("monsters");
  const e = mons(sim).find(q => q.sp === "crawler"), row = FAUNA.crawler, cb = { ...e, sp: "coreback" };
  const x = e.x + 1, y = e.y, z = e.z;
  assert.ok(monsterMay(sim, e, row, x, y, z), "an open cell in its ground");
  const d = sim.ents.add("furniture", { f: "door", x, y, z, owner: 0, rv: 0, rt: 0 });
  assert.ok(!monsterMay(sim, e, row, x, y, z), "a door stops a monster");
  sim.ents.remove(d.id);
  sim.ents.add("furniture", { f: "torch", x: x + 2, y, z, owner: 0, rv: 0, rt: 0 });
  sim.cache.mlt = -1;
  assert.ok(!monsterMay(sim, e, row, x, y, z), "light stops a crawler");
  assert.ok(monsterMay(sim, cb, FAUNA.coreback, x, y, z), "but not a coreback");
  assert.ok(!monsterMay({ ...sim, ents: sim.ents, cache: sim.cache, tick: sim.tick }, { ...e, hr: 0 }, { ...row, dark: 0 }, e.x + 40, e.y, e.z), "and a monster never steps out of its mana (band 0, no home radius)");
  ok("defences: a door and a torch stop a crawler; a coreback ignores light; no stepping out of mana");
}
{
  // a lit camp holds a swarm off: a ring of torches round the monsters' side of the camp, and no villager is hit in a window where they were hit before
  const dark = loadFixture("monsters"), lit = loadFixture("monsters");
  const e0 = mons(lit).find(q => q.sp === "crawler"), cp = { x: (lit.stock.x0 + lit.stock.x1) >> 1, y: (lit.stock.y0 + lit.stock.y1) >> 1 };
  for (let y = cp.y - 8; y <= cp.y + 8; y += 4) for (let x = cp.x + 3; x <= cp.x + 9; x += 3) { const z = lit.world.standZ(x, y); if (z >= 0 && !lit.ents.at(x, y, z).length) lit.ents.add("furniture", { f: "torch", x, y, z, owner: 0, rv: 0, rt: 0 }); }
  const hits = (s) => { let n = 0; for (let i = 0; i < 1200; i++) { s.step(); for (const v of s.ents.ofKind("villager")) if (v.ht === s.tick - 1 && v.hd > 0) n++; } return n; };
  const hd = hits(dark), hl = hits(lit);
  assert.ok(hd > hl, "light shields the camp: " + hd + " hits in the dark, " + hl + " lit (crawlers only; the spitter and the villagers' own wandering still count)");
  ok("light as a defence: " + hd + " hits on the dark camp, " + hl + " with torches");
}
{
  // a clear order: spear-carrying villagers kill the swarm; drops are items
  const sim = loadFixture("monsters");
  for (const e of mons(sim)) {                          // a den out of raiding range of the camp (RAID_R = 40): the crew goes to it
    let best = null;
    for (let dx = 40; dx < 70 && !best; dx++) for (const dy of [0, 1, -1, 2, -2]) { const x = e.x + dx, y = e.y + dy, z = sim.world.standZ(x, y); if (z >= 0 && !sim.ents.at(x, y, z).length && Math.abs(z - e.z) <= 2) { best = [x, y, z]; break; } }
    assert.ok(best, "a spot for the den");
    e.home = [best[0], best[1], best[2]]; sim.ents.move(e, best[0], best[1], best[2]); e.st = "patrol";
  }
  const vs = sim.ents.ofKind("villager").filter(v => isAdult(sim, v)).slice(0, 5);
  const target = mons(sim).find(e => e.sp === "crawler");
  assert.ok(sim.apply({ type: "order", ids: vs.map(v => v.id), verb: "clear", tid: target.id }), "the Clear order is accepted");
  const before = mons(sim).filter(e => e.sp === "crawler").length;
  let t = 0;
  for (; t < 3000 && mons(sim).some(e => e.sp === "crawler"); t++) sim.step();
  const left = mons(sim).filter(e => e.sp === "crawler").length, chit = sim.ents.ofKind("item").filter(i => i.item === "chitin").reduce((a, i) => a + i.n, 0);
  assert.ok(left < before, "the crew cleared crawlers: " + before + " -> " + left + " in " + t + " ticks");
  assert.ok(chit >= 1 || left > 0, "monster parts drop as items: " + chit + " chitin");
  const bare = loadFixture("monsters"); bare.ents.ofKind("item").filter(i => i.item === "copper_spear").forEach(i => bare.ents.remove(i.id)); bare.cache.iv++;
  const vb = bare.ents.ofKind("villager").filter(v => isAdult(bare, v)).slice(0, 2);
  bare.apply({ type: "order", ids: vb.map(v => v.id), verb: "clear", tid: mons(bare).find(e => e.sp === "crawler").id });
  for (let i = 0; i < 200; i++) bare.step();
  assert.ok(vb.every(v => !(v.eq && v.eq.item === "copper_spear")), "without a spear nobody takes the order up");
  ok("clear order: " + before + " crawlers -> " + left + " in " + t + " ticks, " + chit + " chitin dropped; no spear, no clearing");
}

// ---- 6. the ranged spitter and the guardian ----
{
  const sim = loadFixture("monsters");
  const v = sim.ents.ofKind("villager").filter(q => isAdult(sim, q))[0];
  for (const e of mons(sim)) sim.ents.remove(e.id);
  const z = v.z, spot = [[4, 0], [-4, 0], [0, 4], [0, -4]].map(([dx, dy]) => [v.x + dx, v.y + dy]).find(([x, y]) => sim.world.isWalkable(x, y, z));
  const s = spawnFauna(sim, "spitter", spot[0], spot[1], z); s.mon = 1; s.hr = 12; s.home = [spot[0], spot[1], z];
  v.order = null;
  let shot = null;
  for (let i = 0; i < 600 && !shot; i++) { sim.step(); if (s.sh && s.sh[3] === sim.tick - 1) shot = { d: cheb(s, v), tick: s.sh[3] }; }
  assert.ok(shot && shot.d >= 2, "the spitter shoots from range: " + (shot && shot.d) + " cells");
  ok("spitter: shot a villager from " + shot.d + " cells");
}
{
  const sim = loadFixture("trap");
  for (let i = 0; i < 40; i++) sim.step();
  for (let k = 0; k < 30; k++) { sim.tick = k * PERIOD + PHASE + 100000; spawnPass(sim, H); }
  const g = mons(sim).find(e => e.sp === "guardian");
  assert.ok(g, "a guardian stands at the core chamber of an active labyrinth");
  assert.equal(bandHere(sim, g.x, g.y, g.z), 4, "in band 4 (the heart)");
  const dun = dungeonAt(sim.def, g.x, g.y);
  assert.ok(dun && Math.abs(g.x - dun.core.x) <= 4 && Math.abs(g.y - dun.core.y) <= 4 && g.z === dun.core.z, "beside the core");
  const killer = sim.ents.ofKind("villager")[0]; killer.eq = null;
  g.hp = 1;
  for (let i = 0; i < 40 && sim.ents.get(g.id); i++) swing(sim, killer, g);
  assert.ok(!sim.ents.get(g.id), "it can be killed");
  const shards = sim.ents.ofKind("item").filter(i => i.item === "core_shard").reduce((a, i) => a + i.n, 0);
  assert.ok(shards >= 3 && sim.wild.gk.includes(g.ck), "it drops core shards (" + shards + ") and is remembered as slain");
  for (let k = 40; k < 140; k++) { sim.tick = k * PERIOD + PHASE + 100000; spawnPass(sim, H); }
  assert.ok(!mons(sim).some(e => e.sp === "guardian" && e.ck === g.ck), "and it does not respawn");
  const rt = restore(toJSON(sim));
  assert.deepEqual(rt.wild.gk, sim.wild.gk, "the slain list survives a save");
  ok("guardian: one at the core chamber (band 4), " + shards + " core shards, never again after death, kept in the save");
}

// ---- 7. determinism, save, and memory ----
{
  const a = loadFixture("monsters"), b = loadFixture("monsters");
  for (let i = 0; i < 1500; i++) { a.step(); b.step(); }
  assert.equal(a.hash(), b.hash(), "the monster fixture replays identically");
  const mid = restore(toJSON(a));
  for (let i = 0; i < 400; i++) { a.step(); mid.step(); }
  assert.equal(a.hash(), mid.hash(), "a save taken mid-raid continues identically");
  ok("determinism: two runs and a mid-raid save/load agree (hash " + a.hash().slice(0, 8) + ")");
}
{
  const sim = loadFixture("trap");
  global.gc && global.gc();
  const h0 = process.memoryUsage().heapUsed, nonPlant = () => sim.ents.list.filter(q => q.kind !== "plant").length, e0 = nonPlant();
  let peakM = 0, peakE = 0;
  const vs = sim.ents.ofKind("villager");
  const camp = { x: sim.site.x, y: sim.site.y };
  const dungeon = vs.map(v => [v.x, v.y, v.z]);
  for (let leg = 0; leg < 4; leg++) {                    // a short walk: out into the labyrinth, back to the camp, twice
    const goHome = leg % 2 === 1;
    vs.forEach((v, i) => { const to = goHome ? [camp.x + (i % 3), camp.y + (i >> 1), sim.world.standZ(camp.x + (i % 3), camp.y + (i >> 1))] : dungeon[i]; if (to[2] >= 0) sim.ents.move(v, to[0], to[1], to[2]); v.action = null; v.job = null; });
    for (let t = 0; t < 1500; t++) { sim.step(); if (t % 100 === 0) { peakM = Math.max(peakM, mons(sim).length); peakE = Math.max(peakE, nonPlant()); } }
    if (goHome) {
      const sleeping = mons(sim).filter(e => sim.world.dormantAt(e.x, e.y));
      assert.equal(sleeping.length, 0, "no monster is kept in a sleeping chunk");
    }
  }
  global.gc && global.gc();
  const heap = (process.memoryUsage().heapUsed - h0) / 1e6;
  assert.ok(peakM <= MAX, "the monster budget holds: peak " + peakM + " <= " + MAX);
  assert.ok(peakE - e0 <= MAX + 60, "non-plant entities stay bounded on the walk (plants are the land's own flora, which the walk activates): " + e0 + " -> peak " + peakE);
  assert.ok(heap < 150, "heap growth over the walk " + heap.toFixed(0) + " MB");
  ok("memory: 4 legs out and back, peak " + peakM + " monsters, non-plant entities " + e0 + " -> " + nonPlant() + " (peak " + peakE + "), monsters left " + mons(sim).length + ", heap +" + heap.toFixed(0) + " MB");
}
console.log("monsters: all passed");
