# @kestack/std-toolkit/db/memory

Dependency-free, ephemeral in-memory adapter that implements the full StdTable contract in any JavaScript runtime.

## Big picture

Memory has no config, setup, mode, or platform binding: nothing outlives the table, so there is no Stored contract to keep. Each `Memory.make` call creates one isolated empty table; reusing its layer shares that state, and all state is gone when the table is unreachable. Reads are strongly consistent and writes are atomic, so it is the default for tests, stories, and the sync instance's Sync Store. Divergences are in [CONTEXT.md](CONTEXT.md); shared vocabulary is in [db/CONTEXT.md](../CONTEXT.md).

## Install

See the [top README](../../../README.md).

## Exports

### `@kestack/std-toolkit/db/memory`

| Export        | What it does                                                           |
| ------------- | ---------------------------------------------------------------------- |
| `Memory.make` | Realizes a StdTable in process memory; returns an object with `layer`. |

## Usage

### Run a program in memory

A Memory table needs no setup and no config: make it, provide its layer, and the program runs. Every Story in [stories/](../../../stories/) starts this way.

```ts
import { Effect, Stream } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';

const table = StdTable.make('board').primary('pk', 'sk').build();
const memory = Memory.make(table);

const program = Stream.runCollect(table.scan());

const rows = await Effect.runPromise(
  program.pipe(Effect.provide(memory.layer)),
);
```

- The program never names a database; the layer decides where it runs.
- Call `Memory.make(table)` again for a fresh empty table.
- A Memory table starts empty, so a table's Backfills never run on it; `expectTableShippable` runs them through setup on a Memory table of generated rows.
