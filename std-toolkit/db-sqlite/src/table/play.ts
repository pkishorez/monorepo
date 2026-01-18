import { ESchema } from "@std-toolkit/eschema";
import { Effect, Schema } from "effect";
import { SQLiteTable } from "./table.js";

// ============================================================================
// Schema Definition
// ============================================================================

const UserSchema = ESchema.make("User", {
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  status: Schema.Literal("active", "inactive"),
}).build();

// ============================================================================
// Simple Table (Primary Key Only)
// ============================================================================

const UsersTable = SQLiteTable.make(UserSchema).primary(["id"]).build();

// ============================================================================
// Table with Secondary Indexes (including meta fields)
// ============================================================================

const UsersTableWithIndexes = SQLiteTable.make(UserSchema)
  .primary(["id"])
  .index("byEmail", ["email"])
  .index("byEmailCreated", ["email", "_c"]) // email + created timestamp
  .index("byStatusUpdated", ["status", "_u"]) // status + updated timestamp
  .build();

// ============================================================================
// Basic CRUD Operations
// ============================================================================

const basicOperations = Effect.gen(function* () {
  yield* UsersTableWithIndexes.setup();

  const inserted = yield* UsersTableWithIndexes.insert({
    id: "123",
    email: "alice@example.com",
    name: "Alice",
    status: "active",
  });

  const updated = yield* UsersTableWithIndexes.update(
    { id: "123" },
    { name: "Alice Smith" },
  );

  const deleted = yield* UsersTableWithIndexes.delete({ id: "123" });

  return { inserted, updated, deleted };
});

// ============================================================================
// Querying - query(key, op, options?)
// ============================================================================

const queryOperations = Effect.gen(function* () {
  // Query by primary key
  const usersById = yield* UsersTableWithIndexes.query(
    "pk",
    { ">=": { id: "123" } },
    { limit: 10 },
  );

  // Query by email index
  const byEmail = yield* UsersTableWithIndexes.query("byEmail", {
    ">=": { email: "alice@example.com" },
  });

  // Query by email + created timestamp (composite with meta field)
  const byEmailCreated = yield* UsersTableWithIndexes.query("byEmailCreated", {
    ">=": { email: "alice@example.com", _c: "2024-01-01" },
  });

  // Query by status + updated timestamp
  const recentlyUpdatedActive = yield* UsersTableWithIndexes.query(
    "byStatusUpdated",
    { ">=": { status: "active", _u: "2024-06-01" } },
    { limit: 100 },
  );

  return { usersById, byEmail, byEmailCreated, recentlyUpdatedActive };
});

// ============================================================================
// Schema Evolution
// ============================================================================

const UserSchemaV2 = ESchema.make("User", {
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  status: Schema.Literal("active", "inactive"),
})
  .evolve(
    "v2",
    {
      id: Schema.String,
      email: Schema.String,
      name: Schema.String,
      status: Schema.Literal("active", "inactive", "suspended"),
      role: Schema.String,
    },
    (prev) => ({
      ...prev,
      role: "user",
    }),
  )
  .build();

const UsersTableV2 = SQLiteTable.make(UserSchemaV2).primary(["id"]).build();

// ============================================================================
// Result Types
// ============================================================================

const resultTypes = Effect.gen(function* () {
  const result = yield* UsersTable.query("pk", { ">=": { id: "123" } });

  for (const item of result.items) {
    const { id, email, name, status } = item.data;
    const { _v, _i, _u, _c, _d } = item.meta;
  }
});
