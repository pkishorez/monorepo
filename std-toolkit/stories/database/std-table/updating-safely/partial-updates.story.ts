import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../../support.js';

const key = { noteId: 'n1', notebook: 'work' };
const draft = { ...key, title: 'Draft', status: 'open' };

export const partialUpdates = Story.make({
  title: 'Partial updates',
  description:
    'Change some fields of a note. Do not read the whole note into your own code first.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How does an update change the title only, and leave the other fields alone?',
      {
        answer:
          'Give `getAndUpdate` the key and only the fields that change. The other fields keep their values, and the update stamp moves forward.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              const inserted = yield* note.insert(draft);
              const updated = yield* note.getAndUpdate(key, { status: 'done' });
              return {
                status: updated.value.status,
                title: updated.value.title,
                insertedStamp: inserted.meta._u,
                updatedStamp: updated.meta._u,
              };
            }),
          );
          yield* Story.assert(
            'the named field changes, the untouched field survives',
            results.sqlite.status === 'done' &&
              results.sqlite.title === 'Draft',
          );
          yield* Story.assert(
            'the update stamp advances',
            results.sqlite.updatedStamp > results.sqlite.insertedStamp,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('How does the new value use the old one?', {
      answer:
        'Give `getAndUpdate` a function instead of a value. The function receives the note that was just read and returns the fields to change.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft);
            const updated = yield* note.getAndUpdate(key, (current) => ({
              title: `${current.title} (v2)`,
            }));
            const stored = yield* note.get(key);
            return {
              title: updated.value.title,
              storedTitle: stored?.value.title ?? null,
            };
          }),
        );
        yield* Story.assert(
          'the new title is derived from the stored one',
          results.sqlite.title === 'Draft (v2)' &&
            results.sqlite.storedTitle === 'Draft (v2)',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
