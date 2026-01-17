# Effect DynamoDB Documentation

## Table of Contents

- [Getting Started](#getting-started)
- [Core Concepts](#core-concepts)
- [DynamoTable API](#dynamotable-api)
- [DynamoEntity API](#dynamoentity-api)
- [Query Operations](#query-operations)
- [Index Operations](#index-operations)
- [Schema Evolution](#schema-evolution)
- [Advanced Usage](#advanced-usage)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Getting Started

### Installation

```bash
npm install effect-dynamodb @monorepo/eschema effect
```

### Basic Setup

```typescript
import { ESchema } from '@monorepo/eschema';
import { Effect, Schema } from 'effect';
import { DynamoEntity, DynamoTable } from 'effect-dynamodb';

// Configure DynamoDB connection
const dynamoConfig = {
  region: 'us-east-1',
  accessKey: process.env.AWS_ACCESS_KEY!,
  secretKey: process.env.AWS_SECRET_KEY!,
  // Optional: for local DynamoDB
  // endpoint: 'http://localhost:8000',
};
```

### Environment Variables

Create a `.env` file:

```env
AWS_ACCESS_KEY=your_access_key
AWS_SECRET_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_TABLE_NAME=your_table_name
```

## Core Concepts

### Two-Layer Architecture

Effect DynamoDB provides two levels of abstraction:

1. **DynamoTable**: Direct table operations with type safety
2. **DynamoEntity**: Schema-aware operations with automatic migrations

### Key Concepts

- **Primary Keys**: Partition key (required) and sort key (optional)
- **Secondary Indexes**: GSI (Global) and LSI (Local) support
- **Schema Evolution**: Automatic data evolution using ESchema
- **Type Safety**: Full TypeScript inference across all operations

## DynamoTable API

### Creating a Table

```typescript
const table = DynamoTable.make('my-table', dynamoConfig)
  .primary('pk', 'sk') // Composite primary key
  .gsi('GSI1', 'gsi1pk', 'gsi1sk') // Global secondary index
  .gsi('GSI2', 'gsi2pk') // GSI with partition key only
  .lsi('LSI1', 'lsi1sk') // Local secondary index
  .build();
```

### Basic CRUD Operations

```typescript
// Put item
const putResult = await Effect.runPromise(
  table.putItem({
    pk: 'USER#123',
    sk: 'PROFILE',
    name: 'John Doe',
    email: 'john@example.com',
  }),
);

// Get item
const getResult = await Effect.runPromise(
  table.getItem({ pk: 'USER#123', sk: 'PROFILE' }),
);

// Update item
const updateResult = await Effect.runPromise(
  table.updateItem(
    { pk: 'USER#123', sk: 'PROFILE' },
    {
      update: {
        SET: {
          name: { op: 'assign', value: 'John Smith' },
          lastUpdated: { op: 'assign', value: new Date().toISOString() },
        },
      },
      ReturnValues: 'ALL_NEW',
    },
  ),
);

// Delete item
const deleteResult = await Effect.runPromise(
  table.deleteItem({ pk: 'USER#123', sk: 'PROFILE' }),
);
```

### Query Operations

```typescript
// Query by partition key
const queryResult = await Effect.runPromise(
  table.query({
    pk: 'USER#123',
  }),
);

// Query with sort key condition
const queryWithSk = await Effect.runPromise(
  table.query({
    pk: 'USER#123',
    sk: { beginsWith: 'ORDER#' },
  }),
);

// Query with filters and projection
const filteredQuery = await Effect.runPromise(
  table.query(
    {
      pk: 'USER#123',
    },
    {
      filter: { status: { '=': 'active' } },
      projection: ['pk', 'sk', 'name', 'email'],
      Limit: 10,
    },
  ),
);
```

### Index Operations

```typescript
// Query GSI
const gsiResult = await Effect.runPromise(
  table.index('GSI1').query({
    pk: 'EMAIL#john@example.com',
  }),
);

// Query LSI
const lsiResult = await Effect.runPromise(
  table.index('LSI1').query({
    pk: 'USER#123',
    sk: { '>': '2024-01-01' },
  }),
);
```

## DynamoEntity API

### Creating an Entity

```typescript
// Define your schema
const UserSchema = ESchema.make(
  'v1',
  Schema.Struct({
    userId: Schema.String,
    email: Schema.String,
    name: Schema.String,
    age: Schema.optional(Schema.Number),
    createdAt: Schema.String,
    updatedAt: Schema.optional(Schema.String),
  }),
).build();

// Create entity with key mappings
const UserEntity = DynamoEntity.make(table, UserSchema)
  .primary({
    pk: {
      schema: UserSchema.schema.pick('userId'),
      fn: ({ userId }) => `USER#${userId}`,
    },
    sk: {
      schema: Schema.Struct({}),
      fn: () => 'PROFILE',
    },
  })
  .index('GSI1', {
    pk: {
      schema: UserSchema.schema.pick('email'),
      fn: ({ email }) => `EMAIL#${email}`,
    },
  })
  .build();
```

### Entity CRUD Operations

```typescript
// Create a user
const user = {
  userId: '123',
  email: 'john@example.com',
  name: 'John Doe',
  age: 30,
  createdAt: new Date().toISOString(),
};

const createResult = await Effect.runPromise(UserEntity.putItem(user));

// Get user
const getResult = await Effect.runPromise(
  UserEntity.getItem({ userId: '123' }),
);

// Update user
const updateResult = await Effect.runPromise(
  UserEntity.updateItem(
    { userId: '123' },
    {
      update: {
        SET: {
          name: { op: 'assign', value: 'John Smith' },
          updatedAt: { op: 'assign', value: new Date().toISOString() },
        },
      },
      ReturnValues: 'ALL_NEW',
    },
  ),
);

// Delete user
const deleteResult = await Effect.runPromise(
  UserEntity.delete({ userId: '123' }),
);
```

## Query Operations

### Basic Queries

```typescript
// Query by partition key
const users = await Effect.runPromise(
  UserEntity.query({
    pk: { userId: '123' },
  }),
);

// Query with sort key conditions
const orders = await Effect.runPromise(
  OrderEntity.query({
    pk: { customerId: 'customer-123' },
    sk: { beginsWith: 'ORDER#2024' },
  }),
);
```

### Advanced Query Conditions

```typescript
// Between condition
const dateRangeOrders = await Effect.runPromise(
  OrderEntity.query({
    pk: { customerId: 'customer-123' },
    sk: { between: ['2024-01-01', '2024-12-31'] },
  }),
);

// Comparison operators
const recentOrders = await Effect.runPromise(
  OrderEntity.query({
    pk: { customerId: 'customer-123' },
    sk: { '>': '2024-06-01' },
  }),
);
```

### Query Options

```typescript
// With filters
const activeUsers = await Effect.runPromise(
  UserEntity.query(
    { pk: { userId: '123' } },
    {
      filter: {
        status: { '=': 'active' },
        age: { '>': 18 },
      },
    },
  ),
);

// With projection
const userNames = await Effect.runPromise(
  UserEntity.query(
    { pk: { userId: '123' } },
    {
      projection: ['userId', 'name', 'email'],
    },
  ),
);

// With limit and pagination
const pagedUsers = await Effect.runPromise(
  UserEntity.query(
    { pk: { userId: '123' } },
    {
      Limit: 10,
      ConsistentRead: true,
    },
  ),
);
```

## Index Operations

### Global Secondary Index (GSI)

```typescript
// Define entity with GSI
const ProductEntity = DynamoEntity.make(table, ProductSchema)
  .primary({
    pk: {
      schema: ProductSchema.schema.pick('productId'),
      fn: ({ productId }) => `PRODUCT#${productId}`,
    },
    sk: {
      schema: ProductSchema.schema.pick('sku'),
      fn: ({ sku }) => `SKU#${sku}`,
    },
  })
  .index('CategoryIndex', {
    pk: {
      schema: ProductSchema.schema.pick('categoryId'),
      fn: ({ categoryId }) => `CATEGORY#${categoryId}`,
    },
    sk: {
      schema: ProductSchema.schema.pick('price'),
      fn: ({ price }) => `PRICE#${price.toString().padStart(10, '0')}`,
    },
  })
  .build();

// Query by category
const categoryProducts = await Effect.runPromise(
  ProductEntity.index('CategoryIndex').query({
    pk: { categoryId: 'electronics' },
  }),
);

// Query with price range
const expensiveElectronics = await Effect.runPromise(
  ProductEntity.index('CategoryIndex').query({
    pk: { categoryId: 'electronics' },
    sk: { '>': 'PRICE#0000001000' }, // Price > $100
  }),
);
```

### Local Secondary Index (LSI)

```typescript
// LSI shares partition key with main table
const OrderEntity = DynamoEntity.make(table, OrderSchema)
  .primary({
    pk: {
      schema: OrderSchema.schema.pick('customerId'),
      fn: ({ customerId }) => `CUSTOMER#${customerId}`,
    },
    sk: {
      schema: OrderSchema.schema.pick('orderId'),
      fn: ({ orderId }) => `ORDER#${orderId}`,
    },
  })
  .index('DateIndex', {
    pk: {
      schema: OrderSchema.schema.pick('customerId'),
      fn: ({ customerId }) => `CUSTOMER#${customerId}`,
    },
    sk: {
      schema: OrderSchema.schema.pick('orderDate'),
      fn: ({ orderDate }) => `DATE#${orderDate}`,
    },
  })
  .build();

// Query orders by date
const ordersByDate = await Effect.runPromise(
  OrderEntity.index('DateIndex').query({
    pk: { customerId: 'customer-123' },
    sk: { between: ['DATE#2024-01-01', 'DATE#2024-12-31'] },
  }),
);
```

## Schema Evolution

### Version Management

```typescript
// Version 1 schema
const UserSchemaV1 = ESchema.make(
  'v1',
  Schema.Struct({
    userId: Schema.String,
    name: Schema.String,
    email: Schema.String,
  }),
).build();

// Version 2 schema with evolution
const UserSchemaV2 = ESchema.make(
  'v1',
  Schema.Struct({
    userId: Schema.String,
    name: Schema.String,
    email: Schema.String,
  }),
)
  .evolve(
    'v2',
    ({ v1 }) =>
      Schema.Struct({
        ...v1.fields,
        firstName: Schema.String, // Split from name
        lastName: Schema.String, // Split from name
        phoneNumber: Schema.optional(Schema.String), // New optional field
      }),
    (value, v) =>
      v({
        userId: value.userId,
        firstName: value.name.split(' ')[0] || value.name,
        lastName: value.name.split(' ').slice(1).join(' ') || '',
        email: value.email,
        phoneNumber: undefined,
      }),
  )
  .build();
```

### Using Evolved Schemas

```typescript
// Entity automatically handles evolution
const UserEntity = DynamoEntity.make(table, UserSchemaV2)
  .primary({
    pk: {
      schema: UserSchemaV2.schema.pick('userId'),
      fn: ({ userId }) => `USER#${userId}`,
    },
    sk: {
      schema: Schema.Struct({}),
      fn: () => 'PROFILE',
    },
  })
  .build();

// Old v1 data is automatically evolved when retrieved
const user = await Effect.runPromise(UserEntity.getItem({ userId: '123' }));
// user.Item will have the v2 schema structure
```

## Advanced Usage

### Update Expressions

```typescript
// Complex update operations
const updateResult = await Effect.runPromise(
  UserEntity.updateItem(
    { userId: '123' },
    {
      update: {
        SET: {
          // Simple assignment
          status: { op: 'assign', value: 'active' },

          // Conditional assignment
          loginCount: { op: 'if_not_exists', attr: 'loginCount', default: 0 },

          // Math operations
          score: { op: 'plus', attr: 'currentScore', value: 10 },

          // List operations
          tags: { op: 'list_append', attr: 'existingTags', list: ['new-tag'] },
        },
        ADD: {
          // Increment numbers
          loginCount: 1,
          // Add to sets
          viewedItems: new Set(['item-1', 'item-2']),
        },
        REMOVE: ['temporaryField', 'oldAttribute'],
        DELETE: {
          // Remove from sets
          oldTags: new Set(['deprecated-tag']),
        },
      },
      condition: {
        // Only update if user exists and is not deleted
        userId: { exists: true },
        status: { '<>': 'deleted' },
      },
      ReturnValues: 'ALL_NEW',
    },
  ),
);
```

### Filter Expressions

```typescript
// Complex filter conditions
const filteredUsers = await Effect.runPromise(
  UserEntity.query(
    { pk: { userId: '123' } },
    {
      filter: {
        // Comparison operators
        age: { '>=': 18, '<=': 65 },

        // String operations
        name: { beginsWith: 'John' },
        email: { contains: '@company.com' },

        // Attribute existence
        phoneNumber: { exists: true },

        // Attribute type checking
        metadata: { attrType: 'M' },

        // Size operations for lists/strings
        tags: { size: { '>': 0 } },

        // Multiple conditions (implicit AND)
        status: { '=': 'active' },
        verified: { '=': true },
      },
    },
  ),
);
```

### Batch Operations

```typescript
// Note: Batch operations are handled at the table level
const batchPutResult = await Effect.runPromise(
  Effect.all([
    UserEntity.putItem(user1),
    UserEntity.putItem(user2),
    UserEntity.putItem(user3),
  ]),
);
```

## Error Handling

### Effect Error Handling

```typescript
import { Console, Effect } from 'effect';

const safeUserOperation = Effect.gen(function* () {
  try {
    const user = yield* UserEntity.getItem({ userId: '123' });

    if (user.Item === null) {
      yield* Console.log('User not found');
      return null;
    }

    return user.Item;
  } catch (error) {
    yield* Console.error('Failed to get user:', error);
    return null;
  }
});

// Run with error handling
const result = await Effect.runPromise(safeUserOperation);
```

### Conditional Operations

```typescript
// Conditional put (only if item doesn't exist)
const conditionalCreate = Effect.gen(function* () {
  try {
    const result = yield* UserEntity.putItem(newUser, {
      condition: {
        userId: { exists: false },
      },
    });
    return { success: true, result };
  } catch (error) {
    return { success: false, error: 'User already exists' };
  }
});
```

## Best Practices

### 1. Key Design

```typescript
// Good: Use hierarchical keys
const UserEntity = DynamoEntity.make(table, UserSchema)
  .primary({
    pk: {
      schema: UserSchema.schema.pick('userId'),
      fn: ({ userId }) => `USER#${userId}`,
    },
    sk: {
      schema: Schema.Struct({ type: Schema.literal('profile') }),
      fn: () => 'PROFILE',
    },
  })
  .build();
```

### 2. Index Design

```typescript
// Design indexes for your query patterns
const ProductEntity = DynamoEntity.make(table, ProductSchema)
  .primary({
    pk: {
      /* ... */
    },
    sk: {
      /* ... */
    },
  })
  // Query by category and price
  .index('CategoryPriceIndex', {
    pk: {
      schema: ProductSchema.schema.pick('categoryId'),
      fn: ({ categoryId }) => `CATEGORY#${categoryId}`,
    },
    sk: {
      schema: ProductSchema.schema.pick('price'),
      fn: ({ price }) => `PRICE#${price.toString().padStart(10, '0')}`,
    },
  })
  // Query by brand and creation date
  .index('BrandDateIndex', {
    pk: {
      schema: ProductSchema.schema.pick('brandId'),
      fn: ({ brandId }) => `BRAND#${brandId}`,
    },
    sk: {
      schema: ProductSchema.schema.pick('createdAt'),
      fn: ({ createdAt }) => `DATE#${createdAt}`,
    },
  })
  .build();
```

### 3. Schema Design

```typescript
// Use optional fields for backward compatibility
const UserSchema = ESchema.make(
  'v1',
  Schema.Struct({
    // Required fields
    userId: Schema.String,
    email: Schema.String,

    // Optional fields for flexibility
    name: Schema.optional(Schema.String),
    age: Schema.optional(Schema.Number),
    preferences: Schema.optional(
      Schema.Struct({
        newsletter: Schema.Boolean,
        theme: Schema.String,
      }),
    ),
  }),
).build();
```

### 4. Error Handling

```typescript
// Always handle potential errors
function getUserSafely(userId: string) {
  return Effect.gen(function* () {
    const result = yield* UserEntity.getItem({ userId }).pipe(
      Effect.catchAll((error) =>
        Effect.succeed({ Item: null, error: error.message }),
      ),
    );

    return result;
  });
}
```

## Examples

### E-commerce Application

```typescript
// Product catalog with category and price queries
const ProductEntity = DynamoEntity.make(table, ProductSchema)
  .primary({
    pk: {
      schema: ProductSchema.schema.pick('productId'),
      fn: ({ productId }) => `PRODUCT#${productId}`,
    },
    sk: {
      schema: Schema.Struct({}),
      fn: () => 'DETAILS',
    },
  })
  .index('CategoryIndex', {
    pk: {
      schema: ProductSchema.schema.pick('categoryId'),
      fn: ({ categoryId }) => `CATEGORY#${categoryId}`,
    },
    sk: {
      schema: ProductSchema.schema.pick('price'),
      fn: ({ price }) => `PRICE#${price.toString().padStart(10, '0')}`,
    },
  })
  .build();

// Customer orders with date-based queries
const OrderEntity = DynamoEntity.make(table, OrderSchema)
  .primary({
    pk: {
      schema: OrderSchema.schema.pick('customerId'),
      fn: ({ customerId }) => `CUSTOMER#${customerId}`,
    },
    sk: {
      schema: OrderSchema.schema.pick('orderId'),
      fn: ({ orderId }) => `ORDER#${orderId}`,
    },
  })
  .index('DateIndex', {
    pk: {
      schema: OrderSchema.schema.pick('customerId'),
      fn: ({ customerId }) => `CUSTOMER#${customerId}`,
    },
    sk: {
      schema: OrderSchema.schema.pick('orderDate'),
      fn: ({ orderDate }) => `DATE#${orderDate}`,
    },
  })
  .build();
```

### User Management System

```typescript
// Users with email-based lookup
const UserEntity = DynamoEntity.make(table, UserSchema)
  .primary({
    pk: {
      schema: UserSchema.schema.pick('userId'),
      fn: ({ userId }) => `USER#${userId}`,
    },
    sk: {
      schema: Schema.Struct({}),
      fn: () => 'PROFILE',
    },
  })
  .index('EmailIndex', {
    pk: {
      schema: UserSchema.schema.pick('email'),
      fn: ({ email }) => `EMAIL#${email}`,
    },
  })
  .build();

// User sessions
const SessionEntity = DynamoEntity.make(table, SessionSchema)
  .primary({
    pk: {
      schema: SessionSchema.schema.pick('userId'),
      fn: ({ userId }) => `USER#${userId}`,
    },
    sk: {
      schema: SessionSchema.schema.pick('sessionId'),
      fn: ({ sessionId }) => `SESSION#${sessionId}`,
    },
  })
  .build();
```

This documentation provides a comprehensive guide to using effect-dynamodb effectively. For more specific use cases or advanced patterns, refer to the test suite and example implementations in the repository.

