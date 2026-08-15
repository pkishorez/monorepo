import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf, table } from '../support.js';

const key = { noteId: 'n1', notebook: 'work' };

const draft = (noteId: string) => ({
  noteId,
  notebook: 'work',
  title: noteId,
  status: 'open',
});

export const staleOps = Story.make({
  title: 'Stale ops',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens if the row changed after the op was built?', {
      answer:
        'The batch fails with `ConditionFailed` and nothing is written — a buffered op carries the version it read and refuses to overwrite a newer one.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft('n1'));
            const stale = yield* note.getAndUpdateOp(key, {
              status: 'from-op',
            });
            yield* note.getAndUpdate(key, { status: 'newer' });
            const sibling = yield* note.insertOp(draft('n2'));
            const error = yield* table
              .transact([sibling, stale])
              .pipe(Effect.flip);
            const current = yield* note.get(key);
            const other = yield* note.get({ noteId: 'n2', notebook: 'work' });
            return {
              reason: reasonOf(error),
              status: current?.value.status ?? null,
              siblingWritten: other !== null,
            };
          }),
        );
        yield* Story.assert(
          'the stale op is refused and the newer value survives',
          results.sqlite.reason === 'ConditionFailed' &&
            results.sqlite.status === 'newer' &&
            results.sqlite.siblingWritten === false,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('How do you write anyway?', {
      answer:
        'Build the op with `{ lastWriteWins: true }` — it drops the version guard and applies over whatever is stored.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft('n1'));
            const op = yield* note.getAndUpdateOp(
              key,
              { status: 'from-op' },
              { lastWriteWins: true },
            );
            yield* note.getAndUpdate(key, { status: 'newer' });
            yield* table.transact([op]);
            const current = yield* note.get(key);
            return { status: current?.value.status ?? null };
          }),
        );
        yield* Story.assert(
          'the op wins over the newer value',
          results.sqlite.status === 'from-op',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
