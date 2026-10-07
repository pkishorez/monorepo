import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Scope from 'effect/Scope';
import * as Worker from 'effect/workers/Worker';
import {
  WorkerError,
  WorkerReceiveError,
  WorkerSpawnError,
} from 'effect/workers/WorkerError';
import type { PlatformMessage } from 'effect/workers/WorkerRunner';
import type { BuildId } from '../../shared/build/index.js';
import {
  makeInFlight,
  matchWorkerEnvelope,
  RPC_ENVELOPE_KEY,
  type ClientEnvelope,
  VersionSkew,
} from '../handshake/index.js';
import type { SkewState } from './version-skew.js';

interface Options {
  readonly buildId: BuildId;
  /** How often to check a silent worker, and how long to wait for READY. */
  readonly livenessMs: number;
  readonly skew: SkewState;
}

/**
 * Resolves with the controller to connect to. A controller that just
 * reported Version Skew is skipped until another takes its place.
 */
const awaitController = (
  container: ServiceWorkerContainer,
  skip?: ServiceWorker,
) =>
  Effect.callback<ServiceWorker>((resume) => {
    const check = () => {
      const controller = container.controller;
      if (controller === null || controller === skip) return false;
      resume(Effect.succeed(controller));
      return true;
    };
    if (check()) return;
    const onChange = () => {
      if (check()) container.removeEventListener('controllerchange', onChange);
    };
    container.addEventListener('controllerchange', onChange);
    return Effect.sync(() =>
      container.removeEventListener('controllerchange', onChange),
    );
  });

/** One connection to one controller: what Effect's worker client sends to. */
const makePort = (controller: ServiceWorker, buildId: BuildId) => {
  const connectionId = crypto.randomUUID();
  const inFlight = makeInFlight();
  let closed = false;
  const post = (
    body:
      | { readonly type: 'CONNECT' | 'CLOSE' | 'PING' }
      | {
          readonly type: 'MESSAGE';
          readonly message: unknown;
          readonly open: number;
        },
    transfers: ReadonlyArray<unknown> = [],
  ) => {
    if (closed) return;
    const envelope: ClientEnvelope = {
      [RPC_ENVELOPE_KEY]: 1,
      buildId,
      connectionId,
      ...body,
    };
    controller.postMessage(envelope, transfers as Transferable[]);
  };
  return {
    controller,
    connectionId,
    inFlight,
    post,
    /** Stops all traffic; the connection is dead. */
    close() {
      closed = true;
      inFlight.clear();
    },
    postMessage(
      frame: PlatformMessage<unknown>,
      transfers?: ReadonlyArray<unknown>,
    ) {
      if (frame[0] === 1) return post({ type: 'CLOSE' });
      const open = inFlight.size;
      inFlight.request(frame[1]);
      post({ type: 'MESSAGE', message: frame[1], open }, transfers);
    },
  };
};

const lost = (message: string) =>
  new WorkerError({ reason: new WorkerReceiveError({ message }) });

/**
 * Effect's `WorkerPlatform` for a Worker Client: every frame goes through
 * `navigator.serviceWorker.controller.postMessage`, which wakes a stopped
 * worker, and replies arrive on `navigator.serviceWorker`. One spawned
 * "worker" is one connection; it fails, and Effect's worker protocol opens a
 * new one, when the worker answers VERSION_SKEW or UNKNOWN_CONNECTION, when
 * the controller changes, or when no READY comes within the liveness interval.
 */
export const makeClientPlatform = (options: Options) =>
  Worker.makePlatform<ServiceWorkerContainer>()({
    setup: ({ worker: container, scope }) =>
      Effect.gen(function* () {
        const controller = yield* awaitController(
          container,
          options.skew.controller,
        );
        const port = makePort(controller, options.buildId);
        yield* Scope.addFinalizer(
          scope,
          Effect.sync(() => {
            port.postMessage([1]);
            port.close();
          }),
        );
        return Object.assign(port, { container });
      }),
    listen: ({ port, emit, deferred, scope }) =>
      Effect.suspend(() => {
        const { container } = port;
        let ready = false;
        const openReady = () => {
          if (ready) return;
          ready = true;
          emit([0]);
        };
        // Effect's worker client waits for ready before it watches for
        // failure, so a connection that fails first still reports ready.
        const fail = (error: WorkerError) => {
          port.close();
          openReady();
          Deferred.doneUnsafe(deferred, Effect.fail(error));
        };

        const onMessage = (event: MessageEvent) => {
          const found = matchWorkerEnvelope(event.data);
          if (Option.isNone(found)) return;
          const envelope = found.value;
          if (envelope.connectionId !== port.connectionId) return;
          switch (envelope.type) {
            case 'READY':
              options.skew.clear();
              return openReady();
            case 'MESSAGE':
              port.inFlight.response(envelope.message);
              return emit([1, envelope.message]);
            case 'VERSION_SKEW': {
              const skew = new VersionSkew({
                pageBuildId: options.buildId,
                workerBuildId: envelope.buildId,
              });
              options.skew.set(skew, port.controller);
              return fail(
                new WorkerError({
                  reason: new WorkerSpawnError({
                    message:
                      'Version Skew: the page and the service worker belong to different Build IDs',
                    cause: skew,
                  }),
                }),
              );
            }
            case 'UNKNOWN_CONNECTION':
              return fail(
                lost(
                  'The Worker Server no longer knows this Worker Client; the service worker was restarted',
                ),
              );
          }
        };
        const onControllerChange = () =>
          fail(lost('The service worker controlling this page changed'));

        const connectTimeout = setTimeout(() => {
          if (!ready) fail(lost('No Worker Server answered the handshake'));
        }, options.livenessMs);
        // A stopped worker cannot tell the page it lost its calls. While calls
        // are in flight, a PING wakes it; a restarted worker answers
        // UNKNOWN_CONNECTION.
        const liveness = setInterval(() => {
          if (ready && port.inFlight.size > 0) port.post({ type: 'PING' });
        }, options.livenessMs);

        container.addEventListener('message', onMessage);
        container.addEventListener('controllerchange', onControllerChange);
        container.startMessages?.();
        port.post({ type: 'CONNECT' });

        return Scope.addFinalizer(
          scope,
          Effect.sync(() => {
            clearTimeout(connectTimeout);
            clearInterval(liveness);
            container.removeEventListener('message', onMessage);
            container.removeEventListener(
              'controllerchange',
              onControllerChange,
            );
          }),
        );
      }),
  });
