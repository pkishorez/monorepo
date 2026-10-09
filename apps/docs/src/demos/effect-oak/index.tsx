import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { toReact } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Auth, AuthView } from './auth/index.js';
import { LogPanel } from './log-panel.js';
import { ServerLive } from './services/index.js';
import { Timeline } from './timeline.js';

/** The whole demo app: one Node tree, one Layer, one React component. */
const DemoApp = toReact(Auth, AuthView, ServerLive);

const TRY = [
  'Press Enter twice quickly. The second Submitted is ignored: Submitting has no rule for it.',
  'Sign out, or let the session run out. Todos and the timer are destroyed with their State.',
  'Drag the timeline. The app is replayed from its Messages alone while the live one keeps running.',
];

export function EffectOakDemo() {
  const [run, setRun] = useState(0);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-2.5">
        <Link
          to="/"
          aria-label="Back home"
          className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="shrink-0 font-semibold tracking-tight">Effect Oak</h1>
          <p className="hidden truncate text-sm text-muted-foreground sm:block">
            One tree of state machines, drawn by React
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setRun((n) => n + 1)}>
          <RotateCcw /> Restart
        </Button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <Stage run={run} />
        <Inspector />
      </main>
    </div>
  );
}

/** The app on a quiet canvas, with what it is showing right now. */
function Stage({ run }: { readonly run: number }) {
  const { at, messages, travel } = DemoApp.useTimeTravel();
  const past = at !== null;

  return (
    <section className="flex flex-col items-center gap-5 overflow-y-auto bg-muted/30 px-6 py-10">
      <div className="flex h-7 w-full max-w-sm items-center justify-between">
        {past ? (
          <>
            <span className="flex items-center gap-2 text-sm">
              <span className="size-2 rounded-full bg-primary" />
              <span>
                Replaying{' '}
                <span className="text-muted-foreground tabular-nums">
                  {at === 0 ? 'the start' : `${at} of ${messages.length}`}
                </span>
              </span>
            </span>
            <Button size="sm" onClick={() => travel(null)}>
              Back to live
            </Button>
          </>
        ) : (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        )}
      </div>

      <div
        inert={past}
        className={`w-full max-w-sm rounded-xl border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_8px_rgb(0_0_0/0.04),0_12px_24px_rgb(0_0_0/0.06)] transition-[box-shadow] duration-150 ${
          past ? 'ring-2 ring-primary/40' : ''
        }`}
      >
        <DemoApp key={run} />
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2 pt-2">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Try this
        </h2>
        <ul className="flex flex-col gap-1.5 text-sm text-pretty text-muted-foreground">
          {TRY.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-border">
                —
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The Log and the timeline. Only this re-renders when a Message arrives. */
function Inspector() {
  const log = DemoApp.useLog();
  const { messages, at, travel } = DemoApp.useTimeTravel();

  return (
    <aside className="flex min-h-0 flex-col border-t md:border-t-0 md:border-l">
      <div className="flex items-baseline justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">Messages</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {log.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <LogPanel log={log} at={at} onPick={travel} />
      </div>
      <Timeline length={messages.length} at={at} travel={travel} />
    </aside>
  );
}
