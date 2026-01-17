# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Build the package
npm run build

# Type checking (lint)
npm run lint

# Development mode with watch
npm run dev

# Run tests
npm run test

# Run tests once (CI mode)
npm run test:run

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Architecture Overview

This package provides Effect IDB - a type-safe IndexedDB wrapper with evolving schema support for Effect-based applications.

### Core Concepts

**Evolving Schema (ESchema)**: Unlike traditional schemas that are snapshots in time, evolving schemas can transform data across different versions over time. This is essential for persistent data where the schema needs to evolve without losing existing data.

**Type-Safe IndexedDB Access**: Provides a strongly-typed interface to IndexedDB collections with full Effect integration for error handling and async operations.

### Key Components

#### ESchema (`eschema.ts`)
- `ESchema.make(version, schema)` - Creates initial schema version
- `.evolve(version, { transformSchema, transformValue })` - Adds new schema version with migration logic
  - `transformSchema` - Either a direct Schema or function `(oldSchema) => newSchema`
  - `transformValue` - Function `(oldValue) => newValue` for data migration
- `.build()` - Finalizes the evolving schema
- `getValue(value)` - Retrieves data, applying migrations from stored version to latest
- `validateLatest(value)` - Validates data against latest schema version

#### Database Operations (`index.ts`)
- `createDatabase(dbName, dbSchema, version)` - Creates database with schema definitions
- `storeSchema({ schema, key, indexMap })` - Defines store structure with ESchema, primary key, and indexes
- `deleteDatabase(dbName)` - Removes entire database

#### Store Operations
Each store provides:
- `getItem(key)` - Retrieve single item
- `addItem(item)` - Add new item
- `upsertItem(item)` - Insert or update item
- `updateItem(key, updates)` - Partial update by key
- `deleteItem(key)` - Remove item
- `getAll()` - Retrieve all items
- `getAllKeys()` - Get all primary keys
- `indexes.{indexName}.getItems(key)` - Query by index
- Subscription methods: `subscribeItem`, `subscribeKeys`, `subscribeAll`

### Dependencies

- **Effect**: Core effect system for async operations and error handling
- **idb**: Jake Archibald's IndexedDB wrapper for better browser API
- **@standard-schema/spec**: Schema validation specification

### Testing

The package uses **Vitest** for testing with the following setup:
- **fake-indexeddb**: Provides IndexedDB polyfill for Node.js testing environment
- **@vitest/coverage-v8**: Code coverage reporting
- Tests are located in the `test/` directory
- Test files should use `.test.ts` or `.spec.ts` extensions
- Setup file: `test/setup.ts` - configures fake IndexedDB and test isolation

### Schema Evolution Example

```typescript
const userSchema = ESchema.make('v1', Schema.Struct({ 
  id: Schema.String, 
  name: Schema.String 
}))
.evolve('v2', {
  // Option 1: Function approach (builds on previous schema)
  transformSchema: (schema) => Schema.extend(schema, Schema.Struct({ 
    email: Schema.String 
  })),
  transformValue: (old) => ({ ...old, email: 'default@example.com' })
})
.evolve('v3', {
  // Option 2: Direct schema approach (completely new schema)
  transformSchema: Schema.Struct({
    id: Schema.String,
    fullName: Schema.String,
    email: Schema.String,
    isActive: Schema.Boolean
  }),
  transformValue: (old) => ({ 
    id: old.id, 
    fullName: old.name, 
    email: old.email,
    isActive: true 
  })
})
.build();
```

The package automatically handles data migration when retrieving stored values, ensuring backward compatibility while enabling schema evolution.