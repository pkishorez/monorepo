# Evolving schema design

## Choose the schema

```ts
import { Schema } from 'effect';
import { ESchema, EntityESchema, ValueESchema } from 'std-toolkit/eschema';

export const orderItemSchema = EntityESchema.make('orderItem', 'id', {
  orderId: Schema.String,
  title: Schema.String,
}).build();

const preferencesSchema = ESchema.make('preferences', {
  theme: Schema.String,
}).build();

const orderStatusSchema = ValueESchema.make(
  'orderStatus',
  Schema.Literals(['open', 'done']),
).build();

const searchInputSchema = Schema.Struct({ query: Schema.String });
```

These are separate examples; an entity’s evolving schema lives in its `schema.ts`.
Give independently reusable schemas their own modules.

- `EntityESchema`: a versioned record with an ID supplied by the schema.
- `ESchema`: a versioned object with named fields.
- `ValueESchema`: a versioned scalar, enum, or union treated as one value.
- Effect `Schema`: validation without stored version history.

Ask which kind fits, which fields it needs, and how those fields are validated.

## Optionality

```ts
const note = Schema.NullOr(Schema.String);
// Present: { note: 'Call first' }. Empty: { note: null }.
```

Always use `nullOr` semantics, spelled `Schema.NullOr(...)` in this API.
Keys remain present; use `null` for absence, never `undefined` or optional fields.
Adding a nullable field to an existing version still needs a migration that supplies it.

## Prefer a draft while designing

```ts
export const orderItemSchema = EntityESchema.make('orderItem', 'id', {
  orderId: Schema.String,
  title: Schema.String,
})
  .draft(
    { note: Schema.NullOr(Schema.String) },
    {
      forward: (saved) => ({ ...saved, note: null }),
      backward: ({ note, ...saved }) => saved,
    },
  )
  .build();
```

The app sees the draft shape; storage receives the latest released shape.
Here, saving discards `note`; explain this before the user agrees to the draft.
Ask whether the new field must persist before recommending this approach.

| Situation                                        | Propose                                      |
| ------------------------------------------------ | -------------------------------------------- |
| Existing unreleased draft                        | Update its `draft()` and mappings            |
| Released schema; next shape still being designed | Add `draft()`                                |
| Change ready to release                          | Replace the draft with, or add, an evolution |
| Existing version has never stored data           | Offer a direct edit with confirmation        |

Prefer drafts until the user confirms release readiness.
Ask whether the existing version has stored data; Git cannot establish that.

## Release an evolution

```ts
export const orderItemSchema = EntityESchema.make('orderItem', 'id', {
  orderId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { note: Schema.NullOr(Schema.String) }, (previous) => ({
    ...previous,
    note: null,
  }))
  .build();
```

This replaces the draft example when the change is ready to persist.
Old records gain `note: null`; new writes can retain the note.
Preserve versions that have stored data and keep migrations deterministic.

For changes to existing schemas, also read [edge-cases.md](edge-cases.md).
