import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
} from '@tanstack/react-router';
import { buttonVariants } from 'kui-toolkit/components/ui/button';
import { PwaProvider, pwaHead } from 'pwa-toolkit/react';
import { OfflineIndicator, UpdatePrompt } from 'pwa-toolkit/ui';
import type { ReactNode } from 'react';
import { AppHeader, ScenarioNav, THEME_SCRIPT } from '../components/index.ts';
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
  notFoundComponent: NotFound,
});

function RootComponent() {
  const router = useRouter();
  return (
    <PwaProvider router={router}>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <AppHeader />
      <div className="mx-auto grid w-full max-w-6xl pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12 lg:px-6">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] overflow-y-auto py-10 lg:block">
          <ScenarioNav morph testIdPrefix="nav" />
        </aside>
        <div id="content" className="min-w-0">
          <Outlet />
        </div>
      </div>
      <OfflineIndicator />
      <UpdatePrompt />
    </PwaProvider>
  );
}

function NotFound() {
  return (
    <main data-page className="flex max-w-[60ch] flex-col gap-4 py-16">
      <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
        404
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        No scenario lives here
      </h1>
      <p className="text-muted-foreground">
        This address isn&apos;t one of the playground&apos;s pages. The overview
        lists every scenario.
      </p>
      <div>
        <Link
          to="/"
          className={buttonVariants({ className: 'min-h-11 sm:min-h-9' })}
        >
          Go to the overview
        </Link>
      </div>
    </main>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // The theme script sets the class before hydration, so React may see a different one.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
