---
title: encode
order: 2
---

# encode

`schema.encode(value)` runs the **latest** version's struct encoder against
`value` and stamps the result with `_v: latestVersion`. The return type is
`Effect<Encoded & { _v }, ESchemaError>` — failures from Effect Schema's
encoder are wrapped in `ESchemaError` with `message: 'Encode failed'` and
the original `ParseError` set as `cause`.

Encode never runs migrations. It is the inverse of decoding a row at the
latest version; older versions are not encodable through this method.

## Usage

```ts
const encoded =
  yield * User.encode({ id: '1', name: 'Alice', email: 'a@b.com' });
encoded._v; // 'v1' (or whatever `latestVersion` is)
encoded.name; // 'Alice'
```

## API

| Argument    | Type                                                                 | Meaning                                                         |
| ----------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `value`     | `Decoded<TLatest>`                                                   | The latest-shape value. `_v` must **not** be set by the caller. |
| **returns** | `Effect<Encoded<TLatest> & { readonly _v: TVersion }, ESchemaError>` | Encoded payload plus the `_v` stamp at the latest version.      |

## Examples

### Round-trip via Effect Schema transform

```ts
const StringToNumber = Schema.transform(Schema.String, Schema.Number, {
  decode: (s) => parseInt(s),
  encode: (n) => String(n),
  strict: true,
});

const Counter = ESchema.make({ count: StringToNumber }).build();

const out = Effect.runSync(Counter.encode({ count: 42 }));
out.count; // "42"
out._v; // 'v1'
```

### Encode fails — surfaces as ESchemaError

```ts
const result = Effect.runSyncExit(
  User.encode({ id: '1', name: 1 as unknown as string, email: 'x' }),
);
result._tag; // 'Failure'
// cause.error is an ESchemaError with message 'Encode failed'
```

### makePartial helper for partial updates

```ts
User.makePartial({ name: 'Bob' });
// { name: 'Bob', _v: 'v1' }  — type-only convenience, no validation
```

## Edge cases

- **`_v` is stamped, never read from the value.** Even if the caller
  sneaks `_v: 'older'` into the input, the result carries `_v:
latestVersion`. The encoder's source of truth is the schema, not the
  value.
- **Encode runs through the latest struct only.** Older versions are not
  reachable; if you need a downgrade, do it manually before encoding.
- **`Encode failed` wraps the underlying `ParseError` as `cause`.** The
  consumer keeps the original Effect Schema error for inspection without
  having to pattern-match on `ESchemaError`'s internals.
- **An entity's `idField` is encoded as a regular string column.** No
  branding, no transform; whatever `Schema.String` would write is what
  ends up on the wire.
- **`makePartial` is type-level only.** It tags an object with the latest
  `_v` for use in update-style APIs; it does **not** validate the partial
  against the schema.
- **Encode is synchronous-friendly.** The struct encoder is pure; you can
  `Effect.runSync` an encode of any plain-data input without expecting
  async errors.

## Tests

The suites in `index.test.ts` lock down:

- Encode stamps the latest `_v` regardless of caller input.
- Encode runs Effect Schema transforms in the encode direction.
- Encode of an invalid value fails with `ESchemaError(message='Encode failed')`.
- `makePartial` tags the value with `_v` without validating it.
- EntityESchema encode writes the id field through as a regular string.
