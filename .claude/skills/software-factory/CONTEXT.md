# Software factory

Software factory describes the conventions for building a web application from its data model through application behavior, API, synchronization, and routes.

## Language

**Contracts**: The application’s storage definitions, including its tables, entities, and schemas. API agreements are called RPC definitions.

**Domain**: Business concepts and pure rules beyond the storage definitions; an optional area of an application.

**Operations**: Application use cases that coordinate business rules and required capabilities. They may involve stored data, external services, or both.

**Shared space**: Capabilities suitable for use by both the server and client.

**Sync operations**: Client actions that coordinate optimistic or offline changes with the application’s synchronized collections.
