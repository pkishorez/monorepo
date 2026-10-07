import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ClientOnly,
  HeadContent,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { createTheme } from '../../ui/theme';
import { getTheme } from '../../ui/theme/tanstack-start.ts';
import { lazy, useState, type ReactNode } from 'react';

import appCss from '../styles.css?url';

const cookieDomain =
  typeof location === 'undefined'
    ? undefined
    : location.hostname.endsWith('.kishore.app')
      ? 'kishore.app'
      : location.hostname.endsWith('.kishore.computer')
        ? 'kishore.computer'
        : undefined;
const appTheme = createTheme({ cookieDomain });

const getContext = createServerFn().handler(({ context }) => ({
  branding: context.branding,
  authorizationServer: context.authorizationServer,
  theme: getTheme(),
  multiSession: context.multiSession,
  testSignIn: context.testSignIn === true,
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
  import('../../ui/screens/auth-screens').then((block) => ({
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
  const currentTheme = Route.useLoaderData()?.theme ?? 'dark';
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
      <body>
        <QueryClientProvider client={queries}>{children}</QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
