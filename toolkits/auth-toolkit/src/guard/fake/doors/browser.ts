import { Effect } from 'effect';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { browser as realBrowser } from '../../client/browser/index.js';
import { fakeAccounts } from '../fake.js';
import { fakeAccountsTable } from '../source.js';
import { FAKE_DOMAIN, isFakeEmail } from '../token.js';

export { browserAccountsTable } from '../../client/browser/index.js';

/*
 * `client/browser` as the `kestack-fake-auth` condition resolves it, which
 * only a development server sets: the same `browser`, signing in fake
 * Accounts with no Auth Worker. Its `url` and `cache` are not used.
 */

const SUGGESTED = `dev@${FAKE_DOMAIN}`;

// Asks in the page who signs in: an email at `kestack.test`, or nobody.
const ask = Effect.sync(() => {
  const email = window.prompt(
    `Sign in with fake auth as (any email at @${FAKE_DOMAIN})`,
    SUGGESTED,
  );
  if (email === null || email.trim() === '') return null;
  if (isFakeEmail(email)) return { email };
  window.alert(`Fake auth signs in only emails at @${FAKE_DOMAIN}.`);
  return null;
});

/** `browser`, faked: fake Accounts kept in IndexedDB across reloads. */
export const browser: typeof realBrowser = () =>
  fakeAccounts({
    choose: ask,
    storage: IDB.make(fakeAccountsTable, {
      database: IDB.database({ databaseName: 'kestack:fake-accounts' }),
      mode: 'disposable',
    }).layer,
  });
