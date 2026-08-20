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
    'The version number bumps only when the declared shape actually changed.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Who owns the IndexedDB version number?', {
      answer:
        'The adapter. You declare the table shape; setup inspects the live database, bumps the version only when a declared store or index is missing, and stays put when nothing changed. No other adapter has this problem — IndexedDB is the only backend whose schema can change solely inside a versionchange transaction, so the version arithmetic is IndexedDB-native by nature.',
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
    Story.question('What happens to existing rows when the topology grows?', {
      answer:
        'They survive untouched — the upgrade is additive and never rewrites records. But it also never backfills: a row written before the index existed carries no index keys, and IndexedDB’s native sparse behavior simply skips it. New writes populate the index; old rows appear there only after their next write.',
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
