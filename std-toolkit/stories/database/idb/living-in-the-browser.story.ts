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
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Can the schema upgrade while another tab is open?', {
      answer:
        'Yes, cooperatively. A version bump fires versionchange in every other connection; a well-behaved tab closes its handle and the upgrade proceeds. Multi-tab contention is a browser-only reality — DynamoDB and SQLite never share a connection with a stranger — which is why this behavior lives in the IndexedDB adapter alone.',
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
    Story.question('And if the other tab refuses to close?', {
      answer:
        'The upgrade is blocked and setup fails loudly with a blocked error instead of hanging forever — the caller decides whether to retry, prompt the user, or give up.',
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
    Story.question('What happens after another tab upgrades the database?', {
      answer:
        'The connection notices the versionchange, closes its stale handle, and the next operation transparently reopens at the new version — no restart, no lost reads.',
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
    }),
  ],
});
