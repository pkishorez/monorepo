import { Effect } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { IDB } from 'std-toolkit/db/idb';
import { Story } from 'laymos/story';

import {
  flatDoc,
  flatTable,
  indexedTable,
  openRaw,
  withUlid,
} from './support.js';

export const livingInTheBrowser = Story.make({
  title: 'Living in the browser',
  description:
    'An upgrade needs each other tab to release its connection first.',
  setupNote: 'One IndexedDB database with two connections, to act as two tabs.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Can the schema upgrade while another tab is open?', {
      answer:
        'Yes, but the tabs must cooperate. A version change tells each other connection. A tab that behaves correctly closes its connection, and the upgrade continues. Only a browser has this problem. DynamoDB and SQLite never share a connection with an unknown party.',
      proof: Effect.gen(function* () {
        const factory = new IDBFactory();
        const databaseName = 'two-tabs-cooperative';
        const database = IDB.database({ databaseName, indexedDB: factory });
        const flat = IDB.make(flatTable, { database });
        yield* flat.setup;
        const otherTab = yield* openRaw(factory, databaseName);
        let sawVersionChange = false;
        otherTab.onversionchange = () => {
          sawVersionChange = true;
          otherTab.close();
        };
        const before = (yield* Effect.promise(() => database.open())).version;
        const indexed = IDB.make(indexedTable, { database });
        yield* indexed.setup;
        const after = (yield* Effect.promise(() => database.open())).version;
        yield* Story.assert(
          'the other tab was told to make way',
          sawVersionChange,
        );
        yield* Story.assert('the upgrade went through', after === before + 1);
        return { before, after, sawVersionChange };
      }),
    }),
    Story.question('What happens when the other tab does not close?', {
      answer:
        'The upgrade is blocked, and setup fails with a blocked error. It does not wait forever. The caller then decides whether to try again, ask the user, or stop.',
      proof: Effect.gen(function* () {
        const factory = new IDBFactory();
        const databaseName = 'two-tabs-stubborn';
        const database = IDB.database({ databaseName, indexedDB: factory });
        const flat = IDB.make(flatTable, { database });
        yield* flat.setup;
        const stubbornTab = yield* openRaw(factory, databaseName);
        stubbornTab.onversionchange = () => undefined;
        const indexed = IDB.make(indexedTable, { database });
        const error = yield* indexed.setup.pipe(Effect.flip);
        stubbornTab.close();
        yield* Story.assert(
          'the blocked upgrade surfaces as an error, not a hang',
          String(error).includes('blocked'),
        );
        return { error: String(error) };
      }),
    }),
    Story.question(
      'What happens to a tab after another tab upgrades the database?',
      {
        answer:
          'The connection sees the version change and closes its old handle. The next operation opens a new connection at the new version. Nothing restarts and no read is lost.',
        proof: Effect.gen(function* () {
          const factory = new IDBFactory();
          const databaseName = 'two-tabs-reopen';
          const database = IDB.database({ databaseName, indexedDB: factory });
          const flat = IDB.make(flatTable, { database });
          yield* flat.setup;
          yield* withUlid(
            flatDoc
              .insert({ docId: 'd1', title: 'Survives', category: 'blue' })
              .pipe(Effect.provide(flat.layer)),
          );
          const before = (yield* Effect.promise(() => database.open())).version;
          const external = yield* openRaw(factory, databaseName, before + 5);
          external.close();
          const survivor = yield* withUlid(
            flatDoc.get({ docId: 'd1' }).pipe(Effect.provide(flat.layer)),
          );
          const after = (yield* Effect.promise(() => database.open())).version;
          yield* Story.assert(
            'the row reads back through the reopened connection',
            survivor?.value.title === 'Survives',
          );
          yield* Story.assert(
            'the connection now sees the externally bumped version',
            after === before + 5,
          );
          return { before, after, survivor: survivor?.value.title ?? null };
        }),
      },
    ),
  ],
});
