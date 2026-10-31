import type { Layer } from 'effect';
import type { AnyActor, Needs } from '../../core/index.ts';
import type { Attachment, ViewOf } from '../../react/index.ts';
import { Router } from '../../routing/index.ts';
import type {
  Navigation,
  PageBuild,
  PageDefinition,
} from '../../routing/index.ts';
import { APP } from './protocol/index.ts';
import type { DocumentType, StartApp } from './protocol/index.ts';

/*
 * What `src/app` hands Start, on both sides: `Start.app({ router, view,
 * document, layer })`, the app's router and the View of its root page, its
 * Document, and what its Actors Require in the browser, checked against
 * them. Start reads nothing else there, so the check cannot be skipped.
 */

/** What the root page's build still needs from above, besides what the Router Provides. */
type NeedsOf<A> = Exclude<Needs<A>, Navigation>;

/** The app's Layer, which must cover every Capability the tree still needs. */
type LayerOption<A> = [NeedsOf<A>] extends [never]
  ? { readonly layer?: Layer.Layer<never, never, never> }
  : { readonly layer: Layer.Layer<NeedsOf<A>, never, never> };

/** What `Start.app` takes. */
export type AppOptions<G extends PageDefinition, A extends PageBuild<G>> = {
  /** Every Route of the app: `Router.define(() => App, { … })`. */
  readonly router: { readonly root: G };
  /** The View of the router's root page's build. */
  readonly view: ViewOf<A>;
  /** The HTML around the app; the plainest one if none. */
  readonly document?: DocumentType;
  /**
   * What the app is called in the browser, as a devtool lists it: its
   * History and its Window are kept under this name. `Router`, the root
   * Actor's name, if none, the same for every Start app.
   */
  readonly name?: string;
  /**
   * What runs beside the app in the browser, such as a devtool: each is
   * called with the running app once its Runtime starts, and what it returns
   * when the app goes, as after a hot reload. Never on the server.
   */
  readonly attach?: ReadonlyArray<Attachment>;
} & LayerOption<A>;

/**
 * The app, its Document, and what its Actors Require in the browser:
 * `export default Start.app({ router, view, document, layer })`, where
 * `view` draws the build of the router's root page. Leaving out a
 * Capability the app Requires is a type error.
 */
export const app = <G extends PageDefinition, A extends PageBuild<G>>(
  options: AppOptions<G, A>,
): StartApp => {
  const { router, view, document, name, attach } = options;
  const { layer } = options as {
    readonly layer?: Layer.Layer<any, never, never>;
  };
  return {
    [APP]: true,
    app: Router.app(router as never, view as unknown as ViewOf<AnyActor>),
    ...(document && { document }),
    ...(name && { name }),
    ...(layer && { layer }),
    ...(attach && { attach }),
  } as unknown as StartApp;
};
