import 'fake-indexeddb/auto';
import {
  Deferred,
  Effect,
  Fiber,
  Layer,
  Schema,
  Scope,
  SubscriptionRef,
} from 'effect';
import type { Machine as MachineSchema } from '@kestack/ai-toolkit/machines';
import { MachinesClient } from '@kestack/ai-toolkit/machines/client';
import { Actor, type Instance, Runtime, type Running } from '@kestack/kabuki';
import { Replicas, Store } from '@kestack/std-toolkit/replica';
import { describe, expect, it } from 'vitest';
import { MachineListLive, Machines, Saved, savedMemory } from './actor.ts';
import { health, socketUrl } from './health.ts';
import { Link, nobody } from './link.ts';
import { listedOnly } from './reach.ts';

/*
 * The Machine List with the Backend and the Store stood in for: what was
 * saved shows first and the Backend's answer replaces it and is kept;
 * Forget asks the Backend, takes the Machine out of the list and then
 * deletes its records; `Machines` says all of it to the pages, waiting for
 * a Machine with an address; and no Machine's Instance opens until it is
 * listed. Then what a Machine's record says of it.
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
  provides: () => Machines.layer,
  children: {
    machines: {
      actor: MachineListLive,
      input: () => ({ accountId: 'a1' }),
      props: () => ({ email: 'me@example.com' }),
    },
  },
});

/** A test's stand-ins, and what they were asked. */
const world = (listed: Effect.Effect<ReadonlyArray<Machine>>) => {
  const forgotten: Array<string> = [];
  const removed: Array<string> = [];
  const layer = Layer.mergeAll(
    Layer.mock(MachinesClient)({
      List: () => listed,
      Forget: ({ id }: { readonly id: string }) =>
        Effect.sync(() => void forgotten.push(id)),
    } as never),
    Layer.mock(Store)({
      remove: (_: unknown, key: string) =>
        Effect.sync(() => void removed.push(key)),
    } as never),
  );
  return { layer, forgotten, removed };
};

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

/** Runs a test with each Account's list kept in memory, `Saved` handed to its app too. */
const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope | Saved>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(savedMemory()),
    ) as Effect.Effect<A>,
  );

/** Starts the app over the stand-ins and the test's `Saved`. */
const start = <A extends Parameters<typeof Runtime.start>[0]>(
  actor: A,
  layer: Layer.Layer<never, never, never> | Layer.Layer<any>,
) =>
  Effect.flatMap(Saved, (saved) =>
    Runtime.start(
      actor as never,
      Layer.merge(layer, Layer.succeed(Saved, saved)) as never,
    ),
  ) as Effect.Effect<Running<unknown>, never, Scope.Scope | Saved>;

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];

const list = (app: Running<unknown>) =>
  walk(app.snapshot()).find((each) => each.actor === 'MachineList')!;

const listModel = (app: Running<unknown>) =>
  list(app).model as {
    readonly machines: ReadonlyArray<Machine> | null;
    readonly fetchedAt: number | null;
  };

describe('Machine List', () => {
  it('shows the saved list first, then the Backend’s, and keeps it', async () => {
    const answer = await Effect.runPromise(
      Deferred.make<ReadonlyArray<Machine>>(),
    );
    const { layer } = world(Deferred.await(answer));
    await run(
      Effect.gen(function* () {
        const saved = yield* Saved;
        yield* saved.write('a1', [machine('m1', 1)]);
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        expect(listModel(app).machines?.map(({ id }) => id)).toEqual(['m1']);
        expect(listModel(app).fetchedAt).toBeNull();
        yield* Deferred.succeed(answer, [machine('m2', 2), machine('m3', 3)]);
        yield* wait();
        expect(listModel(app).machines?.map(({ id }) => id)).toEqual([
          'm2',
          'm3',
        ]);
        expect(yield* saved.read('a1')).toHaveLength(2);
      }),
    );
  });

  it('forgets a Machine at the Backend, takes it out of the list, then deletes its records here', async () => {
    const { layer, forgotten, removed } = world(
      Effect.succeed([machine('m1', 5), machine('m2', 1)]),
    );
    await run(
      Effect.gen(function* () {
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        app.send(list(app).id, { _tag: 'Forget', id: 'm1' });
        yield* wait();
        expect(forgotten).toEqual(['m1']);
        expect(removed).toEqual(['m1']);
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
      provides: () => Machines.layer,
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
        app.send(list(app).id, { _tag: 'Refresh' });
        yield* wait();
        expect(reader().reached).toBe('wss://m1.trycloudflare.com/rpc');
      }),
    );
  });
});

describe('the Replicas of every Machine', () => {
  it("open nothing of a Machine until it is in the Account's list", async () => {
    const held: Array<string> = [];
    const below = Layer.succeed(
      Replicas,
      Replicas.of({
        hold: (_, key) =>
          Effect.sync(() => {
            held.push(key);
            return null as never;
          }),
      }),
    );
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { known } = yield* Link;
          const replicas = yield* Replicas;
          const listed = (machines: ReadonlyArray<Machine>) =>
            SubscriptionRef.set(known, {
              ...nobody,
              accountId: 'b',
              machines,
              fetchedAt: 1,
            });
          // Account B's list, and an address naming Account A's Machine.
          yield* listed([machine('mine', 1)]);
          const opening = yield* Effect.forkScoped(
            replicas.hold('Ai', 'theirs'),
          );
          yield* wait();
          expect(held).toEqual([]);
          // Listed (as once Account A is signed in): it opens.
          yield* listed([machine('mine', 1), machine('theirs', 1)]);
          yield* Fiber.join(opening);
          expect(held).toEqual(['theirs']);
        }).pipe(
          Effect.provide(
            listedOnly.pipe(
              Layer.provideMerge(Layer.merge(below, Machines.layer)),
            ),
          ),
        ),
      ),
    );
  });
});

describe('a Machine’s record', () => {
  const now = 1_000_000;

  it('says why its socket is not up', () => {
    expect(health(machine('m', now), 'connected', now)._tag).toBe('Connected');
    expect(health(null, 'connecting', now)._tag).toBe('Unknown');
    const broken = {
      _tag: 'Unreachable',
      url: 'https://m.trycloudflare.com',
      at: now,
      problem: 'no route',
    } as const;
    expect(
      health(
        { ...machine('m', now - 10_000), status: broken },
        'reconnecting',
        now,
      ),
    ).toEqual({ _tag: 'Seen', lastSeen: now - 10_000, status: broken });
    expect(health(machine('m', now - 46_000), 'reconnecting', now)._tag).toBe(
      'Down',
    );
  });

  it('is reached at its `https://` address over `wss`, and at no other', () => {
    expect(socketUrl('https://a-b.trycloudflare.com/')).toBe(
      'wss://a-b.trycloudflare.com/rpc',
    );
    expect(socketUrl('http://a-b.trycloudflare.com')).toBeNull();
    expect(socketUrl('ws://a-b.trycloudflare.com')).toBeNull();
    expect(socketUrl(null)).toBeNull();
  });
});
