# UI_SPEC: "Show, don't tell" overhaul (S19a + S19b)

Status: design only, written from a read-only audit (code + the screenshots in `game/tmp/`; nothing was run).
Direction: *"Revisit all of the UI. Show, not tell. One very cohesive UI."*
Scope: DOM HUD + canvas2D renderer. No assets, no dependencies; everything lives in the single bundled HTML.
Implements after S17 (minimap) and S18 (FPV). Where GDD §21 says "pixel-art 3/4 sprites", this spec deliberately
stays top-down canvas2D with procedural sprites and pseudo-height shading (NW light), because the engine decision is open.

## 0. Decisions in one screen

1. **Dark only.** One warm-charcoal theme plus the existing high-contrast mode. No light theme (the world is lit by fire; a light HUD fights it).
2. **Icons carry meaning, words appear on hover.** One icon registry (`icons.js`, ~120 glyphs) feeds both DOM (inline SVG `<use>`) and canvas (`Path2D`). Every icon has a caption that appears (a) on hover/focus, (b) beside the icon the first 3 times it appears, (c) always, if Settings > "Show labels" is on. This reconciles GDD §22.8 ("plain text over icons-only") with show-don't-tell.
3. **Three layers, no more:** world (canvas), HUD (top bar, left Village HUD, right Inspector, bottom Dock, minimap), overlay (Book, Settings, Menu popovers). Today there are about 14 independently styled floating things.
4. **Colour is never the only carrier.** Severity = pip *shape*, class = rim *shape*, lineage = pattern mark, need = icon. Palette derived from Okabe-Ito.
5. **Toasts and advisory cards die.** Replaced by one "whisper" slot (max one line, never stacks) and map-edge concern pointers.
6. **An item looks identical** in the stock grid, a villager's hands, and on the ground (one sprite source, `sprites.js`).
7. **Text stays honest.** All words still come from `ui/text.js` / `concerns()` / `explain()` (same data the sim used). They move to the tooltip and to a visually-hidden `.sr` copy (keeps screen readers and `ui_smoke` `innerText` assertions working).

---

## 1. Audit

Cross-cutting inconsistencies first (they explain most of the mess):

| Axis | What exists now | Problem |
|---|---|---|
| Panel chrome | `.panel` (header + chevron + `phint`), `.adv` (5px red left border), `.toast`, `.warn`, `#digest`, `.helpcard`, `.setcard`, `.tb-menu`, `.ctxmenu`, `#possbanner` (purple 2px border), `#buildbar`, `#orderbar`, `.keepedit`, `.expcard` | 11 chromes: border colours `#2a3441 / #3b4d62 / #4a6a8a / #a8453c / #c9a2ff`, radii 3/4/5/6/8/9/10/12px, backgrounds `rgba(16,21,28,.92)`, `#121820`, `#121a24`, `rgba(30,22,22,.97)`, `rgba(40,28,64,.96)`. |
| Buttons | one global `button` rule + `.on`, plus overrides in `#topbar` (padding 2/6), `.adv`, `.chips`, `.cr-chev`, `.ntf`, `.tool-*`. Text-only; the selected state is only a green fill. | No icon buttons, no primary/secondary, `on` is colour-only. |
| Colour | accent green `#7fd1a0` (also "good"); `#ffd166` is warning AND selection AND "star"; `#c9a2ff` is knowledge AND standing order AND possession; red `#e5594f` vs `#ff5d5d` vs `#ff7d72` vs `#ff9a8f` for danger | Same hue means 3 things; one meaning has 4 hues. Hard-coded hex in ~60 places. |
| Type | base 13px; sizes 9/10/10.5/11/11.5/12/12.5/13/14/15/18; uppercase 12px section labels with letter-spacing | 11 sizes, no scale. |
| Spacing | 2/3/4/5/6/7/8/9/10/12px paddings ad hoc | No grid. |
| Icons | emoji (`CONCERN_ICON`: 🍖 ❄ ⚕ ⚠ ⛏ ⚑ 📖 ⌛ 🏹 💤), unicode glyphs (▾ ▸ ✓ ✕ ❚❚), single letters on the map (`f c h z m ~ > x +`, `F M c I K s p h` for ore) | Emoji render differently per OS, can't be recoloured, have no CVD-safe shapes. |
| Hover | native `title=` everywhere | Slow, unstyled, no rich content, inconsistent with `#tip`. |
| Words per element | many 20-40 word paragraphs | see per-surface rows. |

Per surface (words that could be shown; inconsistencies):

| Surface | Tells in words | Inconsistencies / problems |
|---|---|---|
| **Top bar** (`topbar.js`) | "Day 5, Spring, Year 1"; population sentence (`popText`, "LOW"/"SHELTER" alarm via regexp on prose!); 3 skip buttons with long labels ("Until something happens"); 5 overlay buttons labelled by word; Settings, Almanac, Build, Game ▾, ? Help | 22+ controls at 1280px, 3 visual groups with no separators, `fitTopbar()` has to hide things to fit. Alarm is detected by regexp on display text. Debug items (Force lightning, Make someone ill) live in the player's Game menu. |
| **Villager strip** (`notables.js`, `#notables`) | Name + `S` badge + title text, blob dot | Floats at `left:336px` assuming two 318px columns; collides with advisory cards (`#advisories` top:96) in `ui-s15-advisory.png`; dot colour = identity only (CVD). |
| **Concerns** (`concernpanel.js`, `concerns.js`) | One sentence per class: "Smoke crew: 38 of 59 working; 21 blocked: no grass in stock (a bed takes 4)" | Sentence-per-row list; emoji icon + coloured pip (red/amber/blue = colour-only severity); header is a "3" badge. `Show` button on every row. |
| **Advisory cards** (`advisory.js`) | "Winter in 71 days and 3 villagers have no warm bed" + Show/Snooze/Dismiss | A *third* chrome; red left border; stacks over the map and collides with the villager strip; repeats the Concerns row it duplicates. |
| **Village / stock** (`village.js`) | People "6 adults, 1 elders, 0 children"; season sentence; Food bar text "21 rations = 3.1 days per head" + two sentences ("Critical below 2.0 days; the village goes foraging as soon as it is reached."); Beds/Racks as sentences; `.warn` paragraph "NEEDS SHELTER 5 villager(s) have no leaf bed ... 3 in stock, 4 per bed."; Fields "12 plots: 3 raw, 4 tilled..."; spoilage "Spoiled in the last day: ..." ; Stockpile 40+ rows of label + bar; "The village wants: berries dried for winter (0.54)"; keep-N help paragraph | The densest panel (`ui-s11-concerns`, `ui-s14-chronicle` show it overflowing the column). Warnings duplicate Concerns verbatim. Item rows are a name + a wide bar, so 25 zero rows scroll. |
| **Chronicle** (`chronicle.js`) | Timestamped sentences, red for severity 2 | Plain list, "Download chronicle" button as first element; 250px scroll box. Fine as *text* but has no icons, no season grouping, no zoom-to affordance cues. |
| **Why** (`inspector.js` createWhyPanel) | `whysent` headline, class badge, rejected-options bullet list with blocker sentences, score `details` table | Best content in the game, but a text wall (`ui-l-possess-chop`: 6-line "You are Steadfast..." paragraph). Separate panel from the inspector, so the same villager is explained in two stacked cards. |
| **Inspector** (villager) | "Adult, 1.9 years old. A founder of the village. Generation 1, line 1. Partner: Kox."; 5 need bars with numbers (82%); 9 trait bars with numeric 0.83; skills with numeric `0.09`; sickness paragraph; family lines | Identical bar style for needs (should be urgent), traits (should be gene-like) and skills (should be ranks). 600+px tall, scrolls. Numbers where words/shapes suffice. |
| **Almanac** (`almanac.js`) | Era chain as text "Hearth -> Hide -> Stone ..."; "This world" 10 bullet sentences with percentages; "The Twelve (known / open / not yet)" as text "something to find / not yet"; "Crafts the village knows: Nothing yet. New abilities appear when..." ; curiosities; tried; two buttons incl. a debug one | `ui-s14-almanac-page`: left column is ~100% prose. Debug "discovery trace" button in the player UI. |
| **Crews** (`crews.js`) | "2 of 3 working; 1 blocked: no grass in stock (a bed takes 4)", "12 crews, 36 members (11 adults in no crew)", default-task `<select>` | `ui-s15-crews-panel`: native white `<select>` and white text input on a dark panel; per-crew 5 buttons. |
| **Expedition card** (`expedition.js`) | "Send N selected villagers to find:" + 4 text buttons; status/Found/Time left/Stalled as 4 `kv` text rows; "The village carries on without them. Autonomy never sends anyone out." | A mini-dashboard of text; no spatial cue of where they are. |
| **Build palette** (`build.js`, `#buildbar`) | 14 text tool buttons + Level, Shape, Material word buttons, status sentence "Drag on the map to plan. 20 pieces: needs 20 grass (stock 60)", `Done` | Wide wrapping button grid (`ui-e-build-palette` wraps to 3 rows); cost is prose; `Done` orphaned on its own row. |
| **Blueprints** (`blueprints.js`) | "Smoke hut 7x6, 45 pieces, 3 beds rev 1 / needs 45 sticks, 32 grass / 2 buildings follow it, all up to date, 75 pieces left to rebuild" | Prose; no thumbnail of the plan. |
| **Room inspector** (`rooms.js`) | Purpose buttons (None / Shelter / Bedroom / Kitchen / Storage / Workshop); 5-line checklist with ✓/✕ and sentences ("A bed for every two sleepers - have 3, need 4 (the room fits 7)"); Quality/Warmth/Beds/Inside-now rows; a closing paragraph "Quality is graded, never a fail..." | ✓ green / ✕ red = colour-only pair (already against GDD §19.5). Explains the rule in prose each time. |
| **Station inspector** (`inspector.js` `stationInfo`) | Recipe, inputs, fuel, progress as text lines | Not spatial; the station on the map shows no progress. |
| **Settings** (`settings.js`, `keys.js`) | Key rebinding table, accessibility checkboxes each with a sentence ("why") | Own modal chrome (`.setcard`); acceptable as a form but should reuse the kit and show previews (UI scale, CB marks). |
| **Help** (`help.js`) | A 720px wall: numbered "first ten minutes" list + controls tables | The wall the user wants gone. Keep only as a key reference. |
| **Possession banner** (`possess.js`, `#possbanner`) | "POSSESSING Sun; game speed capped at 2x, fast-forward off"; 4 need bars; "Bare-handed. Carrying 5 stick. Doing: chop."; 3-line key legend; hazard line; hint | A fourth panel style (purple); covers the top-centre of the map exactly where the camera looks; duplicates the Inspector needs and the Why panel (see `ui-l-possess-chop`: the same 4 needs on screen twice). |
| **Toasts** (`main.js game.toast`) | Full sentences, 3.5s, stack bottom-centre | `ui-l-possess-chop`: four stacked at once ("Stopped: it is morning." / "Stopped: you pressed a key." / ...), covering the map and the order bar. Each is 10-25 words. |
| **Digest** (`#digest`) | "While you were away 2 game days passed" + sentences | A 5th chrome (blue border); modal-ish over the map. Content is a list of the same entries as the Chronicle. |
| **Minimap** (S17, not built) | n/a | Must be born in the kit; corner slot reserved in Layout. |
| **On-map glyphs** (`renderer.js`) | Job = 1 letter above the head (`GLYPH`: `f g c h z b d m ~ > ! x +`); ore = 1 letter (`ORE_LETTER`); CB mode = letter A/B/C inside the blob; item count numerals; need state = ring colour (orange/cyan/blue/green) | Letters are unreadable at small zoom, ambiguous (`h` = haul / herb, `c` = chop / clay), colour-only for needs, flat `fillRect` squares for stations and plots, no shading. |

---

## 2. Design system

### 2.1 Tokens (CSS custom properties on `:root`, in `shell.html`; mirrored as `TOKENS` in `kit.js` for canvas)

**Surfaces and text** (dark; warm charcoal, not blue-black, so firelight reads as warmth):

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0e13` | world void |
| `--s1` | `rgba(18,22,28,.90)` | panel glass |
| `--s2` | `#1a2029` | raised element, button |
| `--s3` | `#242c37` | hover / pressed |
| `--line` | `#2c3541` | 1px borders |
| `--line-hi` | `#44556a` | focus ring base, popover border |
| `--tx` | `#e8edf3` | primary text (contrast 13:1 on `--s2`) |
| `--tx2` | `#a6b2c1` | secondary (6.9:1) |
| `--tx3` | `#6f7c8c` | decoration only (never carries information) |
| `--sel` | `#ffd166` | selection and focus (rings, selected button underline); no longer used as "warning" |

**Semantic roles** (Okabe-Ito derived, lightened for dark backgrounds; each is paired with an icon, never alone):

| Role | Token | Hex | Notes |
|---|---|---|---|
| Danger | `--danger` | `#ff6b4a` | the only colour that pulses |
| Warm / warmth | `--warm` | `#ffa63d` | flame icon; also "caution" severity |
| Food | `--food` | `#a7d86a` | berries/crops; spoilage shifts it toward `--rot` |
| Water | `--water` | `#56b4e9` | also "your order" (sky) |
| Energy / sleep | `--energy` | `#9a9cff` | |
| Health / OK | `--ok` | `#35d0a0` | bluish-green (Okabe), the only "good" colour |
| Cold | `--cold` | `#b5ecff` | |
| Sick | `--sick` | `#d4e04e` | with a droplet-skull badge |
| Knowledge | `--know` | `#c79bff` | lightbulb, Almanac, standing orders move to `--stand` |
| Standing order | `--stand` | `#e08bd0` | reddish-purple (Okabe) |
| Rot | `--rot` | `#8a6a4a` | spoilage darkening target |
| Possession | `--poss` | `#ffe9a8` | halo; warm white so it never fights lineage hues |

Job class (replaces `CLASS` colours in `text.js`, shape in brackets is the *rim shape*, see 2.4): need `--warm` (circle), village-critical `--danger` (triangle), your order `--water` (rounded square), standing `--stand` (hexagon), demand `--ok` (none, dim), leisure `--tx3` (none, dim).

**Type scale** (system stack kept; tabular numerals on): `11` caption (hover meta only) / `12` small / `13` body (default) / `15` title / `20` stat numeral / `28` dial numeral. Weights 400 and 600 only. Section labels: 11px 600 uppercase `--tx2`, one place only (`.lbl`).

**Spacing** (4px grid): `--sp1:4 --sp2:8 --sp3:12 --sp4:16 --sp5:24`. Panel padding `--sp3`; gap between panels `--sp2`; screen gutter `--sp2`.

**Radii:** `--r1:4` controls, `--r2:8` panels and popovers, `--r3:12` dock, `--rp:999` pills/pips.

**Elevation:** `e0` panel = 1px `--line` border + `inset 0 1px 0 rgba(255,255,255,.04)`; `e1` HUD over map = `e0` + `0 4px 16px rgba(0,0,0,.35)`; `e2` popover/modal = `0 8px 28px rgba(0,0,0,.55)` and `--line-hi` border. `backdrop-filter` is NOT used (cost on a 60fps canvas).

**Motion:** 120 ms ease-out hover/press; 220 ms panel slide; looping animation only for: danger pulse, task flow-lines, whisper fade. `body.calm` (existing reduced-motion setting) removes all of it; the static state must still communicate (pips keep their shape).

**Focus:** every control gets a 2px `--sel` outline offset 2px on `:focus-visible` (none today).

### 2.2 One panel chrome (`kit.js panel()`; replaces `createPanel`)

```
+--------------------------------------+  radius r2, e1, bg --s1
| [icon 16] Title            [pill] [v] |  header 32px, 600 13px; pill = count/severity; v = collapse
+--------------------------------------+  1px --line
| body, padding 12                      |
+--------------------------------------+
```
Variants are *modifiers of the same element*, never new chromes: `.pn.flat` (no header, used in the dock), `.pn.pop` (e2, arrow, auto-dismiss), `.pn.sheet` (Book/Settings: centred 720x520, e2, scrim `rgba(5,8,12,.6)`). Every panel exposes `data-test="<id>"` and keeps its legacy `id="panel-<id>"` (see §8).

### 2.3 One button set (`.btn`, 28px high; 24px `.sm`)

| Variant | Look | Used for |
|---|---|---|
| `.btn` default | `--s2` bg, `--line` border, `--tx` | secondary actions |
| `.btn.pri` | `--sel` text on `--s3`, 2px `--sel` bottom edge | the one main action in a context (Make crew, Send, Done) |
| `.btn.ghost` | transparent, `--tx2` | header actions, Show/Dismiss |
| `.btn.ico` | 28x28 (dock: 44x44 `.big`), icon only + `data-tip` | toolbar, dock, speed |
| `.btn.tog` | toggle: *on* = `--sel` 2px underline + icon filled + `aria-pressed=true` | overlays, modes, speed (not colour-only) |
| `.btn.danger` | `--danger` icon, still outlined | Disband, Release (rare) |
Also: `.seg` (segmented group, radius ends only), `.stepper` (- value +), `.sw` (swatch), `.chk` (checkbox/switch). Native `<select>` and `<input>` are restyled once (dark, `--r1`, `--s2`); no white controls anywhere (crews panel today).
Every button with an icon only must have `aria-label` and `data-tip`; hotkey shows as a `kbd` keycap in the tip and as a corner chip on dock buttons.

### 2.4 Shared components (all in `src/ui/kit.js`; DOM versions and canvas versions share geometry)

- **Pip** (severity): 1 = hollow circle `--water`, 2 = filled triangle `--warm`, 3 = filled diamond `--danger` + pulse. Shape alone is enough to rank.
- **Rim** (job class): the chip's outline shape, see 2.1.
- **NeedRing**: 18-28px ring gauge, icon in the middle, arc length = value, tick at the soft threshold. Colour switches by role; below critical the ring turns `--danger` and gets a notch gap. Same component in Inspector, possession HUD, and (small) on the map.
- **Meter**: replaces `bar()`; 8px high (not 16), no text inside. Marks: `|` soft (dashed), `target` (solid), `crit` (triangle notch). Numbers go in the tip.
- **RankPips**: 5 small pips + partial arc (skills).
- **Chip**: icon + optional count + optional caption (caption shown per rule in §0.2).
- **Avatar** (`slimeAvatar(hue, lineage, size)`): the same blob sprite as on the map; lineage pattern mark overlaid. Replaces the CSS `i.blob` circle.
- **Keycap**: `kbd` styled as a key; used in dock hints and the possession HUD.
- **Tip** (`tip.js`): one tooltip component, 250 ms delay, max 300px, rich body (sentence + up to 4 icon rows "because"), driven by `data-tip` (string) or `data-tipfn` (function). Supersedes native `title=`; `title` stays as fallback aria text only if `data-tip` absent.

### 2.5 Icon set (`src/ui/icons.js`)

**Format.** 24x24 grid, stroke style (1.75px at 16px, round caps/joins, single compound `d` string per icon, optional second path for a fill accent). One export:

```js
export const ICON = { food: "M12 3c...", water: "M12 3c..." /* ... */ };       // path strings
export const svg = (name, px = 16, cls = "") => `<svg class="ic ${cls}" width="${px}" height="${px}"><use href="#i-${name}"/></svg>`;
export function drawIcon(ctx, name, x, y, px, color, lw = 1.75) { /* cached Path2D, ctx.translate/scale, stroke */ }
```
The page contains one hidden `<svg>` sprite `<symbol id="i-food">...` generated from `ICON` at boot; no network. Colourisation by `currentColor` (DOM) and `strokeStyle` (canvas). Compound icons (blockers, badges) are *composed* at draw time: `base` + corner mark (`slash`, `lock`, `plus`, `up`, `down`) so ~120 hand-drawn paths cover the whole vocabulary.

**Needs (9):** `food` (drumstick+berry), `water` (drop), `energy` (crescent+z), `warmth` (flame), `mood` (face, 3 states: `mood-hi`, `mood`, `mood-lo` by mouth curve), `health` (heart), `fear` (spiked burst), `sick` (droplet with cross), `hurt` (bandage cross).

**Items (families, drawn as multi-colour sprites in `sprites.js`; mono outline variants derived for tips).** One silhouette per family, tinted by `ITEMS[k].color`:
`berry` (cluster), `dried` (shrivelled cluster), `tuber` (root), `grass` (tuft), `stick` (twig pair), `log` (cylinder w/ rings), `timber` (plank), `block` (cut block), `brick` (stacked brick), `stone` (rock), `dirt` (mound), `flint` (shard), `clay` (lump), `fired_clay` (hardened lump w/ crack), `jar` (pot), `malachite` / `iron_ore` / `copper` / `coal` / `salt` / `peat` / `herb` (each its own crystal/block silhouette: green cluster, banded rust, ingot-ish, black chunk, white cube, brown brick, leaf), `charcoal` (sticks, black), `iron` (ingot), `sheet` (flat plate), `fitting` (gear), `mould` (open frame), `hide` (pelt), `leather` (folded), `cordage` (coil), `basket`, `backpack`, `bone`, meat family (`raw` drumstick, `cooked`, `smoked`, `dried`, `salted` = same drumstick + state mark), `baked_tuber`, `herbal_remedy` (vial), tools (`axe`, `pick`, `spear` with a material band: stone/bone/copper/cast/iron), `wheel`, `wagon`, `cart`. 36 sprites, covering all 55 `ITEM_KINDS` by tint + tool-band.

**Jobs (22):** `forage`, `cut` (grass), `chop`, `haul`, `store`, `eat`, `drink`, `sleep`, `huddle` (sleep + 2 arcs), `build`, `dry`, `mine`/`dig` (pick+rock), `leisure` (music note), `goto` (chevron), `flee` (running arrow), `defend`/`hunt`/`strike` (spear), `mend`/`convalesce`/`tend` (plaster), `craft`, `cook`, `farm-till`, `farm-sow`, `farm-water`, `farm-harvest`, `herd`, `explore` (compass), `idle` (zzz).

**Blockers (19):** base icon + `slash`/corner: `no_path` (dotted line with gap), `no_material` (empty crate), `no_capacity` (full crate), `no_season` (calendar+snow), `no_storage` (empty shelf), `no_site` (plot outline), `no_target` (crosshair), `no_water` (drop+slash), `no_route`, `no_candidate` (person+slash), `no_station` (bench+slash), `no_tool` (hammer+slash), `no_animal`, `no_fodder` (tuft+slash), `no_pen` (fence+slash), `reserved` (padlock), `unsafe` (fang/warning), `no_skill` (rank pips empty), `outscored` (balance, tilted).

**Eras (7, glyph in a rounded badge):** `era-hearth` (flame), `era-hide` (pelt), `era-stone` (hand-axe), `era-clay` (pot), `era-timber` (beam+joint), `era-copper` (ingot+spark), `era-iron` (anvil).

**Seasons (4):** `spring` (sprout), `summer` (sun), `autumn` (leaf), `winter` (snowflake). Plus `day` (sun), `night` (moon).

**Threats / concerns (12, 1:1 with `CONCERN_ORDER`):** `food` (shared with need; rendered with a *scarcity gap* mark), `cold` (snowflake over flame outline), `illness` (droplet-cross), `danger` (fang), `underground` (rock-fall: triangle of falling pebbles; `bad-air` wisp variant), `crew` (flag), `knowledge` (lightbulb), `spoilage` (hourglass over item), `hunting` (bow), `idle` (zzz), plus `fire` (flame on tree) and `famine`.

**Events (chronicle):** `birth` (sprout-heart), `death` (small stone/grave), `discovery` (lightbulb burst), `built` (hammer+roof), `disaster` (lightning), `era` (era badge), `expedition` (compass+footprints), `firsts` (star), `wedding`/`partner` (two rings), `season-turn`.

**UI chrome (32):** `pause`, `play`, `speed2`, `speed3` (stacked chevrons), `ff` (to next), `book`, `gear`, `help`, `build`, `layers` (overlays), `eye`, `crosshair` (locate), `chev-d`, `chev-r`, `close`, `plus`, `minus`, `check`, `cross`, `lock`, `star`, `pin`, `home`, `follow`, `possess` (hand + halo), `release`, `map`, `search`, `erase`, `decon`, `capture`, `stamp`, `rotate`, `level-up`, `level-down`, `save`, `load`, `menu`, `crew` (three dots), `warm-tint` (thermometer), `zones`, `jobs-lines`, `rooms` tools (`wall floor roof door bed rack firering workbench vent shelf cellar field pen torch kiln hearth`).

Authoring rule: every path drawn on the 24-grid with 2px safe margin, at most ~6 segments; check at 12px (map badge size) and 16px (HUD). Convention sample (copy for style): `water: "M12 3.5C9 8 6.5 11 6.5 14.5a5.5 5.5 0 0 0 11 0C17.5 11 15 8 12 3.5Z"`.

### 2.6 Colour-blind-safe palette and rules

- Semantic colours above are Okabe-Ito members or lightness-shifted relatives; adjacent roles differ in **lightness and icon**, not hue alone (danger `#ff6b4a` vs warm `#ffa63d` vs food `#a7d86a` are separated by shape: diamond / triangle / circle pips, and by icon).
- **Lineage palette** (GDD §19): display mode `lineage palette` uses Okabe-Ito 8 (`#E69F00 #56B4E9 #009E73 #F0E442 #0072B2 #D55E00 #CC79A7 #999999`) for body fill; default mode uses genetic hue. In both modes the **lineage mark** (pattern: spots, stripes, ring, cross, chevron, diamond, dots-line, none; number overlay beyond 8) is drawn on the sprite at `ts>=12` (replaces the letter A/B/C) and on every Avatar. Contrast clamp: body lightness `L*` kept in `[38,78]` so a 3:1 ratio holds on every terrain; outline always drawn (`--bg` 2px).
- Dev switch `?cvd=protan|deutan|tritan|mono` applies an SVG `feColorMatrix` filter to `body` (HUD and canvas). Part of the screenshot checklist (§9).
- Status pairs: ok/not-ok never green/red alone; checks are `check` (ring) vs `cross` (square) icons plus `--ok` / `--danger`.

### 2.7 Light vs dark: decision

Dark only. Reasons: (1) the map's night/winter tint and light-radius lighting (`drawLight`) assume dark surroundings; (2) fewer tokens to keep CVD-valid; (3) high-contrast mode (`body.hc`, black/white/yellow) already covers the low-vision need. Revisit only if a "daylight/print" theme is requested for the Chronicle export (that is a static HTML export, not the live UI).

---

## 3. Show, don't tell: conversions

Convention: **Remains** = the only text left on the default HUD; **Tip** = on hover/focus (and `.sr` copy); numbers always live in the tip.

### 3.1 Villager state (map + Inspector)

| Today (words) | Replacement | Remains | Tip |
|---|---|---|---|
| Needs: 4 bars + "%" (Inspector, possession banner) | **NeedRing x4** under the portrait; on the map a need ring is drawn *only* when a need is under its soft threshold (icon badge with depleting arc, up to 2 per slime) or the slime is selected/hovered (4 mini arcs around the body, 12 o'clock = food clockwise). | none | "Food 82%, soft at 35%, critical at 15%" |
| Mood bar | face icon (3 states) + 8px meter | none | |
| Ring colour on blob (orange/cyan/blue/green) | the badge icon (flame / food / drop / z / sick) | none | |
| Job letter above head (`f c h z`) | **Job chip** 14px (zoom-scaled): job icon inside a *rim* shaped by class (circle need / triangle village-critical / rounded square your order / hexagon standing / none leisure); chips appear for selected, hovered, crew-selected and alarming slimes; the other 50+ get a 4px class-coloured dot (so a crowd of 60 reads as a field of dots, not 60 icons) | none | the `explain()` headline sentence |
| Warmth state | cold slime: pale-cyan breath puffs + body slightly desaturated; warm room: soft orange glow on floor (see 4.5) | none | |
| Sleep | body flattens (squash), eyes closed line, `z` particles (max 1 per 1s per slime) | none | |
| Carrying | the item sprite "held" above the body, bobbing; stack count as a 9px chip | count | |
| Skill (`dig 0.09`) | job-family icon + **RankPips** (5) + sub-rank arc; "rusty" = arc drawn in rust colour with a hatch | none | "Digging: Novice (0.09). Rusty: 12 days since practice." |
| Traits (9 bars with numbers 0.83..1.20) | **Gene strip**: 9 icon columns around a centre line (1.00 = average). Bar grows up (above) / down (below average) from the line; sorted by deviation so the 2-3 notable traits are in the middle; icon per trait. | none | `TRAIT_INFO` sentence + "poor / below average / above / exceptional" word + number |
| Age "Adult, 1.9 years old" | **Life bar**: child / adult / elder segments with a marker | none | "1.9 years; elder at 8" |
| Lineage "Generation 1, line 1" | lineage mark (pattern) next to the name | name | |
| Partner / kin "Partner: Kox" | **Kin row**: avatars with a relation glyph (two rings = partner, small sprout = child, branch = parent); on hover/selection the map draws **relationship lines** from the focused slime: partner solid warm, kin dotted, friends thin `--ok`, rivals thin `--danger`; lines fade in 120ms | avatars | `relationWord()` text |
| Sickness paragraph "Sick for 1 day(s), from a sickness you sent. Recovering 0%, health draining 4.7 a day. Helping: ..." | `sick` badge + recovery ring + a "helping" row of 3 icons lit/unlit (rest `sleep`, warm `warmth`, nurse `tend`, cooked food `eat`, remedy `herbal_remedy`); the Concerns row says only "illness" pip | none | the existing sentences |
| Discovery | when a villager *understands* something: a **lightbulb burst** over the slime (0.9s: bulb pops, 8 radial rays, then lifts and the Book icon in the top bar gets a violet pip until opened). No toast. | none | chronicle sentence in Book |

### 3.2 Why (the centrepiece; also folds into the Inspector)

The Why panel is *not a separate panel* any more: it is the top section ("Now") of the villager card.

```
[ job chip LARGE ]  <- [ class badge: need/your order/... ] [ ======= score bar ======= ]
Rejected:  [chop ⛔no_tool] [haul ⛔reserved] [dig ⛔no_path]   <- greyed 70% job chips with a blocker corner mark
Score parts:  [ stacked segmented bar, each segment = PART_LABEL icon ]            (collapsed)
```
- Headline sentence (today's `whysent`) is shown **only on hover over the chain** and inside a "Say it in words" disclosure (kept for honesty and for `ui_smoke`; also `.sr`).
- Each rejected chip's tip is the existing `blockerText()` sentence.
- Pending (paused before re-plan): the chain shows with a dashed "next" outline instead of the badge text "Next".
- Possession: chain collapses to a single large `possess` badge; no "You are Steadfast" paragraph. That paragraph moves to the Book > Help page.
- **"?" on every order, crew chip and stock tile** (GDD §22) = the chain component rendered in a popover.

### 3.3 Village HUD (left column; merges Village + Concerns + Stock + Crews)

| Today | Replacement | Remains | Tip |
|---|---|---|---|
| "People 7, 6 adults, 1 elders, 0 children" | row of lineage-marked **pips** grouped by life stage (60 pips fit in one 240px row of 4px dots) | the number "7" at 20px | breakdown |
| "Spring, day 5 of 25 - winter in 71 days" | **Season ribbon**: 4 season segments for the year (tinted spring/summer/autumn/winter), a day marker; the winter segment is hatched. It is the same ribbon the Food bar overlays (next row). The top-bar dial shows the same marker. | none | the sentence |
| Food bar "21 rations = 3.1 days per head" + 2 explanatory sentences | **Food runway bar**: x-axis = days from now; fill = runway (colour by `--food` -> `--warm` -> `--danger`); a **snowflake marker** at "days to winter"; a **notch** at the critical threshold; if the fill ends before the winter marker, the gap between them is a hatched `--danger` "shortfall" region. Number "3.1d" right-aligned. | "3.1d" | the two sentences |
| Beds "2 for 7 adults (+1 being built)" | row of **bed icons**, one per adult: filled = bed assigned, outline = needs one, dashed = under construction | none | |
| Drying racks "0" | row of `rack` icons, dimmed when 0, with a ghost slot if demanded | none | |
| `.warn` paragraphs ("NEEDS SHELTER ...", "Food is rotting ...") | **removed** (duplicate of Concerns). Their action text ("Dry or smoke it, keep it in jars") becomes the tip of the concern icon and a "do this" chip row of 2-3 *verb icons* (`dry`, `jar`, `cellar`) that open the matching build tool. | none | sentence |
| Fields "12 plots: 3 raw, 4 tilled, 3 sown, 2 ripe" | a **mini field grid** of plot glyphs (square outline / furrows / sprout / ripe), one cell per plot (max 24 then "+N") | none | |
| Pens "2 (1 fenced), 3 penned hoppers" | `pen` icons with N `herd` pips | | |
| Spoilage lines | stock tiles darken (3.5); village-level: an hourglass pip on the Stock header with a count | | the lines |
| "The village wants: berries dried for winter (0.54), a drying rack (0.30)" | **Demand chips**: icon per demand, scale/opacity by weight, sorted | | "(0.54)" |
| Stockpile: 40 rows (label + wide bar + number) | **Stock grid**: 4 tiles per row, 56x56, each: item sprite, count (13px 600), a 4px meter along the bottom with keep-N ticks (soft dashed, target solid). Zero-stock tiles hidden unless demanded/known craft (current logic kept). Refill state = tiny looping-arrows badge; holding = pause badge. Click a tile -> **stepper popover** (`- 10 1 + +`, Off) replaces the `.keepedit` block and its help paragraph. Loose/carried: `+18` and `+5` as small chips with hand icon. | counts | name, "keep 35, refills below 28", loose/carried |
| Concerns list (sentence per class) | **Concern row**: one 28px chip per active class: class icon + Pip (shape = severity) + (if the class has a count) the count. Ordered by `stableOrder` (existing). Click = `game.locate`. Hover = the `concerns()` sentence. | icons only | sentence + "Show" is the click |
| "Nothing pressing. The village is eating, sheltered and busy." | an empty row with a single calm `check` pip | | |
| Advisory card (Show / Snooze / Dismiss) | a concern chip that first rises to severity >= 2 gets a **one-time attention ring** (pulses 3x) and a map-edge pointer (3.4); Snooze/Dismiss are in the chip's popover | | |
| Crews panel: lists with text rows, `<select>` task, 5 buttons | **Crews tab** in the Village HUD: crew = coloured chip + member avatars + a **segmented status bar** (working = `--ok`, idle = `--tx3`, blocked = `--danger` with the blocker icon); default task = job-icon picker popover; row actions = icon buttons (select, add, recall, disband in a `...` popover) | crew name | blocker sentence |

The Village HUD has exactly two tabs: **Stores** (default) and **Crews**. It is 264px wide, full column height; the stock grid scrolls, everything above does not.

### 3.4 Concerns on the map (replaces advisory cards)

- Every concern with a `loc` is drawn **on the map**: if the location is on screen, an icon+Pip marker above it (level >= 2 only; level 1 is a quiet dot); if off screen, a **screen-edge pointer**: a 28px chip (class icon + Pip) pinned to the viewport edge along the ray from view centre to the location, with a small arrow tip toward it; hover shows the sentence; click = `locate`.
- Level 3 pointers pulse (only thing that does); `calm` mode swaps pulse for a thicker outline.
- Max 4 pointers per edge; beyond that they merge into a `+N` chip that opens the Village HUD concern row.

### 3.5 Time and season

- **Dial** (top bar, 36px): outer ring = the year in 4 season-tinted arcs (hatched winter), a hand = day-of-year; inner disc = sun/moon travelling across a day arc (the time of day). Pause state = the hand freezes and a `pause` glyph replaces the centre. No text but "Day 5" (12px) beside it; year in tip.
- **World tint** (map): per-season colour grade (4.6) so the player *feels* the season; leaves/snow particles.
- Speed in the dial's ring: `1x`, `2x`, `3x` as tick marks; `capped` (possession) = a padlock on the 3x+ segments.

### 3.6 Food, warmth, spoilage, stock on the map

- **Warmth:** heat shimmer (sin-displaced thin horizontal bands, 2-3 per hearth, additive orange at 6% alpha) and a soft radial glow whose radius equals the warm radius; the `Warmth` overlay becomes "contour rings" (2-3 isotherm outlines) instead of a flat tint.
- **Spoilage:** perishable item sprites interpolate toward `--rot` as freshness falls (precomputed 4 tint steps per sprite, one atlas row each); at the last step, 2 flies (1px dots orbiting, only at `ts>=10`). A spoiling stock tile in the HUD uses the same 4 steps, so rot is "visible darkening" in both places.
- **Stockpile zone:** a rope-edged rectangle with item silhouettes arranged in the cells (count-capped at 12 visible), instead of the tinted rectangle `zones()`.
- **Crop stages:** plot glyph per stage (4.4), ripe = bounce.
- **Rooms:** selected room tints its floor by quality (3-step: cool grey / amber / warm gold) and shows its missing requirement markers *in place* (4.4).

### 3.7 Chronicle, Almanac, Book (merged)

Merge Almanac + Chronicle + Notables + graves/people + "This world" into one **Book** sheet (key **K**, top-bar `book` button; Almanac's key stays as an alias). Tabs, each an icon + word:

1. **Story** (Chronicle): timeline by year > season band; events are icon dots along a ribbon (birth, death, discovery, built, disaster, era, expedition); hover = sentence; click = zoom-to (existing `data-a`). A "List" toggle switches to dated one-line rows with the event icon (3 lines max per entry; no inline wrapped sentences with multiple sentences). "Download" is a `save` icon button in the tab header.
2. **Know** (Almanac): era track (7 era badges, current one lit, next one outlined) replacing "Hearth -> Hide -> ..."; **The Twelve** = a 12-node ring (locked padlock / open `?` bubble pulsing softly / known lit lightbulb with the craft icon); known crafts as a node graph (existing `alm-graph`/`alm-flow` data) with **holders as avatar stacks**; "last holder" = one avatar with a `warm` pip; dead ends as two item sprites with a `cross`; curiosities as `?` bubbles whose near-miss hint is a tip. Debug trace button leaves the player UI (shown with `?debug`).
3. **People** (Notables): the starred/elders/newborn/injured filters become 4 icon toggles; grid of avatars with 3 glyph badges (star, elder, hurt); graves as stone icons.
4. **World**: "This world" bends become item icon + centred `+/-` bar (no text list); land mix = 3-segment ratio bar (meadow/highland/marsh); "salt licks lie at..." = markers on the minimap, shown by hovering the item.
5. **Keys** (Help): the controls reference, formerly `help.js` (§6).

### 3.8 Rooms, stations, building (show on the map)

| Today | Replacement |
|---|---|
| Room purposes as 6 text buttons | 6 icon tiles (`none`, `shelter`, `bed`, `kitchen`, `storage`, `workshop`) with current one selected; the room *also* shows its purpose icon on the map at its centre |
| Checklist ✓/✕ sentences | 5 **requirement rings** in a row (door, roof, area, bed, warmth): `check` ring or `cross` square, with a value badge ("3/4"). Missing ones are drawn on the map inside the room as ghost icons at the place where they would go (e.g. a ghost bed). Words in tip. |
| "Quality: fine", "Warmth +0.34", "Beds 3" | 3-step **quality meter** (3 pips, shape-filled), a **thermometer** glyph with the level, bed icons x3 with occupant avatars inside; closing explanatory paragraph deleted |
| Station recipe/progress lines | **Recipe equation**: `[in icon xN] + [fuel flame] -> [out icon]` with a progress ring around the station on the map; blocked = blocker icon on the equation arrow; text = tip |
| Plots/pens inspector | the stage track `raw -> tilled -> sown -> growing -> ripe` as 5 glyph steps with the current lit |
| Build palette 14 text buttons | Dock tool strip: icon buttons (44px) grouped `structure | furnish | stations | ground | edit`; Level = vertical `level-up/level-down` pair + number; Shape = 3-icon segmented; Material = swatch buttons; cost line = **cost chips** (item sprite x need, coloured `--ok` when stocked, `--danger` strike when short, `have/need` in tip). Status sentence only for the one-line hint (<= 8 words). |
| Blueprints | thumbnail (mini-canvas 48x36 drawn from the piece grid) + piece count + material chips; `rev 1` as a small tag; "2 buildings follow it, 75 pieces left" = a progress ring |
| Expedition card | **Trip card**: a dotted route from camp to target marker (drawn on the map too), member avatars along it, **found pips** (0-8 filled), time-left arc, status icon (`work`, `home`, blocker); buttons: `Recall` (icon + word), `Again`. "Autonomy never sends anyone out" sentence deleted (it is the onboarding hint #8, shown once). |

### 3.9 Whisper (replaces toasts, advisory text, "Stopped: ..." lines)

- One slot, top-centre under the villager strip, 1 line, <= 80 characters, an icon + text, 3 s, new messages *replace* (never stack). Same text dedupe as today.
- Severity icon from the message class (info / done / blocked). Blocked messages ("They cannot go: ...") put the **blocker icon on the target in the world** (2s) and the whisper reads only the short form ("No tool in reach").
- Anything that was a long toast (e.g. "Planned 22 walls. Villagers fetch the materials and build them as ordinary chores.") is split: whisper = "Planned 22 walls" + `build` icon; the explanation is onboarding hint #6 (once), then never again.
- Everything that appeared as a toast is also appended to the Story timeline (already true for chronicle-worthy events; the rest are dropped).
- `Stopped: it is morning` (skip result) = the dial flashes its sun glyph once. No words.

### 3.10 Digest ("While you were away")

A bottom sheet (same `.sheet` chrome, half-height) that shows the Story ribbon for the missed span, grouped by season, icons only, up to 12 dots; hover = sentence; any key or click dismisses. Opens only on return from a pause > N ticks (existing trigger).

### 3.11 Top-bar leftovers and menus

- `popText` ("LOW", "SHELTER" regexp alarm) is dropped from the bar; population is a number in the Village HUD. The `alarm` class path is deleted.
- Game menu -> `menu` (hamburger) popover: Save, Load, Download, Load file, New game (seed stepper + Ironman switch), Autosaves (list), Settings, Keys. Debug section appears only with `?debug=1`.
- "Pause when a villager dies" + "Show all tools" move to Settings (switches).

---

## 4. Map visual language (canvas2D, procedural, no assets)

Goal: readable at 60 villagers, legible silhouettes at 12-32px cells, a hand-made warm diorama feel. Light from the NW, shadows to the SE, everywhere.

### 4.1 Architecture and budgets

All sprites are generated at boot (and on zoom-bucket change) into offscreen canvases (`sprites.js`), then blitted with `drawImage`. Nothing is created per frame.

Frame budget at 1280x720 (16.6 ms), 60 villagers, ~40 stations/furniture, ~600 visible plants/items:

| Stage | Budget | How |
|---|---|---|
| Sim (`step`, existing) | <= 2 ms per tick, ~1-3 ticks/frame at 1x-3x | unchanged; the tick slice cap in main.js stays |
| Terrain | <= 2.0 ms | per-chunk **baked bitmaps** (see 4.2); a frame is ~12-30 `drawImage` calls |
| Plants/items/furniture/stations | <= 3.0 ms | culled to view, y-sorted once into a reused array, sprite blits only |
| Slimes | <= 3.0 ms (50 us each) | cached body bitmaps, `drawImage` with a squash transform; no gradients created per frame |
| Overlays (rings, lines, markers, pointers) | <= 1.0 ms | paths batched by colour; max 120 line segments |
| Tint/light/fog | <= 1.5 ms | one multiply fill, cached glow sprites, low-res fog bitmap (4.7) |
| HUD DOM | <= 1.0 ms | existing 4 Hz panel update cadence; DOM writes only on string change |
| **Total** | **<= 10.5 ms** | leaves ~6 ms headroom |

Hard rules: no `shadowBlur`, no `ctx.filter`, no per-frame `createRadialGradient` (cached sprites), no text except selected/hovered labels, particles capped at 150, `ts<6` LOD (4.9), cull by cell bounds, one `save/restore` per layer.
Tests (added in S19b): `ui_smoke` samples 120 `requestAnimationFrame` deltas on the `crowd` fixture (60 villagers) and asserts median <= 17 ms, p95 <= 22 ms, mean renderer time <= 9 ms (`performance.now` around `renderer.draw`). Do not enable these assertions while another agent is running the game (memory rule in `tests/README.md`).

### 4.2 Terrain

Today: one `fillRect` per cell, colour by material and depth (`fill[m][depth]`), biome tint overlay, letters for ore. New:

- **Chunk bake:** for each visible chunk (existing `RenderView`) render a bitmap at the current cell-size bucket (8/12/16/24/32 px; zoom between buckets scales the bitmap). Re-bake only when the chunk's material/height version changes or the season changes (season changes recolour the grass palette; stagger across frames, at most 2 chunk bakes per frame, 2 ms cap, old bitmap shown meanwhile).
- **Soft shading:** per-cell deterministic jitter `+/-3%` lightness from a hash of (x,y,z); a faint 1-cell 20%-alpha noise blotch layer gives grass texture without per-cell blades.
- **Edges:** where a cell's neighbour is a different material, draw a 1-2px darker *outline on the side facing the lower/other material*, and for grass->dirt/sand/rock, a rounded 3-4px transition (corner arcs) so patches have organic borders instead of staircase squares.
- **Height cliffs:** if the neighbour to the S/E is lower than this cell by >= 1 z, draw a **cliff face** strip (`0.25*ts` high, rock colour darkened 30% with 2 vertical streak lines); neighbours N/W lower get a thin highlight line on the lip. Depth below the viewed z keeps the existing `SHADES` darkening but with a cool bias.
- **Water:** base blue + 2-3 slow-scrolling highlight dashes per chunk (drawn on the live canvas, not baked, 20 per frame max), shoreline = lighter 2px rim, depth as value.
- **Ore/minerals** (instead of letters): each ore = a small cluster of 2-3 facets in its colour on the rock cell, drawn into the bake (flint dark-grey shards, malachite green crystals, clay pale blobs, iron rust bands, coal black chunks, salt white cubes, peat brown bricks, herb leaf tuft). Letters removed.
- **Unexplored land** (S16): same bake pipeline, desaturated 60% + 35% value, no detail layer, edge vignette toward fog.

### 4.3 Slimes

A slime is a **blob body + face + lineage mark + state overlays**, drawn into cached bitmaps by `slimes.js`.

- **Body:** a superellipse blob (8 control points, bezier, a flat-ish bottom) filled with a vertical gradient `hue/sat/lightness -> lightness -12%`, a glossy highlight ellipse (upper-left, white 35% alpha; *glossier = higher max health*, per GDD §21), a darker 2px outline (`--bg` at 70%) and a soft ground **shadow ellipse** (black 25%, offset SE). Size ~ mass; juveniles are 0.68x; elders are 0.9x and paler.
- **Cache:** body bitmaps keyed by `(hue bucket 24 | OkabeIndex, size bucket 6, state 4 [normal, sleep, sick, hurt], lineage pattern 8)` = ~4600 worst case but only the used ones are created lazily (typically < 200); 48x48 each; LRU 512.
- **Squash and stretch** (per frame, via `drawImage` scale): idle breathing `sy = 1 + 0.04 sin(t*2 + phase)` (phase from id so a crowd doesn't pulse in unison); walk hop `sy = 1 + 0.12 * |sin(t*speedGene)|` with matching `sx` compensation; landing squash 80ms; sleep `sy = 0.7`; fear shiver 2px jitter at 20 Hz; build/chop strike = a quick stretch toward the target. `speed` gene scales the hop rate.
- **Face:** two dot eyes (2px at ts<16, bean at >=16) looking toward the current target/facing; mouth line appears for mood extremes. Blink every ~3-6 s (id-hashed). Eyes closed when asleep.
- **Lineage mark:** pattern overlay clipped to the body (spots, stripes, ring, cross, chevron, diamond, dots-line, plain); mixed-line children show half/half. Drawn at `ts>=12`; below that the body is the lineage Okabe colour only in `lineage palette` mode.
- **Halo:** possessed slime = warm-white `--poss` ring above the head (a flattened ellipse) that bobs, plus a soft pool of light on the ground. Followed/selected rings in 4.8.
- **Profession accessory** (GDD §21): when a top skill passes a threshold, one 6px accessory (apron strap, goggles, headband) is composited in the bitmap key.
- **Held item:** the item sprite drawn in "hands" (above-front, bobbing in sync).
- **Trail:** speed gene > 1.1 leaves 3 fading ghost dots (alpha .2/.12/.06) only while walking and only for the selected slime (budget).
- **LOD:** `ts<6` coloured dot with 1px outline; `6-12` body + shadow + job dot; `>=12` full; `>=24` eyes, mark, accessory, held item.

### 4.4 Plants, items, stations, furniture: silhouettes

Everything is a **sprite function** `(ctx, size, state) -> bitmap`, cached per `(kind, state, sizeBucket)`; each has a 1px dark outline and a SE shadow. Never a bare square.

- **Trees:** trunk + 2-3 overlapping canopy ellipses with a light top-left highlight; deciduous canopies shift to autumn orange / bare in winter (state = season); burning = flame sprite + char; felled stump = pale cut ring; burnt = charcoal.
- **Shrubs/berry bushes:** low blob with 3-5 red dots; picked = no dots; frozen-off in winter.
- **Grass tufts:** 3 blades; short = 2.
- **Crops (plots):** soil bed with furrow lines (raw = flat tan; tilled = furrows; wet = darker); sown = 2 tiny sprouts; growing = leafed plant scaling with stage; ripe = fruit dots + gentle bounce; overripe = pale. Replaces the flat `fillRect` square.
- **Items on the ground:** the same sprite as the HUD stock tile at 0.7x, 2 px shadow; piles: 2-4 overlapping with the count chip.
- **Stations:** hearth/fire ring (stone ring + flame animation of 3 cached frames, glow), workbench (top-down plank table with tool silhouettes), kiln (dome with vent), drying rack (A-frame with strips, loaded = berries hung), smoker (rack + smoke wisps, existing logic), jar/cellar hatch, shelf, pen fence (post-and-rail with the rail connecting to neighbours by autotile), wagon/cart (box + wheels, hitch). Progress = a ring arc around the station (3.8).
- **Furniture/rooms:** bed = leaf pallet with a pillow bump and, if occupied, a tinted lump; door = frame + swing arc; walls = **autotiled** (neighbour mask -> corner/edge pieces, wood-grain lines, 1px top highlight, SE shadow); floors = pattern per material (thatch hatch, plank lines, brick offset) at 12% contrast; roof = a lighter overlay with eave shadows shown only when "roofs shown" or the viewer is inside.
- **Ghosts (blueprints):** the real sprite at 45% alpha with a dashed outline in `--water`; unmet material = item chip in `--danger`; in-progress = fill-up from the bottom (a clipped reveal) instead of the stipple.
- **Creatures:** hopper (round body, long ears), wolf (dark pointed shape, eyes), thornback (spiny curve); same cached pipeline; threat creatures get a faint `danger` shadow ring when within 24 cells of the camp.

### 4.5 Light, warmth, day/night, season tint

- **Time of day:** one `globalCompositeOperation = "multiply"` full-screen fill with a colour from a 6-key curve (dawn `#ffd9b0`, noon `#ffffff`, dusk `#ffb78a`, night `#44557f`, with the existing `isNight`/`dayF`). Lights (`lightSources()` torch, hearth, lit kiln) **punch** the tint using cached radial-glow sprites drawn with `lighter` at the light's radius (Hearth radius = `FIRE_R`); in caves/underground the multiply colour is near-black and only lights reveal. This replaces the two rgba rectangles.
- **Season tint** = a second multiply term + palette shift (grass hue, canopy colour): spring `#ecfff0` fresh green, summer `#fff8e0` warm, autumn `#ffd9b0` orange, winter `#d8e8ff` cool and desaturated. Season particles: spring petals, autumn leaves (14 on screen), winter snow (60 on screen, y-sorted behind/over). All capped; `calm` = none.
- **Heat shimmer:** see 3.6. **Warmth overlay:** 2-3 contour rings.

### 4.6 Fog and unknown

- **Fog bitmap:** 1 pixel per cell, `seenAt`/`exploredAt` -> alpha (unknown 1.0, explored-not-seen .55, seen 0), upscaled with `imageSmoothingEnabled = true` so edges are soft and organic; one `drawImage`; rebuilt incrementally when seen sets change.
- Unknown cells inside rock keep their dark colour but a **wisp texture** (static 64px noise tile, multiply, 10%) so they read as "unexplored", not "void".
- A faint gold pulse on the frontier edge where a villager is currently pushing it (expedition/dig) (1 ring per 2 s).

### 4.7 Selection, hover, job and target lines

- **Selection ring:** an ellipse on the ground (not a circle around the sprite), `--sel` 2px; focus = 3px + an outer faint ring; a rotating dash segment (0.5 rev/s) on the focused slime; `calm` = static.
- **Hover:** a 1px white outline of the sprite silhouette (draw the cached body bitmap through a 1-px outlined version) rather than a cell box; cursor label (name only) after 400 ms.
- **Group selection:** members get a small ring dot; the crew colour appears on a 2px under-ring.
- **Job/target lines:** a gentle curved dotted line (quadratic, bend 12% of length) from slime to target in the **class colour**, animated dash flow *toward* the target, ending with the job icon at the target (14px) and a small blocker icon if stalled. Drawn for the selected/hovered/focused slimes by default; the overlay button shows all (cap 60 lines, shortest first).
- **Order flags:** the target gets a flag sprite (not an outlined box); issued marker = ripple ring + the verb icon rising 12px and fading.
- **Relationship lines** (3.1) drawn only for the focused slime.
- **Concern markers/pointers:** 3.4, drawn after the world, before the HUD.

### 4.8 LOD summary (cell size `ts` in px)

| ts | Terrain | Plants/items | Slimes | Overlays |
|---|---|---|---|---|
| < 6 | colour only, no edges | dots at density | dot | rings only |
| 6-12 | edges + cliffs | sprites, no outline | body+shadow+job dot | rings + lines |
| 12-24 | full | full | + face, mark, chip on interest | all |
| >= 24 | full + water dashes | + animated frames | + accessory, trail, held item | all + labels |

---

## 5. Layout (1280x720 first; scales up)

One HUD composition, fixed grid, nothing floats on its own:

```
+------------------------------------------------------------------------------------------+ 40px top bar
| [dial+Day 5]  [pause 1x 2x 3x ▸▸]   . . . . . . . . .      [Build][Book][Layers][☰ Menu]  |
+----------+-------------------------------------------------------------+-----------------+
| VILLAGE  |  [villager strip: 14 avatars +N]   (centre, y 44..72)        |  INSPECTOR      |
| (264w)   |  [whisper line] (centre, y 76)                               |  (296w)         |
| season   |                                                              |  appears only   |
| food run |                         WORLD                                |  with selection |
| concerns |                                                              |  villager / room|
| beds ... |                                                              |  station / crew |
| stores / |                                                              |  expedition     |
| crews    |                                                              |  (Why on top)   |
|          |                                                              |                 |
+----------+                                                              |                 |
| MINIMAP  |   [ DOCK: verbs for selection / build tools / possession ]   |                 |
| 160x160  |                                                              |                 |
+----------+-------------------------------------------------------------+-----------------+
 footer: hint (left) . fps/seed (right, ?debug only)
```

Geometry at 1280x720: top bar 40; left column x 8..272 (264w), y 48..536 Village HUD (scrolls inside), minimap x 8..168, y 544..704 (160px, 8px gutter); right column x 976..1272 (296w), y 48..712; world free area x 280..968; dock centred in 280..968 at y 656..712 (max 688px: 14 buttons x 44 + gaps = 640). Strip (y 44..72) and whisper (y 76) sit in the same 688px free band. No panel overlaps another at 1280x720; at 1920x1080 widths stay fixed and the world grows.

- **Minimal top bar (8 controls total):** dial+day; pause + 3 speed buttons (1x/2x/3x) + a `ff` popover (5x/10x/25x/50x/MAX + Next morning / Next season / Until something happens as icon+word rows); right: Build (toggle), Book, Layers popover (5 overlay toggles as icon buttons with tips: zones, job lines, warmth, rooms, hazard), Menu. Settings and Help are in Menu. `fitTopbar()` (access.js) is no longer needed.
- **Left column = Village HUD** (merges Village + Concerns + stock + Crews; Blueprints move to the Build dock). Order: pip row + count; season ribbon with food runway; concern row; bed/rack/field rows; demand chips; tabs [Stores | Crews]. Collapsible to a 56px "pill": count, concern pips, runway mini bar.
- **Right column = one Inspector** (merges Why + Inspector + Room + Station + Plot + Pen + Expedition + Wagon cards): a stack with the chrome header (icon, name, close). Contents switch on selection kind; Why is its first section. When nothing is selected the column is empty (world gets the width). Tabs when needed: `Now | Body | Kin`. Replaces `#colR` panels `why`, `insp`, `exp`.
- **Bottom Dock** (centre, 44px buttons, 12px radius, e1): one component with three modes: *Orders* (selection of villagers: Forage, Chop, Gather, Haul, Dig, Hunt, Move, Cancel + job icons + count badge + `Make crew`), *Build* (tool strip, 3.8), *Possess* (4.x in §7). Mode swap animates 120ms. This replaces `#orderbar` + `#buildbar` + `#possbanner`.
- **Minimap** (S17): bottom-left, 160x160, `--s1` chrome, 1px `--sel` viewport rectangle, village outline, concern pips at their locations, explored mask, frontier marks; click/drag pans. Toggle `M`.
- **Merges summary:** Village+Concerns+Stock+Crews -> Village HUD; Almanac+Chronicle+Notables+Help -> Book; Why+Inspector+Room+Station+Exp -> Inspector; Order+Build+Possess -> Dock; Toast+Advisory+Digest -> Whisper + edge pointers + Book sheet.
- **Z-order:** world < pointers < HUD < popover < sheet < whisper (whisper stays visible over sheets).
- **UI scale** (existing `--ui` zoom) applies to HUD containers; layout is computed from CSS grid tokens, not pixel offsets (`left:336px` coupling dies).

---

## 6. Onboarding: the first 10 minutes, taught by showing

Principle: **no help wall, no modal, no blocking**. A small state machine (`ui/guide.js`, S19b) watches `game.sim`/`ui` for *capability moments* and plays one hint at a time. A hint = a highlight **pulse** (ring around the target element or map position), an optional **ghost hand** (SVG hand sprite that animates the gesture: move, click ripple, drag, right-click ripple), a **keycap** badge for the hotkey, and <= 6 words of caption in the whisper slot. Each hint:
- completes the moment the player does the thing (not on a timer), fades in 200ms;
- is shown at most twice, then retired; seen-state in `remember("tips")`;
- yields to anything urgent (concern level 3) and to possession;
- is fully off with Settings > "Show tips" (default on) and in `calm` mode becomes a static ring without animation.
Pacing: never more than one hint per 20 s; hints do not repeat after completion; the first hint arrives at t = 4 s.

| # | Minute | Trigger | Shown (what animates) | Words (<= 6) | Done when |
|---|---|---|---|---|---|
| 1 | 0:04 | game start, nothing selected | ghost hand moves to a slime and clicks; slime ring pulses | "Click a slime" | a villager is selected |
| 2 | 0:20 | selected, Inspector open | the job chip on the slime and the Why chain section pulse | "See why they act" | hover/open Why chain |
| 3 | 0:45 | first selection done | ghost hand right-clicks a tree; target ripple; dock "Chop" verb highlights | "Right-click to order" | an order issued |
| 4 | 1:30 | order complete | time dial pulses; ghost hand clicks `2x` | "Speed up" | speed >= 2x |
| 5 | 2:30 | first stock appears | the Stock tile pulses; ghost hand clicks it, stepper appears | "Click to keep a stock" | a keep target set |
| 6 | 3:30 | first concern >= 2 (cold/food) | the edge pointer pulses + arrow bounces; Village HUD concern chip pulses | none (the pointer *is* the hint) | `locate` used |
| 7 | 4:30 | `build` unlocked (existing `game.unlocked`) | Build button pulses; in build mode ghost hand **drags** a rectangle on open ground; ghost wall ghosts appear | "Drag to plan" | a plan placed |
| 8 | 6:00 | a villager is selected, not possessed, >= 5 min | the `possess` button + keycap `Q` bounce | "Q: guide them" | possess used once |
| 9 | 7:00 | first discovery | lightbulb burst; Book button gets a violet pip, then a **Know** tab dot | "Something was learned" | Book opened |
| 10 | 9:00 | expedition unlocked + adults selected | the Trip button pulses once; caption states the freedom, one time: "They'll manage without you." | | opened or ignored (retire after 1) |

- **Contextual hints (any time, once each, after minute 10):** first spoilage -> stock tile darkens + a pulse on `dry`; first winter -> season ribbon winter marker pulses; first illness -> `tend` icon row; first death -> a gravestone marker with a soft white ring and no caption; first beast near camp -> the edge pointer.
- **Stretch:** the sim itself already hides systems until earned (`game.unlocked`); the guide only points at what has just appeared.
- **Keys reference** (`Keys` tab in the Book, plus `?`/`H`): a keyboard graphic (keycaps grouped by purpose, icon + word on hover) instead of the numbered "first ten minutes" list. Rebinding stays in Settings.

---

## 7. FPV (S18) consistency

The possession HUD uses the **same kit** in both renderers; the DOM HUD does not change between the top-down and first-person views, only the Dock mode and the camera.

- **Dock in Possess mode** (bottom centre): left = Avatar (halo ring, lineage mark) + 4 **NeedRing**s (food, water, energy, warmth; 28px) + health heart + a `fear` ring only when > 0; centre = held-item sprite slot (the item sprite, count chip) with a `put down` keycap `G`; right = action keycaps with icons: `E use` (icon changes with target: `chop`/`mine`/`forage`...), `C eat`, `V drink`, `N sleep`, `T take tool`, `O torch`, `U support`, `Esc release`. Words on hover only; the keycap letter is the label. Replaces the whole purple banner.
- **Top-centre "Guiding Sun" plate:** `possess` icon + name + `Esc` keycap, 28px high; on its right a `lock`-badged speed chip when capped at 2x. Hazard line -> **hazard icons** (`bad-air`, `cave-in`, `dark`) with Pip shape; nothing printed.
- **Target hint:** the thing under the crosshair/cursor gets a floating **verb chip** (the verb icon + keycap `E`) anchored above it, and its tip reads the existing `interactAt` text. Same chip component in 2D (anchored in world space) and FPV (anchored to billboard).
- **Shared sprites:** the FPV renderer uses the same procedural sprite functions via `view: "side"` (see `sprites.js` API: `slime(opts, view)`, `item(kind, view)`) so a billboard slime and a map slime have the same silhouette, palette, lineage mark, and the same Okabe lineage option. Billboards are baked at 4 facings from the same body generator.
- **Shared tint:** the time-of-day/season multiply colour and the glow sprites (4.5) are exported by `tint.js` and used by both renderers.
- **Same tokens/icons:** the FPV overlay is the same DOM. A vignette (radial gradient, `--bg` 0-55% alpha) frames FPV; need rings below the soft threshold flash a screen-edge tint in the need's role colour plus its icon (never colour alone).
- **Mode crossing:** entering FPV plays the `possess` icon flash and the halo contracts into the dock avatar (200ms), releasing reverses it.

---

## 8. Implementation plan

### 8.1 Split

**S19a: design system, HUD composition, panel merges, show-don't-tell conversions in the DOM** (about 60% of the work, no renderer changes except tiny hooks).

| Step | Work | Done when |
|---|---|---|
| a1 | Tokens in `shell.html` (replace the ~200 CSS lines with token-based `:root` + component classes); `kit.js`, `icons.js` (registry + SVG symbol sheet + `drawIcon`), `tip.js` (rich tooltip, `data-tip`) | one chrome and one button set render everywhere (existing panels re-skinned first, no layout change) |
| a2 | Layout shell: `hud.js` creates the grid (top bar, Village slot, Inspector slot, Dock, minimap slot); `main.js` mounts panels into slots; `#colL/#colR/.col` removed | the 1280x720 composition of §5 with legacy panels inside, no overlap |
| a3 | Top bar rebuild (dial `dial.js`, speed, `ff` popover, Layers popover, Menu popover); debug items behind `?debug=1` | 8 controls visible |
| a4 | Village HUD: runway bar, season ribbon, concern chips, bed/rack/field/pen rows, stock grid, stepper popover, demand chips, Crews tab; retire `concernpanel` list + `advisory.js` + `.warn` | no sentence on the default HUD longer than 8 words |
| a5 | Inspector: Now/Why chain, NeedRings, gene strip, skill ranks, kin row, sickness icons; room/station/plot/pen/wagon/expedition cards in the same chrome; merge Why panel into it | Why is a chain, words on hover |
| a6 | Dock: Orders / Build (tool strip + cost chips + thumbnails) / Possess (§7) modes; retire `#orderbar`, `#buildbar`, `#possbanner` | |
| a7 | Book sheet (Story/Know/People/World/Keys) merging Almanac, Chronicle, Notables, Help; Digest as a bottom sheet; Settings re-skin | |
| a8 | Whisper replaces toasts; `game.toast` kept as a thin alias (`whisper(msg, ms)`) so call sites survive; blocker-on-target hook | no stacked messages |
| a9 | Concern edge pointers + map markers (overlay layer, in `overlays.js`); concerns() additive fields `icon`, `sev` | |

**S19b: map visual language + onboarding.**

| Step | Work |
|---|---|
| b1 | `sprites.js` (item/plant/station/furniture bitmaps + cache), item sprite reuse in HUD |
| b2 | `slimes.js` (body gen, squash, face, marks, LOD, atlas cache); renderer `villager()` rewritten; GLYPH/ORE_LETTER removed; job chip, need badge, held item |
| b3 | `terrainbake.js` (chunk bitmaps, edges, cliffs, water, ore facets); renderer terrain path switched, old `fillRect` path kept behind `?flat=1` for a regression screenshot |
| b4 | `tint.js` (time-of-day/season multiply, glow sprites, shimmer, particles); `fog.js` (low-res bitmap) |
| b5 | `lines.js` (job/relationship/route lines, rings, ghosts, markers) replacing `jobLines`, `zones`, `warmth` in `overlays.js`/`ghosts.js` |
| b6 | `guide.js` (onboarding state machine, ghost hand SVG, pulses), hints table of §6; `Show tips` setting |
| b7 | Perf pass: measure, enforce budgets of 4.1; CVD filter dev switch; screenshot checklist |

### 8.2 Files

**Create (`game/src/ui/`):** `icons.js`, `kit.js`, `tip.js`, `hud.js`, `dial.js`, `whisper.js`, `dock.js`, `book.js` (Story/Know/People/World/Keys pages), `village_hud.js`, `inspector_cards.js` (room/station/plot/pen/wagon/expedition cards extracted from `inspector.js`), `pointers.js` (edge pointers), `guide.js`, `minimap.js` (S17).
**Create (`game/src/render/`):** `sprites.js`, `slimes.js`, `terrainbake.js`, `tint.js`, `fog.js`, `lines.js`.
**Change:** `shell.html` (tokens/CSS, SVG sprite host, new mount points; `data-test` hooks), `main.js` (mount, `game.toast -> whisper`, remove `fitTopbar` calls), `topbar.js`, `village.js` (split into data helpers kept + `village_hud.js`), `concernpanel.js` (retire), `concerns.js` (add `icon`, `sev`; keep `text`, `loc`, `level`), `advisory.js` (retire; keep `newAdvisor` pure logic if the one-time attention ring uses it), `inspector.js`, `almanac.js`, `chronicle.js`, `crews.js`, `expedition.js`, `build.js`, `blueprints.js`, `rooms.js`, `possess.js`, `settings.js`, `help.js` (becomes `Keys` page), `notables.js`, `access.js`, `dom.js` (`bar`/`createPanel` -> thin wrappers of `kit`), `text.js` (unchanged contract; add `CLASS` shape/colour tokens), `renderer.js`, `overlays.js`, `ghosts.js`.
**Unchanged:** everything in `src/sim/*` (UI reads sim only); `ui/pick.js`, `ui/input.js`, `ui/keys.js`, `ui/saves.js`, `ui/skip.js`, `ui/slots.js`, `ui/orders.js`, `ui/text.js` data functions.

### 8.3 Tests that must keep passing

- `tests/ui_text.js` (text.js pure functions): untouched; the text still exists, it just moves to tips.
- `tests/ui_s12.js` (accessibility: UI scale, high contrast, CB marks, calm): update to the new tokens; the settings keys `hc`, `calm`, `cb`, `scale` keep their names and storage keys.
- `tests/command.js` (concerns ranking, crews, blueprints, save/determinism): `concerns()` return shape stays a superset: `{k, level, text, loc, adv?}` + new `icon`, `sev`.
- `tests/crowd.js` (60 villagers, < 2 ms/tick), `tests/determinism.js`, `tests/save_roundtrip.js`, `tests/possess.js`, `tests/settle.js`, `tests/endless.js`, `tests/all.js`: must be unaffected (no sim edits). Add a guard in review: `git diff --stat src/sim` must be empty for S19.
- `tools/ui_smoke.js` (Playwright): migrated per below; its screenshots are regenerated into `game/tmp/ui-s19-*.png`.
- New (S19b, run alone): `ui_smoke` frame-time sampling on the `crowd` fixture.

### 8.4 ui_smoke selector survival; `data-test` attributes

`ui_smoke.js` uses ~40 selectors (`#panel-insp .pbody`, `#panel-why .pbody`, `#panel-concerns .pbody`, `#panel-village`, `#panel-crews`, `#panel-exp`, `#panel-almanac`, `#panel-chron`, `#panel-bps`, `#notables .nt`, `#possbanner`, `#digest .dg-close`, `.tb-game`, `.tb-almanac`, `.tb-build`, `.tool-wall`, `.keepedit input`, `.bs-n`, `[data-mat='brick']`, `#settingsOverlay ...`). Strategy:

1. **Add `data-test` to every interactive or asserted element** with a stable name and migrate `ui_smoke` to `[data-test=...]` in S19a step a1: `data-test="topbar"`, `speed-1x`, `ff`, `build-toggle`, `book`, `menu`, `layers`, `village-hud`, `concern-chip[data-class=food]`, `stock-tile[data-item=log]`, `keep-input`, `keep-step[data-d=10]`, `inspector`, `inspector-now`, `why-chain`, `why-words`, `dock`, `dock-verb[data-verb=chop]`, `tool-wall` (etc., `tool-<id>`), `book-tab[data-tab=know]`, `settings`, `settings-close`, `digest`, `digest-close`, `whisper`, `trip-card`, `crews-tab`, `crew[data-id]`.
2. **Keep legacy ids/classes during the migration** (`id="panel-insp"` on the Inspector root, `#panel-why .pbody` = the "Now" section, `.tb-game`, `.tb-almanac`, `.tb-build`, `.tool-*` on the new buttons) so a partially migrated smoke still runs; remove them at the end of S19a after the migration commit.
3. **Text assertions survive via `.sr` copy:** the smoke reads `innerText` of `#panel-insp .pbody` and `#panel-why .pbody` (names, "Why", sentences). Every iconic element carries its sentence in a visually-hidden `.sr` span (not `display:none`, so `innerText` includes it). The `why-words` disclosure is rendered closed but in the DOM.
4. **Behavioural assertions** stay the same (click Build -> `.tool-wall` visible; keep-N input -> stock changes; Esc stops skip).

### 8.5 Risks and calls

- **Icon authoring volume (120 glyphs):** hand-authored paths are the schedule risk. Cut line if late: drop `era-*` and event icons to emblem-letter badges; everything else keeps its icon.
- **Sprite cache memory:** slime bitmaps 48x48 x 512 LRU = 4.7 MB; chunk bakes at 32px cells, 16x16 chunk = 262 KB each, cap 150 = 39 MB (the existing `RENDER_CACHE` of 2400 generated chunks is data, not bitmaps; bitmaps are limited to the visible set + 1 ring).
- **Native `title` removal** needs a pass across ~100 call sites; `tip.js` auto-promotes `title` to `data-tip` on mutation for any leftovers (one `MutationObserver` at boot, then off).
- **`ui_smoke` / sim must never be run while another agent works the game** (memory rule). The implementing agent runs unit tests first, ui_smoke once, sequentially.

---

## 9. Screenshot checklist: "done" means all of these pass

Capture via `tools/shot.js`/`ui_smoke` on 1280x720 (and one 1920x1080) into `game/tmp/ui-s19-*.png`. Each shot also taken under `?cvd=deutan`, `?cvd=protan`, `?cvd=mono`, high contrast, and UI scale 1.25.

**Layout and chrome**
1. `s19-start` (fixture `start`): top bar has <= 8 controls; no panel overlaps another; Village HUD, Inspector slot empty, Dock hidden, minimap present.
2. `s19-crowd` (fixture `crowd`, 60 villagers, selected 3): world still readable; strip shows 14 + `+N`; no stacked toasts.
3. `s19-1920`: the same composition scales without drift.
4. Every panel uses the same header, radius, border, padding (zoom-in grid shot of Village HUD, Inspector, Book, Settings).

**Show, don't tell** (assert visually: the sentence is *absent* from the resting HUD)
5. `s19-food-winter` (winter ahead, runway short): runway bar with snowflake marker and hatched shortfall; concern chips food + cold; edge pointer toward camp; no `.warn` paragraph.
6. `s19-stock-grid`: tiles with keep ticks; one refilling badge; one spoiling tile darker with flies; stepper popover open.
7. `s19-villager-card`: NeedRings, gene strip, skill rank pips, kin row; no numbers visible.
8. `s19-why`: chain (job chip, class badge, score bar), 3 greyed rejected chips with blocker icons; hovering one shows the sentence; "Say it in words" closed.
9. `s19-sick`: sick badge, helping icons; Concerns chip only.
10. `s19-room`: requirement rings with one `cross`; ghost bed shown in the room on the map; quality pips; no checklist prose.
11. `s19-station`: recipe equation + progress ring on the station sprite.
12. `s19-build`: tool strip, cost chips with one short (struck), shape/material segmented; blueprint thumbnail.
13. `s19-trip`: expedition route, member avatars, found pips.
14. `s19-book-*`: Story ribbon, Know ring (12 nodes), People grid, World bends; no paragraph over 2 lines.
15. `s19-whisper`: one line only after five rapid commands.
16. `s19-possess`: dock in possess mode with 4 rings; no purple banner; plate on top; same ring component as the Inspector.

**Map**
17. `s19-map-day / dusk / night / winter`: tint curve, hearth glow, shimmer, snow particles.
18. `s19-slimes-zoom24`: face, lineage marks, held item, squash visible across two frames (two shots 150 ms apart).
19. `s19-terrain`: soft edges, cliffs with faces, ore facets, water highlights; compare with `?flat=1` (old) to confirm nothing regressed in data (same cells).
20. `s19-fog`: soft frontier; unknown rock with wisp texture.
21. `s19-lines`: job lines (class colours, flow arrows, target icons), relationship lines on hover.
22. `s19-lod`: ts = 4, 8, 16, 32: each readable, no clutter at 4.

**Accessibility and onboarding**
23. Five CVD variants of 5, 7, 18: lineage can be sorted by marks (12 villagers / 4 lines, >= 11/12 per GDD §19.6), severities distinguishable by pip shape.
24. `calm` mode: no animation, pips and rims still distinct.
25. `s19-guide-1..10`: each hint frame shows pulse + hand + <= 6 words; none blocks input.

**Performance:** `crowd` fixture: median frame <= 17 ms, p95 <= 22 ms, renderer <= 9 ms; HUD DOM writes per second < 30 at idle.

**Cohesion test (human):** cover the labels of any 3 screenshots; a reviewer must name the chrome style, button set and icon family as the same in all. If one stands apart, it is not done.

---

## 10. Levels (z) must read at a glance (user feedback 2026-10-28; S19b priority 1)
User: "It's not clear what you're looking at vs not able to see vs what's on your current layer." Fix with five distinct, never-confused states, each with its own look (not only colour):

| State | Look |
|---|---|
| **On this level** (walkable floor at the viewed level) | full colour, crisp edges, entities fully drawn |
| **Below, visible through open air** (looking down a shaft, cliff drop) | desaturated + darkened per level (max 4 bands), a soft drop-shadow edge where the floor ends; entities there drawn smaller/faded with a "↓n" chip |
| **Cut rock at this level** (solid cell sliced by the view) | flat charcoal with a diagonal hatch (the "cut face"), lighter rim where it borders open floor so tunnels read as carved |
| **Above you** (roofs, overhangs, hills higher than the slice) | not drawn as ground; only a thin outline/ghost of the roof edge, toggleable (roof cutaway) |
| **Unknown** (never seen) | a distinct dotted/noise "unknown" pattern, not plain black, so "not seen" ≠ "solid" ≠ "empty" |

Plus:
- **Two named modes**, shown on a vertical **depth gauge** on the right edge: `Surface` (default; the top of every column, height-shaded) and `Slice: level N` (shows "N below surface" relative to camp ground, not a raw z). The gauge marks levels that have slimes (dots) and dug areas; click a mark to go there. `[` `]` step, `Home` returns to Surface.
- **Following / selecting a villager underground switches the view to their level** automatically (and back to Surface when they come up), with a short slide animation of the gauge.
- **Depth badges:** villagers not on the viewed level get a "↑n / ↓n" chip in the strip, the minimap, and as an edge pointer if off-screen.
- **Surface mode shows underground activity** as subtle markers over the ground (pickaxe dot above active tunnels, slime count above a shaft) so the player knows to look down.
- **Transition cue:** changing level cross-fades (120 ms) rather than snapping.
- FPV needs none of this; it is the alternative way to *be* underground.
- Screenshot checklist adds: the same mine viewed in Surface, Slice −2 and Slice −5, each obviously different; a slime on a hill, in a tunnel and in a cave, all findable in under 2 seconds.

## 11. Game speed is a developer tool (author, 2026-10-28)
Speed buttons, MAX and skip-to are for development and playtesting, not a player feature. In S19, move them behind `?debug=1` (or a Settings › Developer toggle), with keys 1–9 kept. The player-facing top bar shows only pause/play and the time dial. Don't spend design effort on their look.

---

## 12. Playtest feedback (author, 2026-10-28) — overrides earlier sections where they differ

### 12.1 Simple labels are wanted (amends §0.2)
"Show, don't tell" stays, but **short labels are fine, and good**: a verb plus an object, 1–3 words ("Eat berry", "Attack Wolf", "Chop tree", "Sleep"). What's banned is explanation sentences. Icons carry meaning; a short label rides with the icon wherever an action, target or state needs naming. Tooltips may hold the longer `explain()` text.

### 12.2 Action feedback (FPV and top-down)
Every player action shows its outcome immediately:
- **Target chip:** "Attack Wolf", "Eat berry", "Pick bush", always the verb plus the target's name.
- **Progress:** a ring or bar on the chip while the action runs.
- **Result:**
  - **Hit or miss:** a floating damage number or "miss", a hit flash on the target, the target's health bar appearing and dropping, and a small screen shake or knockback tick (respecting calm mode).
  - **Eat:** the hunger ring visibly fills, with a "+food" pop.
  - **Success:** "+1 log" pops toward the hand slot.
  - **Failure:** the blocker icon plus a 1–3 word label ("Too far", "No tool", "Full hands").
- **Ongoing state:** what the possessed slime is doing ("Chopping…", "Eating…") and what nearby slimes and creatures are doing, as small floating labels on hover or crosshair.

### 12.3 First person moves on the grid (replaces free mouse-look)
Free rotation breaks the vibe and makes grid movement confusing. FPV becomes a **grid crawler** (Legend of Grimrock / Eye of the Beholder style):
- Four facings, turning in 90° steps with a short smooth turn animation (~150 ms).
- Steps are one cell, with a smooth glide.
- Keys:
  - W/S: forward/back.
  - A/D: strafe.
  - Arrow left/right (and the mouse wheel or `,` `.`): turn. Optionally, a Settings switch "A/D turn" swaps strafe and turn.
  - All remappable.
- Pitch is fixed, with a slight downward look so the ground in front is visible. Optional small pitch nudges with the arrow up/down keys.
- The mouse doesn't rotate the view. It clicks things on screen to target them; the default target is the cell or creature directly ahead.
- No pointer lock.

### 12.4 "Show me" must land somewhere visible
Any jump to a thing (a concern chip or pointer, the minimap, Tab or selecting a villager, the chronicle, the expedition card) sets the view so the thing **and its surroundings** are visible:
- If the target is on the surface (its column top), use Surface view.
- If it's underground, use the slice at its level, with a lit radius around it even when unexplored ("revealed for viewing" only, never revealing fog in the sim).
- Never leave the view on a level where the target's cell is cut away or black.
- Bug seen: a concern click put the view on a level that showed nothing.

### 12.5 Height and levels: switch the main map to the GDD's 3/4 oblique camera (S19b rescope)
The flat top-down slice has no sense of height: cliffs and mountains can't be read, and level changes make things vanish unexplained. R2's default camera was always a **fixed-pitch 3/4 oblique view onto a z-sliced world** (the current level plus dimmed levels below, roof and wall cutaway, a ghost of the level above). 6.19b implements that, reusing the S18 WebGL chunk mesher:
- Orthographic, fixed yaw, about 50–60° pitch. Hills show their faces, cliffs are visible walls, and height reads from shading and from the side faces.
- **Surface mode:** everything drawn.
- **Slice mode:** a clipping plane at the viewed level. Cut faces are drawn hatched or flat. Levels below show through openings, dimmed. Things above are only outlines.
- The depth gauge from §10 is still used. Its label always says what you're looking at ("Surface", "3 below ground").
- Slimes, creatures, plants and items are billboards (sprites.js, shared with FPV). Selection rings, job lines and ghosts are projected.
- Picking must stay exact: the cell under the cursor uses a GPU pick or a ray through the grid.
- Fallback: the current canvas2D renderer stays for no-WebGL and `?flat=1`.
- Performance: 60 fps at 60 villagers, with mesh caching per chunk (as in FPV).
- §4's procedural art direction (squashy slimes, edges, tints) applies to the billboards and terrain shading.
