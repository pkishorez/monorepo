import { Effect } from 'effect';
import type { Running } from '@kestack/kabuki/core/runtime';
import { describe, expect, it } from 'vitest';
import {
  find,
  harness,
  run,
  sendTo,
  settle,
  shownData,
  twoAccounts,
} from './harness.ts';

/*
 * Test Sign-In on the Login Screen: it lands where a finished Google
 * sign-in would, and a refusal is said on the page.
 */

const SIGNED =
  'client_id=notes&redirect_uri=https%3A%2F%2Fnotes.example%2Fcb&scope=openid+notes%3Aread&state=xyz&ba_iat=1&ba_param=ba_iat&ba_param=client_id&ba_param=redirect_uri&ba_param=scope&ba_param=state&sig=abc';

const signedOut = () => ({ ...twoAccounts(), accounts: [], active: null });

const model = (app: Running<unknown>) =>
  find(app, 'Login')!.model as {
    testing: boolean;
    testFailure: string | null;
  };

describe('Test Sign-In', () => {
  it('is in the page’s data only when the Auth Worker has it on', () =>
    run(
      Effect.gen(function* () {
        const off = yield* harness(signedOut()).open('/login');
        const keyed = yield* harness(signedOut(), { testKey: 'k' }).open(
          '/login',
        );
        const open = yield* harness(signedOut(), { testKey: null }).open(
          '/login',
        );
        yield* settle;
        expect(shownData(off, 'Login')?.testUsers).toBeNull();
        expect(shownData(keyed, 'Login')?.testUsers).toEqual({ key: true });
        expect(shownData(open, 'Login')?.testUsers).toEqual({ key: false });
      }),
    ));

  it('goes back where return_to says, as Google would', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(signedOut(), { testKey: null });
        tab.at({
          pathname: '/login',
          search: '?return_to=/device',
          origin: 'http://auth.acme.localhost',
        });
        const app = yield* tab.open('/login?return_to=/device');
        yield* settle;
        sendTo(app, 'Login', { _tag: 'TestChosen', email: 'ada@acme.test' });
        yield* settle;
        expect(tab.left).toEqual(['http://auth.acme.localhost/device']);
        expect(tab.server.active).toBe('ada');
      }),
    ));

  it('continues the authorization the page carries', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(signedOut(), { testKey: null });
        tab.at({
          pathname: '/login',
          search: `?${SIGNED}`,
          origin: 'http://auth.acme.localhost',
        });
        const app = yield* tab.open(`/login?${SIGNED}`);
        yield* settle;
        sendTo(app, 'Login', { _tag: 'TestChosen', email: 'ada@acme.test' });
        yield* settle;
        expect(tab.left).toEqual(['https://auth.acme.localhost/consent']);
      }),
    ));

  it('says why it was refused, and stays', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(signedOut(), { testKey: 'sesame' });
        const app = yield* tab.open('/login');
        yield* settle;
        sendTo(app, 'Login', {
          _tag: 'TestChosen',
          email: 'ada@acme.test',
          key: 'wrong',
        });
        yield* settle;
        expect(tab.left).toEqual([]);
        expect(model(app)).toMatchObject({
          testing: false,
          testFailure: 'That test key is not right.',
        });
      }),
    ));
});
