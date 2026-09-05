# Client sync

Start with the data the routes need. Create STD toolkit sync collections in `client/sync`, using shared schemas to describe their data and client RPC to receive server updates.

Then describe what the user can do with that data. Put these actions in `client/sync/operations`, grouped by capability. Use the installed STD toolkit optimistic or offline action APIs as appropriate. Each action coordinates collection changes with its RPC call, including what happens when the call fails or must be retried.

Use application-specific names for the placeholders below:

```text
client/
  rpc/
  sync/
    collections/
      <collection>/
    operations/
      <capability>/
        index.ts
        <capability>.ts  # Related client actions
```

An action can update one or several collections locally, then ask the server to perform the operation. The server decides whether it succeeds; sync brings the collections into agreement with the server.

Finally, connect these capabilities to the root route provider in `routes/internal/`. It starts RPC and sync for the session and cleans them up when the session ends. Route pages read collections and call sync operations through that provider.

Check loading, incoming updates, action failures, and cleanup. For offline actions, also check reconnect and replay behavior. See [the architecture conventions](../architecture.md) for placement and lifetime ownership.
