import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity } from '../../support.js';

const key = { noteId: 'n1', notebook: 'work' };
const draft = { ...key, title: 'Draft', status: 'open' };

export const deletingAndRestoring = Story.make({
  title: 'Deleting and restoring',
  description:
    'A delete marks the row rather than removing it, which is what makes it undoable.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('A note is deleted. Is it gone?', {
      answer:
        'It marks the row deleted with `meta._d` true and leaves it in the table, so a plain get still returns it.',
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
    Story.question(
      'So how does the notebook screen avoid showing deleted notes?',
      {
        answer:
          'Pass `excludeDeleted: true` — get returns null for a deleted row and query leaves it out of the page.',
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
      },
    ),
    Story.question('And undo — how does a deleted note come back?', {
      answer:
        'Call `restore`, which clears the deleted flag. Restoring a row that is already live writes it again and stamps a fresh version, because every op produces exactly one write — that is what keeps a batch atomic and its outcome report aligned.',
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
