import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from '@tanstack/react-router';
import { PwaProvider, pwaHead } from 'pwa-toolkit/react';
import { OfflineIndicator, UpdatePrompt } from 'pwa-toolkit/ui';
import type { ReactNode } from 'react';
import { AppHeader } from '../components/index.ts';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  head: () => {
    const pwa = pwaHead();
    return {
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        { title: 'PWA Playground' },
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
});

function RootComponent() {
  const router = useRouter();
  return (
    <PwaProvider router={router}>
      <AppHeader />
      <Outlet />
      <OfflineIndicator />
      <UpdatePrompt />
    </PwaProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
