// oxlint-disable-next-line no-restricted-imports -- a Place tells the Router the data it shows after it draws: the Metadata is written from it, outside React.
import { createContext, use, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { AnyActor } from '../../core/index.ts';
import { View } from '../../react/index.ts';
import type { LazyView, ViewOf, ViewProps } from '../../react/index.ts';
import { nodesOn } from '../route/index.ts';
import type { AnyNode, Children, Value } from '../route/index.ts';
import type { AnyPage } from './page.ts';
import type { Status } from './status.ts';

/*
 * A page's View: `Route.view(Task, (self) => …)`, drawn from the page's own
 * data as any View is, and handed the page's Place, which is what the page
 * above holds. `Route.view(Task, View.lazy(() => import('./task-view')))`
 * loads its code when first drawn, or when a move to it, or a preload,
 * starts.
 */

/** The code of a lazy View, loaded before it is first drawn. */
type Preload = () => Promise<void>;

/** The lazy View of each page, by its node: written by `Route.view`, read by the Router. */
const lazyViews = new WeakMap<AnyNode, Preload>();

/**
 * Start loading the code of the lazy View of every page on `route`, so it
 * loads beside the page's data rather than after it. Code that fails to
 * load is loaded again when it is drawn.
 */
export const preloadViews = (children: Children, route: Value) => {
  for (const [, node] of nodesOn(children, route))
    lazyViews
      .get(node)?.()
      .catch(() => {});
};

/** Where each Place on screen says what data it shows: the Router writes the Metadata from it. */
export interface Shown {
  readonly show: (name: string, data: unknown) => void;
  readonly hide: (name: string) => void;
}

export const ShownContext = createContext<Shown | undefined>(undefined);

function Showing({
  name,
  status,
}: {
  readonly name: string;
  readonly status: Status<unknown> | undefined;
}) {
  const shown = use(ShownContext);
  const data = status?._tag === 'Ready' ? status.data : undefined;
  useEffect(() => {
    if (!shown || data === undefined) return;
    shown.show(name, data);
    return () => shown.hide(name);
  }, [shown, name, data]);
  return null;
}

type PlaceOf<G> = G extends { readonly place: infer PA } ? PA : never;
type ActorOf<G> = G extends { readonly actor: infer A } ? A : never;

/**
 * A page's View, for the Place around it: drawn from the page's own data
 * with `draw`, or by a lazy View of the page's Actor, whose code then loads
 * on a move to the page or a preload of it.
 */
export function view<G extends AnyPage>(
  page: G,
  draw: (self: ViewProps<ActorOf<G>>) => ReactNode,
): ViewOf<PlaceOf<G>>;
export function view<G extends AnyPage>(
  page: G,
  lazy: LazyView<ActorOf<G>>,
): ViewOf<PlaceOf<G>>;
export function view(
  page: AnyPage,
  draw: ((self: never) => ReactNode) | LazyView<never>,
): unknown {
  const lazy = 'preload' in draw ? (draw as LazyView<AnyActor>) : undefined;
  const Inner = (lazy ??
    View.make(
      page.actor,
      draw as (self: ViewProps<AnyActor>) => ReactNode,
    )) as ViewOf<AnyActor>;
  if (lazy) lazyViews.set(page, lazy.preload);
  return View.make(page.place, (self) => {
    const { props, children } = self as unknown as {
      readonly props: { readonly name: string };
      readonly children: { readonly page: { readonly id: string } };
    };
    const status = (self.model as { readonly status: Status<unknown> }).status;
    return (
      <>
        {page.input && <Showing name={props.name} status={status} />}
        {/* Keyed by its Place, so a page made again, new params, starts its React state afresh. */}
        <Inner
          key={self.id}
          instance={children.page}
          ref={self.root.ref}
          style={self.root.style}
        />
      </>
    );
  });
}
