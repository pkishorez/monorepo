# ValueESchema uses a versioned envelope

Whole-value evolution needs a separate abstraction from field-map evolution.
`ValueESchema` versions an entire Effect Schema value at each step, while
`ESchema` continues to version object fields by delta. Because strings,
numbers, arrays, literals, null, and other non-field-map values have nowhere to
carry `_v`, the canonical encoded value for a `ValueESchema` is a value
envelope: `{ _v, value }`.

## Decision

Add `ValueESchema` as an anonymous, first-class evolving schema for whole-value
evolution. It uses `make(schema)` and evolves by replacing the complete value
schema for each version, with migrations receiving and returning decoded
values. Effect Schema transforms are supported at the value level by the same
decoded/encoded split already supported by object-shaped evolving schemas. It
can stand alone or compose through the existing `toSchema()`.
Migrations may bridge decoded type changes across versions.

`encode` always emits the canonical value envelope for the latest version.
`decode` accepts either a value envelope or a bare value. A bare value is
treated as legacy earliest-version data, including when the `ValueESchema` is
nested inside another evolving schema. An object with `_v` is interpreted as a
value envelope; `{ value }` without `_v` is not a special envelope form.

`getDescriptor()` describes the canonical value envelope, not the bare legacy
forms accepted by the read path. The Standard Schema view follows the read
path: it accepts the same inputs as `decode` and returns the decoded value.

## Considered options

- **Extend `ESchema` to accept a normal Effect Schema.** Rejected: it blurs two
  different models. `ESchema.make(fields)` means field-map evolution by delta;
  `ValueESchema.make(schema)` means whole-value evolution.
- **Encode values bare and rely on parent versioning.** Rejected: nested values
  need independent versioning, and a bare value cannot carry its own `_v`.
- **Make the envelope configurable.** Rejected: `{ _v, value }` is predictable,
  descriptor-friendly, and keeps the metadata boundary obvious.
- **Require an explicit adoption mode for bare values.** Rejected: accepting
  bare values by default matches the existing rule that unstamped data decodes
  as the earliest version, and makes converting an existing field to a nested
  `ValueESchema` non-breaking.
- **Restrict `ValueESchema` to primitives or literals.** Rejected: the real
  distinction is whole-value evolution versus field-map evolution. Object
  values may evolve atomically as values too.

## Consequences

- Bare legacy values are accepted unless they already use the reserved value
  envelope shape. If an incoming object has `_v`, envelope interpretation wins.
- Underscore-prefixed keys remain reserved for `ESchema` field maps and for the
  value envelope boundary. They are not reserved inside the value itself.
- Existing decoded/encoded type extractors apply to `ValueESchema` too.
  `AnyESchema` remains object-shaped; use `AnyValueESchema` for value evolving
  schemas and `AnyEvolvingSchema` when both families are needed.
- `ValueESchema` exposes the latest value schema, but not field-map APIs such
  as `fields` or `makePartial()`.
- A nested `ValueESchema` can change a parent's decoded output without bumping
  the parent's version, just like any other nested evolving schema.
