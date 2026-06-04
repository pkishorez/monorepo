# Effect v4 migration notes — `@std-toolkit/eschema`

Minimal, idiomatic v3 → v4 changes. Public runtime exports are unchanged;
two **type-level** surfaces narrowed because v4 forces it (see below). No tests
removed or skipped (`git diff` on `src/__tests__` shows zero `it`/`describe`
deletions, no `.skip`/`.only`). `package.json` diff is empty (version pin was
done in the up-front bump).

## Source changes

### `src/types.ts`

- `Schema.Schema<A, E, Ctx>` is now a **single-parameter** interface
  (`Schema.Schema<T>`). The codec with encoded + service tracking is
  `Schema.Codec<T, E, RD, RE>`.
  - `StructFieldsSchema` / `DeltaSchema` fields: the union of
    `Schema.Schema<any, any, never> | Schema.PropertySignature<…>` collapses to
    `Schema.Top` (v4 `Struct.Fields` is `Record<PropertyKey, Top>`; plain
    schemas and `optionalKey` property signatures are all `Top`).
  - `ValueSchema`, `IdSchema`: `Schema.Schema<…, …, never>` → `Schema.Codec<…>`.
  - `Schema.Schema.Encoded<S>` moved to `Schema.Codec.Encoded<S>` (the `Encoded`
    extractor lives in the `Codec` namespace; `Schema.Schema.Type<S>` still
    exists).
- `ESchemaDescriptor`: the old `JSONSchema.JsonSchema7Object` /
  `JsonSchema7` types are gone. v4 `JsonSchema.JsonSchema` is an open
  `{ [x: string]: unknown }`. Redefined `ESchemaDescriptor` structurally with
  `type?`, `properties`, optional `$schema`/`$defs` to match what `getDescriptor`
  returns and what the descriptor tests read.

### `src/schema.ts`

- `id`: `.annotations({ jsonSchema: { identifier } })` →
  `.annotate({ identifier })`. In v4 the identifier is a first-class annotation
  that drives the JSON-Schema `$defs` key.
- `struct` return type: `Schema.Schema<T, E, never>` → `Schema.Codec<T, E>`.
- `fromType`: return type narrowed `Schema.Schema<T>` → `Schema.Codec<T, T>`.
  **v4-forced:** the single-param `Schema.Schema<T>` inherits `unknown`
  decoding/encoding services from `Top`, so `decodeUnknownEffect`/`encodeEffect`
  on it yield `Effect<…, …, unknown>` which fails `Effect<…, …, never>`
  call sites. `Codec<T, T>` pins services to `never`. Runtime value unchanged.

### `src/eschema.ts`

- Imports: dropped folded/renamed `JSONSchema`, `ParseResult`, `SchemaAST`;
  added `Cause`, `Option`, `SchemaGetter`, `SchemaIssue`.
- `Effect.gen(this, fn)` → `Effect.gen({ self: this }, fn)` (v4 requires the
  self value wrapped in an options object).
- `Schema.decodeUnknown` → `Schema.decodeUnknownEffect`,
  `Schema.encode` → `Schema.encodeEffect` (the bare names were repurposed; the
  Effect-returning variants gained the `Effect` suffix).
- `getDescriptor`: `JSONSchema.make(schema)` → new `toDescriptor` helper around
  `Schema.toJsonSchemaDocument(schema)`, which returns
  `{ schema, definitions, dialect }`; we return `schema` and expose
  `definitions` as `$defs` when non-empty. A `_v` `Schema.Literal` renders as
  `{ type: "string", enum: [...] }`, which the descriptor tests assert on.
- `'~standard'.validate`: v4 `Cause` is flattened (no `_tag: 'Fail'` /
  `cause.error`). Replaced with `Cause.findErrorOption(cause)` +
  `Option.isSome`.
- `toSchema`: rewritten. v4 dropped `SchemaAST.SurrogateAnnotationId` and
  reshaped `Schema.declare` (it is now a type-guard constructor;
  `declareConstructor` is the parametric form). Instead of a declared codec +
  surrogate, the eschema is wrapped as a permissive codec:
  `Schema.Unknown.pipe(Schema.decodeTo(Schema.Unknown, { decode, encode }))`
  where `decode`/`encode` are `SchemaGetter.transformOrFail` adapters that run
  the eschema's effectful `decode`/`encode` and map `ESchemaError` to a
  `SchemaIssue.InvalidValue`. The result is annotated with `identifier`
  (`ESchema(Name)` / `ValueESchema(Name)`), which becomes the JSON-Schema
  `$defs` key — the only JSON-Schema surface the tests assert for `toSchema`.
  `Schema.Unknown` (vs. the encoded struct) keeps decode permissive so older
  nested versions still fold forward, matching the old `declare` behaviour.
  Return types: `Schema.Schema<…, …, never>` → `Schema.Codec<…, …>`.

## Test changes (no removals/skips)

- `JSONSchema` import dropped; `Schema.toJsonSchemaDocument(...).definitions`
  replaces `JSONSchema.make(...).$defs`.
- `Schema.transform(from, to, { decode, encode })` (fixtures, tutorial 04) →
  `from.pipe(Schema.decodeTo(to, SchemaTransformation.transform({ … })))`.
- `Schema.Literal('a', 'b')` (multi-arg) → `Schema.Literals(['a', 'b'])`.
- `Schema.optionalWith(s, { exact: true })` → `Schema.optionalKey(s)`.
- `Schema.optionalWith(s, { default })` →
  `s.pipe(Schema.withDecodingDefaultType(Effect.succeed(default)))`.
- `Schema.decodeUnknown`/`Schema.encode` → `*Effect` variants.
- `Effect.either` (tutorial 03) → `Effect.result` (returns `Result`; failure
  tag is `'Failure'`, not `'Left'`).

## Net line delta

`git diff --shortstat`: 13 files changed, 123 insertions(+), 112 deletions(-).
Roughly flat. The +11 net comes mostly from `decodeTo`/`transformOrFail`
expansions being multi-line where v3 one-liners (`Schema.transform`,
`optionalWith`, `Schema.declare`) were terser; no new primitives or
speculative abstractions were added.
