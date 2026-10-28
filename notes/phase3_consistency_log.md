# Phase 3 consistency log (systems-consistency editor)

Scope: docs/GAME_DESIGN.md, MVP_SCOPE.md, TECHNICAL_RISKS.md, OPEN_DECISIONS.md, PROTOTYPE_PLAN.md. Canon: notes/phase2/RESOLUTION.md (R1-R27), notes/DECISION_LOG.md (D8-D11). GAME_DESIGN status line is now "DRAFT v0.2 (consistency pass done; pending final critique)".

## A. Cross-references (prototype IDs, section numbers, TR/OD ids)

| Location | Change | Why |
|---|---|---|
| GDD §09 score heading | "P-order/need thrash" -> P9 | P# numbering |
| GDD §09 truthfulness rule | "P-why" -> P10 | P# numbering |
| GDD §10 K bullet; Lifespan mismatch | "P1 lifespan prototype" -> P12 | P1 is pathing; lifespan is P12 |
| GDD §10 rediscovery | "P-forget/recover" -> P11/P12 | P# numbering |
| GDD §07 possession; camera | "possession feel" -> P8; "3/4 slice readability" -> P6 | P# numbering |
| GDD §08 mutation | "P-genetics bot" -> P13 | P# numbering |
| GDD §11.3, §11.9, §11.10 | prototype names -> P5, P2, P11 | P# numbering |
| GDD §15.4 cadence | "P-slice discovery chain" -> P11 | P# numbering |
| GDD §15.8 lifespan check | "tech review 6" -> P12 | P# numbering |
| GDD §21, §22 | "3/4 readability prototype" -> P6; "Why panel truthful" -> P10 (x2) | P# numbering |
| GDD §11.1, §11.5 (x2), §11.8 | solvability validator pointed at §11.9 (context); now §11.10 | wrong subsection |
| GDD §12.2 | "partial builds (§12.9)" -> §12.6 | §12.9 is Interactions |
| GDD §14.3 | capability "(§15.8)" -> §15.2 | capability is defined in §15.2 |
| GDD §10 (x2) | "§ Crafts below", "§ discovery" (no number) -> "Familiarity, below", "§15" | dangling refs |
| GDD §11.3 option table | letters A/B swapped to match docs/TECHNICAL_RISKS.md §2 (A layered 2D, B 3D grid); added pointer to TECHNICAL_RISKS §2 | letter clash between documents |
| GDD §09 blocker list | added `unsupported` (used by §12.3); §14.11 `no_stock`/`no_free_hands` -> `no_material`/`no_capacity`; §17.9 likewise | blockers cited must exist in §09 list |
| GDD §27 | added TR-xx ids to the ten top risks | TR cross-reference |
| PROTOTYPE_PLAN P4 / P8 "Retires" | added TR-28, TR-31 (P4) and TR-32 (P8) | TECHNICAL_RISKS §4 map lists them |
| OPEN_DECISIONS OD-02 | "design P11" removed | clashed with P11 = discovery chain |
| Checked, no change | all OD-xx, TR-xx, P1-P16, §23.10, §20.3, §19 refs from the five docs resolve | |

## B. Numbers that had to agree

| Location | Change | Why |
|---|---|---|
| GDD §07 crew bullet; §19.5 | recall rule (4 predicates, 40% health) replaced with the single rule of §13.4: turn back at half provisions or when any member drops below half health; "pack full" and "threat sighted" are ordinary haul/flee behaviour | part1 vs part3 conflict; part3 matches the tech-review reduction and MVP_SCOPE/PROTOTYPE "recall rule" |
| GDD §09 thrash row | "< 4 switches per game hour" -> "per villager per game day" | PROTOTYPE_PLAN 2d, TR-10 and §26 M2 all say per villager-day |
| GDD §10 K | "K ~ 1.0 real work-hour" -> "K ~ 30% of adult lifespan" | OD-19 and PROTOTYPE_PLAN 3a; derives from R1 anchor |
| GDD §10 / §15.8 rediscovery cost | one wording: design value ~20% (D8), pass gate <=0.4x; OD-21 and PROTOTYPE 6e updated to say both | §15.8 said 0.4x, §10 said 20%, plan/OD said <=0.4x |
| GDD §15.8 observation learning | `(1-skill)` -> `(1-familiarity)` (now defined once, in §10) | contradicted §10 formula |
| GDD §08 MVP table | "+-4% sports" -> "4% sports" | D8: 4% chance of +-8-15% jump |
| GDD §11.9 heat levels | added level 0 (Ambient) | D10: levels 0-5 |
| GDD §13.6 fauna damage | "2 HP of 10 HP" -> about half a slime's health (~50 of 100 HP) | §08 maxHealth ~100 and §13.7 "one or two hits kill" |
| GDD §06 | Hour-20 "a few seasons in" -> about 8 game years; vignette "Season 2, year 3, hour 14" -> "Autumn, year 1, hour 2"; "Copper stock" -> "Clay stock" | 2.5 h/year (D11): hour 14 is year ~5.6; clay discovery belongs in year 1 (P11/6a) |
| GDD §01 pacing | added 100 game days = 1 year, 1 game day ~ 1.5 real min | D11 |
| GDD §07, §19, §22 possession speed | "PROPOSED, max 2x" -> "1x default, cap 2x (DEFAULT, D11)" (OD-13 aligned) | D11 |
| GDD §18 chronicle storage | "~10k records ~ 2 MB" now qualified by the <=1 MB budget (OD-37, §23.8) | two sizes for one thing |
| GDD §23.4 | "128 chunks" explained (8x8x2 padded); save worst case now 128x128x24 <=500 KB (was 256x256x48 100-500 KB) | P4 gate |
| GDD §16.4/§16.10 | "3-4 alternates" -> alternates on 2-3 capability slots | MVP_SCOPE 1.2, OD-34 |
| GDD §21 era table | labels now Hearth/Stone/Clay/Timber/Copper/Iron (was Hearth/Clay/Stone/Copper/Metal); MVP row "Hearth, Stone, Clay"; biome palettes listed as MVP biomes | D10 era labels; §11.4 biomes |
| GDD §16.2 needs | "sleep, comfort" -> energy (sleep), leisure | §08 needs |
| GDD §17.2 | Crew unlock "first group > 3" -> from start (>=2 villagers); Standing order gate = first stockpile | §06/§07/§17.3 |
| PROTOTYPE_PLAN P9 | "60 villagers" -> 6 (Property 2d), with 60 as stress run | 2d is 10 orders on 6 villagers |
| PROTOTYPE_PLAN slice row 12 / out-of-slice | bot list now includes max-expansion and absent-player; transport "hand/basket" -> "hand/basket/backpack" | R25; MVP_SCOPE |
| Verified equal everywhere | possession +10% speed / +15% XP / Steadfast / 1.25x band; classBases 400u/300/200/100/0; switchCost 25 + 20 min; hysteresis ~80%-100%; map 128x128x24; 6-60 / ~100; life ~10 h, year ~2.5 h, season ~37 min; Teach x3 / x0.8; discoverer 0.5, witness 0.2; transport tiers 0-5; M0-M7 sums 6.5-12 | |

## C. Terms

| Location | Change |
|---|---|
| GDD §07 | "Ledger" (undefined) -> "order list"; §17.6 "Ledger" -> stock bar. "Ledger auto-promotion" kept only as the cut feature name |
| GDD §17.5 | "empty quest chain" -> "no firsts recorded yet" (R14: quests are chronicle firsts) |
| GDD §13.6, §21 | `coldHardy` / "cold-hardiness" gene -> maxHealth + insulation (no tenth trait) |
| GDD §18 | "prowler" -> thornback (the placeholder fauna name) in two places |
| GDD §12.7 | "bread skill" -> bread craft + crafting skill (skills list has no bread skill) |
| GDD §14.7, §14.10, §15.8, §12.10 | "Mechanical era" removed as if it were a label; stages named as stages, era labels remain the six of D10 |
| Checked, no change | "notion" appears only when describing the rejected two-layer model; "pawn"/"colonist" appear only when describing RimWorld |

## D. Feasibility / MVP-vs-later classification

| Location | Change | Why |
|---|---|---|
| GDD §17.5, §17.11 | founding a second settlement was listed under MVP; now post-MVP, one active settlement (OD-32) | contradicted PROTOTYPE_PLAN scope, OD-32, MVP_SCOPE 1.4, R22 |
| GDD §17.2 | supply order / supply network marked post-MVP; §17.6 vignette marked late first planet | D10 "later command scales" |
| GDD §14.1, §14.13 | wagon sheds / "wagon stub" removed from MVP; tiers 0-2 only | OD-36, MVP_SCOPE 1.4 |
| MVP_SCOPE 1.2 | wagon/animal-cart row changed to point at 1.4 (post-MVP) | was listed as MVP-quality deferrable, contradicting OD-36 and the GDD |
| GDD §15.2 and §15.5.2 | `can()` no longer requires skill >= 0.3 | violated R17 (skills never gate attempts) |
| GDD §15.7, §15.15, TECHNICAL_RISKS TR-23, MVP_SCOPE 1.1 | 12 discoveries = MVP content set; slice = fire -> clay -> charcoal -> copper (rows 1,5,7,9); rows 10-12 MVP-not-slice | "12-discovery slice" contradicted "one chain in the slice" |
| GDD §15.8 | "Mechanical era with observatory capstone" -> post-MVP, beyond Iron label; first-planet endpoint early industry (OD-33) | not an era label; capstone is a §20 matter |
| GDD §16.3 | attention bias/tinker weights = only MVP effects (first cut if unfelt); rehearsal and mood/belonging = post-MVP traditions; belief-like ideas via traditions marked post-MVP | RESOLUTION cut: culture = tallies only (see unresolved 1) |
| GDD §10 | rust, leisure-XP effects, 6-8 skills vs 3 in slice classified | MVP_SCOPE 1.2, OD-19 |
| GDD §12.7 | bakery example marked illustrative post-slice (slice Purpose = workshop) | no classification |
| GDD §12.3, §09 | R3 labelled DEFAULT (was DECIDED) in §11.3, §12.3; R9 labelled DEFAULT in §13.5/§18 | RESOLUTION status column |
| GDD §26 M4 | Teach action exists, UI after slice | MVP_SCOPE 1.2 |
| GDD §18 MVP table | named heirlooms (rare) listed | D8 |
| MVP_SCOPE 3.1 | note that slice total already equals MVP band (see unresolved 4) | |

## E. Duplication reduced (full text kept in the owning section)

| Section trimmed | Now a summary pointing to |
|---|---|
| §23.3 Job board (classes, blockers, crew, standing order restated) | §09 |
| §13.5 possession buff and release bullets | §07 Possession table |
| §07 standing orders and crew definition | §09 |
| §07 crew recall rule | §13.4 |
| §10 Apprenticeship rates | Teach rates in §10 Familiarity |
| §15.8 knowledge loss and transmission paragraphs | §10 |
| §16.2 slime traits paragraph | §08 |
| Checked, left: §23.2 possession modifier (architecture view), §19 profile restatements (profile tables are by design recaps), §20.3 vs §23.7 determinism (checklist vs spec) | |

## F. Drafting artefacts removed

"assembled from Phase 3 drafts" status line; "CONTEXT:" in §15.1 (-> brief); "drafted here" in §08 header; "Prototype ids ... named in RESOLUTION" in §11 header; "Recommendation (PROPOSED, flagged for the decision log)" in the save-scum stance (-> DEFAULT D8/OD-12); "(PROPOSED)" on possession speed. No remaining "part1-4", "this file" or "drafter" strings in the five docs.

## G. Unresolved (for Opus)

1. **Culture effects vs the cut.** RESOLUTION: "culture = chronicle tallies only"; D10: "culture MVP = leanings only". GDD §16.3/§15.4 give leanings a mechanical effect (witness x1.3, tinker weights). Options: (a) keep as applied (small, flagged as first cut); (b) strict: leanings are labels only in MVP, set culture_bias = 1.0 in §15.4 and drop the bullet. I applied (a) with a cut marker.
2. **Skill-curve units.** K is now "30% of adult lifespan" (OD-19), but the `rested` curve and "4 h/day" are in in-game hours while lifespan is real-time (a game day is 1.5 real min). Also K at 30% of adult lifespan gives level 0.7 at about 40% of a life, while §15.8 wants 0.7 within about 30%. P12 must settle the units and constant; no number changed beyond K's definition.
3. **Discovery content cost.** GDD §15.7 (6-10 designer-hours each, 10-15 FTE-weeks for 12), TR-23 / MVP_SCOPE (10 discoveries = 8-15 FTE-months) and M5 (1-1.5 FTE-months for one chain) disagree by an order of magnitude. Options: restate all three as one figure per discovery; or declare M5 budget covers only the slice chain. Left unchanged, flagged in §15.7.
4. **Slice vs MVP effort.** M0-M7 (the slice) already sum to 6.5-12 FTE-months, which is R26's whole MVP band; MVP_SCOPE defines MVP = slice + the §1.2 tier. Options: treat R26 as "slice-grade MVP" and add the §1.2 tier (~1-3 FTE-months) on top, or shrink milestones. Wording note added in MVP_SCOPE 3.1; numbers unchanged.
5. **Slice population 5-8 vs design floor 6.** R4 says 6-60; PROTOTYPE_PLAN, §24, §25 start with 5-8 (founders, births allowed). Left as is; confirm that the range is a settlement floor after growth, not a founding count.
6. **Rediscovery cost.** Now stated as "design 20% (D8), gate <=0.4x" everywhere; confirm that two-number reading is intended rather than one number.

## H. Structural worries

- GAME_DESIGN.md is ~257 KB; §19 (playstyle profiles) and §15 are the largest and recap many mechanics from other sections. Future edits should change the owning section only.
- Sections use two numbering styles (§11-17 numbered subsections, §08-10, §18-19, §22 unnumbered); cross-refs to unnumbered subsections are by name only.
- PROTOTYPE_PLAN Property 1b/6a are measured in game years that are 2.5 real hours each; the 50-game-year bot runs are about 125 real hours at 1x and rely on the headless harness being >100x real time.
