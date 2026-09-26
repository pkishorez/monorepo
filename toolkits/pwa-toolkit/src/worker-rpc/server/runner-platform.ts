import * as Effect from 'effect/Effect';
import * as FiberSet from 'effect/FiberSet';
import * as Option from 'effect/Option';
import * as Queue from 'effect/Queue';
import * as Stream from 'effect/Stream';
import type * as WorkerRunner from 'effect/unstable/workers/WorkerRunner';
import type { BuildId } from '../../domain/build/index.js';
import type { WorkerHost } from '../../domain/worker-host/index.js';
import {
  checkVersionSkew,
  isRequest,
  matchTabEnvelope,
  RPC_ENVELOPE_KEY,
  type WorkerEnvelope,
} from '../handshake/index.js';
import {
  type Connection,
  makeConnections,
  type TabHandle,
} from './connections.js';
import { makeKeepAlive } from './keep-alive.js';

/** The part of the Service Worker API `Clients` used to spot closed tabs. */
export interface ClientLookup {
  get(id: string): Promise<unknown>;
}

/** While calls are in flight, how often to look for closed tabs that sent them. */
const SWEEP_MS = 10_000;

const isTab = (source: unknown): source is TabHandle =>
  typeof source === 'object' &&
  source !== null &&
  typeof (source as { id?: unknown }).id === 'string' &&
  typeof (source as { postMessage?: unknown }).postMessage === 'function';

/**
 * Effect's `WorkerRunnerPlatform` over `WorkerHost.messages`. Each Tab
 * Client connection is one port; replies go through the tab's `Client`. A
 * tab that `clients.get` no longer finds is a disconnect. The runner never
 * ends on its own, even with no tabs left: the next message may be the first
 * of a new connection.
 */
export const makeRunnerPlatform = (
  host: WorkerHost['Service'],
  clients: ClientLookup,
): WorkerRunner.WorkerRunnerPlatform['Service'] => ({
  start: <O, I>() =>
    Effect.map(Queue.make<number>(), (disconnects) => {
      const keepAlive = makeKeepAlive();
      const connections = makeConnections(() => {
        if (!connections.busy) keepAlive.release();
      });

      const post = (
        tab: TabHandle,
        connectionId: string,
        body:
          | { readonly type: 'READY' | 'VERSION_SKEW' | 'UNKNOWN_CONNECTION' }
          | { readonly type: 'MESSAGE'; readonly message: unknown },
        transfers: ReadonlyArray<unknown> = [],
      ) => {
        const envelope: WorkerEnvelope = {
          [RPC_ENVELOPE_KEY]: 1,
          buildId: host.buildId,
          connectionId,
          ...body,
        };
        tab.postMessage(envelope, transfers as Transferable[]);
      };

      const disconnect = (connection: Connection) => {
        connections.close(connection);
        Queue.offerUnsafe(disconnects, connection.portId);
      };

      // A connection this instance never saw (the worker restarted) is
      // adopted when nothing on it was lost: a new Request from a tab with
      // no other call open. A message event reaches exactly one worker
      // instance, so the Request cannot run twice.
      const adopt = (
        tab: TabHandle,
        envelope: { buildId: BuildId; connectionId: string; open: number },
        message: unknown,
      ): Connection | undefined =>
        envelope.open === 0 &&
        isRequest(message) &&
        Option.isNone(checkVersionSkew(envelope.buildId, host.buildId))
          ? connections.open(tab, envelope.connectionId)
          : undefined;

      const checking = new Set<string>();
      const checkTab = (clientId: string) => {
        if (checking.has(clientId)) return;
        checking.add(clientId);
        void clients.get(clientId).then(
          (found) => {
            checking.delete(clientId);
            if (found === undefined)
              connections.ofClient(clientId).forEach(disconnect);
          },
          () => checking.delete(clientId),
        );
      };

      const sendUnsafe = (
        portId: number,
        message: O,
        transfers?: ReadonlyArray<unknown>,
      ) => {
        const connection = connections.byPort(portId);
        if (connection === undefined) return;
        connection.inFlight.response(message);
        post(
          connection.tab,
          connection.connectionId,
          { type: 'MESSAGE', message },
          transfers,
        );
        checkTab(connection.clientId);
      };

      const run = <A, E, R>(
        handler: (portId: number, message: I) => Effect.Effect<A, E, R> | void,
      ) =>
        Effect.scoped(
          Effect.gen(function* () {
            const fibers = yield* FiberSet.make<unknown, never>();
            const fork = yield* FiberSet.runtime(fibers)<R>();

            const onEvent = (event: ExtendableMessageEvent) => {
              const found = matchTabEnvelope(event.data);
              const tab = event.source;
              if (Option.isNone(found) || !isTab(tab)) return;
              const envelope = found.value;
              const connection = connections.find(
                tab.id,
                envelope.connectionId,
              );
              const reply = (
                type: 'READY' | 'VERSION_SKEW' | 'UNKNOWN_CONNECTION',
              ) => post(tab, envelope.connectionId, { type });

              switch (envelope.type) {
                case 'CONNECT': {
                  const skew = checkVersionSkew(envelope.buildId, host.buildId);
                  if (Option.isSome(skew)) return reply('VERSION_SKEW');
                  connections.open(tab, envelope.connectionId);
                  return reply('READY');
                }
                case 'MESSAGE': {
                  const current =
                    connection ?? adopt(tab, envelope, envelope.message);
                  if (current === undefined) return reply('UNKNOWN_CONNECTION');
                  current.tab = tab;
                  current.inFlight.request(envelope.message);
                  // Before the handler: a call may complete synchronously.
                  if (connections.busy) keepAlive.extend(event);
                  const result = handler(current.portId, envelope.message as I);
                  if (Effect.isEffect(result))
                    fork(result.pipe(Effect.catchCause(Effect.logError)));
                  return;
                }
                case 'PING':
                  if (connection === undefined) reply('UNKNOWN_CONNECTION');
                  return;
                case 'CLOSE':
                  if (connection !== undefined) disconnect(connection);
                  return;
              }
            };

            const sweep = setInterval(() => {
              for (const connection of connections.all())
                if (connection.inFlight.size > 0) checkTab(connection.clientId);
            }, SWEEP_MS);
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => clearInterval(sweep)),
            );

            yield* Stream.runForEach(host.messages, (event) =>
              Effect.sync(() => {
                onEvent(event);
                if (connections.busy) keepAlive.extend(event);
              }),
            );
            return yield* Effect.never;
          }),
        );

      return {
        run,
        send: (portId, message, transfers) =>
          Effect.sync(() => sendUnsafe(portId, message, transfers)),
        sendUnsafe,
        disconnects,
      } satisfies WorkerRunner.WorkerRunner<O, I>;
    }),
});
