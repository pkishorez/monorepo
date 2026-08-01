# whatever/code — Context

Glossary for the `@pkishorez/code` package. Definitions only — no
implementation details, no specs. When a term here conflicts with how the code
or the team talks, fix it here.

## Terms

### Contract

The RPC surface shared between the server host and connected clients: the set
of named procedures with their payload, success, and error schemas. The
contract is the only thing a client needs to talk to the server.

### Domain

Fundamental schemas and pure functionality of the package. Knows nothing about
storage, transport, or hosting. The contract's schemas are domain schemas.

### Service

A capability with an external effect or resource — e.g. the sqlite database.
Services take configuration and manage their own lifecycle; they contain no
domain decision-making.

### Orchestrator

Ready-to-use functionality composed from services and domain. Orchestrators are
what the package actually _does_; they are transport-agnostic and know nothing
about the contract.

### Handler

A thin adapter that implements one contract procedure by delegating to
orchestrators. Handlers hold no logic of their own.

### Host

The process that takes the package's handlers and exposes them over a
transport. `whatever/code` never runs a server itself — the `whatever` CLI is
the host, serving the handlers over websocket RPC so other clients can connect.
