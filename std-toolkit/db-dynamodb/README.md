# @std-toolkit/db-dynamodb

DynamoDB single-table abstraction with Effect integration and schema evolution.

## Installation

```bash
pnpm add @std-toolkit/db-dynamodb effect @std-toolkit/eschema
```

## Intuition

This library provides two layers of abstraction for working with DynamoDB:

### Layer 1: DynamoTable (Low-level)

`DynamoTable` is a thin wrapper around DynamoDB operations. It handles marshalling/unmarshalling and provides an Effect-based API, but you work directly with partition keys (pk) and sort keys (sk).

```
┌─────────────────────────────────────────────────────────┐
│                     DynamoDB Table                      │
├──────────────┬──────────────┬───────────────────────────┤
│     pk       │     sk       │        attributes         │
├──────────────┼──────────────┼───────────────────────────┤
│ USER#123     │ PROFILE      │ name, email, age, ...     │
│ USER#123     │ ORDER#001    │ total, status, items, ... │
│ USER#123     │ ORDER#002    │ total, status, items, ... │
│ USER#456     │ PROFILE      │ name, email, age, ...     │
└──────────────┴──────────────┴───────────────────────────┘
```

Use `DynamoTable` when you need fine-grained control or are doing operations that don't fit the entity model.

### Layer 2: DynamoEntity (High-level)

`DynamoEntity` abstracts away key management entirely. You define:
1. A **schema** for your entity (what fields it has)
2. **Derivations** that compute pk/sk from your entity's fields

Then you work with plain objects - the library handles key generation, metadata tracking, and schema encoding/decoding.

```
┌─────────────────────────────────────────────────────────┐
│                    Your Code                            │
├─────────────────────────────────────────────────────────┤
│  userEntity.insert({ id: "123", name: "Alice", ... })   │
│  userEntity.get({ id: "123" })                          │
│  userEntity.query({ pk: { id: "123" } })                │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   DynamoEntity                          │
│  - Derives pk/sk from your data                         │
│  - Encodes/decodes via schema                           │
│  - Tracks metadata (_e, _v, _i, _u, _d)                 │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    DynamoDB                             │
│  pk: "USER#123", sk: "PROFILE", _e: "User", ...         │
└─────────────────────────────────────────────────────────┘
```

### Entity Metadata

Every entity automatically includes metadata fields:
- `_e` - Entity name (e.g., "User", "Order")
- `_v` - Schema version for evolution
- `_i` - Increment counter (increases on each update, useful for optimistic locking)
- `_u` - Last updated timestamp (ISO string)
- `_d` - Deleted flag (soft delete support)

### GSI Column Naming Convention

When using `DynamoEntity` with GSIs, the library writes to columns named `{GSI_NAME}PK` and `{GSI_NAME}SK`. For example, if your GSI is named `GSI1`, the columns will be `GSI1PK` and `GSI1SK`. Your DynamoDB table must have GSIs configured with these column names.

---

## Examples

### Example 1: Basic Table Operations

The simplest usage - direct table operations without entities.

```typescript
import { DynamoTable } from "@std-toolkit/db-dynamodb";
import { Effect } from "effect";

// 1. Create a table instance directly (no Layer needed)
const table = DynamoTable.make({
  tableName: "my-table",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})
  .primary("pk", "sk")
  .build();

// 2. Use the table - effects have no context requirements
const program = Effect.gen(function* () {
  // Put an item
  yield* table.putItem({
    pk: "USER#123",
    sk: "PROFILE",
    name: "Alice",
    email: "alice@example.com",
  });

  // Get the item
  const { Item } = yield* table.getItem({
    pk: "USER#123",
    sk: "PROFILE",
  });

  console.log(Item); // { pk: "USER#123", sk: "PROFILE", name: "Alice", ... }

  // Delete the item
  yield* table.deleteItem({ pk: "USER#123", sk: "PROFILE" });
});

// 3. Run directly - no layer required
Effect.runPromise(program);
```

### Example 2: Queries with Sort Key Conditions

Query items using various sort key conditions.

```typescript
const program = Effect.gen(function* () {
  // Insert test data
  yield* table.putItem({ pk: "USER#123", sk: "ORDER#2024-001", total: 100 });
  yield* table.putItem({ pk: "USER#123", sk: "ORDER#2024-002", total: 200 });
  yield* table.putItem({ pk: "USER#123", sk: "ORDER#2024-003", total: 150 });
  yield* table.putItem({ pk: "USER#123", sk: "ORDER#2023-010", total: 50 });

  // Query all orders for a user
  const allOrders = yield* table.query({ pk: "USER#123" });

  // Query with exact sort key match
  const exactOrder = yield* table.query({
    pk: "USER#123",
    sk: "ORDER#2024-001",
  });

  // Query orders starting with "ORDER#2024"
  const orders2024 = yield* table.query({
    pk: "USER#123",
    sk: { beginsWith: "ORDER#2024" },
  });

  // Query orders between two values
  const orderRange = yield* table.query({
    pk: "USER#123",
    sk: { between: ["ORDER#2024-001", "ORDER#2024-002"] },
  });

  // Query with comparison operators
  const recentOrders = yield* table.query({
    pk: "USER#123",
    sk: { ">=": "ORDER#2024-002" },
  });

  // Query with limit and reverse order
  const latestOrder = yield* table.query(
    { pk: "USER#123" },
    { Limit: 1, ScanIndexForward: false },
  );
});
```

### Example 3: Update Expressions

Use expression builders for complex updates.

```typescript
import {
  DynamoTable,
  updateExpr,
  compileUpdateExpr,
  buildExpr,
  addOp,
} from "@std-toolkit/db-dynamodb";

const program = Effect.gen(function* () {
  // Create an item
  yield* table.putItem({
    pk: "COUNTER#1",
    sk: "DATA",
    count: 0,
    name: "My Counter",
    tags: ["initial"],
  });

  // Build an update expression
  const update = updateExpr<{
    count: number;
    name: string;
    lastUpdated: string;
  }>(($) => [
    $.set("count", addOp("count", 1)),        // Atomic increment
    $.set("name", "Updated Counter"),          // Simple set
    $.set("lastUpdated", new Date().toISOString()),
  ]);

  const expr = buildExpr({ update: compileUpdateExpr(update) });

  // Execute the update
  const result = yield* table.updateItem(
    { pk: "COUNTER#1", sk: "DATA" },
    { ...expr, ReturnValues: "ALL_NEW" },
  );

  console.log(result.Attributes?.count); // 1
});
```

### Example 4: Conditional Operations

Perform operations with conditions for optimistic concurrency.

```typescript
import { conditionExpr, compileConditionExpr, buildExpr } from "@std-toolkit/db-dynamodb";

const program = Effect.gen(function* () {
  // Insert only if item doesn't exist
  yield* table.putItem(
    { pk: "USER#new", sk: "PROFILE", name: "New User" },
    { ConditionExpression: "attribute_not_exists(pk)" },
  );

  // Update only if a condition is met
  const condition = conditionExpr<{ status: string; version: number }>(($) =>
    $.and(
      $.cond("status", "=", "active"),
      $.cond("version", "=", 1),
    ),
  );

  const update = updateExpr<{ status: string; version: number }>(($) => [
    $.set("status", "inactive"),
    $.set("version", addOp("version", 1)),
  ]);

  const expr = buildExpr({
    condition: compileConditionExpr(condition),
    update: compileUpdateExpr(update),
  });

  yield* table.updateItem(
    { pk: "USER#new", sk: "PROFILE" },
    { ...expr, ReturnValues: "ALL_NEW" },
  );
});
```

### Example 5: Global Secondary Indexes (GSI)

Query data using alternative access patterns.

```typescript
// Table with GSIs
const table = DynamoTable.make({
  tableName: "my-table",
  region: "us-east-1",
  credentials: { /* ... */ },
})
  .primary("pk", "sk")
  .gsi("GSI1", "GSI1PK", "GSI1SK")  // GSI for email lookups
  .gsi("GSI2", "GSI2PK", "GSI2SK")  // GSI for status lookups
  .build();

const program = Effect.gen(function* () {
  // Insert with GSI keys
  yield* table.putItem({
    pk: "USER#123",
    sk: "PROFILE",
    GSI1PK: "EMAIL#alice@example.com",
    GSI1SK: "123",
    name: "Alice",
    email: "alice@example.com",
  });

  // Query by email using GSI (typed autocomplete for "GSI1" | "GSI2")
  const result = yield* table
    .index("GSI1")
    .query({ pk: "EMAIL#alice@example.com" });

  console.log(result.Items[0]?.name); // "Alice"
});
```

### Example 6: Transactions

Execute multiple operations atomically.

```typescript
const program = Effect.gen(function* () {
  // Create operations (not executed yet)
  const putOp = table.opPutItem({
    pk: "USER#456",
    sk: "PROFILE",
    name: "Bob",
  });

  const update = updateExpr<{ balance: number }>(($) => [
    $.set("balance", addOp("balance", -100)),
  ]);
  const expr = buildExpr({ update: compileUpdateExpr(update) });

  const updateOp = table.opUpdateItem(
    { pk: "USER#123", sk: "WALLET" },
    {
      UpdateExpression: expr.UpdateExpression!,
      ...(expr.ExpressionAttributeNames && {
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
      }),
      ...(expr.ExpressionAttributeValues && {
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
      }),
    },
  );

  // Execute atomically - all succeed or all fail
  yield* table.transact([putOp, updateOp]);
});
```

### Example 7: DynamoEntity - Basic Usage

Define an entity with automatic key derivation.

```typescript
import { ESchema } from "@std-toolkit/eschema";
import { DynamoEntity, DynamoTable } from "@std-toolkit/db-dynamodb";
import { Schema, Effect } from "effect";

// 1. Create table instance
const table = DynamoTable.make({
  tableName: "my-table",
  region: "us-east-1",
  credentials: { /* ... */ },
})
  .primary("pk", "sk")
  .build();

// 2. Define the schema
const userSchema = ESchema.make("User", {
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  age: Schema.Number,
}).build();

// 3. Create the entity with key derivations (receives table instance directly)
const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({
    pk: {
      deps: ["id"],                        // Fields used to derive pk
      derive: (v) => [`USER#${v.id}`],     // How to compute pk
    },
    sk: {
      deps: [],                            // No dependencies
      derive: () => ["PROFILE"],           // Static sort key
    },
  })
  .build();

// 4. Use the entity - no key management needed!
const program = Effect.gen(function* () {
  // Insert - just provide your data
  const user = yield* UserEntity.insert({
    id: "user-123",
    name: "Alice",
    email: "alice@example.com",
    age: 30,
  });

  console.log(user.value);  // { id: "user-123", name: "Alice", ... }
  console.log(user.meta);   // { _e: "User", _v: "v1", _i: 0, _u: "...", _d: false }

  // Get - just provide the key fields
  const fetched = yield* UserEntity.get({ id: "user-123" });

  // Update - provide key fields and updates
  const updated = yield* UserEntity.update(
    { id: "user-123" },
    { name: "Alice Smith", age: 31 },
  );

  console.log(updated.meta._i); // 1 (incremented)
});

// Run directly - no layer required
Effect.runPromise(program);
```

### Example 8: DynamoEntity with GSI

Add secondary access patterns to your entity.

```typescript
// Table with GSIs configured using standard naming convention
const table = DynamoTable.make({
  tableName: "my-table",
  region: "us-east-1",
  credentials: { /* ... */ },
})
  .primary("pk", "sk")
  .gsi("GSI1", "GSI1PK", "GSI1SK")  // DynamoEntity writes to GSI1PK, GSI1SK
  .gsi("GSI2", "GSI2PK", "GSI2SK")  // DynamoEntity writes to GSI2PK, GSI2SK
  .build();

// Entity with GSI derivations (single param - GSI name is used as both index name and key)
const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({
    pk: { deps: ["id"], derive: (v) => [`USER#${v.id}`] },
    sk: { deps: [], derive: () => ["PROFILE"] },
  })
  // GSI name has autocomplete from table's defined indexes ("GSI1" | "GSI2")
  .index("GSI1", {
    pk: { deps: ["email"], derive: (v) => [`EMAIL#${v.email}`] },
    sk: { deps: ["id"], derive: (v) => [v.id] },
  })
  .index("GSI2", {
    pk: { deps: ["status"], derive: (v) => [`STATUS#${v.status}`] },
    sk: { deps: ["name"], derive: (v) => [v.name] },
  })
  .build();

const program = Effect.gen(function* () {
  // Insert - GSI keys are automatically derived and stored
  yield* UserEntity.insert({
    id: "user-123",
    name: "Alice",
    email: "alice@example.com",
    status: "active",
  });

  // Query by email (typed autocomplete for "GSI1" | "GSI2")
  const byEmail = yield* UserEntity.index("GSI1").query({
    pk: { email: "alice@example.com" },
  });

  // Query by status with sort key condition
  const activeUsers = yield* UserEntity.index("GSI2").query({
    pk: { status: "active" },
    sk: { beginsWith: { name: "A" } } as any,  // Type assertion needed for beginsWith
  });
});
```

### Example 9: Entity Queries with Sort Key Conditions

Query entities with composite sort keys.

```typescript
const orderSchema = ESchema.make("Order", {
  userId: Schema.String,
  orderId: Schema.String,
  total: Schema.Number,
  status: Schema.String,
}).build();

const OrderEntity = DynamoEntity.make(table)
  .eschema(orderSchema)
  .primary({
    pk: { deps: ["userId"], derive: (v) => [`USER#${v.userId}`] },
    sk: { deps: ["orderId"], derive: (v) => [`ORDER#${v.orderId}`] },
  })
  .build();

const program = Effect.gen(function* () {
  // Insert orders
  yield* OrderEntity.insert({ userId: "user-1", orderId: "2024-001", total: 100, status: "completed" });
  yield* OrderEntity.insert({ userId: "user-1", orderId: "2024-002", total: 200, status: "pending" });
  yield* OrderEntity.insert({ userId: "user-1", orderId: "2024-003", total: 150, status: "completed" });

  // Query all orders for a user
  const allOrders = yield* OrderEntity.query({
    pk: { userId: "user-1" },
  });

  // Query with limit and ordering
  const latestOrder = yield* OrderEntity.query(
    { pk: { userId: "user-1" } },
    { Limit: 1, ScanIndexForward: false },
  );

  // Query with sort key prefix
  const orders2024 = yield* OrderEntity.query({
    pk: { userId: "user-1" },
    sk: { beginsWith: { orderId: "2024" } } as any,
  });
});
```

### Example 10: Optimistic Locking with Entity Metadata

Use the `_i` counter for optimistic concurrency control.

```typescript
const program = Effect.gen(function* () {
  // Insert initial entity
  const initial = yield* UserEntity.insert({
    id: "user-lock",
    name: "Original",
    email: "lock@example.com",
    age: 25,
  });

  // Simulate concurrent read
  const read1 = yield* UserEntity.get({ id: "user-lock" });
  const read2 = yield* UserEntity.get({ id: "user-lock" });

  // First update succeeds
  yield* UserEntity.update(
    { id: "user-lock" },
    { name: "Updated by Read 1" },
    { meta: { _i: read1!.meta._i } },  // Pass expected _i
  );

  // Second update fails because _i changed
  const result = yield* UserEntity.update(
    { id: "user-lock" },
    { name: "Updated by Read 2" },
    { meta: { _i: read2!.meta._i } },  // Stale _i
  ).pipe(Effect.either);

  if (result._tag === "Left") {
    console.log("Conflict detected! Item was modified.");
  }
});
```

### Example 11: Entity Transactions

Execute multiple entity operations atomically.

```typescript
const program = Effect.gen(function* () {
  // Create transaction operations
  const insertOp = yield* UserEntity.insertOp({
    id: "txn-user-1",
    name: "Transaction User",
    email: "txn@example.com",
    age: 28,
  });

  const updateOp = yield* UserEntity.updateOp(
    { id: "existing-user" },
    { status: "processed" },
  );

  // Execute atomically via table's transact method
  yield* table.transact([insertOp, updateOp]);
});
```

### Example 12: Schema Evolution

Handle schema changes over time with automatic migration.

```typescript
import { ESchema } from "@std-toolkit/eschema";

// Start with v1
const userSchemaV1 = ESchema.make("User", {
  id: Schema.String,
  name: Schema.String,
});

// Evolve to v2 - add email field
const userSchemaV2 = userSchemaV1.evolve(
  "v2",
  { email: Schema.optional(Schema.String) },
  (prev) => ({ ...prev, email: undefined }),
);

// Evolve to v3 - add age with default
const userSchema = userSchemaV2.evolve(
  "v3",
  { age: Schema.optional(Schema.Number) },
  (prev) => ({ ...prev, age: undefined }),
).build();

// Entity uses the evolved schema
const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({
    pk: { deps: ["id"], derive: (v) => [`USER#${v.id}`] },
    sk: { deps: [], derive: () => ["PROFILE"] },
  })
  .build();

// When reading old items, they're automatically migrated through the chain:
// v1 data -> v2 migration -> v3 migration -> current type
```

### Example 13: Local DynamoDB for Testing

Connect to DynamoDB Local for development and testing.

```typescript
const table = DynamoTable.make({
  tableName: "test-table",
  region: "us-east-1",
  credentials: {
    accessKeyId: "local",      // Any value works locally
    secretAccessKey: "local",
  },
  endpoint: "http://localhost:8000",  // DynamoDB Local endpoint
})
  .primary("pk", "sk")
  .build();

// Use the same code as production
const program = Effect.gen(function* () {
  yield* table.putItem({ pk: "TEST#1", sk: "DATA", value: "local test" });
});

Effect.runPromise(program);
```

---

## API Reference

### DynamoTable

Create a table instance for low-level operations.

```typescript
const table = DynamoTable.make(config)
  .primary("pk", "sk")
  .gsi("GSI1", "GSI1PK", "GSI1SK")
  .build();  // Returns table instance directly
```

| Method | Description |
|--------|-------------|
| `getItem(key, options?)` | Get a single item by primary key |
| `putItem(value, options?)` | Insert or replace an item |
| `updateItem(key, options)` | Update an item's attributes |
| `deleteItem(key)` | Delete an item |
| `query(cond, options?)` | Query items by key condition |
| `scan(options?)` | Scan all items in the table |
| `index(name)` | Access a secondary index for query/scan (typed autocomplete) |
| `opPutItem(value, options?)` | Create a put operation for transactions |
| `opUpdateItem(key, options)` | Create an update operation for transactions |
| `transact(items)` | Execute operations atomically |

### DynamoEntity

High-level entity abstraction with automatic key management.

```typescript
const entity = DynamoEntity.make(table)  // Pass table instance directly
  .eschema(schema)
  .primary({ pk: {...}, sk: {...} })
  .index("GSI1", { pk: {...}, sk: {...} })  // GSI name from table
  .build();  // Returns entity instance directly
```

| Method | Description |
|--------|-------------|
| `get(keyValue, options?)` | Get an entity by its key fields |
| `insert(value, options?)` | Insert a new entity |
| `update(keyValue, updates, options?)` | Update an entity |
| `query(params, options?)` | Query entities by derived keys |
| `index(gsiName)` | Access a secondary index (typed from table) |
| `insertOp(value, options?)` | Create an insert operation for transactions |
| `updateOp(keyValue, updates, options?)` | Create an update operation for transactions |

### Expression Builders

| Function | Description |
|----------|-------------|
| `conditionExpr<T>(builder)` | Build condition expressions |
| `updateExpr<T>(builder)` | Build update expressions |
| `addOp(key, value)` | Atomic add/increment operation |
| `ifNotExists(key, value)` | Set if attribute doesn't exist |
| `buildExpr(options)` | Combine multiple expressions |
| `compileConditionExpr(op)` | Compile condition to DynamoDB format |
| `compileUpdateExpr(ops)` | Compile update to DynamoDB format |

---

## Limitations and Things to Watch Out For

### 1. GSI Column Naming Convention

**DynamoEntity writes GSI keys to columns named `{GSI_NAME}PK` and `{GSI_NAME}SK`**.

Your DynamoDB table **must** be configured with matching column names:

```typescript
// Table definition
.gsi("GSI1", "GSI1PK", "GSI1SK")

// Entity will write to these columns:
// - GSI1PK
// - GSI1SK
```

If you use different column names, GSI queries will return no results.

### 2. Sort Key beginsWith Type Mismatch

There's a type definition quirk where `beginsWith` expects a `string` but the runtime expects the deps object. Use type assertion:

```typescript
// TypeScript complains but this is correct at runtime:
const result = yield* entity.query({
  pk: { userId: "123" },
  sk: { beginsWith: { orderId: "2024" } } as any,
});
```

### 3. No Native Date Support in Marshall

The `marshall` function doesn't handle JavaScript `Date` objects. Convert to ISO strings first:

```typescript
// Wrong - will marshal as empty object
yield* table.putItem({ timestamp: new Date() });

// Correct
yield* table.putItem({ timestamp: new Date().toISOString() });
```

### 4. Entity Insert Duplicate Detection

When inserting a duplicate entity, the error type may vary:
- `ItemAlreadyExists` - When properly mapped
- `PutItemFailed` - When the underlying condition check fails

Always handle both cases or check the error structure:

```typescript
const result = yield* entity.insert(data).pipe(Effect.either);
if (result._tag === "Left") {
  const tag = result.left.error._tag;
  if (tag === "ItemAlreadyExists" || tag === "PutItemFailed") {
    // Handle duplicate
  }
}
```

### 5. Entity Update on Non-Existent Item

Updating a non-existent entity may return `UpdateItemFailed` instead of `NoItemToUpdate`:

```typescript
const result = yield* entity.update({ id: "missing" }, { name: "x" }).pipe(Effect.either);
if (result._tag === "Left") {
  const tag = result.left.error._tag;
  if (tag === "NoItemToUpdate" || tag === "UpdateItemFailed") {
    // Item doesn't exist
  }
}
```

### 6. Transaction Size Limits

DynamoDB transactions are limited to **100 items** and **4 MB total size**. The library doesn't enforce this - you'll get a DynamoDB error.

### 7. Eventual Consistency by Default

DynamoDB reads are eventually consistent by default. Use `ConsistentRead: true` for strong consistency (costs 2x read capacity):

```typescript
yield* entity.get({ id: "123" }, { ConsistentRead: true });
yield* table.getItem(key, { ConsistentRead: true });
```

### 8. No Automatic Retries

The library doesn't implement automatic retries for throttling. Handle `ThrottlingException` errors yourself:

```typescript
import { Schedule, Effect } from "effect";

const withRetry = entity.get({ id: "123" }).pipe(
  Effect.retry(
    Schedule.exponential("100 millis").pipe(
      Schedule.union(Schedule.recurs(3)),
    ),
  ),
);
```

### 9. Schema Version on Insert

When inserting entities, the `_v` field is automatically set. Don't include it in your insert data:

```typescript
// Correct - _v is set automatically
yield* entity.insert({ id: "123", name: "Alice" });

// The _v field in your schema type is for reading, not writing
```

### 10. Local DynamoDB Differences

DynamoDB Local may behave slightly differently from AWS:
- Error messages may vary
- Some advanced features may not be supported
- Performance characteristics differ

Always test against real DynamoDB before production.

---

## Development

```bash
# Install dependencies
pnpm install

# Run tests (requires DynamoDB Local on port 8000)
pnpm test

# Type check
pnpm lint

# Build
pnpm build
```

### Running DynamoDB Local

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```
