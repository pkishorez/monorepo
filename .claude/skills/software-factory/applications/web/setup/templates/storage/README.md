# Storage

Choose only the requested provider and keep it ready for later modeling.

## DynamoDB

Use [app-table.ts](app-table.ts) in `shared/contracts/app-table`, exporting it through `index.ts`.

Use [table.ts](table.ts) in `src/infra/website/table.ts`.

In the Alchemy Website effect, provision the table and bind the returned name into the server environment:

```ts
const tableName =
  yield * provisionTable(stage, `__APP_NAME__-${stage}`, deployed);
```

Supply region, endpoint, and credentials alongside the table name.

For local startup, use region and credentials `local`, and endpoint `http://localhost:8090`.

For deployed stages, use the configured AWS region and secrets, with no local endpoint.

Create `DynamoDB.make(appTable, settings)` at the server boundary and make its layer available to future handlers.

For Durable Objects, discover configuration through `init` and supply the database layer through the handler factory.

Preserve existing resources when the user selects an existing database.

## IndexedDB

Create the browser provider using the installed STD toolkit IndexedDB adapter and the empty table definition.

Initialize and dispose it with the client runtime; keep database access out of server rendering.

## SQLite

Use the selected host's STD toolkit adapter and the empty table definition.

For Durable Object SQLite, apply the [SQLite overlay](durable-object-sqlite/) after the Durable Object overlay. It obtains `Cloudflare.DurableObjectState`, passes `state.raw.storage` to `makeDurableObjectSQLite`, runs table setup, and provides the database layer to handlers.

For Node.js SQLite, adapt hosting to Node.js instead of generating a Worker-only runtime.

For combined stores, wire each provider to its agreed owner and defer business replication to modeling.
