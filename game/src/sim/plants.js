// Plants are entities {kind:"plant", species, x,y,z, yield, nx, rv, rt}.
//   berry   : bush. yield 0..BERRY_MAX; regrows 1 per BERRY_REGROW in spring-autumn; frost strips it in winter (§11.17)
//   tuft    : grass tuft, yield 1 -> 0 when cut, regrows after TUFT_REGROW (leaf-bed material)
//   tree    : sets F.OBSTACLE on its cell; felled -> sapling, which regrows into a tree after TREE_REGROW
//   sapling : a tree on the way back
// rv/rt are the reservation (holder villager id, last-progress tick); see jobs.js.
import { DAY } from "./clock.js";
import { F } from "./world.js";
import { berrySeason, seasonIdx } from "./season.js";

export const BERRY_MAX = 4;
export const BERRY_REGROW = Math.floor(DAY * 1.5);   // ticks per berry regrown
export const TUFT_REGROW = DAY * 8;
export const ROOT_REGROW = DAY * 4;                  // a dug-over patch recovers faster than a cut tuft: roots are the winter larder
export const TREE_REGROW = DAY * 25;                 // "slowly": a quarter of a year

export function newPlant(ents, species, x, y, z) {
  const yield_ = species === "tree" ? 4 : species === "berry" ? BERRY_MAX : species === "tuft" ? 1 : 0;
  return ents.add("plant", { species, x, y, z, yield: yield_, nx: 0, rv: 0, rt: 0 });
}

/** Every 100 ticks: regrow berries/tufts, mature saplings. Iterates in id order. */
export function growPlants(sim) {
  const t = sim.tick, season = berrySeason(t);
  const plants = sim.ents.ofKind("plant");
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    if (p.species === "berry") {
      if (p.yield < BERRY_MAX && season && t >= p.nx) { p.yield++; p.nx = t + BERRY_REGROW; }
    } else if (p.species === "tuft") {
      if (p.yield === 0 && t >= p.nx) p.yield = 1;
    } else if (p.species === "sapling") {
      if (t >= p.nx) {
        const here = sim.ents.at(p.x, p.y, p.z);
        let free = true;
        for (const id of here) if (id !== p.id) { free = false; break; }   // an item/villager on the cell: try later
        if (free) {
          p.species = "tree"; p.yield = 4;
          sim.world.setFlags(p.x, p.y, p.z, sim.world.flags(p.x, p.y, p.z) | F.OBSTACLE);
        } else p.nx = t + DAY;
      }
    }
  }
}

/** First tick of winter: frost takes whatever fruit is left (§11.7 winter effects). */
export function frostBerries(sim) {
  for (const p of sim.ents.ofKind("plant")) if (p.species === "berry") { p.yield = 0; p.nx = 0; }
}

/** Fell a tree: it becomes a sapling and its cell is walkable again. */
export function fellTree(sim, p) {
  p.species = "sapling"; p.yield = 0; p.nx = sim.tick + TREE_REGROW; p.rv = 0;
  sim.world.setFlags(p.x, p.y, p.z, sim.world.flags(p.x, p.y, p.z) & ~F.OBSTACLE);
}
