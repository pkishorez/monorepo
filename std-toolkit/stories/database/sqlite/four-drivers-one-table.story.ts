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
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Which runtimes can host the SQLite adapter?', {
      answer:
        'Any runtime with a SQLite binding: node:sqlite, better-sqlite3, Bun, and Cloudflare Durable Objects each get a driver behind the same three-method SQLiteDriver seam. The seam is the SQLite adapter’s native capability — DynamoDB is one HTTP API and IndexedDB one browser API, but SQLite is an embedded engine that surfaces differently in every runtime, so only this adapter needs a driver layer. This proof runs the identical program on node:sqlite, better-sqlite3, and the Durable Object driver (its storage host simulated in-process); the Bun driver ships at std-toolkit/db/sqlite/bun but only runs under the Bun runtime, so it is shown here, not proven.',
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
