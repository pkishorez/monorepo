import { Suspense } from 'react';
import type { ComponentType } from 'react';
import { hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Layer } from 'effect';
import type { SavedHistory } from '../../core/history/index.ts';
import { View } from '../../react/index.ts';
import { Loading } from '../../routing/index.ts';
import { Start } from '../app/index.ts';
import type { AppRuntime } from '../../react/view/index.ts';
import { browser } from '../../routing/router/adapter/browser/index.ts';
import {
  NOT_HERE,
  PageContext,
  RuntimeContext,
  appOf,
  readPage,
} from '../app/protocol/index.ts';
import type { StartApp } from '../app/protocol/index.ts';
import { loading } from './rpc.ts';

/*
 * Start in the browser, from the page a server drew:
 *
 * 1. Read     the Page the server wrote as JSON: its Metadata, its files and
 *             the History the app was drawn from.
 * 2. Preload  the lazy Views the server drew, which it marked in the head, so
 *             hydrating never waits on their code.
 * 3. Hydrate  the Document around the App drawn from that History, with the
 *             address in the browser's history, the Loaders served by the
 *             Loader RPC behind the Data cache, and the app's own Layer.
 *             Once it is mounted the Runtime starts, and the places drawn
 *             loading, the client ones, load their data.
 * 4. Redraw   with new code, after a hot reload: the new App carries on from
 *             the History the old one leaves, replayed with the new code.
 *
 * In the App Shell the server drew no app: the Document is hydrated, and
 * the app is drawn in the boundary the server left, at the browser's URL,
 * every place loading.
 */

/** The page once hydrated: its React root, and how to draw it again with new code. */
export interface Hydrated {
  readonly root: Root;
  /** Draw the page again with new code, as after a hot reload: the app carries on from its History. */
  readonly redraw: (app: StartApp) => void;
}

type DrawnApp = ComponentType<{ readonly saved?: SavedHistory }>;
/** The App's own hook for the running app, which the Document reads through `Start.useRuntime()`. */
type Runs = { readonly useRuntime: () => AppRuntime };
/** `View.app`, for an app whose Actor Start only knows as any: its Layer was checked by `Start.app`. */
type Untyped = (view: unknown, options: object) => unknown;

/** Hydrates the page a server drew. */
export const client = async (exported: StartApp): Promise<Hydrated> => {
  // 1. Read
  const drawn = readPage(document);
  // 2. Preload
  await View.preload(
    Array.from(document.querySelectorAll('link[data-kabuki-view]'), (link) =>
      link.getAttribute('data-kabuki-view')!,
    ),
  );
  const { saved } = drawn.page;
  const page = (next: StartApp) => {
    const {
      app,
      document: Document = Start.Document,
      layer,
      name,
      attach,
    } = appOf(next);
    const App = (View.app as Untyped)(app.view, {
      layer: Layer.mergeAll(
        browser(),
        Loading.cached(app.routes, loading(app.routes)),
        layer ?? (Layer.empty as unknown as Layer.Layer<any>),
      ) as never,
      ...(name && { name }),
      ...(attach && { attach }),
    }) as unknown as DrawnApp;
    return (
      <PageContext value={drawn}>
        <RuntimeContext value={(App as unknown as Runs).useRuntime}>
          <Document>
            {saved ? (
              <App saved={saved} />
            ) : (
              <Suspense fallback={null}>
                <App />
              </Suspense>
            )}
          </Document>
        </RuntimeContext>
      </PageContext>
    );
  };
  // 3. Hydrate
  const root = hydrateRoot(document, page(exported), {
    // The App Shell's boundary, which the server left for the browser on purpose.
    onRecoverableError: (error) => {
      if ((error as { digest?: string } | null)?.digest === NOT_HERE) return;
      reportError(error);
    },
  });
  // 4. Redraw
  return { root, redraw: (next) => root.render(page(next)) };
};
