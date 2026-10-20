import {
  HeadContent,
  Scripts,
  Outlet,
  createRootRoute,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getTheme } from '@kestack/web-platform/client/server';
import type { ReactNode } from 'react';
import {
  appTheme,
  AuthBoundary,
} from '../client/features/auth-boundary/index.ts';
import appCss from '../styles.css?url';

const getCurrentTheme = createServerFn({ method: 'GET' }).handler(
  () => getTheme() ?? null,
);

export const Route = createRootRoute({
  loader: () => getCurrentTheme(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'Alchemy Console' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '96x96',
        href: '/favicon-96x96.png',
      },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  shellComponent: RootDocument,
  component: () => (
    <AuthBoundary>
      <Outlet />
    </AuthBoundary>
  ),
});

function RootDocument({ children }: { children: ReactNode }) {
  // The saved Theme, when there is one; the Theme's script sets it, or the
  // system's, before the first paint either way.
  const saved = Route.useLoaderData() ?? undefined;
  return (
    <html lang="en" data-theme={saved} suppressHydrationWarning>
      <head>
        <appTheme.Script />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
