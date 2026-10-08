import { Api } from '@kstackz/platform-toolkit';
import { LedgerApi } from './api/index.ts';
import { syncMode } from './constants.ts';

/**
 * Ledger's APIs, by name: the Ledger API, over a WebSocket at `/live` to
 * the User's own Durable Object in the realtime Sync Mode, or over HTTP at
 * `/rpc` to the shared D1 database in the polling one. On the device
 * Backend it is called in the app itself either way.
 */
export const apis = {
  ledger:
    syncMode === 'realtime'
      ? Api.websocket(LedgerApi, { path: '/live' })
      : Api.http(LedgerApi, { path: '/rpc' }),
};

export type Apis = typeof apis;
