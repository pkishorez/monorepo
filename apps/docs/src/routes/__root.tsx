import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getTheme } from 'kui-toolkit/components/blocks/theme/tanstack-start';
import appCss from '@/styles/app.css?url';
import { appName } from '@/lib/shared';
import { appTheme } from '@/lib/layout.shared';
import { RootProvider } from 'fumadocs-ui/provider/tanstack';

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
        title: appName,
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
        <RootProvider
          theme={{ enabled: false }}
          search={{
            options: {
              type: 'static',
              api: '/api/search',
            },
          }}
        >
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
