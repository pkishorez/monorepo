import { Context, Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';

/*
 * Squares the next number on whatever engine is Provided above it. It can
 * only be placed where an Engine is Provided, so it exists only while the
 * engine is on, and stopping the engine interrupts a square in flight.
 */

/** A running engine, as the Nodes below the one that started it see it. */
export class Engine extends Context.Service<
  Engine,
  { readonly square: (value: number) => Effect.Effect<number, 'NotRunning'> }
>()('docs/managed-resource-layer/Engine') {}

export const Calculator = Node.make('Calculator', {
  requires: { engine: Engine },
  model: Schema.Struct({
    computeCount: Schema.Number,
    result: Schema.NullOr(Schema.Number),
  }),
  message: Schema.TaggedUnion({
    ClickedCompute: {},
    CompletedCompute: { result: Schema.Number },
    SkippedCompute: {},
  }),
}).build({
  init: () => ({ model: { computeCount: 0, result: null } }),
  update: {
    ClickedCompute: (_, { model }) => {
      const value = model.computeCount + 1;
      return {
        model: { ...model, computeCount: value },
        commands: [
          Effect.gen(function* () {
            const result = yield* (yield* Engine).square(value);
            return { _tag: 'CompletedCompute' as const, result };
          }).pipe(
            Effect.orElseSucceed(() => ({ _tag: 'SkippedCompute' as const })),
          ),
        ],
      };
    },
    CompletedCompute: ({ result }, { model }) => ({
      model: { ...model, result },
    }),
    SkippedCompute: () => ({}),
  },
});

export const CalculatorView = View.make(Calculator, ({ model, send }) => (
  <div className="flex flex-col gap-3">
    <Button onClick={() => send({ _tag: 'ClickedCompute' })}>
      Compute next square
    </Button>
    <p className="tabular-nums">
      {model.result === null
        ? 'No result yet.'
        : `Square result: ${model.result}`}
    </p>
  </div>
));
