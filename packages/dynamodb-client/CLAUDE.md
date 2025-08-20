# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

A specialized TypeScript DynamoDB client package built with Effect.TS, providing type-safe DynamoDB operations through code generation from AWS Smithy specifications. The package generates strongly-typed interfaces from AWS service models and integrates with the Effect ecosystem for functional error handling and composability. This client is optimized specifically for DynamoDB, using only the AWS JSON 1.0 protocol.

## Commands

### Development
```bash
# Watch mode for TypeScript compilation
pnpm dev

# Build the package
pnpm build

# Type checking
pnpm lint

# Run tests
pnpm test          # Watch mode with verbose output
pnpm test:run      # Single run with verbose output
pnpm test:watch    # Watch mode
pnpm test:coverage # Coverage report
```

### Code Generation
```bash
# Generate DynamoDB types from Smithy specs (fetches from GitHub)
bun src/generate.ts [output-path]

# Default: Fetch from GitHub, output to src/services/dynamodb/types.ts
bun src/generate.ts

# Custom output path
bun src/generate.ts src/types/dynamodb.ts

# Use local specs if available (fallback to GitHub if not found)
bun src/generate.ts --local
```

## Architecture

### Package Structure
```
dynamodb-client/
├── src/
│   ├── client.ts         # DynamoDB-specific AWS client implementation
│   ├── error.ts          # Common AWS error types
│   ├── generate.ts       # Smithy-to-TypeScript code generator
│   ├── index.ts          # Package entry point with exports
│   └── services/
│       └── dynamodb/
│           └── types.ts  # Generated DynamoDB types
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
- By default, the generator fetches specs directly from the AWS GitHub repository
- Use `--local` flag to load from local `aws-models/models/dynamodb/service/[version]/*.json` if available
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
3. Use the `createDynamoDB` function to instantiate a typed client
4. Leverage Effect's error handling for AWS service errors

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