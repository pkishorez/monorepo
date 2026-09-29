import { createFileRoute, Link } from '@tanstack/react-router';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Schedule from 'effect/Schedule';
import * as Scope from 'effect/Scope';
import * as Stream from 'effect/Stream';
import type { RpcClient } from 'effect/unstable/rpc/RpcClient';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import type * as RpcGroup from 'effect/unstable/rpc/RpcGroup';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Input } from '@kstackz/ui-toolkit/components/ui/input';
import { cn } from '@kstackz/ui-toolkit/utils';
import { usePwa } from '@kstackz/pwa-toolkit/react';
import {
  WorkerClient,
  type VersionSkew,
} from '@kstackz/pwa-toolkit/rpc/client';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Actions,
  Checklist,
  Code,
  Controls,
  Notice,
  type Outcome,
  OutcomeChip,
  Page,
  Playground,
  Segmented,
  Stage,
  Value,
  Values,
} from '../components/index.ts';
import { BUILD_ID_META_NAME } from '../lib/meta.ts';
import { oneOf } from '../lib/search.ts';
import { PlaygroundRpcs } from '../rpc/index.ts';

type Client = RpcClient<
  RpcGroup.Rpcs<typeof PlaygroundRpcs>,
  RpcClientError | VersionSkew
>;

const CALL_IDS = ['echo', 'info', 'ticks', 'retry'] as const;

type Call = (typeof CALL_IDS)[number];

export const Route = createFileRoute('/rpc')({
  validateSearch: (search): { fakeBuildId?: string; call?: Call } => ({
    ...(typeof search['fakeBuildId'] === 'string' &&
    search['fakeBuildId'] !== ''
      ? { fakeBuildId: search['fakeBuildId'] }
      : {}),
    ...(search['call'] === undefined
      ? {}
      : { call: oneOf(search['call'], CALL_IDS, 'echo') }),
  }),
  component: RpcPage,
});

const describeCause = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause) as { _tag?: string; message?: string };
  if (error?._tag === 'VersionSkew') {
    const skew = error as unknown as VersionSkew;
    return `VersionSkew: tab ${skew.pageBuildId}, worker ${skew.workerBuildId}`;
  }
  return `${error?._tag ?? 'Error'}: ${error?.message ?? String(error)}`;
};

/**
 * The Worker Client reads the tab's Build ID from the meta tag once, when it
 * connects. With ?fakeBuildId= the page swaps the tag's content for that
 * moment only, so this client (and nothing else) claims another build.
 */
const connect = (fakeBuildId: string | undefined) =>
  Effect.gen(function* () {
    const meta = document.querySelector<HTMLMetaElement>(
      `meta[name="${BUILD_ID_META_NAME}"]`,
    );
    const real = meta?.getAttribute('content') ?? null;
    if (fakeBuildId !== undefined && meta) meta.content = fakeBuildId;
    return yield* WorkerClient.make(PlaygroundRpcs).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (meta && real !== null) meta.content = real;
        }),
      ),
    );
  });

const CALLS: ReadonlyArray<{ readonly value: Call; readonly label: string }> = [
  { value: 'echo', label: 'Echo' },
  { value: 'info', label: 'WorkerInfo' },
  { value: 'ticks', label: 'Ticks' },
  { value: 'retry', label: 'Retrying ticks' },
];

const ABOUT: Record<Call, string> = {
  echo: 'A unary call: the worker sends your text straight back, stamped.',
  info: 'Which build the worker runs and when it started. Stop it in DevTools and the start time changes.',
  ticks: 'A stream of five ticks, one a second. A stopped worker fails it.',
  retry:
    'Twenty ticks with Stream.retry: stop the worker mid-stream and it subscribes again, from 1.',
};

const CODE: Record<Call, string> = {
  echo: `const client = yield* WorkerClient.make(PlaygroundRpcs);
const reply = yield* client.Echo({ text: 'hello' });
// { text: 'hello', at: '2026-09-30T…' }`,
  info: `const client = yield* WorkerClient.make(PlaygroundRpcs);
const info = yield* client.WorkerInfo();
// { buildId, startedAt }: startedAt changes when the browser restarts it`,
  ticks: `yield* client.Ticks({ count: 5 }).pipe(
  Stream.runForEach((n) => Effect.log(n)),
);`,
  retry: `yield* client.Ticks({ count: 20 }).pipe(
  Stream.retry(Schedule.spaced('1 second')), // a stopped worker restarts it
  Stream.runForEach((n) => Effect.log(n)),
);`,
};

// Up to five restarts in a row, one second apart.
const restartSchedule = Schedule.max([
  Schedule.spaced('1 second'),
  Schedule.recurs(5),
]);

const TICKS_OUTCOME: Record<string, Outcome> = {
  idle: 'idle',
  streaming: 'running',
  restarting: 'running',
  done: 'success',
  failed: 'failure',
  stopped: 'idle',
};

/** A Ticks stream from the worker, started and stopped by the page. */
const useTicks = (
  client: Client | null,
  count: number,
  retrying: boolean,
  setLastError: (message: string) => void,
) => {
  const [ticks, setTicks] = useState<ReadonlyArray<number>>([]);
  const [status, setStatus] = useState<string>('idle');
  const [subscriptions, setSubscriptions] = useState(0);
  const fiber = useRef<Fiber.Fiber<void, unknown> | null>(null);

  const stop = () => {
    const running = fiber.current;
    fiber.current = null;
    if (running !== null) void Effect.runPromise(Fiber.interrupt(running));
  };
  // Leaving the page ends the stream.
  useEffect(() => stop, []);

  const start = () => {
    if (client === null) return;
    stop();
    setSubscriptions(0);
    // Each subscription (the first and every restart) starts from 1.
    const subscribe = Stream.suspend(() => {
      setSubscriptions((n) => n + 1);
      setTicks([]);
      setStatus('streaming');
      return client.Ticks({ count });
    });
    const stream = retrying
      ? subscribe.pipe(
          Stream.tapError((error) =>
            Effect.sync(() => {
              setStatus('restarting');
              setLastError(describeCause(Cause.fail(error)));
            }),
          ),
          Stream.retry(restartSchedule),
        )
      : subscribe;
    const running = Effect.runFork(
      Stream.runForEach(stream, (n) =>
        Effect.sync(() => setTicks((all) => [...all, n])),
      ),
    );
    fiber.current = running;
    running.addObserver((exit) => {
      if (fiber.current === running) fiber.current = null;
      if (Exit.isSuccess(exit)) {
        setLastError('none');
        return setStatus('done');
      }
      if (Cause.hasInterruptsOnly(exit.cause)) return setStatus('stopped');
      setStatus('failed');
      setLastError(describeCause(exit.cause));
    });
  };

  const running = status === 'streaming' || status === 'restarting';
  return { ticks, status, subscriptions, start, stop, running };
};

/** One cell per expected tick, filled as each arrives. */
function TickBar(props: {
  readonly count: number;
  readonly ticks: ReadonlyArray<number>;
}) {
  const received = new Set(props.ticks);
  return (
    <div
      aria-hidden="true"
      className="grid h-2.5 w-full max-w-sm gap-1"
      style={{ gridTemplateColumns: `repeat(${props.count}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: props.count }, (_, i) => (
        <span
          key={i}
          className={cn(
            'rounded-full transition-colors duration-150',
            received.has(i + 1) ? 'bg-foreground' : 'bg-foreground/10',
          )}
        />
      ))}
    </div>
  );
}

/** What went to the worker and what came back. */
function Exchange(props: {
  readonly sent: ReactNode;
  readonly got: ReactNode;
  readonly outcome: Outcome;
  /** Names the chip `<testId>-outcome`. */
  readonly testId: string;
  readonly resultTestId: string;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2 font-mono text-[13px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">→ worker</span>
        <OutcomeChip
          outcome={props.outcome}
          testId={`${props.testId}-outcome`}
        />
      </div>
      <div className="rounded-lg bg-background px-3 py-2 ring-1 ring-foreground/10">
        {props.sent}
      </div>
      <span className="text-xs text-muted-foreground">← reply</span>
      <div
        data-testid={props.resultTestId}
        className="min-h-[2lh] rounded-lg bg-background px-3 py-2 ring-1 ring-foreground/10 [overflow-wrap:anywhere]"
      >
        {props.got}
      </div>
    </div>
  );
}

function RpcPage() {
  const search = Route.useSearch();
  const { fakeBuildId } = search;
  const call = search.call ?? 'echo';
  const navigate = Route.useNavigate();
  const setCall = (next: Call) =>
    void navigate({
      search: (prev) => ({ ...prev, call: next === 'echo' ? undefined : next }),
      replace: true,
      resetScroll: false,
    });
  const pwa = usePwa();
  const [client, setClient] = useState<Client | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [text, setText] = useState('hello, worker');
  const [echo, setEcho] = useState<string>('—');
  const [info, setInfo] = useState<string>('—');
  const [lastError, setLastError] = useState<string>('none');
  const [echoOutcome, setEchoOutcome] = useState<Outcome>('idle');
  const [infoOutcome, setInfoOutcome] = useState<Outcome>('idle');
  const ticks = useTicks(client, 5, false, setLastError);
  const retry = useTicks(client, 20, true, setLastError);

  useEffect(() => {
    const scope = Effect.runSync(Scope.make());
    setClient(null);
    setConnectError(null);
    Effect.runPromiseExit(Scope.provide(connect(fakeBuildId), scope)).then(
      (exit) =>
        Exit.isSuccess(exit)
          ? setClient(exit.value)
          : setConnectError(describeCause(exit.cause)),
    );
    return () => {
      void Effect.runPromise(Scope.close(scope, Exit.void));
    };
  }, [fakeBuildId]);

  const run = async <A,>(
    effect: Effect.Effect<A, RpcClientError | VersionSkew>,
    onSuccess: (a: A) => void,
    setOutcome: (outcome: Outcome) => void,
  ) => {
    setOutcome('running');
    const exit = await Effect.runPromiseExit(effect);
    if (Exit.isSuccess(exit)) {
      setLastError('none');
      setOutcome('success');
      return onSuccess(exit.value);
    }
    const message = describeCause(exit.cause);
    setLastError(message);
    setOutcome('failure');
    // A worker of another build answered: look for the new version.
    if (message.startsWith('VersionSkew')) void pwa.checkForUpdate();
  };

  const stream = call === 'retry' ? retry : ticks;
  const streamId = call === 'retry' ? 'rpc-retry-ticks' : 'rpc-ticks';

  return (
    <Page
      path="/rpc"
      testId="scenario-rpc"
      lede={
        <p>
          The worker is a small server living in the browser. The tab calls it
          with typed Effect RPC: single answers, streams, and a clear error when
          the two run different builds.
        </p>
      }
    >
      <Playground>
        <Stage className="gap-5">
          {call === 'echo' ? (
            <Exchange
              testId="rpc-echo"
              resultTestId="rpc-echo-result"
              outcome={echoOutcome}
              sent={`Echo({ text: '${text}' })`}
              got={echo}
            />
          ) : call === 'info' ? (
            <Exchange
              testId="rpc-worker-info"
              resultTestId="rpc-worker-info"
              outcome={infoOutcome}
              sent="WorkerInfo()"
              got={info}
            />
          ) : (
            <div className="flex w-full max-w-sm flex-col items-center gap-4">
              <div className="flex w-full items-center justify-between font-mono text-xs text-muted-foreground">
                <span>Ticks({`{ count: ${call === 'retry' ? 20 : 5} }`})</span>
                <OutcomeChip
                  outcome={TICKS_OUTCOME[stream.status] ?? 'idle'}
                  label={stream.status}
                  testId={`${streamId}-outcome`}
                />
              </div>
              <TickBar count={call === 'retry' ? 20 : 5} ticks={stream.ticks} />
              <p
                data-testid={streamId}
                className="min-h-[1lh] font-mono text-[13px] tabular-nums"
              >
                {stream.ticks.join(' ') || '—'}
              </p>
            </div>
          )}
        </Stage>
        <Controls>
          <Segmented
            label="Call"
            value={call}
            options={CALLS}
            onChange={setCall}
            testId="rpc-call"
          />
          <p className="-mt-1 text-sm text-pretty text-muted-foreground">
            {ABOUT[call]}
          </p>
          {call === 'echo' ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (client === null) return;
                const started = performance.now();
                void run(
                  client.Echo({ text }),
                  (reply) =>
                    setEcho(
                      `${reply.text} · ${Math.round(performance.now() - started)} ms`,
                    ),
                  setEchoOutcome,
                );
              }}
            >
              <label htmlFor="echo-text" className="sr-only">
                Text to echo
              </label>
              <Input
                id="echo-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="min-h-10 text-base md:text-sm"
              />
              <Button
                type="submit"
                data-testid="rpc-echo"
                disabled={client === null}
                className="min-h-10"
              >
                Send
              </Button>
            </form>
          ) : call === 'info' ? (
            <Actions>
              <Button
                data-testid="rpc-worker-info-call"
                disabled={client === null}
                onClick={() =>
                  client &&
                  void run(
                    client.WorkerInfo(),
                    (reply) =>
                      setInfo(
                        `build ${reply.buildId}, started ${reply.startedAt.slice(11, 19)}`,
                      ),
                    setInfoOutcome,
                  )
                }
              >
                Ask the worker
              </Button>
            </Actions>
          ) : (
            <Actions>
              <Button
                data-testid={`${streamId}-start`}
                disabled={client === null}
                onClick={stream.start}
              >
                Start
              </Button>
              <Button
                variant="outline"
                data-testid={`${streamId}-stop`}
                disabled={!stream.running}
                onClick={stream.stop}
              >
                Stop
              </Button>
            </Actions>
          )}
        </Controls>
        <Values>
          <Value label="Client" testId="rpc-client">
            {client !== null ? 'ready' : (connectError ?? 'connecting')}
          </Value>
          <Value label="Claims" testId="rpc-claimed-build-id">
            {fakeBuildId ?? 'this build'}
          </Value>
          <Value label="Last error" testId="rpc-last-error">
            {lastError}
          </Value>
          {call === 'ticks' || call === 'retry' ? (
            <Value label="Status" testId={`${streamId}-status`}>
              {stream.status}
            </Value>
          ) : null}
          {call === 'retry' ? (
            <Value label="Subscribed" testId="rpc-retry-ticks-subscriptions">
              {retry.subscriptions}×
            </Value>
          ) : null}
          <div data-testid="rpc-client-outcome" className="sr-only">
            {client !== null
              ? fakeBuildId === undefined
                ? 'Ready'
                : 'Skewed on purpose'
              : connectError !== null
                ? 'Connect failed'
                : 'Connecting'}
          </div>
        </Values>
      </Playground>
      <Code title="Worker RPC" code={CODE[call]} />
      <Notice
        items={[
          <>
            The group lives in <code>src/rpc</code> and is shared: the worker
            serves it in <code>src/sw.ts</code>, the tab calls it here.
          </>,
          'The browser stops an idle worker whenever it likes. The next call wakes it, which is why WorkerInfo’s start time moves.',
          <>
            Every message carries the tab’s Build ID. Open{' '}
            <Link
              to="/rpc"
              search={{ fakeBuildId: 'other' }}
              className="font-mono underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
              data-testid="rpc-skew-link"
            >
              ?fakeBuildId=other
            </Link>{' '}
            and every call fails with <code>VersionSkew</code>, which asks for
            an update check.
          </>,
        ]}
      />
      <Checklist
        steps={[
          'Send an Echo and ask WorkerInfo: both answer within a few milliseconds.',
          'Start Retrying ticks, then stop the worker in DevTools (Application → Service workers → Stop). The stream subscribes again and starts over from 1.',
          'Open ?fakeBuildId=other: only this page’s client claims another Build ID, every call fails with VersionSkew, and the page asks for an update check.',
        ]}
      />
    </Page>
  );
}
