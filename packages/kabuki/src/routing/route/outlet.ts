import type { ReactNode } from 'react';
import type { AnyActor, Types } from '../../core/index.ts';
import type { ViewOf } from '../../react/index.ts';
import type { Codec, LevelOf, PropsOf } from './node.ts';

/** How the app got to where it is. */
export type How = 'load' | 'push' | 'replace' | 'back' | 'forward';

/**
 * The last move, as one level sees it: what it held before and holds now.
 * `from` is `null` when the level was not shown before, `to` when it is
 * not shown now.
 */
export interface Move<V> {
  readonly from: V | null;
  readonly to: V | null;
  readonly how: How;
}

type InputOf<N> = N extends { readonly input: Codec<infer I> | undefined }
  ? I
  : never;

/** Why a place has no Input: its Loader, or the way to it, broke. */
export interface Failure {
  readonly reason: string;
}

/**
 * What serves one child Route: an Actor with its View, or a function that
 * draws it from its Props and, for a place with one, its Input. An Actor's
 * place can name what its slot shows in its stead while it has no Input:
 * `pending` while its Loader runs, `failed` once it has broken.
 */
export type PageOf<N> =
  | {
      readonly actor: AnyActor;
      readonly view: ViewOf<any>;
      readonly pending?: (props: PropsOf<N>) => ReactNode;
      readonly failed?: (props: PropsOf<N>, failure: Failure) => ReactNode;
    }
  | ((props: PropsOf<N>, input: InputOf<N>) => ReactNode);

type Pages<C, Optional extends string> = {
  readonly [K in Exclude<keyof C & string, Optional>]: PageOf<C[K]>;
} & {
  readonly [K in Optional & keyof C]?: PageOf<C[K]>;
};

/** Whether an Actor starts from what its place hands it as Input: its place's Input, or nothing. */
type TakesInput<A, N> = [InputOf<N>] extends [never]
  ? [undefined] extends [Types<A>['input']]
    ? true
    : [Types<A>['input']] extends [void]
      ? true
      : false
  : [InputOf<N>] extends [Types<A>['input']]
    ? true
    : false;

/** Each Actor named must take as Props what its Route hands it, and start from its place's Input. */
type Checked<Ps, C> = {
  readonly [K in keyof Ps]: K extends keyof C
    ? Ps[K] extends { readonly actor: infer A }
      ? [PropsOf<C[K]>] extends [Types<A>['props']]
        ? TakesInput<A, C[K]> extends true
          ? Ps[K]
          : {
              readonly actor: A;
              readonly 'its Input is not what this place loads': InputOf<C[K]>;
            }
        : {
            readonly actor: A;
            readonly 'its Props are not what this Route hands it': PropsOf<
              C[K]
            >;
          }
      : Ps[K]
    : never;
};

type ActorKeys<Ps> = {
  [K in keyof Ps]: Ps[K] extends { readonly actor: AnyActor } ? K : never;
}[keyof Ps];

/** The page an outlet draws now. */
export interface Drawn {
  /** Changes when a new page, or a new Instance of the same one, comes in: a key for an exit animation. */
  readonly key: string;
  /** Which child Route it serves. */
  readonly tag: string;
  /** The page itself, or its pending or failed screen in its stead: each has a key of its own. */
  readonly showing: 'page' | 'pending' | 'failed';
  readonly element: ReactNode;
}

/**
 * What a node's outlet writes: a Child per child Route its Actor serves,
 * one of `each` key, at most the current one's, handed its Input and Props
 * from the Props, and a View that draws whichever page is current. Spread
 * `children` into the level that draws the pages.
 */
export interface Outlet<Ps, P, V> {
  readonly children: {
    readonly [K in ActorKeys<Ps>]: Ps[K] extends {
      readonly actor: infer A extends AnyActor;
    }
      ? {
          readonly actor: A;
          readonly each: (data: { readonly props: P }) => ReadonlyArray<string>;
          readonly input: (data: { readonly props: P }) => any;
          readonly props: (data: { readonly props: P }) => any;
        }
      : never;
  };
  /**
   * The current page. Hand it a function to wrap the page, with how this
   * level moved: `{(page, move) => <motion.div key={page.key}>…}`.
   */
  readonly View: (props: {
    readonly of: { readonly props: P; readonly children: object };
    readonly children?: (page: Drawn | null, move: Move<V>) => ReactNode;
  }) => ReactNode;
}

/** A node's `outlet`: which Actor, or drawing, serves each of its children. */
export type OutletOf<C, P, Optional extends string = never> = <
  const Ps extends Pages<C, Optional>,
>(
  pages: Ps & Checked<Ps, C>,
) => Outlet<Ps, P, LevelOf<C>>;
