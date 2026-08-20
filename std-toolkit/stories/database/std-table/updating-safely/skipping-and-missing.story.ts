import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf } from '../../support.js';

const key = { noteId: 'n1', notebook: 'work' };
const draft = { ...key, title: 'Draft', status: 'open' };

export const skippingAndMissing = Story.make({
  title: 'Skipping and missing rows',
  description:
    'An update can stop itself. It is checked against the value that was just read.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The note already says what the edit would set. How is the write stopped?',
      {
        answer:
          'Give the update a condition. The condition runs against the value that was just read. If it refuses, the operation fails before any write, and the update stamp does not move.',
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
      },
    ),
    Story.question(
      'What happens when the app deletes a note that another tab deleted first?',
      {
        answer:
          'The delete fails and reports that the note is absent. It does not report success.',
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
      },
    ),
    Story.question(
      'What happens when the app updates a note that is not there?',
      {
        answer:
          'The update fails and reports that the note is absent. It does not create the note.',
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
      },
    ),
  ],
});
