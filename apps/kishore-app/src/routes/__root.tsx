import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';

import appCss from '../styles.css?url';
import { paintTheme } from '@/components/theme';
import { InlineScript } from '@/lib/inline-script';
import { DevTools } from '@/components/devtools';

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
});

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
        <DevTools />
      </body>
    </html>
  );
}
