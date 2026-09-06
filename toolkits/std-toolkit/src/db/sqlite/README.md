# SQLite

Define StdTables and entities once with `std-toolkit/db`, then realize each StdTable on a reusable SQLite database over a driver.

```ts
import { Effect } from 'effect';
import { StdTable } from 'std-toolkit/db';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';

const people = StdTable.make('people').primary('pk', 'sk').build();
const database = makeNodeSQLite({ path: './application.sqlite' });
const peopleSqlite = SQLite.make(people, { database });

await Effect.runPromise(peopleSqlite.setup);
```

Setup is explicit. Providing `peopleSqlite.layer` never changes the physical schema. Other driver entrypoints are `std-toolkit/db/sqlite/bun`, `std-toolkit/db/sqlite/better-sqlite3`, `std-toolkit/db/sqlite/durable-object`, and `std-toolkit/db/sqlite/d1`.

For Cloudflare D1, pass the Worker's database binding and provide the resulting table layer, just as with Durable Object SQLite:

```ts
import { Effect } from 'effect';
import { StdTable } from 'std-toolkit/db';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeD1SQLite } from 'std-toolkit/db/sqlite/d1';

const people = StdTable.make('people').primary('pk', 'sk').build();

// Inside your Worker, where env.DB is a D1 database binding:
const database = makeD1SQLite({ database: env.DB });
const peopleD1 = SQLite.make(people, { database });
await Effect.runPromise(peopleD1.setup);
// Run your existing StdTable program with this layer:
await Effect.runPromise(program.pipe(Effect.provide(peopleD1.layer)));
```

The binding remains caller-owned and can serve multiple StdTables. Run setup explicitly when preparing the database; constructing or providing a layer does not run it. Use the D1 database binding directly so reads target the primary and honor the SQLite adapter's read-consistency contract.

D1 transactions preserve the same conditional-write and all-or-nothing guarantees as the other SQLite drivers. Each guarded statement adds a SQL assertion inside the [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), so a failed condition rolls back the batch before it commits. Blob values return as `Uint8Array`; native `bigint` parameters are rejected because D1 does not support them.

The D1 driver and shared StdTable conformance tests run against Miniflare's local D1 runtime with `pnpm exec vitest run src/db/sqlite/__tests__/d1.test.ts`. They need permission to start a local server and do not require Cloudflare credentials.
