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
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { restore } from '../snapshot/engine/index.ts';
import { Actor, Runtime } from '../index.ts';
import { Stopped } from '../runtime/index.ts';
import { run as runNever, settle } from './fixtures.ts';

/** The core's `run`, for a test whose Effect may fail: a failure fails the test. */
const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  runNever(Effect.orDie(effect));

/*
 * Queries: questions an Instance answers from outside the tree, from what
 * it holds and what its Services know, changing nothing. Declared in
 * `define`, with what each is asked with and what it answers; answered at
 * the top or in a State; typed on the live Instance by the State it is in.
 */

class Probe extends Context.Service<
  Probe,
  { readonly peers: Effect.Effect<ReadonlyArray<string>> }
>()('test/Probe') {}

class Closed extends Data.TaggedError('Closed')<{}> {}

const Socket = Actor.define('Socket', {
  requires: [Probe],
  model: Schema.Struct({ url: Schema.String, sent: Schema.Number }),
  state: Schema.TaggedUnion({
    Closed: {},
    Open: { since: Schema.Number },
  }),
  message: Schema.TaggedUnion({ Opened: {}, Dropped: {}, Sent: {} }),
  queries: {
    url: { result: Schema.String },
    sentOver: { args: { than: Schema.Number }, result: Schema.Boolean },
    sentAtLeast: { args: Schema.Number, result: Schema.Boolean },
    peers: { result: Schema.Array(Schema.String) },
    openFor: { result: Schema.Number },
  },
});

const SocketLive = Socket.build({
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
    url: (self) => Effect.map(self.get, ({ model }) => model.url),
    sentOver: (self, { than }) =>
      Effect.map(self.get, ({ model }) => model.sent > than),
    sentAtLeast: (self, than) =>
      Effect.map(self.get, ({ model }) => model.sent >= than),
  },
  states: {
    Open: {
      queries: {
        peers: () => Effect.flatMap(Probe, (probe) => probe.peers),
        openFor: (self) =>
          Effect.gen(function* () {
            const { state } = yield* self.get;
            if (state._tag !== 'Open') return yield* new Closed();
            return (yield* self.now) - state.since;
          }),
      },
    },
  },
});

const ProbeLive = Layer.succeed(Probe, { peers: Effect.succeed(['b', 'c']) });

describe('a Query', () => {
  it('answers from the Instance, with args, at the top in every State', () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(SocketLive, ProbeLive);
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
        // Args written as a whole Schema are that Schema's type.
        expectTypeOf(socket.queries.sentAtLeast)
          .parameter(0)
          .toEqualTypeOf<number>();
        expect(yield* socket.queries.sentAtLeast(1)).toBe(true);
        expect(yield* socket.queries.sentAtLeast(2)).toBe(false);
        // @ts-expect-error: a Query that declares args is asked with them.
        void socket.queries.sentOver();
        // @ts-expect-error: a Query that declares none is asked with none.
        void socket.queries.url(1);
      }),
    ));

  it("is on the type only in its State, and runs with the Actor's Capabilities", () =>
    run(
      Effect.gen(function* () {
        const running = yield* Runtime.start(SocketLive, ProbeLive);
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
        const running = yield* Runtime.start(SocketLive, ProbeLive);
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
        const running = yield* Runtime.start(SocketLive, ProbeLive);
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
          SocketLive,
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
          SocketLive,
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

    const Bulb = Actor.define('Bulb', {
      requires: [Wait],
      queries: { glow: { result: Schema.String } },
    }).build({
      queries: { glow: () => Effect.flatMap(Wait, (w) => w.answer) },
    });
    const Lamp = Actor.define('Lamp', { requires: [Wait] }).build({
      children: { bulb: Actor.child(Bulb) },
    });
    const Room = Actor.define('Room', {
      requires: [Wait],
      model: Schema.Struct({ lit: Schema.Boolean }),
      message: Schema.TaggedUnion({ Switched: {} }),
    }).build({
      init: () => ({ model: { lit: true } }),
      children: {
        lamp: Actor.child(Lamp, { while: ({ model }) => model.lit }),
      },
      on: { Switched: (_, { model }) => ({ model: { lit: !model.lit } }) },
    });

    /** A Room whose Bulb is answering `glow`, held until `hold` is done. */
    const asking = Effect.gen(function* () {
      const hold = yield* Deferred.make<string>();
      const running = yield* Runtime.start(
        Room,
        Layer.succeed(Wait, { answer: Deferred.await(hold) }),
      );
      const bulb = running.instance({ from: 'test' }).children.lamp!.children
        .bulb;
      const fiber = yield* Effect.forkChild(Effect.flip(bulb.queries.glow()));
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
          SocketLive,
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
      Actor.define('Twice', {
        state: Schema.TaggedUnion({ A: {}, B: {} }),
        queries: { same: { result: Schema.Number } },
      }).build({
        init: () => ({ state: { _tag: 'A' } }),
        queries: { same: () => Effect.succeed(1) },
        states: {
          A: { queries: { same: () => Effect.succeed(2) } },
        },
      }),
    ).toThrow('Query "same" is written twice');
  });

  it('is answered only if `define` declares it', () => {
    expect(() =>
      // @ts-expect-error: no Query `secret` is declared.
      Actor.define('Undeclared', {}).build({
        queries: { secret: () => Effect.succeed(1) },
      }),
    ).toThrow('Query "secret" is answered but not declared in `define`');
  });

  it('is warned when declared but answered nowhere', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logged: Array<unknown> = [];
    const log = vi
      .spyOn(console, 'log')
      .mockImplementation((...args) => void logged.push(args));
    Actor.define('Unanswered', {
      queries: { lost: { result: Schema.String } },
    }).build({});
    const said = JSON.stringify([...warn.mock.calls, ...logged]);
    warn.mockRestore();
    log.mockRestore();
    expect(said).toContain('Query \\"lost\\" is declared but answered nowhere');
  });

  it('checks its args and its answer against what `define` declares', () =>
    run(
      Effect.gen(function* () {
        const Liar = Actor.define('Liar', {
          queries: {
            double: { args: { n: Schema.Number }, result: Schema.Number },
            name: { result: Schema.String },
          },
        }).build({
          queries: {
            double: (_, { n }) => Effect.succeed(n * 2),
            name: () => Effect.succeed(42 as unknown as string),
          },
        });
        const running = yield* Runtime.start(Liar);
        const liar = running.instance({ from: 'test' });
        expect(yield* liar.queries.double({ n: 2 })).toBe(4);
        const badArgs = yield* Effect.exit(
          liar.queries.double({ n: 'two' } as unknown as { n: number }),
        );
        expect(Exit.isFailure(badArgs) && String(badArgs.cause)).toContain(
          'the args of Query "double" does not match its Schema',
        );
        const badAnswer = yield* Effect.exit(liar.queries.name());
        expect(Exit.isFailure(badAnswer) && String(badAnswer.cause)).toContain(
          'the answer of Query "name" does not match its Schema',
        );
      }),
    ));

  it('keeps its Schemas on the definition, for a tool that describes it', () => {
    const { queries } = SocketLive.definition.schemas;
    expect(Object.keys(queries ?? {})).toEqual([
      'url',
      'sentOver',
      'sentAtLeast',
      'peers',
      'openFor',
    ]);
    expect(queries?.['url']?.args).toBeUndefined();
    expect(Schema.isSchema(queries?.['sentOver']?.args)).toBe(true);
    expect(queries?.['sentAtLeast']?.args).toBe(Schema.Number);
    expect(queries?.['peers']?.result).toBeDefined();
  });

  it('may reach only what its Actor Requires', () => {
    class Other extends Context.Service<Other, { readonly x: number }>()(
      'test/Other',
    ) {}
    Actor.define('Needy', {
      requires: [Probe],
      queries: {
        fine: { result: Schema.Array(Schema.String) },
        notFine: { result: Schema.Number },
      },
    }).build({
      queries: {
        fine: () => Effect.flatMap(Probe, (p) => p.peers),
        // @ts-expect-error: Other is not Required.
        notFine: () => Effect.map(Other, (o) => o.x),
      },
    });
  });

  it('answers what it declares', () => {
    Actor.define('Typed', {
      queries: { count: { result: Schema.Number } },
    }).build({
      queries: {
        // @ts-expect-error: the answer is not a number.
        count: () => Effect.succeed('three'),
      },
    });
  });
});
