import { Effect } from 'effect';
import { AccountReplicas } from './account-replicas.ts';
import { SavedDrafts } from './saved-drafts.ts';
import { SavedMachines } from './saved-machines.ts';

/*
 * What goes from this device at once, told as one thing to every store
 * that keeps something per Account, Machine or Project: each deletes
 * what of its own went, and leaves what it never kept.
 */

/** A Project removed, a Machine forgotten or no longer listed, an Account signed out. */
export type Gone =
  | {
      readonly _tag: 'Project';
      readonly machineId: string;
      readonly projectId: string;
    }
  | {
      readonly _tag: 'Machine';
      readonly accountId: string;
      readonly machineId: string;
    }
  | {
      readonly _tag: 'Unlisted';
      readonly accountId: string;
      /** The Account's Machines still listed: every other's go. */
      readonly listed: ReadonlyArray<string>;
    }
  | {
      readonly _tag: 'SignedOut';
      /** The Accounts still signed in: every other's go. */
      readonly signedIn: ReadonlyArray<string>;
    };

/** Tells every store what went: records, Machine settings and Saved Drafts. */
export const dropEverywhere = (gone: Gone) =>
  Effect.gen(function* () {
    yield* (yield* AccountReplicas).drop(gone);
    yield* (yield* SavedMachines).drop(gone);
    yield* (yield* SavedDrafts).drop(gone);
  });
