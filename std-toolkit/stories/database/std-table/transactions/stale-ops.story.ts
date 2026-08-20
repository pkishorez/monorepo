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
    'An op carries intent, not a copy of the row. Time cannot make it wrong.',
  setupNote:
    'The `note` from `support.ts`. The note changes between building an op and committing it.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The note changed between building the batch and committing it. Is the batch wrong?',
      {
        answer:
          'No. The batch still commits. An op carries intent only. `transact` reads the row at commit time and applies the change to what it read.',
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
      },
    ),
    Story.question('How does a rule that was decided earlier still apply?', {
      answer:
        'Attach a condition to the op. `transact` runs the condition against the row that it read, so the rule applies at commit time.',
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
    Story.question('How does the write go through in any case?', {
      answer:
        'Build the op with no condition. `transact` then applies the change to whatever it reads.',
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
