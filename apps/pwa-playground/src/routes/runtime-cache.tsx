import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { clearRuntimeCache } from '@kstackz/pwa-toolkit/react';
import { cn } from '@kstackz/ui-toolkit/utils';
import { useState } from 'react';
import {
  Actions,
  Checklist,
  Code,
  Controls,
  Hint,
  Notice,
  Page,
  Playground,
  Segmented,
  Stage,
  Value,
  Values,
} from '../components/index.ts';
import {
  TIME_STRATEGIES,
  type TimeStrategy,
  timeUrl,
} from '../lib/strategies.ts';
import { type Served, servedFetch } from '../lib/served.ts';

export const Route = createFileRoute('/runtime-cache')({
  component: RuntimeCache,
});

const LABEL: Record<TimeStrategy, string> = {
  'network-first': 'Network first',
  'cache-first': 'Cache first',
  'stale-while-revalidate': 'Stale while revalidate',
  'network-only': 'Network only',
};

const EXPECTED: Record<TimeStrategy, string> = {
  'network-first':
    'Fresh while online. Offline, or slower than 2 s: the last saved answer.',
  'cache-first': 'The first answer, forever, until the cache is cleared.',
  'stale-while-revalidate':
    'The saved answer at once, while the network refreshes it for next time.',
  'network-only': 'Always fresh. Offline: an error.',
};

type Call = Served & { readonly n: number; readonly ms: number };

const sourceOf = (call: Call | undefined) =>
  call === undefined
    ? 'not fetched'
    : call.error !== null
      ? 'error'
      : call.fromCache
        ? 'cache'
        : 'network';

/** Tab → worker → cache or network, with the last answer's path lit. */
function Path(props: {
  readonly strategy: TimeStrategy;
  readonly last?: Call;
}) {
  const source = sourceOf(props.last);
  const node = (on: boolean, fail = false) =>
    cn(
      'flex h-10 items-center justify-center rounded-lg px-3 text-sm ring-1 transition-colors duration-150',
      fail
        ? 'bg-destructive/10 text-destructive ring-destructive/30'
        : on
          ? 'bg-foreground text-background ring-foreground'
          : 'bg-background text-muted-foreground ring-foreground/10',
    );
  const line = (on: boolean) =>
    cn(
      'h-px w-full transition-colors duration-150',
      on ? 'bg-foreground' : 'bg-foreground/15',
    );
  return (
    <div
      aria-label={`Last answer came from: ${source}`}
      className="grid w-full max-w-md grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2"
    >
      <div className={node(props.last !== undefined)}>Tab</div>
      <div className={line(props.last !== undefined)} />
      <div className={node(props.last !== undefined)}>
        <span className="font-mono text-xs">worker</span>
      </div>
      {/* One branch per answer source, level with its box. */}
      <div className="flex h-[5.5rem] flex-col justify-around">
        <div className={line(source === 'cache')} />
        <div className={line(source === 'network')} />
      </div>
      <div className="flex flex-col gap-2">
        <div className={node(source === 'cache')}>Cache</div>
        <div className={node(source === 'network', source === 'error')}>
          Network
        </div>
      </div>
    </div>
  );
}

function Log(props: { readonly calls: ReadonlyArray<Call> }) {
  return (
    <ol
      aria-label="Requests, newest first"
      className="flex h-[9.5rem] w-full max-w-md flex-col gap-1 overflow-hidden font-mono text-xs"
    >
      {props.calls.length === 0 ? (
        <li className="m-auto text-muted-foreground">
          Press Fetch to send a request.
        </li>
      ) : null}
      {props.calls.map((call) => (
        <li
          key={call.n}
          className="grid grid-cols-[2.5rem_4.5rem_1fr_3.5rem] items-center gap-2 rounded-md bg-background px-2.5 py-1.5 tabular-nums ring-1 ring-foreground/5 first:ring-foreground/15"
        >
          <span className="text-muted-foreground">#{call.n}</span>
          <span
            className={cn(
              sourceOf(call) === 'cache' && 'text-foreground',
              sourceOf(call) === 'network' && 'text-muted-foreground',
              sourceOf(call) === 'error' && 'text-destructive',
            )}
          >
            {sourceOf(call)}
          </span>
          <span className="truncate text-muted-foreground">
            {call.error ?? call.servedAt.slice(11, 23)}
          </span>
          <span className="text-right text-muted-foreground">
            {Math.round(call.ms)} ms
          </span>
        </li>
      ))}
    </ol>
  );
}

const codeFor = (strategy: TimeStrategy) => `// vite.config.ts
pwa({
  strategies: [
    {
      match: { origin: 'same-origin', pathPrefix: '${timeUrl(strategy)}' },
      strategy: '${strategy}',
      cacheName: 'time-${strategy}',${strategy === 'network-first' ? '\n      networkTimeoutMs: 2000,' : ''}
    },
  ],
});`;

function RuntimeCache() {
  const [strategy, setStrategy] = useState<TimeStrategy>('network-first');
  const [calls, setCalls] = useState<
    Readonly<Partial<Record<TimeStrategy, ReadonlyArray<Call>>>>
  >({});
  const [pending, setPending] = useState(false);
  const [cleared, setCleared] = useState<string>('never');
  const mine = calls[strategy] ?? [];
  const last = mine[0];

  const fetchOnce = async () => {
    setPending(true);
    const started = performance.now();
    const served = await servedFetch(timeUrl(strategy));
    const ms = performance.now() - started;
    setCalls((all) => {
      const list = all[strategy] ?? [];
      const n = (list[0]?.n ?? 0) + 1;
      return {
        ...all,
        [strategy]: [{ ...served, n, ms }, ...list].slice(0, 5),
      };
    });
    setPending(false);
  };

  return (
    <Page
      path="/runtime-cache"
      testId="scenario-runtime-cache"
      lede={
        <p>
          The worker answers each request by a strategy: ask the network, use
          what it saved, or both. Pick one, fetch a few times, then take the
          network away and fetch again.
        </p>
      }
    >
      <Playground>
        <Stage className="gap-6">
          <Path strategy={strategy} last={last} />
          <Log calls={mine} />
        </Stage>
        <Controls>
          <Segmented
            label="Strategy"
            value={strategy}
            options={TIME_STRATEGIES.map((s) => ({
              value: s,
              label: LABEL[s],
            }))}
            onChange={setStrategy}
            testId="rc-strategy"
          />
          <p className="-mt-1 text-sm text-pretty text-muted-foreground">
            {EXPECTED[strategy]}
          </p>
          <Actions>
            <Button
              data-testid={`rc-${strategy}-fetch`}
              disabled={pending}
              onClick={() => void fetchOnce()}
            >
              Fetch
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              data-testid="rc-clear"
              onClick={() =>
                void clearRuntimeCache().then(() => {
                  setCleared(new Date().toISOString());
                  setCalls({});
                })
              }
            >
              Clear every cache
            </Button>
          </Actions>
        </Controls>
        <Values>
          <Value label="Calls" testId={`rc-${strategy}-calls`}>
            {last?.n ?? 0}
          </Value>
          <Value label="Came from" testId={`rc-${strategy}-source`}>
            {sourceOf(last)}
          </Value>
          <Value label="Served at" testId={`rc-${strategy}-served-at`}>
            {last?.servedAt.slice(11, 23) || '—'}
          </Value>
          <Value label="Status" testId={`rc-${strategy}-status`}>
            {last === undefined ? '—' : (last.error ?? last.status)}
          </Value>
          <Value label="Cleared" testId="rc-cleared">
            {cleared === 'never' ? 'never' : cleared.slice(11, 19)}
          </Value>
        </Values>
      </Playground>
      <Hint>
        To go offline, use DevTools (Network → Offline) or airplane mode. The
        header shows the connection. The endpoint answers with{' '}
        <code>no-store</code>, so only the worker can have saved it.
      </Hint>
      <Code title="vite.config.ts" code={codeFor(strategy)} />
      <Notice
        items={[
          <>
            Every answer carries a unique <code>x-served-at</code> stamp. A
            repeated stamp means you got a saved copy.
          </>,
          'Cache first and stale while revalidate answer instantly from the second fetch on; network first only falls back when it has to.',
          <>
            Clearing deletes every <code>pwa-toolkit:runtime:*</code> cache. The
            precache, which holds the app itself, stays.
          </>,
        ]}
      />
      <Checklist
        steps={[
          'Fetch each strategy twice while online and compare the stamps.',
          'Go offline in DevTools (Network → Offline) and fetch again.',
          'Network only fails offline; the other three answer from cache. Clear every cache to start over.',
        ]}
      />
    </Page>
  );
}
