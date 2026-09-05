# Web architecture

Use [shared architecture](../../core/architecture.md) for shared, server, and client folders and layers.

## Add framework files

Create TanStack Start's `src/router.tsx`, `src/server.ts`, and `routes/__root.tsx` for the selected Start setup.

When RPC is selected, connect the framework server entry to `server/entry.ts`.

For a client-only setup, adapt framework entries to the chosen hosting mode.

```text
src/routes/
  __root.tsx
  page.tsx
  components/             # UI shared across routes
  internal/               # Shared route logic and root provider
  <route>/
    page.tsx
    components/           # Route-specific UI
    internal/             # Route-specific logic
```

## Add web layers

Include `src/server.ts` in `server-entry` when it hosts server wiring.

Let `routes` use client-sync, client-rpc, domain, and contracts as needed.

Let `web-entry` cover `src/router.tsx` and other browser composition files and use routes.

Configure only layers used by the selected application.

Exclude generated route metadata from architecture analysis.

## Configure routes

Use a folder with `page.tsx` for each route.

Configure route and index tokens, preserving special files such as `__root.tsx`.

Ignore `components/` and `internal/` during route discovery.

Put UI in `components/` and other logic in `internal/`, sharing pieces at the nearest common route folder.

Check that generated routes have the intended URLs.

## Connect the client

Add a root provider in `routes/internal/` when implementing RPC and sync, exposing their capabilities to pages.

Define the client RPC runtime first, with the client and transport layers owned by its lifetime. Connect React through `use-effect-ts`; acquire the runtime at the root session boundary and dispose it when the session ends. Route effects reuse its context across calls and navigation.

Scope mutable client state to the session and isolate server-rendered requests.

For authentication wiring, read [auth-toolkit setup](../../../auth-toolkit/setup/guide.md).
