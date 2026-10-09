import { createElement } from 'react';
import { createApp } from '@kstackz/web-platform';
import { apis } from './apis.ts';
import { device } from './backend/device/index.ts';
import { ledgerCache, useDeviceSettings } from './cache/settings/index.ts';
import { ledgerSession } from './session/index.ts';
import { LedgerMark } from './mark.tsx';
import { AUTH_URL } from './stage.ts';

// The theme cookie is shared by every app under the same domain.
const cookieDomain =
  typeof location === 'undefined'
    ? undefined
    : location.hostname.endsWith('.kishore.app')
      ? 'kishore.app'
      : location.hostname.endsWith('.kishore.computer')
        ? 'kishore.computer'
        : undefined;

/** Ledger in the browser: the one every screen uses. Everything it runs on
 * is core's, handed to the Web Platform. */
export const app = createApp({
  name: 'ledger',
  title: 'Ledger',
  description:
    'Write down what you spend and earn, and see where it goes. Keys on a desktop, a thumb on a phone.',
  mark: createElement(LedgerMark),
  apis,
  device,
  cache: ledgerCache,
  auth: {
    url: AUTH_URL,
    session: ledgerSession,
    // Who to try the device Backend as, in one tap.
    presets: [
      { email: 'ada@example.com', name: 'Ada Lovelace' },
      { email: 'grace@example.com', name: 'Grace Hopper' },
    ],
  },
  theme: { cookieDomain },
  pwa: { installTitle: 'Install Ledger' },
});

export const { SignedIn, useAccounts, useGate, theme: appTheme } = app;

/** This device's Settings, live, and changing some of them. */
export const useSettings = () => useDeviceSettings(app.cache());
