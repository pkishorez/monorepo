import type { ReactNode } from 'react';
import type { Snapshot } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Kbd } from '@kstackz/web-platform/components/kbd';
import { Board } from './board.js';
import { useKeys } from './keys.js';
import { Round } from './round.js';

/*
 * A round, per State: the score, what to press next, and the board. Every
 * State listens for the keys, so each draws the same Field around a status.
 */

const Field = ({
  model,
  send,
  status,
  action,
}: {
  readonly model: Snapshot<typeof Round>['model'];
  readonly send: Snapshot<typeof Round>['send'];
  readonly status: ReactNode;
  readonly action: ReactNode;
}) => {
  useKeys(send);
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xl tabular-nums">Score: {model.points}</p>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {status}
        {action}
      </div>
      <Board snake={model.snake} apple={model.apple} />
      <p className="text-xs text-muted-foreground">
        <Kbd>←</Kbd> <Kbd>↑</Kbd> <Kbd>↓</Kbd> <Kbd>→</Kbd> or <Kbd>W</Kbd>
        <Kbd>A</Kbd>
        <Kbd>S</Kbd>
        <Kbd>D</Kbd> to move, <Kbd>P</Kbd> to pause, <Kbd>R</Kbd> to restart
      </p>
    </div>
  );
};

export const RoundView = View.make(Round, {
  NotStarted: ({ model, send }) => (
    <Field
      model={model}
      send={send}
      status="Press Enter to start"
      action={
        <Button size="sm" onClick={() => send({ _tag: 'PressedStart' })}>
          Start
        </Button>
      }
    />
  ),
  Playing: ({ model, send }) => (
    <Field
      model={model}
      send={send}
      status="Playing"
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => send({ _tag: 'PressedPause' })}
        >
          Pause
        </Button>
      }
    />
  ),
  Paused: ({ model, send }) => (
    <Field
      model={model}
      send={send}
      status="Paused"
      action={
        <Button size="sm" onClick={() => send({ _tag: 'PressedPause' })}>
          Continue
        </Button>
      }
    />
  ),
  GameOver: ({ model, send }) => (
    <Field
      model={model}
      send={send}
      status="Game over"
      action={
        <Button size="sm" onClick={() => send({ _tag: 'PressedRestart' })}>
          Restart
        </Button>
      }
    />
  ),
});
