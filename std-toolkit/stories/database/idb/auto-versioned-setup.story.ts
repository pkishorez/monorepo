import { Effect } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { IDB } from 'std-toolkit/db/idb';
import { Story } from 'laymos/story';

import {
  flatDoc,
  flatTable,
  indexedDoc,
  indexedTable,
  withUlid,
} from './support.js';

export const autoVersionedSetup = Story.make({
  title: 'Auto-versioned setup',
  description:
    'The version number increases only when the declared shape changed.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Who owns the IndexedDB version number?', {
      answer:
        'The adapter owns it. You declare the table shape. Setup reads the live database, increases the version only when a declared store or index is absent, and leaves the version alone when nothing changed. IndexedDB is the only backend whose schema can change inside a version-change transaction, so this calculation belongs to it.',
      proof: Effect.gen(function* () {
        const factory = new IDBFactory();
        const database = IDB.database({
          databaseName: 'auto-setup-owns-version',
          indexedDB: factory,
        });
        const flat = IDB.make(flatTable, { database });
        yield* flat.setup;
        const afterFirst = (yield* Effect.promise(() => database.open()))
          .version;
        yield* flat.setup;
        const afterRepeat = (yield* Effect.promise(() => database.open()))
          .version;
        const indexed = IDB.make(indexedTable, { database });
        yield* indexed.setup;
        const upgraded = yield* Effect.promise(() => database.open());
        const indexNames = Array.from(
          upgraded.transaction('docs', 'readonly').objectStore('docs')
            .indexNames,
        );
        yield* Story.assert(
          'an unchanged declaration never bumps the version',
          afterRepeat === afterFirst,
        );
        yield* Story.assert(
          'declaring a new GSI bumps the version exactly once',
          upgraded.version === afterFirst + 1,
        );
        yield* Story.assert(
          'the upgrade created the declared index',
          indexNames.includes('GSI1'),
        );
        return {
          afterFirst,
          afterRepeat,
          upgraded: upgraded.version,
          indexNames,
        };
      }),
    }),
    Story.question('What happens to existing rows when the shape grows?', {
      answer:
        'They stay as they are. The upgrade only adds, and it never rewrites a record. It also never fills in the past. A row that was written before an index existed carries no key for that index, so the index does not list it.',
      proof: Effect.gen(function* () {
        const factory = new IDBFactory();
        const database = IDB.database({
          databaseName: 'auto-setup-grows',
          indexedDB: factory,
        });
        const flat = IDB.make(flatTable, { database });
        yield* flat.setup;
        yield* withUlid(
          flatDoc
            .insert({ docId: 'd1', title: 'Old', category: 'blue' })
            .pipe(Effect.provide(flat.layer)),
        );
        const indexed = IDB.make(indexedTable, { database });
        yield* indexed.setup;
        const result = yield* withUlid(
          Effect.gen(function* () {
            yield* indexedDoc.insert({
              docId: 'd2',
              title: 'New',
              category: 'blue',
            });
            const byCategory = yield* indexedDoc.query('byCategory', {
              pk: { category: 'blue' },
              '>=': null,
            });
            const survivor = yield* indexedDoc.get({ docId: 'd1' });
            return {
              indexedIds: byCategory.items.map(({ value }) => value.docId),
              survivor: survivor?.value.title ?? null,
            };
          }).pipe(Effect.provide(indexed.layer)),
        );
        yield* Story.assert(
          'the pre-upgrade row still reads back',
          result.survivor === 'Old',
        );
        yield* Story.assert(
          'the new index sees only rows written after it existed',
          JSON.stringify(result.indexedIds) === JSON.stringify(['d2']),
        );
        return result;
      }),
    }),
  ],
});
