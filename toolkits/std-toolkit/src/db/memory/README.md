# Memory

Use the same StdTable definitions and operations in any JavaScript runtime without configuring a database or platform binding.

```ts
import { Effect } from 'effect';
import { StdTable } from 'std-toolkit/db';
import { Memory } from 'std-toolkit/db/memory';

const people = StdTable.make('people').primary('pk', 'sk').build();
const peopleMemory = Memory.make(people);

await Effect.runPromise(program.pipe(Effect.provide(peopleMemory.layer)));
```

Each `Memory.make` call creates one isolated empty adapter table. Reusing its layer shares that state. A different `Memory.make` call starts empty, and all state is lost when the adapter table becomes unreachable.

Memory implements the complete StdTable contract with strongly consistent reads and atomic writes. It has no config, setup, teardown, or adapter-specific dependency.
