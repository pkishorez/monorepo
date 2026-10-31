import { Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { Layer } from 'effect';
import { History } from '../../core/history/index.ts';
import type { SavedHistory } from '../../core/history/index.ts';
import type { AnyActor } from '../../core/actor/index.ts';
import { toReact } from '../../react/index.ts';
import type { LazyView } from '../../react/index.ts';
import type { Known } from '../../routing/page/index.ts';
import { tagsOf } from '../../routing/route/index.ts';
import {
  NOT_HERE,
  NotHere,
  PageContext,
  serialize,
} from '../app/protocol/index.ts';
import type {
  Assets,
  Build,
  DocumentType,
  Drawn,
  Page,
  ServedApp,
} from '../app/protocol/index.ts';

/*
 * Drawing one URL, purely: the Router's init at its Route with what the
 * Loaders gave each place, saved as a History of one Restore; the Document drawn
 * around the App drawn from it, every lazy View resolved; then the files of
 * the lazy Views it drew added to the head, each marked with its id so the
 * browser preloads it before it hydrates.
 *
 * The App Shell is the Document alone: where the app goes, a boundary the
 * server leaves for the browser, which draws the app there at its own URL.
 */

type DrawnApp = ComponentType<{
  readonly saved?: SavedHistory;
  readonly onLazyView?: (view: LazyView<AnyActor>) => void;
}>;

/** What one drawing starts from: the Route and what its server-drawn places start from, by dotted name. */
export interface At {
  readonly route: unknown;
  readonly known?: Readonly<Record<string, Known>>;
}

/** The data among what places start from, by dotted name: what the Metadata is worked out from. */
const dataOf = (known: Readonly<Record<string, Known>> = {}) =>
  Object.fromEntries(
    Object.entries(known).flatMap(([name, each]) =>
      each._tag === 'Ready' ? [[name, each.data]] : [],
    ),
  );

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

/** The script that puts the page's scroll back before the app hydrates, where the Router restores it. */
const scrollOf = (app: ServedApp, route: unknown) => {
  const scroll = app.restoreScroll?.(route);
  return scroll ? { scroll } : {};
};

/** Draws the app's pages, and its App Shell. */
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

  /** The Document around `inside`, drawn whole, and the ids of the lazy Views it drew. */
  const html = async (
    drawn: Drawn,
    inside: ReactNode,
    views: ReadonlySet<string>,
  ): Promise<string> => {
    const failures: Array<unknown> = [];
    const stream = await renderToReadableStream(
      <PageContext value={drawn}>
        <Document>{inside}</Document>
      </PageContext>,
      {
        onError: (error) => {
          if (error instanceof NotHere) return NOT_HERE;
          failures.push(error);
          return undefined;
        },
      },
    );
    await stream.allReady;
    const text = await new Response(stream).text();
    if (failures.length > 0) throw failures[0];
    const head = text.indexOf('</head>');
    const whole =
      head < 0
        ? text
        : `${text.slice(0, head)}${lazyTags(build, views)}${text.slice(head)}`;
    return whole.startsWith('<!DOCTYPE') ? whole : `<!DOCTYPE html>${whole}`;
  };

  return {
    /** The app at a Route as a whole HTML page; throws if anything in it fails to draw. */
    page: async (at: At): Promise<string> => {
      const history = History.make(app.actor, { input: at });
      const saved = History.restored(
        app.actor,
        history.snapshotAt(null),
        0,
      ).save();
      const metadata = app.routes.metadata(at.route, dataOf(at.known));
      const page: Page = {
        entry: build.entry,
        head: build.head,
        saved,
        drawn: { at: Date.now(), build: build.id },
        ...scrollOf(app, at.route),
      };
      const views = new Set<string>();
      return html(
        {
          ...serialize(page),
          metadata: { title: metadata.title, tags: tagsOf(metadata) },
        },
        <App
          saved={saved}
          onLazyView={(view) => {
            if (view.id !== undefined) views.add(view.id);
          }}
        />,
        views,
      );
    },
    /** The App Shell: the Document, with the app left for the browser to draw. */
    shell: (): Promise<string> => {
      const page: Page = {
        entry: build.entry,
        head: build.head,
        drawn: { at: Date.now(), build: build.id },
      };
      return html(
        serialize(page),
        <Suspense fallback={null}>
          <NotHere.Draw />
        </Suspense>,
        new Set(),
      );
    },
  };
};
