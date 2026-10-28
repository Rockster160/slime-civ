// The fuller fauna set (S14, GDD §13.7): the wolf pack and the large grazer. Behaviours only; the rows are in fauna.js (FAUNA) and the generic helpers arrive as `H`
// (walk, nearestVillager, swing, near1, FAUNA, ...) because fauna.js imports this file.
//
// wolf     a pack predator of the highland (else the far meadow). By day it keeps to its ground and eats hoppers (a hungry wolf runs one down; fed, it leaves them alone).
//          In WINTER NIGHTS it widens its range and hunts a LONE villager: someone with no company within LONE_R and no fire close by. It does not attack a group, a
//          fire, or when it is hurt: any two villagers near it, a lit hearth or burning tree within FIRE_R, or health under half sends it running for a spell.
// grazer   a heavy grazer of the marsh and the licks (else the far meadow): slow, 120 health, big meat, hide and bone. Grazes round its herd's home and walks off from
//          anyone who comes close, slowly. Hit, it TURNS on whoever hit it for a while (dangerous cornered) and breaks off when badly hurt. Penned (HUSBANDRY, a bigger pen) it
//          grazes inside the fence like a hopper.
import { DAY } from "./clock.js";
import { NO_T } from "./util.js";
import { isNight, seasonIdx } from "./season.js";

export const LONE_R = 5;           // a villager with nobody within this many cells is alone
export const FIRE_R = 8;           // a wolf will not come this close to a lit fire
export const GROUP_R = 6;          // two villagers within this many cells of a wolf are a group
export const WOLF_SEE = 14;        // how far a wolf notices a hopper or villager by day; in a winter night it hunts farther
export const WOLF_NIGHT = 60;
export const WOLF_LEASH = 46;      // the farthest a pack ranges from its home
export const WOLF_FED = 1.5 * DAY; // ticks a wolf is fed after a hopper
export const TURN_TICKS = 500;     // how long a struck grazer keeps coming at the one who struck it

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** A lit fire within `r` of the creature: a hearth or a burning tree/stump. */
export function fireNear(sim, e, r) {
  for (const f of sim.ents.ofKind("furniture")) if (f.f === "hearth" && f.lit && Math.abs(f.x - e.x) <= r && Math.abs(f.y - e.y) <= r && Math.abs(f.z - e.z) <= 2) return true;
  for (const f of sim.ents.ofKind("flame")) if (Math.abs(f.x - e.x) <= r && Math.abs(f.y - e.y) <= r) return true;
  return false;
}
/** The nearest lit fire within `r` of a creature, as {x,y}, or null. */
function fireSpot(sim, e, r) {
  let best = null, bd = 1e9;
  for (const f of sim.ents.ofKind("furniture")) if (f.f === "hearth" && f.lit && Math.abs(f.x - e.x) <= r && Math.abs(f.y - e.y) <= r) { const d = Math.abs(f.x - e.x) + Math.abs(f.y - e.y); if (d < bd) { bd = d; best = { x: f.x, y: f.y }; } }
  for (const f of sim.ents.ofKind("flame")) if (Math.abs(f.x - e.x) <= r && Math.abs(f.y - e.y) <= r) { const d = Math.abs(f.x - e.x) + Math.abs(f.y - e.y); if (d < bd) { bd = d; best = { x: f.x, y: f.y }; } }
  return best;
}
const villagersNear = (sim, e, r) => sim.ents.ofKind("villager").filter(v => Math.abs(v.z - e.z) <= 3 && cheb(e, v) <= r);
/** Is the villager alone (no other villager within LONE_R) and away from fire? */
export function isLone(sim, v) {
  for (const o of sim.ents.ofKind("villager")) if (o !== v && Math.abs(o.z - v.z) <= 2 && cheb(o, v) <= LONE_R) return false;
  return !fireNear(sim, v, 6);
}

export function wolf(sim, e, H) {
  const row = H.FAUNA.wolf, t = sim.tick, r = sim.rng.stream("fauna2"), home = e.home;
  const winterNight = isNight(t) && seasonIdx(t) === 3;
  // afraid: a group, a fire, or badly hurt -> run for a while, then rest
  if (e.st === "flee") {
    const th = H.nearestVillager(sim, e, 14) || fireSpot(sim, e, FIRE_R + 3);
    if (e.n > 0 && th) { e.n--; H.walk(sim, e, th.x, th.y, true, false); e.cd = row.flee.tpc; if (e.n === 0) { e.st = "rest"; e.cd = row.flee.rest; } return; }
    e.st = "rest"; e.cd = row.flee.rest; return;
  }
  if (e.hp < 0.5 * e.mhp || villagersNear(sim, e, GROUP_R).length >= 2 || fireNear(sim, e, FIRE_R)) { e.st = "flee"; e.n = row.flee.steps; e.cd = 1; return; }
  if (e.st === "rest") e.st = "idle";
  // a lone villager on a winter night
  const see = winterNight ? WOLF_NIGHT : WOLF_SEE, hd = Math.max(Math.abs(e.x - home[0]), Math.abs(e.y - home[1]));
  if (winterNight && hd <= WOLF_LEASH) {
    const prey = H.nearestVillager(sim, e, see, (v) => isLone(sim, v));
    if (prey) {
      if (H.near1(e, prey)) { e.st = "attack"; if (t >= e.ak) { e.ak = t + row.cd; H.swing(sim, e, prey); } e.cd = 6; return; }
      e.st = "hunt"; e.cd = H.chase(sim, e, prey.x, prey.y, prey.z) ? row.chase : 20; return;
    }
  }
  // a hungry wolf runs a hopper down
  if (t >= (e.fd || 0)) {
    let best = null, bd = 1e9;
    for (const h of sim.ents.ofKind("fauna")) {
      if (h.sp !== "hopper" || h.tame || h.st === "held" || Math.abs(h.z - e.z) > 3 || cheb(h, e) > see) continue;
      const d = Math.abs(h.x - e.x) + Math.abs(h.y - e.y);
      if (d < bd) { bd = d; best = h; }
    }
    if (best) {
      if (H.near1(e, best)) {
        sim.ents.remove(best.id); sim.cache.iv++;
        e.fd = t + WOLF_FED; e.st = "idle"; e.cd = 40;
        for (const o of sim.ents.ofKind("fauna")) if (o.sp === "wolf" && o.pk === e.pk && o !== e) o.fd = Math.max(o.fd || 0, t + WOLF_FED / 2);          // the pack shares the kill
        return;
      }
      e.st = "hunt"; e.cd = H.chase(sim, e, best.x, best.y, best.z) ? row.chase : 20; return;
    }
  }
  // otherwise keep to the pack's ground
  if (hd > row.roam + 4) { e.st = "return"; e.cd = H.chase(sim, e, home[0], home[1], home[2]) ? row.tpc : 30; return; }
  e.st = "patrol";
  if (e.tx === NO_T) {
    e.cd = r.range(40, 160);
    const tx = home[0] + r.range(-row.roam, row.roam), ty = home[1] + r.range(-row.roam, row.roam);
    if (sim.world.standZ(tx, ty) >= 0) { e.tx = tx; e.ty = ty; }
    return;
  }
  if ((e.x === e.tx && e.y === e.ty) || !H.walk(sim, e, e.tx, e.ty, false, false)) { e.tx = NO_T; e.cd = r.range(30, 90); return; }
  e.cd = row.tpc;
}

export function grazer(sim, e, H) {
  const row = H.FAUNA.grazer, t = sim.tick, r = sim.rng.stream("fauna2"), home = e.home;
  if (e.tame) {                                                          // penned: graze inside the fence (the hopper's rule)
    const pn = H.penById(sim, e.pen);
    if (!pn) { e.tame = 0; e.pen = 0; return; }
    if (e.tx === NO_T || e.tx < pn.x0 || e.tx > pn.x1 || e.ty < pn.y0 || e.ty > pn.y1) { e.cd = r.range(40, 160); e.tx = r.range(pn.x0, pn.x1); e.ty = r.range(pn.y0, pn.y1); return; }
    if ((e.x === e.tx && e.y === e.ty) || !H.walk(sim, e, e.tx, e.ty, false, false, pn)) { e.tx = NO_T; e.cd = r.range(30, 90); return; }
    e.cd = row.tpc;
    return;
  }
  if (e.st === "turn") {                                                 // struck: come back at whoever did it
    const tg = sim.ents.get(e.tg);
    if (!tg || t > e.tu || e.hp < 0.35 * e.mhp) { e.st = e.hp < 0.35 * e.mhp ? "flee" : "idle"; e.n = row.flee.steps + 4; e.tg = 0; e.cd = 10; return; }
    if (H.near1(e, tg)) { if (t >= e.ak) { e.ak = t + row.cd; H.swing(sim, e, tg); } e.cd = 6; return; }
    e.cd = H.chase(sim, e, tg.x, tg.y, tg.z) ? row.chase : 20;
    return;
  }
  if (e.st === "flee") {
    const th = H.nearestVillager(sim, e, 12);
    if (e.n > 0 && th) {
      e.n--;
      if (!H.walk(sim, e, th.x, th.y, true, false) && Math.abs(th.x - e.x) + Math.abs(th.y - e.y) <= 2) { e.st = "turn"; e.tg = th.id; e.tu = t + TURN_TICKS / 2; e.cd = 4; return; }      // cornered: nowhere to go, so it turns
      e.cd = row.flee.tpc; if (e.n === 0) { e.st = "rest"; e.cd = row.flee.rest; } return;
    }
    e.st = "rest"; e.cd = row.flee.rest; return;
  }
  const th = H.nearestVillager(sim, e, row.flee.r);
  if (th && e.st !== "rest") { e.st = "flee"; e.n = row.flee.steps; e.cd = 1; return; }
  if (e.st === "rest") e.st = "idle";
  if (e.tx === NO_T) {
    e.cd = r.range(60, 220);
    const tx = home[0] + r.range(-row.roam, row.roam), ty = home[1] + r.range(-row.roam, row.roam);
    if (sim.world.standZ(tx, ty) >= 0) { e.tx = tx; e.ty = ty; }
    return;
  }
  if ((e.x === e.tx && e.y === e.ty) || !H.walk(sim, e, e.tx, e.ty, false, false)) { e.tx = NO_T; e.cd = r.range(40, 120); return; }
  e.cd = row.tpc;
}
