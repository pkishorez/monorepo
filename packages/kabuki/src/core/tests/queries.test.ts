import {
  Context,
  Data,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Schema,
} from 'effect';
import type { Scope } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { restore } from '../snapshot/engine/index.ts';
import { Actor, Runtime } from '../index.ts';
import { Stopped } from '../runtime/index.ts';
import { run as runNever, settle } from './fixtures.ts';

/** The core's `run`, for a test whose Effect may fail: a failure fails the test. */
const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  runNever(Effect.orDie(effect));

/*
 * Queries: questions an Instance answers from outside the tree, from what
 * it holds and what its Services know, changing nothing. Written at the top
 * or in a State; typed on the live Instance by the State it is in.
 */

class Probe extends Context.Service<
  Probe,
  { readonly peers: Effect.Effect<ReadonlyArray<string>> }
>()('test/Probe') {}

class Closed extends Data.TaggedError('Closed')<{}> {}

const Socket = Actor.build(
  Actor.define('Socket', {
    requires: [Probe],
    model: Schema.Struct({ url: Schema.String, sent: Schema.Number }),
    state: Schema.TaggedUnion({
      Closed: {},
      Open: { since: Schema.Number },
    }),
    message: Schema.TaggedUnion({ Opened: {}, Dropped: {}, Sent: {} }),
  }),
  {
    init: () => ({
      model: { url: 'wss://a', sent: 0 },
      state: { _tag: 'Closed' },
    }),
    on: {
      Opened: (_, { at }) => ({ state: { _tag: 'Open', since: at } }),
      Dropped: () => ({ state: { _tag: 'Closed' } }),
      Sent: (_, { model }) => ({ model: { ...model, sent: model.sent + 1 } }),
    },
    queries: {
      url: { run: (self) => Effect.map(self.get, ({ model }) => model.url) },
      sentOver: {
        run: (self, args: { readonly than: number }) =>
          Effect.map(self.get, ({ model }) => model.sent > args.than),
      },
      sentAtLeast: {
        run: (self, than = 1) =>
          Effect.map(self.get, ({ model }) => model.sent >= than),
      },
    },
    states: {
      Open: {
        queries: {
          peers: {
            run: () => Effect.flatMap(Probe, (probe) => probe.peers),
          },
          openFor: {
            run: (self) =>
              Effect.gen(function* () {
                const { state } = yield* self.get;
                if (state._tag !== 'Open') return yield* new Closed();
                return (yield* self.now) - state.since;
              }),
          },
        },
      },
    },
  },
);

const ProbeLive = Layer.succeed(Probe, { peers: Effect.succeed(['b', 'c']) });

describe('a Query', () => {
  it('answers from the Instance, with args, at the top in every State', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Socket, ProbeLive);
        const socket = running.instance({ from: 'test' });
        expect(yield* socket.queries.url()).toBe('wss://a');
        expect(yield* socket.queries.sentOver({ than: 0 })).toBe(false);
        socket.send({ _tag: 'Sent' });
        expect(yield* socket.queries.sentOver({ than: 0 })).toBe(true);
        socket.send({ _tag: 'Opened' });
        expect(yield* socket.queries.url()).toBe('wss://a');

        expectTypeOf(socket.queries.url).returns.toEqualTypeOf<
          Effect.Effect<string, Stopped>
        >();
        expectTypeOf(socket.queries.sentOver)
          .parameter(0)
          .toEqualTypeOf<{ readonly than: number }>();
        // An optional arg stays optional.
        expect(yield* socket.queries.sentAtLeast()).toBe(true);
        expect(yield* socket.queries.sentAtLeast(2)).toBe(false);
      }),
    ));

  it("is on the type only in its State, and runs with the Actor's Capabilities", () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Socket, ProbeLive);
        const socket = running.instance({ from: 'test' });
        expectTypeOf(socket.queries).not.toHaveProperty('peers');
        if (socket._tag === 'Closed') {
          expectTypeOf(socket.queries).not.toHaveProperty('peers');
          expectTypeOf(socket.queries).toHaveProperty('url');
        }
        expect(Object.keys(socket.queries)).toEqual([
          'url',
          'sentOver',
          'sentAtLeast',
        ]);

        socket.send({ _tag: 'Opened' });
        const open = running.instance({ from: 'test' });
        if (open._tag !== 'Open') throw new Error('not Open');
        expect(yield* open.queries.peers()).toEqual(['b', 'c']);
        expect(yield* open.queries.openFor()).toBeGreaterThanOrEqual(0);
        expectTypeOf(open.queries.openFor).returns.toEqualTypeOf<
          Effect.Effect<number, Closed | Stopped>
        >();
        expectTypeOf(open.queries.peers).returns.toEqualTypeOf<
          Effect.Effect<ReadonlyArray<string>, Stopped>
        >();
      }),
    ));

  it('fails as Stopped once its State is left, though the Instance lives on', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Socket, ProbeLive);
        const socket = running.instance({ from: 'test' });
        socket.send({ _tag: 'Opened' });
        const open = running.instance({ from: 'test' });
        if (open._tag !== 'Open') throw new Error('not Open');
        const peers = open.queries.peers;
        socket.send({ _tag: 'Dropped' });
        expect(open.stopped).toBe(false);
        const refused = yield* Effect.flip(peers());
        expect(refused).toBeInstanceOf(Stopped);
        expect(refused).toMatchObject({ instance: 'Socket', query: 'peers' });
        // Open again: the same Instance answers once more.
        socket.send({ _tag: 'Opened' });
        expect(yield* peers()).toEqual(['b', 'c']);
      }),
    ));

  it('fails as Stopped once the Instance has stopped', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(Socket, ProbeLive);
        const socket = running.instance({ from: 'test' });
        yield* running.stop();
        const refused = yield* Effect.flip(socket.queries.url());
        expect(refused._tag).toBe('Stopped');
      }),
    ));

  it('is interrupted, and Stopped for its asker, when its State is left while it answers', () =>
    run(
      Effect.gen(function* () {
        const hold = yield* Deferred.make<ReadonlyArray<string>>();
        const running = yield* Runtime.start(
          Socket,
          Layer.succeed(Probe, { peers: Deferred.await(hold) }),
        );
        const socket = running.instance({ from: 'test' });
        socket.send({ _tag: 'Opened' });
        const open = running.instance({ from: 'test' });
        if (open._tag !== 'Open') throw new Error('not Open');
        const asking = yield* Effect.forkChild(
          Effect.flip(open.queries.peers()),
        );
        yield* settle;
        socket.send({ _tag: 'Dropped' });
        const refused = yield* Fiber.join(asking);
        expect(refused._tag).toBe('Stopped');
      }),
    ));

  it('is cancelled by a Restore, which starts the app over, though its Instance keeps its ID', () =>
    run(
      Effect.gen(function* () {
        const hold = yield* Deferred.make<ReadonlyArray<string>>();
        const running = yield* Runtime.start(
          Socket,
          Layer.succeed(Probe, { peers: Deferred.await(hold) }),
        );
        const socket = running.instance({ from: 'test' });
        socket.send({ _tag: 'Opened' });
        const saved = running.snapshot();
        const open = running.instance({ from: 'test' });
        if (open._tag !== 'Open') throw new Error('not Open');
        const asking = yield* Effect.forkChild(
          Effect.flip(open.queries.peers()),
        );
        yield* settle;
        running.send('Socket', { ...restore(saved) });
        expect((yield* Fiber.join(asking))._tag).toBe('Stopped');
        // Were it still running, this would answer it.
        yield* Deferred.succeed(hold, []);
      }),
    ));

  describe('below an Instance that stops', () => {
    class Wait extends Context.Service<
      Wait,
      { readonly answer: Effect.Effect<string> }
    >()('test/Wait') {}

    const Bulb = Actor.build(Actor.define('Bulb', { requires: [Wait] }), {
      queries: { glow: { run: () => Effect.flatMap(Wait, (w) => w.answer) } },
    });
    const Lamp = Actor.build(Actor.define('Lamp', { requires: [Wait] }), {
      children: (child) => ({ bulb: child(Bulb) }),
    });
    const Room = Actor.build(
      Actor.define('Room', {
        requires: [Wait],
        model: Schema.Struct({ lit: Schema.Boolean }),
        message: Schema.TaggedUnion({ Switched: {} }),
      }),
      {
        init: () => ({ model: { lit: true } }),
        children: (child) => ({
          lamp: child(Lamp, { while: ({ model }) => model.lit }),
        }),
        on: { Switched: (_, { model }) => ({ model: { lit: !model.lit } }) },
      },
    );

    /** A Room whose Bulb is answering `glow`, held until `hold` is done. */
    const asking = Effect.gen(function* () {
      const hold = yield* Deferred.make<string>();
      const running = yield* Runtime.start(
        Room,
        Layer.succeed(Wait, { answer: Deferred.await(hold) }),
      );
      const fiber = yield* Effect.forkChild(
        Effect.flip(running.query('Room/lamp#1/bulb#1', 'glow', undefined)),
      );
      yield* settle;
      expect(fiber.pollUnsafe()).toBeUndefined();
      return { hold, running, fiber };
    });

    it('fails as Stopped when the Runtime stops', () =>
      run(
        Effect.gen(function* () {
          const { hold, running, fiber } = yield* asking;
          yield* running.stop();
          yield* Deferred.succeed(hold, 'late');
          expect(yield* Fiber.join(fiber)).toBeInstanceOf(Stopped);
        }),
      ));

    it('fails as Stopped when an ancestor is removed', () =>
      run(
        Effect.gen(function* () {
          const { hold, running, fiber } = yield* asking;
          running.send('Room', { _tag: 'Switched' });
          yield* settle;
          expect(running.snapshot().children).toEqual({});
          yield* Deferred.succeed(hold, 'late');
          expect(yield* Fiber.join(fiber)).toBeInstanceOf(Stopped);
        }),
      ));
  });

  it('passes its own failure through', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(
          Socket,
          Layer.succeed(Probe, { peers: Effect.die(new Error('boom')) }),
        );
        const socket = running.instance({ from: 'test' });
        socket.send({ _tag: 'Opened' });
        const open = running.instance({ from: 'test' });
        if (open._tag !== 'Open') throw new Error('not Open');
        const exit: Exit.Exit<unknown, unknown> = yield* Effect.exit(
          open.queries.peers(),
        );
        expect(exit._tag).toBe('Failure');
      }),
    ));

  it('may not be written twice, at the top and in a State', () => {
    expect(() =>
      Actor.build(
        Actor.define('Twice', {
          state: Schema.TaggedUnion({ A: {}, B: {} }),
        }),
        {
          init: () => ({ state: { _tag: 'A' } }),
          queries: { same: { run: () => Effect.succeed(1) } },
          states: {
            A: { queries: { same: { run: () => Effect.succeed(2) } } },
          },
        },
      ),
    ).toThrow('Query "same" is written twice');
  });

  it('may reach only what its Actor Requires', () => {
    class Other extends Context.Service<Other, { readonly x: number }>()(
      'test/Other',
    ) {}
    Actor.build(Actor.define('Needy', { requires: [Probe] }), {
      queries: {
        fine: { run: () => Effect.flatMap(Probe, (p) => p.peers) },
        // @ts-expect-error: Other is not Required.
        notFine: { run: () => Effect.map(Other, (o) => o.x) },
      },
    });
  });
});
