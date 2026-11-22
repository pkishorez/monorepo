import type { Runtime, Snapshot } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';
import { SIGN_IN_CONTROLS, SignInFake } from './actor.js';
import { browserOver } from './serve.js';

/*
 * The Sign-in fake: the Auth Worker and the identity provider behind it,
 * as one browser sees them, as a Fake the Fake World runs. Its Actor
 * starts blank, nobody signed in; its Controls answer a sign-in (as
 * someone, or nobody), make the next one fail, act from another tab (sign
 * out, switch, add an Account), and take the Auth Worker out of reach and
 * back; `serve` gives the browser's Accounts, the real client over it.
 *
 * `serve` takes no options: an app that keeps its Accounts last signed in
 * (`cache`), or names where a sign-in comes back to (`returnTo`), serves it
 * with `browserOver(runtime, options)` instead.
 *
 * `kept` is the Snapshot a reload keeps: no sign-in still asking, as the
 * page that asked is gone.
 */

const kept = (
  snapshot: Snapshot<typeof SignInFake>,
): Snapshot<typeof SignInFake> => ({
  ...snapshot,
  root: {
    ...snapshot.root,
    model: { ...snapshot.root.model, asking: null },
  },
});

export const signIn = {
  name: 'Sign-in',
  actor: SignInFake,
  controls: SIGN_IN_CONTROLS,
  serve: (runtime: Runtime<typeof SignInFake>) => browserOver(runtime),
  kept,
};

export {
  blank,
  SIGN_IN_CONTROLS,
  SIGNED_IN_AS,
  SignInFake,
  type Reach,
  type SignInAnswer,
  type SignInMessage,
  type SignInModel,
} from './actor.js';
export {
  fakeAccounts,
  fakeGuard,
  fakeSigning,
  type FakeChoice,
} from './fake.js';
export { FAKE_MARK } from './mark.js';
export { fakeSignIn } from './principal.js';
export {
  browserOver,
  FAKE_AUTH_WORKER,
  type FakeBrowserOptions,
} from './serve.js';
export { FAKE_DOMAIN } from './token.js';
