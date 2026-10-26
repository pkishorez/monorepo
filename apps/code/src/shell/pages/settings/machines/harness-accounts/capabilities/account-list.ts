import { Context, type Effect } from 'effect';
import type { HarnessAccountInfo } from '@kestack/connect/code';

/*
 * What a card tells the list of a Machine's Harness Accounts, as the list
 * Provides it to its cards.
 */
export class AccountList extends Context.Service<
  AccountList,
  {
    /** The Machine saved the card's account. */
    readonly saved: (
      key: string,
      account: HarnessAccountInfo,
    ) => Effect.Effect<void>;
    /** The Machine removed an added account. */
    readonly removed: (id: string) => Effect.Effect<void>;
    /** The card was closed unsaved; the account being added is dropped. */
    readonly closed: (key: string) => Effect.Effect<void>;
  }
>()('code/AccountList') {}
