# Phase 6 rulings (Opus) on notes/phase6/critique.md

The critic's verdict is accepted: one cohesive design, over-scoped. These rulings take precedence over the critique where they differ. Revisers apply ALL of the critique's MUST items as ruled below, and the SHOULD items unless a ruling here says otherwise. COULD items are optional.

## K1 — Re-baseline effort; make the slice small and real (critique R7/R8, risk 1)
- Accept that the current line items sum to roughly 25–54 FTE-months. Say so honestly in MVP_SCOPE and §24/§26.
- Introduce **playable checkpoints**, each a thing someone can play:
  - **C1 "Leaves & Sticks"**: villagers, needs, job board, orders, gathering, one hazard (cold). About 2–3 FTE-months.
  - **C2 "First Hut"**: freeform build, rooms, one purpose, blueprint + stamp, plus minimal possession. About +2–3.
  - **C3 "Clay & Copper"**: skills, genetics, discovery chain fire→clay→charcoal→copper, mining, thornback. About +3–5.
  - **C3 = the vertical slice.** It costs about 7–11 FTE-months, which is ASSUMPTION.
- **MVP** (complete first planet, publicly playable) = slice + Essential tier. Give it an honest range from the line items.
- **Process diet.**
  - Only prototypes that gate a checkpoint decision run before C3. That is at most 6; pick them and defer the rest with a named trigger.
  - Bots in the slice: absent-player, over-ordering and grind only. Breed-best and possess-swap come after C3.
  - Human tests are informal, with 3–5 testers per checkpoint. Drop elaborate panels.
- **P5/P15 (two world models):** do NOT build both. Do a ≤1-week desk spike comparing on paper, plus a throwaway mining+room test in the default 3D z-level grid only. Build the layered-2D alternative only if that spike fails.

## K2 — Time units (critique R1)
> **Superseded by S18b / D35 (2026-10-28):** the calendar day is now 12000 ticks (10 real min), a life 5 game years; durations are flat ticks except age and the calendar. The 90 s day below is the old clock.
- **Canonical clock:** at 1× speed the sim runs 20 ticks per real second. 1 game day = 90 real seconds = 1800 ticks. A game year is 100 days, about 2.5 h. A life is about 4 game years, about 10 h.
- **Forbid "game minutes" and "game hours"** for short constants. Express short constants in **ticks**, with real seconds at 1× in brackets. Express long constants in game days or years.
- Convert every existing short constant so the intended real-time feel is preserved. Examples: switchCost commitment, the 30 s rescue window, reservation grace, and the rested curve.
- Put a **"Units & clock" box** at the top of §23 and reference it from §09 and §10.

## K3 — Start state, survival economy, demand vector (critique R2/R3, risk 3)
Specify in §09 and §11, with numbers marked ASSUMPTION.
- **Start state:**
  - 6–8 adult villagers of mixed age, from 2–3 founder lineages.
  - Leaf beds only.
  - Known at start: forage, gather sticks/stones/grass, carry by hand, knap stone (knapped hand-tools). **Fire is NOT known**: it is the first discovery, from witnessing a lightning/stump fire.
  - 3 game days of food in hand.
- **Survival economy:** food per villager per day, food sources and their yields, and how many workers on average keep N villagers fed in each season (with winter deficit). This must show that ≈40–60% labour on food is needed early, falling as preservation and tools arrive.
- **Demand vector:** reuse the slime-village `computeDemand` pattern. List the components (food days-of-stock, shelter coverage, warmth/fuel, tools, materials for queued orders) and their formulas.

## K4 — Board classes & food reserve (critique R4)
- **Village-level critical needs** are scored at **need class**, not demand class. They are: food stock < 2 days per head, no shelter during cold, no fuel during cold. So they beat orders exactly as personal critical needs do.
- **Jobs derived from an order** (hauling for a blueprint, etc.) inherit **standing class (200), not order class (300)**. Only the player's directly ordered action is class 300.
- Show the worked example: a stamp of ×10 houses during a food dip. Food workers stay on food, and the build slows but does not starve anyone.

## K5 — Strain (critique R5)
- If "strain" exists only to stop possession/standing-order abuse, replace it with what already exists: needs and the rested curve.
- Keep strain only if a section depends on it mechanically. If kept, define it fully: what raises it, what lowers it, its effect, and its cap.
- Default: **cut strain.**

## K6 — Skill specialisation (critique R6)
- The rested curve must not make rotation optimal. Daily XP reduction applies only past about 60% of a working day in one craft, and floors at 50% gain.
- `skillFit` must outweigh moderate path cost for skilled jobs. Use about 40 points at skill 0.7 against about 20 for path cost.
- Villagers have a **preferred craft** (their top skill), which gets a stickiness bonus.
- Masters must emerge. That makes craft loss on death a real possibility, softened by K-R11 evidence-rediscovery.
- Add a bot check: in a 6-villager colony after 1 game year, the top skill holder per craft is at least 0.25 above the median.

## K7 — Possession: earlier, felt, cheap (critique R10, risk 5)
- **Minimal possession moves to C2:** move, interact, and the same Actions as AI, which is cheap once the Action/Controller layer exists. Possession combat polish comes in C3.
- **Why possession matters without being optimal:**
  - (a) **Steadfast.** Autonomous villagers flee the thornback above a fear threshold; a possessed one can stand and fight. That is the "defeat a difficult enemy" push the author wanted.
  - (b) **Risk.** Autonomous safety rules keep villagers out of unsupported spans and bad-air pockets. A possessed villager can go there at the player's risk, so possession reaches places the AI won't.
  - (c) The +10% speed / +15% XP buff stays as a felt bonus. It is not the main reason to possess.
- The bot band remains: possessed output ≤ 1.25× delegated output for ordinary work.

## K8 — Discovery chain must be computable (critique risk 2)
- **Specify the heat function with numbers** (fuel × enclosure × draft → heat level 0–5). Remove the contradiction about closet and 1-cell pit caps.
- **Copper design:** smelting needs heat 4. Heat 4 can be reached with a charcoal-fuelled enclosed pit/kiln plus draft (a bellows or an open flue). State exactly which cell layouts reach 4.
- The tinker job's class is **standing** when the player asks for it, and **leisure** otherwise.
- **Starting capabilities** are as in K3.
- **Content cost** is per D14: system 1–1.5 FTE-months, slice content 10–15 FTE-weeks, full first planet 4–8 FTE-months. Fix §15.7, TR-23 and MVP_SCOPE to match.
- **Honest wording:** the phenomena data forms an authored graph. What is emergent is which route is taken, when, by whom, and under what pressure, plus the alternates per capability slot. The doc must not claim "no graph".

## K9 — Provisional stack (critique R9)
- **Still no engine commitment** (brief constraint).
- Add a **"Provisional prototype stack"** recommendation in §23 and as an OD:
  - Write the C1 headless sim core in TypeScript, reusing slime-village's harness, save round-trip and sweep patterns, with a minimal canvas debug renderer.
  - This is explicitly **throwaway-acceptable** and does not decide the shipping engine.
  - Engine selection criteria stay in §23, and the decision is due before C2 art work.
- Mark this as a **recommendation**, author to confirm.

## K10 — Author-intent drift (critique §4)
- **Eras:** add **"Hide"** (hide teepee) between Hearth and Stone/Timber, so the era labels read Hearth → Hide → Stone → Clay → Timber → Copper → Iron. Check that the order matches the slice chain, and adjust if Clay comes before Timber.
- **Orders:** the PRIMARY order gesture is "select villagers → right-click target → they do it", which is the author's "you 5, go harvest lumber".
  - A crew is just "name this selection" and is optional.
  - Make §07 lead with the simple gesture.
- **Upgrade existing buildings:** add **blueprint revision**. Editing a blueprint can push the revision to existing instances; villagers rebuild the differences, keeping what matches. This covers "upgrade existing ones" without a tech tree, and goes in §12.
- **Teepee → cabin → brick:** show a shelter progression in §12/§21 that comes from materials, not unlocks.

## K11 — Readability (critique §5)
- Add **Appendix A, "Decision references"**: one line per R#/D#/K# cited in the docs, so a developer doesn't need notes/.
- Add **Appendix B, "Slice content list"**: the actual named items, not counts — materials, crafts/phenomena, stations, furniture, fauna, flora, room purpose. Keep it short.
- Where §15 and §19 recap mechanics owned elsewhere, trim to a 1–2 line summary plus a cross-reference.
- Bump the status line to "DRAFT v0.3 (final critique applied)".
