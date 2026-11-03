// One icon registry for the whole interface (UI_SPEC §2.5). Every glyph is a single compound SVG path on a 24x24 grid (stroke style, round caps and joins),
// drawn in code: no files, no network. The same string feeds the DOM (an inline <svg><use/></svg> from one hidden symbol sheet) and the canvas (a cached Path2D),
// so a glyph on the map and in the HUD is the same shape. Colour comes from `currentColor` (DOM) and `strokeStyle` (canvas).
//
// Authoring rule: 2px safe margin, at most ~6 segments, check at 12px and 16px. A dot is a zero-length segment ("M12 12h.01") with round caps.
// CUT LINE (UI_SPEC §8.5): era and event glyphs are emblem-letter badges (eraBadge / EVENT_LETTER below), not hand-drawn paths.
export const ICON = {
  // ---- needs (9)
  food: "M12 8c-4-1-7 1-7 5a6 6 0 0 0 7 6 6 6 0 0 0 7-6c0-4-3-6-7-5zM12 8c0-2 1-4 3-4",
  water: "M12 3.5C9 8 6.5 11 6.5 14.5a5.5 5.5 0 0 0 11 0C17.5 11 15 8 12 3.5Z",
  energy: "M19 14.5A8 8 0 0 1 9.5 5 8 8 0 1 0 19 14.5z",
  warmth: "M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-6 .5 1.5 1.2 2 2 2 0-3-.5-5 1-7z",
  "mood-hi": "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM8.5 14a4 4 0 0 0 7 0M9 10h.01M15 10h.01",
  mood: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM9 15h6M9 10h.01M15 10h.01",
  "mood-lo": "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM8.5 16.5a4 4 0 0 1 7 0M9 10h.01M15 10h.01",
  health: "M12 20S4 15 4 9.5A4 4 0 0 1 12 8a4 4 0 0 1 8 1.5C20 15 12 20 12 20z",
  fear: "M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3",
  sick: "M12 3.5C9 8 6.5 11 6.5 14.5a5.5 5.5 0 0 0 11 0C17.5 11 15 8 12 3.5ZM12 11.5v5M9.5 14h5",
  hurt: "M5 15L15 5l4 4-10 10zM10 10l4 4",
  // ---- seasons and time
  spring: "M12 20v-8M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z",
  summer: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  autumn: "M5 19C5 10 10 5 19 5c0 9-5 14-14 14zM5 19L14 10",
  winter: "M12 3v18M4.2 7.5l15.6 9M19.8 7.5L4.2 16.5M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5",
  day: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3",
  night: "M19 14.5A8 8 0 0 1 9.5 5 8 8 0 1 0 19 14.5z",
  // ---- concerns (10) (food, cold, illness, danger, underground, crew, knowledge, spoilage, hunting, idle)
  cold: "M12 3v18M4.2 7.5l15.6 9M19.8 7.5L4.2 16.5M9.5 4.5L12 7l2.5-2.5",
  illness: "M12 3.5C9 8 6.5 11 6.5 14.5a5.5 5.5 0 0 0 11 0C17.5 11 15 8 12 3.5ZM12 11.5v5M9.5 14h5",
  danger: "M5 6c2 7 3 9 7 14 4-5 5-7 7-14-4 3-10 3-14 0z",
  underground: "M4 20l5-9 4 5 3-4 4 8zM8 4h.01M12 6h.01M16 4h.01",
  crew: "M6 21V4M6 5h11l-2 4 2 4H6",
  knowledge: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.5 1.1.5 2.1h6c0-1 0-1.7.5-2.1A6 6 0 0 0 12 3z",
  spoilage: "M7 3h10M7 21h10M8 3v3l4 6-4 6v3M16 3v3l-4 6 4 6v3",
  hunting: "M6 4c10 2 10 14 0 16M6 4v16M6 12h14M16 9l4 3-4 3",
  idle: "M5 6h6l-6 7h6M13 12h5l-5 6h5",
  // ---- jobs and verbs
  forage: "M12 8c-4-1-7 1-7 5a6 6 0 0 0 7 6 6 6 0 0 0 7-6c0-4-3-6-7-5zM12 8c0-2 1-4 3-4",
  chop: "M5 20L15 10M13 4c4 0 7 3 7 7l-4 1-4-4z",
  gather: "M5 20h14M12 20c0-5-1-9-3-12M12 20c0-5 1-9 3-12M8 20c-1-3-1-5-3-7",
  haul: "M4 9l8-4 8 4v8l-8 4-8-4zM4 9l8 4 8-4M12 13v8",
  dig: "M4 20l9-9M8 6c5-3 10-1 12 4-3-2-6-2-9 0z",
  hunt: "M5 19L19 5M19 5h-5M19 5v5",
  capture: "M12 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM10 15l-3 5M14 15l3 5",
  scout: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z",
  move: "M5 12h12M12 6l6 6-6 6",
  cancel: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 8l8 8M16 8l-8 8",
  eat: "M12 8c-4-1-7 1-7 5a6 6 0 0 0 7 6 6 6 0 0 0 7-6c0-4-3-6-7-5zM12 8c0-2 1-4 3-4",
  drink: "M12 3.5C9 8 6.5 11 6.5 14.5a5.5 5.5 0 0 0 11 0C17.5 11 15 8 12 3.5Z",
  sleep: "M19 14.5A8 8 0 0 1 9.5 5 8 8 0 1 0 19 14.5zM14 3h4l-4 4h4",
  drop: "M12 4v12M7 11l5 5 5-5M5 20h14",
  tool: "M5 19L19 5M19 5h-5M19 5v5",
  torch: "M12 3c1.5 2.5 3 3.5 3 5.5a3 3 0 0 1-6 0C9 6.5 10.5 5.5 12 3zM12 13v8",
  support: "M5 4h14M7 4v16M17 4v16M7 9l10 6",
  use: "M8 12V6a1.5 1.5 0 0 1 3 0v5V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 7-6 7-3 0-5-2-6-4l-2-4a1.5 1.5 0 0 1 3-1z",
  work: "M14 4l6 6-3 3-6-6zM12.5 9.5L4 18l2 2 8.5-8.5",
  craft: "M14 4l6 6-3 3-6-6zM12.5 9.5L4 18l2 2 8.5-8.5",
  flee: "M5 19l5-8 3 3 6-9M15 5h4v4",
  tend: "M5 15L15 5l4 4-10 10zM10 10l4 4",
  blocked: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8",
  warn: "M12 4l9 16H3zM12 10v4M12 17h.01",
  // ---- chrome
  pause: "M8 5v14M16 5v14",
  play: "M7 5l12 7-12 7z",
  speed2: "M5 6l6 6-6 6M12 6l6 6-6 6",
  speed3: "M3 6l5 6-5 6M10 6l5 6-5 6M17 6l5 6-5 6",
  ff: "M5 5l9 7-9 7zM17 5v14",
  book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
  help: "M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.1-1.5 2.4M12 17.5h.01",
  build: "M14 4l6 6-3 3-6-6zM12.5 9.5L4 18l2 2 8.5-8.5",
  layers: "M12 4l9 5-9 5-9-5zM3 14l9 5 9-5",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  crosshair: "M12 4v4M12 16v4M4 12h4M16 12h4M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  "chev-d": "M6 9l6 6 6-6",
  "chev-r": "M9 6l6 6-6 6",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7",
  cross: "M6 6l12 12M18 6L6 18",
  lock: "M7 11h10v9H7zM9 11V8a3 3 0 0 1 6 0v3",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z",
  pin: "M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  home: "M4 11l8-7 8 7M6 10v10h12V10",
  follow: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
  possess: "M12 4.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M8 2h8",
  release: "M9 12h11M14 7l-5 5 5 5M4 5v14",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  load: "M12 4v11M7 10l5 5 5-5M5 20h14",
  menu: "M4 7h16M4 12h16M4 17h16",
  zones: "M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9",
  "jobs-lines": "M4 18c4 0 3-12 8-12s4 12 8 12M4 18h.01M20 18h.01",
  rooms: "M4 20V9l8-5 8 5v11zM10 20v-6h4v6",
  thermo: "M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  people: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-5 6-5s6 1.7 6 5M17 10a2.5 2.5 0 1 0 0-5M17 15c2.5 0 4 1.5 4 4",
  // ---- build tools and furniture
  wall: "M3 6h18v12H3zM3 12h18M9 6v6M15 12v6",
  floor: "M3 8l9-4 9 4-9 4zM3 12l9 4 9-4M3 16l9 4 9-4",
  roof: "M3 13l9-8 9 8M6 11v8h12v-8",
  door: "M6 21V4h12v17M14 12h.01M4 21h16",
  bed: "M3 17V8M3 14h18v3M21 17v-4a3 3 0 0 0-3-3h-7v4",
  rack: "M4 5h16M6 5v15M18 5v15M9 9v5M12 9v5M15 9v5",
  hearth: "M12 4c1 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 1 .8 2 1.5 2C10.5 8 11 6 12 4zM5 20l4-2M19 20l-4-2",
  kiln: "M5 20v-8a7 7 0 0 1 14 0v8zM9 20v-4h6v4M12 3v2",
  mound: "M3 20c2-8 6-12 9-12s7 4 9 12zM12 3v2",
  bellows: "M4 7l11-2 5 5-2 7-11-1zM3 20l4-3",
  workbench: "M3 9h18M5 9v11M19 9v11M3 9l2-4h14l2 4",
  smoker: "M5 11h14v9H5zM8 11V8M12 11V6M16 11V8",
  forge: "M4 20V10l8-6 8 6v10zM8 20v-5h8v5",
  waterjar: "M9 4h6M10 4v3c-3 1-5 4-5 8a7 7 0 0 0 14 0c0-4-2-7-5-8V4",
  lamp: "M9 21h6M10 21v-3M14 21v-3M7 10a5 5 0 0 1 10 0c0 3-2 4-2 8H9c0-4-2-5-2-8z",
  vent: "M4 8c4-3 6 3 10 0s4 0 6-1M4 14c4-3 6 3 10 0s4 0 6-1M4 20c4-3 6 3 10 0 2-1.5 4 0 6-1",
  board: "M4 4h16v12H4zM9 16v4M15 16v4M7 8h6M7 12h10",
  note: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6",
  shelf: "M4 5h16M4 12h16M4 19h16M6 5v14M18 5v14",
  field: "M3 19l3-12h12l3 12zM6 13h12M8 7l-2 12M16 7l2 12",
  pen: "M3 10h18M3 16h18M5 6v14M12 6v14M19 6v14",
  cellar: "M3 6h18M5 6v14h14V6M12 10v6M9 13l3 3 3-3",
  stockpile: "M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9",
  erase: "M4 16l9-9 6 6-6 6H8zM9 11l6 6",
  cleararea: "M12 3l5 7h-3l4 6H6l4-6H7zM12 16v5M3 7V3h4M21 7V3h-4M3 17v4h4M21 17v4h-4",
  deconstruct: "M4 20l8-8M13 5l6 6-2 2-6-6zM13 5l-3 3",
  select: "M8 3H4v4M16 3h4v4M8 21H4v-4M16 21h4v-4M9 9h6v6H9z",
  stamp: "M7 3h10v8H7zM4 21h16v-6H4zM12 11v4",
  rotate: "M20 12a8 8 0 1 1-3-6.2M20 4v5h-5",
  "level-up": "M12 19V6M6 11l6-6 6 6",
  "level-down": "M12 5v13M6 13l6 6 6-6",
  jar: "M9 4h6M10 4v3c-3 1-5 4-5 8a7 7 0 0 0 14 0c0-4-2-7-5-8V4",
  expedition: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z",
  recall: "M9 12h11M14 7l-5 5 5 5M4 5v14",
  plan: "M4 4h16v16H4zM4 9h16M9 9v11",
  grave: "M7 20V10a5 5 0 0 1 10 0v10zM12 8v6M9.5 11h5",
  sprout: "M12 20v-8M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z",
  rest: "M19 14.5A8 8 0 0 1 9.5 5 8 8 0 1 0 19 14.5z",
  "shape-box": "M5 5h14v14H5z",
  "shape-line": "M4 12h16M4 8v8M20 8v8",
  "shape-fill": "M5 5h14v14H5zM5 9.5h14M5 14.5h14M9.5 5v14M14.5 5v14",
  "shape-point": "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
};

/** Event kinds for the Story list. Cut line: a one-letter emblem on a rounded badge instead of a drawn glyph (UI_SPEC §8.5). */
export const EVENT_ICON = { BIRTH: "sprout", DEATH: "grave", DISCOVERY: "knowledge", BUILT: "build", DISASTER: "bolt", EXPEDITION: "expedition", FIRST: "star", END: "grave" };
/** Era emblem letters (cut line). The era badge is drawn by eraBadge(). */
export const ERA_LETTER = { Hearth: "H", Hide: "D", Stone: "S", Clay: "C", Timber: "T", Copper: "Cu", Iron: "Fe" };
export const eraBadge = (name, on = false) => `<span class="era-b${on ? " on" : ""}" data-tip="${name} age">${ERA_LETTER[name] || (name || "?")[0]}</span>`;

/** The hidden symbol sheet: one <symbol> per icon, referenced by svg(). Built once at boot. */
export function installSprite(doc = document) {
  if (doc.getElementById("icon-sprite")) return;
  const host = doc.createElement("div");
  host.innerHTML = `<svg id="icon-sprite" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>`
    + Object.keys(ICON).map(k => `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[k]}"/></symbol>`).join("")
    + `</defs></svg>`;
  doc.body.appendChild(host.firstChild);
}

/** An inline icon: `<svg class="ic"><use/></svg>`. Unknown names draw nothing (never throws). */
export const svg = (name, px = 16, cls = "") => ICON[name] ? `<svg class="ic ${cls}" width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"/></svg>` : "";

const cache = {};
/** The same glyph on a canvas: cached Path2D, stroked in `color`. */
export function drawIcon(ctx, name, x, y, px, color, lw = 1.75) {
  const d = ICON[name]; if (!d) return;
  const p = cache[name] || (cache[name] = new Path2D(d));
  ctx.save();
  ctx.translate(x, y); ctx.scale(px / 24, px / 24);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.stroke(p);
  ctx.restore();
}
