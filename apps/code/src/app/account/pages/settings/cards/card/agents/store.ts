import { Context, type Effect } from 'effect';

/*
 * What a card tells the list of a Connection's Harness Accounts, as the list
 * Provides it to its cards.
 */
export class AccountList extends Context.Service<
  AccountList,
  {
    /** The card is done: saved, removed, or closed unsaved; the account being added is dropped. */
    readonly closed: (key: string) => Effect.Effect<void>;
  }
>()('code/AccountList') {}
