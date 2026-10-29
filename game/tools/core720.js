// 7.20 magic cores: the smoke check shared by tools/ui_smoke.js (the check) and the screenshots. It drives the page like a player:
//   the camp's findable core stands 170-205 cells out with a crystal spire; the ground over it carries a mana band on the map and a danger pip on the cell card (a 1-word label);
//   a cell in the wild near the camp has no pip. The map is moved to the spire and shot.
import assert from "node:assert/strict";

const markSeen = (G, c) => G((c) => {
  const g = __game, cell = (x, y, z) => { const k = ((x >> 4) + 32768) * 65536 + ((y >> 4) + 32768); let a = g.sim.seen.b.get(k); if (!a) { a = new Uint8Array(16 * 16 * 24); g.sim.seen.b.set(k, a); } a[(z << 8) | ((y & 15) << 4) | (x & 15)] = 1; };
  const col = (x, y) => { const k = ((x >> 4) + 32768) * 65536 + ((y >> 4) + 32768); let a = g.sim.seen.cs.get(k); if (!a) { a = new Uint8Array(256); g.sim.seen.cs.set(k, a); } if (!a[((y & 15) << 4) | (x & 15)]) { a[((y & 15) << 4) | (x & 15)] = 1; g.sim.seen.ncols++; } };
  for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) { col(c.x + dx, c.y + dy); const h = g.sim.world.hsAt(c.x + dx, c.y + dy); for (let z = Math.max(1, h - 3); z <= Math.min(23, h + 6); z++) cell(c.x + dx, c.y + dy, z); }
  g.sim.seen.ver++;
}, c);

export async function cores(page, { G, ok, shot }) {
  await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(300);
  const sc = await G(() => { const g = __game, c = g.sim.world.def.spawnCore, s = g.sim.site; g.state.paused = true; g.ui.follow = 0; g.clearSelection(); g.setMode("select"); return c ? { x: c.x, y: c.y, z: c.z, h: c.h, d: Math.round(Math.hypot(c.x - s.x, c.y - s.y)) } : null; });
  assert.ok(sc && sc.d >= 165 && sc.d <= 210, "the camp has a findable core 170-205 cells out: " + JSON.stringify(sc));
  await markSeen(G, sc);
  const band = await G((c) => __game.sim.world.manaBand(c.x, c.y, c.h), sc);
  assert.ok(band >= 3, "the map's mana band over the camp's core is 3 or 4: " + band);
  assert.equal(await G(() => { const s = __game.sim.site; return __game.sim.world.manaBand(s.x, s.y, 14); }), 0, "no mana band at the camp");
  // the cell card over the core: a pip with a one-word label
  await G((c) => { const g = __game; g.selectOther({ kind: "cell", x: c.x + 3, y: c.y, z: g.sim.world.hsAt(c.x + 3, c.y) }); }, sc);
  await page.waitForTimeout(500);
  const pip = page.locator("[data-test=danger-pip]");
  assert.ok(await pip.isVisible(), "the cell card over a core shows a danger pip");
  const text = (await pip.innerText()).trim(), b = Number(await pip.getAttribute("data-band"));
  assert.ok(/^\w+$/.test(text) && ["Stirring", "Charged", "Deep", "Heart"].includes(text) && b >= 1, "a one-word label: " + text + " (band " + b + ")");
  // a wild cell near the camp: no pip
  await G(() => { const g = __game, s = g.sim.site; g.selectOther({ kind: "cell", x: s.x + 6, y: s.y + 6, z: g.sim.world.hsAt(s.x + 6, s.y + 6) }); g.sim.seen.ver++; });
  await markSeen(G, await G(() => { const s = __game.sim.site; return { x: s.x + 6, y: s.y + 6 }; }));
  await G(() => { const g = __game, s = g.sim.site; g.selectOther({ kind: "cell", x: s.x + 6, y: s.y + 6, z: g.sim.world.hsAt(s.x + 6, s.y + 6) }); });
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-test=danger-pip]").count(), 0, "wild ground has no pip");
  // the map at the spire
  await G((c) => { const g = __game; g.clearSelection(); g.selectOther({ kind: "cell", x: c.x + 2, y: c.y + 1, z: g.sim.world.hsAt(c.x + 2, c.y + 1) }); g.renderer.setZ(g.D - 1); g.cam.zoom = Math.max(g.cam.minZoom || 10, 18); g.cam.x = c.x + 0.5; g.cam.y = c.y + 0.5; }, sc);
  await page.waitForTimeout(1200);
  await shot(page, "ui-720-core-map");
  await G(() => { __game.clearSelection(); });
  ok("7.20 cores: the camp's core stands " + sc.d + " cells out under a spire; the ground over it is band " + band + " on the map and its cell card shows the pip \"" + text + "\"; wild ground has none");
}

/** The map at a cave network, in a level slice (a screenshot; not part of the smoke). Finds the chunk beyond the camp's home caves with the most cave air. */
export async function network(page, { G, ok, shot }) {
  const at = await G(() => {
    const g = __game, w = g.sim.world, s = g.sim.site; let best = null;
    for (let cx = (s.x >> 4) - 20; cx <= (s.x >> 4) + 20; cx++) for (let cy = (s.y >> 4) - 20; cy <= (s.y >> 4) + 20; cy++) {
      if (Math.hypot(cx * 16 + 8 - s.x, cy * 16 + 8 - s.y) < 140) continue;
      const c = w._get(cx, cy); let n = 0, zs = {};
      for (let i = 0; i < c.flgs.length; i++) if ((c.flgs[i] & 16) && c.mats[i] === 0) { n++; const z = i >> 8; zs[z] = (zs[z] || 0) + 1; }
      if (!best || n > best.n) best = { n, cx, cy, zs };
    }
    const z = Number(Object.keys(best.zs).sort((a, b) => best.zs[b] - best.zs[a])[0]), c = w._get(best.cx, best.cy);
    let pick = null;
    for (let i = 0; i < 256 * 24 && !pick; i++) if ((c.flgs[i] & 16) && c.mats[i] === 0 && (i >> 8) === z && w.isWalkable(best.cx * 16 + (i & 15), best.cy * 16 + ((i >> 4) & 15), z)) pick = { x: best.cx * 16 + (i & 15), y: best.cy * 16 + ((i >> 4) & 15), z };
    return pick && { ...pick, n: best.n };
  });
  assert.ok(at && at.n > 100, "a chunk with a cave network: " + JSON.stringify(at));
  await G((c) => {
    const g = __game, cell = (x, y, z) => { const k = ((x >> 4) + 32768) * 65536 + ((y >> 4) + 32768); let a = g.sim.seen.b.get(k); if (!a) { a = new Uint8Array(16 * 16 * 24); g.sim.seen.b.set(k, a); } a[(z << 8) | ((y & 15) << 4) | (x & 15)] = 1; };
    for (let dy = -26; dy <= 26; dy++) for (let dx = -26; dx <= 26; dx++) for (let z = Math.max(1, c.z - 3); z <= Math.min(23, c.z + 4); z++) cell(c.x + dx, c.y + dy, z);
    g.sim.seen.ver++; g.clearSelection(); g.setLevel(c.z); g.cam.zoom = 16; g.cam.x = c.x + 0.5; g.cam.y = c.y + 0.5;
  }, at);
  await page.waitForTimeout(1500);
  await shot(page, "ui-720-cave-network");
  ok("7.20 caves: a network chunk at " + at.x + "," + at.y + " (" + at.n + " cave cells) shown in a level slice");
}
