---
title: make
order: 1
---

# make

Every evolving schema starts with a `make` call. The package exposes three
flavors that differ only in identity:

| Flavor                     | Signature                     | Identity                 |
| -------------------------- | ----------------------------- | ------------------------ |
| `ESchema.make`             | `make(fields)`                | none — anonymous payload |
| `SingleEntityESchema.make` | `make(name, fields)`          | named singleton          |
| `EntityESchema.make`       | `make(name, idField, fields)` | named + reserved id key  |

All three return a **builder**. The builder can be `.evolve()`'d zero or
more times, and is finalized with `.build()`. The initial version is always
`'v1'`; nothing about the version chain is configurable at `make` time.

## Usage

```ts
// anonymous
const Config = ESchema.make({ theme: Schema.String }).build();

// named singleton
const Settings = SingleEntityESchema.make('Settings', {
  locale: Schema.String,
}).build();

// named + id field
const User = EntityESchema.make('User', 'id', {
  name: Schema.String,
  email: Schema.String,
}).build();
```

## API

| Argument    | Type                                 | Meaning                                                                       |
| ----------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| `name`      | `string` (SingleEntity/Entity)       | Stored on the built schema as `.name`. Used by `toSchema` identifier.         |
| `idField`   | `string` (Entity only)               | Name of the auto-added `Schema.String` ID field. Cannot appear in `fields`.   |
| `fields`    | `StructFieldsSchema`                 | Effect Schema fields. Keys starting with `_` are forbidden at the type level. |
| **returns** | `*Builder` with `.evolve` / `.build` | Builder seeded with `[{ version: 'v1', schema: fields }]`.                    |

## Examples

### Pure (anonymous) payload

```ts
const Event = ESchema.make({
  topic: Schema.String,
  body: Schema.Unknown,
}).build();
```

### Named singleton with a synthetic field

```ts
const Settings = SingleEntityESchema.make('Settings', {
  locale: Schema.String,
  notifications: Schema.Boolean,
}).build();

Settings.name; // 'Settings'
```

### Entity — id field is auto-added

```ts
const User = EntityESchema.make('User', 'id', {
  email: Schema.String,
}).build();

User.idField; // 'id'
'id' in User.fields; // true — added by the library, not the caller
```

### Underscore-prefixed key — type error

```ts
// @ts-expect-error — `_internal` collides with the metadata namespace.
EntityESchema.make('X', 'id', { _internal: Schema.String });
```

### Entity — id field listed in `fields` is rejected

```ts
// @ts-expect-error — `id` is reserved as the id field.
EntityESchema.make('X', 'id', { id: Schema.String, name: Schema.String });
```

## Edge cases

- **Initial version is always `v1`.** There is no `make({ version: 'v2', ... })`
  back-door. A first version must be `v1` and the chain grows upward from
  there.
- **Underscore-prefixed keys are forbidden at the type level.** The
  `ForbidUnderscorePrefix<I>` constraint marks any `_*` key with a string
  literal type that doesn't match `Schema`, surfacing as a TypeScript error
  rather than a runtime check.
- **`EntityESchema.make` auto-adds `idField` as a `Schema.String`.** The
  caller doesn't (and cannot) declare it; it shows up on `.fields` after
  `make` returns.
- **`idField` cannot appear in the user-supplied fields.** `ForbidIdField`
  rejects any key that matches `idField` at the type level, even though the
  library adds the same name internally.
- **`make` returns a builder, not a schema.** Forgetting `.build()` leaves
  you with an object that has no `decode`/`encode`. The runtime surface
  only appears after `.build()`.
- **`.fields` access before any evolution is safe.** The initial evolution
  set in `make` is enough to satisfy the `fields` getter — no `.evolve()`
  is required.

## Tests

The suites in `index.test.ts` lock down:

- `ESchema.make` constructs a v1-only schema whose `.fields` matches the input.
- `SingleEntityESchema.make` exposes `.name`.
- `EntityESchema.make` adds `idField` to `.fields` as `Schema.String`.
- `EntityESchema.make` rejects an explicit id field at type level.
- Underscore-prefixed keys are rejected at type level.
- Builders carry through to the latest version `'v1'` until `.evolve()` is called.
