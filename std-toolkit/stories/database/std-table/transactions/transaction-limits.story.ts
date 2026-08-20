import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf, table } from '../../support.js';

const draft = (noteId: string) => ({
  noteId,
  notebook: 'work',
  title: noteId,
  status: 'open',
});

const jobOp = {
  tableName: 'jobs-table',
  target: 'Job#j1',
  operationKind: 'insertOp',
  apply: () => {
    throw new Error('a foreign op is never applied');
  },
};

export const transactionLimits = Story.make({
  title: 'Transaction limits',
  description: 'One row may be touched at most once per transaction.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'One batch tries to touch the same note twice. What happens?',
      {
        answer:
          'The batch fails with `DuplicateTransactionTarget` before anything is written — one row may be touched at most once per transaction.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              const op = yield* note.insertOp(draft('n1'));
              const error = yield* table.transact([op, op]).pipe(Effect.flip);
              const stored = yield* note.get({
                noteId: 'n1',
                notebook: 'work',
              });
              return { reason: reasonOf(error), written: stored !== null };
            }),
          );
          yield* Story.assert(
            'the duplicate target is rejected and nothing is written',
            results.sqlite.reason === 'DuplicateTransactionTarget' &&
              results.sqlite.written === false,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('How many notes can one batch touch?', {
      answer:
        'One hundred — a batch of 100 commits, and the 101st op makes the whole batch fail with `TransactionTooLarge`.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const ops = yield* Effect.forEach(
              Array.from({ length: 101 }, (_, index) =>
                String(index + 1).padStart(3, '0'),
              ),
              (suffix) => note.insertOp(draft(`n${suffix}`)),
            );
            const written = yield* table.transact(ops.slice(0, 100));
            const error = yield* table.transact(ops).pipe(Effect.flip);
            return { written: written.length, reason: reasonOf(error) };
          }),
        );
        yield* Story.assert(
          'one hundred ops commit and one hundred and one are refused',
          results.sqlite.written === 100 &&
            results.sqlite.reason === 'TransactionTooLarge',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('And an op built against another table?', {
      answer:
        'The batch fails with `ForeignTransactionItem` — a transaction never spans two tables.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const mine = yield* note.insertOp(draft('n1'));
            const error = yield* table
              .transact([mine, jobOp as never])
              .pipe(Effect.flip);
            const stored = yield* note.get({ noteId: 'n1', notebook: 'work' });
            return { reason: reasonOf(error), written: stored !== null };
          }),
        );
        yield* Story.assert(
          'the foreign op is refused and nothing is written',
          results.sqlite.reason === 'ForeignTransactionItem' &&
            results.sqlite.written === false,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
