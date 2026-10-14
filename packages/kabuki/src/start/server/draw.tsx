import type { ComponentType } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { Layer } from 'effect';
import { History } from '../../core/index.ts';
import type { AnyActor, SavedHistory } from '../../core/index.ts';
import { toReact } from '../../react/index.ts';
import type { LazyView } from '../../react/index.ts';
import { tagsOf } from '../../routing/route/index.ts';
import type { Inputs } from '../../routing/route/index.ts';
import { PageContext, serialize } from '../page/index.ts';
import type { Assets, Build, Page } from '../page/index.ts';
import type { DocumentType, ServedApp } from './served.ts';

/*
 * Drawing one URL, purely: the Router's init at its Route with the Inputs
 * the Loaders gave, saved as a History of one Restore; the Document drawn
 * around the App drawn from it, every lazy View resolved; then the files of
 * the lazy Views it drew added to the head, each marked with its id so the
 * browser preloads it before it hydrates.
 */

type DrawnApp = ComponentType<{
  readonly saved?: SavedHistory;
  readonly onLazyView?: (view: LazyView<AnyActor>) => void;
}>;

/** What one drawing starts from: the Route and the Inputs of its server-drawn places. */
export interface At {
  readonly route: unknown;
  readonly inputs?: Inputs;
}

const attribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The files of a lazy View, by its id: in dev, its module itself. */
const filesOf = (build: Build, id: string): Assets | undefined =>
  build.views === null
    ? { script: `${build.base}${id}`, styles: [], preloads: [] }
    : build.views[id];

/** The tags that load the lazy Views a drawing drew, less what the entry loads already. */
const lazyTags = (build: Build, ids: Iterable<string>): string => {
  const seen = new Set([
    build.entry.script,
    ...build.entry.styles,
    ...build.entry.preloads,
  ]);
  const once = (href: string) => !seen.has(href) && seen.add(href);
  let tags = '';
  for (const id of ids) {
    const files = filesOf(build, id);
    if (!files) continue;
    for (const href of files.styles.filter(once))
      tags += `<link rel="stylesheet" href="${attribute(href)}">`;
    for (const href of files.preloads.filter(once))
      tags += `<link rel="modulepreload" href="${attribute(href)}">`;
    seen.add(files.script);
    tags += `<link rel="modulepreload" href="${attribute(files.script)}" data-kabuki-view="${attribute(id)}">`;
  }
  return tags;
};

/** Draws the app at a Route as a whole HTML page; throws if anything in it fails to draw. */
export const drawer = (
  app: ServedApp,
  Document: DocumentType,
  build: Build,
) => {
  const App = toReact(
    app.actor as never,
    app.view as never,
    Layer.empty as never,
  ) as unknown as DrawnApp;

  return async (at: At): Promise<string> => {
    const history = History.make(app.actor, { input: at });
    const saved = History.restored(
      app.actor,
      history.snapshotAt(null),
      0,
    ).save();
    const metadata = app.routes.metadata(at.route, at.inputs ?? {});
    const page: Page = {
      entry: build.entry,
      head: build.head,
      saved,
      drawn: { at: Date.now(), build: build.id },
    };
    const views = new Set<string>();
    const failures: Array<unknown> = [];
    const stream = await renderToReadableStream(
      <PageContext
        value={{
          ...serialize(page),
          metadata: { title: metadata.title, tags: tagsOf(metadata) },
        }}
      >
        <Document>
          <App
            saved={saved}
            onLazyView={(view) => {
              if (view.id !== undefined) views.add(view.id);
            }}
          />
        </Document>
      </PageContext>,
      { onError: (error) => void failures.push(error) },
    );
    await stream.allReady;
    const html = await new Response(stream).text();
    if (failures.length > 0) throw failures[0];
    const head = html.indexOf('</head>');
    const whole =
      head < 0
        ? html
        : `${html.slice(0, head)}${lazyTags(build, views)}${html.slice(head)}`;
    return whole.startsWith('<!DOCTYPE') ? whole : `<!DOCTYPE html>${whole}`;
  };
};
