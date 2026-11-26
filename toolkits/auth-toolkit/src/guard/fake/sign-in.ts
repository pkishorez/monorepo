import { Effect, Schema, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import type { CacheStorage } from '../client/browser/index.js';
import { accountsOver } from './layer.js';
import { FAKE_DOMAIN, fakeUser } from './token.js';

/*
 * The Sign-in fake: the Auth Worker and the identity provider behind it,
 * as one browser sees them. Its state is who is signed in on this browser,
 * and the sign-in the app asked, waiting for a person to say who; it
 * starts with nobody. layer.ts runs the real Accounts client over it.
 *
 * - Asking   a sign-in the app starts waits in `asking`, on the page it
 *            was asked on, until a control answers it: `SignInAs` someone,
 *            or `Cancel`. A newer sign-in ends the one waiting, with
 *            nobody.
 * - Here     what this tab asks (switch, sign out) changes the state
 *            itself, as the Auth Worker would.
 *
 * A fake User's id and token come from the email alone (token.ts): the
 * same email is always the same User. Only an email at `kestack.test`
 * signs in; a bare name is taken as one there.
 */

/** Who a blank `SignInAs` signs in. */
const SIGNED_IN_AS = `you@${FAKE_DOMAIN}`;

const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
});
type User = typeof User.Type;

export const SignInState = Schema.Struct({
  /** Every Account signed in on this browser, in sign-in order. */
  accounts: Schema.Array(User),
  /** The Active Account's User id; null with nobody signed in. */
  active: Schema.NullOr(Schema.String),
  /** The sign-in the app asked, waiting to be told who; null when none is. */
  asking: Schema.NullOr(
    Schema.Struct({
      /** Whether it adds an Account beside others. */
      adding: Schema.Boolean,
    }),
  ),
});
export type SignInState = typeof SignInState.Type;

type State = SubscriptionRef.SubscriptionRef<SignInState>;

/** Nobody signed in, nothing asking. */
const initial: SignInState = { accounts: [], active: null, asking: null };

/** The fake User an email and name stand for: a bare name is one at kestack.test, blank is `SIGNED_IN_AS`. Null for an email elsewhere. */
const userOf = (email: string, name: string): User | null => {
  const given = email.trim() || SIGNED_IN_AS;
  return fakeUser({
    email: given.includes('@') ? given : `${given}@${FAKE_DOMAIN}`,
    name,
  });
};

const NOT_ASKING = 'No sign-in is asking who.';

/** Answers the sign-in asking: `email` signed in and active, last in sign-in order; or why not. */
export const signInAs = (
  state: State,
  { email, name }: { readonly email: string; readonly name: string },
) =>
  SubscriptionRef.updateEffect(state, (now) => {
    if (now.asking === null) return Effect.fail(NOT_ASKING);
    const user = userOf(email, name);
    if (user === null)
      return Effect.fail(
        `Only an email at @${FAKE_DOMAIN} signs in here, not ${email.trim()}.`,
      );
    return Effect.succeed({
      accounts: [...now.accounts.filter(({ id }) => id !== user.id), user],
      active: user.id,
      asking: null,
    });
  });

/** Answers the sign-in asking with nobody, as closing the provider's page. */
export const cancel = (state: State) =>
  SubscriptionRef.updateEffect(state, (now) =>
    now.asking === null
      ? Effect.fail(NOT_ASKING)
      : Effect.succeed({ ...now, asking: null }),
  );

export interface SignInOptions {
  /** Remembers the Accounts last signed in, as `browser`'s `cache`. */
  readonly cache?: CacheStorage | undefined;
}

/** The Sign-in fake. Its Layer gives the browser's `Accounts` and the signing of every guarded call. */
export const signIn = ({ cache }: SignInOptions = {}) =>
  Fake.make({
    name: 'signIn',
    state: SignInState,
    initial,
    controls: {
      SignInAs: Fake.control(
        SignInState,
        Schema.Struct({ email: Schema.String, name: Schema.String }).annotate({
          description:
            "Answers the sign-in the app is asking (asking set): signs in this email at kestack.test, blank for you@, and name, blank for the email's first part.",
        }),
        (who, state) => signInAs(state, who),
      ),
      Cancel: Fake.control(
        SignInState,
        Schema.Struct({}).annotate({
          description: 'Answers the sign-in the app is asking with nobody.',
        }),
        (_, state) => cancel(state),
      ),
    },
    layer: (state) => accountsOver(state, { cache }),
  });
