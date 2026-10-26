import 'fake-indexeddb/auto';
import {
  Deferred,
  Effect,
  Layer,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { TestClock } from 'effect/testing';
import {
  CloudClient,
  CodeClient,
  CodeClients,
  type Machine as MachineSchema,
} from '@kestack/connect/code';
import { Actor, type Instance, Runtime, type Running } from '@kestack/kabuki';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it } from 'vitest';
import {
  AccountReplicas,
  DeviceState,
  Kept,
  KitParts,
  Machines,
  SavedDrafts,
} from '../../../layer/capabilities/index.ts';
import { keptMemory, machines } from '../../../layer/services/index.ts';
import { MachineListLive, RECHECK } from './actor.ts';
import { ListShelf } from './commands.ts';
import { KitShelf } from './kit/commands.ts';

/*
 * The Machine List with Cloud Connect and the records stood in for: what
 * was saved shows first and Cloud Connect's answer replaces it and is kept,
 * with only the records and Kits of the Machines on it; Forget asks Cloud
 * Connect, takes the Machine out of the list and then deletes its records
 * and Kit alone; `Machines` says all of it to the pages, waiting for a
 * Machine with an address; and while a Machine's line is not up the
 * Cloud Connect is asked again, every few seconds, until every line is.
 */

type Machine = typeof MachineSchema.Type;

const machine = (
  id: string,
  lastSeen: number,
  url: string | null = `https://${id}.trycloudflare.com`,
): Machine => ({
  id,
  name: id,
  key: `key-${id}`,
  version: '0.0.1',
  status:
    url === null
      ? { _tag: 'Opening' }
      : { _tag: 'Reachable', url, at: lastSeen },
  lastSeen,
});

const OwnerLive = Actor.build(Actor.define('Owner', {}), {
  provides: () => machines,
  children: {
    machines: {
      actor: MachineListLive,
      input: () => ({ accountId: 'a1' }),
      props: () => ({ email: 'me@example.com' }),
    },
  },
});

type Api = CodeClient['Service'];

/** A test's stand-ins, and what they were asked; every line is up unless `down` says otherwise. */
const world = (
  listed: Effect.Effect<ReadonlyArray<Machine>, Error>,
  down: SubscriptionRef.SubscriptionRef<ReadonlySet<string>> | null = null,
) => {
  const forgotten: Array<string> = [];
  const kept: Array<{ accountId: string; machineIds: ReadonlyArray<string> }> =
    [];
  const dropped: Array<string> = [];
  let lists = 0;
  const line = (machineId: string) =>
    down === null
      ? Stream.concat(Stream.make('connected' as const), Stream.never)
      : SubscriptionRef.changes(down).pipe(
          Stream.map((ids) =>
            ids.has(machineId)
              ? ('reconnecting' as const)
              : ('connected' as const),
          ),
        );
  const layer = Layer.mergeAll(
    CodeClients.make((machineId) =>
      Layer.merge(
        // An RPC client's procedures are generic over how they are called;
        // a stand-in answers the one way the app calls them.
        Layer.mock(CodeClient)({
          watchSpeechToText: (() =>
            Stream.make({
              _tag: 'Off' as const,
            })) as unknown as Api['watchSpeechToText'],
          harnessAccounts: (() =>
            Effect.succeed([])) as unknown as Api['harnessAccounts'],
          harnesses: (() => Effect.succeed([])) as unknown as Api['harnesses'],
        }),
        Layer.mock(RpcConnection)({
          connectionStatus: line(machineId),
          keepSubscribed: (subscribe) => subscribe(),
          hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
        }),
      ),
    ),
    Layer.mock(CloudClient)({
      // A Machine forgotten is no longer listed.
      List: () =>
        Effect.andThen(
          Effect.sync(() => void lists++),
          Effect.map(listed, (each) =>
            each.filter(({ id }) => !forgotten.includes(id)),
          ),
        ),
      Forget: ({ id }: { readonly id: string }) =>
        Effect.sync(() => void forgotten.push(id)),
    } as never),
    Layer.succeed(AccountReplicas, {
      drop: (gone) =>
        Effect.sync(() => {
          if (gone._tag === 'Unlisted')
            kept.push({ accountId: gone.accountId, machineIds: gone.listed });
          if (gone._tag === 'Machine') dropped.push(gone.machineId);
        }),
    }),
    Layer.mock(SavedDrafts)({ drop: () => Effect.void }),
    Layer.mock(DeviceState)({ drop: () => Effect.void }),
  );
  return { layer, forgotten, kept, dropped, lists: () => lists };
};

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

/** Runs a test with what is kept in memory, `Kept` handed to its app too. */
const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope | Kept>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(keptMemory()),
    ) as Effect.Effect<A>,
  );

/** Starts the app over the stand-ins and the test's `Kept`. */
const start = <A extends Parameters<typeof Runtime.start>[0]>(
  actor: A,
  layer: Layer.Layer<never, never, never> | Layer.Layer<any>,
) =>
  Effect.flatMap(Kept, (kept) =>
    Runtime.start(
      actor as never,
      Layer.merge(layer, Layer.succeed(Kept, kept)) as never,
    ),
  ) as Effect.Effect<Running<unknown>, never, Scope.Scope | Kept>;

const a1 = { accountId: 'a1', machineId: null, projectId: null };
const kitOf = (machineId: string) => ({
  accountId: 'a1',
  machineId,
  projectId: null,
});
const speechOff: KitParts = {
  accounts: null,
  speech: { _tag: 'Off' },
  harnesses: null,
  models: [],
};

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];

const list = (app: Running<unknown>) =>
  walk(app.snapshot()).find((each) => each.actor === 'MachineList')!;

const listModel = (app: Running<unknown>) => {
  const { list: held, fetchedAt } = list(app).model as {
    readonly list: { readonly value: ReadonlyArray<Machine> | null };
    readonly fetchedAt: number | null;
  };
  return { machines: held.value, fetchedAt };
};

describe('Machine List', () => {
  it('shows the saved list first, then Cloud Connect’s, and keeps it', async () => {
    const answer = await Effect.runPromise(
      Deferred.make<ReadonlyArray<Machine>>(),
    );
    const { layer, kept } = world(Deferred.await(answer));
    await run(
      Effect.gen(function* () {
        const saved = yield* Kept;
        yield* saved.write(ListShelf, a1, [machine('m1', 1)]);
        yield* saved.write(KitShelf, kitOf('m1'), speechOff);
        yield* saved.write(KitShelf, kitOf('m2'), speechOff);
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        expect(listModel(app).machines?.map(({ id }) => id)).toEqual(['m1']);
        expect(listModel(app).fetchedAt).toBeNull();
        // The saved list may be stale: nothing is deleted for it.
        expect(kept).toEqual([]);
        yield* Deferred.succeed(answer, [machine('m2', 2), machine('m3', 3)]);
        yield* wait();
        expect(listModel(app).machines?.map(({ id }) => id)).toEqual([
          'm2',
          'm3',
        ]);
        expect(yield* saved.read(ListShelf, a1)).toHaveLength(2);
        expect(kept).toEqual([{ accountId: 'a1', machineIds: ['m2', 'm3'] }]);
        // A Machine gone from the first list takes its Kit with it.
        expect(yield* saved.read(KitShelf, kitOf('m1'))).toBeNull();
        expect((yield* saved.read(KitShelf, kitOf('m2')))?.speech).toEqual({
          _tag: 'Off',
        });
      }),
    );
  });

  it('deletes nothing for a later list, which another tab may have outrun', async () => {
    let listed: ReadonlyArray<Machine> = [machine('m1', 1), machine('m2', 2)];
    const { layer, kept } = world(Effect.sync(() => listed));
    await run(
      Effect.gen(function* () {
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        expect(kept).toEqual([{ accountId: 'a1', machineIds: ['m1', 'm2'] }]);
        listed = [machine('m1', 1)];
        app.send(list(app).id, { _tag: 'ReloadAsked' });
        yield* wait();
        expect(listModel(app).machines?.map(({ id }) => id)).toEqual(['m1']);
        expect(kept).toHaveLength(1);
      }),
    );
  });

  it('keeps nothing less when Cloud Connect cannot be asked', async () => {
    const { layer, kept } = world(Effect.fail(new Error('offline')));
    await run(
      Effect.gen(function* () {
        const saved = yield* Kept;
        yield* saved.write(ListShelf, a1, [machine('m1', 1)]);
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        expect(listModel(app).machines?.map(({ id }) => id)).toEqual(['m1']);
        expect(kept).toEqual([]);
      }),
    );
  });

  it('forgets a Machine at Cloud Connect, takes it out of the list, then deletes its records and Kit here', async () => {
    const { layer, forgotten, kept, dropped } = world(
      Effect.succeed([machine('m1', 5), machine('m2', 1)]),
    );
    await run(
      Effect.gen(function* () {
        const saved = yield* Kept;
        yield* saved.write(KitShelf, kitOf('m1'), speechOff);
        yield* saved.write(KitShelf, kitOf('m2'), speechOff);
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        app.send(list(app).id, { _tag: 'ForgetAsked', id: 'm1' });
        yield* wait();
        expect(forgotten).toEqual(['m1']);
        // Its records alone: another tab may list a Machine not heard of here.
        expect(dropped).toEqual(['m1']);
        expect(yield* saved.read(KitShelf, kitOf('m1'))).toBeNull();
        expect(yield* saved.read(KitShelf, kitOf('m2'))).not.toBeNull();
        expect(kept).toHaveLength(1);
        expect(listModel(app).machines?.map(({ id }) => id)).toEqual(['m2']);
      }),
    );
  });

  it('shares what it holds as `Machines`, which waits for an address', async () => {
    const OwnerReading = Actor.build(
      Actor.define('Reader', {
        model: Schema.Struct({ reached: Schema.NullOr(Schema.String) }),
        message: Schema.TaggedUnion({ Reached: { url: Schema.String } }),
        requires: [Machines],
      }),
      {
        init: () => ({ model: { reached: null } }),
        workers: {
          reach: {
            run: (self) =>
              Effect.flatMap(Machines, (machines) =>
                machines.reachable('m1'),
              ).pipe(
                Effect.flatMap(({ socket }) =>
                  self.send({ _tag: 'Reached', url: socket }),
                ),
              ),
          },
        },
        on: { Reached: ({ url }) => ({ model: { reached: url } }) },
      },
    );
    const Both = Actor.build(Actor.define('Both', {}), {
      provides: () => machines,
      children: {
        machines: {
          actor: MachineListLive,
          input: () => ({ accountId: 'a1' }),
          props: () => ({ email: null }),
        },
        reader: { actor: OwnerReading },
      },
    });
    let listed: ReadonlyArray<Machine> = [machine('m1', 1, null)];
    const { layer } = world(Effect.sync(() => listed));
    await run(
      Effect.gen(function* () {
        const app = yield* start(Both, layer);
        yield* wait();
        const reader = () =>
          walk(app.snapshot()).find((each) => each.actor === 'Reader')!
            .model as { readonly reached: string | null };
        expect(reader().reached).toBeNull();
        listed = [machine('m1', 2)];
        app.send(list(app).id, { _tag: 'ReloadAsked' });
        yield* wait();
        expect(reader().reached).toBe('wss://m1.trycloudflare.com/rpc');
      }),
    );
  });
});

describe('Machine List rechecks', () => {
  /** Lets the app settle under the test's clock. */
  const settle = Effect.gen(function* () {
    for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
    yield* wait(5);
    for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
  });

  const timed = <A>(effect: Effect.Effect<A, unknown, Scope.Scope | Kept>) =>
    Effect.runPromise(
      Effect.scoped(effect).pipe(
        Effect.provide(keptMemory()),
        Effect.provide(TestClock.layer()),
      ) as Effect.Effect<A>,
    );

  it('asks Cloud Connect again while a line is not up, and stops once every line is', () =>
    timed(
      Effect.gen(function* () {
        const down = yield* SubscriptionRef.make<ReadonlySet<string>>(
          new Set(['m1']),
        );
        const { layer, lists } = world(
          Effect.succeed([machine('m1', 1), machine('m2', 1)]),
          down,
        );
        yield* start(OwnerLive, layer);
        yield* settle;
        expect(lists()).toBe(1);
        yield* TestClock.adjust(RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(2);
        // Every line up: nothing more is asked.
        yield* SubscriptionRef.set(down, new Set());
        yield* settle;
        yield* TestClock.adjust(RECHECK.slow * 2);
        yield* settle;
        expect(lists()).toBe(2);
        // A line drops: asked again.
        yield* SubscriptionRef.set(down, new Set(['m2']));
        yield* settle;
        yield* TestClock.adjust(RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(3);
      }),
    ));

  it('asks less often after the first minute, and at once on Reload', () =>
    timed(
      Effect.gen(function* () {
        const down = yield* SubscriptionRef.make<ReadonlySet<string>>(
          new Set(['m1']),
        );
        const { layer, lists } = world(
          Effect.succeed([machine('m1', 1)]),
          down,
        );
        const app = yield* start(OwnerLive, layer);
        yield* settle;
        for (let at = 0; at < RECHECK.fastFor; at++) {
          yield* TestClock.adjust(RECHECK.fast);
          yield* settle;
        }
        expect(lists()).toBe(1 + RECHECK.fastFor);
        yield* TestClock.adjust(RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(1 + RECHECK.fastFor);
        yield* TestClock.adjust(RECHECK.slow - RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(2 + RECHECK.fastFor);
        app.send(list(app).id, { _tag: 'ReloadAsked' });
        yield* settle;
        expect(lists()).toBe(3 + RECHECK.fastFor);
      }),
    ));
});
