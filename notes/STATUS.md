# Status

| Phase | Output | State |
|---|---|---|
| 0 Workspace audit | notes/existing_material.md | done (Sonnet) |
| 1 Investigation | notes/phase1/{A_gameplay,B_world_progression,C_simulation_tech,D_balance_feasibility}.md | done |
| 2 Cross-review | notes/phase2/*.md, notes/phase2/RESOLUTION.md | done (Opus rulings in RESOLUTION.md) |
| 3 GDD draft | docs/GAME_DESIGN.md | v0.3 final (consistency pass + critique revision applied) |
| 4 Vertical slice | docs/PROTOTYPE_PLAN.md | drafted |
| 5 Scope docs | docs/MVP_SCOPE.md, TECHNICAL_RISKS.md, OPEN_DECISIONS.md | drafted |
| 6 Final critique + revision | notes/phase6/{critique,RULINGS,revision_log_A,revision_log_B}.md | done |

Model note: brief named "Codex Luna"; not installed. Per user instruction all Luna roles run on Claude Sonnet subagents. Opus = director/synthesis only.

## Implementation (prototype, game/)

| Stage | Scope | State |
|---|---|---|
| S1 Foundation | world, worldgen, pathing, deterministic tick, save, debug renderer | done |
| S2 Life & work | needs, ageing, births, job board, seasons/cold, food/spoilage/drying, beds, skills, chronicle, bots | done |
| S3 Player layer | selection, right-click orders, Why panel, keep-N, panels, save/load, help | done |
| S4a First Hut | build mode, rooms + warmth, blueprints + stamp + auto-build | done |
| S4b Possession & polish | possession (same Actions), fast-forward + skip buttons, deconstruct, winter roots, keep-N fix | done |

Remaining from C1/C2 exit criteria: human 3–5-tester fun checks; P5 world-model desk spike; engine decision (OD-06). Not started: C3 (skills depth, genetics guards, discovery chain fire→clay→charcoal→copper, mining/expeditions, thornback).
