# Shared application architecture

## Set boundaries

Use Laymos for dependency rules and module graphs, and deep-module for module shape.

Place capabilities in shared, server, or client areas, giving them separate layers when import rules differ.

Assign each source file one layer and one module.

## Set dependencies

Keep storage contracts pure and provide database connections at runtime boundaries.

Allow domain to import contracts, keeping contracts independent of domain.

Let shared operations use domain and contracts when their dependencies and behavior work on both server and client.

Keep RPC definitions independent of operation implementations and let portable handlers call shared operations.

Wrap external capabilities in server services and compose them with shared operations, domain, and contracts in server operations.

Let server RPC handlers call operations and combine shared and server groups and handlers.

Let client RPC import only definitions safe for the client runtime, including definitions placed under server RPC.

Let client sync use client RPC, shared definitions, and portable operations.

Separate RPC definitions from handlers through module exports and, when import rules differ, layers.

Check that client imports cannot reach server implementations, credentials, or provider setup.

## Wire runtimes

Select database and service providers, supply dependencies, and host RPC in the server entry.

Keep business workflow sequencing in operations.

Expose client RPC and sync start and cleanup functions independently of routes and rendering.

Let the application own their lifetime and supply runtime adapters.

## Place models

Put pure modeling definitions in `shared/contracts` and follow [modeling](modeling/guide.md) for table and entity graphs, schema evolution, and exports.

## Place files

Create only the areas needed by the application.

```text
src/
  shared/
    contracts/              # Pure STD tables, entities, and schemas
    domain/                 # Reusable pure business rules
    operations/             # Portable application behavior
    rpc/                    # Portable definitions and handlers
  server/
    services/               # External capabilities
    operations/             # Server application workflows
    rpc/                    # Server-only capabilities and composition
    entry.ts                # Providers and RPC hosting
  client/
    rpc/                    # Client initialization and lifecycle
    sync/                   # Collections and subscriptions
      operations/           # Optimistic or offline actions
```

Keep portable RPC definitions and implementations together in `shared/rpc`.

Move a capability together to `server/rpc` only when its implementation needs a specific server-only dependency.

Hosting a portable handler on the server does not change its ownership.

Keep definitions separately importable without pulling implementations into the browser.

## Define layers

Use Laymos and its installed schema to configure these layers as source files are added.

`contracts` covers `shared/contracts` and has no layer dependencies.

`domain` covers `shared/domain` and may use contracts.

`shared-operations` covers `shared/operations` and may use domain, contracts.

`shared-rpc-definitions` covers definition modules in `shared/rpc` and may use contracts, domain.

`shared-rpc-handlers` covers handler modules in `shared/rpc` and may use shared-rpc-definitions, shared-operations.

`server-services` covers `server/services` and may use contracts, domain.

`server-operations` covers `server/operations` and may use server-services, shared-operations.

`server-rpc-definitions` covers definition modules in `server/rpc` and may use shared-rpc-definitions.

`server-rpc-handlers` covers handler/composition modules in `server/rpc` and may use server-rpc-definitions, shared-rpc-handlers, server-operations.

`server-entry` covers `server/entry.ts` and may use server-rpc-handlers, server-services.

`client-rpc` covers `client/rpc` and may use shared-rpc-definitions, server-rpc-definitions.

`client-sync` covers `client/sync` and may use client-rpc, shared-operations.

Resolve paths from `src/`; layer permissions are transitive.

Assign framework entries through the application-specific guide and exclude generated files.

## Organize modules

Name modules by capability, use deep-module for their shape, and record their jobs and visibility in Laymos.

Use a graph when several modules need explicit dependency rules, starting with one exposed entry and private members.

Declare graph permissions explicitly; they are not transitive.

Follow [modeling](modeling/guide.md) for table and entity graphs; add feature modules only when needed.
