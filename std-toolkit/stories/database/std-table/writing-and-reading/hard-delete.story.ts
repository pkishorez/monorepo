import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, settings, table } from '../../support.js';

const key = { noteId: 'n1', notebook: 'work' };
const draft = { ...key, title: 'Draft', status: 'open' };

export const hardDelete = Story.make({
  title: 'Hard delete',
  description:
    'The one call that really removes a row, and the phrase you have to type to get it.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The user asks for a note to be erased, not hidden. How is that done?',
      {
        answer:
          "Call `hardDelete(key, 'I KNOW WHAT I AM DOING')` — the confirmation phrase is part of the type, and afterwards get returns null.",
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* note.insert(draft);
              const removed = yield* note.hardDelete(
                key,
                'I KNOW WHAT I AM DOING',
              );
              const stored = yield* note.get(key);
              return { removedTitle: removed.value.title, stored };
            }),
          );
          yield* Story.assert(
            'the row is gone from storage, not tombstoned',
            results.sqlite.removedTitle === 'Draft' &&
              results.sqlite.stored === null,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('And emptying a whole notebook, or the whole table?', {
      answer:
        "`entity.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING')` clears only that entity's rows and reports how many it removed, while the same call on the table clears everything.",
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft);
            yield* settings.put({ theme: 'dark', perPage: 50 });
            const notesCleared = yield* note.dangerouslyRemoveAllItems(
              'I KNOW WHAT I AM DOING',
            );
            const noteAfterEntityClear = yield* note.get(key);
            const themeAfterEntityClear = (yield* settings.get()).value.theme;
            const tableCleared = yield* table.dangerouslyRemoveAllItems(
              'I KNOW WHAT I AM DOING',
            );
            const themeAfterTableClear = (yield* settings.get()).value.theme;
            return {
              notesCleared: notesCleared.itemsDeleted,
              noteAfterEntityClear,
              themeAfterEntityClear,
              tableCleared: tableCleared.itemsDeleted,
              themeAfterTableClear,
            };
          }),
        );
        yield* Story.assert(
          'clearing the Note entity spares the settings row',
          results.sqlite.notesCleared === 1 &&
            results.sqlite.noteAfterEntityClear === null &&
            results.sqlite.themeAfterEntityClear === 'dark',
        );
        yield* Story.assert(
          'clearing the table takes the settings row too',
          results.sqlite.tableCleared === 1 &&
            results.sqlite.themeAfterTableClear === 'light',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
