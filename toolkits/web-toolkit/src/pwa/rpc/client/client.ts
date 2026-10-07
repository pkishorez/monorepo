import type * as Context from 'effect/Context';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type * as Scope from 'effect/Scope';
import type * as Rpc from 'effect/rpc/Rpc';
import * as RpcClient from 'effect/rpc/RpcClient';
import type { RpcClientError } from 'effect/rpc/RpcClientError';
import type * as RpcGroup from 'effect/rpc/RpcGroup';
import * as Worker from 'effect/workers/Worker';
import type { WorkerError } from 'effect/workers/WorkerError';
import type { VersionSkew } from '../handshake/index.js';
import { makeClientPlatform } from './platform.js';
import info from 'virtual:pwa-toolkit/client';
import {
  controllerComing,
  pageBuildId,
  serviceWorkerContainer,
} from './page-environment.js';
import { makeSkewState, withVersionSkew } from './version-skew.js';

export { VersionSkew } from '../handshake/index.js';

type Client<Rpcs extends Rpc.Any> = RpcClient.RpcClient<
  Rpcs,
  RpcClientError | VersionSkew
>;

interface Options {
  /**
   * While calls are in flight, how often the Worker Client checks that the
   * Worker Server still knows it; also how long it waits for the handshake.
   * Default 5 seconds.
   */
  readonly livenessInterval?: Duration.Input;
}

const make = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: Options,
): Effect.Effect<
  Client<Rpcs>,
  WorkerError,
  Scope.Scope | Rpc.MiddlewareClient<Rpcs>
> =>
  Effect.gen(function* () {
    const buildId = yield* pageBuildId;
    const container = yield* serviceWorkerContainer;
    const livenessMs = Duration.toMillis(
      options?.livenessInterval ?? '5 seconds',
    );
    yield* controllerComing({
      enabled: info.enabled,
      container,
      graceMs: livenessMs,
    });
    const skew = makeSkewState();
    const protocol = yield* RpcClient.makeProtocolWorker({ size: 1 }).pipe(
      Effect.provideService(
        Worker.WorkerPlatform,
        makeClientPlatform({
          buildId,
          skew,
          livenessMs,
        }),
      ),
      Effect.provideService(Worker.Spawner, () => container),
    );
    const client: Client<Rpcs> = yield* RpcClient.make(group).pipe(
      Effect.provideService(
        RpcClient.Protocol,
        withVersionSkew(protocol, skew),
      ),
    );
    return client;
  });

/**
 * One page's Worker RPC connection. Every message goes through the current
 * controller, carrying the page's Build ID (from the meta tag `pwaHead()`
 * renders). On a first visit, calls wait for the worker to take control.
 * `make` fails at once when no worker ever will: the PWA is off in this
 * build, or a hard reload left the page uncontrolled.
 *
 * - Version Skew: a worker of another Build ID refuses the connection, and
 *   calls fail with `VersionSkew` until a new controller takes over. The app
 *   may answer it with `usePwa().checkForUpdate`.
 * - Worker restart: the browser may stop the worker at any time. A call made
 *   while nothing was in flight wakes the new worker and succeeds. Calls in
 *   flight then fail with `RpcClientError` (found at the next message, or
 *   within the liveness interval), and the Worker Client connects again on its
 *   own. A stream is never resumed where it stopped: Subscription Restart
 *   means subscribing again (e.g. `Stream.retry`), and the handler starts
 *   over from the current state, so it must emit everything a fresh
 *   subscriber needs.
 */
export const WorkerClient = {
  make,
  layer: <Id, Rpcs extends Rpc.Any>(
    tag: Context.Key<Id, Client<Rpcs>>,
    group: RpcGroup.RpcGroup<Rpcs>,
    options?: Options,
  ): Layer.Layer<Id, WorkerError, Rpc.MiddlewareClient<Rpcs>> =>
    Layer.effect(tag)(make(group, options)),
};
