import { Effect } from 'effect';
import { device as realDevice } from '../../client/device/index.js';
import { fakeAccounts } from '../fake.js';
import { FAKE_DOMAIN } from '../token.js';

export { deviceAccountsTable } from '../../client/device/index.js';

/*
 * `client/device` as the `kestack-fake-auth` condition resolves it, which
 * only a development run sets: the same `device`, signed in at once as one
 * fake User with no Auth Worker, the one a browser suggests first.
 */

/** `device`, faked: signing in is `dev@kestack.test`, every run anew. */
export const device: typeof realDevice = () =>
  fakeAccounts({ choose: Effect.succeed({ email: `dev@${FAKE_DOMAIN}` }) });
