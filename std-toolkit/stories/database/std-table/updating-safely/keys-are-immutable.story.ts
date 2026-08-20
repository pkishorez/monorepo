import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf } from '../../support.js';

const key = { noteId: 'n1', notebook: 'work' };
const draft = { ...key, title: 'Draft', status: 'open' };

export const keysAreImmutable = Story.make({
  title: 'Keys are immutable',
  description:
    'A row cannot change its own key; it can only be written under a new one.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens if an update tries to change the primary key?',
      {
        answer:
          'The update fails with `PrimaryKeyUpdateNotSupported` and the stored row keeps its old values — a row moves only by inserting it under the new key and deleting the old one.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              const inserted = yield* note.insert(draft);
              const partitionFailure = yield* note
                .getAndUpdate(key, { notebook: 'personal' })
                .pipe(Effect.flip);
              const idFailure = yield* note
                .getAndUpdate(key, { noteId: 'n2' })
                .pipe(Effect.flip);
              const stored = yield* note.get(key);
              return {
                partitionReason: reasonOf(partitionFailure),
                idReason: reasonOf(idFailure),
                notebook: stored?.value.notebook ?? null,
                noteId: stored?.value.noteId ?? null,
                stampUnchanged: stored?.meta._u === inserted.meta._u,
              };
            }),
          );
          yield* Story.assert(
            'changing the partition component is rejected',
            results.sqlite.partitionReason === 'PrimaryKeyUpdateNotSupported',
          );
          yield* Story.assert(
            'changing the id field is rejected',
            results.sqlite.idReason === 'PrimaryKeyUpdateNotSupported',
          );
          yield* Story.assert(
            'the stored row is untouched',
            results.sqlite.notebook === 'work' &&
              results.sqlite.noteId === 'n1' &&
              results.sqlite.stampUnchanged,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
