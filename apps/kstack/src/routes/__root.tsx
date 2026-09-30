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
import { PwaProvider, pwaHead, UpdatePrompt } from '@kstackz/pwa-toolkit/react';
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
  head: () => {
    const pwa = pwaHead();
    return {
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        { title: 'kstack' },
        ...pwa.meta,
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        ...pwa.links,
      ],
    };
  },
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: NotFound,
});

// The service worker finds each new deploy; the prompt asks before reloading.
function RootComponent() {
  return (
    <PwaProvider>
      <Outlet />
      <UpdatePrompt />
    </PwaProvider>
  );
}

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Nothing lives here
      </h1>
      <Link to="/" className={buttonVariants({ className: 'min-h-11' })}>
        All showcases
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
