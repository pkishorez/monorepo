# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Package Manager**: This project uses `pnpm` as the package manager.

- **Install Dependencies**: `pnpm install` - Install all project dependencies
- **Add Dependency**: `pnpm add <package>` - Add runtime dependency
- **Add Dev Dependency**: `pnpm add -D <package>` - Add development dependency
- **Build**: `pnpm run build` - Compile TypeScript to `dist/` directory
- **Lint**: `pnpm run lint` - Type-check without emitting files (runs `tsc --noEmit`)
- **Dev**: `pnpm run dev` - Watch mode compilation with `tsc --watch`
- **Test**: `pnpm run test` - Run tests with Vitest in watch mode
- **Test (CI)**: `pnpm run test:run` - Run tests once and exit
- **Test Coverage**: `pnpm run test:coverage` - Generate test coverage reports

## Architecture Overview

This is an **Effect DynamoDB** library providing type-safe DynamoDB operations with evolving schema support. The architecture follows a two-level abstraction pattern:

### Level 1: DynamoTable
- **Purpose**: Type-safe DynamoDB table configuration and raw operations
- **Location**: `src/table.ts`
- **Key Features**:
  - Fluent builder pattern for table configuration with primary keys, GSIs, and LSIs
  - All DynamoDB operations are typed based on table structure
  - Direct AWS SDK integration with credential management
  - Comprehensive CRUD operations: `getItem`, `putItem`, `updateItem`, `deleteItem`, `query`, `scan`
  - GSI/LSI query and scan operations with type safety

### Level 2: DynamoEntity
- **Purpose**: Schema-aware operations building on DynamoTable
- **Location**: `src/entity.ts`
- **Key Features**:
  - Combines evolving schemas (ESchema) with table operations
  - Effect-based error handling and async operations
  - Schema validation and automatic data migration
  - Multi-entity support (multiple entities can share one table)
  - Type-safe operations based on both table structure AND entity schema

### Key Dependencies
- **Effect**: Core library for async operations and structured error handling
- **ESchema** (`@monorepo/eschema`): Evolving schema system with version management
- **AWS SDK v3**: DynamoDB client and document client for operations

### Typical Usage Pattern

1. **Table Configuration**:
   ```typescript
   const table = DynamoTable.make(tableName, dynamoConfig)
     .primary('pkey', 'skey')           // Composite primary key
     .gsi('GSI1', 'gsi1pk', 'gsi1sk')  // Global secondary index
     .lsi('LSI1', 'lsi1skey')          // Local secondary index
     .build();
   ```

2. **Entity Definition**:
   ```typescript
   const entity = DynamoEntity.make(evolvingSchema, table)
     .pk((id: string) => id)                           // Partition key mapping
     .primary((id: string, version: number) => ({      // Composite key mapping
       pkey: id,
       skey: `v${version}`
     }))
     .build();
   ```

## Testing Framework

- **Test Runner**: Vitest with globals enabled
- **Test Location**: Tests are organized in the `tests/` directory
  - `tests/table.test.ts` - DynamoTable operations and functionality
  - `tests/entity.test.ts` - DynamoEntity integration tests with schema evolution
- **Coverage**: V8 provider with text, JSON, and HTML reports
- **Configuration**: `vitest.config.ts` handles test setup and coverage exclusions

### Test Structure and Guidelines

- **Clean State**: All tests start with a clean DynamoDB table state
- **Setup**: Each test file has `beforeEach` hooks that scan and delete all records
- **No Cleanup**: Tests do not clean up after completion to allow manual inspection of records
- **Environment**: Tests require AWS credentials and table name in environment variables:
  - `AWS_TABLE_NAME` - DynamoDB table name for testing
  - `AWS_ACCESS_KEY` - AWS access key
  - `AWS_SECRET_KEY` - AWS secret key
- **Integration Focus**: Tests verify both table operations and entity schema evolution
- **Real AWS**: Tests run against real DynamoDB (not mocked) for true integration testing

### Running Tests and Linting

- **Lint Check**: `pnpm run lint` - Run TypeScript type checking and linting
- **Test Execution**: `pnpm run test:run` - Execute all tests once and exit (CI mode)
- **Prerequisites**: Tests require valid AWS credentials in environment variables (see Test Structure section above)
- **Environment Setup**: Create `.env` file in project root with AWS credentials
- **Dependencies**: Install `dotenv` for environment variable loading: `pnpm add -D dotenv`
- **Requirement**: Always run lint command before committing changes
- **Note**: Tests will fail with "Resolved credential object is not valid" without proper AWS setup
- **Validation**: Lint must pass; tests are integration tests requiring real AWS DynamoDB

## TypeScript Configuration

- **Base**: Extends `@tsconfig/node22`
- **Target**: ESNext with DOM libraries
- **Module System**: Node.js ESM (`nodenext`)
- **Strict Mode**: Enabled with `exactOptionalPropertyTypes`
- **Output**: Generates declarations and declaration maps in `dist/`

## File Organization Guidelines

### Complex Logic Organization
- **Rule**: Any logic that exceeds 300 lines or contains multiple classes should be moved to its own folder
- **Structure**: Each complex module must have an `index.ts` file that exports public API
- **Implementation**: Internal implementation details stay in separate files within the folder

### Current Structure Example
```
src/
├── index.ts                 (main exports)
├── entity.ts               (single-purpose, stays at root)
└── table/                  (complex module - 400+ lines, multiple classes)
    ├── index.ts           (public exports: DynamoTable, types)
    └── table.ts           (implementation: DynamoTable, DynamoQueryExecutor, builders)
```

### Import Patterns
- **External imports**: Use folder name: `import { DynamoTable } from './table'`
- **Internal imports**: Use explicit file paths: `import { Helper } from './internal-file.js'`

### Benefits
- Clear separation of concerns
- Clean public API surface
- Easy to locate and maintain complex logic
- Extensible for future features

## Implementation Status

- ✅ **Core table operations and type safety**
- ✅ **Entity framework with schema integration**
- ✅ **Effect-based async operations**
- ✅ **Organized file structure with table module**
- 🚧 **Sort key condition expressions** (planned next)
- ❓ **Query filter expressions, batch operations, transactions** (under consideration)

Refer to `ARCHITECTURE.md` for detailed design decisions and implementation roadmap.