// The simulation: pure state + step(). No DOM, no real time, no Math.random.
//
// Everything that changes the world from outside goes through apply(cmd), which
// stamps the command with the current tick and appends it to the command log.
// Same seed + same command log => same state at every tick (tests/determinism).
import { Rng } from "./rng.js";
import { Entities } from "./entities.js";
import { World, M, F } from "./world.js";
import { generateWorld, WORLD, activateAround } from "./worldgen.js";
import { Pathfinder } from "./path.js";
import { Hasher } from "./hash.js";
import { runAction } from "./actions.js";
import { control } from "./controller.js";
import { POSSESS_COMMANDS, collapseCheck } from "./possess.js";
import { DAY, DUR_DAY } from "./clock.js";
import { dayF, WINTER_START, isNight, winterAhead } from "./season.js";
import { newCache, spoilDaily } from "./items.js";
import { newBoard, updateBoard, updateKeeps, village } from "./board.js";
import { newChron, once } from "./chronicle.js";
import { growPlants, frostBerries } from "./plants.js";
import { updateNeeds, NEED_STEP, worstUrgency } from "./villager.js";
import { addFounder, foundColony, breedDaily, kill, refreshDerived } from "./population.js";
import { releaseJob, RES_EXPIRY } from "./jobstate.js";
import { resetDay, rustDay } from "./skills.js";
import { socialTick, peopleDaily } from "./people.js";
import { decay, DECAY_EVERY } from "./memory.js";
import { ORDER_COMMANDS } from "./orders.js";
import { Rooms } from "./rooms.js";
import { BP_COMMANDS, newBps, autoBuild, instanceTick } from "./blueprint.js";
import { eraseGhosts, markDeconstruct } from "./build.js";
import { roomMilestones } from "./roomeval.js";
import { PURPOSES } from "./purposes.js";
import { newSeen, initSeen, watch, seenRle } from "./seen.js";
import { chunkTick, ACT_R, chunkMeta, hookEntities } from "./chunks.js";
import { newMine, mineTick, MINE_COMMANDS } from "./mine.js";
import { newDisc, updatePressure, knowledgeTick } from "./knowledge.js";
import { packTick } from "./gear.js";
import { shelterBlueprints } from "./shelter.js";
import { eventsDaily } from "./events.js";
import { fireTick } from "./fire.js";
import { siteTick } from "./discovery.js";
import { autoHearth } from "./hearth.js";
import { stationsTick } from "./craft.js";
import { DISC_COMMANDS } from "./disccmd.js";
import { newWild, faunaTick, faunaDaily, fearStep, FEAR_AT } from "./fauna.js";
import { newExp, expeditionTick, EXP_COMMANDS } from "./expedition.js";
import { newFarm, FARM_COMMANDS, farmDaily, sproutDaily } from "./farm.js";
import { floraDaily } from "./plants.js";
import { penDaily } from "./husbandry.js";
import { CAMP } from "./board.js";
import { newCrews, crewTick, CREW_COMMANDS } from "./crews.js";
import { newUg } from "./underground.js";
import { ugTick, ugAuto } from "./cavein.js";
import { newDepth } from "./depth.js";
import { illTick, illDaily } from "./disease.js";
import { newZones, ZONE_COMMANDS, yardTick, YARD_PERIOD } from "./yard.js";
import { SCOUT_COMMANDS, landmarkTick } from "./scout.js";
import { newTrp, trapStep, trapTick } from "./traps.js";
import { ownDef } from "./core.js";
import { newCm, CM_COMMANDS } from "./cm.js";

export const START_VILLAGERS = 7;

export class Sim {
  /** @param {number} seed  @param {{villagers?: number, biomes?: boolean, depth?: boolean, ironman?: boolean}} [opts] villagers: 0 for a bare world (used by load); biomes: false regrows a world made before S12's biome pass; ironman: one autosave slot, no manual load (UI rule, saved) */
  static create(seed, opts = {}) {
    const biomes = opts.biomes !== undefined ? opts.biomes : WORLD.biomes, depth = opts.depth !== undefined ? opts.depth : WORLD.depth, g = generateWorld(seed, { biomes, depth, spawn: opts.spawn, pond: opts.pond });             // S16: endless land; the spawn search (spawn.js) moved the camp to a fair start if the origin was not one (§11.10)
    const s = new Sim(seed, g.world, g.ents);
    s.site = g.world.site;
    if (!opts.restore) activateAround(s.world, s.ents, s.def, s.site.x, s.site.y, ACT_R, 0);     // the land round the camp grows its flora (a loaded save lists its own active chunks)
    s.bio = biomes ? 1 : 0;
    s.pond = s.def.pond ? 1 : 0;
    s.dp = newDepth(depth);
    s.ironman = !!opts.ironman;
    s.world.beginLog();                       // everything from here on is a save delta
    // The starting stockpile: a 6x6 zone in the middle of the clearing (§11.16 pile at camp).
    const SITE = s.site;
    s.stock = { x0: SITE.x - 2, y0: SITE.y - 2, x1: SITE.x + 3, y1: SITE.y + 3, z: s.world.standZ(SITE.x, SITE.y) };
    if (!opts.restore) initSeen(s);           // the surface round the camp is known from the start; the rock below is not
    if (opts.restore) { /* the save brings its villagers */ }
    else if (opts.villagers === undefined) foundColony(s, START_VILLAGERS);
    else for (let i = 0; i < opts.villagers; i++) s.spawnVillager();
    return s;
  }

  constructor(seed, world, ents) {
    this.seed = seed >>> 0;
    this.tick = 0;
    this.rng = new Rng(this.seed);
    this.world = world;
    this.ents = ents;
    this.def = ownDef(world.def); this.site = world.site;     // S16: the generator's definition and the camp (world.site; not a constant any more)
    hookEntities(this);
    this.path = new Pathfinder(this.world);
    this.cmdLog = [];                         // [{t, type, ...}] in application order
    this.stock = null;                        // stockpile zone {x0,y0,x1,y1,z}
    this.board = newBoard();                  // job-board village state (saved, hashed)
    this.chron = newChron();                  // chronicle + dead villagers' records (saved, hashed)
    this.cache = newCache();                  // derived data only; never saved
    this.rooms = new Rooms();                 // derived from cells; only its purpose marks are saved + hashed
    this.bps = newBps();                      // player blueprints (saved + hashed)
    this.seen = newSeen();                    // fog of knowledge (§13.8): only the log of cells seen after generation is saved + hashed
    this.mine = newMine();                    // area-mining designations (saved + hashed)
    this.disc = newDisc();                    // discovery state: seen phenomena, dead ends, curiosities, pressure, trace (saved + hashed)
    this.wild = newWild();                    // fauna bookkeeping: spawned yet?, when the thornback last died (saved + hashed; the creatures are entities)
    this.exp = newExp();                      // expeditions: crews, intent, recall state (saved + hashed)
    this.farm = newFarm();                    // S10: fields, pens, the cold cellar, the spoilage ledger (saved + hashed; the plots are entities)
    this.crews = newCrews();                  // S11: named selections with a default task (saved + hashed)
    this.ug = newUg();                        // S12: cracking cells (cell, first tick), cave-ins so far (saved + hashed; the rules are pure functions of the world)
    this.dp = newDepth(0);                    // S14: world depth (illness, wolves and grazers, the alternates, perturbed properties): on/off switch and the illness ledger (saved + hashed)
    this.zones = newZones();                  // S17: extra stockpile zones the player drew (saved + hashed)
    this.trp = newTrp();                      // 7.21: traps spotted or gone off, gas clouds, ancient workshops seen (saved + hashed; where the traps are is a pure rule: dungeon.js)
    this.cm = newCm();                        // 7.23: cores whose guardian is slain (the choice pending), left, and harvested (saved + hashed)
    this.pond = 0;                            // S17: 1 = this world has the pond at the camp (saved: terrain regrows from the seed)
    this.bio = 1;                             // S12: 1 = the world was grown with biomes (worldgen), 0 = a pre-biome save regrown without them (saved)
    this.ironman = false;                     // S12: a UI rule (single autosave slot, no manual load), saved with the game, never read by the sim itself
    this.lastBlocker = "";                    // why the last rejected command failed (UI feedback only; not saved)
  }

  /** Put a founder-style villager on a free standable cell near the site (or at x,y if given). */
  spawnVillager(x, y) {
    const r = this.rng.stream("spawn");
    for (let tries = 0; tries < 200; tries++) {
      const px = x ?? this.site.x + r.range(-5, 5), py = y ?? this.site.y + r.range(-5, 5);
      const pz = this.world.standZ(px, py);
      if (pz < 0) { if (x !== undefined) return null; continue; }
      return addFounder(this, px, py, pz, r.int(3), r.int(360), 0.25 + 0.45 * r.float());
    }
    return null;
  }

  step() {
    const t = this.tick;
    this.def.fb.now = t;                                       // 7.23: a harvested core's field fades by this clock (core.js)
    if (t % 20 === 7) chunkTick(this);                       // S16: activate the land round the people, unload what is untouched and far
    this.rooms.update(this);
    if (t % 20 === 0) updateBoard(this);
    if (t % 100 === 50) roomMilestones(this);
    if (t % 200 === 100) autoBuild(this);
    if (t % 100 === 60) instanceTick(this);                  // S11: queued additions of a pushed revision wait for the old piece to come down
    if (t % 200 === 0) updateKeeps(this);
    if (t % YARD_PERIOD === 120) yardTick(this);                // S17: a full main yard grows by a ring
    if (t % 100 === 20) landmarkTick(this);                    // S17: far landmarks seen from afar
    if (t % 20 === 10) mineTick(this);
    if (t % 20 === 5) { fireTick(this); stationsTick(this); }   // flames and hearths burn down; lit kilns and mounds count down to their batch
    if (t % 50 === 25) siteTick(this);                        // running fires are phenomena: whoever sees one rolls (witness)
    if (t % 100 === 75) packTick(this);                       // someone at the stockpile takes a basket or backpack
    if (t % 100 === 75) knowledgeTick(this);                  // watching and Teach spread familiarity
    if (t % 100 === 40) socialTick(this);                     // S13: who works beside whom grows close, or clashes
    if (t % 200 === 150) autoHearth(this);                    // the village plans a fire ring when it knows fire and the cold is coming
    if (t % 100 === 0) { growPlants(this); this.tidySites(); }
    if (t % 20 === 3) ugTick(this);                          // S12: cracks, falls, torchlight widening the seen frontier
    if (t % 100 === 90) ugAuto(this);                        // S12: the village shores up, lights and vents through ordinary ghosts
    if (t % 20 === 13) trapTick(this);                       // 7.21: gas clouds thin out
    if (t % 20 === 11) crewTick(this);                       // S11: the dead leave their crews; empty crews go
    if (t % 20 === 9) expeditionTick(this);                  // recall predicates, the crew's stall summary (before mineTick finishes a search)
    faunaTick(this);
    if (t % 100 === 30) illTick(this);                       // S14: contagion between the sick and the well
    if (t % DUR_DAY === 0) this.daily();                        // the chores of the world (spoilage, growth, breeding, illness) run on the flat 1800-tick duration day, not the calendar day (S18b)

    const vs = this.ents.ofKind("villager").slice();       // deaths/births change the live list
    for (const v of vs) {
      if (!this.ents.get(v.id)) continue;
      if (v.mem && v.mem.length && (t + v.id) % DECAY_EVERY === 0) decay(v);       // experiment: memories fade, one staggered pass per slime (memory.js)
      watch(this, v);                                       // look around when they have moved (fog, §13.8)
      if (this.world.flags(v.x, v.y, v.z) & F.DUNGEON) { trapStep(this, v); if (!this.ents.get(v.id)) continue; }      // 7.21: a labyrinth's traps are spotted, or go off
      if ((t + v.id) % NEED_STEP === 0) {
        if (fearStep(this, v) > FEAR_AT && v.job && v.job.k !== "flee" && !v.poss) v.rp = 1;     // afraid: re-plan now (jobs.js genFlee); a guided villager never flees (Steadfast)
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
    sproutDaily(this);                                        // S10: rotted seed near the camp may come up (the sight that teaches farming)
    faunaDaily(this);
    floraDaily(this, CAMP(this.stock));                       // S10: plants age, seed and wither; the map neither fills nor empties
    farmDaily(this);                                          // S10: crops grow by the season
    penDaily(this);                                           // S10: fodder, breeding, starving in the pens
    illDaily(this);                                           // S14: sources of sickness, recovery, death
    updatePressure(this);                                     // pressure tags first: the systemic events read them
    shelterBlueprints(this);                                  // S9: a design for each wall material the village can now work
    eventsDaily(this);
    for (const v of this.ents.ofKind("villager")) { resetDay(v); rustDay(this, v); refreshDerived(this, v); }
    peopleDaily(this);                                        // S13: relationship tiers, fading, titles
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
    h.value(chunkMeta(this));                 // S16: which chunks are active, which changed, when they were last near anyone
    h.value(this.ents.toJSON());
    h.value(this.stock);
    h.value(this.board);
    h.value(this.chron);
    h.value(this.rooms.marks);
    h.value(this.bps);
    h.value(seenRle(this));
    h.value(this.mine);
    h.value(this.disc);
    h.value(this.wild);
    h.value(this.exp);
    h.value(this.farm);
    h.value(this.crews);
    h.value(this.ug);
    h.value(this.dp);
    h.value(this.zones);
    h.value(this.trp);
    h.value(this.cm);
    return h.hex;
  }
}

const COMMANDS = {
  ...ORDER_COMMANDS,
  ...BP_COMMANDS,
  ...POSSESS_COMMANDS,
  ...MINE_COMMANDS,
  ...DISC_COMMANDS,
  ...EXP_COMMANDS,
  ...FARM_COMMANDS,
  ...CREW_COMMANDS,
  ...ZONE_COMMANDS,
  ...SCOUT_COMMANDS,
  ...CM_COMMANDS,
  /** {type:"erase", x0,y0,x1,y1,z}: take ghosts away (delivered materials come back as loose items). */
  erase(sim, c) { return eraseGhosts(sim, c); },
  /** {type:"deconstruct", x0,y0,x1,y1,z}: mark built pieces for villagers to take down (a standing job, ~75% refund, no XP). */
  deconstruct(sim, c) { return markDeconstruct(sim, c); },
  /** {type:"purpose", x,y,z, p}: assign a purpose (purposes.js: shelter | bedroom | kitchen | storage | workshop, or "none") to the room containing that stand cell. */
  purpose(sim, c) { return (c.p === "none" || !!PURPOSES[c.p]) && sim.rooms.setPurpose(sim, c.x, c.y, c.z, c.p); },
  /** {type:"spawn", x, y}: a villager at that column's surface. */
  spawn(sim, c) { return sim.spawnVillager(c.x, c.y) !== null; },
  /** {type:"place", x,y,z,mat}: write a player-placed solid cell. */
  place(sim, c) {
    if (!World.inBounds(c.x, c.y, c.z) || sim.ents.at(c.x, c.y, c.z).length) return false;
    sim.world.set(c.x, c.y, c.z, c.mat, sim.world.flags(c.x, c.y, c.z) | F.PLAYER | F.USED);
    return true;
  },
  /** {type:"dig", x,y,z}: remove a cell (to air). */
  dig(sim, c) {
    if (!World.inBounds(c.x, c.y, c.z) || sim.world.mat(c.x, c.y, c.z) === M.AIR) return false;
    sim.world.set(c.x, c.y, c.z, M.AIR, sim.world.flags(c.x, c.y, c.z) & ~F.PLAYER);
    return true;
  },
};
