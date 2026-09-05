# Software factory

Use application guides for setup, placement, and runtime wiring in pnpm monorepos.

Use shared guides for modeling, operations, RPC, and sync.

## Terms

**Contracts** are storage definitions: tables, entities, and schemas; API agreements are RPC definitions.

**Domain** holds optional business concepts and pure rules beyond storage definitions.

**Operations** implement use cases using stored data, external services, or both.

**Shared space** holds capabilities that work on both server and client.

**Sync operations** coordinate optimistic or offline actions with synchronized collections.
