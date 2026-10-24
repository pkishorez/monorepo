import { Layer } from 'effect';
import { View, toReact } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { TimerLive } from './timer.ts';

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${`${seconds % 60}`.padStart(2, '0')}`;

const TimerView = View.make(TimerLive, ({ _tag, model, send, root }) => (
  <div {...root} className="flex flex-col items-center gap-6">
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <span
        className={`size-1.5 rounded-full ${
          _tag === 'Running' ? 'animate-pulse bg-emerald-500' : 'bg-border'
        }`}
      />
      {_tag}
    </span>
    <output className="font-mono text-6xl font-medium tracking-tight tabular-nums">
      {clock(model.seconds)}
    </output>
    <div className="flex gap-2">
      {_tag === 'Running' ? (
        <Button
          variant="outline"
          className="w-24"
          onClick={() => send({ _tag: 'Paused' })}
        >
          Pause
        </Button>
      ) : (
        <Button className="w-24" onClick={() => send({ _tag: 'Started' })}>
          {model.seconds === 0 ? 'Start' : 'Resume'}
        </Button>
      )}
      <Button
        variant="ghost"
        disabled={_tag === 'Running' || model.seconds === 0}
        onClick={() => send({ _tag: 'Reset' })}
      >
        Reset
      </Button>
    </div>
  </div>
));

export const TimerApp = toReact(TimerLive, TimerView, Layer.empty, {
  name: 'docs:workers',
});
