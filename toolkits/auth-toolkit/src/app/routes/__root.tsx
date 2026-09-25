import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ClientOnly,
  HeadContent,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ThemeProvider } from 'next-themes';
import { lazy, useState, type ReactNode } from 'react';

import appCss from '../styles.css?url';

const getContext = createServerFn().handler(({ context }) => ({
  branding: context.branding,
  authorizationServer: context.authorizationServer,
  multiSession: context.multiSession,
}));

type Context = Awaited<ReturnType<typeof getContext>>;

const titleOf = ({ branding: { appName } }: Context) =>
  typeof appName === 'string' ? appName : appName.name;

const iconOf = ({ branding: { logoUrl } }: Context) =>
  typeof logoUrl === 'string' ? logoUrl : logoUrl?.url;

export const Route = createRootRoute({
  loader: () => getContext(),
  head: ({ loaderData }) => {
    const icon = loaderData ? iconOf(loaderData) : undefined;
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'dark light' },
        { title: loaderData ? titleOf(loaderData) : 'Sign in' },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        ...(icon
          ? [
              { rel: 'icon', href: icon },
              { rel: 'preload', as: 'image', href: icon },
            ]
          : []),
      ],
    };
  },
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

// Pages render in the browser only; the server bundle cannot load the UI block.
const NotFoundScreen = lazy(() =>
  import('kui-toolkit/components/blocks/auth').then((block) => ({
    default: block.NotFoundScreen,
  })),
);

function NotFound() {
  const { branding } = Route.useLoaderData();
  return (
    <ClientOnly>
      <NotFoundScreen branding={branding} />
    </ClientOnly>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  const [queries] = useState(() => new QueryClient());
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <QueryClientProvider client={queries}>{children}</QueryClientProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
