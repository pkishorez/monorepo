import { Context, Effect, Layer, type Scope, Stream } from 'effect';
import { FakeWorld } from '@kestack/kabuki/fake';
import { OnOutdated } from '@kestack/std-toolkit/replica';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newBuild, type NewBuildState } from '../index.ts';
import { MOVING, RELOAD_AFTER } from '../layer.ts';

/*
 * The New build fake as an app sees it, through `OnOutdated`: asked to
 * move, it waits for a newer build, then says so and reloads, once per
 * page load. Moved, no newer build is out, so the page it reloads into
 * never moves again.
 */

const worldOf = () => FakeWorld.make([newBuild]);
type World = ReturnType<typeof worldOf>;

/** The page: what its notices said, and how often it reloaded. */
const page = () => {
  const seen = { said: [] as Array<string>, reloads: 0 };
  vi.stubGlobal('window', { location: { reload: () => void seen.reloads++ } });
  vi.stubGlobal('document', {
    createElement: () => ({ setAttribute: () => {}, dataset: {}, style: {} }),
    body: {
      append: ({ textContent }: Node) => void seen.said.push(textContent!),
    },
  });
  return seen;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const run = <A, E>(
  body: (
    world: World,
    toNewest: Effect.Effect<void>,
    seen: ReturnType<typeof page>,
  ) => Effect.Effect<A, E, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const seen = page();
        const world = worldOf();
        const built = yield* Layer.build(world.layer);
        return yield* body(world, Context.get(built, OnOutdated), seen);
      }),
    ),
  );

/** Whether the fake has a newer build out. */
const newer = (world: World) =>
  Stream.runHead(world.fakes).pipe(
    Effect.map((found) =>
      found._tag === 'Some'
        ? (found.value[0]!.value as NewBuildState).newer
        : null,
    ),
  );

const eventually = (assertion: () => void) =>
  Effect.promise(() =>
    vi.waitFor(assertion, { timeout: RELOAD_AFTER * 3, interval: 20 }),
  );

describe('the New build fake', () => {
  it('waits for a newer build, then moves to it and reloads', () =>
    run((world, toNewest, seen) =>
      Effect.gen(function* () {
        yield* toNewest;
        yield* Effect.sleep(50);
        expect(seen).toEqual({ said: [], reloads: 0 });
        yield* world.control('newBuild', 'PutOutNewerBuild', {});
        yield* eventually(() => expect(seen.reloads).toBe(1));
        expect(seen.said).toEqual([MOVING]);
        expect(yield* newer(world)).toBe(false);
      }),
    ));

  it('moves once per page load, however often it is asked', () =>
    run((world, toNewest, seen) =>
      Effect.gen(function* () {
        yield* world.control('newBuild', 'PutOutNewerBuild', {});
        yield* toNewest;
        yield* toNewest;
        yield* eventually(() => expect(seen.reloads).toBe(1));
        yield* world.control('newBuild', 'PutOutNewerBuild', {});
        yield* toNewest;
        yield* Effect.sleep(RELOAD_AFTER + 100);
        expect(seen.reloads).toBe(1);
        expect(yield* newer(world)).toBe(true);
      }),
    ));
});
