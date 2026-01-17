# @std-toolkit/eschema

Evolvable schemas with version migrations built on [Effect Schema](https://effect.website/docs/schema/introduction). Implements [Standard Schema v1](https://github.com/standard-schema/standard-schema) for interoperability.

## Installation

```bash
npm install @std-toolkit/eschema effect
```

## Quick Start

```ts
import { Effect, Schema } from "effect";
import { ESchema } from "@std-toolkit/eschema";

const UserSchema = ESchema.make("User", {
  name: Schema.String,
  email: Schema.String,
}).build();

// Encode (returns Effect)
const encoded = Effect.runSync(
  UserSchema.encode({ name: "Alice", email: "alice@example.com" })
);
// { _v: "v1", _e: "User", name: "Alice", email: "alice@example.com" }

// Decode (returns Effect)
const decoded = Effect.runSync(
  UserSchema.decode({ _v: "v1", _e: "User", name: "Alice", email: "alice@example.com" })
);
// { _v: "v1", _e: "User", name: "Alice", email: "alice@example.com" }
```

## Schema Evolution

Add new fields or transform existing ones with automatic migrations:

```ts
const UserSchema = ESchema.make("User", {
  name: Schema.String,
})
  .evolve("v2", { name: Schema.String, email: Schema.String }, (prev) => ({
    ...prev,
    email: "unknown@example.com",
  }))
  .evolve("v3", { name: Schema.String, email: Schema.String, verified: Schema.Boolean }, (prev) => ({
    ...prev,
    verified: false,
  }))
  .build();

// Old v1 data automatically migrates through v2 → v3
const result = Effect.runSync(
  UserSchema.decode({ _v: "v1", _e: "User", name: "Bob" })
);
// { _v: "v3", _e: "User", name: "Bob", email: "unknown@example.com", verified: false }
```

## API

### `ESchema.make(name, fields)`

Creates a new schema builder with initial v1 fields.

```ts
const schema = ESchema.make("Product", {
  title: Schema.String,
  price: Schema.Number,
});
```

### `.evolve(version, fields, migration)`

Adds a new version with a migration function from the previous version.

```ts
schema.evolve("v2", { title: Schema.String, price: Schema.Number, currency: Schema.String }, (prev) => ({
  ...prev,
  currency: "USD",
}));
```

### `.build()`

Finalizes the schema and returns the `ESchema` instance.

### `schema.decode(value)`

Decodes unknown input, running migrations if needed. Returns `Effect<T, ESchemaError>`.

```ts
const decoded = yield* schema.decode(rawData);
```

### `schema.encode(value)`

Encodes a value with version and entity metadata. Returns `Effect<T, ESchemaError>`.

```ts
const encoded = yield* schema.encode({ title: "Widget", price: 9.99, currency: "USD" });
// { _v: "v2", _e: "Product", title: "Widget", price: 9.99, currency: "USD" }
```

### `schema.makePartial(value)`

Type helper for creating partial updates.

```ts
const partial = schema.makePartial({ title: "New Title" });
```

### `schema.schema`

Access the current (latest) schema fields.

## Error Handling

All operations return `Effect` and fail with `ESchemaError`:

```ts
import { Effect } from "effect";
import { ESchema, ESchemaError } from "@std-toolkit/eschema";

const result = schema.decode(invalidData).pipe(
  Effect.catchTag("ESchemaError", (error) => {
    console.log(error.message); // Descriptive error message
    console.log(error.cause);   // Underlying cause if any
    return Effect.succeed(fallbackValue);
  })
);
```

## Standard Schema v1

ESchema implements the Standard Schema v1 spec for use with form libraries and validators:

```ts
const schema = ESchema.make("User", { name: Schema.String }).build();

// Works with any Standard Schema compatible library
schema["~standard"].version;  // 1
schema["~standard"].vendor;   // "@std-toolkit/eschema"
schema["~standard"].validate(input);  // { value: T } | { issues: [...] }
```

## Field Transformations

Use Effect Schema transformations for encoding/decoding:

```ts
const StringToNumber = Schema.transform(Schema.String, Schema.Number, {
  decode: (s) => parseInt(s),
  encode: (n) => String(n),
});

const schema = ESchema.make("Counter", {
  count: StringToNumber,
}).build();

// Decode: "42" → 42
// Encode: 42 → "42"
```

## Metadata

All encoded values include:
- `_v` - Version string (e.g., "v1", "v2")
- `_e` - Entity name

Field names starting with `_` are reserved and forbidden in schema definitions.
