import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { brandLogo, brandName, ThemeToggle } from '../../ui/shell/index.js';
import appCss from '../styles.css?url';

const getBranding = createServerFn().handler(({ context }) => context.branding);

export const Route = createRootRoute({
  loader: () => getBranding(),
  head: ({ loaderData }) => {
    const logo = loaderData ? brandLogo(loaderData) : undefined;
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'dark light' },
        { title: loaderData ? brandName(loaderData) : 'Sign in' },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        ...(logo ? [{ rel: 'icon', href: logo.url }] : []),
      ],
    };
  },
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
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
          <ThemeToggle />
          {children}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
