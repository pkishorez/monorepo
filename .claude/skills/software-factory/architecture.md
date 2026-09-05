# Application architecture

Use the Laymos skill for dependency rules and module graphs, and the deep-module skill for capability modules. Apply these conventions to the existing application; create areas only when needed.

```text
src/
  shared/
    contracts/              # STD tables, entities, evolving schemas
    domain/                 # Optional pure business rules and concepts
    operations/             # Portable application operations
    rpc/                    # RPC groups and portable handlers
  server/
    services/               # External service capabilities
    operations/             # Server application workflows
    rpc/                    # Server groups, handlers, group composition
    entry.ts                # Provides dependencies and hosts RPC
  client/
    rpc/                    # Composes and initializes the RPC client
    sync/                   # Collections and subscriptions
      operations/           # Optimistic/offline actions and transactions
  routes/
    components/             # UI reused across routes
    internal/               # Logic reused across routes; root provider
    <route>/
      page.tsx
      components/           # Route-specific UI
      internal/             # Route-specific logic
```

Shared, server, and client are placement spaces. Their capability areas have distinct dependency jobs; model those as Laymos layers when the jobs need different import rights. Keep layer paths disjoint. A folder is not automatically a module or graph. Client sync operations may be private internals or graph members within the sync layer.

## Dependency direction

- Shared contracts own pure storage definitions; database providers live at runtime boundaries.
- Shared domain may import contracts. Contracts remain independent of domain.
- Shared operations may use domain and contracts. Their dependencies and behavior must work in both environments.
- RPC group definitions use shared definitions and stay independent of operation implementations. Portable handlers call shared operations.
- Server services wrap external capabilities. Server operations may compose services and shared operations, domain, and contracts.
- Server RPC handlers call operations. Server RPC may combine shared groups and portable handlers with server-specific groups and handlers.
- Client RPC imports browser-safe group definition entry points from shared or server RPC. Server placement does not make handler code safe to import into the browser.
- Client sync consumes client RPC and the shared definitions and portable operations it needs.
- Routes consume client capabilities and shared definitions. Client infrastructure remains independent of routes.

Separate RPC definition and handler modules so definition imports cannot reach server implementations, credentials, or provider setup. Express browser-safe server definitions as a separate layer from server handlers when their import rights differ. Enforce allowed paths through Laymos module doors and verify the browser dependency closure.

## Composition and lifetime

Server entry selects database and service providers, supplies operation dependencies, and starts RPC hosting. Business workflow sequencing belongs in operations.

Client RPC and sync expose capabilities with explicit initialization and cleanup. The root route provider under `routes/internal/` owns their session lifetime, including connections, subscriptions, and offline queues. Route pages consume that provider. A separate client entry file is unnecessary.

## Routes

Each route is a folder with `page.tsx`. Keep all application UI under routes. Folders named `components/` and `internal/` are ignored by routing: put UI in components and non-rendering route logic in internal. Place reusable pieces at the nearest common route ancestor. Verify the application’s router applies these conventions when setting up a new application.

## Modeling placement

Apply the existing modeling module shape inside `shared/contracts`: an app modeling graph contains the table module and entity modules with their schemas. The table defines keys and indexes; entities bind to it. Keep the modeling guide’s schema evolution and export rules.
