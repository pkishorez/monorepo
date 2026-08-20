import { Effect } from 'effect';
import { makeBetterSQLite3 } from 'std-toolkit/db/sqlite/better-sqlite3';
import { makeDurableObjectSQLite } from 'std-toolkit/db/sqlite/durable-object';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { Story } from 'laymos/story';

import { note } from '../support.js';
import { makeSimulatedDurableObjectStorage, onDriver } from './support.js';

const program = Effect.gen(function* () {
  yield* note.insert({
    noteId: 'n1',
    notebook: 'drivers',
    title: 'First',
    status: 'open',
  });
  yield* note.insert({
    noteId: 'n2',
    notebook: 'drivers',
    title: 'Second',
    status: 'open',
  });
  const updated = yield* note.getAndUpdate(
    { noteId: 'n1', notebook: 'drivers' },
    { status: 'done' },
  );
  const page = yield* note.query('primary', {
    pk: { notebook: 'drivers' },
    '>=': null,
  });
  return {
    ids: page.items.map(({ value }) => value.noteId),
    updatedStatus: updated.value.status,
    updatedStamp: updated.meta._u,
  };
});

export const fourDriversOneTable = Story.make({
  title: 'Four drivers, one table',
  description:
    'One table shape over four SQLite runtimes, behind a seam of three methods.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Which runtimes can host the SQLite adapter?', {
      answer:
        'Any runtime that has a SQLite binding. There is a driver for node:sqlite, for better-sqlite3, for Bun, and for Cloudflare Durable Objects. Each one sits behind the same seam of three methods. Only this adapter needs a seam, because each runtime supplies SQLite in a different way. This proof runs the same program on three of the drivers. The Bun driver ships in the package but runs only under Bun, so it is named here and not proved.',
      proof: Effect.gen(function* () {
        const results = yield* Effect.all({
          node: onDriver(makeNodeSQLite({ path: ':memory:' }), program),
          betterSqlite3: onDriver(
            makeBetterSQLite3({ path: ':memory:' }),
            program,
          ),
          durableObject: onDriver(
            makeDurableObjectSQLite({
              storage: makeSimulatedDurableObjectStorage(),
            }),
            program,
          ),
        });
        yield* Story.assert(
          'the update landed identically everywhere',
          Object.values(results).every(
            ({ updatedStatus }) => updatedStatus === 'done',
          ),
        );
        yield* Story.assert(
          'every driver agrees byte for byte',
          JSON.stringify(results.node) ===
            JSON.stringify(results.betterSqlite3) &&
            JSON.stringify(results.betterSqlite3) ===
              JSON.stringify(results.durableObject),
        );
        return results;
      }),
    }),
  ],
});
