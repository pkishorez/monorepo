import { Effect } from 'effect';
import { Story } from 'laymos/story';

import {
  agree,
  note,
  parity,
  reasonOf,
  settings,
  table,
} from '../../support.js';

const draft = (noteId: string) => ({
  noteId,
  notebook: 'work',
  title: noteId,
  status: 'open',
});

const key = (noteId: string) => ({ noteId, notebook: 'work' });

type Outcome = {
  readonly status: string;
  readonly detail?: string;
  readonly op: { readonly operationKind: string };
};

const outcomes = (error: unknown): readonly Outcome[] =>
  (error as { reason?: { operations?: readonly Outcome[] } }).reason
    ?.operations ?? [];

const REFUSALS = new Set(['stale', 'refused', 'missing']);

const refusedBy = (error: unknown) =>
  outcomes(error)
    .filter(({ status }) => REFUSALS.has(status))
    .map(({ op }) => op.operationKind);

const noteIds = (written: readonly unknown[]) =>
  written.map((entity) =>
    entity === null
      ? null
      : (entity as { value: { noteId: string } }).value.noteId,
  );

export const checkOps = Story.make({
  title: 'Check ops',
  description: 'Assert that a note has not changed, without writing to it.',
  setupNote:
    'The `note` and the `settings` from `support.ts`. This Story adds check ops to batches.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note may go only into a notebook that still exists. How does a batch check a note that it does not write?',
      {
        answer:
          'Add a check op. `unchangedOp` takes a row that you already read and asserts that the row has not changed. The batch commits only while that is true. A check writes nothing, so it returns null at its own position and the result list stays the same length as the op list.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              const guard = yield* note.insert(draft('guard'));
              const check = yield* note.unchangedOp(guard);
              const write = yield* note.insertOp(draft('new'));
              const written = yield* table.transact([check, write]);
              return { positions: noteIds(written) };
            }),
          );
          yield* Story.assert(
            'the check holds, the write lands, and the check yields null in its slot',
            results.sqlite.positions.join() === ',new',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question(
      'How does a batch apply a rule to the note that it does write?',
      {
        answer:
          '`getAndCheckOp` carries a condition. Building it reads nothing. `transact` reads the row at commit time, applies your condition to its value, and protects the batch with the result.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* note.insert(draft('guard'));
              const check = yield* note.getAndCheckOp(
                key('guard'),
                ({ status }) => status === 'open',
              );
              const write = yield* note.insertOp(draft('new'));
              const written = yield* table.transact([check, write]);
              const error = yield* table
                .transact([
                  yield* note.getAndCheckOp(
                    key('guard'),
                    ({ status }) => status === 'closed',
                  ),
                  yield* note.insertOp(draft('never')),
                ])
                .pipe(Effect.flip);
              return {
                positions: noteIds(written),
                refused: reasonOf(error),
                statuses: outcomes(error).map(({ status }) => status),
                neverWritten: (yield* note.get(key('never'))) !== null,
              };
            }),
          );
          yield* Story.assert(
            'the accepted value guards the write and a refused invariant stops the batch',
            results.sqlite.positions.join() === ',new' &&
              results.sqlite.refused === 'TransactFailed' &&
              results.sqlite.statuses[0] === 'refused' &&
              results.sqlite.neverWritten === false,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question(
      'Someone changed that notebook just before the commit. What happens?',
      {
        answer:
          'The batch fails and nothing is written. The report names the check op as the one that failed, so you learn which assertion refused.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              const guard = yield* note.insert(draft('guard'));
              const check = yield* note.unchangedOp(guard);
              yield* note.getAndUpdate(key('guard'), { status: 'moved' });
              const write = yield* note.insertOp(draft('new'));
              const error = yield* table
                .transact([check, write])
                .pipe(Effect.flip);
              const stored = yield* note.get(key('new'));
              return {
                reason: reasonOf(error),
                refusedBy: refusedBy(error),
                written: stored !== null,
              };
            }),
          );
          yield* Story.assert(
            'the check refuses the batch and the sibling write is rolled back',
            results.sqlite.reason === 'TransactFailed' &&
              results.sqlite.refusedBy.join() === 'checkOp' &&
              results.sqlite.written === false,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question(
      'How does a batch assert that a note is there, or is not there?',
      {
        answer:
          '`existsOp` and `notExistsOp` take a key rather than a row, so they need no read. Use `existsOp` when a parent must still be there. Use `notExistsOp` when a key must still be free.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* note.insert(draft('parent'));
              const holds = yield* Effect.all([
                note.existsOp(key('parent')),
                note.notExistsOp(key('archived')),
                note.insertOp(draft('child')),
              ]);
              const written = yield* table.transact(holds);

              const missingParent = yield* note.existsOp(key('ghost'));
              const alsoNew = yield* note.insertOp(draft('other'));
              const error = yield* table
                .transact([missingParent, alsoNew])
                .pipe(Effect.flip);
              return {
                positions: noteIds(written),
                reason: reasonOf(error),
                refusedBy: refusedBy(error),
                otherWritten: (yield* note.get(key('other'))) !== null,
              };
            }),
          );
          yield* Story.assert(
            'both assertions hold and only the write occupies a slot',
            results.sqlite.positions.join() === ',,child',
          );
          yield* Story.assert(
            'a missing row fails `existsOp` and takes the batch with it',
            results.sqlite.reason === 'TransactFailed' &&
              results.sqlite.refusedBy.join() === 'checkOp' &&
              results.sqlite.otherWritten === false,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('Does a deleted note still count as being there?', {
      answer:
        'Yes. Existence is physical, not logical. A delete leaves a marked row, so `existsOp` passes on it and `notExistsOp` fails. This matches what a write already means on the same key.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft('gone'));
            yield* note.delete(key('gone'));

            const exists = yield* note.existsOp(key('gone'));
            const one = yield* note.insertOp(draft('a'));
            const onTombstone = yield* table
              .transact([exists, one])
              .pipe(Effect.result);

            const absent = yield* note.notExistsOp(key('gone'));
            const two = yield* note.insertOp(draft('b'));
            const asIfAbsent = yield* table
              .transact([absent, two])
              .pipe(Effect.result);

            return {
              existsPasses: onTombstone._tag === 'Success',
              notExistsPasses: asIfAbsent._tag === 'Success',
            };
          }),
        );
        yield* Story.assert(
          'the tombstone still exists as far as a check is concerned',
          results.sqlite.existsPasses === true &&
            results.sqlite.notExistsPasses === false,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('Can a batch write nothing at all?', {
      answer:
        'Yes. A batch of checks only is an assertion over several rows. Each condition runs together. The call succeeds or fails as one, and nothing is written.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const guard = yield* note.insert(draft('guard'));
            const checks = yield* Effect.all([
              note.unchangedOp(guard),
              note.notExistsOp(key('ghost')),
            ]);
            const written = yield* table.transact(checks);
            const stored = yield* note.get(key('guard'));
            return {
              positions: noteIds(written),
              guardUntouched: stored?.meta._u === guard.meta._u,
            };
          }),
        );
        yield* Story.assert(
          'both checks pass, both slots are null, and nothing was written',
          results.sqlite.positions.length === 2 &&
            results.sqlite.positions.every((slot) => slot === null) &&
            results.sqlite.guardUntouched === true,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('Can a batch check a note that it also writes?', {
      answer:
        'No. Checks share the op list with writes, so they share the rule that one row may be touched one time. The batch fails. The check is also not needed, because a write op can carry its own condition.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft('n1'));
            const check = yield* note.existsOp(key('n1'));
            const write = yield* note.getAndUpdateOp(key('n1'), {
              status: 'claimed',
            });
            const error = yield* table
              .transact([check, write])
              .pipe(Effect.flip);
            const stored = yield* note.get(key('n1'));
            return {
              reason: reasonOf(error),
              status: stored?.value.status ?? null,
            };
          }),
        );
        yield* Story.assert(
          'the collision is refused before anything is written',
          results.sqlite.reason === 'DuplicateTransactionTarget' &&
            results.sqlite.status === 'open',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('What do the ops that did not fail report?', {
      answer:
        'The reason that a refused op gives is the same on each database, so you can rely on it. The status of the ops that did not fail is not the same on each database, so do not rely on that.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const guard = yield* note.insert(draft('guard'));
            const check = yield* note.unchangedOp(guard);
            yield* note.getAndUpdate(key('guard'), { status: 'moved' });
            const write = yield* note.insertOp(draft('new'));
            const error = yield* table
              .transact([check, write])
              .pipe(Effect.flip);
            return {
              statuses: outcomes(error).map(({ status }) => status),
              refusedDetail: outcomes(error).find(({ status }) =>
                REFUSALS.has(status),
              )?.detail,
            };
          }),
        );
        yield* Story.assert(
          'every adapter marks the check that refused',
          [results.dynamodb, results.idb, results.memory, results.sqlite].every(
            ({ statuses }) => statuses[0] === 'stale',
          ),
        );
        yield* Story.assert(
          'every adapter names the same condition kind as the reason',
          [results.dynamodb, results.idb, results.memory, results.sqlite].every(
            ({ refusedDetail }) => refusedDetail === 'updated',
          ),
        );
        yield* Story.assert(
          'the untouched sibling reads `passed` on DynamoDB and `not-evaluated` on the rest',
          results.dynamodb.statuses[1] === 'passed' &&
            results.idb.statuses[1] === 'not-evaluated' &&
            results.memory.statuses[1] === 'not-evaluated' &&
            results.sqlite.statuses[1] === 'not-evaluated',
        );
        return results;
      }),
    }),
    Story.question('How do the notebook settings apply a rule to themselves?', {
      answer:
        'A single entity accepts `unchangedOp` only. `existsOp` and `notExistsOp` have no meaning for a row with one fixed key. Read the row, decide, and then build the batch.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const untouched = yield* settings.get();
            const stillDefault = yield* settings.unchangedOp(untouched);
            const first = yield* note.insertOp(draft('a'));
            const onDefault = yield* table
              .transact([stillDefault, first])
              .pipe(Effect.result);

            yield* settings.getAndUpdate({ theme: 'dark' });
            const stale = yield* settings.unchangedOp(untouched);
            const second = yield* note.insertOp(draft('b'));
            const error = yield* table
              .transact([stale, second])
              .pipe(Effect.flip);

            return {
              defaultVersion: untouched.meta._u,
              guardedWhileAbsent: onDefault._tag === 'Success',
              reason: reasonOf(error),
              refusedBy: refusedBy(error),
              bWritten: (yield* note.get(key('b'))) !== null,
            };
          }),
        );
        yield* Story.assert(
          'a never-written single entity guards as "still absent"',
          results.sqlite.defaultVersion === '' &&
            results.sqlite.guardedWhileAbsent === true,
        );
        yield* Story.assert(
          'once written, the stale guard refuses the batch',
          results.sqlite.reason === 'TransactFailed' &&
            results.sqlite.refusedBy.join() === 'checkOp' &&
            results.sqlite.bWritten === false,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
