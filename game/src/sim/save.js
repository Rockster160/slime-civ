// Save/load: seed + terrain deltas + entities + rng counters + tick + command log.
//
// Terrain is regrown from the seed by Sim.create (a pure function), then the
// changed cells are re-applied. Entities are stored whole and replace the
// regrown flora, so a felled tree stays felled. Path caches are derived data
// and not saved. Anything added to the Sim that affects future ticks must be
// added here AND to Sim.hash(); tests/save_roundtrip.js catches omissions.
import { Sim } from "./sim.js";

export const SAVE_VERSION = 3;

export function snapshot(sim) {
  return {
    v: SAVE_VERSION,
    seed: sim.seed,
    tick: sim.tick,
    rng: sim.rng.counters(),
    deltas: sim.world.deltas(),
    entities: sim.ents.toJSON(),
    stock: sim.stock,
    board: sim.board,
    chron: sim.chron,
    rooms: sim.rooms.marks,
    bps: sim.bps,
    cmds: sim.cmdLog,
  };
}

/** Deep-copies through JSON so the loaded sim shares nothing with the saved one. */
export function toJSON(sim) { return JSON.stringify(snapshot(sim)); }

export function restore(data) {
  data = JSON.parse(typeof data === "string" ? data : JSON.stringify(data));   // never share state with the caller
  if (data.v !== SAVE_VERSION && data.v !== 2) throw new Error("Unsupported save version " + data.v);
  const sim = Sim.create(data.seed, { villagers: 0 });
  sim.world.applyDeltas(data.deltas);
  sim.ents.load(data.entities);
  sim.stock = data.stock; sim.board = data.board; sim.chron = data.chron;
  sim.rng.restore(data.rng);
  sim.rooms.marks = data.rooms || {};
  sim.bps = data.bps || { n: 0, list: [] };
  if (sim.board.sg === undefined) { sim.board.sg = 0; sim.board.ag = 0; }
  sim.rooms.fullRebuild(sim);                 // rooms are derived: rebuilt from cells + doors
  sim.tick = data.tick;
  sim.cmdLog = data.cmds;
  return sim;
}
