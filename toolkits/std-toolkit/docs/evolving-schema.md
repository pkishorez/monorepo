# Evolving Schema

Data outlives code. Your code ships in versions; your data does not — a row
written in January is still sitting in the database in December, shaped exactly
the way January's code shaped it.

## Why schemas must evolve

The moment you add a field, every existing row becomes a liar: it claims to be
a `User`, but it has no `age`. You now have three bad options:

- **Rewrite every row** — a migration script per deploy, downtime, and a
  window where old and new code disagree about what a row looks like.
- **Sprinkle defensive code** — `user.age ?? 0` at every read site, forever,
  with no record of _why_.
- **Never change anything** — the schema fossilizes.

An **evolving schema** (ESchema) picks a fourth option: **keep every version,
and migrate on read**. The schema itself records each version of the shape and
a migration function from one version to the next. Every stored payload carries
a version stamp `_v`. When a row is decoded, the runtime looks at its stamp,
decodes it with _that_ version's schema, then folds it forward through every
migration until it reaches the latest shape.

```ts
const User = ESchema.make('User', {
  name: Schema.String,
})
  .evolve('v2', { age: Schema.Finite }, (previous) => ({
    ...previous,
    age: 0,
  }))
  .build();

// a January row: { _v: 'v1', name: 'Alice' }
// read → { name: 'Alice', age: 0 }   — always the latest shape
```

The database never has to change. Old rows are never rewritten. Code only ever
sees the latest shape. The full history of the schema lives in one declaration,
in one file, under version control.

Most changes fit that mould. The few that do not, such as a value no old row
holds, go to a new table instead; see "Index changes and new tables" below.

## Defining evolutions

Every change to a shape is an appended `evolve(version, delta, migration)`
step. The delta says what happened to the shape; the migration says what
happens to the data. Every version after v1 has one. The builder enforces
the rest at compile time — versions in sequence, no optional fields, no
underscore keys, and (for entities) hands off the id.

## Reading and writing

Data takes two forms. The **encoded** form is what is stored and sent — the
database, the wire, the Sync Store — in whichever version it was written, with
its version beside it. The **value** is the latest shape, typed
`typeof User.Type`, and it is the only thing your code ever handles: every
database operation, broadcast, and transport payload gives you values.

The two forms may differ field by field. `Schema.DateFromString` is a `Date`
in the value and an ISO string in the encoded form; the toolkit converts at
every boundary, so you never write that conversion yourself:

```ts
const Task = EntityESchema.make('Task', 'taskId', {
  dueAt: Schema.DateFromString, // stored "2026-09-01T09:00:00.000Z"
}).build();

typeof Task.Type; // { taskId: string; dueAt: Date }
typeof Task.Encoded; // { taskId: string; dueAt: string; _v: 'v1' }
```

Only the encoded side is versioned and captured by a snapshot. Swapping
`Schema.String` for `Schema.DateFromString` over the same stored string needs
no new version, provided every stored value already parses; a field must never
change meaning without changing its name or its encoded shape.

All the time travel lives in decoding: take the version, read the payload
with _that_ version's fields (converting them into values), then fold it
forward through every later migration to the latest value. Migrations work on
values, so a migration can build a `Date` from an old string field. Bad data — unknown versions, corrupt payloads — is stopped
here. A version newer than the schema knows fails with `OutdatedVersion`, so a
reader running older code can tell it is out of date rather than looking at
bad data. For an Entity, the version sits in its meta as `_v`; a nested ESchema
value carries its own inline `_v`.

Encoding never time-travels. Where decoding understands every version, encoding
speaks exactly one language: the latest. It converts the value with the newest
schema and stamps the latest version. No migration ever runs on the write path
— that asymmetry is the safe design.

## The three kinds of ESchema

Every ESchema shares the same core: an ordered list of versions, a migration
between each pair, and a `_v` stamp on the encoded side. The three kinds
differ only in what shape they version.

### Struct — `ESchema`

The plain kind: a named object with fields.

```ts
const Settings = ESchema.make('Settings', {
  theme: Schema.String,
}).build();
```

Use it for any object that is not an entity — configuration, embedded
sub-objects, message payloads.

### Entity — `EntityESchema`

A struct plus an **identity**. You name the id field once and the builder
reserves it: it is automatically added as `Schema.String` to _every_ version,
and no evolution is allowed to touch it.

```ts
const User = EntityESchema.make('User', 'id', {
  name: Schema.String,
}).build();
```

Use it for anything stored and referenced by id. The reserved id is what the
storage and sync layers key on, which is why it must survive every migration
untouched.

### Value — `ValueESchema`

A single versioned value — a scalar, an enum, a list, a map, a union — with
no object around it. Since there is no struct to hang `_v` on, the encoded
form wraps the value in an envelope: `{ _v: 'v2', _value: … }`. The `_value`
key is what marks an envelope. Every schema kind forbids top-level fields
starting with `_`, including a struct inside a `ValueESchema`, so stored data
can never be mistaken for a value envelope, and an envelope with any key
besides `_v` and `_value` is refused with `ESchemaError`. A value with no
`_value` key is read as v1 data.

```ts
const Rating = ValueESchema.make('Rating', Schema.String)
  .evolve('v2', Schema.Finite, (previous) => Number(previous))
  .build();
```

Unlike struct evolutions (which merge a field delta), each value evolution
**replaces the whole codec** — v2 above is a number even though v1 was a
string.

### Which one do I pick

| You are versioning                                         | Use                                           |
| ---------------------------------------------------------- | --------------------------------------------- |
| A table row, keyed by an id                                | `EntityESchema`                               |
| An object with named fields that follows the field rules   | `ESchema`                                     |
| A single record stored once                                | `ESchema` with `.singleEntity()` on the table |
| A scalar, enum, list, map, or a union of different objects | `ValueESchema`                                |
| An existing object with optional fields                    | `ValueESchema`                                |

### The bridge: `eschema.schema`

Every ESchema carries a plain Effect Schema as `eschema.schema`,
so evolving schemas compose inside ordinary structs — a versioned value inside
a versioned entity inside a table row.

## While you are still developing

Nothing freezes a version except an approved snapshot. Until then the latest
step is yours to edit, so a new field goes into the next `evolve` and is
changed as often as needed. There is no draft or trial mechanism on top of
this: the next version _is_ the trial.

What makes that cheap is where the rows live. Develop against the Memory
adapter, on the server and in the browser, so every reload or restart starts
from an empty store and a dropped or rewritten step leaves nothing behind. A
durable database keeps rows stamped with a version you may later delete, and
code without that version cannot read them. Point a trial version at a durable
store only once it is approved and shipped; from then on it is a version like
any other and gets a real migration.

## Limitations

Evolving schemas move migration from deploy time to read time. That trade has
sharp edges worth knowing before you rely on it.

- **The types will not stop you editing history.** Shipped versions and
  shipped migrations are contracts with the rows already written, but nothing
  in the types detects that you changed v1's fields or rewrote the v1→v2 step
  after rows were written. On a persistent table, two things catch a changed
  version: the per-table test (`expectTableShippable`) in CI, and setup
  against the Stored contract, which runs at deploy for D1 and DynamoDB and is
  checked at deploy by the deploy guard for a table set up later. See
  "Shipping" below. A rewritten migration is not caught by a snapshot: it is
  code. `expectUpgradable` (below) is the test that exercises it.
- **Migrations run on read; nothing rewrites.** A row written at v1 stays a
  v1 row on disk until something decodes and re-encodes it. If you delete the
  v1→v2 migration from your code, unread v1 rows become undecodable, and a
  database that skipped releases still holds rows that old. Setup's reindex
  rewrites only a row's index keys, never its version.
- **Version sequencing is compile-time only.** `evolve` accepts only the next
  version literal (`'v2'` after `'v1'`), but that guarantee lives in the
  types. Nothing re-checks it at runtime, so generated or hand-edited
  declarations are on their own.
- **A bare value is always read as v1.** A value without an envelope is
  treated as data from before adoption, so it is migrated from v1 on every
  read. If a bare value is written after adoption (by hand, or by code that
  skips the schema), an old version that accepts it migrates it again: a bare
  `'dark'` under a string v1 can come back as `'light'`. Once adopted, always
  write through the schema.

## Best practices

- **v1 is forever.** Never edit a shipped version's fields or its migration —
  append a new version instead.
- **Migrations must be total.** The function receives _every_ value the
  previous version could decode. Handle nulls, empty strings, and the weird
  legacy cases — a throw inside a migration fails the whole decode with an
  `ESchemaError`.
- **Test that every version upgrades.** `expectUpgradable(Task)` from
  `@kestack/std-toolkit/eschema/testing` generates rows each version could
  have stored, for the schema and every ESchema it nests, and reads each one at
  the latest version. It fails when a migration throws, returns a value the
  latest version refuses, or changes the id, and when a saved value does not
  read back unchanged. It names the version and prints the smallest row that
  shows the failure.
- **Store numbers as `Schema.Finite` or `Schema.Int`.** JSON has no `NaN` or
  `Infinity`; a JSON store writes `null` and the row stops reading. A plain
  `Schema.Number` field is refused when the schema is built, and every encode
  refuses a value JSON cannot hold unchanged (a non-finite number, `undefined`,
  a `Date` or `Map` inside an opaque field, a circular reference), naming the
  field.
- **Keep migrations pure.** No clocks, no randomness, no IO. The same stored
  row must decode to the same value today, tomorrow, and on every replica.
  A value that needs IO or another entity belongs in a new table, filled by a
  table migration, never in a migration that guesses.
- **Model absence with `Schema.NullOr`,** never optional fields — the builder
  forbids optionals so that every version has exactly one canonical shape.
- **One test per persistent table.** `expectTableShippable(table, file)`
  from `@kestack/std-toolkit/db/testing` checks the committed snapshot, runs
  `expectUpgradable` over every schema the table reaches, keeping each keyed
  row's id and partition key. `vitest -u` accepts appended versions, index
  changes and other changes setup accepts; nothing accepts an edit to a
  shipped version or a failing upgrade. A StdTable kept only in disposable
  tables needs no test: its schemas may change freely.
- **Checks only loosen on a shipped version.** Removing a check or widening a
  bound is safe; adding or tightening one is breaking, because a stored row
  that fails it stops reading. Put a new check in a new version, with a
  migration that makes old values pass it.
- **Never change a shipped field's conversion.** Only the stored side is
  versioned. A conversion (`Schema.DateFromString`, your own `decodeTo`), and
  any check after it on the value side, is not in the snapshot, so no test
  sees an edit to it. Give the new conversion to a new version's field; `v1`
  rows keep reading with `v1`'s.

## Shipping

Every physical table declares a **mode**. A `persistent` table's data must
survive every schema change. A `disposable` table's data may be thrown away
when a change is not safe, such as preferences or a local copy the Backend can
send again. A disposable table may become persistent; a persistent table never
becomes disposable.

The baseline is the **Stored contract**: the table snapshot the data was last
set up under, kept inside the table itself as reserved rows that `scan` and
your code never see. Every adapter keeps it the same way. Setup
(`SQLite.setup`, `IDB.make` on first open or `IDB.setup`, `D1.table` and
`DynamoDB.table` at deploy) diffs the current snapshot against it:

- On a persistent table, a `breaking` or `unverifiable` change fails with
  `SetupRefused` and changes nothing. A new or changed index is applied, and
  setup reindexes the rows it touches before the table opens.
- On a disposable table, a change the rows cannot take wipes the table, an
  index change included.
- A table that holds rows but no Stored contract is refused if persistent and
  wiped if disposable. That includes every table set up before the contract
  moved into the table: an old `_std_contract` is not converted, so the way
  past for a persistent table is a new physical table name.

Because each database keeps its own contract, a browser or Durable Object that
skipped releases is compared from where its data actually is.

D1 and DynamoDB tables are set up at deploy, inside their `D1.table` and
`DynamoDB.table` resources, so a refusal fails the deploy. DynamoDB adds a new
global secondary index in place, and waits until it is ACTIVE before the
reindex, but refuses every other index change in either mode, and a new
physical name under the same resource, since DynamoDB makes those only by
replacing the table; the way past is a new `DynamoDB.table` resource, with its
own id and table name.

The **deploy guard** stops a change earlier for a table set up later, on a
device or an object. `DeployGuard.table(table)` keeps the Deployed contract,
the snapshot last shipped, in Alchemy state, and fails the deploy on any change
setup would refuse: a breaking change, or a switch to disposable. Declare it
for an IndexedDB or Durable Object table.

The only way past a persistent table's refusal is honest about the data: a new
physical table, leaving the old data in place, and a table migration that
moves it there. There is no override.

## Index changes and new tables

### Setup reindexes

A new index, or a new access pattern on one, has no keys in the rows already
stored. On a persistent table setup fixes that itself, with nothing declared.
After the topology is applied (DynamoDB adds the global secondary index and
waits until it is ACTIVE; IndexedDB changes its indexes in a version upgrade),
it scans the table with strongly consistent reads and, for each row of an
affected entity, uses `drift` and `reindex` to rewrite the row only if its
index keys drifted. An entity is affected when an index or access pattern it
uses is added or edited, and when a schema its rows reach gains a version,
since a migration may change an indexed field.

- Each write is guarded by the row's `_u`. A row an app write moved meanwhile
  is read again and retried, up to three times, then setup fails with
  `ReindexConflict`. A row that cannot be read fails setup too.
- No progress is kept. The Stored contract is written only after the scan, so
  a setup that stops part-way leaves the old contract, and the next one
  reindexes again. A reindex is idempotent, so that is safe.
- A disposable table is wiped instead.

Setup at deploy, on D1 and DynamoDB, runs while the old Worker still serves:
an old Worker that writes a row after the scan passed it writes it without the
new keys, and nothing reindexes it until its next write.

### A change no migration can make

A migration sees one row and nothing else. Most changes need nothing more: a
default, a rename, a split. Some do: a task gains an `owner` that no old task
recorded, though its project knows it. No pure function of the old task can
produce that, and a migration that guesses puts a wrong value into every read.

Such a change goes to a new table. You declare a new StdTable on a new
physical table, whose ESchemas start again at v1, and a **table migration**
moves every row of the old table into it once, reading the old table as it
goes. The old table stays in code, frozen, until every database has migrated
([ADR 0022](adr/0022-a-table-migrates-into-a-new-table-and-backfills-are-gone.md)).

### A table migration

`StdTable.migrate` takes the old table, the new one, and one handler per
entity of the old table. The keys are exhaustive: a missing or extra handler
fails to type-check. A handler gets one live old row, decoded at its latest
value with its meta, as `get` returns it. A deleted row is skipped, since the
new table starts its own history: no handler sees it, and it is not counted
as read. A handler also gets `old`, the old table with its reads only, and
`next`, the new table. Reads of `old` are strongly consistent wherever the
database offers it, so a row the scan sees is never missing from them. It may write one row, several, or none.

```ts
const migration = StdTable.migrate(
  oldBoard,
  board,
  {
    Project: (project, { next }) =>
      next.Project.insert({ ...project.value, archived: false }),
    Task: (task, { old, next }) =>
      old.Project.get({ projectId: task.value.projectId }).pipe(
        Effect.flatMap((project) =>
          next.Task.insert({
            ...task.value,
            owner: project?.value.owner ?? 'nobody',
          }),
        ),
      ),
    Comment: () => Effect.void, // dropped
  },
  { concurrency: 8 },
);
```

It returns a `Stream` of events and needs both tables as layers:
`Started { attempt, restarted }`, then `Progress { read, written, total,
counts }` after each page of the old table, then `Done { counts }`. A run on
a table that already finished emits only `Skipped`. `StdTable.runMigration`
runs a stream to its end, logging each event.

- The new table keeps one migration row in its Stored contract: the old
  table's logical name and contract hash, `running` or `done`, the attempt,
  and the rows read and written by old entity. `written` counts every row put
  through `next`.
- The new table must be persistent and set up under this code, and must not
  hold rows a migration did not write. The old table must be set up under its
  declaration in this code, so its rows read as typed. An old table with no
  contract and no rows, as in a fresh environment, migrates as empty.
- Any failure fails the stream with `MigrationRefused` or, for one row,
  `MigrationRowFailed`, which names its entity and key. The row stays
  `running`, so the next run clears the new table and starts over.
- `total` is the adapter's estimate: exact on SQLite, IndexedDB and Memory,
  and DynamoDB's own item count, refreshed about every six hours. It counts
  deleted rows too, so a table with many of them finishes below its total.
- On D1 and DynamoDB it runs at deploy, in `D1.migration` or
  `DynamoDB.migration` from `@kestack/std-toolkit/alchemy`, after both table
  resources. The Worker binds the migration's `tableName`, so it serves the
  new table only once every row is through. On SQLite and IndexedDB, run it
  at app open, after both setups and before the new table is used.

Run one migration at a time: a second run started while one is still going
takes its `running` row for a crashed run's and starts over under it. The old table is not frozen while a run reads it, so a write the old Worker
makes after the scan passed its row is lost. Once every database has
migrated, delete the old table, the `migrate` call and the migration
resource together.

Every edge case above is a runnable Story under
[`stories/evolving-schema/`](../stories/evolving-schema/), with
[`migrations/`](../stories/evolving-schema/migrations/) and
[`snapshot/`](../stories/evolving-schema/snapshot/).
