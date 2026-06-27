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

const User = ESchema.make({ name: Schema.String })
  .evolve('v2', { email: Schema.NullOr(Schema.String) }, (prev) => ({
    ...prev,
    email: null,
  }))
  .build();
```

See the tutorial at `src/eschema/tutorial/` for a guided walkthrough.

## Bin

```sh
npx eschema     # schema evolution CLI
```

## Key exports

`ESchema`, `EntityESchema`, `SingleEntityESchema`, `ValueESchema`, `toSchema`, `fromType`,
`id`, `metaSchema`, `ESchemaError` — and types `AnyESchema`, `ESchemaType`, `ESchemaEncoded`,
`ESchemaDescriptor`, `ESchemaIdField`, `ESchemaName`, `StructFieldsSchema`.
