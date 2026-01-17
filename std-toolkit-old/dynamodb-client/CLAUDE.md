# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

A specialized TypeScript DynamoDB client package built with Effect.TS, providing type-safe DynamoDB operations through code generation from AWS Smithy specifications. The package generates strongly-typed interfaces from AWS service models and integrates with the Effect ecosystem for functional error handling and composability. This client is optimized specifically for DynamoDB, using only the AWS JSON 1.0 protocol.

## Commands

> **Important**: Always run `pnpm lint` to ensure both TypeScript type safety and ESLint code quality checks.

### Development
```bash
# Watch mode for TypeScript compilation
pnpm dev

# Build the package
pnpm build

# Linting and type checking
pnpm lint        # Runs both TypeScript and ESLint checks
pnpm lint:tsc    # TypeScript type checking only
pnpm lint:eslint # ESLint code quality checks only

# Run tests (requires local DynamoDB)
pnpm test          # Watch mode with verbose output
pnpm test:run      # Single run with verbose output
pnpm test:watch    # Watch mode
pnpm test:coverage # Coverage report
```

### Code Generation
```bash
# Generate DynamoDB types from Smithy specs (fetches from GitHub)
bun scripts/generate.ts [output-path]

# Default: generates src/services/dynamodb/types.ts and src/services/dynamodb/types.spec.json
bun scripts/generate.ts

# Custom output path: generates both .ts and .spec.json files
bun scripts/generate.ts src/types/dynamodb.ts  # Creates dynamodb.ts and dynamodb.spec.json
```

## Architecture

### Package Structure
```
dynamodb-client/
├── src/
│   ├── client.ts         # DynamoDB-specific AWS client implementation
│   ├── error.ts          # Common AWS error types
│   ├── index.ts          # Package entry point with exports
│   └── services/
│       └── dynamodb/
│           └── types.ts  # Generated DynamoDB types
├── scripts/              # Build-time scripts and tooling
│   ├── generate.ts       # CLI entry point for code generation
│   └── generate/         # Code generation modules
│       ├── code-generator.ts    # TypeScript code generation functions
│       ├── generator.ts         # Main generation orchestration
│       ├── index.ts             # Generation API exports
│       ├── manifest-loader.ts   # AWS Smithy spec loading
│       ├── schemas.ts           # Smithy manifest type definitions
│       └── type-mapper.ts       # Type mapping utilities
├── dist/                 # Compiled output
├── tests/                # Test files (when added)
│   └── setup.ts          # Test setup configuration
├── build.tsconfig.json   # Build-specific TypeScript config
├── tsconfig.json         # Main TypeScript configuration
└── vitest.config.ts      # Test configuration
```

### Technical Stack
- **Effect**: Core functional programming library (3.17.7)
- **TypeScript**: 5.9.2 with strict mode and exact optional properties
- **Module System**: ESM modules with Node.js module resolution
- **Testing**: Vitest with globals enabled and coverage reporting
- **Node Version**: Configured for Node.js 22

### Code Generation Architecture

The `generate.ts` file is a sophisticated code generator that:
1. **Parses Smithy Manifests**: Reads AWS Smithy JSON specifications to understand service structure
2. **Type Mapping**: Converts Smithy types to TypeScript/Effect types with proper nullable handling
3. **Error Classes**: Generates Effect.Data.TaggedError classes for AWS errors
4. **Service Interface**: Creates a typed DynamoDB service class extending AWSServiceClient
5. **Operation Namespaces**: Generates namespaces for each operation with Input/Output/Error types
6. **Stream Support**: Handles streaming operations for blob fields where applicable

Key features:
- Handles TypeScript reserved words by prefixing with "DynamoDB"
- Supports documentation extraction from Smithy traits
- Generates union types for Smithy unions
- Creates proper Record types for Smithy maps
- Handles optional fields based on smithy.api#required trait

### Dependencies Structure
- **Runtime**: 
  - Effect library for functional programming
  - @aws-sdk/credential-providers for AWS credential chain resolution
  - aws4fetch for AWS Signature V4 request signing
- **Development**: 
  - @effect/platform and @effect/platform-node for file system and HTTP operations
  - @tsconfig/node22 for TypeScript configuration
  - Vitest for testing with coverage support

### Client Architecture

The client uses a streamlined architecture optimized for DynamoDB:
1. **Protocol**: AWS JSON 1.0 protocol exclusively (DynamoDB's native protocol)
2. **Request Handling**: Direct JSON serialization with X-Amz-Target headers
3. **Error Handling**: Typed errors using Effect's TaggedError pattern
4. **Proxy Pattern**: Dynamic method invocation converting camelCase to PascalCase operations
5. **Credentials**: Supports both explicit credentials and AWS credential chain

### Testing Configuration
- **Test Runner**: Vitest with forked processes for isolation
- **Setup**: Uses `tests/setup.ts` for test initialization
- **Coverage**: V8 provider with HTML, JSON, and text reporters
- **Timeout**: 10-second timeout for integration tests
- **Console Filtering**: Suppresses setup logs while keeping test output

## Key Considerations

### Code Generation
- The generator fetches specs directly from the AWS GitHub repository
- Generates both TypeScript types (.ts) and saves the raw spec file (.spec.json) alongside
- Generated types import from `../../error.ts` and `../../client.ts` (ensure these exist)
- Stream support requires @effect/platform/HttpClientError for ResponseError type
- Buffer support is included for input shapes that accept streaming data
- The generator automatically uses the latest DynamoDB API version (2012-08-10) from GitHub

### Type Safety
- All generated interfaces preserve exact field requirements from Smithy specs
- Union types properly model Smithy union shapes with mutually exclusive fields
- Error types extend EffectData.TaggedError for proper Effect integration
- Operations return Effect.Effect with typed success and error channels

### Development Workflow
1. Run the generator to fetch and process DynamoDB Smithy specs
2. Build the package to compile TypeScript to JavaScript
3. Run linting checks to ensure code quality:
   - `pnpm lint` for both TypeScript and ESLint checks
4. Use the `createDynamoDB` function to instantiate a typed client
5. Leverage Effect's error handling for AWS service errors

### Usage Example
```typescript
import { createDynamoDB } from "dynamodb-client";
import { Effect } from "effect";

const dynamodb = createDynamoDB({ 
  region: "us-west-2",
  // credentials are optional - uses AWS credential chain by default
});

// List tables with Effect
const program = dynamodb.listTables({ Limit: 10 });

// Execute the Effect
const result = await Effect.runPromise(program);
```