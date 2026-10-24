import { Context } from 'effect';
import type { Effect } from 'effect';

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
     * Keeps the records of these Machines for the Account and deletes the
     * rest of its records, a Machine gone and an old Replica alike: best
     * effort.
     */
    readonly keepMachines: (
      accountId: string,
      machineIds: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
    /**
     * Keeps the records of these Accounts, every one signed in here, and
     * deletes every other's, the records from before they were kept per
     * Account too: best effort.
     */
    readonly keepAccounts: (
      accountIds: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
    /** Deletes the records of these Accounts, signed out of this device: best effort. */
    readonly dropAccounts: (
      accountIds: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
  }
>()('code/AccountReplicas') {}
