# Spec: stories-as-one-story

Source: `this conversation`

## Problem

`std-toolkit/stories` holds 99 Story files and 221 Questions arranged as a feature taxonomy (Learn/Reference → part → group → story). It reads as a catalogue, not a path: a reader cannot tell what to read first, every proof calls helpers from a hidden `support.ts` (`note.insert` inside `parity(...)` across four adapters), the sync Stories run through a Simulation DSL so the real sync API never appears, and failure/limit Stories sit beside the happy path. The result is overwhelming and gives no confidence that what is on screen is the actual public API.

## Outcome

`stories/` is one linear story — a task board built step by step — in five acts of numbered chapters plus an appendix. Each chapter states one everyday problem in plain words, shows the exact std-toolkit call that solves it inline in the proof with one intent comment per step, returns what the call produced, and (where the code emits spans) shows a tracer recording. Every chapter imports what it needs from an earlier chapter, so provenance is visible in the tree. `pnpm stories` and `tsx stories/check.ts` pass on the new tree; the old tree is gone.

## Requirements

1. The old `stories/` tree (all `*.story.ts`, all `.md`, `support.ts` files, `simulation/`, `simulated-browser*.ts`, `simulation.test.ts`, `index.ts`) is deleted. `stories/check.ts` is kept unchanged. The laymos Story format (`Story.make`, `Story.question`, `Story.group`, `Story.assert`, `Story.trace`, `Story.flow`) is used as-is; laymos is not changed.
2. The narrative domain is a task board: entity `Task` (id field `taskId`, partitioned by `boardId`), entity `Board`, and a single-entity board `Settings`. Titles never mention the domain-specific feature names; the board is the illustration.
3. The tree is: five **Acts** (top-level `Story.group`s) holding 35 spine **Chapters** (Stories with `spine: true`), then one **Appendix** group holding 8 non-spine groups. Chapter numbering runs 01–35 continuously across acts. The exact chapter table is in Implementation Decisions.
4. Every chapter directory is `stories/<act-nn>-<act-slug>/<nn>-<chapter-slug>/` containing `<chapter-slug>.story.ts` and its page `<chapter-slug>.story.md`. Each act directory holds a group page named `<act-title-slug>.md`; each appendix group directory holds `<group-title-slug>.md`. `stories/index.ts` default-exports the root `Story.group`.
5. No file named `support.ts` exists anywhere under `stories/`. The only hidden helper is `stories/env.ts`, exporting `fresh(adapter)` — provisions a clean `memory` | `sqlite` | `idb` | `dynamodb` table for the shared board table, provides `Ulid` (sequential), and tears down — plus what Act V needs to build an in-process platform (memory sync store layer, `inMemoryLeadership`, an in-memory `PeerChannelFactory`). Everything that is std-toolkit API is called inline in some chapter's file.
6. A chapter that introduces a value (schema, table, entity, collection) exports it; later chapters import it from that chapter's file by relative path (`../03-…/…story.js`), never from a shared module. Constructors are not re-declared in later chapters; the call a chapter teaches is always inline in that chapter's proof, never wrapped in a helper.
7. Acts I–III and V run on the `memory` adapter only. Chapter 24 is the only chapter that runs on more than one adapter. Four-way adapter agreement is not asserted anywhere in `stories/`.
8. Per chapter: at most 3 Questions, exactly one new concept, and a top-of-file setup block (table/entity construction, `fresh('memory')`) placed as top-level statements so laymos renders it as `setup`. A failure the reader meets on day one (duplicate insert, stale update, unreadable row, codec field) is the last Question of the chapter that introduces the feature; exotic limits live in the Appendix.
9. Style rules (acceptance test for every chapter):
   1. The title is a plain, conversational gerund phrase (e.g. "Defining the shape of a task"), never a feature or API name.
   2. The `.story.md` page opens with the board situation in at most three sentences and contains no API names.
   3. No term is used before the chapter that introduces it; the first use of any term gets a one-line plain-words gloss inside the answer.
   4. Answers are at most two sentences.
   5. Every proof comment says what the line does or what comes back — never how it works internally. One comment per step.
   6. Each proof `return`s the value the taught call produced so the renderer shows it.
10. Recordings: Acts I–IV proofs that exercise instrumented code are wrapped in `Story.trace`; Act V proofs are wrapped in `Story.flow`. A proof with nothing instrumented is left unwrapped.
11. `StdTable` entity operations emit spans so Acts I–III can record: `insert`, `get`, `getAndUpdate`, `delete`, `restore`, `hardDelete`, `query`, `subscribe` on keyed entities; `get`, `put`, `getAndUpdate`, `reset` on single entities; `table.transact`, `table.scan`, `table.subscribe`. Span names are `StdTable.<op>`; attributes carry the entity name and, where applicable, the access pattern and key fields. This is a separate commit from the stories rewrite.
12. The codec-field refusal (`UnrepresentableFieldError` for transforming field schemas such as `Schema.DateFromString`) is taught in chapter 1 as a real constraint with its reason (a Snapshot must restore a live schema from JSON alone) and the workaround (store the plain value; convert at the call site).
13. Previously uncovered exports get a home: `'~standard'` (chapter 1, last Question), `table.scan` (chapter 8, last Question), `Snapshot.restore` (chapter 22), `onEvent` (chapter 35), `singleItemCollection`/`singleItemSources` (chapter 30), outbox/`createOfflineAction`/`OutboxUnreachable`/`connectivity` (chapter 34). `Broadcaster`, `defaultBroadcaster`, `Ulid`/`nextUlid`/`uTime`, `toSchema`/`fromType`/`id`/`metaSchema`, `registry()`, `reset`/`dispose`, `flow` are deliberately not covered.
14. Coverage: every one of the 221 old Questions either maps to a chapter in the table below or is in the dropped list (the three "is `support.ts` the same pair?" Stories: the-notebook-we-built, the-vocabulary-we-built, the-shared-table).
15. `stories/README.md` is a glossary only: **Chapter** (one spine Story), **Act** (a top-level group), **Appendix** (the non-spine group), **Proof** and **Recording** (as laymos names them), **Setup** (the rendered top-level block).
16. Comments in `stories/` are the narrative and are required (rule 9.5); the repo's near-zero-comment rule applies to `src/` only.
17. Effect idioms throughout proofs: `Effect.gen`, `Effect.flip` for expected failures, `Match` over if-chains, no `async`/`try`.

## Modules and Layers

### Stories tree (`std-toolkit/stories`)

**Responsibility.** The executable narrative documentation of std-toolkit, consumed by `laymos stories` and `stories/check.ts`.

**Change.** Delete the current tree; author the acts, chapters, appendix, `env.ts`, `index.ts`, and `README.md` described above.

**Public behavior.** `pnpm stories` renders one root group with five acts and an appendix; every chapter page shows problem → setup → questions with inline API calls → returned values → recording. `tsx stories/check.ts stories/**/*.story.ts` passes.

**Layers.**

- **Act I – One task, one table (chapters 01–08):** memory adapter; introduces `EntityESchema`, `StdTable`, `Memory`, entity binding, `insert/get/getAndUpdate/delete/restore/hardDelete/query`, pagination, `scan`.
- **Act II – More ways in, more than one thing at a time (09–16):** LSI/GSI access patterns, sparse index, second entity in the table, single entity, `transact` with ops and check ops, stale ops, `subscribe`.
- **Act III – Changing the shape after you shipped (17–23):** `.evolve`, `.draft`, `ValueESchema`, unreadable rows, `Snapshot` capture/diff/render/restore, `table.snapshot`/`verifySnapshot`, CLI baseline, `drift`/`reindex`.
- **Act IV – The same code on other databases (24):** `SQLite.make`, `IDB.make`, `DynamoDB.make`, `setup`/`teardown`, layer swap.
- **Act V – In the browser (25–35):** `createStdSync`, `collection`, mutation handlers, partitions, `syncStrategy.*`, `pacedUpdate` + `paceStrategy.*`, `singleItemCollection`, cross-collection transaction, peer sync, leadership, outbox/offline, `browser()` platform preset.
- **Appendix (A1–A8):** refused table shapes/names/queries/batches; refused schema shapes; migration habits; DynamoDB-only; IndexedDB in a real browser; SQLite drivers and writing a driver; Studio RPC; how these chapters run.
- **`env.ts`:** `fresh(adapter)` for the four adapters (ports the provisioning/teardown currently in `stories/database/support.ts`), sequential `Ulid`, and the in-process platform pieces for Act V (ports what `stories/sync/simulation/browser.ts` builds: memory store layer, `inMemoryLeadership`, in-memory peer channel, controllable connectivity).
- **`index.ts`:** root group → acts → chapters, appendix last; chapter order equals numbering.
- **`README.md`:** glossary.

**Dependencies.** `laymos/story` (unchanged), `std-toolkit/*` public subpaths only, `effect`, `fake-indexeddb`, local DynamoDB endpoint (`DYNAMODB_LOCAL_ENDPOINT`, default `http://localhost:8090`) for chapter 24 and Appendix A4.

**Testing.** `tsx stories/check.ts` over every `*.story.ts` passes; `pnpm stories` builds the tree without duplicate-title or snippet-extraction errors; each chapter satisfies the six style rules and the ≤3-question / one-concept cap; the old-question coverage table has no unmapped row.

### StdTable entity operations (`toolkits/std-toolkit/src/db/std-table`)

**Responsibility.** Portable table, keyed-entity, and single-entity operations shared by all adapters.

**Change.** Wrap each public operation listed in requirement 11 in a span named `StdTable.<op>` with entity/pattern/key attributes. No behavior change.

**Public behavior.** Operations appear as spans in any tracer; `Story.trace` around a chapter proof produces a non-empty recording.

**Layers.**

- **entity (keyed):** spans on `insert`, `get`, `getAndUpdate`, `delete`, `restore`, `hardDelete`, `query`, `subscribe`.
- **entity (single):** spans on `get`, `put`, `getAndUpdate`, `reset`.
- **table:** spans on `transact`, `scan`, `subscribe`.

**Dependencies.** Effect tracing only; adapters untouched.

**Testing.** Existing `__tests__` still pass; one test asserts a span named `StdTable.insert` is emitted with the entity attribute.

## Cross-Module Flow

Chapters call `StdTable` operations inline; with requirement 11 in place, `Story.trace` captures the spans and laymos renders them as the chapter's Recording. Act V chapters wrap proofs in `Story.flow`, which captures the sync kernel's existing flow recorder output. Chapter N imports the schema/table/entity/collection exported by chapter M < N; `env.ts` supplies only environments, never API surface.

## Implementation Decisions

- Execution path (c): the spec first; Act I authored as the reference implementation of the style; the remaining acts and appendix produced by parallel agents against Act I via `/to-issues` + `/orchestrate`.
- Chapter table (title → inline API → old Stories covered):

  **Act I — One task, one table**
  01 Defining the shape of a task → `EntityESchema.make/.build`, `encode`/`decode`, `_v` stamp, `'~standard'`; last Q: a `Date` field is refused → reserved-underscore, encode-writes-latest, codec-fields, transformed-fields
  02 Making a table for tasks to live in → `StdTable.make(...).primary('pk','sk').build()`, `Memory.make(table).layer` → a-table-to-put-notes-in, layer-selection
  03 Telling the table where each task goes → `table.entity(Task).primary({ pk: ['boardId'] }).build()` → where-a-note-lives
  04 Saving a task and reading it back → `insert`, `get`, meta `_e/_d/_u`, duplicate → `ItemAlreadyExists`, missing → `null` → insert-a-row
  05 Changing part of a task → `getAndUpdate`, old→new, keys immutable, already-equal skip, missing fails → partial-updates, keys-are-immutable, skipping-and-missing
  06 Removing a task, and getting it back → `delete`, `restore`, `excludeDeleted`, `hardDelete` → deleting-and-restoring, hard-delete
  07 Listing the tasks on one board → `query('primary', …)`, sort conditions, descending, empty, `beginsWith` → listing-a-partition, sort-conditions, prefix-matching
  08 Reading a long list one page at a time → `limit`, `hasMore`, `after`, deleted rows and ties; last Q `table.scan` → page-size, resuming-a-query, tombstones-and-ties

  **Act II — More ways in, more than one thing at a time**
  09 Listing tasks in a different order: by due date → `.lsi`, `.index('LSI1','byDue',{ sk:['dueDate'] })` → a-second-way-to-read
  10 Finding one person's tasks across every board → `.gsi`, `.index('GSI1','byAssignee',…)`, sparse → secondary-patterns, sparse-indexes
  11 Keeping boards and tasks in the same table → second entity, `registeredEntities`, no key collision → sharing-one-table
  12 One record that exists exactly once: board settings → `singleEntity(...).default`, `get/put/getAndUpdate/reset` → single-entities
  13 Two writes that must land together → `transact`, `insertOp`/`getAndUpdateOp`/`deleteOp`, one refused → none land, outcome report, empty batch → atomic-writes, transaction-limits (empty batch)
  14 Writing only if something is still true → `existsOp`/`notExistsOp`/`getAndCheckOp`, refusing an archived edit → check-ops (Q1–Q5), refusing-an-update
  15 When the task changed under you → `unchangedOp`, stale ops, check failing between read and commit → check-ops (Q6–Q9), stale-ops
  16 Being told when a task changes → `task.subscribe(filter)`, `table.subscribe()`, filter moves away → subscribing-to-a-note, filtering-by-value, table-wide-subscriptions

  **Act III — Changing the shape after you shipped**
  17 Adding a field to tasks that already exist → `.evolve(2, …)`, default for old rows, only rungs above run, written back at latest, identity kept → add-a-field, old-row-auto-migrates, migration-chain, older-rows, entity-id-field
  18 Removing and renaming fields → v3 remove, v4 rename, what storage keeps, old code encoding old shape → remove-a-field, rename-a-field, encode-old-shape, sequential-versions
  19 Trying a new field before committing to it → `.draft`, read draft / write latest, promoting → read-draft-write-latest, promoting-a-draft
  20 When a setting's shape changes → `ValueESchema`, envelope, bare pre-version value, adopting an existing schema, foreign `_v` → evolve-a-value, bare-value, envelope-migrates, adopt-existing-schema, value-with-version-key
  21 A row the schema can't read → one bad row, others fine, unknown `_v` → unreadable-rows, unknown-version
  22 Promising never to break an old task → `Snapshot.capture/diff/render/restore`, `table.snapshot()`, `verifySnapshot`, `std-toolkit snapshot` CLI, shipped-version edit caught → snapshot-guard, round-trip, verify-snapshot, editing-shipped-version, changing-shipped-migration
  23 An old task meets a new index → `drift`, `reindex`, `_u` untouched → backfilling-an-index

  **Act IV — The same code on other databases**
  24 Swapping memory for SQLite, IndexedDB, DynamoDB → `SQLite.make`, `IDB.make`, `DynamoDB.make`, `setup`/`teardown`, same answers → four-adapters, fresh-databases

  **Act V — In the browser**
  25 Showing the board in the browser → `createStdSync`, `.collection({ schema, sync })`, backend insert → visible → a-backend-and-nobody-watching, a-browser-mounts-a-query, from-database-to-collection (Q1)
  26 Editing tasks from the browser → `onInsert/onUpdate/onDelete`, optimistic then confirmed → from-database-to-collection (Q2–Q4)
  27 Loading only the board you're looking at → `sync.partitions`, mount/unmount, two boards → one-list-at-a-time
  28 Catching up on what you missed → `syncStrategy.oldToNew/newToOld/bidirectional`, backlog paging, tail, old deletes stay deleted → a-user-updated-some-time-back, edits-keep-flowing
  29 Typing fast without flooding the server → `utils.pacedUpdate`, `paceStrategy.debounce/throttle/coalesce` → issue-1
  30 Board settings in the browser → `singleItemCollection`, `singleItemSources` → (new)
  31 Two changes at once, from the browser → cross-collection transaction, backend refusal rolls both back → cross-collection
  32 Opening a second tab → peer sync, `peerSync.channel`, IDB store vs memory → one-browser-many-tabs, peer-sync-model, two-browsers-one-backend
  33 Only one tab talks to the server → leadership, `inMemoryLeadership`/web lock, hand-over on hide/freeze/close, not a cache → one-reader-many-tabs, yielding-leadership, leadership-is-not-a-cache
  34 The network goes away → `outbox: true`, `createOfflineAction`, `OutboxUnreachable`, `connectivity`, replay on reconnect → (new; per ADR 0005)
  35 Putting it on a real page → `browser()` platform preset, `onEvent` → (new; platform/browser)

  **Appendix**
  A1 Names and shapes a table refuses → reserved-names, topology-limits, index-components, invalid-queries, transaction-limits
  A2 Shapes a schema refuses → no-optional-fields, missing-version-stamp, malformed-payload
  A3 Habits for migrations → append-dont-mutate, total-migrations, pure-migrations, make-partial
  A4 DynamoDB only → batch-insert, native-updates, consistent-reads, table-definition, going-fully-native
  A5 IndexedDB in a real browser → auto-versioned-setup, living-in-the-browser
  A6 SQLite drivers, and writing your own → four-drivers-one-table, write-your-own-driver
  A7 Reading a table from Studio → reading-through-studio
  A8 How these chapters run → `env.ts` explained (fresh databases, sequential Ulid)

- Dropped old Stories: the-notebook-we-built, the-vocabulary-we-built, the-shared-table (their only purpose was proving `support.ts` matched; the import chain makes that structural).
- Act III is placed after indexes and transactions because "we shipped, now the shape changes" needs something built first; settings (12) precede transactions (13) so chapter 14 can check settings.
- `Story.trace` for Acts I–IV, `Story.flow` for Act V.
- Chapter 24's proof uses the `fresh(adapter)` helper for all four adapters; Appendix A4 needs local DynamoDB as today.

## Out of Scope

- Changes to laymos (renderer, schema, CLI) or to `stories/check.ts`.
- Lifting the codec-field refusal.
- Any `src/` change other than the span instrumentation in requirement 11.
- Covering the plumbing exports listed in requirement 13.
- The docs app (`apps/docs`) and README changes outside `stories/README.md`.
