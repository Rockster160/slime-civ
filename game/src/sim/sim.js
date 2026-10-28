// The simulation: pure state + step(). No DOM, no real time, no Math.random.
//
// Everything that changes the world from outside goes through apply(cmd), which
// stamps the command with the current tick and appends it to the command log.
// Same seed + same command log => same state at every tick (tests/determinism).
import { Rng } from "./rng.js";
import { Entities } from "./entities.js";
import { World, M, F } from "./world.js";
import { generate, SITE } from "./worldgen.js";
import { Pathfinder } from "./path.js";
import { Hasher } from "./hash.js";
import { runAction } from "./actions.js";
import { control } from "./controller.js";
import { POSSESS_COMMANDS, collapseCheck } from "./possess.js";
import { DAY, LANDING } from "./clock.js";
import { dayF, WINTER_START, isNight, winterAhead } from "./season.js";
import { newCache, spoilDaily } from "./items.js";
import { newBoard, updateBoard, updateKeeps, village } from "./board.js";
import { newChron, once } from "./chronicle.js";
import { growPlants, frostBerries } from "./plants.js";
import { updateNeeds, NEED_STEP, worstUrgency } from "./villager.js";
import { addFounder, foundColony, breedDaily, kill, refreshDerived } from "./population.js";
import { releaseJob, RES_EXPIRY } from "./jobstate.js";
import { resetDay } from "./skills.js";
import { ORDER_COMMANDS } from "./orders.js";
import { Rooms } from "./rooms.js";
import { BP_COMMANDS, newBps, autoBuild } from "./blueprint.js";
import { eraseGhosts, markDeconstruct } from "./build.js";
import { roomMilestones } from "./roomeval.js";

export const START_VILLAGERS = 7;

export class Sim {
  /** @param {number} seed  @param {{villagers?: number}} [opts] villagers: 0 for a bare world (used by load) */
  static create(seed, opts = {}) {
    const s = new Sim(seed);
    generate(s.world, s.ents, s.rng, s.seed);
    s.world.beginLog();                       // everything from here on is a save delta
    // The starting stockpile: a 6x6 zone in the middle of the clearing (§11.16 pile at camp).
    s.stock = { x0: SITE.x - 2, y0: SITE.y - 2, x1: SITE.x + 3, y1: SITE.y + 3, z: s.world.standZ(SITE.x, SITE.y) };
    if (opts.villagers === undefined) foundColony(s, START_VILLAGERS);
    else for (let i = 0; i < opts.villagers; i++) s.spawnVillager();
    return s;
  }

  constructor(seed) {
    this.seed = seed >>> 0;
    this.tick = 0;
    this.rng = new Rng(this.seed);
    this.world = new World();
    this.ents = new Entities();
    this.path = new Pathfinder(this.world);
    this.cmdLog = [];                         // [{t, type, ...}] in application order
    this.stock = null;                        // stockpile zone {x0,y0,x1,y1,z}
    this.board = newBoard();                  // job-board village state (saved, hashed)
    this.chron = newChron();                  // chronicle + dead villagers' records (saved, hashed)
    this.cache = newCache();                  // derived data only; never saved
    this.rooms = new Rooms();                 // derived from cells; only its purpose marks are saved + hashed
    this.bps = newBps();                      // player blueprints (saved + hashed)
  }

  /** Put a founder-style villager on a free standable cell near the site (or at x,y if given). */
  spawnVillager(x, y) {
    const r = this.rng.stream("spawn");
    for (let tries = 0; tries < 200; tries++) {
      const px = x ?? SITE.x + r.range(-5, 5), py = y ?? SITE.y + r.range(-5, 5);
      const pz = this.world.standZ(px, py);
      if (pz < 0) { if (x !== undefined) return null; continue; }
      return addFounder(this, px, py, pz, r.int(3), r.int(360), 0.25 + 0.45 * r.float());
    }
    return null;
  }

  step() {
    const t = this.tick;
    this.rooms.update(this);
    if (t % 20 === 0) updateBoard(this);
    if (t % 100 === 50) roomMilestones(this);
    if (t % 200 === 100) autoBuild(this);
    if (t % 200 === 0) updateKeeps(this);
    if (t % 100 === 0) { growPlants(this); this.tidySites(); }
    if ((t + LANDING) % DAY === 0) this.daily();

    const vs = this.ents.ofKind("villager").slice();       // deaths/births change the live list
    for (const v of vs) {
      if (!this.ents.get(v.id)) continue;
      if ((t + v.id) % NEED_STEP === 0) {
        const cause = updateNeeds(this, v);
        if (cause) { kill(this, v, cause); continue; }
        if (v.poss) collapseCheck(this, v);
        // A personal need turned urgent under a lower-class job: re-plan now (at most every 100 ticks).
        else if (v.action && v.job && t - v.rpt >= 60 && worstUrgency(v, isNight(t)) > 0.3) { v.rp = 1; v.rpt = t; }
      }
      control(this, v);
      if (!v.action) continue;
      const st = runAction(this, v);
      if (!v.action) this.afterAction(v, st);
    }
    this.tick++;
  }

  /** An action ended (done or failed): free what it held, advance orders. */
  afterAction(v, st) {
    const j = v.job;
    releaseJob(this, v);
    if (j && j.c === "order" && v.order && st === 1) {
      if (j.k === "goto") { v.order = null; this.board.ep++; }
      else v.order.done++;
    }
  }

  /** Construction sites whose builder is gone or stalled go away (reservations always expire, §09). */
  tidySites() {
    for (const s of this.ents.ofKind("site").slice()) {
      const h = this.ents.get(s.rv);
      if (!h || !h.job || !h.job.res.includes(s.id) || this.tick - s.rt > RES_EXPIRY) { this.ents.remove(s.id); this.cache.iv++; }
    }
  }

  /** Once per calendar day: spoilage, skill day reset, aging refresh, births, season events. */
  daily() {
    spoilDaily(this);
    for (const v of this.ents.ofKind("villager")) { resetDay(v); refreshDerived(this, v); }
    const vl = village(this);
    // Food weight: runway against what the season ahead asks for (6 days now, ~25 as winter nears).
    breedDaily(this, this.board.runway / (6 + 24 * winterAhead(this.tick)), vl.beds.length);
    const d = Math.floor(dayF(this.tick));
    if (d === WINTER_START) frostBerries(this);
    if (d === 0 && this.tick > DAY) {
      once(this, "firstWinter", "MILESTONE", "The first winter is over: " + vl.n + " survive.", [], { survivors: vl.n }, 2);
      // §18: a winter nobody froze in. Winter ran from 25 days ago to now.
      const froze = Object.values(this.chron.recs).some(r => r.cause === "cold" && r.death >= this.tick - 25 * DAY);
      if (!froze) once(this, "warmWinter", "MILESTONE", "A whole winter passed and nobody died of cold.", [], {}, 2);
    }
  }

  /** The only way outside code changes the sim. Logged with the tick. */
  apply(cmd) {
    const ok = COMMANDS[cmd.type] ? COMMANDS[cmd.type](this, cmd) : false;
    this.rooms.update(this);                  // so a UI reading rooms right after a command sees the new state
    this.cmdLog.push({ t: this.tick, ...cmd });
    return ok;
  }

  /** Canonical state hash: tick, rng counters, terrain deltas, every entity. */
  hash() {
    const h = new Hasher();
    h.u32(this.tick);
    h.value(this.rng.counters());
    h.value(this.world.deltas());
    h.value(this.ents.toJSON());
    h.value(this.stock);
    h.value(this.board);
    h.value(this.chron);
    h.value(this.rooms.marks);
    h.value(this.bps);
    return h.hex;
  }
}

const COMMANDS = {
  ...ORDER_COMMANDS,
  ...BP_COMMANDS,
  ...POSSESS_COMMANDS,
  /** {type:"erase", x0,y0,x1,y1,z}: take ghosts away (delivered materials come back as loose items). */
  erase(sim, c) { return eraseGhosts(sim, c); },
  /** {type:"deconstruct", x0,y0,x1,y1,z}: mark built pieces for villagers to take down (a standing job, ~75% refund, no XP). */
  deconstruct(sim, c) { return markDeconstruct(sim, c); },
  /** {type:"purpose", x,y,z, p}: assign "shelter" | "workshop" | "none" to the room containing that stand cell. */
  purpose(sim, c) { return ["shelter", "workshop", "none"].includes(c.p) && sim.rooms.setPurpose(sim, c.x, c.y, c.z, c.p); },
  /** {type:"spawn", x, y}: a villager at that column's surface. */
  spawn(sim, c) { return sim.spawnVillager(c.x, c.y) !== null; },
  /** {type:"place", x,y,z,mat}: write a player-placed solid cell. */
  place(sim, c) {
    if (!World.inBounds(c.x, c.y, c.z) || sim.ents.at(c.x, c.y, c.z).length) return false;
    sim.world.set(c.x, c.y, c.z, c.mat, sim.world.flags(c.x, c.y, c.z) | F.PLAYER);
    return true;
  },
  /** {type:"dig", x,y,z}: remove a cell (to air). */
  dig(sim, c) {
    if (!World.inBounds(c.x, c.y, c.z) || sim.world.mat(c.x, c.y, c.z) === M.AIR) return false;
    sim.world.set(c.x, c.y, c.z, M.AIR, sim.world.flags(c.x, c.y, c.z) & ~F.PLAYER);
    return true;
  },
};
