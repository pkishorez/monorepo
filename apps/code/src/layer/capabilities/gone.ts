import { Effect } from 'effect';
import { AccountReplicas } from './account-replicas.ts';
import { DeviceState } from './device-state.ts';
import { Kept } from './kept.ts';
import { SavedDrafts } from './saved-drafts.ts';

/*
 * What goes from this device at once, told as one thing to every store
 * that keeps something per Account, Machine or Project: each deletes
 * what of its own went, and leaves what it never kept.
 *
 * Saved Drafts go only as the user asks: a Project removed, a Machine
 * forgotten, or the Draft itself sent or emptied, which is its own save.
 * A list that no longer names a Machine or an Account, Cloud Connect's
 * first, or the Accounts this device still has signed in, may have come
 * short, and what was typed cannot be asked for again: they prune
 * records, kept copies and Unseen marks, which can, and never a Saved
 * Draft. An Account signed out leaves its Saved Drafts until it signs in
 * again, as no other Account reads them.
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

/**
 * Whether a row went, by whose it is: its Account's, null for one kept
 * before rows named theirs, which only its Machine or Project going takes,
 * and its Machine's and Project's, null when it is of none.
 */
export const went =
  (gone: Gone) =>
  (row: {
    readonly accountId: string | null;
    readonly machineId: string | null;
    readonly projectId: string | null;
  }): boolean => {
    switch (gone._tag) {
      case 'Project':
        return (
          row.machineId === gone.machineId && row.projectId === gone.projectId
        );
      case 'Machine':
        return (
          (row.accountId === null || row.accountId === gone.accountId) &&
          row.machineId === gone.machineId
        );
      case 'Unlisted':
        return (
          row.accountId === gone.accountId &&
          row.machineId !== null &&
          !gone.listed.includes(row.machineId)
        );
      case 'SignedOut':
        return row.accountId !== null && !gone.signedIn.includes(row.accountId);
    }
  };

/** What went as the user asked: a Project removed, a Machine forgotten. */
export type Asked = Extract<Gone, { readonly _tag: 'Project' | 'Machine' }>;

/** Whether the user asked for it, not a list that no longer names it. */
export const asked = (gone: Gone): gone is Asked =>
  gone._tag === 'Project' || gone._tag === 'Machine';

/**
 * Tells every store what went: records, kept copies and Unseen marks; and
 * Saved Drafts only as the user asked.
 */
export const dropEverywhere = (gone: Gone) =>
  Effect.gen(function* () {
    yield* (yield* AccountReplicas).drop(gone);
    yield* (yield* DeviceState).drop(gone);
    yield* (yield* Kept).drop(gone);
    if (asked(gone)) yield* (yield* SavedDrafts).drop(gone);
  });
