# Client sync

## Define data and actions

Identify the data the application needs and follow [shared architecture](../architecture.md) for placement.

Create STD toolkit TanStack DB collections in `client/sync` using shared schemas and client RPC updates.

Group user actions by capability in `client/sync/operations`, using installed optimistic or offline APIs.

Define how each action coordinates local collection changes with its RPC call, including failures and retries.

Use application-specific names in this structure:

```text
client/
  rpc/
  sync/
    collections/
      <collection>/
    operations/
      <capability>/
        index.ts
        <capability>.ts
```

Let actions update one or more collections locally, with the server deciding success and sync reconciling the result.

## Connect and verify

Connect RPC and sync to the application or session owner, which starts them and cleans them up when its lifetime ends.

Expose collections and actions through that integration; follow [web architecture](../../applications/web/architecture.md) for web providers.

Check loading, incoming updates, action failures, and cleanup.

For offline actions, also check reconnect and replay.
