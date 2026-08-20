import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf } from '../../support.js';

export const insertARow = Story.make({
  title: 'Insert a row',
  description:
    'What a write puts in the table, what it adds to it, and what a read of an absent note returns.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Someone writes a note. What comes back?', {
      answer:
        'The stored entity. That is your value plus the data that the table adds: the entity name, the schema version, the update stamp, and a mark that says the note is live.',
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
    Story.question(
      'The same note is written two times. What happens to the first one?',
      {
        answer:
          'The second write fails and the stored note does not change. A write never replaces a note that is already there.',
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
      },
    ),
    Story.question(
      'What happens when the app asks for a note that was never written?',
      {
        answer: 'It receives null. An absent note is a value, not a failure.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            note.get({ noteId: 'missing', notebook: 'work' }),
          );
          yield* Story.assert('every adapter returns null', agree(results));
          return results;
        }),
      },
    ),
  ],
});
