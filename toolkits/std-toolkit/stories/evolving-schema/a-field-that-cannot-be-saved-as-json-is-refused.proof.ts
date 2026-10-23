import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

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
    '`Schema.Date` stores a Date object and `Schema.Number` allows NaN and Infinity, which JSON turns into null; `Schema.DateFromString` and `Schema.Finite` are accepted.',
  prepare: Effect.gen(function* () {
    // The accepted form: a Date in code, an ISO string in storage.
    const accepted = yield* refusal(() =>
      EntityESchema.make('Task', 'taskId', {
        dueAt: Schema.DateFromString,
        hours: Schema.Finite,
      }).build(),
    );
    yield* Proof.assert(
      'DateFromString and Finite are accepted',
      !accepted.refused,
    );
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
      const number = yield* refusal(() =>
        EntityESchema.make('Task', 'taskId', { hours: Schema.Number }).build(),
      );
      return { date, bigint, number };
    }),
  verify: ({ date, bigint, number }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'Schema.Date is refused, naming the field',
        date.refused && date.message?.includes('dueAt') === true,
      );
      yield* Proof.assert(
        'Schema.BigInt is refused, naming the field',
        bigint.refused && bigint.message?.includes('estimate') === true,
      );
      yield* Proof.assert(
        'Schema.Number is refused, naming the field and the fix',
        number.refused &&
          number.message?.includes('hours') === true &&
          number.message.includes('Schema.Finite'),
      );
    }),
});
