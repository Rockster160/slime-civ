# Phase 8: Saving (APPROVED, 2026-10-30)

Author direction (2026-10-29): "We need to ensure we save the world state as well, since the world is destructible and buildable. Should likely do chunk based saving/loading as well as B64 encode + gzip the files."

## Where saving stands today (measured, not assumed)
- **Terrain changes are saved.**
  - `save.js` regrows the world from the seed, then re-applies every changed cell.
  - `world.log` records each changed cell index from generation on.
  - `packDeltas` groups them per chunk, delta-coded.
  - Digging, building, fire and cave-ins all survive a save. The gap is *how*, not *whether*.
- **One monolithic JSON.**
  - `snapshot()` writes everything at once: the entities, the seen RLE, the ledgers, the chunk meta, the command log.
  - Storage is a single localStorage string per slot (3 autosave slots plus ironman, `ui/slots.js`), rewritten whole once per game day.
  - localStorage holds about 5 MB per origin. That covers all slots together, and the save is stored uncompressed.
- **Sizes, for the year-2 fixture.** About 223 KB raw and about 55 KB gzipped (4×).
  - entities 152 KB (68%)
  - seen 46 KB
  - discovery 11 KB
  - chronicle 5 KB
  - chunk meta 5 KB
  - terrain deltas only 2 KB
  - A long-played, heavily dug world grows mostly in **deltas, seen and entities**, all of which are spatial and chunkable.
- **Memory.** A chunk that has ever been changed (`c.mod`) is never unloaded (`chunks.js` `unload`, `if (!c.act || c.mod) continue`). An explored, mined world therefore keeps every touched chunk's full voxel array in RAM for ever. This is the real scaling problem, and chunked saving is what lets us fix it.
- **The command log** (`sim.cmdLog`) is saved whole and grows without bound. It is used for replay-determinism tests.
- **The autosave runs on the main thread:** `JSON.stringify` of the whole world, then a synchronous localStorage write.

## Goal
Every built, dug, burnt or collapsed cell, and everything on it, persists, at any world size, without long hitches and without hitting browser quotas. Far-away changed land can leave memory and come back exactly as it was.

## Design

### Save package (SAVE_VERSION 21)
A save becomes a **package**: one small manifest plus many records.

| record | contents | key |
|---|---|---|
| manifest | version, seed, tick, generation, slot meta (label, villagers, date), the list of chunk keys with each one's record hash | `m` |
| global | everything not spatial: villagers and their memory, stock, board, chronicle, discovery, crews, expeditions, ledgers (cm, trp, ug, farm, wild, zones…), rng counters, rooms, bps | `g` |
| chunk | per 16×16 column: terrain deltas, plants (already packed per chunk), dormant fauna and items lying in it, the chunk's seen RLE, chunk meta (act/mod/last/dz) | `c:<chunkKey>` |

- **Villagers stay global.** They move constantly and are few. Only things that **belong to a place** go in chunk records.
- **The command log** moves to its own optional record and is capped (OD-54).

### Codec
- Each record is canonical JSON (sorted keys where order matters), then **gzip**, using the native `CompressionStream`/`DecompressionStream`. This is zero-dependency and available in modern browsers and Node 18+.
- **Base64 only where a text channel needs it.** It inflates data by 33%, so binary channels keep the bytes:
  - **localStorage:** base64 (strings only)
  - **IndexedDB:** raw gzip bytes as a Blob
  - **Export file `.slime`:** raw gzip
  - **Copy/paste "save code":** base64
- **Sniffing on load:** gzip magic `1f 8b`, base64, or plain JSON. A plain-JSON v20 save still loads.
- **Integrity:** each record carries a 32-bit hash (`mix32` over the JSON). A bad record is reported, never silently loaded.
- **No `sim/` code is involved.** Compression is async and lives in `ui/` plus a new `store/`. The sim stays pure and synchronous: it only produces and consumes plain record objects.

### Storage and incremental autosave
- **Dirty tracking.** The sim marks a chunk dirty whenever `world.set` touches it, or when a plant, item or chunk meta changes in it. The global record is always rewritten.
- **An autosave writes only:**
  - the dirty chunks
  - the global record
  - a new manifest, **written last**, which is the commit
- **Atomicity.** Records are written under a new generation and the previous generation is kept until the new manifest lands. An interrupted save, such as the tab being closed, leaves the last good save intact. Unreferenced records are collected afterwards.
- **Backend:**
  - IndexedDB is the primary store: about 100s of MB of quota, async and binary.
  - localStorage is the fallback, with base64 records, for when IDB is missing or blocked on `file://` (OD-51).
  - Slots, the ironman single slot and the "browser full → download a file" path carry over from `slots.js`.
- **Off the main loop.** Compression and writes are awaited between frames. The UI never blocks for more than one frame. A small "Saving…" chip appears only while a save is in flight (show, don't tell).

### Chunk paging (the memory win)
A changed chunk far from every anchor is **evicted**:
1. Its record is built.
2. The full voxel array and its place-bound entities are dropped from RAM.
3. Its deltas stay in a compact cold map, or in the store.

On re-activation, the chunk is regrown from the seed and its deltas and entities are re-applied: exactly the restore path, per chunk.
- **The sim side is synchronous and pure.** It takes a `cold` map interface: `put(key, record)`, `take(key)`. The UI backs it with memory plus the async store, prefetching chunks near anchors and the camera.
- **A pathing request into an evicted chunk** treats it as unloaded land, as today's endless world already does for never-generated land, until the chunk is paged in.
- **Determinism.** A run with eviction on must hash identically to the same run with eviction off. This is the key test.

### Export and import
- **Menu → Save to file** gives `<name>-Y2D14.slime`: a gzip of the package as one JSON container, `{m, g, c:{key:record}, cmds?}`.
- **Copy save code** gives base64 of the same, for small worlds.
- **Load** accepts `.slime`, legacy `.json` and a pasted code.

## Stages (proposed)

### 8.24 Package format and codec
- Split `snapshot`/`restore` into manifest, global and chunk records (pure, in `sim/save.js`).
- A new `src/store/codec.js` with gzip, base64, sniffing and record hashes.
- SAVE_VERSION 21 (the package format) with a v12–20 → 21 migration; built 8.24 (D62-D67).
- **Batched seen knowledge (author, 2026-10-30: "save batches of information so that we don't have to store every seen block"):**
  - drop `seen.log`, the per-cell list of every newly seen cell, which only grows;
  - keep the per-chunk seen bitsets, RLE-packed, in each chunk record;
  - replace the stored `known[mat]` cell lists with a per-chunk ore summary (counts per material plus a rough centre) and derive any exact list on load;
  - prune the per-villager chronicle flags (`mem:<id>:…`) and records of long-dead villagers to a bounded tail.
- `.slime` export and import, and the save code.
- **Tests:** round-trip hash equality on every fixture; a regrow test proving a reloaded world rebuilds identically, dungeons included (see `tests/dungeon_regrow.js`); seen-size stays flat on a long walk; v12-20 fixtures still load; codec round-trip (Node `CompressionStream`); corrupt-record refusal with plain text; size report (raw / gz / b64) per fixture.

### 8.25 Chunked store and incremental autosave
- IndexedDB backend with the localStorage fallback.
- Dirty-chunk tracking.
- Generation writes with the manifest last, and garbage collection.
- Slots, ironman and quota handling.
- The "Saving…" chip, and the Menu showing each slot's size.
- **Tests:**
  - an incremental save equals a full save (decoded and compared)
  - an interrupted save (a write fails before the manifest) leaves the previous save loadable
  - only dirty chunks are rewritten, by counting writes
  - the fallback path
  - a browser smoke check that autosave and Continue work across a page reload

### 8.26 Chunk paging
- Evict changed far chunks to the cold store, and page them back in on activation.
- Prefetch round the anchors and the camera.
- Bounded resident chunks.
- **Tests:**
  - an eviction-on vs eviction-off hash replay from a fixture with a mined area
  - the resident chunk count staying under a cap on a scripted long walk (≤5 min)
  - a dug tunnel, a building and a dropped item surviving eviction then return
  - fire or a cave-in at a chunk edge across an evicted neighbour (blocked or deferred, never lost)

### 8.27 Hardening
- A save browser listing every slot: size, date, villagers, a mini preview from the manifest; delete; export.
- Recovery that falls back to the previous generation when the newest is corrupt.
- Command log capping.
- A perf budget: the autosave adds <8 ms of main-thread time per frame while in flight, measured.
- Docs and a balance-free wrap-up.

## Open decisions
- **OD-51: storage backend.**
  - Default: IndexedDB first, localStorage fallback.
  - Risk: `file://` origins. IDB works in Chrome and Firefox on `file://`; Safari is unreliable there. Measure in 8.25 and fall back automatically.
- **OD-52: base64 everywhere, or only on text channels?**
  - Default: only on text channels (localStorage and the save code).
  - Base64 on IDB and files costs 33% for nothing. Your note said "B64 + gzip"; this keeps both where they help.
- **OD-53: export container.**
  - Default: one gzip of a JSON container.
  - The alternative is a zip of per-chunk files: easier to inspect, but it needs a zip writer, either hand-written or via a dependency. Not worth it yet.
- **OD-54: command log.**
  - Default: keep only the commands since the last full save, in a separate record. Tests use their own logs.
  - The alternative is dropping it from saves entirely.
- **OD-55: what is "place-bound".**
  - Default: plants, items on the ground, corpses, nests and dens, and dormant or packed fauna go with their chunk.
  - Villagers, active fauna, wagons and anything mid-job stay global.
  - An evicted chunk never holds a villager or an entity that is being worked: eviction already skips those, as `unload` does today.

## Fit with the hard rules
- The sim stays pure and deterministic. Records are plain data, and all async work lives outside `sim/`.
- Tests follow the testing rules: fixture-based, one process at a time, each run ≤5 min. Eviction tests use pre-situated fixtures with a mined area far from camp, made by editing state, not by simulating up to it.
- Save compatibility: v12-20 JSON saves load and convert. Nothing older than v12 changes: it is refused as before.

## Effort (ASSUMPTION)
- 8.24: 0.3–0.5 FTE-months
- 8.25: 0.4–0.7 FTE-months
- 8.26: 0.5–0.9 FTE-months (the riskiest)
- 8.27: 0.2–0.4 FTE-months

## Phase 8 complete (8.27, Sonnet)
8.24-8.27 are built: a package format and codec, a chunked content-addressed store with incremental autosave, chunk paging, and hardening (save browser, one-generation recovery, command log capped at 200, an autosave that holds the main thread for at most about 5 ms per slice). Decisions D62-D79; OD-51..55 resolved by their defaults (OD-54 as "newest 200 commands", D75). Left open: building only dirty records (D74; not needed for the budget), Safari / Firefox IndexedDB on `file://` (unmeasured, the fallback is automatic), a first save of a large world takes many seconds of wall clock off-thread because each record is its own IndexedDB transaction (batching them is the obvious next step).
