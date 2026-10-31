import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { CounterLive } from './counter.ts';

const AMOUNTS = [1, 5, 10];

const CounterView = View.make(CounterLive, ({ model, send, root }) => (
  <div {...root} className="flex w-full max-w-60 flex-col items-center gap-6">
    <output className="text-6xl font-semibold tracking-tight tabular-nums">
      {model.count}
    </output>
    <div className="grid w-full grid-cols-3 gap-2">
      {AMOUNTS.map((amount) => (
        <Button
          key={amount}
          variant="outline"
          className="tabular-nums"
          onClick={() => send({ _tag: 'Added', amount })}
        >
          +{amount}
        </Button>
      ))}
    </div>
    <Button
      variant="ghost"
      size="sm"
      disabled={model.count === 0}
      onClick={() => send({ _tag: 'Reset' })}
    >
      Reset
    </Button>
  </div>
));

export const CounterApp = View.app(CounterView, { name: 'docs:actor' });
