# `ValueESchema`: evolving a whole value

Not everything you version is an object. An enum, a scalar, a discriminated
union — a single value with no named fields. For those, reach for
`ValueESchema`. It evolves the same way conceptually, but the mechanics differ
in two telling ways.

## Whole-schema replacement, and the envelope

An `ESchema` evolves by **delta**. A `ValueESchema` has no fields to delta, so
each version **replaces the whole value schema**, and its migration receives and
returns the _decoded value itself_:

```ts
const Status = ValueESchema.make(Schema.Literals(['draft', 'published']))
  .evolve('v2', Schema.Literals(['draft', 'review', 'published']), (v) => v)
  .build();
```

Because a bare value (a string like `'review'`) has nowhere to hang a `_v`,
encode wraps it in a **value envelope**: `{ _v, value }`. The version lives on
the envelope; your value sits untouched inside `value`.

## Bare legacy values still decode

Just like an unstamped object, a **bare** value with no envelope decodes as the
earliest version. So a legacy `'draft'` written before eschema existed reads
correctly through the chain — adoption stays non-breaking for values too.

::test-group{id=envelope}
