import { Api } from '@kstackz/platform-toolkit';
import { LedgerApi } from './api/index.ts';

/**
 * Ledger's APIs, by name: the Ledger API over HTTP at `/rpc`. On the cloud
 * Backend the Platform reaches it at the app's cloud address; on the device
 * Backend, in the app itself.
 */
export const apis = {
  ledger: Api.http(LedgerApi, { path: '/rpc' }),
};

export type Apis = typeof apis;
