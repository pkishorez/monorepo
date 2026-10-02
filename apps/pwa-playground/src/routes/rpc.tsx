import { createFileRoute, Link } from '@tanstack/react-router';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Schedule from 'effect/Schedule';
import * as Scope from 'effect/Scope';
import * as Stream from 'effect/Stream';
import type { RpcClient } from 'effect/rpc/RpcClient';
import type { RpcClientError } from 'effect/rpc/RpcClientError';
import type * as RpcGroup from 'effect/rpc/RpcGroup';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { usePwa } from '@kstackz/pwa-toolkit/react';
import {
  WorkerClient,
  type VersionSkew,
} from '@kstackz/pwa-toolkit/rpc/client';
import { useEffect, useRef, useState } from 'react';
import {
  Actions,
  type Outcome,
  Panel,
  Readout,
  Readouts,
  ScenarioPage,
} from '../components/index.ts';
import { BUILD_ID_META_NAME } from '../lib/meta.ts';
import { PlaygroundRpcs } from '../rpc/index.ts';

type Client = RpcClient<
  RpcGroup.Rpcs<typeof PlaygroundRpcs>,
  RpcClientError | VersionSkew
>;

export const Route = createFileRoute('/rpc')({
  validateSearch: (search): { fakeBuildId?: string } =>
    typeof search['fakeBuildId'] === 'string' && search['fakeBuildId'] !== ''
      ? { fakeBuildId: search['fakeBuildId'] }
      : {},
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

function RpcPage() {
  const { fakeBuildId } = Route.useSearch();
  const pwa = usePwa();
  const [client, setClient] = useState<Client | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [echo, setEcho] = useState<string>('—');
  const [info, setInfo] = useState<string>('—');
  const [lastError, setLastError] = useState<string>('none');
  const [echoOutcome, setEchoOutcome] = useState<Outcome>('idle');
  const [infoOutcome, setInfoOutcome] = useState<Outcome>('idle');

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

  return (
    <ScenarioPage
      id="rpc"
      title="Worker RPC"
      proves={
        <p>
          Effect RPC served by the service worker (src/sw.ts) and called from
          this tab with a Worker Client. Every message carries the tab&apos;s
          Build ID; a worker of another build answers VersionSkew instead. The
          browser may stop an idle worker at any time; WorkerInfo&apos;s start
          time changes when it does, and calls keep working.
        </p>
      }
      steps={[
        'Press Echo and Ask the worker: both answer within a few milliseconds.',
        'Start Retrying Ticks, then stop the worker in DevTools (Application → Service workers → Stop). The stream subscribes again and starts over from 1.',
        <>
          Open{' '}
          <Link
            to="/rpc"
            search={{ fakeBuildId: 'other' }}
            className="font-mono underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            data-testid="rpc-skew-link"
          >
            /rpc?fakeBuildId=other
          </Link>{' '}
          to make only this page&apos;s Worker Client claim another Build ID:
          every call fails with VersionSkew, and the page asks for an update
          check.
        </>,
      ]}
    >
      <Panel
        title="Connection"
        outcome={
          client !== null
            ? fakeBuildId === undefined
              ? 'success'
              : 'failure'
            : connectError !== null
              ? 'failure'
              : 'running'
        }
        outcomeLabel={
          client !== null
            ? fakeBuildId === undefined
              ? 'Ready'
              : 'Skewed on purpose'
            : connectError !== null
              ? 'Connect failed'
              : 'Connecting'
        }
        outcomeTestId="rpc-client-outcome"
      >
        <Readouts>
          <Readout
            label="Worker Client"
            testId="rpc-client"
            value={client !== null ? 'ready' : (connectError ?? 'connecting')}
          />
          <Readout
            label="Claimed Build ID"
            testId="rpc-claimed-build-id"
            value={fakeBuildId ?? 'this page (meta tag)'}
          />
          <Readout
            label="Last error"
            testId="rpc-last-error"
            value={lastError}
          />
        </Readouts>
      </Panel>

      <Panel
        title="Echo (unary)"
        outcome={echoOutcome}
        outcomeTestId="rpc-echo-outcome"
      >
        <Readouts>
          <Readout label="Reply" testId="rpc-echo-result" value={echo} />
        </Readouts>
        <Actions>
          <Button
            data-testid="rpc-echo"
            disabled={client === null}
            onClick={() =>
              client &&
              void run(
                client.Echo({ text: `hello ${Date.now()}` }),
                (reply) => setEcho(`${reply.text} at ${reply.at}`),
                setEchoOutcome,
              )
            }
          >
            Echo
          </Button>
        </Actions>
      </Panel>

      <Panel
        title="WorkerInfo (unary)"
        outcome={infoOutcome}
        outcomeTestId="rpc-worker-info-outcome"
      >
        <Readouts>
          <Readout label="Worker" testId="rpc-worker-info" value={info} />
        </Readouts>
        <Actions>
          <Button
            data-testid="rpc-worker-info-call"
            disabled={client === null}
            onClick={() =>
              client &&
              void run(
                client.WorkerInfo(),
                (reply) =>
                  setInfo(`build ${reply.buildId}, started ${reply.startedAt}`),
                setInfoOutcome,
              )
            }
          >
            Ask the worker
          </Button>
        </Actions>
      </Panel>

      <TicksPanel
        client={client}
        title="Ticks (stream)"
        description="Five ticks, one per second. A stopped worker fails the stream."
        testId="rpc-ticks"
        count={5}
        retrying={false}
        setLastError={setLastError}
      />

      <TicksPanel
        client={client}
        title="Retrying Ticks (Subscription Restart)"
        description="Twenty ticks, one per second, with Stream.retry: when the worker is stopped mid-stream, the stream subscribes again and the worker starts over from 1."
        testId="rpc-retry-ticks"
        count={20}
        retrying
        setLastError={setLastError}
      />
    </ScenarioPage>
  );
}

// Up to five restarts in a row, one second apart; the count resets once a
// tick arrives again.
const restartSchedule = Schedule.max([
  Schedule.spaced('1 second'),
  Schedule.recurs(5),
]);

const TICKS_OUTCOME: Record<string, [Outcome, string]> = {
  idle: ['idle', 'Not run'],
  streaming: ['running', 'Streaming'],
  restarting: ['running', 'Restarting'],
  done: ['success', 'Done'],
  failed: ['failure', 'Failed'],
  stopped: ['idle', 'Stopped'],
};

/** One cell per expected tick, filled as each arrives. Decorative: the Ticks readout has the values. */
function TickBar(props: {
  readonly count: number;
  readonly ticks: ReadonlyArray<number>;
}) {
  const received = new Set(props.ticks);
  return (
    <div
      aria-hidden="true"
      className="grid h-2 gap-1"
      style={{ gridTemplateColumns: `repeat(${props.count}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: props.count }, (_, i) => (
        <span
          key={i}
          className={
            received.has(i + 1)
              ? 'rounded-full bg-foreground transition-colors duration-150'
              : 'rounded-full bg-muted transition-colors duration-150'
          }
        />
      ))}
    </div>
  );
}

function TicksPanel(props: {
  readonly client: Client | null;
  readonly title: string;
  readonly description: string;
  readonly testId: string;
  readonly count: number;
  readonly retrying: boolean;
  /** Called with the error text, or 'none' once the stream succeeds. */
  readonly setLastError: (message: string) => void;
}) {
  const { client, testId, count, retrying, setLastError } = props;
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

  const [outcome, outcomeLabel] = TICKS_OUTCOME[status] ?? ['idle', status];
  return (
    <Panel
      title={props.title}
      description={props.description}
      outcome={outcome}
      outcomeLabel={outcomeLabel}
      outcomeTestId={`${testId}-outcome`}
    >
      <TickBar count={count} ticks={ticks} />
      <Readouts>
        <Readout label="Status" testId={`${testId}-status`} value={status} />
        <Readout
          label="Ticks"
          testId={testId}
          value={ticks.join(', ') || '—'}
        />
        {retrying && (
          <Readout
            label="Subscriptions"
            testId={`${testId}-subscriptions`}
            value={String(subscriptions)}
          />
        )}
      </Readouts>
      <Actions>
        <Button
          data-testid={`${testId}-start`}
          disabled={client === null}
          onClick={start}
        >
          Start
        </Button>
        <Button
          data-testid={`${testId}-stop`}
          variant="outline"
          disabled={status !== 'streaming' && status !== 'restarting'}
          onClick={stop}
        >
          Stop
        </Button>
      </Actions>
    </Panel>
  );
}
