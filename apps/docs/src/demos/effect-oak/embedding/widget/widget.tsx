import { Effect, Schema, Stream } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Host } from '../port/index.js';

/*
 * The embedded widget: a count that ticks up by a step every second, or
 * when its button is clicked. The host sets the starting count and the step,
 * and hears every new count.
 *
 * `init` cannot take the host's flags, so the widget starts Waiting, and its
 * Lifetime reads them from the Host Capability. Running's Lifetime ticks and
 * hears the host's step; each new count goes out in a Command.
 */

const TICK_MS = 1000;

export const Widget = Actor.make('Widget', {
  requires: { host: Host },
  model: Schema.Struct({ count: Schema.Number, step: Schema.Number }),
  state: Schema.TaggedUnion({ Waiting: {}, Running: {} }),
  message: Schema.TaggedUnion({
    GotFlags: { initialCount: Schema.Number },
    Ticked: {},
    ClickedAdvance: {},
    ChangedStep: { step: Schema.Number },
  }),
}).build({
  init: () => ({ model: { count: 0, step: 1 }, state: { _tag: 'Waiting' } }),
  lifetime: {
    Waiting: (self) =>
      Effect.gen(function* () {
        const { initialCount } = yield* (yield* Host).flags;
        yield* self.send({ _tag: 'GotFlags', initialCount });
      }),
    Running: (self) =>
      Stream.merge(
        Stream.tick(TICK_MS).pipe(
          Stream.drop(1),
          Stream.map(() => ({ _tag: 'Ticked' as const })),
        ),
        Stream.unwrap(
          Effect.gen(function* () {
            return (yield* Host).steps;
          }),
        ).pipe(Stream.map((step) => ({ _tag: 'ChangedStep' as const, step }))),
      ).pipe(Stream.runForEach(self.send)),
  },
  update: {
    Waiting: {
      GotFlags: ({ initialCount }, { model }) => ({
        model: { ...model, count: initialCount },
        state: { _tag: 'Running' },
      }),
    },
    Running: {
      Ticked: (_, { model }) => advance(model),
      ClickedAdvance: (_, { model }) => advance(model),
      ChangedStep: ({ step }, { model }) => ({ model: { ...model, step } }),
    },
  },
});

const advance = (model: { readonly count: number; readonly step: number }) => {
  const count = model.count + model.step;
  return {
    model: { ...model, count },
    command: Effect.gen(function* () {
      yield* (yield* Host).reportCount(count);
    }),
  };
};

export const WidgetView = View.make(Widget, {
  Waiting: () => null,
  Running: ({ model, send }) => (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-teal-300 bg-teal-50 p-6 text-zinc-900 dark:border-teal-800 dark:bg-teal-950 dark:text-zinc-100">
      <div className="text-xs font-semibold tracking-wide text-teal-700 uppercase dark:text-teal-300">
        Effect Oak widget
      </div>
      <div className="text-5xl font-bold tabular-nums">{model.count}</div>
      <div className="text-sm opacity-70">
        Ticking up by {model.step} every second
      </div>
      <Button onClick={() => send({ _tag: 'ClickedAdvance' })}>
        Advance by {model.step}
      </Button>
    </div>
  ),
});
