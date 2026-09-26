import { createFileRoute } from '@tanstack/react-router';
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
import { Button } from 'kui-toolkit/components/ui/button';
import { usePwaUpdate } from 'pwa-toolkit/react';
import { TabClient, type VersionSkew } from 'pwa-toolkit/worker-rpc/client';
import { useEffect, useRef, useState } from 'react';
import {
  Actions,
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
    return `VersionSkew: tab ${skew.tabBuildId}, worker ${skew.workerBuildId}`;
  }
  return `${error?._tag ?? 'Error'}: ${error?.message ?? String(error)}`;
};

/**
 * The Tab Client reads the tab's Build ID from the meta tag once, when it
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
    return yield* TabClient.make(PlaygroundRpcs).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (meta && real !== null) meta.content = real;
        }),
      ),
    );
  });

function RpcPage() {
  const { fakeBuildId } = Route.useSearch();
  const update = usePwaUpdate();
  const [client, setClient] = useState<Client | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [echo, setEcho] = useState<string>('—');
  const [info, setInfo] = useState<string>('—');
  const [lastError, setLastError] = useState<string>('none');

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
  ) => {
    const exit = await Effect.runPromiseExit(effect);
    if (Exit.isSuccess(exit)) return onSuccess(exit.value);
    const message = describeCause(exit.cause);
    setLastError(message);
    // A worker of another build answered: look for the new version.
    if (message.startsWith('VersionSkew')) void update.check();
  };

  return (
    <ScenarioPage
      id="rpc"
      title="Worker RPC"
      explanation={
        <>
          <p>
            Effect RPC served by the service worker (src/sw.ts) and called from
            this tab with a Tab Client. Every message carries the tab&apos;s
            Build ID; a worker of another build answers VersionSkew instead.
          </p>
          <p>
            Open /rpc?fakeBuildId=other to make only this page&apos;s Tab Client
            claim another Build ID: every call then fails with VersionSkew, and
            the page asks for an update check. The browser may stop an idle
            worker; WorkerInfo&apos;s start time changes when it does.
          </p>
        </>
      }
    >
      <Panel title="Connection">
        <Readouts>
          <Readout
            label="Tab Client"
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

      <Panel title="Echo (unary)">
        <Readouts>
          <Readout label="Reply" testId="rpc-echo-result" value={echo} />
        </Readouts>
        <Actions>
          <Button
            data-testid="rpc-echo"
            disabled={client === null}
            onClick={() =>
              client &&
              void run(client.Echo({ text: `hello ${Date.now()}` }), (reply) =>
                setEcho(`${reply.text} at ${reply.at}`),
              )
            }
          >
            Echo
          </Button>
        </Actions>
      </Panel>

      <Panel title="WorkerInfo (unary)">
        <Readouts>
          <Readout label="Worker" testId="rpc-worker-info" value={info} />
        </Readouts>
        <Actions>
          <Button
            data-testid="rpc-worker-info-call"
            disabled={client === null}
            onClick={() =>
              client &&
              void run(client.WorkerInfo(), (reply) =>
                setInfo(`build ${reply.buildId}, started ${reply.startedAt}`),
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
        onError={setLastError}
      />

      <TicksPanel
        client={client}
        title="Retrying Ticks (Subscription Restart)"
        description="Twenty ticks, one per second, with Stream.retry: when the worker is stopped mid-stream, the stream subscribes again and the worker starts over from 1."
        testId="rpc-retry-ticks"
        count={20}
        retrying
        onError={setLastError}
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

function TicksPanel(props: {
  readonly client: Client | null;
  readonly title: string;
  readonly description: string;
  readonly testId: string;
  readonly count: number;
  readonly retrying: boolean;
  readonly onError: (message: string) => void;
}) {
  const { client, testId, count, retrying, onError } = props;
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
              onError(describeCause(Cause.fail(error)));
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
      if (Exit.isSuccess(exit)) return setStatus('done');
      if (Cause.hasInterruptsOnly(exit.cause)) return setStatus('stopped');
      setStatus('failed');
      onError(describeCause(exit.cause));
    });
  };

  return (
    <Panel title={props.title} description={props.description}>
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
