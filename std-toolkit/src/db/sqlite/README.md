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

Setup is explicit. Providing `peopleSqlite.layer` never changes the physical schema. Other driver entrypoints are `std-toolkit/db/sqlite/bun`, `std-toolkit/db/sqlite/better-sqlite3`, and `std-toolkit/db/sqlite/durable-object`.
