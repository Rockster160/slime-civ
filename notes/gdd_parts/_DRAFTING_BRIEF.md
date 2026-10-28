# Drafting brief — GDD sections (Phase 3)

You are drafting part of docs/GAME_DESIGN.md. Other drafters write other sections in parallel; an editor merges them.

CANON, in priority order (read first):
1. notes/phase2/RESOLUTION.md — director rulings R1–R27, cuts, CANONICAL TERMS. These override everything below. Use the canonical terms exactly.
2. notes/CONTEXT_BRIEF.md — AGREED author direction.
3. notes/phase1/{A_gameplay,B_world_progression,C_simulation_tech,D_balance_feasibility}.md and notes/phase2/{design_challenges_tech,tech_challenges_design}.md — source material. Mine them for concrete mechanics, numbers, examples. Where they conflict with RESOLUTION, RESOLUTION wins.
4. notes/existing_material.md — slime-village prior art; say "carried over from slime-village" where a mechanic is reused.

WRITING RULES
- Concrete and achievable. No "advanced AI", "deep simulation", "rich ecosystem". State the rule, the data, the number (numbers are starting values; mark ASSUMPTION where unvalidated, reference prototype P# from RESOLUTION where applicable).
- Every major subsystem section uses these sub-headings: **Purpose · Player experience · Mechanics · Interactions · Progression · Failure states · Exploits & counters · MVP vs later**.
- Include at least one short practical example of player interaction per subsystem (a 2–6 line vignette: "The player drags a crew of three onto the copper seam...").
- Distinguish AGREED (author) / DECIDED (director) / PROPOSED (new mechanic) where it matters.
- Don't invent a title; call it "the game" or "Slime / Dorf Village (working title)". Don't name an engine as chosen.
- No fluff paragraphs, no marketing voice in system sections. Tables welcome.
- Headings: each section starts with `## NN. Title` exactly as listed in your task; subsections use `###`.
- Prefer cross-references ("see §09") over repeating another section's mechanics.

OUTPUT: write only your file in notes/gdd_parts/. Reply to Opus with ≤15 lines: what you wrote, any place you had to make a design call not covered by RESOLUTION (list each — these go to the decision log), and line count.
