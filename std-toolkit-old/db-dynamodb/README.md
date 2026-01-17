# Effect DynamoDB

A powerful, type-safe DynamoDB client for TypeScript built on [Effect](https://effect.website), featuring schema evolution and comprehensive type safety.

## Features

- 🔒 **Full Type Safety** - Complete TypeScript support with inference for table schemas, indexes, and queries
- 🔄 **Schema Evolution** - Built-in support for data migrations and evolving schemas with [ESchema](https://github.com/kishorepolamarasetty/eschema)
- ⚡ **Effect Integration** - Leverages Effect's powerful async operations and error handling
- 🎯 **Two-Layer Architecture** - Clean separation between table operations and entity management
- 🔍 **Rich Query Support** - Comprehensive query operations with filters, projections, and conditions
- 📊 **Index Operations** - Full support for Global Secondary Indexes (GSI) and Local Secondary Indexes (LSI)
- 🧪 **Battle-Tested** - Extensive test suite with real DynamoDB integration tests

## Quick Start

```bash
npm install effect-dynamodb
```

### Basic Usage

```typescript
import { ESchema } from '@monorepo/eschema';
import { Effect, Schema } from 'effect';
// 4. Use the entity for type-safe operations

import { DynamoEntity, DynamoTable } from 'effect-dynamodb';

// 1. Configure your DynamoDB table
const table = DynamoTable.make('users', {
  region: 'us-east-1',
  accessKey: process.env.AWS_ACCESS_KEY,
  secretKey: process.env.AWS_SECRET_KEY,
})
  .primary('pk', 'sk') // Composite primary key
  .gsi('GSI1', 'gsi1pk', 'gsi1sk') // Global secondary index
  .build();

// 2. Define your schema with evolution support
const UserSchema = ESchema.make(
  'v1',
  Schema.Struct({
    userId: Schema.String,
    email: Schema.String,
    name: Schema.String,
    age: Schema.Number,
    createdAt: Schema.String,
  }),
)
  .evolve(
    'v2',
    ({ v1 }) => Schema.Struct({ ...v1.fields, fullName: Schema.String }),
    (value, v) => v({ ...value, fullName: value.name })
  )
  .build();

// 3. Create an entity with key mappings
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

// Create a user
const createUser = Effect.gen(function* () {
  const result = yield* UserEntity.putItem({
    userId: '123',
    email: 'john@example.com',
    name: 'John Doe',
    age: 30,
    createdAt: new Date().toISOString(),
  });
  return result;
});

// Get a user
const getUser = Effect.gen(function* () {
  const result = yield* UserEntity.getItem({ userId: '123' });
  return result.Item;
});

// Query users
const queryUsers = Effect.gen(function* () {
  const result = yield* UserEntity.query({
    pk: { userId: '123' },
  });
  return result.Items;
});

// Query by email using GSI
const findUserByEmail = Effect.gen(function* () {
  const result = yield* UserEntity.index('GSI1').query({
    pk: { email: 'john@example.com' },
  });
  return result.Items[0];
});

// Run the effects
await Effect.runPromise(createUser);
const user = await Effect.runPromise(getUser);
const users = await Effect.runPromise(queryUsers);
const userByEmail = await Effect.runPromise(findUserByEmail);
```

## Architecture

Effect DynamoDB uses a two-layer architecture:

### Layer 1: DynamoTable

- **Purpose**: Type-safe DynamoDB table configuration and operations
- **Features**: Fluent builder pattern, comprehensive CRUD operations, GSI/LSI support
- **Use Case**: When you need direct table access with type safety

### Layer 2: DynamoEntity

- **Purpose**: Schema-aware operations with automatic migrations
- **Features**: Evolving schemas, automatic key derivation, validation
- **Use Case**: When you need entity-level abstractions with schema evolution

## Documentation

For comprehensive documentation, examples, and advanced usage, see [DOCS.md](./DOCS.md).

## Requirements

- Node.js 18+
- TypeScript 5.0+
- AWS DynamoDB (local or cloud)

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

