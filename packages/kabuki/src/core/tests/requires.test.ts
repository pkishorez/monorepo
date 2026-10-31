import { Context, Effect, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Runtime } from '../index.ts';
import type { Types } from '../actor/index.ts';

/*
 * Four Actors: A is the root, B and C are its Children, D is C's Child. Each
 * one's own code uses one service of its own (SA, SB, SC, SD). What each
 * Actor still needs from above is read from its type.
 */

class SA extends Context.Service<SA, { readonly a: Effect.Effect<void> }>()(
  'SA',
) {}
class SB extends Context.Service<SB, { readonly b: Effect.Effect<void> }>()(
  'SB',
) {}
class SC extends Context.Service<SC, { readonly c: Effect.Effect<void> }>()(
  'SC',
) {}
class SD extends Context.Service<SD, { readonly d: Effect.Effect<void> }>()(
  'SD',
) {}

const sb = Layer.succeed(SB, { b: Effect.void });
const sd = Layer.succeed(SD, { d: Effect.void });

type Needs<A> = Types<A>['open'];
type Same<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
const same = <X, Y>(holds: Same<X, Y>) => expect(holds).toBe(true);

/** An Actor whose one Worker uses `service`. */
const uses = <S extends Context.Key<any, any>>(service: S) => ({
  workers: { work: { run: () => Effect.flatMap(service, () => Effect.never) } },
});

const B = Actor.define('B', { requires: [SB] }).build(uses(SB));
const D = Actor.define('D', { requires: [SD] }).build(uses(SD));

const St = Schema.TaggedUnion({ On: {}, Off: {} });

describe('requires, from A down to D', () => {
  it('1. nobody Provides: every need reaches the root', () => {
    const C = Actor.define('C', { requires: [SC] }).build({
      ...uses(SC),
      children: { d: Actor.child(D) },
    });
    const A = Actor.define('A', { requires: [SA] }).build({
      ...uses(SA),
      children: { b: Actor.child(B), c: Actor.child(C) },
    });
    same<Needs<typeof C>, SC | SD>(true);
    same<Needs<typeof A>, SA | SB | SC | SD>(true);
  });

  it('2. C Provides SD at its top: D is covered, and SD stops at C', () => {
    const C = Actor.define('C', { requires: [SC] }).build({
      ...uses(SC),
      children: { d: Actor.child(D) },
      provides: () => sd,
    });
    const A = Actor.define('A', { requires: [SA] }).build({
      ...uses(SA),
      children: { b: Actor.child(B), c: Actor.child(C) },
    });
    same<Needs<typeof C>, SC>(true);
    same<Needs<typeof A>, SA | SB | SC>(true);
  });

  it('3. A Provides SD at its top: it reaches its grandchild D', () => {
    const C = Actor.define('C', { requires: [SC] }).build({
      ...uses(SC),
      children: { d: Actor.child(D) },
    });
    const A = Actor.define('A', { requires: [SA] }).build({
      ...uses(SA),
      children: { b: Actor.child(B), c: Actor.child(C) },
      provides: () => sd,
    });
    same<Needs<typeof A>, SA | SB | SC>(true);
  });

  it('4. A Provides SB only in On: a B placed in On is covered, a B at the top is not', () => {
    const InOn = Actor.define('A', { state: St }).build({
      init: () => ({ state: { _tag: 'On' } }),
      states: {
        On: { children: { b: Actor.child(B) }, provides: () => sb },
      },
    });
    const AtTop = Actor.define('A', { state: St }).build({
      init: () => ({ state: { _tag: 'On' } }),
      children: { b: Actor.child(B) },
      states: { On: { provides: () => sb } },
    });
    same<Needs<typeof InOn>, never>(true);
    same<Needs<typeof AtTop>, SB>(true);
  });

  it('5. A Provides SB in On but places B in Off: SB bubbles up', () => {
    const A = Actor.define('A', { state: St }).build({
      init: () => ({ state: { _tag: 'On' } }),
      states: {
        On: { provides: () => sb },
        Off: { children: { b: Actor.child(B) } },
      },
    });
    same<Needs<typeof A>, SB>(true);
  });

  it("6. A Provides SD, but A's own Worker cannot use it: Provides points down", () => {
    const Wrong = Actor.define('A', {}).build({
      provides: () => sd,
      workers: {
        // @ts-expect-error SD is not in A's requires
        work: { run: () => Effect.flatMap(SD, () => Effect.never) },
      },
    });
    const Right = Actor.define('A', { requires: [SD] }).build({
      provides: () => sd,
      ...uses(SD),
    });
    same<Needs<typeof Right>, SD>(true);
    expect(Wrong).toBeDefined();
  });

  it('7. a Provide built from another service needs it in requires', () => {
    const fromSA = Layer.effect(
      SD,
      Effect.map(SA, () => ({ d: Effect.void })),
    );
    const Wrong = Actor.define('A', {}).build({
      // @ts-expect-error building SD needs SA, which A does not require
      provides: () => fromSA,
    });
    const Right = Actor.define('A', { requires: [SA] }).build({
      provides: () => fromSA,
      children: { d: Actor.child(D) },
    });
    same<Needs<typeof Right>, SA>(true);
    expect(Wrong).toBeDefined();
  });

  it('8. the root must get the rest from the Layer', () => {
    const C = Actor.define('C', { requires: [SC] }).build({
      ...uses(SC),
      children: { d: Actor.child(D) },
    });
    const A = Actor.define('A', { requires: [SA] }).build({
      ...uses(SA),
      children: { b: Actor.child(B), c: Actor.child(C) },
    });
    // @ts-expect-error SD is still needed by D, and nothing gives it
    const short: Effect.Effect<unknown, never, never> = Runtime.start(A).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(SA, { a: Effect.void }),
          sb,
          Layer.succeed(SC, { c: Effect.void }),
        ),
      ),
      Effect.scoped,
    );
    expect(short).toBeDefined();
  });
});

describe('Schemas', () => {
  it('a definition keeps the Schemas it was defined with, and no others', () => {
    const Model = Schema.Struct({ count: Schema.Number });
    const Counted = Actor.define('Counted', { model: Model }).build({
      init: () => ({ model: { count: 0 } }),
    });
    expect(Counted.definition.schemas).toEqual({ model: Model });
  });
});
