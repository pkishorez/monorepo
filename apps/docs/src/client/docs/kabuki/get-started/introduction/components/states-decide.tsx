import type { ReactNode } from 'react';
import { Layer } from 'effect';
import { View, toReact } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { TimerLive } from './timer.ts';

/*
 * The Timer, running, beside what is inside it: its State, its Model, the
 * Workers alive right now and the last Messages. Start it and the tick
 * Worker appears; pause it and the Worker is gone.
 */

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${`${seconds % 60}`.padStart(2, '0')}`;

const TimerView = View.make(TimerLive, ({ _tag, model, send, root }) => (
  <div {...root} className="flex flex-col items-center gap-5">
    <output className="font-mono text-5xl font-medium tabular-nums">
      {clock(model.seconds)}
    </output>
    {_tag === 'Running' ? (
      <Button variant="outline" onClick={() => send({ _tag: 'Paused' })}>
        Pause
      </Button>
    ) : (
      <Button onClick={() => send({ _tag: 'Started' })}>Start</Button>
    )}
  </div>
));

const App = toReact(TimerLive, TimerView, Layer.empty, {
  name: 'docs:introduction',
});

function Row({
  name,
  children,
}: {
  readonly name: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-2">
      <dt className="text-muted-foreground">{name}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Inside() {
  const { history, head, branch, workers } = App.useRuntime();
  const timer = history.snapshotAt(head);
  const running = workers(timer.id).filter((w) => w.status === 'running');
  const recent = branch.slice(-4).reverse();
  return (
    <dl className="divide-y divide-border font-mono text-xs">
      <Row name="State">
        <span
          className={`rounded px-1.5 py-0.5 ${
            timer.state._tag === 'Running'
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted'
          }`}
        >
          {timer.state._tag}
        </span>
      </Row>
      <Row name="Model">{JSON.stringify(timer.model)}</Row>
      <Row name="Workers">
        {running.length === 0 ? (
          <span className="text-muted-foreground">none</span>
        ) : (
          running.map((worker) => (
            <span key={worker.name} className="flex items-center gap-2">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              {worker.name}
            </span>
          ))
        )}
      </Row>
      <Row name="Messages">
        {recent.length === 0 ? (
          <p className="min-h-[5.5rem] text-muted-foreground">none yet</p>
        ) : (
          <ol className="min-h-[5.5rem] space-y-1">
            {recent.map((entry) => (
              <li
                key={entry.id}
                className="first:text-foreground text-muted-foreground"
              >
                {entry.message._tag}
              </li>
            ))}
          </ol>
        )}
      </Row>
    </dl>
  );
}

export function StatesDecide() {
  return (
    <div className="grid sm:grid-cols-2">
      <div className="grid place-items-center p-8">
        <App />
      </div>
      <div className="border-t border-border bg-muted/30 px-5 py-3 sm:border-t-0 sm:border-l">
        <Inside />
      </div>
    </div>
  );
}
