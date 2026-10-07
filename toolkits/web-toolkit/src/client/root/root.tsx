import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useLoaderData,
} from '@tanstack/react-router';
import { Fragment, type ComponentType, type ReactNode } from 'react';
import { buttonVariants } from '#components/ui/button';
import { DEVICE_SCRIPT } from '../../input/index.ts';
import type { createTheme } from '../../theme/index.ts';

type Theme = 'light' | 'dark';

/** A tag in the document's head, as TanStack Router takes it. */
export type HeadTag = Readonly<Record<string, string>>;

/** The head tags something adds to every page. */
export interface RootHead {
  readonly meta?: ReadonlyArray<HeadTag>;
  readonly links?: ReadonlyArray<HeadTag>;
}

/**
 * Something the root document takes in without knowing it: its head tags,
 * and a provider around every page. The PWA plugs in this way, so an app
 * that leaves it out ships none of it.
 */
export interface RootPlugin {
  readonly head?: () => RootHead;
  readonly Provider?: ComponentType<{ readonly children: ReactNode }>;
}

export interface WebRootOptions {
  /** The title of every page. */
  readonly title: string;
  /** The app's stylesheet, as `import css from './styles.css?url'` gives it. */
  readonly stylesheet: string;
  /** The app's Theme, from `createTheme`. */
  readonly theme: ReturnType<typeof createTheme>;
  /** Default: `/favicon.svg`. */
  readonly icon?: string;
  readonly plugins?: ReadonlyArray<RootPlugin>;
  /**
   * The Theme the server renders the page in, as a server function of the
   * app's reading the cookie (`getTheme`). Without it the page renders
   * dark, and the Theme's script sets the right one before the first paint.
   */
  readonly loadTheme?: () => Promise<Theme>;
  /** What a page that does not exist shows; a plain 404 unless given. */
  readonly notFound?: () => ReactNode;
}

const VIEWPORT =
  'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content';

// The browser already shows the Theme its script set.
const shownTheme = (): Theme =>
  document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark';

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Nothing lives here
      </h1>
      <Link to="/" className={buttonVariants({ className: 'min-h-11' })}>
        Home
      </Link>
    </main>
  );
}

/**
 * The root route of a web app on TanStack Start: the document, in the
 * Theme its cookie names before the first paint, the device marked before
 * it too, the head every page shares, and the plugins' providers around
 * every page. Pass it to `createRootRoute`.
 */
export const webRoot = (options: WebRootOptions) => {
  const plugins = options.plugins ?? [];
  const { theme } = options;

  function RootDocument(props: { readonly children: ReactNode }) {
    const initial =
      (useLoaderData({ strict: false }) as Theme | undefined) ?? 'dark';
    return (
      <html
        lang="en"
        className={initial === 'dark' ? 'dark' : undefined}
        data-theme={initial}
        style={{ colorScheme: initial }}
        suppressHydrationWarning
      >
        <head>
          <HeadContent />
          <theme.Script initialTheme={initial} />
          {/* Before the first paint: what this device is driven by. */}
          <script dangerouslySetInnerHTML={{ __html: DEVICE_SCRIPT }} />
        </head>
        <body>
          {props.children}
          <Scripts />
        </body>
      </html>
    );
  }

  function Root() {
    return plugins.reduceRight<ReactNode>(
      (children, { Provider }) =>
        Provider === undefined ? children : <Provider>{children}</Provider>,
      <Fragment>
        <Outlet />
      </Fragment>,
    );
  }

  return {
    loader: async (): Promise<Theme> =>
      typeof document !== 'undefined'
        ? shownTheme()
        : ((await options.loadTheme?.()) ?? 'dark'),
    head: () => {
      const added = plugins.map((plugin) => plugin.head?.() ?? {});
      return {
        meta: [
          { charSet: 'utf-8' },
          { name: 'viewport', content: VIEWPORT },
          { title: options.title },
          ...added.flatMap((head) => head.meta ?? []),
        ],
        links: [
          { rel: 'stylesheet', href: options.stylesheet },
          {
            rel: 'icon',
            type: 'image/svg+xml',
            href: options.icon ?? '/favicon.svg',
          },
          ...added.flatMap((head) => head.links ?? []),
        ],
      };
    },
    shellComponent: RootDocument,
    component: Root,
    notFoundComponent: options.notFound ?? NotFound,
  };
};
