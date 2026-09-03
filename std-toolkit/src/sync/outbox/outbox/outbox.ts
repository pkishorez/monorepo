import { Effect, Queue } from 'effect';
import type { Transaction } from '@tanstack/react-db';
import {
  alwaysOnline,
  type Connectivity,
} from '../../domain/connectivity/index.js';
import type { HandlerName } from '../../domain/identity/index.js';
import type { PeerChannelFactory } from '../../domain/peer-channel/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import type { EffectRunner } from '../../platform/effect-runner/index.js';
import type { SyncStore } from '../../platform/sync-store/index.js';
import type { SyncFlow } from '../../flow/sync-flow/index.js';
import { makeDoorbell } from '../doorbell/index.js';
import { runDrainer } from '../drainer/index.js';
import {
  makeEntryStore,
  type EntryStore,
  type OutboxEntry,
  type OutboxEntryFailed,
  type OutboxOutcome,
  type PendingEntry,
} from '../entries/index.js';
import { makeHandlers, type Handler } from '../handlers/index.js';
import { makeOfflineActions } from '../offline-action/index.js';
import { makeWaiters } from '../waiters/index.js';

// Backstop for a missed doorbell: the Drainer re-scans at least this often.
const DRAIN_POLL_MS = 30_000;

export type OutboxRuntime = {
  readonly entries: EntryStore;
  readonly connectivity: Connectivity;
  readonly enqueue: (
    entries: ReadonlyArray<PendingEntry>,
  ) => Effect.Effect<void, WriteError>;
  readonly delivered: (
    id: string,
    transaction?: Transaction,
  ) => Effect.Effect<void, OutboxEntryFailed | WriteError>;
  readonly discard: (id: string) => Effect.Effect<void, WriteError>;
  readonly registerHandler: (name: HandlerName, handler: Handler) => void;
  readonly recheck: () => void;
  readonly rejectWaiters: (reason: string) => void;
  readonly transaction: (id: string) => Transaction | null;
  readonly close: () => Promise<void>;
};

export const makeOutbox = <R>(args: {
  syncName: string;
  store: SyncStore;
  runner: EffectRunner<R>;
  channel: PeerChannelFactory | null;
  connectivity?: Connectivity;
  flow: SyncFlow;
  report: SyncReporter<R>;
}) => {
  const entries = makeEntryStore({
    store: args.store,
    syncName: args.syncName,
  });
  const connectivity = args.connectivity ?? alwaysOnline;
  const handlers = makeHandlers();
  const waiters = makeWaiters(entries.byId);
  const signals = args.runner.runSync(Queue.unbounded<void>());
  const transactions = new Map<string, Transaction>();
  const signal = () => Queue.offerUnsafe(signals, undefined);
  const flow = args.flow.outbox;

  const doorbell = makeDoorbell({
    syncName: args.syncName,
    factory: args.channel,
    runner: args.runner,
    onMessage: (message) =>
      message.outcome === 'enqueued' ? signal() : waiters.wakeId(message.id),
  });
  const ring = (id: string, outcome: 'enqueued' | OutboxOutcome) =>
    Effect.promise(() => doorbell.ring(id, outcome));

  const offConnectivity = connectivity.subscribe(() => {
    const online = connectivity.isOnline();
    args.runner.runSync(
      flow.log(online ? 'Back online' : 'Went offline', {
        attributes: { online },
      }),
    );
    signal();
    waiters.wakeAll();
  });

  const runtime: OutboxRuntime = {
    entries,
    connectivity,
    // The batch commits as one transaction; the Drainer hears about it only after.
    enqueue: (batch) =>
      entries.enqueue(batch).pipe(
        Effect.tap(() => Effect.sync(signal)),
        Effect.tap(() =>
          Effect.forEach(batch, (entry) => ring(entry.id, 'enqueued'), {
            discard: true,
          }),
        ),
      ),
    delivered: (id, transaction) => {
      if (transaction) transactions.set(id, transaction);
      return waiters
        .delivered(id)
        .pipe(Effect.ensuring(Effect.sync(() => transactions.delete(id))));
    },
    discard: (id) =>
      entries.remove([id]).pipe(
        Effect.tap(() => Effect.sync(() => waiters.reject(id, 'discarded'))),
        Effect.tap(() => ring(id, 'failed')),
      ),
    registerHandler: (name, handler) => {
      handlers.register(name, handler);
      signal();
    },
    recheck: waiters.wakeAll,
    rejectWaiters: waiters.rejectAll,
    transaction: (id) => transactions.get(id) ?? null,
    close: async () => {
      offConnectivity();
      waiters.rejectAll('the Std Sync was disposed');
      await doorbell.close();
    },
  };

  const actions = makeOfflineActions({
    outbox: {
      enqueue: runtime.enqueue,
      delivered: runtime.delivered,
      registerHandler: runtime.registerHandler,
      list: entries.list,
    },
    runner: args.runner,
    report: args.report,
    flow: args.flow,
  });

  const drain = (
    onRequestFailed: (
      entries: ReadonlyArray<OutboxEntry>,
      cause: unknown,
    ) => Effect.Effect<void, never, R>,
  ) =>
    runDrainer({
      entries,
      handlers,
      connectivity,
      signal,
      awaitSignal: Queue.take(signals).pipe(
        Effect.andThen(Queue.clear(signals)),
        Effect.timeoutOption(DRAIN_POLL_MS),
        Effect.asVoid,
        Effect.orDie,
      ),
      ring: (id, outcome) =>
        Effect.sync(() => waiters.wakeId(id)).pipe(
          Effect.andThen(ring(id, outcome)),
        ),
      onRequestFailed,
    });

  return { runtime, actions, drain };
};

export type Outbox<R = never> = ReturnType<typeof makeOutbox<R>>;
