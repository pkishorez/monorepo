import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf, table } from '../../support.js';

const key = { noteId: 'n1', notebook: 'work' };

const statuses = (error: unknown): readonly string[] =>
  (
    (error as { reason?: { operations?: readonly { status: string }[] } })
      .reason?.operations ?? []
  ).map((operation) => operation.status);

const draft = (noteId: string) => ({
  noteId,
  notebook: 'work',
  title: noteId,
  status: 'open',
});

export const staleOps = Story.make({
  title: 'Stale ops',
  description:
    'An op carries intent, not a snapshot, so time between building it and committing it cannot spoil it.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens if the row changed after the op was built?', {
      answer:
        'The batch still commits. An op carries intent only, so `transact` reads the row at commit time and applies the update to what it read. The interval between building an op and committing it cannot make it stale.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft('n1'));
            const held = yield* note.getAndUpdateOp(key, (current) => ({
              title: `${current.title}!`,
            }));
            yield* note.getAndUpdate(key, { status: 'newer' });
            const sibling = yield* note.insertOp(draft('n2'));
            yield* table.transact([sibling, held]);
            const current = yield* note.get(key);
            const other = yield* note.get({ noteId: 'n2', notebook: 'work' });
            return {
              title: current?.value.title ?? null,
              status: current?.value.status ?? null,
              siblingWritten: other !== null,
            };
          }),
        );
        yield* Story.assert(
          'the op applied to the newer value, and its sibling landed too',
          results.sqlite.title === 'n1!' &&
            results.sqlite.status === 'newer' &&
            results.sqlite.siblingWritten === true,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('How do you guard a rule you decided before the batch?', {
      answer:
        'Give the op an entity invariant through `check`. Transact evaluates it against the value it reads and fails the batch before submitting anything, so the whole batch rolls back. The failure names every operation: the refusing op reports `refused`.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft('n1'));
            yield* note.getAndUpdate(key, { status: 'newer' });
            const guarded = yield* note.getAndUpdateOp(
              key,
              { status: 'from-op' },
              { check: (current) => current.status === 'open' },
            );
            const sibling = yield* note.insertOp(draft('n2'));
            const error = yield* table
              .transact([sibling, guarded])
              .pipe(Effect.flip);
            const current = yield* note.get(key);
            const other = yield* note.get({ noteId: 'n2', notebook: 'work' });
            return {
              reason: reasonOf(error),
              statuses: statuses(error),
              status: current?.value.status ?? null,
              siblingWritten: other !== null,
            };
          }),
        );
        yield* Story.assert(
          'the refused op takes the batch with it',
          results.sqlite.reason === 'TransactFailed' &&
            results.sqlite.status === 'newer' &&
            results.sqlite.siblingWritten === false,
        );
        yield* Story.assert(
          'the failure points at the refusing op, not its sibling',
          results.sqlite.statuses[1] === 'refused' &&
            results.sqlite.statuses[0] === 'passed',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('How do you write anyway?', {
      answer:
        'Build the op with `{ lastWriteWins: true }` — it drops the version guard, so the write lands over whatever `transact` read.',
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
