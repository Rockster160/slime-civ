// Short "what is it doing" words for floating labels (UI_SPEC §12.1, §12.2): one gerund, no sentences. Pure; reads only the entity's own fields.
const DOING = {
  eat: "Eating", drink: "Drinking", sleep: "Sleeping", huddle: "Huddling", leisure: "Resting", forage: "Foraging", dry: "Drying", build_bed: "Building", build_rack: "Building",
  build_site: "Building", craft_site: "Making", deconstruct: "Taking down", dig: "Digging", mine: "Mining", cut: "Gathering", chop: "Chopping", haul: "Hauling", store: "Storing",
  goto: "Walking", tend_fire: "Tending fire", fire_kiln: "Firing kiln", burn_charcoal: "Burning", smelt: "Smelting", smoke: "Smoking", make_tool: "Making", fetch_water: "Fetching water",
  tinker: "Tinkering", explore: "Exploring", cook: "Cooking", haul_wagon: "Hauling", flee: "Fleeing", defend: "Fighting", mend: "Resting", convalesce: "Resting", tend_sick: "Nursing", hunt: "Hunting",
  till: "Tilling", sow: "Sowing", water_field: "Watering", harvest: "Harvesting", fence: "Fencing", fodder: "Feeding", slaughter: "Butchering", capture: "Catching", scout: "Scouting", strike: "Striking", disarm: "Disarming",
};
/** A villager's current doing as one word ("" when walking about with nothing to say). */
export function doingWord(v) {
  if (v.slp === 1) return "Sleeping";
  if (v.job && DOING[v.job.k]) return DOING[v.job.k];
  if (v.action && v.action.type === "Move") return "Walking";
  return v.job || v.action ? "Working" : "Idle";
}
const FAUNA_DOING = {
  hopper: { idle: "Grazing", flee: "Fleeing" },
  wolf: { attack: "Biting", hunt: "Stalking", flee: "Fleeing", rest: "Watching", patrol: "Prowling" },
  grazer: { turn: "Charging", flee: "Walking off", idle: "Grazing" },
  thornback: { attack: "Mauling", hunt: "Hunting", retreat: "Limping", return: "Heading home", patrol: "Patrolling", idle: "Resting" },
  crawler: { attack: "Biting", hunt: "Swarming", raid: "Raiding", retreat: "Limping", return: "Heading home", patrol: "Skittering" },
  coreback: { attack: "Mauling", hunt: "Charging", raid: "Raiding", retreat: "Limping", return: "Heading home", patrol: "Prowling" },
  spitter: { attack: "Spitting", hunt: "Stalking", raid: "Raiding", retreat: "Limping", return: "Heading home", patrol: "Lurking" },
  guardian: { attack: "Smiting", hunt: "Advancing", return: "Heading back", patrol: "Guarding" },
};
const NAME = { hopper: "Hopper", wolf: "Wolf", grazer: "Grazer", thornback: "Thornback", crawler: "Crawler", coreback: "Coreback", spitter: "Spitter", guardian: "Guardian" };
/** "Wolf: Stalking", "Hopper: Grazing" (a penned one says "Penned"). */
export function faunaWord(e) {
  const nm = NAME[e.sp] || "Creature";
  if (e.tame) return nm + ": Penned";
  const w = (FAUNA_DOING[e.sp] || {})[e.st] || "Watching";
  return nm + ": " + w;
}
