# IndexedDB

Use the StdTable definitions from `std-toolkit/db` with a reusable IndexedDB database connection.

```ts
import { Effect } from 'effect';
import { StdTable } from 'std-toolkit/db';
import { IDB } from 'std-toolkit/db/idb';

const people = StdTable.make('people').primary('pk', 'sk').build();
const database = IDB.database({ databaseName: 'application' });
const peopleIdb = IDB.make(people, { database });

await Effect.runPromise(peopleIdb.setup);
```

Setup is explicit and performs the versioned Store and index upgrade. Providing `peopleIdb.layer` does not run setup.
