# Storage: Durable Object SQLite

One STD toolkit table stored in the Durable Object's own SQLite, initialized when the object starts and provided to the RPC handlers. Pick this when an RPC Durable Object owns its data. The table takes the object's name: one table per object, single-table design.

Requires an `rpc-durable-object` instance named `__NAME__`. Conflicts with nothing; DynamoDB can be added beside it for shared data.

## Files

Adds:

- `src/shared/contracts/__NAME__-table/`: the empty `__NAME__Table` with a primary key and four GSIs. Entities and schemas come later during modeling.

Replaces:

- `src/server/durable-objects/__NAME__.ts`: builds `SQLite.make(__NAME__Table, ...)` over `ctx.storage` in `#boot`, runs `setup`, and provides the database layer to the handlers.

## Seams

- `package.json`: add `std-toolkit: workspace:*` to dependencies.

## Laymos

Add layer `contracts` once with paths `src/shared/contracts`. Per instance, add `src/shared/contracts/__NAME__-table` as an exposed module. Add rule once: `server-rpc` uses `contracts`. Later `domain` and `shared-rpc-handlers` may use `contracts`.

## Verify

`pnpm dev` starts without a setup error and the greeting still round-trips. Entities added later query through the layer provided in `src/server/durable-objects/__NAME__.ts`.
