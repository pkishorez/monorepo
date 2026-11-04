import { Effect, Layer } from 'effect';
import {
  browser,
  browserAccountsTable,
  rememberedAccounts,
} from '@kestack/auth-toolkit/client/browser';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { device } from '../../database/index.ts';

/*
 * Who uses the app, in this device's own database, `code:device`
 * (`database/`), beside the Preferences: auth-toolkit's `Accounts`,
 * through the Auth Worker at `VITE_AUTH_URL`, its Accounts last seen kept
 * in the `accounts` table, without tokens. `start.tsx` Provides it.
 *
 * 1. Accounts  a sign-in comes back to the app's root, unless it names
 *              its own place: the root then goes to the home of the
 *              Account active, so one added from the Account Switcher is
 *              never drawn at the page of the Account before it.
 * 2. Kept      the Accounts signed in here, as auth-toolkit last kept
 *              them, for an Account's page to stand by while the Auth
 *              Worker is asked.
 */

/** The `accounts` table of this device's database. */
const table = Layer.unwrap(
  Effect.sync(
    () =>
      IDB.make(browserAccountsTable, {
        database: IDB.database({ databaseName: device }),
        storeName: 'accounts',
        mode: 'disposable',
      }).layer,
  ),
);

// 1. Accounts: made once the Layer is built, in the browser, never as the
// module loads.
export const accounts = Layer.unwrap(
  Effect.sync(() =>
    browser({
      url: import.meta.env.VITE_AUTH_URL,
      cache: table,
      returnTo: new URL('/', window.location.href).href,
    }),
  ),
);

// 2. Kept
/**
 * The Accounts signed in here as auth-toolkit last kept them, each by id
 * and email; none when nothing is kept, or it cannot be read.
 */
export const keptAccounts: Effect.Effect<
  ReadonlyArray<{ readonly id: string; readonly email: string }>
> = rememberedAccounts.pipe(
  Effect.map((kept) => kept.map(({ id, email }) => ({ id, email }))),
  Effect.provide(table),
  Effect.catchCause(() => Effect.succeed([])),
);
