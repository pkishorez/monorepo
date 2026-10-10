import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const refusal = (build: () => unknown) =>
  Effect.sync(() => {
    try {
      build();
      return { refused: false, message: null };
    } catch (error) {
      return { refused: true, message: String(error) };
    }
  });

export default Proof.make({
  title:
    'A field that cannot be saved as plain JSON is refused when you define the shape',
  description:
    '`Schema.Date` stores a Date object, which no snapshot can describe; `Schema.DateFromString` stores an ISO string and is accepted.',
  prepare: Effect.gen(function* () {
    // The accepted form: a Date in code, an ISO string in storage.
    const accepted = yield* refusal(() =>
      EntityESchema.make('Task', 'taskId', {
        dueAt: Schema.DateFromString,
      }).build(),
    );
    yield* Proof.assert('DateFromString is accepted', !accepted.refused);
    return { accepted };
  }),
  act: () =>
    Effect.gen(function* () {
      const date = yield* refusal(() =>
        EntityESchema.make('Task', 'taskId', { dueAt: Schema.Date }).build(),
      );
      const bigint = yield* refusal(() =>
        EntityESchema.make('Task', 'taskId', {
          estimate: Schema.BigInt,
        }).build(),
      );
      return { date, bigint };
    }),
  verify: ({ date, bigint }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'Schema.Date is refused, naming the field',
        date.refused && date.message?.includes('dueAt') === true,
      );
      yield* Proof.assert(
        'Schema.BigInt is refused, naming the field',
        bigint.refused && bigint.message?.includes('estimate') === true,
      );
    }),
});
