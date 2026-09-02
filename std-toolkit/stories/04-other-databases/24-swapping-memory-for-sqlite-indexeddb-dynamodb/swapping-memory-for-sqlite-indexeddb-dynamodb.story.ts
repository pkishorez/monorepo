import { Effect } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { Story } from 'laymos/story';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { IDB } from 'std-toolkit/db/idb';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { adapterNames, fresh } from '../../env.js';
import {
  table,
  task,
} from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';

// The task from chapter 4, and the key that finds it again.
const key = { taskId: 't1', boardId: 'work' };
const draft = {
  ...key,
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

// The program from chapter 4, written once: save the task, read it back. It never names a database.
const saveAndRead = Effect.gen(function* () {
  const inserted = yield* task.insert(draft);
  const stored = yield* task.get(key);
  return { inserted, stored };
});

// Where the local DynamoDB listens; the user starts it with docker.
const dynamodbEndpoint =
  process.env.DYNAMODB_LOCAL_ENDPOINT ?? 'http://localhost:8090';

export const swappingMemoryForSqliteIndexeddbDynamodb = Story.make({
  title: 'Swapping memory for SQLite, IndexedDB, DynamoDB',
  description:
    'The program from chapter 4, unchanged, on three real databases: what changes, what each one needs first, and whether the answers agree.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The same save-then-read program: what changes when the database changes?',
      {
        answer:
          'Only the layer wrapped around it. The program above is written once with no database in it; wrapping it in the memory layer runs it in memory, and wrapping it in a SQLite layer (built from the same `table` and a SQLite connection) runs it on SQLite — the task calls do not change.',
        proof: Story.trace(
          Effect.gen(function* () {
            // Run the program in memory, exactly as chapter 4 did.
            const memory = yield* fresh('memory', table)(saveAndRead);
            // Open a SQLite database that lives in this process.
            const database = makeNodeSQLite({ path: ':memory:' });
            // The same table, realised on that database.
            const sqlite = SQLite.make(table, { database });
            // Create the physical table once.
            yield* sqlite.setup;
            // Run the very same program, this time wrapped in the SQLite layer.
            const onSqlite = yield* saveAndRead.pipe(
              Effect.provide(sqlite.layer),
              Effect.ensuring(Effect.sync(() => database.close?.())),
            );
            yield* Story.assert(
              'SQLite saved and read back the same task',
              onSqlite.stored?.value.title === 'Write the plan' &&
                onSqlite.stored.meta._u === onSqlite.inserted.meta._u,
            );
            yield* Story.assert(
              'and the task it returns is the one memory returned',
              JSON.stringify(onSqlite.stored?.value) ===
                JSON.stringify(memory.stored?.value),
            );
            return { memory: memory.stored, sqlite: onSqlite.stored };
          }),
        ),
      },
    ),
    Story.question('What does each database need before the first write?', {
      answer:
        'A `setup`, run once, that creates the physical table (memory needs nothing). IndexedDB is built from a database connection and the same `table`; DynamoDB is built from a table name, region and credentials, and because that table is a real one it also has a `teardown` that deletes it when you are done. In both cases the program is run the same way, wrapped in the layer.',
      proof: Story.trace(
        Effect.gen(function* () {
          // A private IndexedDB (a fake one here; in a browser this is `window.indexedDB`).
          const indexedDB = new IDBFactory();
          // A connection to a named database inside it.
          const idb = IDB.make(table, {
            database: IDB.database({ databaseName: 'board', indexedDB }),
          });
          // Create the store and its indexes once.
          yield* idb.setup;
          // The same program, wrapped in the IndexedDB layer.
          const onIdb = yield* saveAndRead.pipe(Effect.provide(idb.layer));
          // The same table on DynamoDB: a table name, a region, where to reach it, and credentials.
          const dynamodb = DynamoDB.make(table, {
            tableName: `board-${process.pid}`,
            region: 'local',
            endpoint: dynamodbEndpoint,
            credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
          });
          // Create the real table once.
          yield* dynamodb.setup;
          // The same program, wrapped in the DynamoDB layer; the table is deleted afterwards either way.
          const onDynamodb = yield* saveAndRead.pipe(
            Effect.provide(dynamodb.layer),
            Effect.ensuring(Effect.orDie(dynamodb.teardown)),
          );
          yield* Story.assert(
            'IndexedDB saved and read back the task',
            onIdb.stored?.value.title === 'Write the plan',
          );
          yield* Story.assert(
            'so did DynamoDB',
            onDynamodb.stored?.value.title === 'Write the plan',
          );
          return {
            idb: onIdb.stored,
            dynamodb: onDynamodb.stored,
            dynamodbEndpoint,
          };
        }),
      ),
    }),
    Story.question('Do the answers match, down to the update stamp?', {
      answer:
        'Yes, all four are identical. The update stamp `_u` is not made by the database: it comes from `Ulid`, the stamp maker the program is given alongside the layer (here `fresh` hands every run one that counts up from one), so the same program with the same stamp maker stores the same task everywhere.',
      proof: Story.trace(
        Effect.gen(function* () {
          // Run the program on a fresh copy of the table on each of the four databases.
          const results = yield* Effect.forEach(adapterNames, (adapter) =>
            fresh(
              adapter,
              table,
            )(saveAndRead).pipe(
              Effect.map((result) => [adapter, result.stored] as const),
            ),
          );
          // One string per database; they should all be the same string.
          const answers = new Set(
            results.map(([, stored]) => JSON.stringify(stored)),
          );
          yield* Story.assert(
            'every database returned the same stored task, stamp included',
            answers.size === 1,
          );
          yield* Story.assert(
            'and the stamp is the first one the stamp maker issued',
            results.every(
              ([, stored]) => stored?.meta._u === '1'.padStart(26, '0'),
            ),
          );
          return Object.fromEntries(results);
        }),
      ),
    }),
  ],
});
