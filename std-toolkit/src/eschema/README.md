# std-toolkit/eschema

Versioned, self-migrating schemas built on Effect Schema. Data written at any past version
is automatically folded forward to the current shape on decode.

## Subpaths

```ts
import { ESchema, EntityESchema, SingleEntityESchema, ValueESchema, toSchema } from 'std-toolkit/eschema';
// wildcard — import internal paths directly (advanced use)
import '...` from 'std-toolkit/eschema/*';
```

## Core model

A schema is a chain of versions `v1 … latest`.

- **encode** always writes the latest version and stamps `_v`.
- **decode** reads `_v` and folds forward through each migration to the latest shape.
- Data with no `_v` decodes as `v1`, making adoption over existing data non-breaking.

## Choosing a construct

| You're versioning                      | Use                   |
| -------------------------------------- | --------------------- |
| An object with named fields            | `ESchema`             |
| A single value (enum / scalar / union) | `ValueESchema`        |
| A named singleton object               | `SingleEntityESchema` |
| A keyed entity (name + per-row id)     | `EntityESchema`       |

## Quick example

```ts
import { ESchema } from 'std-toolkit/eschema';
import { Schema } from 'effect';

const User = ESchema.make('User', { name: Schema.String })
  .evolve('v2', { email: Schema.NullOr(Schema.String) }, (prev) => ({
    ...prev,
    email: null,
  }))
  .build();
```

See the tutorial at `src/eschema/tutorial/` for a guided walkthrough.

## Semantic contract snapshots

Schemas produce canonical, JSON-safe descriptions of every encoded and decoded version. Use the shared snapshot API to inspect current limitations and compare the current contract with a stored baseline.

```ts
import { readFile } from 'node:fs/promises';
import { Effect } from 'effect';
import { Snapshot } from 'std-toolkit/snapshot';

const current = User.snapshot();
const stored = JSON.parse(await readFile('contracts/user.json', 'utf8'));
const baseline = await Effect.runPromise(Snapshot.decode(stored));

const diagnostics = Snapshot.inspect(current);
const changes = Snapshot.diff(baseline, current);

console.log(Snapshot.render(current));
console.log(Snapshot.renderChanges(changes));
```

For a single committed baseline, create `std-toolkit.snapshot.ts` in the
project root:

```ts
import { table } from './src/table.js';

export default table.snapshot();
```

Approve the first contract, then verify it locally and in CI:

```sh
std-toolkit snapshot -u
std-toolkit snapshot
```

The command loads the TypeScript entry through Jiti and keeps the approved
contract in `std-toolkit.snapshot.json`. Drift exits with status 1 and prints
breaking, backfill, unverifiable, and safe changes. The snapshot is updated
only with `-u` or `--update`; commit the JSON file so Git retains its history.

```yaml
# GitHub Actions
- run: pnpm std-toolkit snapshot
```

## Key exports

`ESchema`, `EntityESchema`, `SingleEntityESchema`, `ValueESchema`, `toSchema`, `fromType`,
`id`, `metaSchema`, `ESchemaError` — and types `AnyESchema`, `ESchemaType`, `ESchemaEncoded`,
`ESchemaDescriptor`, `ESchemaIdField`, `ESchemaName`, `StructFieldsSchema`.
