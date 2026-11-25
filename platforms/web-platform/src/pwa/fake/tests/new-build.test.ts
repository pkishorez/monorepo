import { Context, Effect, Layer, type Scope } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { OnOutdated } from '@kestack/std-toolkit/replica';
import { describe, expect, it, vi } from 'vitest';
import { MOVING, newBuild, newBuildOver, RELOAD_AFTER } from '../index.ts';

/*
 * The New build fake as an app sees it, through `OnOutdated`: asked to
 * move, it waits for a newer build, then says so and reloads, once per
 * page load. Moved, no newer build is out, so the page it reloads into
 * never moves again.
 */

type Fake = Runtime<typeof newBuild.actor>;

const run = <A, E>(
  body: (
    fake: Fake,
    toNewest: Effect.Effect<void>,
    seen: { readonly said: Array<string>; reloads: number },
  ) => Effect.Effect<A, E, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const seen = { said: [] as Array<string>, reloads: 0 };
        const fake = yield* Runtime.scoped(newBuild.actor);
        const built = yield* Layer.build(
          newBuildOver(fake, {
            reload: () => void seen.reloads++,
            say: (text) => void seen.said.push(text),
          }),
        );
        return yield* body(fake, Context.get(built, OnOutdated), seen);
      }),
    ),
  );

const eventually = (assertion: () => void) =>
  Effect.promise(() =>
    vi.waitFor(assertion, { timeout: RELOAD_AFTER * 3, interval: 20 }),
  );

describe('the New build fake', () => {
  it('waits for a newer build, then moves to it and reloads', () =>
    run((fake, toNewest, seen) =>
      Effect.gen(function* () {
        yield* toNewest;
        yield* eventually(() => expect(fake.root.model.waiting).toBe(true));
        expect(seen.said).toEqual([]);
        fake.root.send({ _tag: 'PutOutNewerBuild' });
        yield* eventually(() => expect(seen.reloads).toBe(1));
        expect(seen.said).toEqual([MOVING]);
        expect(fake.root.model).toMatchObject({
          newer: false,
          waiting: false,
          asked: 1,
          moved: 1,
        });
      }),
    ));

  it('moves once per page load, however often it is asked', () =>
    run((fake, toNewest, seen) =>
      Effect.gen(function* () {
        fake.root.send({ _tag: 'PutOutNewerBuild' });
        yield* toNewest;
        yield* toNewest;
        yield* eventually(() => expect(seen.reloads).toBe(1));
        fake.root.send({ _tag: 'PutOutNewerBuild' });
        yield* toNewest;
        yield* Effect.sleep(RELOAD_AFTER + 100);
        expect(seen.reloads).toBe(1);
        expect(fake.root.model.asked).toBe(1);
      }),
    ));

  it('keeps no ask waiting across a reload', () =>
    run((fake, toNewest) =>
      Effect.gen(function* () {
        yield* toNewest;
        yield* eventually(() => expect(fake.root.model.waiting).toBe(true));
        const kept = newBuild.kept(fake.snapshot);
        expect(kept.root.model).toMatchObject({ waiting: false, asked: 1 });
      }),
    ));
});
