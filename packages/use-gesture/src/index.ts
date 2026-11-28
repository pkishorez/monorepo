// The platform-free core: no DOM, no React, no Motion. A touch source on any
// platform feeds a Gesture Provider plain finger samples; the web's own
// source and React bindings are in @kestack/web-platform's input.
export { createGestureProvider } from './core/provider/index.ts';
export { directionOf, SLOP, wants } from './core/direction/index.ts';
// oxlint-disable-next-line monoverse/no-star -- an exception: Swipe is one of use-gesture's public namespaces
export * as Swipe from './core/swipe/index.ts';
// oxlint-disable-next-line monoverse/no-star -- an exception: TreeWalk is one of use-gesture's public namespaces
export * as TreeWalk from './core/tree-walk/index.ts';
export { thumbLock } from './core/thumb-lock/index.ts';

export type {
  GestureEnd,
  GestureListener,
  GestureProvider,
  Pointer,
  PointerSample,
  Pointers,
  PointerSink,
  ZoneTree,
} from './core/provider/index.ts';
export type { Direction, Directions } from './core/direction/index.ts';
export type { Finger, ThumbLockOptions } from './core/thumb-lock/index.ts';
