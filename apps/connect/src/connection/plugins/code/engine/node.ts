import { Effect, Layer } from 'effect';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import type { HarnessHost } from '@kestack/ai-toolkit/harness';
import { harnessHostLayer } from '@kestack/ai-toolkit/harness/node';
import type { FileSystem, Git, Store } from './capabilities/index.js';
import { nodeFileSystem } from './services/file-system/index.js';
import { git } from './services/git/index.js';
import { aiTable, storeOver } from './services/index.js';

/*
 * The engine's edges on this computer, the only part of it that is Node's:
 * the Store on a SQLite file, and git, the File System at its home and the
 * Harness Host. `Engine.layer` takes them; the harnesses, which a caller
 * picks, come as they are.
 */

/** The Store on the SQLite file at `path`; `:memory:` keeps it in memory. */
export const storeLayer = (path: string): Layer.Layer<Store> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const database = makeNodeSQLite({ path });
      yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
      yield* SQLite.setup(aiTable, { database, mode: 'persistent' }).pipe(
        Effect.orDie,
      );
      return storeOver(SQLite.make(aiTable, { database }).layer);
    }),
  );

/**
 * Git, the File System and the Harness Host, on this computer. The File
 * System's home is `options.home`: the folder Folders never leave, and the
 * one `~` names.
 */
export const nodeEdges = (options: {
  readonly home: string;
}): Layer.Layer<Git | FileSystem | HarnessHost> =>
  Layer.mergeAll(git, nodeFileSystem(options), harnessHostLayer);
