# Revision log B (gdd_B.md §15-§28, docs/MVP_SCOPE, TECHNICAL_RISKS, OPEN_DECISIONS, PROTOTYPE_PLAN)

Format: location -> change -> ruling. Critique items are cited CR#.

## gdd_B.md
- §15.1/15.2 -> honest "authored graph; emergent route, timing, who, pressure, alternates" wording; knowledge two-numbers pointer to §10 -> K8, CR13, CR15 (kept two numbers to match A's §10)
- §15.3/15.5/15.8 -> durations in ticks with seconds in brackets (BAKE_CLAY 600, SMELT 1200, dedup 450, watch rate 0.025/100 ticks) -> K2, CR1
- §15.4 -> tinker class standing when requested, leisure otherwise; tinker aptitude -> K8, CR12
- §15.5.1/15.5.2 -> fire discovered by witnessing, not known at start; copper example matches §11.9 (P = H x E x D, listed layouts, no closet cheat) -> K3, K8, CR11
- §15.6 -> silhouettes post-slice -> CR (duplicate systems)
- §15.7 -> table with slice column, start state, D14 content cost (system 1-1.5 mo, 12 discoveries 10-15 wk, full planet 4-8 mo, chain subset 4-6 wk) -> K8, K3
- §15.8 -> era labels Hearth, Hide, Stone, Clay, Timber, Copper, Iron, non-cumulative highest-rank rule; Stone = DRESS_STONE (stone-working beyond knapping); shelter column from materials -> K10, CR18
- §15.10 -> three levers instead of six; trims -> CR (micromanagement)
- §17.2/17.3 -> selection as the primary gesture, crew optional; strain row replaced -> K10, K5
- §18 -> rescue window 600 ticks; era-label order; grief/graves/notables tagged post-C3 -> K2, K10, CR22
- §19 -> profile tables condensed to pointers; crews/strain removed; possession purpose (Steadfast, restricted cells); forty game minutes -> ticks -> K11, K5, K7, K2
- §21 -> Hide row added; era look list -> K10
- §22 -> select + right-click vocabulary; strain readout replaced -> K10, K5
- §23 -> Units & clock box; 23.12 Provisional prototype stack; engine gate wording; slice bots; P5 reduced; 30 s constants in ticks -> K2, K9, K1
- §24-§28 -> rewritten: checkpoints C1-C3, effort table (C1 2-3, C2 +2-3, C3 +3-5, slice 7-11, MVP 21-40), process diet, exit criteria with fun checks, risk register re-ranked, new ODs 41-45 -> K1, K7
- Appendix A (decision references, incl. CR line) and Appendix B (slice content list) added -> K11

## docs
- MVP_SCOPE: definitions, tier edits, §1.6 slice cut list, §2 roadmap by checkpoint, §3 line-item effort (slice 7.3-11.0; Essential 13.2-28.6; MVP about 21-40), rule 5/6 -> K1, CR7, CR8
- PROTOTYPE_PLAN: clock, process diet, statuses/triggers per prototype, P5 reduced, P6 stub deleted, criteria converted to ticks and informal tests, K4/K6/K7 criteria, §5 ordering, §7 first ten days -> K1, K2, K4, K6, K7, CR17, CR25
- TECHNICAL_RISKS: TR-02, TR-14, TR-22, TR-23, TR-29, TR-32 updated; TR-33 added; strain cut; P5 section -> K1, K5, K8, K9
- OPEN_DECISIONS: OD-04/05/06/13/26 updated or closed; checkpoint "Blocks"; OD-41..45 added -> K1, K2, K5, K7, K9, K10

## Not applied / notes
- K1 "P5/P15 two world models": interpreted as P5 only (P15 is the Almanac test, deferred).
- CR15 one-scalar knowledge: not applied; A's §10 keeps two numbers with justification, so §15.2 points there.
- CR14 spans advisory and CR20 glossary are in A's files; CR23 left to A.
- DECISION_LOG D15 still says slice = M0-M7 6.5-12; needs a note (not my file).
- Critique R-numbers collide with RESOLUTION R-numbers; cited as CR# here.
