import type { ComponentType } from 'react';
import { hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Layer } from 'effect';
import type { SavedHistory } from '../../core/index.ts';
import { View, toReact } from '../../react/index.ts';
import { browser } from '../../routing/adapter/browser/index.ts';
import {
  Document as Plain,
  PageContext,
  appOf,
  readPage,
} from '../common/index.ts';
import type { StartApp } from '../common/index.ts';
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
 *             Loader RPC, and the app's own Layer. Once it is mounted the
 *             Runtime starts, and places drawn without their Input, the
 *             client ones, load as after a click.
 * 4. Redraw   with new code, after a hot reload: the new App carries on from
 *             the History the old one leaves, replayed with the new code.
 */

/** The page once hydrated: its React root, and how to draw it again with new code. */
export interface Hydrated {
  readonly root: Root;
  /** Draw the page again with new code, as after a hot reload: the app carries on from its History. */
  readonly redraw: (app: StartApp) => void;
}

type DrawnApp = ComponentType<{ readonly saved?: SavedHistory }>;

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
  const page = (next: StartApp) => {
    const { app, document: Document = Plain, layer } = appOf(next);
    const App = toReact(
      app.actor as never,
      app.view as never,
      Layer.mergeAll(
        browser(),
        loading(app.routes),
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
  const root = hydrateRoot(document, page(exported));
  // 4. Redraw
  return { root, redraw: (next) => root.render(page(next)) };
};
