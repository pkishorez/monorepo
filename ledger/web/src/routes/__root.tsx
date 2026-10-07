import { createRootRoute } from '@tanstack/react-router';
import { webRoot } from '@kstackz/web-platform/client';
import { pwaRoot } from '@kstackz/web-platform/pwa';
import { appTheme } from '../app.ts';
import appCss from '../styles.css?url';

// Ledger is a PWA: it works offline, installs, and asks before it updates.
export const Route = createRootRoute(
  webRoot({
    title: 'Ledger',
    stylesheet: appCss,
    theme: appTheme,
    plugins: [pwaRoot({ installTitle: 'Install Ledger' })],
  }),
);
