import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';

import appCss from '../styles.css?url';
import { paintTheme } from '@/components/theme';
import { InlineScript } from '@/lib/inline-script';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { title: 'Kishore' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),

  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div className="max-w-2xl mx-auto min-h-dvh flex items-center p-6">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">404</h1>
        <p className="text-muted-foreground">This page doesn't exist.</p>
        <Link
          to="/"
          className="inline-block underline underline-offset-4 decoration-muted-foreground/40 hover:decoration-foreground transition-colors"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          id="counterscale-script"
          data-site-id="kishore-app"
          src="https://counterscale.kishorez.workers.dev/tracker.js"
          defer
        />
      </head>
      <body className="bg-background text-foreground" suppressHydrationWarning>
        <InlineScript script={paintTheme} />
        <script
          dangerouslySetInnerHTML={{
            __html: `(${paintTheme})()`,
          }}
        />
        {children}
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
