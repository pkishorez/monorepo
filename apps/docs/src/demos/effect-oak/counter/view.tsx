import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Counter } from './counter.js';

export const CounterView = View.make(Counter, ({ model, send }) => (
  <div className="flex size-full flex-col items-center justify-center gap-6">
    <p className="text-6xl font-semibold tabular-nums">{model.count}</p>
    <div className="flex gap-2">
      <Button
        variant="outline"
        aria-label="-"
        onClick={() => send({ _tag: 'ClickedDecrement' })}
      >
        −
      </Button>
      <Button variant="outline" onClick={() => send({ _tag: 'ClickedReset' })}>
        Reset
      </Button>
      <Button
        variant="outline"
        aria-label="+"
        onClick={() => send({ _tag: 'ClickedIncrement' })}
      >
        +
      </Button>
    </div>
  </div>
));
