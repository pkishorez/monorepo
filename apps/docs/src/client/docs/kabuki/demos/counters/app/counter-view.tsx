import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  MinusIcon,
  PlusIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { CounterLive } from './counter.ts';

// Draws one Counter: its place from the Props, its count from the Model.
export const CounterView = View.make(
  CounterLive,
  ({ model, props, send, root }) => (
    <div {...root} className="flex min-w-0 flex-1 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        Counter {props.place}
      </span>
      <Button
        variant="outline"
        size="icon-lg"
        aria-label={`Decrement counter ${props.place}`}
        onClick={() => send({ _tag: 'Decremented' })}
      >
        <MinusIcon />
      </Button>
      <output className="min-w-[3ch] text-center text-lg font-semibold tabular-nums">
        {model.count}
      </output>
      <Button
        variant="outline"
        size="icon-lg"
        aria-label={`Increment counter ${props.place}`}
        onClick={() => send({ _tag: 'Incremented' })}
      >
        <PlusIcon />
      </Button>
    </div>
  ),
);
