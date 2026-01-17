# Architecture Decision Record: Effect DynamoDB

## Overview

This library provides a type-safe wrapper around Amazon DynamoDB with two primary levels of abstraction: **Table** and **Entity**. The design philosophy emphasizes type safety, schema evolution, and Effect-based error handling while maintaining flexibility and performance.

## Core Design Decisions

### 1. Two-Level Abstraction Architecture

#### Level 1: DynamoTable
- **Purpose**: Type-safe DynamoDB table configuration and operations
- **Scope**: Provides all possible DynamoDB operations at the table level
- **Type Safety**: Primary keys, sort keys, GSIs, and LSIs are configured at table creation, making all subsequent operations type-safe
- **Operations**: Direct table operations (get, put, update, delete, query, scan) without schema awareness

#### Level 2: DynamoEntity  
- **Purpose**: Schema-aware operations building on top of DynamoTable
- **Scope**: Combines evolving schema with table operations for entity-specific functionality
- **Multi-Entity Support**: Multiple entities can share a single table (common DynamoDB pattern)
- **Type Safety**: Operations are type-safe based on both table structure AND entity schema

### 2. Evolving Schema (ESchema) Integration

**Decision**: Use evolving schemas instead of static schemas
- **Rationale**: Persistent data requires schema evolution over time without data loss
- **Implementation**: ESchema provides version management and automatic data migration
- **Benefit**: Backward compatibility with existing data while enabling schema changes

### 3. Effect-Based Error Handling

**Decision**: Built on Effect ecosystem for async operations and error handling
- **Rationale**: Provides structured error handling, composability, and better async control
- **Integration**: All operations return Effect types for consistent error management


## Architectural Flow

```
Application Code
       ↓
   DynamoEntity (Schema + Type Safety)
       ↓
   DynamoTable (Type-safe DynamoDB Operations)
       ↓
   AWS DynamoDB
```

## Table Configuration

Tables are configured once with full type information:

```typescript
const table = DynamoTable.make(tableName, config)
  .primary('pkey', 'skey')           // Composite primary key
  .gsi('GSI1', 'gsi1pk', 'gsi1sk')  // Global secondary index
  .lsi('LSI1', 'lsi1skey')          // Local secondary index
  .build();
```

This configuration makes all subsequent operations type-safe, preventing runtime errors from incorrect key usage.

## Entity Definition

Entities combine schema with table operations:

```typescript
const entity = DynamoEntity.make(evolvingSchema, table)
  .pk((id: string) => id)                           // Partition key mapping
  .primary((id: string, version: number) => ({      // Composite key mapping
    pkey: id,
    skey: `v${version}`
  }))
  .build();
```

## Implementation Status

### ✅ Completed Features

1. **DynamoTable Configuration**: Type-safe table setup with primary keys, GSIs, and LSIs
2. **Basic Table Operations**: Core CRUD operations (get, put, update, delete, query, scan)
3. **DynamoEntity Framework**: Schema-aware entity operations built on table abstraction
4. **ESchema Integration**: Evolving schema support with automatic data migration
5. **Effect Integration**: All operations return Effect types for structured error handling
6. **Multi-Entity Support**: Multiple entities can share a single table configuration

### 🚧 Next Steps (Planned)

1. **Sort Key Condition Expressions**: 
   - **API Design**: `SortKeyCondition.operation(value)` pattern
   - **Type Safety**: Compile-time validation of condition operations
   - **Supported Operations**: 
     - Equality: `eq(value)`
     - Comparisons: `gt(value)`, `gte(value)`, `lt(value)`, `lte(value)`
     - Range: `between(min, max)`
     - String operations: `beginsWith(prefix)`
   - **Example**: `entity.query('partition-key', { sortKey: SortKeyCondition.beginsWith('user_') })`

### ❓ Open Decisions

1. **Query Filter Expressions**: How to handle filtering beyond sort key conditions
2. **Batch Operations**: Design approach for batch reads and writes
3. **Transaction Support**: Whether and how to implement DynamoDB transactions
4. **Index Query Strategy**: Optimal API for querying GSIs and LSIs
5. **Error Handling Granularity**: Specific error types vs. generic DynamoDB errors
6. **Performance Optimizations**: Connection pooling, request batching, etc.

## Key Benefits

1. **Type Safety**: Compile-time verification of all DynamoDB operations
2. **Schema Evolution**: Automatic data migration without breaking changes  
3. **Multi-Entity Tables**: Support for multiple entity types in single table
4. **Effect Integration**: Structured error handling and async operations
5. **Performance**: Direct DynamoDB operations without unnecessary abstractions
6. **Flexibility**: Focused on core operations with extensible design

## Trade-offs

- **Learning Curve**: Requires understanding of Effect ecosystem
- **Feature Coverage**: Focused on essential operations rather than complete DynamoDB API coverage
- **Complexity**: Two-level abstraction adds conceptual overhead
- **Dependencies**: Tied to Effect and ESchema ecosystems