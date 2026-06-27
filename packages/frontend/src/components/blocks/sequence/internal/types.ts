import type { ReactNode } from 'react';

import type { Canvas } from './canvas';

/**
 * One frame of a sequence: a unique `name`, its default `props`, and the
 * `render` that turns props into JSX. A step's prop contract *is* its `render`
 * first-parameter type — inferred from the `props` default supplied to
 * {@link step}. `render` also receives the live {@link Canvas} (`cw`/`ch` bound
 * to the current `<Screen>`'s measured unit) as its second argument, for values
 * `motion` animates.
 */
export type Step<N extends string = string, P = any> = {
  name: N;
  props: P;
  render: (props: P, canvas: Canvas) => ReactNode;
};

/** The default props carried by a named step in the tuple `S`. */
export type PropsOf<S extends readonly Step[], N> = Extract<
  S[number],
  { name: N }
>['props'];

/**
 * The live controller returned by {@link useSteps}. It is inherently a
 * timeline over the declared steps: `next`/`prev`/`restart` walk the order,
 * `go` jumps to a named step (optionally overriding its props), and `active`
 * is the frame currently on screen — fed straight to `<Screen>`.
 */
export type SequenceController<S extends readonly Step[] = readonly Step[]> = {
  active: S[number];
  index: number;
  total: number;
  next: () => void;
  prev: () => void;
  restart: () => void;
  go: <N extends S[number]['name']>(name: N, props?: PropsOf<S, N>) => void;
};
