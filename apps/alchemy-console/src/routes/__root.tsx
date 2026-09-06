import {
  HeadContent,
  Scripts,
  Outlet,
  createRootRoute,
  Link,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { AuthBoundary } from '../client/features/auth-boundary/index.ts';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Alchemy Console' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  component: () => (
    <AuthBoundary HomeLink={HomeLink}>
      <Outlet />
    </AuthBoundary>
  ),
});

function HomeLink(props: { className?: string; children: ReactNode }) {
  return <Link to="/" {...props} />;
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          storageKey="alchemy-console-theme"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
