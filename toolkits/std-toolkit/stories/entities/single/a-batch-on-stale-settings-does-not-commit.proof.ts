import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { ESchema } from '@kstackz/std-toolkit/eschema';

const Settings = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
}).build();
const Counter = ESchema.make('Counter', {
  saves: Schema.Number,
}).build();

const table = StdTable.make('app').primary('pk', 'sk').build();
const settings = table.singleEntity(Settings).default({ theme: 'light' });
const counter = table.singleEntity(Counter).default({ saves: 0 });

export default Proof.make({
  title: 'A batch guarded by settings someone else changed does not commit',
  description:
    '`unchangedOp` asserts the record still has the stamp that was read; if another write landed, the whole batch fails as stale.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const counted = yield* counter
      .put({ saves: 0 })
      .pipe(Effect.provide(db.layer));
    const seen = yield* settings
      .put({ theme: 'dark' })
      .pipe(Effect.provide(db.layer));
    // Someone else changes the settings after we read them.
    const theirs = yield* settings
      .put({ theme: 'light' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'the settings moved after our read',
      theirs.meta._u > seen.meta._u,
    );
    return { db, seen, counted };
  }),
  act: ({ db, seen }) =>
    Effect.gen(function* () {
      const guard = yield* settings.unchangedOp(seen);
      const bump = yield* counter.getAndUpdateOp((current) => ({
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
      const count = yield* counter.get();
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
