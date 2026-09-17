# Backlog: closing the loop on table changes

The goal: any change to a table — its shape, its indexes, its rows, its
history — is tracked as data the table can verify, so a human approves and
never scripts. This file holds the pieces not built yet, in the order they pay
off. Each item says what it is, why, an example of today's friction, the
proposed API, and its status. Decisions already taken live in `adr/`.

Ground truth today (see [ADR 0011](./adr/0011-table-state-record-owns-epochs-and-backfill-needs.md)):
the table keeps a **state record** — approved baseline, one **epoch** per
entity, every **backfill need** still owed — at a reserved key, read through
`table.state()`. Enforcement writes it; wipes renew epochs. Nothing reads the
epochs yet, and nothing settles a backfill need except a table wipe.

| #   | Item                                                         | Leverage    | Effort      | Status        |
| --- | ------------------------------------------------------------ | ----------- | ----------- | ------------- |
| 1   | Tombstone-first deletes with a purge window                  | high        | low         | proposed      |
| 2   | Per-collection epoch gate in sync (client side of the epoch) | high        | low–medium  | next          |
| 3   | Version census                                               | medium–high | low         | proposed      |
| 4   | Backfill as an explicit command                              | high        | medium      | proposed      |
| 5   | Replica self-heal on an unreadable stored row                | medium      | low–medium  | proposed      |
| 6   | Explicit version collapse in ESchema                         | medium      | medium      | open question |
| 7   | Table migration plan (expand and contract)                   | high, rare  | high        | draft         |
| 8   | Enforcement and backfill wired into startup                  | medium      | medium–high | idea only     |

## 1. Tombstone-first deletes with a purge window

**What.** A hard delete of one row leaves nothing a cursor can find, so a
client that was away never learns the row is gone. The rule becomes: a row is
only ever hard-deleted after it has been a tombstone for long enough that every
reader has had a chance to see the tombstone. Purging is a separate, bulk,
explicit step.

**Why.** This is the single biggest source of "bump the sync version by hand".
`delete` already writes a tombstone with a fresh `_u`, and sync's catch-up
already sees it. Only `hardDelete` and per-row wipes break the chain.

**Friction today.** The bank demo's `clear` wipes rows server-side, then drops
the browser's IndexedDB and reloads the page, because no client could
otherwise notice.

**Proposed API.**

```ts
// On a keyed entity surface. Refuses a row that is not a tombstone, or one
// tombstoned more recently than `olderThan` — the row must be provably stale
// to every reader first.
entity.purge(key, { olderThan: Duration }, 'I KNOW WHAT I AM DOING');

// Bulk: walk the entity's tombstones and purge the ones older than the window.
// Returns what it removed. Resumable: `after` is the last purged key.
entity.purgeTombstones({ olderThan: Duration, limit?: number, after?: EntityKey });

// Table-wide, every keyed entity: the maintenance job you schedule.
table.purgeTombstones({ olderThan: Duration, parallelism?: number });
```

`hardDelete` stays for the cases that really need it (legal erasure), but its
doc string says what it costs: readers that were away will keep the row until
their entity's epoch moves. `dangerouslyRemoveAllItems` already renews the
epoch, so bulk wipes are covered.

**Open question.** Should `purgeTombstones` require the window to be at least
as long as sync's cadence repair window? Probably yes, as a documented rule
rather than an enforced one, since the table does not know its readers.

## 2. Per-collection epoch gate in sync

**What.** The client side of the epoch. Today `createStdSync({ version })` is
one hand-edited number that wipes the whole Sync Store. Replace it, per
collection, with a value the backend serves: the entity's epoch from
`table.state()`. When the epoch a collection last saw differs from the one the
backend reports, only that collection's replica, cursor, and strategy state are
dropped, then it refetches.

**Why.** The backend already moves the epoch at exactly the moment replicas go
stale. A developer editing `SYNC_VERSION = 2` is guessing at the same fact,
later, for every collection at once.

**Friction today.** After `clear` in the bank demo the version constant has to
be bumped and shipped, or the demo drops the database and reloads the page.

**Proposed API.**

```ts
// Server: expose the epochs beside whatever serves entities.
const epochs = yield* table.state().pipe(Effect.map((s) => s.entities));
// e.g. { Account: '01J…', Transfer: '01K…' }

// Client, per collection: an Effect the strategy session runs before its
// first fetch and again on every restart. A string is fine for a constant.
std.collection({
  schema: AccountSchema,
  epoch: () => api.epochOf('Account'),   // Effect<string>
  sync: { … },
});

// Instance-wide fallback stays: `version` keeps its current whole-store
// meaning for backends that cannot serve epochs. A collection with `epoch`
// ignores `version`.
```

**Mechanics.** The Sync Store already keys every record by collection, so a
per-collection wipe is a query plus deletes on `storedReplicaEntity`,
`storedReplicaCursorEntity`, and `storedSyncStateEntity` for that collection.
The stored epoch goes beside the existing `SyncStoredVersion` record, one row
per collection. The check runs inside the Strategy Session under Leadership so
one tab does the wipe and the others see it through the store. Outbox entries
for that collection are kept — they are the user's unconfirmed writes, not
replica state.

**Status.** Next. The server half (the epoch itself) shipped with ADR 0011.

## 3. Version census

**What.** `table.census()` walks `scan()` and counts rows per entity per `_v`,
plus per entity how many carry keys that `drift` would report. One number set
answers "can I drop v1?" and "is a backfill still owed for real?".

**Why.** Collapse (item 6) is only safe when zero rows remain at the versions
being dropped, and nothing today can say so. Backfill (item 4) wants the same
walk to know how much work is left. It is also the honest input for a
`requires-backfill` need: a need with zero drifted rows can be settled without
writing anything.

**Friction today.** A developer wanting to delete two old `evolve` steps has to
write a scan script and eyeball it.

**Proposed API.**

```ts
interface Census {
  readonly scanned: number;
  readonly entities: Readonly<Record<string, EntityCensus>>;
}
interface EntityCensus {
  readonly rows: number;
  readonly tombstones: number;
  readonly byVersion: Readonly<Record<string, number>>;  // { v1: 0, v2: 3, v3: 41200 }
  readonly drifted: number;         // rows whose secondary keys differ (keyed only)
  readonly unreadable: number;      // rows the current schema cannot decode
}

table.census(options?: { parallelism?: number; onProgress?: (scanned: number) => void })
  : TableEffect<Census>

// CLI, same shape rendered as a table; exit 1 if any `unreadable` > 0.
std-toolkit census [--parallelism N] [--json]
```

The CLI needs a table and an adapter layer; it reuses the
`std-toolkit.snapshot.ts` convention: that file may also export a `layer`
(or the CLI takes `--layer ./path`). Studio can show the same numbers.

**Composition with backfill.** `backfill` is `census` plus a write for every
row `drift` flags; a `--dry-run` backfill _is_ a census restricted to drift.
Build the walk once and let both commands drive it.

## 4. Backfill as an explicit command

**What.** The loop ADR 0007 deliberately left out: `scan` → `drift` →
`reindex`, with retries on `ReindexConflict`, skips on `PrimaryKeyDrift`
(reported, never repaired), a resumable cursor, and — when it finishes clean
— settlement of the matching **backfill needs** in the table state record.
Explicit: a command a human runs, never something a deploy triggers.

**Why.** Enforcement now records what is owed but nothing pays it. A large
table must be backfilled on purpose, at a chosen time, with a progress line,
and with the option to stop.

**Friction today.** Chapter 23 shows the three primitives one row at a time.
Doing it for a real table means writing the loop, the retry, and the bookkeeping
yourself, then remembering the warning enforcement logged weeks ago.

**Proposed API.**

```ts
interface BackfillOptions {
  readonly parallelism?: number;       // scan segments; DynamoDB honours it
  readonly rewritePayload?: boolean;   // also persist the latest `_v` for old rows
  readonly entities?: readonly string[]; // default: every entity with a need
  readonly dryRun?: boolean;           // census of what would be written
  readonly onProgress?: (p: BackfillProgress) => void;
}
interface BackfillReport {
  readonly scanned: number;
  readonly reindexed: number;
  readonly conflicts: number;          // real writes won; rows re-derived their keys anyway
  readonly primaryKeyDrift: readonly EncodedKey[]; // human-led, never repaired
  readonly settled: readonly SnapshotSubject[];    // needs cleared from table state
}

table.backfill(options?: BackfillOptions): TableEffect<BackfillReport>

// CLI
std-toolkit backfill [--entity Task] [--rewrite-payload] [--dry-run] [--parallelism N]
```

**Settlement rule.** A need is settled when a full pass over its owner entity
finished with zero drifted rows left — including rows re-checked after a
conflict. Needs whose subject is a physical index with no entity derivation
(a slot added but unused) are settled immediately: there are no rows to move.
Settling writes the state record through the same guarded `modifyTableState`
loop enforcement uses.

**Resumability.** The scan position (last `pk`/`sk` per segment) is kept in a
`backfill` field of the table state record while a run is in flight, so a
stopped run continues rather than restarts. A run that finds the record's
`since` newer than its own start aborts: enforcement recorded a new need mid
run, and the pass would be incomplete.

**`rewritePayload`.** `reindex` already persists the latest encoded payload
as a side effect. With this flag every row is written, drifted or not, which is
the precondition for item 6. Without it only drifted rows are touched.

## 5. Replica self-heal on an unreadable stored row

**What.** When the Sync Store holds a row whose `_v` the current client schema
no longer knows (after a collapse) or that fails to decode for any reason, the
collection drops that row and refetches it instead of failing to mount.

**Why.** Today one undecodable stored row can stop a whole collection, and the
only way out is the store-wide `version` bump. With the epoch gate (item 2)
this becomes rare; it should still be survivable.

**Proposed design.**

- Replica preload decodes each stored row with `Effect.result`. A failure is
  reported as a `SyncEvent` (`ReplicaRowUnreadable { collection, id, cause }`),
  the row and its cursor entry are deleted, and preload continues.
- If more than a bounded fraction of rows (say 10%, or any single-item
  collection's only row) is unreadable, treat it as a lost replica: wipe the
  collection's replica and state and restart its strategy session, which is
  exactly what the epoch gate does. Reuse that code path.
- Rows that decode but whose `_e` mismatches the collection are already
  refused at ingress and stay so.

Nothing is silent: every dropped row is an event the app can log. No retry
loop: a row the backend re-serves in the same unreadable form will be dropped
again, and the event count makes that visible.

## 6. Explicit version collapse in ESchema

**Status: open question. Not decided.**

**What.** Let a schema's history start later than `v1`, so shipped
`evolve` steps can be deleted once no stored row needs them:

```ts
EntityESchema.make('Task', 'taskId', fieldsAtV3, { since: 'v3' });
// or, on a built schema, .collapse('v3')
```

**Why.** History is code to maintain, and every retired migration is a
function that can no longer be tested against real data.

**What is not settled.**

- The snapshot diff calls a removed version `breaking`, which is right unless
  the table proves no row carries it. The proof is item 3's census. Should the
  diff classification read the census (making `Snapshot.diff` impure) or should
  enforcement downgrade `breaking` to `requires-backfill` only when it can see
  a census saying zero? The second keeps the diff pure.
- A collapsed schema cannot decode a v1 row at all — the migration is gone.
  Item 5 turns that into a dropped-and-refetched replica row on the client,
  but on the server it is an unreadable row. Is a hard refusal at enforcement
  time (census must be zero) enough, or must `since` also be recorded in the
  table state so a later census can prove nothing regressed?
- Whether `since` should be allowed at all before item 4's `rewritePayload`
  exists, since without it "zero rows at v1" is only ever true by accident.

Decide after items 3 and 4 exist; both are prerequisites either way.

## 7. Table migration plan (expand and contract)

**Status: draft. Proposal below, not yet an ADR.**

**What.** Move a table from one shape to another when the change is `breaking`
by construction — a renamed entity, a new primary key derivation, a split or
merged entity — without downtime and without a one-off script. The library
knows the safe sequence; the human approves each phase.

**Why.** Everything else in this file is a change read migration or a backfill
can absorb. This is the one that cannot, and today it is a bespoke script over
`scan` plus a guess at when clients may cut over.

**Shape.**

```ts
const plan = Migration.define({
  table,
  from: TaskV1Entity,          // registered entity surface, old shape
  to: TaskEntity,              // new entity, registered beside it (safe: "entity added")
  map: (old) => Effect<NewValue>,    // pure per-row transform; may refuse
  idOf?: (old) => string,            // when the id field changes
});
```

Phases, each a separate explicit command, each recorded in the table state
record under `migrations[name] = { phase, cursor, counts, startedAt }` so a
run is resumable and a second operator sees where it is:

1. **expand** — register `to` beside `from`. Enforcement classifies it `safe`.
   Both entities are live; only old code writes `from`.
2. **copy** — walk `from` with the backfill walker, write `to` rows through
   `insert` with the same `_u` where possible (preserves ordering for sync)
   or a fresh one when ids change. Conflict on an existing `to` row means a
   dual-write already happened; skip. Resumable by cursor.
3. **verify** — census both entities; counts must match; sample decode.
4. **cut over** — application deploy: reads and writes move to `to`. Not a
   library step, but the record notes the phase so `copy` cannot be re-run
   after it.
5. **drain** — a bounded re-copy for rows `from` received during cut over
   (rows with `_u` newer than the copy's start).
6. **retire** — tombstone every `from` row (so cursor readers see them go),
   renew `from`'s epoch, then remove `from` from the table definition. That
   removal is `breaking` and needs an explicit `snapshot approve`; enforcement
   accepts it only when the migration record says `retire` completed.

What makes this reliable is not automation but that every phase leaves a
mark in the table the next phase checks, and that no phase is a script only
one person has. Clients need nothing new: `to` is a new collection with a new
epoch; `from` disappears through tombstones and then through its epoch.

**Open.** Whether phases 2 and 5 should be one resumable command with a
`--since` flag; whether `map` refusals stop the run or are collected.

## 8. Enforcement and backfill wired into startup

**Status: idea only. Deliberately not planned.**

The thought: adapter setup runs `verifySnapshot` by itself, and a
`requires-backfill` outcome starts `backfill` under Leadership. It would make
"no human intervention" literally true.

Why it stays an idea: a backfill walks every row. On a large table that is
hours of reads and writes started by a deploy nobody sat down for, competing
with production traffic, with no one watching the progress line. Item 4 exists
precisely so the walk is a decision. `verifySnapshot` on startup is cheap and
already a one-liner (`alchemy-console` does it); the backfill half must stay a
command. If a scheduled backfill is ever wanted, it is a cron calling the
command with a budget, not a startup hook.
