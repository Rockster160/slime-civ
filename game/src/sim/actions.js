// The one action pipeline (build plan rule 3).
//
// An action is plain data stored on the villager (`ent.action`), so it saves,
// hashes and replays like everything else. ONE runner - runAction() - advances
// whatever action a villager has by one tick. The AI controller (later: the job
// board; in C2: possession input) only decides *which* action to assign; it
// never moves a villager itself.
//
// Adding an action = adding an entry to ACTIONS with step(sim, ent, a) that
// returns RUNNING, DONE or FAILED. On FAILED set a.blocker to an enum string
// (NO_PATH, BLOCKED, ...) so the Why panel can say why (rule 4).
import { World } from "./world.js";
import { restricted } from "./lair.js";
import { avoids } from "./memory.js";
import { wagonStep } from "./wagon.js";

export const TICKS_PER_CELL = 6;              // walking speed: 3.3 cells/s at 1x (placeholder until traits)
export const ST = { RUNNING: 0, DONE: 1, FAILED: 2 };

// ---- constructors (the only places that know action shapes) ----

/** Walk to a cell. `path` may be preset by a caller that already searched. */
export function Move(tx, ty, tz, path = null, ticksPerCell = TICKS_PER_CELL) {
  return { type: "Move", tx, ty, tz, path, i: 0, cd: ticksPerCell, tpc: ticksPerCell, blocker: null };
}
/** Stand still for `ticks`. */
export function Idle(ticks) { return { type: "Idle", wait: ticks, blocker: null }; }
/** Pick a random reachable spot nearby, walk there, rest a moment. */
/** How far (cells, each way) from the camp a villager at leisure wanders. */
export const WANDER_LEASH = 30;
export function Wander() { return { type: "Wander", phase: 0, move: null, wait: 0, blocker: null }; }

export const ACTIONS = {
  Move: {
    step(sim, ent, a) {
      if (a.path === null) {
        const r = sim.path.find(World.idx(ent.x, ent.y, ent.z), World.idx(a.tx, a.ty, a.tz));
        if (!r.ok) { a.blocker = r.blocker; return ST.FAILED; }
        a.path = r.path;
      }
      if (a.i >= a.path.length) return ST.DONE;
      if (--a.cd > 0) return ST.RUNNING;
      const [x, y, z] = World.xyz(a.path[a.i]);
      // Terrain may have changed since the path was made (a dig, a placed block).
      if (!sim.world.isWalkable(x, y, z)) { a.blocker = "BLOCKED"; return ST.FAILED; }
      const z0 = ent.z;
      sim.ents.move(ent, x, y, z);
      a.i++; a.cd = ent.wg ? Math.max(1, Math.round(a.tpc * wagonStep(sim, ent, z0))) : a.tpc;      // S15: pushing or pulling a wagon (wagon.js) slows the walk
      return a.i >= a.path.length ? ST.DONE : ST.RUNNING;
    },
  },

  Idle: {
    step(sim, ent, a) { return --a.wait > 0 ? ST.RUNNING : ST.DONE; },
  },

  Wander: {
    step(sim, ent, a) {
      if (a.phase === 0) {                         // pick a target
        const r = sim.rng.stream("wander:" + ent.id);
        for (let tries = 0; tries < 3; tries++) {
          let tx = ent.x + r.range(-20, 20), ty = ent.y + r.range(-20, 20);
          if (!ent.poss && sim.site) {                // S18b: idle wandering is tethered to the camp. On the 12000-tick day leisure fills hours, and an unbounded random walk carried villagers 300 cells away, out of reach of water (they died of thirst)
            tx = Math.max(sim.site.x - WANDER_LEASH, Math.min(sim.site.x + WANDER_LEASH, tx));
            ty = Math.max(sim.site.y - WANDER_LEASH, Math.min(sim.site.y + WANDER_LEASH, ty));
          }
          const tz = sim.world.standZ(tx, ty);
          if (tz < 0 || (tx === ent.x && ty === ent.y) || (!ent.poss && (restricted(sim, tx, ty, tz) || avoids(sim, ent, tx, ty, tz)))) continue;      // S8: idle wandering keeps out of the thornback's ground too
          const p = sim.path.find(World.idx(ent.x, ent.y, ent.z), World.idx(tx, ty, tz));
          if (!p.ok) continue;
          a.move = Move(tx, ty, tz, p.path, ent.mv || TICKS_PER_CELL);
          a.phase = 1;
          return ST.RUNNING;
        }
        a.wait = 20; a.phase = 2;                  // nothing reachable this time
        return ST.RUNNING;
      }
      if (a.phase === 1) {
        const s = ACTIONS.Move.step(sim, ent, a.move);
        if (s === ST.RUNNING) return ST.RUNNING;
        a.wait = sim.rng.stream("wander:" + ent.id).range(10, 60);   // done or blocked: rest either way
        a.phase = 2; a.move = null;
        return ST.RUNNING;
      }
      return --a.wait > 0 ? ST.RUNNING : ST.DONE;
    },
  },
};

/** Advance a villager's current action one tick; clears it when finished. */
export function runAction(sim, ent) {
  const a = ent.action;
  const s = ACTIONS[a.type].step(sim, ent, a);
  if (s !== ST.RUNNING) ent.action = null;
  return s;
}
