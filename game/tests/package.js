// 8.24: the save package and its codec. Fixture-based and bounded (no sim is run for days):
//   node tests/package.js          every fixture in tests/fixtures (about 6 s in all, so the sweep is not split)
// Covers: package <-> flat snapshot, round-trip hash equality, the gzip / base64 / plain-JSON forms and their sniffing, corrupt records refused in plain words,
// v12-20 JSON saves still loading (and converting), the batched seen knowledge (flat on a long walk), the pruned chronicle, and a size table.
import "./legacy.js";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadFixture } from "./fixture.js";
import { DIR } from "../tools/make_fixtures.js";
import { CMD_CAP } from "../src/sim/sim.js";
import { restore, toJSON, snapshot, savePackage, cutPackage, sealPackage, hashText, toPackage, fromPackage, verifyPackage, recHash, PKG_VERSION, SAVE_VERSION } from "../src/sim/save.js";
import { seenRle, LOG_TAIL } from "../src/sim/seen.js";
import { watch } from "../src/sim/seen.js";
import { pruneChron, MAX_RECS } from "../src/sim/chronicle.js";
import { World } from "../src/sim/world.js";
import { encodeBytes, encodeCode, decodeAny, importSave, sniff, gzip, gunzip, toB64, fromB64, sizes, NOT_A_SAVE } from "../src/store/codec.js";

const names = readdirSync(DIR).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)).sort();
const ok = (m) => console.log("ok  " + m);
const kb = (n) => (n / 1024).toFixed(1);
const T0 = Date.now();
const rows = [];

// ---- 1. every fixture: legacy JSON -> package -> bytes -> sim; hashes equal, re-packing is identical ----
for (const name of names) {
  const text = readFileSync(join(DIR, name + ".json"), "utf8");
  const a = restore(text);
  const ha = a.hash();
  const pkg = savePackage(a);
  assert.equal(pkg.v, PKG_VERSION);
  assert.equal(verifyPackage(JSON.parse(JSON.stringify(pkg))), "", name + ": a package verifies after a JSON trip");
  assert.deepEqual(fromPackage(JSON.parse(JSON.stringify(pkg))), JSON.parse(JSON.stringify(snapshot(a))), name + ": the package is the snapshot, cut into records");
  const bytes = await encodeBytes(pkg);
  assert.equal(sniff(bytes), "gzip");
  const b = await importSave(bytes);
  assert.equal(b.hash(), ha, name + ": hash differs after a .slime round trip");
  assert.equal(JSON.stringify(savePackage(b)), JSON.stringify(pkg), name + ": re-packing the loaded sim changed the package");
  const flat = toJSON(a), sz = await sizes(pkg);
  assert.equal(restore(flat).hash(), ha, name + ": the flat JSON form round-trips too");
  rows.push({ name, v: Number(text.slice(0, 60).match(/"v":(\d+)/)[1]), legacy: text.length, flat: flat.length, ...sz, chunks: Object.keys(pkg.c).length });
}
ok(names.length + " fixtures: legacy JSON -> package -> .slime -> sim, hash equal, re-pack identical (" + ((Date.now() - T0) / 1000).toFixed(1) + " s)");
console.log("fixture         v   chunks   old json KB  v21 json KB   package raw   gz KB   b64 KB");
for (const r of rows) console.log(`${r.name.padEnd(14)} ${String(r.v).padStart(3)} ${String(r.chunks).padStart(7)} ${kb(r.legacy).padStart(12)} ${kb(r.flat).padStart(12)} ${kb(r.raw).padStart(13)} ${kb(r.gz).padStart(7)} ${kb(r.b64).padStart(8)}`);

// ---- 2. the three forms and the sniffer ----
{
  const a = loadFixture("settled"), pkg = savePackage(a), ha = a.hash();
  const bytes = await encodeBytes(pkg), code = await encodeCode(pkg), plain = JSON.stringify(pkg), legacy = readFileSync(join(DIR, "settled.json"), "utf8");
  assert.equal(sniff(bytes), "gzip"); assert.equal(sniff(code), "b64"); assert.equal(sniff(plain), "json"); assert.equal(sniff(legacy), "json"); assert.equal(sniff("hello there!!"), "b64"); assert.equal(sniff(new Uint8Array([1, 2, 3, 4])), "unknown");
  assert.ok(code.startsWith("H4sI"), "a save code is base64 of gzip");
  assert.equal(code.length, Math.ceil(bytes.length / 3) * 4, "base64 is 4/3 of the bytes");
  assert.deepEqual(fromB64(toB64(bytes)), bytes);
  assert.deepEqual(await gunzip(await gzip(bytes)), bytes);
  for (const [label, input] of [["bytes", bytes], ["code", code], ["code with line breaks", code.replace(/(.{76})/g, "$1\n")], ["package JSON text", plain], ["legacy v" + SAVE_VERSION + "-era JSON", legacy], ["base64 of plain JSON", Buffer.from(plain).toString("base64")]]) {
    const b = await importSave(input);
    assert.equal(b.tick, a.tick, label);
    if (label !== "legacy v21-era JSON") assert.equal(b.hash(), ha, label + ": hash");
  }
  assert.equal((await importSave(legacy)).hash(), ha, "a legacy JSON save loads to the same sim as its fixture");
  ok("bytes, save code, plain package, legacy JSON and base64 text all load; sniffing tells them apart; gzip " + kb(bytes.length) + " KB, code " + kb(code.length) + " KB");
}

// ---- 3. damage is refused in plain words, never loaded ----
{
  const a = loadFixture("year2"), pkg = JSON.parse(JSON.stringify(savePackage(a)));
  const keys = Object.keys(pkg.c);
  const refuse = async (input, re, label) => { await assert.rejects(() => importSave(input), (e) => { assert.match(e.message, re, label + ": " + e.message); assert.ok(!/undefined|\[object|TypeError|Unexpected/.test(e.message), label + " is plain text: " + e.message); return true; }, label); };
  const c1 = JSON.parse(JSON.stringify(pkg)); c1.c[keys[0]].mt = [1, 1, 99, 99];
  await refuse(JSON.stringify(c1), /damaged.*map piece.*checksum/, "a changed chunk record");
  const c2 = JSON.parse(JSON.stringify(pkg)); c2.g.tick = 5;
  await refuse(JSON.stringify(c2), /village record.*checksum/, "a changed global record");
  const c3 = JSON.parse(JSON.stringify(pkg)); delete c3.c[keys[1]];
  await refuse(JSON.stringify(c3), /damaged/, "a missing chunk record");
  const c4 = JSON.parse(JSON.stringify(pkg)); delete c4.m;
  await refuse(JSON.stringify(c4), /incomplete/, "no manifest");
  const c5 = JSON.parse(JSON.stringify(pkg)); c5.cmds = c5.cmds.slice(1).concat([{ t: 1, type: "x" }]);
  await refuse(JSON.stringify(c5), /command history/, "a changed command history");
  const bytes = await encodeBytes(pkg);
  await refuse(bytes.slice(0, bytes.length >> 1), /damaged/, "a truncated .slime");
  const flipped = bytes.slice(); flipped[flipped.length >> 1] ^= 0xff;
  await refuse(flipped, /damaged/, "a flipped byte in a .slime");
  await refuse("this is not a save at all", new RegExp(NOT_A_SAVE.slice(0, 20)), "garbage text");
  await refuse(new Uint8Array([9, 9, 9, 9, 9]), /does not look like/, "garbage bytes");
  await refuse("{\"hello\": 1}", /does not look like/, "JSON that is not a save");
  await refuse(JSON.stringify({ v: SAVE_VERSION + 1 }), /Unsupported save version/, "a save from the future");
  assert.notEqual(recHash(pkg.g), recHash(c2.g));
  ok("changed, missing and cut-off records, flipped bytes, garbage and a future version are all refused in plain words");
}

// ---- 4. the seen knowledge is batched: flat on a long walk, per chunk, bounded ----
{
  const sim = loadFixture("settled"), v = sim.ents.ofKind("villager")[0];
  const w = sim.world, cs0 = seenRle(sim).c.length;
  const size = () => { const r = seenRle(sim); return { x: JSON.stringify(r.x).length, rc: r.rc.length, c: JSON.stringify(r.c).length, chunks: r.c.length }; };
  const gz0 = await (async () => (await gzip(new TextEncoder().encode(JSON.stringify(seenRle(sim).x)))).length)();
  const s0 = size(), log0 = sim.seen.log.length;
  for (let k = 0; k < 4; k++) {
    for (let step = 0; step < 150; step++) {                       // 600 cells east, on the ground, looking at each step
      const x = v.x + 4, y = v.y;
      const z = Math.max(w.hsAt(x, y), 0) + 1;
      sim.ents.move(v, x, y, z);
      watch(sim, v);
    }
  }
  const s1 = size();
  assert.ok(s1.chunks > s0.chunks + 30, "the walk opened new ground: " + s0.chunks + " -> " + s1.chunks + " chunks");
  const walked = 2400, gzx = async (r) => (await gzip(new TextEncoder().encode(JSON.stringify(r.x)))).length;
  assert.ok((s1.x - s0.x) / walked < 14, "the cells under a walker's feet cost " + ((s1.x - s0.x) / walked).toFixed(1) + " characters per cell walked");
  assert.ok(((await gzx(seenRle(sim))) - gz0) / walked < 4, "and about " + ((((await gzx(seenRle(sim))) - gz0)) / walked).toFixed(1) + " gzip bytes per cell walked");
  assert.ok(s1.rc <= LOG_TAIL && sim.seen.log.length <= 2 * LOG_TAIL, "the log of newest cells is bounded: " + sim.seen.log.length);
  const perChunk = (s1.c - s0.c) / (s1.chunks - s0.chunks);
  assert.ok(perChunk < 40, "revealed ground costs a handful of characters per chunk: " + perChunk.toFixed(1));
  assert.ok(log0 <= 2 * LOG_TAIL);
  // and it all comes back
  const b = await importSave(await encodeBytes(savePackage(sim)));
  assert.equal(b.hash(), sim.hash(), "hash after the walk");
  assert.equal(b.seen.b.size >= sim.seen.b.size - 0, true);
  ok("seen: a 2400-cell walk opened " + (s1.chunks - s0.chunks) + " chunks for " + (s1.c - s0.c) + " characters of column bitsets and " + (s1.x - s0.x) + " of under-foot cells, log bounded at " + sim.seen.log.length);
}

// ---- 5. underground sight: per-chunk bitsets, derived ore, summary in the chunk record ----
{
  const a = loadFixture("mine"), pkg = savePackage(a);
  const withX = Object.values(pkg.c).filter(r => r.sx).length, withOre = Object.values(pkg.c).filter(r => r.ore);
  assert.ok(withX > 0 && withOre.length > 0, "the mine's chunk has seen cells and an ore summary");
  const b = restore(JSON.stringify(pkg));
  for (const m of Object.keys(a.seen.known)) {
    const live = a.seen.known[m].filter((i, k, arr) => arr.indexOf(i) === k && a.world.mat(...World.xyz(i)) === Number(m)).sort((p, q) => p - q);
    assert.deepEqual((b.seen.known[m] || []).slice().sort((p, q) => p - q), live, "known ore " + m + " is derived again on load");
  }
  const total = {}; for (const r of withOre) for (const [m, e] of Object.entries(r.ore)) total[m] = (total[m] || 0) + e[0];
  for (const m of Object.keys(total)) assert.equal(total[m], b.seen.known[m].length, "the ore summary counts match what load derives (" + m + ")");
  assert.ok(Object.values(pkg.c).every(r => !r.ore || Object.values(r.ore).every(e => e.length === 3 && e[0] > 0)));
  assert.equal(JSON.stringify(savePackage(b)), JSON.stringify(pkg));
  ok("mine: " + withX + " chunk(s) with seen-cell bitsets, ore summary " + JSON.stringify(total) + " matches the derived lists");
}

// ---- 6. a legacy save (v12-20 JSON, with the old `seen.l` and the stored log) converts; place-bound entities ride in their chunk ----
{
  const text = readFileSync(join(DIR, "mine.json"), "utf8"), old = JSON.parse(text);
  assert.ok(old.v >= 12 && old.v < SAVE_VERSION && old.seen.l, "the fixture is an old-form save (v" + old.v + ")");
  const a = restore(text);
  const pkg = savePackage(a);
  assert.ok(!("seen" in pkg.g) && pkg.g.rc && pkg.g.ents && !pkg.g.ents.list.some(e => e.kind === "item"), "items are not in the global record");
  const placed = Object.values(pkg.c).reduce((n, r) => n + (r.e ? r.e.length : 0), 0), planted = Object.values(pkg.c).reduce((n, r) => n + (r.pl ? r.pl.length : 0), 0);
  assert.ok(placed > 0 && planted > 0, "items, furniture and sites (" + placed + ") and packed plants (" + planted + ") are in chunk records");
  const cells = (s) => { let n = 0; for (const arr of s.seen.b.values()) for (let i = 0; i < arr.length; i++) n += arr[i]; return n; };
  const b = restore(JSON.stringify(pkg));
  assert.equal(cells(b), cells(a), "the same cells are known after the conversion");
  assert.equal(b.hash(), a.hash());
  const j = JSON.parse(toJSON(a)); assert.equal(j.v, SAVE_VERSION); assert.ok(j.seen.x && !j.seen.l && !j.seen.log, "the flat form carries the batched seen form");
  ok("legacy v" + old.v + " JSON converts: " + cells(a) + " cells known, " + placed + " place-bound entities and " + planted + " plants in chunk records");
}

// ---- 6b. Phase 9 state is global: beliefs, ideas, assignments, the board and notices, clear orders, the look cell ----
{
  const a = loadFixture("autumn"), vs = a.ents.ofKind("villager");
  vs[0].as = { task: "chop", tid: 0, x: vs[0].x + 3, y: vs[0].y, z: vs[0].z, t0: a.tick, done: 2, go: 1 };
  a.clr.n = 1; a.clr.list = [{ id: 1, x0: vs[0].x, y0: vs[0].y, x1: vs[0].x + 2, y1: vs[0].y + 2, z: vs[0].z }];
  const pkg = savePackage(a), g = pkg.g;
  const gv = g.ents.list.filter(e => e.kind === "villager");
  assert.equal(gv.length, vs.length, "every villager is in the global record");
  assert.ok(gv.every(v => Array.isArray(v.bel) && v.lk !== undefined), "beliefs and the look cell ride with the villager");
  assert.ok(g.board && g.clr && g.clr.n === 1 && g.chron && g.disc, "board, clear orders, chronicle and discovery are global");
  assert.ok(Object.values(pkg.c).every(r => !(r.e || []).some(e => e.kind === "villager" || e.kind === "fauna" || e.kind === "wagon")), "villagers, fauna and wagons never ride in a chunk");
  const b = await importSave(await encodeBytes(pkg));
  assert.equal(b.hash(), a.hash());
  assert.deepEqual(b.ents.get(vs[0].id).as, vs[0].as, "the assignment survives");
  assert.equal(b.clr.n, 1);
  ok("Phase 9 state (beliefs, assignment, board, clear order, look cell) is in the global record and survives a .slime round trip");
}

// ---- 7. the dead are bounded ----
{
  const sim = loadFixture("settled");
  const alive = sim.ents.ofKind("villager")[0].id;
  for (let i = 0; i < MAX_RECS + 60; i++) {
    const id = 90000 + i;
    sim.chron.recs[id] = { id, name: "Gone" + i, par: [0, 0], kids: [], death: 1000 + i };
    sim.chron.f["mem:" + id + ":cave:p"] = 1;
  }
  sim.chron.f["mem:" + alive + ":cave:p"] = 1; sim.chron.f["mem:12345678:cave:n"] = 1; sim.chron.f["firstWinter"] = 1;
  pruneChron(sim);
  assert.equal(Object.keys(sim.chron.recs).filter(i => i >= 90000).length, MAX_RECS - (Object.keys(sim.chron.recs).filter(i => i < 90000).length), "recs bounded to MAX_RECS");
  assert.ok(Object.keys(sim.chron.recs).length <= MAX_RECS);
  assert.ok(sim.chron.recs[90000 + MAX_RECS + 59] && !sim.chron.recs[90000], "the newest records stay, the oldest go");
  assert.ok(sim.chron.f["mem:" + alive + ":cave:p"] && sim.chron.f.firstWinter && !sim.chron.f["mem:12345678:cave:n"] && !sim.chron.f["mem:90000:cave:p"] && sim.chron.f["mem:" + (90000 + MAX_RECS + 59) + ":cave:p"], "flags: the living and the recorded keep theirs, the forgotten lose them, milestones stay");
  const b = await importSave(await encodeBytes(savePackage(sim)));
  assert.equal(b.hash(), sim.hash());
  ok("chronicle: dead records bounded at " + MAX_RECS + ", mem: flags of the forgotten dropped, and it saves and loads");
}

// ---- 8. (8.27) the command log is capped; the sliced cut equals savePackage ----
{
  const sim = loadFixture("settled");
  for (let i = 0; i < CMD_CAP * 3 + 17; i++) sim.apply({ type: "noop", i });
  assert.ok(sim.cmdLog.length < CMD_CAP * 2 && sim.cmdLog.length >= CMD_CAP, "the live log stays bounded (" + sim.cmdLog.length + ")");
  assert.equal(sim.cmdLog[sim.cmdLog.length - 1].i, CMD_CAP * 3 + 16, "the newest command is kept");
  const pkg = savePackage(sim);
  assert.equal(pkg.cmds.length, CMD_CAP, "a save keeps the newest " + CMD_CAP);
  assert.equal(pkg.cmds[CMD_CAP - 1].i, CMD_CAP * 3 + 16);
  const b = restore(pkg);
  assert.equal(b.cmdLog.length, CMD_CAP); assert.equal(b.hash(), sim.hash());
  assert.equal(recHash(savePackage(b).cmds), recHash(pkg.cmds), "re-saving a loaded game gives the same log");
  const cut = cutPackage(sim);
  const text = JSON.stringify(cut.pkg.g);
  const was = sim.stock.logs; sim.stock.logs = (was || 0) + 5;                                        // the sim moves on after the cut: the texts are frozen
  const sealed = sealPackage(cut, cut.texts.map(t => hashText(t.json)));
  assert.equal(cut.texts[0].json, text, "the record text is a frozen copy");
  assert.notEqual(JSON.stringify(cut.pkg.g), text, "(the record object itself still shares the live stock, which is why the text is cut first)");
  if (was === undefined) delete sim.stock.logs; else sim.stock.logs = was;
  assert.deepEqual(sealed.m, savePackage(sim).m, "the sliced cut's manifest equals savePackage's");
  ok("command log capped at " + CMD_CAP + " (live and saved, a loaded game re-saves the same); the two-step cut gives savePackage's manifest from frozen text");
}

console.log("package ok (" + ((Date.now() - T0) / 1000).toFixed(1) + " s)");
