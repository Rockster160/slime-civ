// S12 UI completion, headless: key remapping (a change persists in storage, not the save; clashes are refused; the help text reads the table), the
// accessibility settings' storage, the autosave ring and the ironman flow (single slot, no loading), and a new game's ironman flag in the save.
//   node tests/ui_s12.js
import "./legacy.js";
import assert from "node:assert/strict";
import { createKeymap, keyId, ACTIONS, PAN_IDS } from "../src/ui/keys.js";
import { loadAccess, SCALES } from "../src/ui/access.js";
import { createHelp } from "../src/ui/help.js";
import { autosave, listAutos, memoryStorage, autosaveDue, loadRefusal, saveRefusal, AUTO_SLOTS, IRON_KEY } from "../src/ui/slots.js";
import { Sim } from "../src/sim/sim.js";
import { toJSON, restore } from "../src/sim/save.js";
import { DAY } from "../src/sim/clock.js";

const ok = (m) => console.log("ok " + m);
const store = () => { const m = memoryStorage(); return { m, get: (k) => m.get("slimeciv." + k), set: (k, v) => m.set("slimeciv." + k, v) }; };

// ---- 1. keys ----
{
  const st = store(), km = createKeymap(st);
  assert.equal(km.actionOf("w", "map"), "panUp"); assert.equal(km.actionOf("e", "guide"), "use"); assert.equal(km.actionOf("e", "map"), "erase");
  assert.equal(km.actionOf("t", "map"), "warmth"); assert.equal(km.actionOf("t", "guide"), "tool", "the same key does different things on the map and while guiding");
  assert.equal(km.label("next"), "Tab"); assert.equal(km.label("panUp"), "W / ↑");
  assert.equal(keyId({ key: "Tab", shiftKey: true }), "shift+Tab"); assert.equal(keyId({ key: " " }), "Space"); assert.equal(keyId({ key: "W", shiftKey: true }), "w");
  // remap: B (build) -> g
  assert.equal(km.set("build", "g"), "");
  assert.equal(km.actionOf("g", "map"), "build"); assert.equal(km.actionOf("b", "map"), "", "the old key is free");
  assert.ok(st.m.get("slimeciv.keys") && JSON.parse(st.m.get("slimeciv.keys")).build[0] === "g", "stored in the browser");
  // a fresh keymap on the same storage (a reload) has it
  const km2 = createKeymap(st);
  assert.equal(km2.label("build"), "G"); assert.equal(km2.actionOf("g", "map"), "build");
  // clashes and fixed keys are refused in plain words
  assert.match(km2.set("follow", "g"), /already does "Build mode"/);
  assert.match(km2.set("follow", "Escape"), /fixed/); assert.match(km2.set("follow", "3"), /fixed/);
  assert.equal(km2.set("torch", "z"), "", "a guide key may share a map key (they are never live together)");
  assert.match(km2.set("eat", "t"), /already does "Take the spear or pick"/, "but not with another guide key");
  assert.equal(km2.set("pause", "k"), ""); assert.equal(km2.actionOf("k", "guide"), "pause", "global keys work while guiding too");
  // Space is a global key, so no map action can take it
  assert.match(km2.set("fit", "k"), /already does "Pause"/);
  km2.reset("build"); assert.equal(km2.label("build"), "B");
  km2.clear("zones"); assert.equal(km2.label("zones"), "(no key)"); km2.reset();
  assert.equal(JSON.stringify(km2.custom), "{}");
  // garbage in storage falls back to the defaults
  const bad = store(); bad.m.set("slimeciv.keys", "{not json"); assert.equal(createKeymap(bad).label("build"), "B");
  assert.ok(ACTIONS.length >= 25 && PAN_IDS.length === 4);
  ok("keys: remap persists in storage (not the save), a reload keeps it, clashes and fixed keys are refused, map and guide contexts are separate");
}

// ---- 2. the help overlay reads the table ----
{
  const km = createKeymap(store());
  let html = "";
  const root = { style: {}, set innerHTML(v) { html = v; }, get innerHTML() { return html; }, addEventListener() {} };
  const game = { keymap: km, ui: { help: true } };
  const help = createHelp(root, game);
  help.update();
  assert.match(html, /<kbd>Tab \/ Shift-Tab<\/kbd>/); assert.match(html, /<kbd>F or double-click<\/kbd>/); assert.match(html, /Close \(H \/ \?\)/);
  km.set("follow", "j"); km.set("next", "n"); km.set("panUp", "i");
  help.update();
  assert.match(html, /<kbd>N \/ Shift-Tab<\/kbd>/, "the help follows a remap"); assert.match(html, /<kbd>J or double-click<\/kbd>/);
  assert.match(html, /Middle-drag, I/, "and the walking keys"); assert.match(html, /torch/i); assert.match(html, /Underground/);
  game.ui.help = false; help.update(); assert.equal(root.style.display, "none");
  ok("the help overlay shows the player's keys (remapped Follow, Next, walking) and the underground notes");
}

// ---- 3. accessibility settings ----
{
  assert.deepEqual(loadAccess(() => null), { scale: 1, contrast: false, cb: false, calm: false });
  assert.deepEqual(loadAccess(() => JSON.stringify({ scale: 1.3, contrast: true, cb: true, calm: true })), { scale: 1.3, contrast: true, cb: true, calm: true });
  assert.equal(loadAccess(() => JSON.stringify({ scale: 9, contrast: "yes" })).scale, 1, "an odd scale falls back"); assert.equal(loadAccess(() => "{").contrast, false);
  assert.ok(SCALES.includes(1) && SCALES.length >= 4);
  ok("accessibility: scale, contrast, colour-blind marks, reduced flashing load with safe fallbacks");
}

// ---- 4. autosave: a ring of three for a normal game, one slot for ironman ----
{
  const sim = Sim.create(3), st = memoryStorage();
  assert.equal(AUTO_SLOTS, 3);
  const keys = [];
  for (let d = 1; d <= 5; d++) { sim.tick = d * DAY; keys.push(autosave(st, sim, toJSON(sim))); }
  assert.deepEqual(keys, ["slimeciv.auto.0", "slimeciv.auto.1", "slimeciv.auto.2", "slimeciv.auto.0", "slimeciv.auto.1"], "three slots, the oldest overwritten");
  const l = listAutos(st);
  assert.deepEqual(l.map(a => a.day), [5, 4, 3], "newest first; days 1 and 2 are gone"); assert.ok(l.every(a => a.iron === 0 && a.kb > 10));
  assert.ok(autosaveDue(sim, 4) && !autosaveDue(sim, 5));
  // a full browser: the oldest other slots go until it fits
  const small = memoryStorage(Math.round(toJSON(sim).length * 2.4));
  const ks = []; for (let d = 1; d <= 4; d++) { sim.tick = d * DAY; ks.push(autosave(small, sim, toJSON(sim))); }
  assert.ok(ks.every(k => k), "every save landed even in a small browser: " + ks);
  assert.ok(listAutos(small).length >= 1 && listAutos(small).length <= 2 && listAutos(small)[0].day === 4);
  ok("autosave: a ring of " + AUTO_SLOTS + " slots (newest first), overwrites the oldest, and makes room in a full browser");
}
{
  const sim = Sim.create(3, { ironman: true }), st = memoryStorage();
  assert.equal(sim.ironman, true);
  assert.match(saveRefusal(sim), /no manual save/); assert.match(loadRefusal(sim), /no loading/);
  const normal = Sim.create(3); assert.equal(saveRefusal(normal), ""); assert.equal(loadRefusal(normal), "");
  for (let d = 1; d <= 4; d++) { sim.tick = d * DAY; assert.equal(autosave(st, sim, toJSON(sim)), IRON_KEY); }
  assert.equal([...st.m.keys()].filter(k => !k.endsWith(".meta")).length, 1, "ONE slot for the whole game");
  const l = listAutos(st); assert.equal(l.length, 1); assert.equal(l[0].iron, 1); assert.equal(l[0].day, 4);
  // the flag rides in the save, so Continue brings back an ironman game that still cannot load
  const back = restore(st.get(IRON_KEY));
  assert.equal(back.ironman, true); assert.match(loadRefusal(back), /no loading/); assert.equal(back.hash(), sim.hash(), "the autosave is the whole game");
  // and a normal game's save never turns ironman
  assert.equal(restore(toJSON(normal)).ironman, false);
  ok("ironman: flag at new game, one autosave slot, no manual save or load, the flag survives Continue");
}
console.log("ui_s12 ok");
