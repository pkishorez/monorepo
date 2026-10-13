import type { ReactNode } from 'react';
import type { AnyActor, Many, Types } from '../../core/index.ts';
import type { ViewOf } from '../../react/index.ts';
import type { LevelOf, PropsOf } from './route.ts';

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

/** What serves one child Route: an Actor with its View, or a function that draws it from its Props. */
export type PageOf<N> =
  | { readonly actor: AnyActor; readonly view: ViewOf<any> }
  | ((props: PropsOf<N>) => ReactNode);

type Pages<C, Optional extends string> = {
  readonly [K in Exclude<keyof C & string, Optional>]: PageOf<C[K]>;
} & {
  readonly [K in Optional & keyof C]?: PageOf<C[K]>;
};

/** Each Actor named must take as Props what its Route hands it. */
type Checked<Ps, C> = {
  readonly [K in keyof Ps]: K extends keyof C
    ? Ps[K] extends { readonly actor: infer A }
      ? [PropsOf<C[K]>] extends [Types<A>['props']]
        ? Ps[K]
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
  readonly element: ReactNode;
}

/**
 * What a node's outlet writes: one keyed Child slot per child Route its
 * Actor serves, an Invocation that fills the current one from the Props,
 * and a View that draws whichever page is current. Use `children` and
 * `invoke` in the level that draws the pages.
 */
export interface Outlet<Ps, P, V> {
  readonly children: {
    readonly [K in ActorKeys<Ps>]: Ps[K] extends {
      readonly actor: infer A extends AnyActor;
    }
      ? Many<A>
      : never;
  };
  readonly invoke: (data: { readonly props: P }) => {
    readonly [K in ActorKeys<Ps>]: ReadonlyArray<{
      readonly key: string;
      readonly props: any;
    }>;
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
