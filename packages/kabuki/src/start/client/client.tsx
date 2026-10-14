import type { ComponentType, ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Layer } from 'effect';
import type { AnyActor, SavedHistory } from '../../core/index.ts';
import { View, toReact } from '../../react/index.ts';
import type { ViewOf } from '../../react/index.ts';
import { browser } from '../../routing/browser/index.ts';
import type { Codec, PlaceSchema } from '../../routing/route/index.ts';
import { client as loaderRpc } from '../loader-rpc/index.ts';
import { PageContext, readPage } from '../page/index.ts';

/*
 * Start in the browser, from the page a server drew:
 *
 * 1. Read     the Page the server wrote as JSON: its Metadata, its files and
 *             the History the app was drawn from.
 * 2. Preload  the lazy Views the server drew, which it marked in the head, so
 *             hydrating never waits on their code.
 * 3. Hydrate  the Document around the App drawn from that History, with the
 *             address in the browser's history and the Loaders served by the
 *             Loader RPC. Once it is mounted the Runtime starts, and places
 *             drawn without their Input, the client ones, load as after a
 *             click.
 * 4. Redraw   with new code, after a hot reload: the new App carries on from
 *             the History the old one leaves, replayed with the new code.
 */

/** What Start needs of the app the Router serves in a browser. */
interface ServedApp {
  readonly actor: AnyActor;
  readonly view: ViewOf<any>;
  readonly routes: {
    readonly every: ReadonlyArray<PlaceSchema>;
    readonly route: Codec<any>;
  };
}

export interface ClientOptions {
  /** The app the Router serves: what `Router.app(Routes, App)` gives. */
  readonly app: ServedApp;
  /** The same Document the server drew. */
  readonly document: ComponentType<{ readonly children: ReactNode }>;
  /** What the app's Actors Require in the browser, besides the address and the Loaders. */
  readonly layer?: Layer.Layer<any, never, never>;
}

/** The page once hydrated: its React root, and how to draw it again with new code. */
export interface Hydrated {
  readonly root: Root;
  /** Draw the page again with new code, as after a hot reload: the app carries on from its History. */
  readonly redraw: (options: ClientOptions) => void;
}

type DrawnApp = ComponentType<{ readonly saved?: SavedHistory }>;

/** Hydrates the page a server drew. */
export const client = async (options: ClientOptions): Promise<Hydrated> => {
  // 1. Read
  const drawn = readPage(document);
  // 2. Preload
  await View.preload(
    Array.from(document.querySelectorAll('link[data-kabuki-view]'), (link) =>
      link.getAttribute('data-kabuki-view')!,
    ),
  );
  const page = ({ app, document: Document, layer }: ClientOptions) => {
    const App = toReact(
      app.actor as never,
      app.view as never,
      Layer.mergeAll(
        browser(),
        loaderRpc(app.routes),
        layer ?? (Layer.empty as unknown as Layer.Layer<any>),
      ) as never,
    ) as unknown as DrawnApp;
    return (
      <PageContext value={drawn}>
        <Document>
          <App saved={drawn.page.saved} />
        </Document>
      </PageContext>
    );
  };
  // 3. Hydrate
  const root = hydrateRoot(document, page(options));
  // 4. Redraw
  return { root, redraw: (next) => root.render(page(next)) };
};
