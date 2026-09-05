import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { RpcProvider } from './internal/rpc-provider';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '__APP_TITLE__' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <RpcProvider>{children}</RpcProvider>
        <Scripts />
      </body>
    </html>
  );
}
