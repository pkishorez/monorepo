import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { signInToContinue } from '../approving/page-consent/actor.ts';
import { router } from '../routes.ts';
import {
  harness,
  run,
  sendRouter,
  settle,
  shownData,
  twoAccounts,
} from './harness.ts';

/*
 * The Consent Screen's "Sign in to continue", with no Account here: the
 * Login Screen it moves to keeps the authorization's signed query whole,
 * so the sign-in comes back to the same request.
 */

const SIGNED =
  'client_id=notes&redirect_uri=https%3A%2F%2Fnotes.example%2Fcb&scope=openid+notes%3Aread&state=xyz&ba_iat=1&ba_param=ba_iat&ba_param=client_id&ba_param=redirect_uri&ba_param=scope&ba_param=state&sig=abc';

const signedOut = () => ({ ...twoAccounts(), accounts: [], active: null });

describe('Sign in to continue', () => {
  it('moves to the Login Screen with the signed query whole', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(signedOut());
        const app = yield* tab.open(`/consent?${SIGNED}`);
        yield* settle;
        const request = shownData(app, 'Consent')?.request;
        expect(request?._tag).toBe('Found');
        const href = signInToContinue(request.query);
        const { route } = router.read(href);
        // As the Router writes the address it moves to.
        expect(new URLSearchParams(router.path(route).split('?')[1])).toEqual(
          new URLSearchParams(SIGNED),
        );
        sendRouter(app, { _tag: 'Pushed', route });
        yield* settle;
        expect(shownData(app, 'Login')?.continuing).toBe('Notes');
      }),
    ));
});
