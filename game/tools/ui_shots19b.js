// 6.19b screenshots: the angled map in day and night, a mine in Slice at -2 and -5, a slime underground with its depth badge, build mode painting walls.
//   node tools/build.js && node tools/ui_shots19b.js     -> tmp/ui-s19b-*.png
const pw = await import(process.env.PLAYWRIGHT || "/Users/zoro/code/slime-village/node_modules/playwright/index.mjs");
const { chromium } = pw.default || pw;
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(pathToFileURL(join(root, "slime-civ.html")).href + "?tools=all&seed=1&spawn=64,64");
await page.waitForFunction(() => window.__game);
const G = (f, a) => page.evaluate(f, a), shot = async (n) => { await page.waitForTimeout(700); await page.screenshot({ path: join(root, "tmp", "ui-s19b-" + n + ".png") }); };
const load = async (f) => { await page.evaluate((j) => localStorage.setItem("slimeciv.save.1", j), readFileSync(join(root, "tests", "fixtures", f + ".json"), "utf8")); await page.keyboard.press("Shift+O"); await page.waitForTimeout(600); await G(() => { __game.state.paused = true; __game.clearSelection(); __game.ui.digest = null; __game.ui.concerns = []; }); };
await load("settled");
await G(() => { const g = __game; g.cam.zoom = 22; g.cam.x = g.sim.site.x + 6; g.cam.y = g.sim.site.y; g.setLevel(g.D - 1); });
await shot("camp-day");
await G(() => { const s = __game.sim; while (((s.tick + 4.2 * 12000) % 12000) / 12000 < 0.88) s.step(); });
await shot("camp-night");
await load("mine");
const MF = await G(() => { const g = __game, w = g.sim.world, M = g.M, S = g.sim.site; for (let y = S.y - 14; y < S.y + 16; y++) for (let x = S.x + 6; x < S.x + 56; x++) for (let z = 3; z < g.sim.stock.z - 3; z++) if (w.mat(x, y, z) === M.MALACHITE && w.mat(x - 1, y, z) === M.AIR && g.seenAt(x, y, z)) return { x, y, z }; return null; });
for (const d of [2, 5]) {
  await G(([f, d]) => { const g = __game; g.cam.zoom = 26; g.cam.x = f.x - 3; g.cam.y = f.y; g.setLevel(g.sim.stock.z - d); }, [MF, d]);
  await shot("mine-slice-" + d);
}
await G((f) => { const g = __game, v = g.sim.ents.ofKind("villager")[0]; g.sim.ents.move(v, f.x - 2, f.y, f.z); g.cam.zoom = 30; g.cam.x = f.x - 2; g.cam.y = f.y; g.ui.follow = 0; g.selectOnly(v.id); }, MF);       // selecting a slime underground switches the view to its level
await shot("underground-badge");
await load("settled");
await G(() => { const g = __game; g.cam.zoom = 22; g.cam.x = g.sim.site.x; g.cam.y = g.sim.site.y; g.setMode("build"); g.ui.build.tool = "wall"; });
const [ax, ay] = await G(() => __game.cam.toScreen(60.5, 58.5)), [bx, by] = await G(() => __game.cam.toScreen(68.5, 64.5));
await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move((ax + bx) / 2, (ay + by) / 2, { steps: 5 }); await page.mouse.move(bx, by, { steps: 5 });
await shot("build-walls"); await page.mouse.up();
await browser.close();
