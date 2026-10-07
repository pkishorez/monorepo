import { createElement } from 'react';
import { createApp } from '@kstackz/expo-platform';
import { apis } from '@ledger/core/apis';
import { device } from '@ledger/core/backend/device';
import { ledgerCache, useDeviceSettings } from '@ledger/core/cache';
import { ledgerSession } from '@ledger/core/session';
import { LedgerMark } from './mark';

// The cloud Backend for each kind of build: the Mac's local servers while
// developing, Ledger's own addresses in a release. `resource` is the
// audience Ledger's `/rpc` checks on an Access Token, one per stage, so it
// stays the same whichever local Ledger address the app is pointed at.
const STAGES = {
  local: {
    apiUrl: 'https://kstack.kishore.computer',
    authUrl: 'https://auth.kishore.computer',
    resource: 'https://kstack.kishore.computer/rpc',
  },
  prod: {
    apiUrl: 'https://kstack.kishore.app',
    authUrl: 'https://auth.kishore.app',
    resource: 'https://kstack.kishore.app/rpc',
  },
};

/**
 * Where this build's cloud Backend is. `EXPO_PUBLIC_LEDGER_URL`,
 * `EXPO_PUBLIC_AUTH_URL` and `EXPO_PUBLIC_LEDGER_RESOURCE` override the
 * stage's addresses.
 */
const stage = () => {
  const chosen = __DEV__ ? STAGES.local : STAGES.prod;
  // Read one by one: Expo inlines only `process.env.EXPO_PUBLIC_<NAME>`.
  return {
    apiUrl: process.env.EXPO_PUBLIC_LEDGER_URL ?? chosen.apiUrl,
    authUrl: process.env.EXPO_PUBLIC_AUTH_URL ?? chosen.authUrl,
    resource: process.env.EXPO_PUBLIC_LEDGER_RESOURCE ?? chosen.resource,
  };
};

const { apiUrl, authUrl, resource } = stage();

/** Ledger on the phone: the one every screen uses. Everything it runs on is
 * core's, handed to the Expo Platform; Users sign in to the cloud as
 * Ledger's First-Party Client (Ledger ADR 0009). */
export const app = createApp({
  name: 'ledger',
  title: 'Ledger',
  description:
    'Write down what you spend and earn, and see where it goes. A thumb on a phone.',
  mark: createElement(LedgerMark),
  apiUrl,
  apis,
  device,
  cache: ledgerCache,
  auth: {
    url: authUrl,
    clientId: 'ledger',
    resource,
    session: ledgerSession,
    // Who to try the device Backend as, in one tap: the web's presets.
    presets: [
      { email: 'ada@example.com', name: 'Ada Lovelace' },
      { email: 'grace@example.com', name: 'Grace Hopper' },
    ],
  },
});

export const { Root, SignedIn, useAccounts, useGate } = app;

/** This phone's Settings, live, and changing some of them. */
export const useSettings = () => useDeviceSettings(app.cache());
