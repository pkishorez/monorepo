import { createOptimisticAction } from '@tanstack/react-db';
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  References,
  Scope,
  Semaphore,
  Stream,
} from 'effect';
import { RpcClient } from 'effect/unstable/rpc';
import type { ConnectionStatus } from '@pkishorez/effect-cloudflare/websocket-rpc-client';
import {
  makeTraceRecorder,
  type TraceRecorder,
} from '@pkishorez/effect-tracer/recorder';
import { nextUlid, type DecodedEntity } from 'std-toolkit/core';
import {
  createStdSync,
  syncStrategy,
  type StdSyncPlatform,
} from 'std-toolkit/sync';
import { AccountSchema, type Account } from '../../contract/account/index.ts';
import {
  TransferSchema,
  type Transfer,
} from '../../contract/transfer/index.ts';
import { seedBalance, seedNames } from '../mutations/index.ts';
import { BankRpcs } from '../contract/index.ts';
import { Network, NetworkLive } from './network.ts';
import { makeVitals, type BankVitals } from './vitals.ts';

export const newId = (): string => Effect.runSync(nextUlid);

const SYNC_VERSION = 1;
const SEED_BATCH = 1000;

const deleteDatabase = (name: string): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess =
      request.onerror =
      request.onblocked =
        () => resume(Effect.void);
  });

const dropSyncDatabases = (prefix: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (typeof indexedDB === 'undefined') return;
    const databases = yield* Effect.promise(() => indexedDB.databases());
    const names = databases.flatMap(({ name }) =>
      name?.startsWith(prefix) ? [name] : [],
    );
    yield* Effect.forEach(names, deleteDatabase, { discard: true });
  });

const quiet = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.provideService(effect, References.MinimumLogLevel, 'Warning');

const quietRuntime = {
  runPromise: <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
    Effect.runPromise(quiet(effect)),
  runSync: <A, E>(effect: Effect.Effect<A, E>): A =>
    Effect.runSync(quiet(effect)),
};

const recordedRuntime = (recorder: TraceRecorder) => {
  const record = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
    effect.pipe(
      Effect.provide(recorder.layer),
      Effect.provideService(References.MinimumLogLevel, 'Info'),
    );
  return {
    runPromise: <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
      Effect.runPromise(record(effect)),
    runSync: <A, E>(effect: Effect.Effect<A, E>): A =>
      Effect.runSync(record(effect)),
  };
};

interface SendMoneyInput {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
}

export class BankWiring extends Context.Service<
  BankWiring,
  {
    readonly protocolLayer: Layer.Layer<RpcClient.Protocol>;
    readonly keepSubscribed: <A, E, R>(
      subscribe: () => Stream.Stream<A, E, R>,
    ) => Stream.Stream<A, E, R>;
    readonly connectionStatus?: Stream.Stream<ConnectionStatus>;
    readonly syncName: string;
    readonly platform?: StdSyncPlatform;
  }
>()('BankWiring') {}

const makeApi = Effect.gen(function* () {
  const { protocolLayer } = yield* BankWiring;
  return yield* RpcClient.make(BankRpcs).pipe(Effect.provide(protocolLayer));
});

export class BankApi extends Context.Service<
  BankApi,
  Effect.Success<typeof makeApi>
>()('BankApi') {}

const BankApiLive = Layer.effect(BankApi, makeApi);

const makeBank = Effect.gen(function* () {
  const { keepSubscribed, connectionStatus, syncName, platform } =
    yield* BankWiring;
  const api = yield* BankApi;
  const network = yield* Network;
  const session = yield* api.session();
  const admin = session.role === 'admin';
  const recorder = makeTraceRecorder();
  const runtime = recordedRuntime(recorder);

  const vitals = makeVitals({
    ws: connectionStatus ? { status: 'connecting', reconnects: 0 } : null,
    leadership: {},
    queued: 0,
    committing: 0,
  });
  const patch = (fn: (v: BankVitals) => Partial<BankVitals>) =>
    Effect.sync(() => vitals.update((v) => ({ ...v, ...fn(v) })));

  if (connectionStatus) {
    yield* Effect.forkScoped(
      Stream.runForEach(connectionStatus, (status) =>
        patch((v) => ({
          ws: {
            status,
            reconnects:
              (v.ws?.reconnects ?? 0) + (status === 'reconnecting' ? 1 : 0),
          },
        })),
      ),
    );
  }

  const std = createStdSync({
    name: `${syncName}-g${session.generation}`,
    version: SYNC_VERSION,
    platform,
    runtime,
    onEvent: (event) =>
      event._tag === 'LeadershipChanged'
        ? patch((v) => ({
            leadership: { ...v.leadership, [event.collection]: event.state },
          }))
        : Effect.logError(event),
  });

  const liveOldToNew = <T extends object>(
    subscribe: (
      cursor: DecodedEntity<T> | null,
    ) => Stream.Stream<ReadonlyArray<DecodedEntity<T>>, unknown>,
  ) => ({
    total: {
      strategy: syncStrategy.oldToNew<T>({
        source: ({ live }) =>
          live({
            open: ({ cursor }) => keepSubscribed(() => subscribe(cursor)),
          }),
      }),
    },
  });

  const accounts = std.collection({
    schema: AccountSchema,
    sync: liveOldToNew<Account>((cursor) =>
      api.subscribeAccounts({ '>': cursor }),
    ),
    onInsert: (item) =>
      api.openAccount({
        id: item.id,
        name: item.name,
        balance: item.balance,
      }),
  });

  const transfers = std.collection({
    schema: TransferSchema,
    sync: liveOldToNew<Transfer>((cursor) =>
      api.subscribeAllTransfers({ '>': cursor }),
    ),
  });

  const lane = Semaphore.makeUnsafe(1);

  const sendMoney = createOptimisticAction<SendMoneyInput>({
    onMutate: ({ id, from, to, amount }) => {
      accounts.update(from, (draft) => {
        draft.balance -= amount;
      });
      accounts.update(to, (draft) => {
        draft.balance += amount;
      });
      transfers.insert({ id, from, to, amount });
    },
    mutationFn: (input) =>
      runtime.runPromise(
        patch((v) => ({ queued: v.queued + 1 })).pipe(
          Effect.andThen(
            lane.withPermits(1)(
              patch((v) => ({
                queued: v.queued - 1,
                committing: v.committing + 1,
              })).pipe(
                Effect.andThen(
                  network.travel.pipe(Effect.withSpan('Travel the network')),
                ),
                Effect.flatMap(() =>
                  api
                    .transfer(input)
                    .pipe(Effect.withSpan('Commit on the bank')),
                ),
                Effect.tap((outcome) =>
                  Effect.all([
                    accounts.utils.applyToSyncReplica([...outcome.accounts]),
                    transfers.utils.applyToSyncReplica([outcome.transfer]),
                  ]).pipe(Effect.withSpan('Apply to the Sync Replica')),
                ),
                Effect.ensuring(
                  patch((v) => ({ committing: v.committing - 1 })),
                ),
              ),
            ),
          ),
          Effect.withSpan('Transfer', {
            attributes: {
              'transfer.id': input.id,
              'transfer.from': input.from,
              'transfer.to': input.to,
              'transfer.amount': input.amount,
            },
          }),
        ),
      ),
  });

  const seed = (count: number): Promise<void> =>
    runtime.runPromise(
      Effect.forEach(
        Arr.chunksOf(seedNames(count), SEED_BATCH),
        (names) =>
          Effect.sync(() =>
            accounts.insert(
              names.map((name) => ({
                id: newId(),
                name,
                balance: seedBalance(),
              })),
            ),
          ).pipe(Effect.andThen(Effect.sleep(0))),
        { discard: true },
      ).pipe(
        Effect.withSpan('Seed accounts', {
          attributes: { 'seed.count': count },
        }),
      ),
    );

  const clear = (): Promise<void> =>
    runtime.runPromise(
      api
        .clear()
        .pipe(
          Effect.andThen(Effect.promise(() => std.dispose())),
          Effect.andThen(dropSyncDatabases(`std-sync:${syncName}-`)),
          Effect.withSpan('Clear the bank'),
        ),
    );

  return {
    api,
    admin,
    accounts,
    transfers,
    std,
    network,
    sendMoney,
    seed,
    clear,
    vitals,
    recorder,
  };
});

export type BankRuntime = Effect.Success<typeof makeBank>;

export const runBank = (
  wiring: Layer.Layer<BankWiring, unknown>,
): Promise<BankRuntime> =>
  quietRuntime.runPromise(
    Effect.gen(function* () {
      const services = yield* Layer.build(
        Layer.mergeAll(BankApiLive, NetworkLive).pipe(
          Layer.provideMerge(wiring),
        ),
      );
      return yield* Effect.provide(makeBank, services);
    }).pipe(Effect.provideService(Scope.Scope, Scope.makeUnsafe())),
  );
