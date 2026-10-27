import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { CounterLive } from './counter.ts';

// Draws the count, and sends a Message for each button.
export const CounterView = View.make(CounterLive, ({ model, send, root }) => (
  <div {...root} className="flex flex-col items-center gap-6">
    <div className="flex items-center gap-5">
      <Button
        variant="outline"
        size="icon-lg"
        aria-label="Decrement"
        onClick={() => send({ _tag: 'Decremented' })}
      >
        <MinusIcon />
      </Button>
      <output className="min-w-[3ch] text-center text-6xl font-semibold tracking-tight tabular-nums">
        {model.count}
      </output>
      <Button
        variant="outline"
        size="icon-lg"
        aria-label="Increment"
        onClick={() => send({ _tag: 'Incremented' })}
      >
        <PlusIcon />
      </Button>
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
