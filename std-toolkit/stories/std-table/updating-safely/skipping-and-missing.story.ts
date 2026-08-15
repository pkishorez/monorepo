import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf } from '../support.js';

const key = { noteId: 'n1', notebook: 'work' };
const draft = { ...key, title: 'Draft', status: 'open' };

export const skippingAndMissing = Story.make({
  title: 'Skipping and missing rows',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do you decide, after reading, not to write at all?', {
      answer:
        'Return null from the update function — the row you read comes back unchanged and no write happens, so its update stamp stays put.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const inserted = yield* note.insert(draft);
            const skipped = yield* note.getAndUpdate(key, (current) =>
              current.status === 'open' ? null : { status: 'open' },
            );
            const stored = yield* note.get(key);
            return {
              insertedStamp: inserted.meta._u,
              skippedStamp: skipped.meta._u,
              storedStamp: stored?.meta._u ?? null,
              status: skipped.value.status,
            };
          }),
        );
        yield* Story.assert(
          'nothing was written and the stamp is untouched',
          results.sqlite.skippedStamp === results.sqlite.insertedStamp &&
            results.sqlite.storedStamp === results.sqlite.insertedStamp &&
            results.sqlite.status === 'open',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question("What happens if you update a row that isn't there?", {
      answer:
        'The update fails with `NoItemToUpdate` — get-and-update never creates a row.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const failure = yield* note
              .getAndUpdate(
                { noteId: 'missing', notebook: 'work' },
                { status: 'done' },
              )
              .pipe(Effect.flip);
            const stored = yield* note.get({
              noteId: 'missing',
              notebook: 'work',
            });
            return { reason: reasonOf(failure), stored };
          }),
        );
        yield* Story.assert(
          'the update is rejected and no row is created',
          results.sqlite.reason === 'NoItemToUpdate' &&
            results.sqlite.stored === null,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
