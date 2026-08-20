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
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do you guard a batch on a row it does not write?', {
      answer:
        'Add a check op. `unchangedOp` takes a row you already read and asserts it has not moved since — the batch commits only if that still holds. A check writes nothing, so it yields `null` at its own position and the result tuple stays one-to-one with the ops you handed in.',
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
    }),
    Story.question('How do you guard a batch on a business rule?', {
      answer:
        '`getAndCheckOp` carries an entity invariant. Building it reads nothing: `transact` reads the keyed row at commit time, applies your check to its domain value, and guards that value. A false result reports `refused`; a missing or tombstoned row reports `missing`. Either way the batch fails before anything is submitted.',
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
    }),
    Story.question('What happens when the checked row moved?', {
      answer:
        'The batch fails with `TransactFailed` and nothing is written. The outcome report names the check op as `failed`, so you learn which assertion refused — not merely that something did.',
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
    }),
    Story.question('How do you assert a row is there, or is not?', {
      answer:
        '`existsOp` and `notExistsOp` take a key rather than a row, so they need no read at all. Use `existsOp` for "the parent I am attaching to is still there" and `notExistsOp` for "nobody claimed this name while I was deciding".',
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
    }),
    Story.question('Does a deleted row still count as existing?', {
      answer:
        'Yes. Existence is physical, not logical — a soft delete leaves a tombstone, so `existsOp` passes on it and `notExistsOp` fails. This matches what `insert` already means by "the key is taken". Reach for `unchangedOp` when you care about a delete: deleting bumps `_u`, so a stale row is caught for free.',
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
    Story.question('Can a batch be nothing but checks?', {
      answer:
        'Yes. A checks-only batch is a portable multi-row assertion: every condition is evaluated together, the call succeeds or fails as one, and nothing is written either way. The result is all `null`, one per check.',
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
    Story.question('Can you check a row the same batch also writes?', {
      answer:
        'No — checks share the ops array with writes, so they share the duplicate-target guard too, and the batch fails with `DuplicateTransactionTarget`. Nor is the check needed: `getAndUpdateOp` already carries the `_u` it read, so the write is conditional on that row all by itself.',
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
        'The `detail` on a refused op is the condition kind on every adapter, so the reason a check failed is portable. The *status* of the ops that did not fail is not, and the report says so rather than hiding it. DynamoDB evaluates every item and can name several failures at once, so an op it cleared reads `passed`. SQLite, IndexedDB, and Memory abort at the first refusal, so everything after it reads `not-evaluated`. Only the refusing entry is portable — `passed` never means "this was written", because a failed transact writes nothing at all. A moved `_u` reports `stale`, which a retry may clear; a refused invariant reports `refused`, which no retry will.',
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
    Story.question('How does a single entity guard itself?', {
      answer:
        'A single entity gets `unchangedOp` only — `existsOp` and `notExistsOp` would be meaningless for a row with one fixed key. Read it, decide, then make the batch conditional on it. A single entity you have never written reads as its default with an empty `_u`, and `unchangedOp` turns that into "still absent", so the guard is honest about a row that exists only as a default.',
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
