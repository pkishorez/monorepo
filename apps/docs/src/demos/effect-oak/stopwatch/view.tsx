import type { ReactNode } from 'react';
import { View } from 'effect-oak/react';
import type { MotionValue } from 'motion/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Face } from './face.js';
import { elapsedAt, Stopwatch } from './stopwatch.js';

const Dial = ({
  frame,
  elapsed,
  children,
}: {
  readonly frame: MotionValue<number>;
  readonly elapsed: (at: number) => number;
  readonly children: ReactNode;
}) => (
  <div className="flex size-full flex-col items-center justify-center gap-6">
    <Face frame={frame} elapsed={elapsed} />
    <div className="flex gap-2">{children}</div>
  </div>
);

export const StopwatchView = View.make(
  Stopwatch,
  ({ _tag, state, send, frame }) => (
    <Dial
      frame={frame}
      elapsed={
        _tag === 'Running' ? (at) => elapsedAt(state, at) : () => state.elapsed
      }
    >
      <Button variant="outline" onClick={() => send({ _tag: 'ClickedReset' })}>
        Reset
      </Button>
      {_tag === 'Running' ? (
        <Button
          variant="destructive"
          onClick={() => send({ _tag: 'ClickedStop' })}
        >
          Stop
        </Button>
      ) : (
        <Button onClick={() => send({ _tag: 'ClickedStart' })}>Start</Button>
      )}
    </Dial>
  ),
);
