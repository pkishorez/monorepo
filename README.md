# Open Source Collection Monorepo

A monorepo containing all my open-source packages and projects, currently focused on TypeScript libraries for Effect.TS, DynamoDB, and React.

## Overview

Managing multiple projects can be a nightmare, with dependencies falling out of sync and inconsistent tooling across repositories. This monorepo provides an easier way to manage multiple related packages, keep dependencies up-to-date, and maintain consistent development practices across all projects.

Built with modern tooling and best practices, it provides a unified development experience across all projects and technologies.

## Packages

### [use-effect-ts](./packages/use-effect-ts)
**React hooks for Effect.TS integration**

React hooks for seamless integration with Effect.TS, providing lifecycle-aware hooks for managing Effect computations within React components. Enables functional reactive programming patterns in React applications.

**Links**: [Package](./packages/use-effect-ts) | [npm](https://www.npmjs.com/package/use-effect-ts)

### [effect-dynamodb](./packages/effect-dynamodb)
**Type-safe DynamoDB operations with schema evolution**

A comprehensive DynamoDB library built on Effect.TS that provides type-safe table operations and entity management with evolving schema support. Features include fluent table configuration, comprehensive CRUD operations, and schema validation with automatic data migration.

**Links**: [Package](./packages/effect-dynamodb) | [npm](https://www.npmjs.com/package/effect-dynamodb)

### [dynamodb-client](./packages/dynamodb-client)
**Lightweight DynamoDB client for Effect.TS**

A specialized TypeScript DynamoDB client built with Effect.TS, providing type-safe DynamoDB operations through code generation from AWS Smithy specifications. Inspired by the [itty-aws](https://github.com/itty-dev/itty-aws) package, this client is optimized specifically for DynamoDB using only the AWS JSON 1.0 protocol.

**Links**: [Package](./packages/dynamodb-client) | [npm](https://www.npmjs.com/package/dynamodb-client)

### [@monorepo/eschema](./packages/eschema)
**Schema evolution system for Effect.TS**

A TypeScript library for schema evolution using Effect.TS. Provides a builder pattern for creating versioned schemas that can evolve over time while maintaining backward compatibility. Essential for applications that need to handle data migrations and schema versioning.

**Links**: [Package](./packages/eschema) | [npm](https://www.npmjs.com/package/@monorepo/eschema)

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 8+

### Installation

```bash
# Install all dependencies
pnpm install
```

### Development

```bash
# Build all packages
pnpm -r build

# Run development mode for a specific package
pnpm --filter <package-name> dev

# Type check a specific package
pnpm --filter <package-name> lint

# Run command in all packages
pnpm -r <command>
```

## Project Structure

```
monorepo/
├── packages/              # All npm packages
│   ├── use-effect-ts/     # React hooks for Effect.TS
│   ├── effect-dynamodb/   # Type-safe DynamoDB operations
│   ├── dynamodb-client/   # Lightweight DynamoDB client
│   └── eschema/           # Schema evolution system
└── pnpm-workspace.yaml    # Workspace configuration
```

## Contributing

This repository contains open-source packages. While contributions are welcome, please check individual package documentation for specific contribution guidelines. Bug reports and feature suggestions can be submitted through GitHub issues.

## License

Each package may have its own license. See the individual package directories for specific licensing information.

