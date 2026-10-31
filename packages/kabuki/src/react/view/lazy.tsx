import { createContext, lazy as reactLazy, use } from 'react';
import type { AnyActor } from '../../core/actor/index.ts';
import type { ViewOf } from './view.tsx';

/*
 * A lazy View: a View whose code is loaded the first time it is drawn,
 * through `React.lazy`, so a heavy page is not in the first bundle. Only the
 * View is lazy: its Actor is not, since Replay and Restore need every
 * Actor's Schemas and Update.
 *
 * 1. Load     once, on `preload()` or on the first draw, whichever is first.
 * 2. Draw     the View itself once it is loaded, so a lazy View preloaded
 *             before hydrating never suspends; until then, through
 *             `React.lazy`, which a server waits for before it sends.
 * 3. Collect  every lazy View a drawing draws is told to the App's
 *             `onLazyView`, so a server can preload its code in the page.
 * 4. Find     a lazy View by its Actor, so whatever moves the app to it can
 *             preload its code first; and by its `id`, if made with one, so
 *             a browser can preload those the server drew before it
 *             hydrates.
 */

/** A View whose code is loaded when it is first drawn, or preloaded. */
export type LazyView<A> = ViewOf<A> & {
  /** What the View is known by across server and browser, if it was given one: its module, for Start. */
  readonly id: string | undefined;
  /** Load its code now; resolves once it is loaded, at once if it already is. */
  readonly preload: () => Promise<void>;
  /** Whether its code is loaded, so drawing it does not suspend. */
  readonly loaded: boolean;
};

export interface LazyOptions {
  /** What the View is known by across server and browser: Start's Vite plugin gives its module's id. */
  readonly id?: string;
}

/** Told of each lazy View a drawing draws; given by the App's `onLazyView`. */
export const LazyContext = createContext<
  ((view: LazyView<AnyActor>) => void) | undefined
>(undefined);

// 4. Find
const byActor = new WeakMap<object, LazyView<AnyActor>>();

/** The lazy View made for `actor`, if one was: to load its code before it is drawn. */
export const lazyOf = (actor: AnyActor): LazyView<AnyActor> | undefined =>
  byActor.get(actor.definition);

const KEY = Symbol.for('@kestack/kabuki/lazy-views');
const byId = (): Map<string, LazyView<AnyActor>> => {
  const global = globalThis as { [KEY]?: Map<string, LazyView<AnyActor>> };
  return (global[KEY] ??= new Map());
};

/**
 * A View of `actor` loaded when first drawn: `load` imports a module whose
 * default export is the View, made with `View.make`. The Actor is named here
 * so the View can be found by it, and preloaded, before its code is there.
 */
export const lazy = <A extends AnyActor>(
  actor: A,
  load: () => Promise<{ readonly default: ViewOf<A> }>,
  options: LazyOptions = {},
): LazyView<A> => {
  // 1. Load
  let view: ViewOf<A> | undefined;
  let loading: Promise<void> | undefined;
  const preload = () =>
    (loading ??= load().then(
      (module) => {
        view = module.default;
      },
      (error: unknown) => {
        loading = undefined;
        throw error;
      },
    ));
  const Loading = reactLazy(() => preload().then(() => ({ default: view! })));

  // 2. Draw
  const Lazy = ((props: Parameters<ViewOf<A>>[0]) => {
    // 3. Collect
    use(LazyContext)?.(self as unknown as LazyView<AnyActor>);
    const Loaded = view;
    return Loaded ? <Loaded {...props} /> : <Loading {...props} />;
  }) as ViewOf<A>;
  const self = Object.defineProperties(Lazy, {
    actor: { value: actor, enumerable: true },
    id: { value: options.id, enumerable: true },
    preload: { value: preload, enumerable: true },
    loaded: { get: () => view !== undefined, enumerable: true },
    displayName: { get: () => `Lazy(${actor.name}View)` },
  }) as LazyView<A>;
  if (options.id !== undefined)
    byId().set(options.id, self as unknown as LazyView<AnyActor>);
  byActor.set(actor.definition, self as unknown as LazyView<AnyActor>);
  return self;
};

/** Preload every lazy View made with one of these ids; an id no lazy View was made with is skipped. */
export const preload = async (ids: Iterable<string>): Promise<void> => {
  const views = byId();
  await Promise.all(
    [...ids].flatMap((id) => {
      const view = views.get(id);
      return view ? [view.preload()] : [];
    }),
  );
};
