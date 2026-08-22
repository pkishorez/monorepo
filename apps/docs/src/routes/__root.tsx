import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import * as React from 'react';
import appCss from '@/styles/app.css?url';
import { appName } from '@/lib/shared';
import { RootProvider } from 'fumadocs-ui/provider/tanstack';
import { useTheme } from 'fumadocs-ui/provider/base';

export const Route = createRootRoute({
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

function ThemeColor() {
  const { resolvedTheme } = useTheme();
  React.useEffect(() => {
    const meta =
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]') ??
      document.head.appendChild(
        Object.assign(document.createElement('meta'), { name: 'theme-color' }),
      );
    meta.content = getComputedStyle(document.body).backgroundColor;
  }, [resolvedTheme]);
  return null;
}

function RootComponent() {
  return (
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-svh flex-col">
        <RootProvider
          search={{
            options: {
              type: 'static',
              api: '/api/search',
            },
          }}
        >
          <ThemeColor />
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
