import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../../support.js';

const key = { noteId: 'n1', notebook: 'work' };
const draft = { ...key, title: 'Draft', status: 'open' };

export const deletingAndRestoring = Story.make({
  title: 'Deleting and restoring',
  description:
    'A delete marks the note. It does not remove the note. That is what makes it possible to undo.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('A note is deleted. Is it gone?', {
      answer:
        'No. The delete marks the note as deleted and leaves it in the table. A plain read still returns it.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft);
            const deleted = yield* note.delete(key);
            const stored = yield* note.get(key);
            return {
              deletedFlag: deleted.meta._d,
              storedFlag: stored?.meta._d ?? null,
              storedTitle: stored?.value.title ?? null,
            };
          }),
        );
        yield* Story.assert(
          'the row is flagged deleted but still readable',
          results.sqlite.deletedFlag === true &&
            results.sqlite.storedFlag === true &&
            results.sqlite.storedTitle === 'Draft',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('How does a query leave the deleted notes out?', {
      answer:
        'It asks the query for live notes only. The query then leaves out the notes that are marked as deleted.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft);
            yield* note.insert({
              noteId: 'n2',
              notebook: 'work',
              title: 'Second',
              status: 'open',
            });
            yield* note.delete(key);
            const hidden = yield* note.get(key, { excludeDeleted: true });
            const page = yield* note.query(
              'primary',
              { pk: { notebook: 'work' }, '>=': null },
              { excludeDeleted: true },
            );
            return {
              hidden,
              live: page.items.map((item) => item.value.noteId),
            };
          }),
        );
        yield* Story.assert(
          'the deleted row is hidden from both get and query',
          results.sqlite.hidden === null &&
            JSON.stringify(results.sqlite.live) === JSON.stringify(['n2']),
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('How does a deleted note come back?', {
      answer:
        'A restore removes the mark. The note becomes live again and keeps the data that it had.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft);
            yield* note.delete(key);
            const restored = yield* note.restore(key);
            const again = yield* note.restore(key);
            return {
              restoredFlag: restored.meta._d,
              restoredStamp: restored.meta._u,
              againStamp: again.meta._u,
              title: again.value.title,
            };
          }),
        );
        yield* Story.assert(
          'restore revives the row and a second restore writes it again',
          results.sqlite.restoredFlag === false &&
            results.sqlite.againStamp !== results.sqlite.restoredStamp &&
            results.sqlite.title === 'Draft',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
