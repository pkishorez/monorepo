import { Context, type Layer } from 'effect';
import type { RpcClient } from 'effect/rpc';
import type { StdSyncPlatform } from '@kstackz/std-toolkit/sync';

/**
 * The Backend Link: what this client keeps for as long as it runs on one
 * Backend. How a session calls the Backend's API, and the platform its Std
 * Sync runs on.
 */
export class BackendLink extends Context.Service<
  BackendLink,
  {
    /** How a session reaches the Ledger API: HTTP, or in-process. */
    readonly api: Layer.Layer<RpcClient.Protocol>;
    readonly syncPlatform: StdSyncPlatform;
  }
>()('ledger/BackendLink') {}
