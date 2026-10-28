// Phenomena, crafts and eras as DATA (GDD §15.2, §15.3, §15.7, Appendix B). Nothing here runs: discovery.js (witness / tinker)
// and events.js read these rows. To add a discovery (S7b and later) add a row to PHENOMENA, a craft to CRAFTS and, if it
// is an era signature, an ERA entry; no other file needs to know its name.
//
//   phenomenon row = {
//     id, name, craft,                       the craft a villager gains (familiarity) when it fires near them / by their hand
//     needs: { inputs:[tag..],               every tag must be among the tags of the materials present (see TAGS)
//              src:[kind..]?,                what supplies the heat: "flame" (a burning tree / stump), "hearth" (lit), "ember" (cold hearth,
//                                            old coals), "pit", "hand" (no fire). Absent = any
//              verb?, heat:{min?,max?}?, enclosed?:bool, moisture?:{min?,max?}, duration?:ticks },
//     salience 0..1,                         how striking it is to watch (witness roll)
//     produces: {item, n}?,                  what lands in the stockpile / on the ground when it fires at a station (S7b wires these)
//     serves:[demandTag..],                  the pressure tags it answers (witness / tinker relevance)
//     opens: [..],                           capability: the recipes, parts and verbs it makes possible (data for the Almanac)
//     nearMiss: "text",                      directional only, NEVER names the product; shown after >= 3 failures
//     curio: "text",                         the Curiosity line while it is seen and not understood
//     first: (name) => text,                 chronicle "first" line
//     stub: true                             rows S7b fills in: the engine ignores them until stub is removed
//   }
export const NEAR_MISS_AFTER = 3;           // failures before the Almanac states the gap (§15.6)

/** Tags of the materials (what the inputs of a row match). "deadwood" is the free branch lying under a burning tree. */
export const TAGS = {
  stick: ["fuel", "dry", "wood"], log: ["fuel", "dry", "wood"], grass: ["fuel", "dry", "fibre"], deadwood: ["fuel", "dry", "wood"],
  charcoal: ["fuel", "carbon"], clay: ["clay", "plastic", "wet"], fired_clay: ["fired_clay", "hard"], jar: ["fired_clay", "hard", "vessel"],
  copper: ["metal", "heavy", "malleable"],
  malachite: ["malachite", "ore", "heavy"], flint: ["flint", "hard", "sharp"], stone: ["stone", "hard"], dirt: ["soil"],
  berry: ["food", "wet", "seed"], dried: ["food", "dry"], tuber: ["food", "seed"], hopper_meat: ["food", "wet", "meat"],
  // S9
  hide: ["hide", "soft", "wet"], cordage: ["fibre", "strong"], leather: ["hide", "worked"], block: ["stone", "hard", "dressed"],
  stone_axe: ["tool", "edge", "hard"], copper_axe: ["tool", "edge", "metal"], mould: ["mould", "fired_clay", "hard"],
  iron_ore: ["ore", "heavy", "ironore"], coal: ["fuel", "carbon", "coal"], iron: ["metal", "heavy", "iron"], timber: ["wood", "worked"],
  brick: ["fired_clay", "hard", "brick"], smoked_meat: ["food", "dry"],
  // S14 alternates
  salt: ["salt", "hard", "white"], peat: ["peat", "wet", "soil"], dried_peat: ["fuel", "dry", "peat"], herb: ["herb", "bitter", "wet"], bone: ["bone", "hard", "sharp"],
  bone_axe: ["tool", "edge", "hard"], salted_meat: ["food", "dry"], dried_meat: ["food", "dry"],
};
/** Items a tinker uses without using them up (the tool in a "log + axe" experiment). */
export const TOOL_ITEMS = ["stone_axe", "copper_axe", "bone_axe"];
/** How a material looks and feels to a villager: perceived properties, never output tags (§15.4). Used by Curiosity and hint text. */
export const LOOKS = {
  stick: "dry sticks", log: "a dry log", grass: "dry grass", deadwood: "dead branches", charcoal: "black, light, brittle wood",
  clay: "grey-red mud that holds a shape", malachite: "heavy green rock", flint: "hard dark stone with an edge", stone: "plain rock", dirt: "loose soil",
  berry: "soft sweet fruit", dried: "wrinkled dried fruit", tuber: "a starchy root", hopper_meat: "red raw meat",
  fired_clay: "hard red-brown clay that rings when tapped", jar: "a hard red pot", copper: "a bright red-brown bar",
  hide: "a raw skin, stiff and smelly", cordage: "twisted plant strands", leather: "a supple worked skin", block: "a squared stone", stone_axe: "a stone with a haft and an edge",
  mould: "a hollow hard red cup", iron_ore: "heavy rust-red rock", coal: "black stone that shines", iron: "a dull grey lump", timber: "squared wood", brick: "a hard red block", copper_axe: "a bright axe", smoked_meat: "dark dry meat",
  salt: "white gritty crystals that sting a cut", peat: "dark wet turf", dried_peat: "light brown turf blocks", herb: "bitter green leaves from the marsh", bone: "a long hard bone", bone_axe: "a bone with an edge and a haft",
  salted_meat: "grey firm meat", dried_meat: "thin dark strips of meat",
};
/** Which pressure tag a perceived property speaks to: relevance in the tinker weight (§15.4). */
export const TAG_PRESSURE = { salt: "keep_food", peat: "warm", fuel: "warm", plastic: "carry_water", sharp: "tool_edge", hard: "tool_edge", heavy: "tool_edge", ore: "tool_edge", food: "keep_food", meat: "keep_food", hide: "warm", fibre: "warm" };
export const PRESSURE_TAGS = ["warm", "keep_food", "carry_water", "tool_edge"];

/**
 * Crafts: what a villager knows how to do. rank = era order; `era` names the label when held (Hearth -> Hide -> Stone -> Clay
 * -> Timber -> Copper -> Iron, R14). evidence = the physical traces that make a lost craft cheap to rediscover (R11).
 */
export const CRAFTS = {
  FIRE_TENDING: { name: "Keeping a fire", short: "firecraft", era: "Hearth", opens: ["fire ring (hearth)", "warmth", "cooking"],
    evidence: { furniture: ["hearth"], items: [] }, tend: true },
  POTTERY: { name: "Pottery", short: "pottery", era: "Clay", opens: ["fired clay", "kiln pit", "bellows nozzle"], evidence: { furniture: ["kiln"], items: ["fired_clay", "jar"] } },
  VESSELS: { name: "Vessels", short: "vessel making", era: null, opens: ["clay jar", "water jar"], evidence: { furniture: ["waterjar"], items: ["jar"] } },
  CHARCOAL: { name: "Charcoal burning", short: "charcoal", era: null, opens: ["charcoal mound", "carbon fuel"], evidence: { furniture: ["mound"], items: ["charcoal"] } },
  KILN: { name: "Kiln firing", short: "kiln work", era: null, opens: ["level-3 heat", "brick", "brick wall", "brick forge"], evidence: { furniture: ["kiln"], items: ["fired_clay"] } },
  SMELTING: { name: "Smelting copper", short: "smelting", era: "Copper", opens: ["copper ingot", "copper pick", "workbench tools"], evidence: { furniture: [], items: ["copper", "copper_pick"] } },
  // S9: the rest of the twelve (§15.7). Labels: Stone (dressed stone), Hide (hide working), Timber (framing), Iron (forge welding, once iron is smelted).
  DRESS_STONE: { name: "Dressing stone", short: "stone dressing", era: "Stone", opens: ["dressed-stone wall", "stone axe"], evidence: { furniture: [], items: ["block", "stone_axe"] } },
  CORDAGE: { name: "Cordage", short: "cordage", era: null, opens: ["cordage", "bindings", "baskets"], evidence: { furniture: [], items: ["cordage", "basket"] } },
  HIDE_WORKING: { name: "Hide working", short: "hide working", era: "Hide", opens: ["worked hide", "backpack", "hide teepee"], evidence: { furniture: [], items: ["leather", "backpack"] } },
  FRAMING: { name: "Framing", short: "framing", era: "Timber", opens: ["timber", "timber cabin wall", "plank floor"], evidence: { furniture: [], items: ["timber"] } },
  SMOKING: { name: "Smoking food", short: "smoking", era: null, opens: ["covered rack", "smoked meat", "winter larder"], evidence: { furniture: ["smoker"], items: ["smoked_meat"] } },
  CASTING: { name: "Casting", short: "casting", era: null, opens: ["clay moulds", "copper axe", "cast pick"], evidence: { furniture: [], items: ["mould", "copper_axe", "cast_pick"] } },
  HAMMERING: { name: "Cold hammering", short: "cold hammering", era: null, opens: ["copper sheet", "fittings", "lamp housing"], evidence: { furniture: [], items: ["sheet", "fitting"] } },
  IRON_SMELTING: { name: "Smelting iron", short: "iron smelting", era: null, opens: ["iron", "forge"], evidence: { furniture: ["forge"], items: ["iron_ore", "iron"] } },
  // S10: farming and husbandry (no era label: they change what the land gives, not what the village is made of)
  CULTIVATION: { name: "Cultivation", short: "farming", era: null, opens: ["fields", "sowing", "harvest", "crops follow the seasons"], evidence: { furniture: [], items: [] } },
  HUSBANDRY: { name: "Husbandry", short: "animal keeping", era: null, opens: ["hopper pens", "capturing hoppers", "breeding", "slaughter by keep-N"], evidence: { furniture: [], items: [] } },
  // S14: the alternate routes (R13): a second preservation (salt, wind-drying), a second fuel (peat), a second edge (bone), and the herbal remedy for the new sickness
  SALTING: { name: "Salting meat", short: "salting", era: null, opens: ["salted meat", "winter larder without smoke"], evidence: { furniture: [], items: ["salted_meat"] } },
  DRYING: { name: "Drying meat in the wind", short: "meat drying", era: null, opens: ["dried meat", "winter larder without fire"], evidence: { furniture: [], items: ["dried_meat"] } },
  PEAT_CUTTING: { name: "Cutting peat", short: "peat cutting", era: null, opens: ["dried peat", "a fuel where wood is scarce"], evidence: { furniture: [], items: ["dried_peat"] } },
  BONE_WORKING: { name: "Working bone", short: "bone working", era: null, opens: ["bone axe", "an edge without flint"], evidence: { furniture: [], items: ["bone_axe"] } },
  HERBAL: { name: "Herbal remedies", short: "herbal remedies", era: null, opens: ["herbal remedy", "faster recovery from sickness"], evidence: { furniture: [], items: ["herbal_remedy"] } },
  FORGING: { name: "Forge welding", short: "forging", era: "Iron", also: ["IRON_SMELTING"], opens: ["iron pick", "iron axe", "deep rock"], evidence: { furniture: [], items: ["iron_pick", "iron_axe"] } },
};
export const CRAFT_IDS = Object.keys(CRAFTS);

/** Era labels, lowest to highest rank. The label shown is the highest one whose signature craft has a living holder (§15.8). */
export const ERAS = [["Hearth", 1], ["Hide", 2], ["Stone", 3], ["Clay", 4], ["Timber", 5], ["Copper", 6], ["Iron", 7]];
export const ERA_RANK = {};
for (const [n, r] of ERAS) ERA_RANK[n] = r;
export const ERA_SHELTER = { Hearth: "leaf bed, lean-to", Hide: "hide teepee", Stone: "dressed-stone hut", Clay: "daubed hut, fired-clay hearth and kiln",
  Timber: "timber cabin, brick (with kiln firing)", Copper: "copper fittings", Iron: "iron-framed buildings" };
/** The era labels in rank order (K10): the Almanac lists them all and shows when each began. */
export const ERA_FLOW = ERAS.map(e => e[0]);

export const PHENOMENA = {
  FIRE_TENDING: {
    id: "FIRE_TENDING", name: "A fire that can be kept", craft: "FIRE_TENDING",
    needs: { inputs: ["fuel"], src: ["flame", "hearth", "ember"], heat: { min: 1 } },
    salience: 0.8, serves: ["warm"], opens: ["fire ring (hearth)", "warmth", "cooking"],
    produces: null,
    nearMiss: "Dry things catch from the bright, hot thing; a spark in old coals might too.",
    curio: "Something is eating the wood and giving off light and heat.",
    first: (n) => n + " was first to keep a fire.",
  },
  // ---- S7b: clay -> charcoal -> copper. Each fires from its context (data below), by witness or by tinker, never from a flag. ----
  BAKE_CLAY: {
    id: "BAKE_CLAY", name: "Clay that turns hard", craft: "POTTERY",
    needs: { inputs: ["clay"], src: ["hearth", "pit", "flame"], heat: { min: 2 }, duration: 600 },
    salience: 0.7, serves: ["carry_water"], opens: ["pot", "jar", "kiln part"], produces: { item: "fired_clay", n: 1 },
    nearMiss: "Warm and dry, but it still crumbles: it wants more heat, or to be kept hot longer.",
    curio: "The mud that sat by the fire went red-brown and rings when tapped.",
    first: (n) => n + " was first to fire clay.",
  },
  HOLDS_LIQUID: {
    id: "HOLDS_LIQUID", name: "A vessel that holds water", craft: "VESSELS",
    needs: { inputs: ["fired_clay"], src: ["hand"], verb: "soak" },
    salience: 0.6, serves: ["carry_water"], opens: ["clay jar", "water jar", "store grain in jars"], produces: null,
    nearMiss: "It does not melt in the wet, but it does not hold a shape for long either.",
    curio: "Hard red clay stays dry on the inside.",
    first: (n) => n + " saw a baked bowl hold water.",
  },
  SMOULDER_WOOD: {
    id: "SMOULDER_WOOD", name: "Wood that burns without flame", craft: "CHARCOAL",
    needs: { inputs: ["wood"], src: ["pit", "flame", "hearth"], enclosed: true, heat: { min: 1, max: 1 }, duration: 1200 },
    salience: 0.6, serves: ["warm", "tool_edge"], opens: ["charcoal mound", "carbon fuel"], produces: { item: "charcoal", n: 3 },
    nearMiss: "It burns away to ash; it wants less air, not more.",
    curio: "A stump under a heap of earth has been smoking for days and is not gone.",
    first: (n) => n + " was first to burn wood to black coal.",
  },
  KILN_FIRING: {
    id: "KILN_FIRING", name: "Firing in a pit", craft: "KILN",
    needs: { inputs: ["clay"], src: ["pit"], heat: { min: 3 }, duration: 900 },
    salience: 0.6, serves: ["carry_water"], opens: ["level-3 heat", "brick"], produces: { item: "fired_clay", n: 2 },
    nearMiss: "A pit fire is hotter than an open one; the clay wants it hotter still.",
    curio: "Clay lined into a pit made the fire fiercer.",
    first: (n) => n + " was first to fire a pit kiln.",
  },
  SMELT_COPPER: {
    id: "SMELT_COPPER", name: "Rock that bleeds metal", craft: "SMELTING",
    needs: { inputs: ["malachite", "carbon"], src: ["pit"], heat: { min: 4 }, duration: 1200 },
    salience: 0.8, serves: ["tool_edge"], opens: ["copper ingot", "mine copper"], produces: { item: "copper", n: 1 },
    nearMiss: "Green rock changes at a higher heat than your best fire reaches.",
    curio: "A green rock left in the hottest fire only left a stain.",
    first: (n) => n + " made metal.",
  },
  // ---- S9: stone, fibre and hide, timber, smoke, casting, cold hammering, iron ----
  DRESS_STONE: {
    id: "DRESS_STONE", name: "Stone that takes a face", craft: "DRESS_STONE",
    needs: { inputs: ["stone"], src: ["hand"], verb: "hit", duration: 200 },
    salience: 0.5, serves: ["tool_edge"], opens: ["dressed-stone wall", "stone axe"], produces: { item: "block", n: 3 },
    nearMiss: "The rock chips, but not along the line you meant.",
    curio: "A stone struck at the right angle came away flat and clean.",
    first: (n) => n + " was first to dress stone to a face.",
  },
  CORDAGE: {
    id: "CORDAGE", name: "Strands that hold", craft: "CORDAGE",
    needs: { inputs: ["fibre"], src: ["hand"], verb: "bind", duration: 200 },
    salience: 0.4, serves: ["warm"], opens: ["cordage", "bindings", "baskets"], produces: { item: "cordage", n: 3 },
    nearMiss: "The grass holds for a moment, then slips.",
    curio: "Grass twisted on itself does not spring back.",
    first: (n) => n + " twisted fibre into cord.",
  },
  HIDE_WORKING: {
    id: "HIDE_WORKING", name: "A skin that stays supple", craft: "HIDE_WORKING",
    needs: { inputs: ["hide"], src: ["hand"], verb: "press", duration: 200 },
    salience: 0.45, serves: ["warm"], opens: ["worked hide", "backpack", "hide teepee"], produces: { item: "leather", n: 3 },
    nearMiss: "The skin dries stiff and cracks.",
    curio: "A skin that was scraped and worked stayed soft.",
    first: (n) => n + " worked a hide until it stayed soft.",
  },
  FRAMING: {
    id: "FRAMING", name: "Wood that goes in straight", craft: "FRAMING",
    needs: { inputs: ["wood", "edge"], src: ["hand"], verb: "hit", duration: 200 },
    salience: 0.5, serves: ["warm"], opens: ["timber", "timber cabin wall", "plank floor"], produces: { item: "timber", n: 3 },
    nearMiss: "The log splits, but ragged and useless.",
    curio: "A log squared with a good edge sits flat against another.",
    first: (n) => n + " squared a log and framed a wall.",
  },
  SMOKE_FOOD: {
    id: "SMOKE_FOOD", name: "Meat that keeps", craft: "SMOKING",
    needs: { inputs: ["meat"], src: ["smoke"], heat: { min: 1 }, enclosed: true, duration: 1200 },
    salience: 0.5, serves: ["keep_food"], opens: ["covered rack", "smoked meat", "winter larder"], produces: { item: "smoked_meat", n: 3 },
    nearMiss: "The meat dries on the outside and still turns.",
    curio: "Meat hung over a low fire in a closed rack did not go off.",
    first: (n) => n + " smoked the first meat for winter.",
  },
  CASTING: {
    id: "CASTING", name: "Metal that takes a shape", craft: "CASTING",
    needs: { inputs: ["malleable", "mould"], src: ["pit"], heat: { min: 4 }, duration: 600 },
    salience: 0.7, serves: ["tool_edge"], opens: ["clay moulds", "copper axe", "cast pick"], produces: null,
    nearMiss: "The metal slumps in the cup, but never runs to the bottom.",
    curio: "Red metal left in a hollow clay cup in the hottest fire took the cup's shape.",
    first: (n) => n + " poured metal into a mould.",
  },
  HAMMER_NATIVE: {
    id: "HAMMER_NATIVE", name: "Metal that spreads under a stone", craft: "HAMMERING",
    needs: { inputs: ["malleable"], src: ["hand"], verb: "hit", heat: { max: 1 }, duration: 200 },
    salience: 0.5, serves: ["tool_edge"], opens: ["copper sheet", "fittings", "lamp housing"], produces: { item: "sheet", n: 3 },
    nearMiss: "The bar rings, and a little flatter than before.",
    curio: "A red bar struck again and again went thin and wide.",
    first: (n) => n + " beat a copper bar into sheet.",
  },
  SMELT_IRON: {
    id: "SMELT_IRON", name: "Rust-red rock that yields a grey lump", craft: "IRON_SMELTING",
    needs: { inputs: ["ironore", "carbon"], src: ["pit"], heat: { min: 5 }, duration: 1200 },
    salience: 0.8, serves: ["tool_edge"], opens: ["iron", "forge"], produces: { item: "iron", n: 1 },
    nearMiss: "The red rock softens and sinks, but nothing runs: it wants a far hotter fire.",
    curio: "A rust-red rock in the hottest fire only went black.",
    first: (n) => n + " won iron from the rock.",
  },
  // ---- S10: seed in the ground, and animals that stay. Witness routes live in farm.js (a seedling coming up where food rotted) and husbandry.js
  // (hoppers hunted often, or drawn to a heap of grass); CULTIVATION also fires from burying a seed at the camp, below. HUSBANDRY has no material
  // to try (an animal is not an item), so its inputs can never be present at a tinker: it is found by watching.
  CULTIVATION: {
    id: "CULTIVATION", name: "Seed that comes up again", craft: "CULTIVATION",
    needs: { inputs: ["seed"], src: ["hand"], verb: "bury", duration: 1200 },
    salience: 0.65, serves: ["keep_food"], opens: ["fields", "sowing", "harvest", "crops follow the seasons"], produces: null,
    nearMiss: "The buried fruit only rots; it wants time in the ground, and care.",
    curio: "Where food was dropped and left to rot, something green has come up.",
    first: (n) => n + " saw a seed come up where food had rotted, and understood.",
  },
  HUSBANDRY: {
    id: "HUSBANDRY", name: "Animals that stay", craft: "HUSBANDRY",
    needs: { inputs: ["animal"], src: ["hand"], verb: "tend", duration: 1200 },
    salience: 0.6, serves: ["keep_food"], opens: ["hopper pens", "capturing hoppers", "breeding", "slaughter by keep-N"], produces: null,
    nearMiss: "The creature bolts at the first touch; it wants a place to stay and food brought to it.",
    curio: "A young hopper stayed by the grass heap and let someone come close.",
    first: (n) => n + " saw that a hopper will stay where it is fed, and understood.",
  },
  // ---- S14 (R13): alternates. SALT_FOOD and DRY_FOOD are the other two answers to "keep meat for winter" (SMOKE_FOOD is the first); PEAT_FUEL a second fuel; BONE_TOOL a second edge;
  // HERBAL_REMEDY is the answer to the new sickness. Witness routes are in fauna.js (a carcass left by a lick, in the cold wind or among bones), disease.js (the sick near marsh herb) and discovery.js (peat by a fire).
  SALT_FOOD: {
    id: "SALT_FOOD", name: "Meat that salt keeps", craft: "SALTING",
    needs: { inputs: ["salt", "meat"], src: ["hand"], verb: "mix", duration: 200 },
    salience: 0.55, serves: ["keep_food"], opens: ["salted meat", "winter larder without smoke"], produces: { item: "salted_meat", n: 3 },
    nearMiss: "The meat takes a little of the grit and spoils as fast as ever; it wants much more of it, worked in.",
    curio: "Meat left beside the white crust did not go off.",
    first: (n) => n + " rubbed meat with salt and it kept.",
  },
  DRY_FOOD: {
    id: "DRY_FOOD", name: "Meat that the wind keeps", craft: "DRYING",
    needs: { inputs: ["meat"], src: ["smoke"], heat: { max: 0 }, dry: true, enclosed: true, duration: 1200 },
    salience: 0.5, serves: ["keep_food"], opens: ["dried meat", "winter larder without fire"], produces: { item: "dried_meat", n: 3 },
    nearMiss: "Meat hung in damp air only goes slimy; it wants cold, dry wind.",
    curio: "Thin strips of meat left in a cold dry wind went hard and kept.",
    first: (n) => n + " hung meat in the dry wind and it kept.",
  },
  PEAT_FUEL: {
    id: "PEAT_FUEL", name: "Earth that burns", craft: "PEAT_CUTTING",
    needs: { inputs: ["peat"], src: ["hearth", "flame", "ember"], heat: { min: 1 }, duration: 300 },
    salience: 0.55, serves: ["warm"], opens: ["dried peat", "a fuel where wood is scarce"], produces: null,
    nearMiss: "The wet turf only smoulders and steams; it wants to be dry first.",
    curio: "Dark turf left beside the fire dried out and then burned.",
    first: (n) => n + " burned dried turf in the fire ring.",
  },
  BONE_TOOL: {
    id: "BONE_TOOL", name: "A bone with an edge", craft: "BONE_WORKING",
    needs: { inputs: ["bone"], src: ["hand"], verb: "hit", duration: 200 },
    salience: 0.5, serves: ["tool_edge"], opens: ["bone axe", "an edge without flint"], produces: { item: "bone_axe", n: 3 },
    nearMiss: "The bone splinters in the wrong place.",
    curio: "A big bone cracked open had a splinter as sharp as flint.",
    first: (n) => n + " split a bone into an edge.",
  },
  HERBAL_REMEDY: {
    id: "HERBAL_REMEDY", name: "A leaf that eases the sickness", craft: "HERBAL",
    needs: { inputs: ["herb"], src: ["hand"], verb: "soak", duration: 200 },
    salience: 0.6, serves: ["keep_food"], opens: ["herbal remedy", "faster recovery from sickness"], produces: { item: "herbal_remedy", n: 3 },
    nearMiss: "The leaves are bitter and do nothing raw; steeped in water, they might.",
    curio: "A sick one who chewed the marsh herb mended faster.",
    first: (n) => n + " steeped the marsh herb into a remedy.",
  },
  FORGE_WELDING: {
    id: "FORGE_WELDING", name: "Grey lumps that join", craft: "FORGING",
    needs: { inputs: ["iron", "carbon"], src: ["pit"], heat: { min: 5 }, duration: 300 },
    salience: 0.8, serves: ["tool_edge"], opens: ["iron pick", "iron axe", "deep rock"], produces: null,
    nearMiss: "The grey metal glows and sticks a little, then cracks apart: it wants a hotter fire.",
    curio: "Two grey lumps heated white came away as one.",
    first: (n) => n + " welded iron in the forge.",
  },
};
export const PHENOMENON_IDS = Object.keys(PHENOMENA);

/**
 * The authored graph of twelve discoveries (GDD §15.7), as the Almanac shows it: a row is known when a living villager holds one of its crafts, and open when
 * every craft in `after` is known (what its "Needs" column says is in hand). The player sees which are known and which are open, never the answer key.
 */
export const GRAPH = [
  { n: 1, name: "Fire", crafts: ["FIRE_TENDING"], after: [], needs: "a fire to watch" },
  { n: 2, name: "Dressed stone", crafts: ["DRESS_STONE"], after: [], needs: "stone, flint" },
  { n: 3, name: "Cordage and hides", crafts: ["CORDAGE", "HIDE_WORKING"], after: [], needs: "fibre, hides from the hunt" },
  { n: 4, name: "Framing", crafts: ["FRAMING"], after: ["DRESS_STONE"], needs: "wood and an axe" },
  { n: 5, name: "Pottery", crafts: ["POTTERY"], after: ["FIRE_TENDING"], needs: "clay, a hearth" },
  { n: 6, name: "Kiln firing", crafts: ["KILN"], after: ["POTTERY"], needs: "clay, a hot pit" },
  { n: 7, name: "Charcoal", crafts: ["CHARCOAL"], after: ["FIRE_TENDING"], needs: "wood, a covered pit" },
  { n: 8, name: "A winter larder", crafts: ["SMOKING"], after: ["FIRE_TENDING"], needs: "meat, smoke and a cover" },
  { n: 9, name: "Smelting copper", crafts: ["SMELTING"], after: ["KILN", "CHARCOAL"], needs: "green rock, black fuel, a hot furnace" },
  { n: 10, name: "Casting", crafts: ["CASTING"], after: ["SMELTING", "POTTERY"], needs: "metal, a clay mould" },
  { n: 11, name: "Cold hammering", crafts: ["HAMMERING"], after: ["SMELTING"], needs: "metal" },
  { n: 12, name: "Iron", crafts: ["IRON_SMELTING", "FORGING"], after: ["SMELTING", "KILN"], needs: "rust-red rock, coal, the hottest fire" },
];

/**
 * Does `row` fire in this context? ctx = {tags:[..], src, heat, enclosed, moisture, duration, verb}.
 * -> {ok, near, miss:[axis..]}: near = the inputs and the heat source matched but a context axis fell short
 * ("heat" | "duration" | "enclosed" | "moisture"): that is the attempt that counts toward a near-miss hint.
 */
export function matches(row, ctx) {
  const n = row.needs, no = { ok: false, near: false, miss: [] };
  for (const t of n.inputs) if (!ctx.tags.includes(t)) return no;
  if (n.src && !n.src.includes(ctx.src)) return no;
  if (n.verb && ctx.verb !== n.verb) return no;
  const miss = [];
  if (n.heat) {
    if (n.heat.min !== undefined && ctx.heat < n.heat.min) miss.push("heat");
    if (n.heat.max !== undefined && ctx.heat > n.heat.max) miss.push("heat");
  }
  if (n.enclosed !== undefined && !!ctx.enclosed !== n.enclosed) miss.push("enclosed");
  if (n.dry) { if (ctx.dry === undefined) return no; if (!ctx.dry) miss.push("moisture"); }     // S14: wind-drying needs cold dry air (ctx.dry is set only in a world that has the S14 content, so an older world never sees the row)
  if (n.moisture && ctx.moisture !== undefined) {
    if (n.moisture.min !== undefined && ctx.moisture < n.moisture.min) miss.push("moisture");
    if (n.moisture.max !== undefined && ctx.moisture > n.moisture.max) miss.push("moisture");
  }
  if (n.duration !== undefined && (ctx.duration || 0) < n.duration) miss.push("duration");
  return miss.length ? { ok: false, near: true, miss } : { ok: true, near: false, miss };
}

/** Tags of a material name (a villager "sees" only these). */
export function tagsOf(item) { return TAGS[item] || []; }
