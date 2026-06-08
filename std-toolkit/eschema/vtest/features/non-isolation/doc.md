# The non-isolation gotcha

Composition is powerful, but it comes with a sharp edge that is easy to miss.
A nested schema's decode behaviour is **not local** — and that breaks the
intuition that "evolving a schema only affects that schema".

## Evolving a child changes what the parent decodes

Because a child folds forward through its own chain on every read, **evolving a
child changes what its parent decodes to, even though the parent's `_v` is
unchanged.** A parent stamped `v1` whose child evolved `v1 → v2` now yields child
values folded to v2 — the parent never moved, but its decoded shape did.

```ts
// The child gains a field in v2.
const Inner = ESchema.make({ a: Schema.String })
  .evolve('v2', { b: Schema.NullOr(Schema.String) }, (prev) => ({
    ...prev,
    b: null,
  }))
  .build();

const Outer = ESchema.make({
  inner: toSchema(Inner, { name: 'Inner' }),
}).build();
```

Decode an `Outer` whose stored `inner` is a bare v1 value, and `inner` comes
back with `b: null` — folded forward by the child's own chain, with the outer
schema none the wiser.

## The rule

The "no-op until you evolve past v1" guarantee is a **whole-tree** statement, not
a per-schema one. **When you evolve a schema, audit every parent that embeds
it** — not just the schema you changed.

::test-group{id=child-evolves}
