# @std-toolkit/db-dynamodb

A type-safe DynamoDB abstraction built with Effect. Provides two layers: `DynamoTable` for direct table operations and `DynamoEntity` for schema-driven entity management with automatic key derivation.

## Installation

```bash
pnpm add @std-toolkit/db-dynamodb effect @std-toolkit/eschema
```

---

## DynamoTable

`DynamoTable` is a thin wrapper around DynamoDB operations. It handles marshalling/unmarshalling, provides type-safe index access, and exposes an Effect-based API.

### Limitations

- **Composite primary key required**: Every table must have both a partition key (pk) and sort key (sk). Single-key tables are not supported.
- **String keys only**: All key attributes (pk, sk, GSI keys) must be strings. Number and binary key types are not supported.
- **No batch operations**: BatchGetItem and BatchWriteItem are not implemented.
- **No PartiQL**: Only native DynamoDB operations are supported.
- **No automatic pagination**: Query and scan return a single page. Handle `LastEvaluatedKey` yourself for pagination.

### Example 1: Minimal Setup

The bare minimum to create a table and perform basic operations.

```typescript
import { DynamoTable } from "@std-toolkit/db-dynamodb";
import { Effect } from "effect";

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

const program = Effect.gen(function* () {
  // Put an item
  yield* table.putItem({
    pk: "USER#123",
    sk: "PROFILE",
    name: "Alice",
  });

  // Get the item
  const { Item } = yield* table.getItem({ pk: "USER#123", sk: "PROFILE" });
  console.log(Item); // { pk: "USER#123", sk: "PROFILE", name: "Alice" }

  // Delete the item
  yield* table.deleteItem({ pk: "USER#123", sk: "PROFILE" });
});

Effect.runPromise(program);
```

### Example 2: Query with Sort Key Conditions

Query items using various sort key operators.

```typescript
const program = Effect.gen(function* () {
  // Query all items with a partition key
  const all = yield* table.query({ pk: "USER#123" });

  // Exact sort key match
  const exact = yield* table.query({ pk: "USER#123", sk: "ORDER#001" });

  // Sort key begins with prefix
  const byPrefix = yield* table.query({
    pk: "USER#123",
    sk: { beginsWith: "ORDER#2024" },
  });

  // Sort key between range
  const range = yield* table.query({
    pk: "USER#123",
    sk: { between: ["ORDER#001", "ORDER#010"] },
  });

  // Sort key comparisons: "<", "<=", ">", ">="
  const recent = yield* table.query({
    pk: "USER#123",
    sk: { ">=": "ORDER#100" },
  });

  // Reverse order and limit
  const latest = yield* table.query(
    { pk: "USER#123" },
    { Limit: 5, ScanIndexForward: false },
  );
});
```

### Example 3: Global Secondary Indexes (GSI)

Define GSIs and query them with type-safe index names.

```typescript
const table = DynamoTable.make({
  tableName: "my-table",
  region: "us-east-1",
  credentials: { accessKeyId: "...", secretAccessKey: "..." },
})
  .primary("pk", "sk")
  .gsi("byEmail", "GSI1PK", "GSI1SK")
  .gsi("byStatus", "GSI2PK", "GSI2SK")
  .build();

const program = Effect.gen(function* () {
  // Insert with GSI keys
  yield* table.putItem({
    pk: "USER#123",
    sk: "PROFILE",
    GSI1PK: "EMAIL#alice@example.com",
    GSI1SK: "USER#123",
    GSI2PK: "STATUS#active",
    GSI2SK: "2024-01-15",
    name: "Alice",
    email: "alice@example.com",
  });

  // Query by email - index name has autocomplete
  const byEmail = yield* table.index("byEmail").query({
    pk: "EMAIL#alice@example.com",
  });

  // Query by status with sort key condition
  const activeRecent = yield* table.index("byStatus").query(
    { pk: "STATUS#active", sk: { ">=": "2024-01-01" } },
    { Limit: 10, ScanIndexForward: false },
  );
});
```

### Example 4: Update with Expression Builders

Use expression builders for type-safe updates.

```typescript
import { DynamoTable, exprUpdate, opAdd, buildExpr } from "@std-toolkit/db-dynamodb";

type Counter = { count: number; name: string; updatedAt: string };

const program = Effect.gen(function* () {
  yield* table.putItem({
    pk: "COUNTER#1",
    sk: "DATA",
    count: 0,
    name: "Page Views",
  });

  // Build update expression with atomic increment
  const update = exprUpdate<Counter>(($) => [
    $.set("count", opAdd("count", 5)),
    $.set("name", "Total Views"),
    $.set("updatedAt", new Date().toISOString()),
  ]);

  const expr = buildExpr({ update });

  const result = yield* table.updateItem(
    { pk: "COUNTER#1", sk: "DATA" },
    { ...expr, ReturnValues: "ALL_NEW" },
  );

  console.log(result.Attributes?.count); // 5
});
```

### Example 5: Conditional Writes

Perform operations only when conditions are met.

```typescript
import { exprCondition, exprUpdate, buildExpr } from "@std-toolkit/db-dynamodb";

type Item = { status: string; version: number };

const program = Effect.gen(function* () {
  // Insert only if item doesn't exist
  const insertCond = exprCondition<{ pk: string }>(($) =>
    $.attributeNotExists("pk"),
  );
  const insertExpr = buildExpr({ condition: insertCond });

  yield* table.putItem(
    { pk: "LOCK#1", sk: "DATA", status: "pending", version: 1 },
    insertExpr,
  );

  // Update only if version matches (optimistic locking)
  const updateCond = exprCondition<Item>(($) =>
    $.and($.cond("status", "=", "pending"), $.cond("version", "=", 1)),
  );

  const update = exprUpdate<Item>(($) => [
    $.set("status", "completed"),
    $.set("version", opAdd("version", 1)),
  ]);

  const expr = buildExpr({ condition: updateCond, update });

  yield* table.updateItem({ pk: "LOCK#1", sk: "DATA" }, expr);
});
```

---

## DynamoEntity

`DynamoEntity` wraps `DynamoTable` with schema validation, automatic key derivation, and metadata tracking. You define a schema and how keys are derived from your data - the library handles the rest.

Every entity includes metadata:
- `_e` - Entity name (from schema)
- `_v` - Schema version (for evolution)
- `_i` - Increment counter (for optimistic locking)
- `_u` - Last updated timestamp (ISO string)
- `_d` - Deleted flag (soft delete)

### Example 1: Minimal Entity Setup

Define a schema and primary key derivation.

```typescript
import { DynamoTable, DynamoEntity } from "@std-toolkit/db-dynamodb";
import { ESchema } from "@std-toolkit/eschema";
import { Schema, Effect } from "effect";

const table = DynamoTable.make({
  tableName: "my-table",
  region: "us-east-1",
  credentials: { accessKeyId: "...", secretAccessKey: "..." },
})
  .primary("pk", "sk")
  .build();

const userSchema = ESchema.make("User", {
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
}).build();

const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({
    pk: { deps: ["id"], derive: (v) => [`USER#${v.id}`] },
    sk: { deps: [], derive: () => ["PROFILE"] },
  })
  .build();

const program = Effect.gen(function* () {
  // Insert - keys are derived automatically
  const user = yield* UserEntity.insert({
    id: "123",
    name: "Alice",
    email: "alice@example.com",
  });

  console.log(user.value); // { id: "123", name: "Alice", email: "alice@example.com" }
  console.log(user.meta._i); // 0

  // Get by key fields
  const fetched = yield* UserEntity.get({ id: "123" });
});

Effect.runPromise(program);
```

### Example 2: Update and Optimistic Locking

Update entities with automatic version tracking.

```typescript
const program = Effect.gen(function* () {
  const user = yield* UserEntity.insert({
    id: "456",
    name: "Bob",
    email: "bob@example.com",
  });

  // Simple update - _i auto-increments, _u auto-updates
  const updated = yield* UserEntity.update({ id: "456" }, { name: "Robert" });
  console.log(updated.meta._i); // 1

  // Optimistic locking - pass expected _i value
  const result = yield* UserEntity.update(
    { id: "456" },
    { email: "robert@example.com" },
    { meta: { _i: updated.meta._i } },
  );
  console.log(result.meta._i); // 2

  // If someone else updated, this fails
  const stale = yield* UserEntity.update(
    { id: "456" },
    { name: "Bobby" },
    { meta: { _i: 0 } }, // stale version
  ).pipe(Effect.either);

  if (stale._tag === "Left") {
    console.log("Conflict - item was modified");
  }
});
```

### Example 3: Entity with GSI

Define secondary access patterns with automatic key derivation.

```typescript
const table = DynamoTable.make({
  tableName: "my-table",
  region: "us-east-1",
  credentials: { accessKeyId: "...", secretAccessKey: "..." },
})
  .primary("pk", "sk")
  .gsi("byEmail", "byEmailPK", "byEmailSK")
  .build();

const userSchema = ESchema.make("User", {
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  status: Schema.String,
}).build();

const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({
    pk: { deps: ["id"], derive: (v) => [`USER#${v.id}`] },
    sk: { deps: [], derive: () => ["PROFILE"] },
  })
  .index("byEmail", {
    pk: { deps: ["email"], derive: (v) => [`EMAIL#${v.email}`] },
    sk: { deps: ["id"], derive: (v) => [v.id] },
  })
  .build();

const program = Effect.gen(function* () {
  yield* UserEntity.insert({
    id: "789",
    name: "Carol",
    email: "carol@example.com",
    status: "active",
  });

  // Query by email using GSI
  const result = yield* UserEntity.index("byEmail").query({
    pk: { email: "carol@example.com" },
  });

  console.log(result.items[0]?.value.name); // "Carol"
});
```

### Example 4: Query with Conditions and Filters

Query entities with sort key conditions and filters.

```typescript
import { exprFilter } from "@std-toolkit/db-dynamodb";

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

type Order = { userId: string; orderId: string; total: number; status: string };

const program = Effect.gen(function* () {
  // Insert orders
  yield* OrderEntity.insert({ userId: "u1", orderId: "2024-001", total: 100, status: "pending" });
  yield* OrderEntity.insert({ userId: "u1", orderId: "2024-002", total: 250, status: "completed" });
  yield* OrderEntity.insert({ userId: "u1", orderId: "2024-003", total: 75, status: "pending" });

  // Query all orders for user
  const all = yield* OrderEntity.query({ pk: { userId: "u1" } });

  // Query with sort key prefix
  const orders2024 = yield* OrderEntity.query({
    pk: { userId: "u1" },
    sk: { beginsWith: { orderId: "2024" } },
  });

  // Query with filter
  const filter = exprFilter<Order>(($) => $.cond("status", "=", "pending"));

  const pending = yield* OrderEntity.query(
    { pk: { userId: "u1" } },
    { filter },
  );

  // Newest first, limit 1
  const latest = yield* OrderEntity.query(
    { pk: { userId: "u1" } },
    { Limit: 1, ScanIndexForward: false },
  );
});
```

### Example 5: Conditional Insert

Insert with conditions to prevent duplicates or enforce business rules.

```typescript
import { exprCondition } from "@std-toolkit/db-dynamodb";

const program = Effect.gen(function* () {
  // Insert with duplicate check (built-in)
  const result = yield* UserEntity.insert(
    { id: "dup-1", name: "Test", email: "test@example.com" },
    { ignoreIfAlreadyPresent: true },
  );

  // Insert with custom condition
  type User = { id: string; name: string; email: string };
  const cond = exprCondition<User>(($) =>
    $.or($.attributeNotExists("email"), $.cond("email", "<>", "reserved@example.com")),
  );

  yield* UserEntity.insert(
    { id: "new-1", name: "New User", email: "new@example.com" },
    { condition: cond },
  );
});
```

---

## Transactions

Execute multiple operations atomically. All succeed or all fail.

```typescript
const program = Effect.gen(function* () {
  // Create transaction operations (not executed yet)
  const insertOp = yield* UserEntity.insertOp({
    id: "txn-1",
    name: "Transaction User",
    email: "txn@example.com",
  });

  const updateOp = yield* UserEntity.updateOp(
    { id: "existing-user" },
    { status: "processed" },
  );

  // For DynamoTable, use opPutItem/opUpdateItem
  const tableOp = table.opPutItem({
    pk: "AUDIT#txn-1",
    sk: "LOG",
    action: "user_created",
    timestamp: new Date().toISOString(),
  });

  // Execute all atomically
  yield* table.transact([insertOp, updateOp, tableOp]);
});
```

**Transaction limits:**
- Maximum 100 items per transaction
- Maximum 4 MB total size
- Only Put and Update operations (no Delete in transactions)

---

## Gotchas

### 1. Primary Key Must Have Both PK and SK

This library only supports composite primary keys. Single partition key tables are not supported.

```typescript
// Supported
.primary("pk", "sk")

// NOT supported - will not work
.primary("pk")
```

### 2. Keys Are Always Strings

All key attributes (pk, sk, GSI keys) must be strings. Number and binary key types are not supported.

```typescript
// Correct
yield* table.putItem({ pk: "USER#123", sk: "PROFILE", ... });

// Wrong - number keys won't work
yield* table.putItem({ pk: 123, sk: 456, ... });
```

### 3. Dates Must Be Converted to Strings

The marshaller doesn't handle JavaScript `Date` objects. Convert to ISO strings.

```typescript
// Wrong - will marshal as empty object
yield* table.putItem({ createdAt: new Date() });

// Correct
yield* table.putItem({ createdAt: new Date().toISOString() });
```

### 4. GSI Column Naming Convention

When using `DynamoEntity` with `.index()`, the library writes to columns named `{indexName}PK` and `{indexName}SK`. Your DynamoDB table must be configured with matching GSI column names.

```typescript
// Table definition
.gsi("byEmail", "byEmailPK", "byEmailSK")

// Entity will write derived keys to byEmailPK and byEmailSK columns
.index("byEmail", {
  pk: { deps: ["email"], derive: (v) => [`EMAIL#${v.email}`] },
  sk: { deps: ["id"], derive: (v) => [v.id] },
})
```

### 5. No Automatic Retries

The library doesn't retry on throttling. Handle `ThrottlingException` yourself.

```typescript
import { Schedule, Effect } from "effect";

const withRetry = UserEntity.get({ id: "123" }).pipe(
  Effect.retry(
    Schedule.exponential("100 millis").pipe(Schedule.compose(Schedule.recurs(3))),
  ),
);
```

### 6. Eventual Consistency by Default

Reads are eventually consistent. Use `ConsistentRead: true` for strong consistency (2x read cost).

```typescript
yield* UserEntity.get({ id: "123" }, { ConsistentRead: true });
yield* table.getItem({ pk: "...", sk: "..." }, { ConsistentRead: true });
```

### 7. Entity _v Field Is Automatic

Don't include `_v` in insert data - it's set automatically from your schema version.

```typescript
// Correct
yield* UserEntity.insert({ id: "123", name: "Alice", email: "a@b.com" });

// Wrong - _v is managed by the library
yield* UserEntity.insert({ id: "123", name: "Alice", email: "a@b.com", _v: "v1" });
```

### 8. Key Derivation Returns Array

The `derive` function must return an array of primitives. Multiple values are joined with `#`.

```typescript
// Single part key
pk: { deps: ["id"], derive: (v) => [`USER#${v.id}`] }
// Result: "USER#123"

// Multi-part key (joined with #)
sk: { deps: ["type", "date"], derive: (v) => [v.type, v.date] }
// Result: "ORDER#2024-01-15"
```

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
