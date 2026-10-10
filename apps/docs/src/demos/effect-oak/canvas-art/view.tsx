import { View } from 'effect-oak/react';
import type { MotionValue } from 'motion/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Board } from './board/index.js';
import { ballAt, Box, clockAt, HEIGHT, WIDTH } from './canvas-art.js';

/*
 * Both States draw the same box; Paused just has a clock that stands still.
 * The board works out where each ball is at each Frame from that clock.
 */

type Ball = Parameters<typeof ballAt>[0];

const Scene = ({
  balls,
  running,
  clock,
  frame,
  send,
}: {
  readonly balls: ReadonlyArray<Ball>;
  readonly running: boolean;
  readonly clock: (at: number) => number;
  readonly frame: MotionValue<number>;
  readonly send: (
    message:
      | {
          readonly _tag: 'ClickedCanvas';
          readonly x: number;
          readonly y: number;
        }
      | { readonly _tag: 'ClickedTogglePlay' }
      | { readonly _tag: 'ClickedClear' },
  ) => void;
}) => (
  <div className="flex size-full overflow-y-auto p-4">
    <div className="m-auto flex w-full flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground">
        Click the canvas to spawn a ball.
      </p>
      <Board
        width={WIDTH}
        height={HEIGHT}
        frame={frame}
        ballsAt={(at) => balls.map((ball) => ballAt(ball, clock(at)))}
        onPress={({ x, y }) => send({ _tag: 'ClickedCanvas', x, y })}
      />
      <div className="flex items-center gap-2">
        <Button
          className="min-w-20"
          onClick={() => send({ _tag: 'ClickedTogglePlay' })}
        >
          {running ? 'Pause' : 'Play'}
        </Button>
        <Button
          variant="outline"
          onClick={() => send({ _tag: 'ClickedClear' })}
        >
          Clear
        </Button>
        <p className="px-2 text-sm text-muted-foreground">
          <span className="inline-block min-w-8 text-right tabular-nums">
            {balls.length}
          </span>{' '}
          balls
        </p>
      </div>
    </div>
  </div>
);

export const BoxView = View.make(Box, {
  Running: ({ model, state, send, frame }) => (
    <Scene
      balls={model.balls}
      running
      clock={(at) => clockAt(state, at)}
      frame={frame}
      send={send}
    />
  ),
  Paused: ({ model, state, send, frame }) => (
    <Scene
      balls={model.balls}
      running={false}
      clock={() => state.clock}
      frame={frame}
      send={send}
    />
  ),
});
