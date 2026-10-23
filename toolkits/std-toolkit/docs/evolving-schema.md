# Evolving Schema

Data outlives code. Your code ships in versions; your data does not — a row
written in January is still sitting in the database in December, shaped exactly
the way January's code shaped it.

## Why schemas must evolve

The moment you add a field, every existing row becomes a liar: it claims to be
a `User`, but it has no `age`. You now have three bad options:

- **Backfill the table** — a migration script per deploy, downtime, and a
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

## Defining evolutions

Every change to a shape is an appended `evolve(version, delta, migration)`
step. The delta says what happened to the shape; the migration says what
happens to the data. The builder enforces the rest at compile time — versions
in sequence, no optional fields, no underscore keys, and (for entities) hands
off the id.

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

| You are versioning                                         | Use                                   |
| ---------------------------------------------------------- | ------------------------------------- |
| A table row, keyed by an id                                | `EntityESchema`                       |
| An object with named fields that follows the field rules   | `ESchema`                             |
| A single record stored once                                | `ESchema` with `table.singleEntity()` |
| A scalar, enum, list, map, or a union of different objects | `ValueESchema`                        |
| An existing object with optional fields                    | `ValueESchema`                        |

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
  after rows were written. On a persistent table, three things catch a changed
  version: the per-table test (`expectTableShippable`) in CI, the deploy guard,
  and setup against the Stored contract. See "Shipping" below. A rewritten migration is not caught by a snapshot: it is
  code. `expectUpgradable` (below) is the test that exercises it.
- **Migrations only run on read.** A row written at v1 stays a v1 row on disk
  until something decodes and re-encodes it. If you delete the v1→v2 migration
  from your code, unread v1 rows become undecodable.
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
- **Model absence with `Schema.NullOr`,** never optional fields — the builder
  forbids optionals so that every version has exactly one canonical shape.
- **One test per persistent table.** `expectTableShippable(table, file)`
  checks the committed snapshot and runs `expectUpgradable` over every schema
  the table reaches, keeping each keyed row's id and partition key. `vitest -u`
  accepts appended versions and other safe changes; nothing accepts an edit to
  a shipped version or a failing upgrade. A StdTable kept only in disposable
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
set up under, kept beside the data. Setup (`SQLite.setup`, `IDB.make` on first
open, `D1.table` at deploy) diffs the current snapshot against it:

- On a persistent table, a `breaking` or `unverifiable` change fails with
  `SetupRefused` and changes nothing. A `requires-backfill` change passes with
  a warning; IndexedDB reindexes the stored rows.
- On a disposable table, a change the rows cannot take wipes the table. For a
  change that needs a backfill, IndexedDB reindexes or wipes as `onBackfill`
  says; the other adapters wipe.

Because each database keeps its own contract, a browser or Durable Object that
skipped releases is compared from where its data actually is.

The **deploy guard** stops a change earlier. It keeps the Deployed contract,
the snapshot last shipped, in Alchemy state, and fails the deploy on a breaking
change. `D1.table` and `DynamoDB.table` include it for persistent tables;
`DeployGuard.table(table)` adds it for a table Alchemy does not create, such as
an IndexedDB or Durable Object table. DynamoDB keeps no Stored contract, so its
guard is its only check, and nothing replaces or wipes a DynamoDB table: in either mode, a breaking change, or any index change other than adding a global secondary index, fails the deploy, and the way past it is a new `DynamoDB.table` resource, with its own id and table name: renaming the table under the same resource would make Alchemy replace it and delete the old one, so that is refused too.

The only way past a persistent table's refusal is honest about the data: a new
physical table name, leaving the old data in place. There is no override.

Every edge case above is a runnable Story under
[`stories/evolving-schema/`](../stories/evolving-schema/),
[`stories/migrations/`](../stories/migrations/), and
[`stories/snapshot/`](../stories/snapshot/).
