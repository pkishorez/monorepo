import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { ESchema } from '@kestack/std-toolkit/eschema';

const Settings = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
}).build();
const Counter = ESchema.make('Counter', {
  saves: Schema.Finite,
}).build();

const table = StdTable.make('app')
  .primary('pk', 'sk')
  .singleEntity(Settings, { default: { theme: 'light' } })
  .singleEntity(Counter, { default: { saves: 0 } })
  .build();

export default Proof.make({
  title: 'A batch guarded by settings someone else changed does not commit',
  description:
    '`unchangedOp` asserts the record still has the stamp that was read; if another write landed, the whole batch fails as stale.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const counted = yield* table.Counter.put({ saves: 0 }).pipe(
      Effect.provide(db.layer),
    );
    const seen = yield* table.Settings.put({ theme: 'dark' }).pipe(
      Effect.provide(db.layer),
    );
    // Someone else changes the settings after we read them.
    const theirs = yield* table.Settings.put({ theme: 'light' }).pipe(
      Effect.provide(db.layer),
    );
    yield* Proof.assert(
      'the settings moved after our read',
      theirs.meta._u > seen.meta._u,
    );
    return { db, seen, counted };
  }),
  act: ({ db, seen }) =>
    Effect.gen(function* () {
      const guard = yield* table.Settings.unchangedOp(seen);
      const bump = yield* table.Counter.getAndUpdateOp((current) => ({
        saves: current.saves + 1,
      }));
      const failure = yield* table.transact([guard, bump]).pipe(
        Effect.match({
          onFailure: (error) =>
            error.reason._tag === 'TransactFailed'
              ? error.reason.operations.map(({ status }) => status)
              : [error.reason._tag],
          onSuccess: () => null,
        }),
      );
      const count = yield* table.Counter.get();
      return { statuses: failure, count };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ statuses, count }, { counted }) =>
    Effect.gen(function* () {
      yield* Proof.assert('the batch failed', statuses !== null);
      yield* Proof.assert('the guard reports stale', statuses?.[0] === 'stale');
      yield* Proof.assert(
        'the counter was not written',
        count.meta._u === counted.meta._u && count.value.saves === 0,
      );
    }),
});
