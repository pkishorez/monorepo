import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf } from '../../support.js';

const key = { noteId: 'n1', notebook: 'work' };
const draft = { ...key, title: 'Draft', status: 'open' };

export const skippingAndMissing = Story.make({
  title: 'Skipping and missing rows',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do you decide, after reading, not to write at all?', {
      answer:
        'Give the update an entity invariant through `check`. It runs against the value that was just read, and a refusal fails with `CheckRefused` before any write, so the update stamp stays put.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const inserted = yield* note.insert(draft);
            const failure = yield* note
              .getAndUpdate(
                key,
                { status: 'open' },
                { check: (current) => current.status !== 'open' },
              )
              .pipe(Effect.flip);
            const stored = yield* note.get(key);
            return {
              reason: reasonOf(failure),
              insertedStamp: inserted.meta._u,
              storedStamp: stored?.meta._u ?? null,
              status: stored?.value.status ?? null,
            };
          }),
        );
        yield* Story.assert(
          'nothing was written and the stamp is untouched',
          results.sqlite.reason === 'CheckRefused' &&
            results.sqlite.storedStamp === results.sqlite.insertedStamp &&
            results.sqlite.status === 'open',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('What happens if you delete a row that is already gone?', {
      answer:
        'It is written again. A delete always writes a tombstone, so the update stamp moves and the change broadcasts. Every op contributes exactly one write, which is what keeps a batch atomic and keeps its outcome report aligned with the ops you handed in.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const twice = { noteId: 'twice', notebook: 'work' };
            yield* note.insert({ ...twice, title: 'Draft', status: 'open' });
            const first = yield* note.delete(twice);
            const second = yield* note.delete(twice);
            const stored = yield* note.get(twice);
            return {
              firstStamp: first.meta._u,
              secondStamp: second.meta._u,
              storedStamp: stored?.meta._u ?? null,
              deleted: stored?.meta._d ?? null,
            };
          }),
        );
        yield* Story.assert(
          'the second delete writes a fresh tombstone',
          results.sqlite.secondStamp !== results.sqlite.firstStamp &&
            results.sqlite.storedStamp === results.sqlite.secondStamp &&
            results.sqlite.deleted === true,
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
