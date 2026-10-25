import { Context } from 'effect';
import type { Effect } from 'effect';
import type { Gone } from './gone.ts';

/*
 * Each Account's records on this device: one Replica Store per Account,
 * so what one Account keeps is pruned without touching another's. The
 * app's `Store` is the active Account's. The app Layer gives both, from
 * `services/account-replicas.ts`.
 */

/** The Capability that says which records this device keeps. */
export class AccountReplicas extends Context.Service<
  AccountReplicas,
  {
    /**
     * Deletes the records that went, best effort: a Machine forgotten, its
     * own and no other's; a Machine unlisted, every one of the Account's
     * not listed, and its old Replicas with them; an Account signed out,
     * every one's not signed in, and the records from before they were
     * kept per Account. A Project has none of its own.
     */
    readonly drop: (gone: Gone) => Effect.Effect<void>;
  }
>()('code/AccountReplicas') {}
