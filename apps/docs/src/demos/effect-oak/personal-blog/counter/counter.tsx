import { Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';

/* The live island in a post: a count you step up and down. */

export const Counter = Actor.make('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({ ClickedDecrement: {}, ClickedIncrement: {} }),
}).build({
  init: () => ({ model: { count: 0 } }),
  update: {
    ClickedDecrement: (_, { model }) => ({
      model: { count: model.count - 1 },
    }),
    ClickedIncrement: (_, { model }) => ({
      model: { count: model.count + 1 },
    }),
  },
});

const ROUND =
  'size-9 rounded-full border text-lg leading-none hover:bg-muted transition';

export const CounterView = View.make(Counter, ({ model, send }) => (
  <div className="flex items-center gap-4">
    <button
      type="button"
      aria-label="Decrement"
      className={ROUND}
      onClick={() => send({ _tag: 'ClickedDecrement' })}
    >
      −
    </button>
    <span className="w-12 text-center font-mono text-2xl tabular-nums">
      {model.count}
    </span>
    <button
      type="button"
      aria-label="Increment"
      className={ROUND}
      onClick={() => send({ _tag: 'ClickedIncrement' })}
    >
      +
    </button>
  </div>
));
