import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getTheme } from '@kstackz/web-platform/client/server';
import appCss from '@/styles/app.css?url';
import { appTheme } from '@/lib/theme';

const getCurrentTheme = createServerFn({ method: 'GET' }).handler(() =>
  getTheme(),
);

export const Route = createRootRoute({
  loader: () => getCurrentTheme(),
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'monorepo',
      },
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
  component: RootComponent,
});

function RootComponent() {
  const currentTheme = Route.useLoaderData() ?? 'dark';
  return (
    <html
      lang="en"
      className={currentTheme === 'dark' ? 'dark' : undefined}
      data-theme={currentTheme}
      style={{ colorScheme: currentTheme }}
      suppressHydrationWarning
    >
      <head>
        <appTheme.Script initialTheme={currentTheme} />
        <HeadContent />
      </head>
      <body className="flex min-h-svh flex-col">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
