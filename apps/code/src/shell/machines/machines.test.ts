import 'fake-indexeddb/auto';
import { Deferred, Effect, Layer, Schema } from 'effect';
import type { Scope } from 'effect';
import type { Machine as MachineSchema } from '@kestack/ai-toolkit/machines';
import { MachinesClient } from '@kestack/ai-toolkit/machines/client';
import { Actor, type Instance, Runtime, type Running } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { Store } from '@kestack/std-toolkit/replica';
import { describe, expect, it } from 'vitest';
import { home, root } from '../../places/index.ts';
import { MachineListLive, Machines, Saved, savedMemory } from './actor.ts';
import { choose, health, socketUrl } from './health.ts';

/*
 * The Machine List with the Backend, the Store and the router stood in
 * for: what was saved shows first and the Backend's answer replaces it and
 * is kept; at the root it opens the Machine last used, else the one seen
 * last; Forget asks the Backend and then deletes the Machine's records;
 * and `Machines` says all of it to the pages, waiting for a Machine with an
 * address. Then what a Machine's record says of it.
 */

type Machine = typeof MachineSchema.Type;

const machine = (
  id: string,
  lastSeen: number,
  url: string | null = `https://${id}.trycloudflare.com`,
): Machine => ({
  id,
  name: id,
  url,
  key: `key-${id}`,
  version: '0.0.1',
  tunnel: { ok: true, at: lastSeen, problem: null },
  lastSeen,
});

const Owner = Actor.define('Owner', {
  model: Schema.Struct({
    atRoot: Schema.Boolean,
    on: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({ Moved: { on: Schema.NullOr(Schema.String) } }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { atRoot: true, on: null } }),
  provides: () => Machines.layer,
  children: {
    machines: {
      actor: MachineListLive,
      input: () => ({ accountId: 'a1' }),
      props: ({ model }) => ({
        atRoot: model.atRoot,
        last: 'm2',
        on: model.on,
        email: 'me@example.com',
      }),
    },
  },
  on: {
    Moved: ({ on }) => ({ model: { atRoot: on === null, on } }),
  },
});

/** A test's stand-ins, and what they were asked. */
const world = (listed: Effect.Effect<ReadonlyArray<Machine>>) => {
  const moves: Array<unknown> = [];
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
    Layer.mock(Navigation)({
      push: (to) => Effect.sync(() => void moves.push(to)),
      replace: (to) => Effect.sync(() => void moves.push(to)),
    }),
  );
  return { layer, moves, forgotten, removed };
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

  it('opens the Machine last used here at the root', async () => {
    const { layer, moves } = world(
      Effect.succeed([machine('m1', 5), machine('m2', 1)]),
    );
    await run(
      Effect.gen(function* () {
        yield* start(OwnerLive, layer);
        yield* wait();
        expect(moves).toEqual([home('m2')]);
      }),
    );
  });

  it('forgets a Machine at the Backend, then deletes its records here', async () => {
    const { layer, forgotten, removed, moves } = world(
      Effect.succeed([machine('m1', 5), machine('m2', 1)]),
    );
    await run(
      Effect.gen(function* () {
        const app = yield* start(OwnerLive, layer);
        yield* wait();
        app.send(walk(app.snapshot())[0]!.id, { _tag: 'Moved', on: 'm1' });
        app.send(list(app).id, { _tag: 'Forget', id: 'm1' });
        yield* wait();
        expect(forgotten).toEqual(['m1']);
        expect(removed).toEqual(['m1']);
        expect(listModel(app).machines?.map(({ id }) => id)).toEqual(['m2']);
        // The Machine open was the one forgotten: back to the root.
        expect(moves.at(-1)).toEqual(root());
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
                Effect.flatMap(({ url }) =>
                  self.send({ _tag: 'Reached', url: url ?? '' }),
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
          props: () => ({ atRoot: false, last: null, on: null, email: null }),
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
        expect(reader().reached).toBe('https://m1.trycloudflare.com');
      }),
    );
  });
});

describe('a Machine’s record', () => {
  const now = 1_000_000;

  it('opens the one last used, else the one seen last', () => {
    const list = [machine('a', 10), machine('b', 30), machine('c', 20)];
    expect(choose(list, 'c')?.id).toBe('c');
    expect(choose(list, 'gone')?.id).toBe('b');
    expect(choose([], null)).toBeNull();
  });

  it('says why its socket is not up', () => {
    expect(health(machine('m', now), 'connected', now)._tag).toBe('Connected');
    expect(health(null, 'connecting', now)._tag).toBe('Unknown');
    expect(health(machine('m', now - 10_000), 'reconnecting', now)._tag).toBe(
      'Connecting',
    );
    expect(
      health(
        {
          ...machine('m', now - 10_000),
          tunnel: { ok: false, at: now, problem: 'no route' },
        },
        'reconnecting',
        now,
      ),
    ).toEqual({
      _tag: 'TunnelBroken',
      lastSeen: now - 10_000,
      problem: 'no route',
    });
    expect(health(machine('m', now - 46_000), 'reconnecting', now)._tag).toBe(
      'Down',
    );
  });

  it('is reached at its address over `wss`', () => {
    expect(socketUrl('https://a-b.trycloudflare.com/')).toBe(
      'wss://a-b.trycloudflare.com/rpc',
    );
  });
});
