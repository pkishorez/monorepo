import {
  Context,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Option,
  Stream,
} from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { FakeWorld } from '../index.ts';
import type { FakeNow } from '../types.ts';
import { Computers, OnOutdated, computers, newBuild } from './fakes.ts';

/*
 * A FakeWorld starts its Fakes each time its Layer is built, from their
 * `initial` or from `start`, and lets them go as its Scope closes. Its
 * controls change the state the Fakes' Layers read.
 */

const run = <A>(effect: Effect.Effect<A, string, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const valuesOf = (now: Option.Option<ReadonlyArray<FakeNow>>) =>
  Option.getOrThrow(now).map(({ name, value }) => ({ name, value }));

describe('FakeWorld', () => {
  it("a Fake's layer sees a control's change", () =>
    run(
      Effect.gen(function* () {
        const world = FakeWorld.make([newBuild]);
        const context = yield* Layer.build(world.layer);
        const outdated = Context.get(context, OnOutdated);
        expect(yield* outdated.newer).toBe(false);
        const waiting = yield* Effect.forkScoped(outdated.waited);
        expect(yield* world.control('newBuild', 'PutOutNewerBuild', {})).toBe(
          'done',
        );
        yield* Fiber.join(waiting);
        expect(yield* outdated.newer).toBe(true);
      }),
    ));

  it('start replaces initial for the Fakes it names', () =>
    run(
      Effect.gen(function* () {
        const world = FakeWorld.make([newBuild, computers], {
          start: { newBuild: { newer: true } },
        });
        const context = yield* Layer.build(world.layer);
        expect(yield* Context.get(context, OnOutdated).newer).toBe(true);
        expect(yield* Context.get(context, Computers).names).toEqual(['mac']);
      }),
    ));

  it('every control that cannot run fails with its reason', () =>
    run(
      Effect.gen(function* () {
        const world = FakeWorld.make([newBuild, computers]);
        const reason = (fake: string, control: string, payload: unknown) =>
          Effect.flip(world.control(fake, control, payload));

        expect(yield* reason('computers', 'SignIn', { name: 'pc' })).toBe(
          'The Fake World has not started: build its layer first',
        );
        yield* Layer.build(world.layer);
        expect(yield* reason('printer', 'SignIn', {})).toBe(
          'No Fake is named printer',
        );
        expect(yield* reason('computers', 'Reboot', {})).toBe(
          'computers has no control Reboot',
        );
        expect(yield* reason('computers', 'toString', {})).toBe(
          'computers has no control toString',
        );
        expect(yield* reason('computers', 'SignIn', { name: 7 })).toMatch(
          /^computers SignIn refuses its payload: /,
        );
        expect(yield* reason('computers', 'SignIn', undefined)).toMatch(
          /^computers SignIn refuses its payload: /,
        );
        expect(yield* reason('computers', 'SignOut', { name: 'pc' })).toBe(
          'no computer named pc',
        );
      }),
    ));

  it('fakes streams every Fake as it is now, and after each change', () =>
    run(
      Effect.gen(function* () {
        const world = FakeWorld.make([newBuild, computers]);
        expect(yield* Stream.runHead(world.fakes)).toEqual(Option.some([]));

        yield* Layer.build(world.layer);
        const now = yield* Stream.runHead(world.fakes);
        expect(valuesOf(now)).toEqual([
          { name: 'newBuild', value: { newer: false } },
          { name: 'computers', value: { names: ['mac'] } },
        ]);
        const [, shown] = Option.getOrThrow(now);
        expect(shown?.state).toBe(computers.state);
        expect(shown?.controls).toEqual([
          { name: 'SignIn', payload: computers.controls.SignIn?.payload },
          { name: 'SignOut', payload: computers.controls.SignOut?.payload },
        ]);

        const first = yield* Deferred.make<void>();
        const seen = yield* world.fakes.pipe(
          Stream.tap(() => Deferred.succeed(first, undefined)),
          Stream.take(2),
          Stream.runCollect,
          Effect.forkScoped,
        );
        yield* Deferred.await(first);
        yield* world.control('computers', 'SignIn', { name: 'pc' });
        const [, after] = yield* Fiber.join(seen);
        expect(after?.map(({ value }) => value)).toEqual([
          { newer: false },
          { names: ['mac', 'pc'] },
        ]);
      }),
    ));

  it("the layer's Scope closing ends the world", () =>
    run(
      Effect.gen(function* () {
        const world = FakeWorld.make([computers]);
        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* Layer.build(world.layer);
            yield* world.control('computers', 'SignIn', { name: 'pc' });
          }),
        );
        expect(yield* Stream.runHead(world.fakes)).toEqual(Option.some([]));
        expect(
          yield* Effect.flip(world.control('computers', 'SignIn', {})),
        ).toBe('The Fake World has not started: build its layer first');

        // The next build starts again from `initial`.
        const context = yield* Layer.build(world.layer);
        expect(yield* Context.get(context, Computers).names).toEqual(['mac']);
      }),
    ));

  it('follows the latest build open, then the one before it', () =>
    run(
      Effect.gen(function* () {
        const world = FakeWorld.make([computers]);
        const older = yield* Layer.build(world.layer);
        const newer = yield* Effect.scoped(
          Effect.gen(function* () {
            const context = yield* Layer.build(world.layer);
            yield* world.control('computers', 'SignIn', { name: 'pc' });
            return yield* Context.get(context, Computers).names;
          }),
        );
        expect(newer).toEqual(['mac', 'pc']);
        expect(yield* Context.get(older, Computers).names).toEqual(['mac']);

        yield* world.control('computers', 'SignOut', { name: 'mac' });
        expect(yield* Context.get(older, Computers).names).toEqual([]);
      }),
    ));

  it('refuses two Fakes of one name, and a start that names none', () => {
    const twin = { ...computers, name: 'computers' as string };
    expect(() => FakeWorld.make([computers, twin])).toThrow(
      'two Fakes are named computers',
    );
    expect(() =>
      FakeWorld.make([computers], {
        start: { printer: {} } as never,
      }),
    ).toThrow('start names printer, which is not one of its Fakes');
  });
});
