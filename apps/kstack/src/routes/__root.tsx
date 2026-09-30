import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { createIsomorphicFn, createServerFn } from '@tanstack/react-start';
import { getTheme } from '@kstackz/ui-toolkit/components/blocks/theme/tanstack-start';
import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import type { ReactNode } from 'react';
import { appTheme } from '../common/theme.ts';
import appCss from '../styles.css?url';

const getCurrentTheme = createServerFn({ method: 'GET' }).handler(() =>
  getTheme(),
);

// The server reads the theme cookie; the browser already shows the theme.
const currentTheme = createIsomorphicFn()
  .server(() => getCurrentTheme())
  .client(async () =>
    document.documentElement.dataset['theme'] === 'light'
      ? ('light' as const)
      : ('dark' as const),
  );

export const Route = createRootRoute({
  loader: () => currentTheme(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'kstack' },
      // Not `apple-mobile-web-app-capable`: that legacy mode keeps the iOS
      // status bar from following the page.
      { name: 'mobile-web-app-capable', content: 'yes' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
    ],
  }),
  shellComponent: RootDocument,
  component: Outlet,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Nothing lives here
      </h1>
      <Link to="/" className={buttonVariants({ className: 'min-h-11' })}>
        All examples
      </Link>
    </main>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  const theme = Route.useLoaderData() ?? 'dark';
  return (
    <html
      lang="en"
      className={theme === 'dark' ? 'dark' : undefined}
      data-theme={theme}
      style={{ colorScheme: theme }}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
        <appTheme.Script initialTheme={theme} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
