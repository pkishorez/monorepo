import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { CounterLive } from './counter.ts';

const CounterView = View.make(CounterLive, ({ model, send, root }) => (
  <div {...root} className="flex items-center gap-4">
    <Button variant="outline" onClick={() => send({ _tag: 'Decremented' })}>
      −
    </Button>
    <output className="w-12 text-center text-3xl tabular-nums">
      {model.count}
    </output>
    <Button variant="outline" onClick={() => send({ _tag: 'Incremented' })}>
      +
    </Button>
    <Button variant="ghost" onClick={() => send({ _tag: 'Reset' })}>
      Reset
    </Button>
  </div>
));

export const CounterApp = View.app(CounterView);
