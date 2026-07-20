import type { BlockMeta, StoryFnMeta } from './types.js';

export function storyFn<Args extends readonly unknown[], R>(
  name: string,
  meta: StoryFnMeta<Args>,
  fn: (...args: Args) => R,
): (...args: Args) => R {
  void name;
  void meta;
  return fn;
}

export function step<R>(name: string, meta: BlockMeta, fn: () => R): R {
  void name;
  void meta;
  return fn();
}

type Arm = () => unknown;

export function decision<
  Arms extends { readonly true: Arm; readonly false: Arm },
>(
  name: string,
  meta: BlockMeta,
  key: boolean,
  arms: Arms,
): ReturnType<Arms['true']> | ReturnType<Arms['false']>;
export function decision<
  Arms extends Readonly<Record<string, Arm>>,
  K extends keyof Arms & string,
>(name: string, meta: BlockMeta, key: K, arms: Arms): ReturnType<Arms[K]>;
export function decision(
  name: string,
  meta: BlockMeta,
  key: string | boolean,
  arms: Readonly<Record<string, Arm>>,
): unknown {
  void meta;
  const arm = arms[String(key)];
  if (arm === undefined) {
    throw new Error(`Decision "${name}" has no arm "${String(key)}"`);
  }
  return arm();
}
