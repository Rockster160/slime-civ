// Old-format saves, kept so the migration test (tests/migrate.js) has something real to load: one per save version the game ever wrote, each made from
// a current fixture by taking away what that version did not have. Run once when a version is added (or by hand); the files are committed.
//   node tools/make_legacy.js
import "../tests/legacy.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)), FIX = join(here, "..", "tests", "fixtures"), OUT = join(here, "..", "tests", "oldsaves");
mkdirSync(OUT, { recursive: true });
const load = (n) => JSON.parse(readFileSync(join(FIX, n + ".json"), "utf8"));
const put = (name, d) => { writeFileSync(join(OUT, name + ".json"), JSON.stringify(d)); console.log("wrote oldsaves/" + name + " (v" + d.v + ")"); };

/** v6 (S7a..S11): what S12 added is absent: the cave-in state, the biome flag, ironman. */
function asV6(d) { delete d.ug; delete d.bio; delete d.ironman; d.v = 6; return d; }
/** v5 (S6): no discovery state, no villager familiarity, no creatures, expeditions, farming, crews; blueprints without instances. */
function asV5(d) {
  asV6(d); d.v = 5;
  delete d.disc; delete d.wild; delete d.exp; delete d.farm; delete d.crews;
  for (const e of d.entities.list) if (e.kind === "villager") delete e.fam;
  if (d.bps) { delete d.bps.inst; delete d.bps.ni; }
  return d;
}
/** v3 (S4): skills gather / chop / build, an appetite trait, none of the S5 fields. */
function asV3(d) {
  asV5(d); d.v = 3;
  for (const e of d.entities.list) if (e.kind === "villager") {
    e.sk = { gather: { xp: 30, wk: 0 }, chop: { xp: 2, wk: 0 }, build: { xp: 5, wk: 0 } };
    e.t.appetite = 1.05; delete e.t.stamina; delete e.t.drive; delete e.t.leisure; delete e.ws; delete e.wt; delete e.tch; delete e.cl; delete e.cg;
  }
  delete d.seen; delete d.mine;
  return d;
}
put("v6_settled", asV6(load("settled")));
put("v6_hut", asV6(load("hut")));
put("v5_start", asV5(load("start")));
put("v4_start", Object.assign(asV5(load("start")), { v: 4 }));
put("v3_start", asV3(load("start")));
