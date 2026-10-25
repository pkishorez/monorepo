import { Effect, Layer } from 'effect';
import {
  browser,
  browserAccountsTable,
} from '@kestack/auth-toolkit/client/browser';
import { IDB } from '@kestack/std-toolkit/db/idb';

/*
 * Who uses the app: auth-toolkit's `Accounts`, through the Auth Worker at
 * `VITE_AUTH_URL`, its Accounts last seen kept here without tokens.
 */

const table = <T extends Parameters<typeof IDB.make>[0]>(of: T) =>
  Layer.unwrap(
    Effect.sync(
      () =>
        IDB.make(of, {
          database: IDB.database({ databaseName: 'code:accounts' }),
          mode: 'disposable',
        }).layer,
    ),
  );

// Made once the Layer is built, in the browser: never as the module loads.
export const accounts = Layer.unwrap(
  Effect.sync(() =>
    browser({
      url: import.meta.env.VITE_AUTH_URL,
      cache: table(browserAccountsTable),
    }),
  ),
);
