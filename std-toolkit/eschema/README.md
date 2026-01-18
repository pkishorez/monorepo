# eschema

Evolving schemas with version migrations, built on [Effect Schema](https://effect.website/docs/schema/introduction). Implements [Standard Schema v1](https://github.com/standard-schema/standard-schema) for interoperability.

## Prerequisites

- [Effect](https://effect.website) - The TypeScript library for building robust applications

## Installation

```bash
npm install @std-toolkit/eschema effect
```

## Getting Started

```typescript
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
// { name: "Alice", email: "alice@example.com" }
```

## Schema Evolution

Add new fields or transform existing ones with automatic migrations:

```typescript
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
// { name: "Bob", email: "unknown@example.com", verified: false }
```

## API

| Method | Description |
|--------|-------------|
| `ESchema.make(name, fields)` | Create a new schema builder with initial v1 fields |
| `.evolve(version, fields, migration)` | Add a new version with migration function |
| `.build()` | Finalize and return the `ESchema` instance |
| `schema.encode(value)` | Encode value with version metadata |
| `schema.decode(value)` | Decode and migrate to latest version |
| `schema.makePartial(value)` | Type helper for partial updates |
| `schema.schema` | Access the current schema fields |

---

### ESchema.make(name, fields)

Creates a new schema builder with initial v1 fields.

```typescript
const schema = ESchema.make("Product", {
  title: Schema.String,
  price: Schema.Number,
});
```

---

### .evolve(version, fields, migration)

Adds a new version with a migration function from the previous version.

```typescript
schema.evolve("v2", { title: Schema.String, price: Schema.Number, currency: Schema.String }, (prev) => ({
  ...prev,
  currency: "USD",
}));
```

---

### schema.encode(value)

Encodes a value with version and entity metadata. Returns `Effect<{ data, meta }, ESchemaError>`.

```typescript
const { data, meta } = yield* schema.encode({ title: "Widget", price: 9.99, currency: "USD" });
// data: { title: "Widget", price: 9.99, currency: "USD" }
// meta: { _v: "v2", _e: "Product" }
```

---

### schema.decode(value)

Decodes unknown input, running migrations if needed. Returns `Effect<{ data, meta }, ESchemaError>`.

```typescript
const { data } = yield* schema.decode(rawData);
```

## Field Transformations

Use Effect Schema transformations for encoding/decoding:

```typescript
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

## Error Handling

All operations return `Effect` and fail with `ESchemaError`:

```typescript
import { Effect } from "effect";
import { ESchemaError } from "@std-toolkit/eschema";

const result = schema.decode(invalidData).pipe(
  Effect.catchTag("ESchemaError", (error) => {
    console.log(error.message);
    console.log(error.cause);
    return Effect.succeed(fallbackValue);
  })
);
```

## Standard Schema v1

ESchema implements the Standard Schema v1 spec for use with form libraries and validators:

```typescript
const schema = ESchema.make("User", { name: Schema.String }).build();

// Works with any Standard Schema compatible library
schema["~standard"].version;  // 1
schema["~standard"].vendor;   // "@std-toolkit/eschema"
schema["~standard"].validate(input);  // { value: T } | { issues: [...] }
```

## Metadata

All encoded values include:

| Field | Description |
|-------|-------------|
| `_v` | Version string (e.g., "v1", "v2") |
| `_e` | Entity name |

## Gotchas

- **Reserved fields**: Field names starting with `_` are reserved and forbidden in schema definitions.
- **Migration order**: Migrations run sequentially (v1 → v2 → v3), so each migration only needs to handle the previous version.
- **Immutable schemas**: Once `.build()` is called, the schema cannot be modified. Define all versions before building.

## License

MIT
