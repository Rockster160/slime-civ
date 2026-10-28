# Open Decisions

Slime / Dorf Village (working title). Companion to docs/GAME_DESIGN.md §28 (status DRAFT v0.3, final critique applied), docs/PROTOTYPE_PLAN.md, docs/TECHNICAL_RISKS.md, docs/MVP_SCOPE.md.
Canon: notes/phase2/RESOLUTION.md and notes/phase6/RULINGS.md (K1-K11; GDD Appendix A explains each reference). "DEFAULT" = recommended and used for planning; reversible after the named evidence.
**Owner**: *Author* (Rockster160: creative direction and taste, agreed-direction items) or *Director* (Opus: consistency, scope, rulings). Where a decision needs both, the primary is first.
**Blocks**: the first checkpoint (C1, C2, C3 in GAME_DESIGN §26; "MVP" for the Essential tier) whose work cannot proceed sensibly without the decision. "none" = cannot block the first planet.
Status words: OPEN (needs a decision), DEFAULTED (director ruling exists as a DEFAULT; revisit on evidence), DEFERRED (consciously postponed).

Numbering matches GAME_DESIGN §28 (OD-01 to OD-14); OD-15 onward are the further decisions.

---

## A. The decisions named in the brief

### OD-01 Collective belief (Ork-style technology)
- **Status**: DEFAULTED (R13): Experimental, deferred.
- **Question**: ship it, cut it, or keep it only as a design hook?
- **Options**: (a) ship in the first planet; (b) defer, keep rules written; (c) cut entirely.
- **Default**: (b). Rules if it ever ships (D 2.6): per-villager `conviction(claim)` spread by the existing gossip mechanism at reduced strength per hop; effect = sqrt(sum conviction) of those in range (diminishing returns); each use spends conviction and regrowth costs leisure labour (a sink); observed failures reduce conviction; effects modest and qualitative; **no conviction from deaths ever**, no direct write from possession or orders. Keep a `mechanism` field in capability data so belief can be one later.
- **Evidence that would change it**: P11 shows the craft/engineering path feels thin without it; testers ask for "a different way to get things done"; octoshrimpy/author interest after the slice. Cost 2-4 FTE-months plus tuning (D, ASSUMPTION).
- **Owner**: Author. **Blocks**: none (post-MVP).

### OD-02 Offline progression
- **Status**: DEFAULTED (R22).
- **Question**: does the world advance while the game is closed?
- **Options**: (a) no catch-up; world runs only while the game runs (may be unfocused/backgrounded); (b) crude aggregate catch-up on return; (c) calibrated Tier-2 catch-up with digest.
- **Default**: (a) in MVP; on return, a **chronicle digest** of what happened. Far settlements (later) use aggregate LOD.
- **Evidence that would change it**: the first-return experience test (folded into P14): players who leave for hours feel "my village was not mine"; or the author's "meant to be left running" intent proves stronger than the no-timers line. Must pass the ±15% one-sided calibration (P14) before enabling.
- **Owner**: Director, with Author on feel. **Blocks**: MVP polish (digest copy and UI); full catch-up blocks nothing.

### OD-03 Camera: second view
- **Status**: DEFAULTED (R2): one 3/4 oblique camera; first-person, billboard 3D, DQ XI dual-view and side-view are Experimental/post-MVP.
- **Question**: is a second view wanted, and which?
- **Options**: (a) none; (b) billboard 2.5D renderer on the same sim; (c) first-person only for possession; (d) DQ XI-style dual view.
- **Default**: (a), via a second renderer only if P6's stub costs <25% of the first renderer *and* possession feels flat on the tight-follow 3/4 camera (P8). Author prefers one view ("cameras are hard enough to balance").
- **Evidence that would change it**: P6 and P8 results; art budget.
- **Owner**: Author. **Blocks**: C2 (sprite angle and pitch fix the art and the building UX).

### OD-04 Lifespan anchor
- **Status**: DEFAULTED (R1).
- **Question**: how long does a villager live in real time at 1×, and how many game days make a year?
- **Options**: 4-7 h (D), 8-12 h (R1), 8-15 h (A).
- **Default**: **~10 real hours at 1×** (tunable 8-12); game year ≈ 1/4 of a life (≈2.5 h). Canonical clock (K2): 20 ticks per real second at 1×; 1 game day = 1800 ticks = 90 s; 100 days per year = 180,000 ticks; short constants are written in ticks with real seconds in brackets. Every rate (skill K, transmission, generations, knowledge-loss severity, unattended window) is **derived from this anchor**.
- **Evidence that would change it**: P12 (craft survives ≥8 of 10 generations by proximity learning; loop completes in hours); perception that permadeath is too frequent or too rare; the "attachment" test (do testers care when a villager dies).
- **Owner**: Director. **Blocks**: C1 (aging) and C3 (K).

### OD-05 World representation
- **Status**: DEFAULTED (R3); not finalised. K1: a <=1-week desk spike plus a throwaway mining+room test in the default grid only; the layered-2D alternative is built only if that spike fails.
- **Question**: layered 2D, 3D z-level grid, side-view, billboard 2.5D, full voxel?
- **Default**: 3D integer z-level grid, chunked 16³, ~2 B/cell, rendered as slices; MVP 128×128×24. Evaluation in docs/TECHNICAL_RISKS.md §2.
- **Evidence that would change it**: P5 (layered 2D covers the slice with <50% of 3D LOC and no scripted compromises → reopen); P1 over budget.
- **Owner**: Director. **Blocks**: C2.

### OD-06 Engine
- **Status**: OPEN by design (R24): not chosen.
- **Question**: which engine/language?
- **Options**: Web (TS/JS + Canvas/WebGL, sim in a Worker); Godot 4 (GDScript/C#); Unity; Rust/custom (see GAME_DESIGN §23.10).
- **Default**: no choice; criteria E1-E12. Decide **after the C1 microbench, P4, the P5 spike, P6 and a UI spike, and before C2 art work** (K9). Constraint: the sim language must run headless in CI. A provisional prototype stack is recommended separately in OD-41 and does not decide this.
- **Evidence that would change it**: n/a (this *is* the evidence gate). Note the reuse asymmetry: adapting slime-village's JS is 1-2 FTE-months vs 4-6 in another engine (D 7.3, ASSUMPTION); that is an input, not a verdict.
- **Owner**: Director (criteria), Author (taste, final call among passing candidates). **Blocks**: C2 art work (C1 uses the provisional stack, OD-41).

### OD-07 Multiplayer model
- **Status**: DEFAULTED (R23).
- **Question**: what is the first multiplayer form and the later one?
- **Options**: (a) async snapshot visiting ("Postcards"); (b) consensual co-op live, lockstep; (c) co-op server-authoritative; (d) none.
- **Default**: (a) first, (b)/(c) later, no invasion, no netcode now. Do now: command log, determinism, state hash, stable global ids `(worldId, counter)`, plain-data versioned records, no privileged local state (GAME_DESIGN §20.3).
- **Open sub-questions**: lockstep vs server-authoritative (lockstep needs cross-machine bit-exact determinism, hard in JS; TR-16); moderation of names/text; whether foreign genomes may enter a world.
- **Evidence that would change it**: slice is done and the author wants visiting; engine choice (OD-06) shifts determinism cost.
- **Owner**: Author. **Blocks**: none for the first planet; post-MVP.

### OD-08 Species #2 (Dorfs)
- **Status**: DEFAULTED (R15): slimes only on the first planet.
- **Question**: add Dorfs or another species, and when?
- **Default**: no; species is a data table (traits, needs, body plan) so one can be added later. Estimated 6-12 FTE-months for a second species (D 7.3, ASSUMPTION). Candidate: Dorfs (author's 2021 Godot 3 start; nothing to reuse).
- **Evidence that would change it**: the first planet is complete and content budget exists; a design reason (different progression) the slime table cannot express.
- **Owner**: Author. **Blocks**: none.

### OD-09 Drones as very-late sci-fi (author vs octoshrimpy)
- **Status**: DEFAULTED (D3): no drones, no belts.
- **Question**: does the late game allow drone/bot labour?
- **Default**: **No.** The author is unconvinced; transport tiers stay hand → basket/box → backpack → wagon → animal cart → rail (R21). "Labour stays manual, assisted by machinery."
- **Evidence that would change it**: author's explicit decision after the first planet; a late-era design that keeps hauling and building labour with villagers (e.g. drones as *tools carried by a villager*, not autonomous labour).
- **Owner**: Author. **Blocks**: none.

### OD-10 Steward
- **Status**: DEFERRED (R8): post-MVP option.
- **Question**: does a "Steward" (autonomously choosing from the player's blueprint library) exist?
- **Default**: no in MVP. Autonomy builds only starter shelters and blueprints flagged **auto-build**; new functional kinds come only from the player's designs.
- **Evidence that would change it**: P9 shows long unattended play stagnates uncomfortably for management-averse players, or testers repeatedly flag a blueprint "auto-build" for every building (then the Steward is a UI shortcut).
- **Owner**: Director. **Blocks**: none.

### OD-11 Game title
- **Status**: OPEN.
- **Default**: working title "Slime / Dorf Village". The brief forbids committing to a final title.
- **Evidence that would change it**: species decision (OD-08); marketing needs.
- **Owner**: Author. **Blocks**: nothing in design; store pages and branding only.

### OD-12 Save-scum / ironman
- **Status**: DEFAULTED.
- **Question**: how hard to enforce permadeath against reloading?
- **Options**: (a) allow reload, no anti-scum code; (b) optional autosave-only ("ironman") mode; (c) enforced single save.
- **Default**: (a) + (b). The sim is deterministic and saves RNG state, so a reload replays the same outcome unless input changes; no anti-cheat; fix the unfair deaths that cause reloads (D 2.10).
- **Evidence that would change it**: playtest: players reload so often the stakes vanish; or a "ironman is the intended mode" author call.
- **Owner**: Author. **Blocks**: C1.

### OD-13 Possession buff and speed cap
- **Status**: DEFAULTED (R9): +10% action speed, +15% XP, Steadfast; no timer, no cooldown; release only on collapse.
- **Question**: exact numbers; whether to cap game speed while possessed.
- **History**: A +25% XP +10% speed; C 1.15/1.25; D +15% work rate/+10% stamina efficiency with 60 s afterglow and snap-out; tech review "no numeric buff". R9 chose Steadfast to give the felt "extra push… defeat a difficult enemy" qualitatively.
- **Default**: as R9; speed capped at 2× while possessed, default 1× (DEFAULT, D11; GAME_DESIGN §07, §19). K7: the buff is a felt bonus, not the reason to possess; the reasons are Steadfast against the thornback (fear 0.6 flee threshold for the AI) and access to cells the AI refuses (see OD-44).
- **Evidence that would change it**: P8 (buff perceptible to ≥7/10; possessed ≤1.25× delegated; possession not mandatory). If nobody possesses, raise the speed term; if possession dominates output, lower it.
- **Owner**: Director. **Blocks**: C3.

### OD-14 Map size and population ceiling
- **Status**: DEFAULTED (R3, R4).
- **Default**: 128×128×24; design range 6-60 named villagers; sim ceiling ~100; larger operations are crews/standing orders. C's 256×256×48 and 200 villagers remain stress headroom, not requirements.
- **Evidence that would change it**: P16 (time-to-landmark; resource found within 2 game days on ≥80% of seeds); P1 (headroom).
- **Owner**: Director. **Blocks**: C1.

---

## B. Further open decisions found in the notes

### OD-15 Art fidelity and sprite angle
- **Question**: placeholder-grade vs polished art for the slice; how many sprite angles.
- **Options**: grey-box; pixel 3/4 placeholder; polished pixel 3/4.
- **Default**: placeholder-plus 3/4 sprites, one pitch, no rotation (R2); art/audio 3-8 FTE-months is outside R26's band unless stated (D 7.3, ASSUMPTION).
- **Evidence**: P6 readability; author taste. **Owner**: Author. **Blocks**: MVP polish (polish), C1 (pitch).

### OD-16 Hidden genotype and inbreeding depression
- **Question**: show genotype or only phenotype; add inbreeding depression?
- **Default** (R16): phenotype and observed performance with ±8% expression noise (heritability ~0.6-0.7); no numeric genotype readout; **hidden genotype and inbreeding depression added only if the breed-best bot beats the 1.15× gate.** Ancestry ids (~6 ints per villager) kept cheaply.
- **Evidence**: P13; whether testers find noisy phenotype arbitrary (D risk 2). **Owner**: Director. **Blocks**: C3.

### OD-17 Clone (solo split) limit
- **Default** (R16, D rec 3): ≤1 per life; clones regress toward the mean; stacking load (−6% maxHealth, −10% fertility per consecutive clone generation, SPECULATION); last-resort case kept.
- **Evidence**: P13; whether the author wants cloning as a visible mechanic at all. **Owner**: Author. **Blocks**: C3.

### OD-18 Does the player ever pick mates?
- **Default** (D #1): No. Mate choice stays with the slimes; levers are housing, proximity, who is sent where, feasts and risk.
- **Evidence**: testers want "breeding programmes"; P13. **Owner**: Author. **Blocks**: C3.

### OD-19 Skill curve constants (K, potential range, effect slope) and leisure XP
- **Default**: `potential = 0.7 + 0.3·aptitude`; `effect = 1 + 0.8·level`; **K ≈ 30% of adult lifespan** (rescaled from D's 25 work-days of 80); leisure XP at 25% rate capped at ~40% of potential, **shipped as flavour tags plus discovery aptitude only in the slice** (design review 2.6); `rust` deferred.
- **Evidence**: P12, P13, perception test. **Owner**: Director. **Blocks**: C3.

### OD-20 Knowledge model depth (skill-only vs notion layer)
- **Default** (R10): single layer: per-craft familiarity (0-1) and skill XP; "known" means familiarity > 0; Teach is fast, proximity is slow; documents/libraries later with skill capped ~0.3-0.4.
- **Evidence**: P12's skill-only vs notion comparison; testers find chronicle stories thin. **Owner**: Director. **Blocks**: C3.

### OD-21 Rediscovery discount and brute-force ratio
- **Default**: rediscovery near evidence: design value about 0.2× the first cost (D8), pass gate ≤0.4× (P11/P12; D, structure fine, number made up); brute force 3-5× informed. **Evidence**: P11/P12 on the actual chain. **Owner**: Director. **Blocks**: C3.

### OD-22 Per-seed property perturbation
- **Default** (D 2.5, #17): ±10% on melt points and which ores alloy, validated by the solvability harness. Trade: balance testing harder. **Evidence**: P11 stuck rate; whether recipe forums matter. **Owner**: Director. **Blocks**: C3.

### OD-23 Hostile design and the pacing director
- **Default** (D #16, R12): wildlife with needs and environmental hazards; no wave director; mild environmental pacing only (lightning fires, erosion/cave-ins exposing ore, seasonal drought). **Evidence**: P11 pacing; stagnation reports. **Owner**: Author. **Blocks**: C3/C3.

### OD-24 Determinism level (same-build vs cross-machine)
- **Default** (R23): same-build, same-engine; transcendentals lint-restricted, not rewritten; integer positions/timers. Cross-machine only if lockstep is chosen (OD-07). **Evidence**: P4 divergence report. **Owner**: Director. **Blocks**: none before post-MVP polish.

### OD-25 Save migration policy
- **Default**: migration chain or a chronicle-export fallback; never silently drop a long-lived world (slime-village refuses incompatible saves, existing_material B13). **Evidence**: first schema break. **Owner**: Director. **Blocks**: MVP polish.

### OD-26 Tick rate
- **Status**: CLOSED by K2. **Default**: fixed 20 Hz game-time; speed = ticks per frame; 1 game day = 1800 ticks. **Evidence**: P1, P8 (feel at 20 Hz with sub-cell render interpolation). **Owner**: Director. **Blocks**: C1.

### OD-27 Lighting model for caves and mines
- **Question**: is darkness a mechanic? (Tech review 4.1 item 6: "reading the unknown" is not in A or B.)
- **Default**: per-cell light radius from torches; darkness limits sight for possession and expedition recall; no day/night light simulation beyond the season/warmth curve. **Evidence**: P8. **Owner**: Author. **Blocks**: C3.

### OD-28 Mood causes
- **Default** (D 2.7): ~6 causes, each changing behaviour. **Evidence**: playtest; mood that changes nothing is cut. **Owner**: Director. **Blocks**: C1.

### OD-29 Relationships
- **Default** (RESOLUTION cut): family + friend/rival only; no pairwise graph (top-5 sparse ties at most). **Owner**: Director. **Blocks**: none.

### OD-30 Culture
- **Default** (R13/R14 cuts): chronicle tallies only; mysticism folds into culture; no tradition system. **Evidence**: slice stories feel thin. **Owner**: Author. **Blocks**: none.

### OD-31 Combat depth
- **Default** (R20): one wounding fauna, simple and lethal combat (6-10 attack types total, no combos, positional risk); full combat deferred. Auto-combat = flee at X, fight if cornered. **Evidence**: P8. **Owner**: Author. **Blocks**: C3.

### OD-32 Settlements per world and multiple settlements
- **Question**: does the first planet have more than one player settlement?
- **Default**: one active settlement in the slice; later settlements via LOD Tier 1-2 (P14). The brief wants "the same individuals and settlements across the progression". **Evidence**: M7 feedback; P14. **Owner**: Author. **Blocks**: post-MVP polish.

### OD-33 Tech eras covered on the first planet
- **Default**: stone → metal → early industry, no space (D 7.5); eras are labels (R14). Slice: only one step. **Evidence**: content budget after C3. **Owner**: Author. **Blocks**: none for slice.

### OD-34 Alternate implementations per capability slot
- **Default** (R13): 1 implementation per slot + alternates on 2-3 slots (e.g. preserving by salt/drying/smoking/cold cellar) chosen by environment, to prove the architecture. **Evidence**: P11. **Owner**: Director. **Blocks**: C3.

### OD-35 Unattended window and fast-forward
- **Default**: 2 real hours at ≥90% survival (R8 validation; A claimed 2 h, D 30-60 min). **Evidence**: playtest of what players want to return to. **Owner**: Director. **Blocks**: C1.

### OD-36 Transport tiers beyond baskets/backpack
- **Default** (R21): the slice has hand → basket/box → backpack; wagon, animal cart, rail are post-MVP; no priority matrix. **Owner**: Author. **Blocks**: none.

### OD-37 Chronicle size and content
- **Default**: ≤1 MB; firsts + top-K per year; 30-entry per-villager ring. **Owner**: Director. **Blocks**: C3.

### OD-38 Accessibility scope
- **Default**: lineage mark + CVD-safe icons, remapping, UI scale, reduced motion in MVP; gamepad and screen-reader later (GAME_DESIGN §19). **Evidence**: tester feedback; budget. **Owner**: Author. **Blocks**: MVP polish.

### OD-39 Doors and room semantics
- **Default** (C 5): doors separate rooms; open/close does not recompute rooms; oversize lowers quality; room cap 4096 cells is arbitrary and is tested with real builders (design review 3). **Owner**: Director. **Blocks**: C2.

### OD-40 Cancel loss on construction
- **Default**: recover ≥75% of delivered materials (knob 0-25% loss). **Owner**: Director. **Blocks**: C2.

---

## C. Phase-6 additions (final critique)

### OD-41 Provisional prototype stack (K9)
- **Status**: OPEN, recommendation made; author to confirm.
- **Recommendation**: write the C1 headless sim core in TypeScript, reusing slime-village's harness, save round-trip and sweep patterns, with a minimal canvas debug renderer. Explicitly throwaway-acceptable; it is **not** the engine decision (OD-06), which stays on criteria E1-E12 and is due before C2 art work.
- **Evidence that would change it**: the C1 microbench fails the tick budget; the author prefers to start in another language (the sim must still run headless in CI).
- **Owner**: Author. **Blocks**: C1.

### OD-42 Strain
- **Status**: CLOSED (K5): cut. Needs and the rested curve do its job (mood below 0.30 slows work 15%; below 0.10 pre-empts orders).
- **Reopen only if**: the over-ordering bot shows needs plus the rested curve do not bound order abuse. If reopened it must define what raises it, what lowers it, its effect and its cap.
- **Owner**: Director. **Blocks**: none.

### OD-43 Blueprint revision scope (K10)
- **Question**: when an edited blueprint is pushed to existing instances, what may change (cells, furniture, material class), who confirms, and how are inhabited buildings handled?
- **Default**: manual "push revision"; villagers rebuild the differences and keep what matches; no tech gate; partially built instances are updated in place. Lands in the MVP tier, not the slice.
- **Evidence that would change it**: P2/P7 checks show rebuild-diff waves flood the board or strand occupants.
- **Owner**: Author. **Blocks**: MVP (orders at scale work package).

### OD-44 Possession niche parameters (K7)
- **Question**: exact values for the fear flee threshold (0.6 for the thornback, 150 HP), which cells the AI refuses (unsupported spans, bad-air pockets), and thornback difficulty.
- **Default**: data rows tuned in C3; AI refusal list is `unsafe`/`airpocket` cell tags (GAME_DESIGN §13.3).
- **Evidence**: the informal "second voluntary possession" check at C3; deferred P8.
- **Owner**: Director. **Blocks**: C3.

### OD-45 Start state and survival economy numbers (K3)
- **Question**: are the ASSUMPTION values in GAME_DESIGN §11.16-§11.17 survivable and fun (6-8 villagers, 3 game days of food, food labour 40-60% early)? Does the start include sun-drying on a stick rack so a first winter is survivable?
- **Default**: sun-drying known at the start (ASSUMPTION); numbers as written in §11.16-§11.17; tuned by the C1 sweep.
- **Evidence**: P9 sweep, first-winter survival rate.
- **Owner**: Director. **Blocks**: C1.
