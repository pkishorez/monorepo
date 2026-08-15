import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf } from '../support.js';

export const insertARow = Story.make({
  title: 'Insert a row',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does insert return?', {
      answer:
        'The stored entity: your value plus the metadata the table stamps on it — entity name, schema version, update stamp, and a live (not deleted) marker.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const inserted = yield* note.insert({
              noteId: 'n1',
              notebook: 'work',
              title: 'Draft',
              status: 'open',
            });
            return { value: inserted.value, meta: inserted.meta };
          }),
        );
        yield* Story.assert(
          'the entity comes back stamped as a live Note',
          results.sqlite.meta._e === 'Note' && results.sqlite.meta._d === false,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('What happens if you insert the same key twice?', {
      answer:
        'The second insert fails with `ItemAlreadyExists` and leaves the stored row untouched — insert never overwrites.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const value = {
              noteId: 'n1',
              notebook: 'work',
              title: 'Draft',
              status: 'open',
            };
            yield* note.insert(value);
            const duplicate = yield* note
              .insert({ ...value, title: 'Overwritten' })
              .pipe(Effect.flip);
            const stored = yield* note.get({
              noteId: 'n1',
              notebook: 'work',
            });
            return {
              reason: reasonOf(duplicate),
              title: stored?.value.title ?? null,
            };
          }),
        );
        yield* Story.assert(
          'the duplicate is rejected and the first write survives',
          results.sqlite.reason === 'ItemAlreadyExists' &&
            results.sqlite.title === 'Draft',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('What does get return for a key that was never written?', {
      answer: 'Null — a missing row is a value, not a failure.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          note.get({ noteId: 'missing', notebook: 'work' }),
        );
        yield* Story.assert('every adapter returns null', agree(results));
        return results;
      }),
    }),
  ],
});
