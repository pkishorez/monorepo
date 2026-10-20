# The encoded form is JSON, and every version is tested to upgrade

A table snapshot freezes the stored shape of every approved version. It cannot see two ways a row is lost: a value written in a form that does not read back, and a migration that cannot read a row its version could have stored. Both now have their own guard.

## Decision

**A number field must be finite.** The snapshot type language refuses a number node whose checks do not exclude `NaN` and `±Infinity` (`Schema.Finite`, `Schema.Int`, or `isBetween` with finite bounds), when the schema is built. JSON has no form for them: SQLite and D1 store `null`, and the row never reads again. The rule is not applied to the encoded end of a conversion, such as `Schema.DurationFromMillis`, because a user cannot add a check there; encoding covers it. A type-level rule was not possible: `Schema.Finite` and `Schema.Number` share one TypeScript type.

**Every encode produces plain JSON.** Encoding an ESchema value, at any kind and any boundary, refuses an encoded form JSON cannot hold unchanged: a non-finite number, `undefined`, a bigint, symbol, or function, a sparse array or one with extra properties, a circular reference, a symbol key, a non-enumerable property, a `toJSON` method, or an object that is not plain. The error names the field. Every database write goes through this encode, so all adapters behave alike; before this, Memory and IndexedDB kept `NaN` while SQLite turned it into `null`.

**`expectUpgradable` tests migrations.** `@kestack/std-toolkit/eschema/testing` exports one function. For every version of a schema and of every ESchema it nests, it uses Effect's `Arbitrary` to generate values valid at that version, encodes each with that version's own fields, stamps the version, sends it through JSON, and decodes it with the schema. Each row must reach the latest value, keep its id, and save and read again unchanged. A value the version cannot store as JSON is discarded, since no such row can exist. The seed is fixed by default so a test is deterministic. A migration error now carries the thrown message (`Migration to v2 failed: cannot split titles yet`), which the report and every other caller show.

**The table test runs it over a table.** `expectTableShippable` (ADR 0018) checks every schema a StdTable's keyed and single entities reach, each once. A keyed entity's partition-key paths must come through an upgrade unchanged, as its id already must: a migration that changes `boardId` leaves a row that decodes but no longer lives at the key derived from its value, which `get` and `query` cannot find. Secondary-index components may change, since drift and reindex repair them. The per-schema `expectUpgradable` takes the same `unchanged` paths for any value a caller needs kept.

**An encode failure is `EncodeFailed`.** A table write whose value cannot be encoded fails with `DatabaseError` reason `EncodeFailed`, so it is told apart from a stored row that cannot be read (`DecodeFailed`).

Generating from each version's value side, not its encoded side, keeps every row one that code could really have written: random strings are never fed to a `NumberFromString` field.

## Consequences

Every ESchema that used `Schema.Number` moves to `Schema.Finite` or `Schema.Int`, including the snapshot document's own schema. Stored snapshots and committed snapshot files gain a `finite` check on each such field, which the diff accepts as safe (ADR 0018).

The upgrade check exercises what ADR 0013 left to review: migrations. It does not hash or store them, so a rewritten migration that still reads every generated row passes. It also cannot tell that a migration chose the wrong value; only a behavior test can.

Rejected: a type-level number rule, which Effect's types cannot express; generating encoded values directly, which produces rows no code could write; storing generated rows as golden files, for the reasons in ADR 0013; and making the upgrade check part of the deploy guard for now, because it runs user migrations and belongs in the test suite first.
