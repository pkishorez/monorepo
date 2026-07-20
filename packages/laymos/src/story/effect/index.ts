import { Effect } from 'effect';

import type { BlockMeta, StoryFnMeta } from '../core/types.js';

type AnyEffect = Effect.Effect<any, any, any>;
type ArmSuccess<A> = A extends Effect.Effect<infer S, any, any> ? S : never;
type ArmError<A> = A extends Effect.Effect<any, infer E, any> ? E : never;
type ArmServices<A> = A extends Effect.Effect<any, any, infer R> ? R : never;

export function storyFn<Args extends readonly unknown[], A extends AnyEffect>(
  name: string,
  meta: StoryFnMeta<Args>,
  fn: (...args: Args) => A,
): (...args: Args) => A {
  void name;
  void meta;
  return fn;
}

export function step<A, E, R>(
  name: string,
  meta: BlockMeta,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  void name;
  void meta;
  return effect;
}

export function decision<
  Arms extends { readonly true: AnyEffect; readonly false: AnyEffect },
>(
  name: string,
  meta: BlockMeta,
  key: boolean,
  arms: Arms,
): Effect.Effect<
  ArmSuccess<Arms['true' | 'false']>,
  ArmError<Arms['true' | 'false']>,
  ArmServices<Arms['true' | 'false']>
>;
export function decision<
  Arms extends Readonly<Record<string, AnyEffect>>,
  K extends keyof Arms & string,
>(
  name: string,
  meta: BlockMeta,
  key: K,
  arms: Arms,
): Effect.Effect<ArmSuccess<Arms[K]>, ArmError<Arms[K]>, ArmServices<Arms[K]>>;
export function decision(
  name: string,
  meta: BlockMeta,
  key: string | boolean,
  arms: Readonly<Record<string, AnyEffect>>,
): AnyEffect {
  void meta;
  const arm = arms[String(key)];
  if (arm === undefined) {
    return Effect.die(
      new Error(`Decision "${name}" has no arm "${String(key)}"`),
    );
  }
  return arm;
}
