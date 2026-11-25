import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';
import { FAKE_DOMAIN, fakeUser } from './token.js';

/*
 * The Sign-in fake: the Auth Worker and the identity provider behind it,
 * as one browser sees them, in a Kabuki Actor that Requires nothing and
 * starts blank, nobody signed in. Its Model is who is signed in on this
 * browser and the sign-in waiting to be told who; serve.ts runs the real
 * Accounts client over it.
 *
 * - Asking   a sign-in the app starts is a `SignInAsked`, waiting in
 *            `asking` until a Control answers it: `SignInAs` someone, or
 *            `CancelSignIn`. Its answer lands in `answers`, for the
 *            sign-in to read. A new sign-in ends the one waiting, with
 *            nobody, as a page leaving for the provider ends the last.
 * - Here     what this tab asks (switch, sign out) is a Message Sent by
 *            serve.ts, not a Control.
 *
 * A fake User's id and token come from the email alone (token.ts): the
 * same email is always the same User. Only an email at `kestack.test`
 * signs in; a bare name is taken as one there.
 */

/** Who a blank `SignInAs` signs in. */
export const SIGNED_IN_AS = `you@${FAKE_DOMAIN}`;

/** How many answers are kept for the sign-ins that asked. */
const ANSWERS_KEPT = 10;

const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
});
type User = typeof User.Type;

/** How a sign-in was answered. */
const Answer = Schema.TaggedUnion({
  /** Signed in as this User, now the Active Account. */
  SignedIn: { userId: Schema.String },
  /** Nobody: cancelled, or ended by a newer sign-in. */
  Nobody: {},
  /** Failed, saying why: an email outside kestack.test. */
  Failed: { reason: Schema.String },
});
export type SignInAnswer = typeof Answer.Type;

const Model = Schema.Struct({
  /** Every Account signed in on this browser, in sign-in order. */
  accounts: Schema.Array(User),
  /** The Active Account's User id; null with nobody signed in. */
  active: Schema.NullOr(Schema.String),
  /** The sign-in waiting to be told who; null when none is. */
  asking: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      /** Whether it adds an Account beside others. */
      adding: Schema.Boolean,
    }),
  ),
  /** The last sign-ins answered, newest last. */
  answers: Schema.Array(Schema.Struct({ id: Schema.String, answer: Answer })),
});
export type SignInModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls.
  /** Answers the sign-in waiting: signs in as this email (at kestack.test; blank for you@kestack.test) and name (blank for the email's first part). */
  SignInAs: { email: Schema.String, name: Schema.String },
  /** Answers the sign-in waiting with nobody, as closing the provider's page. */
  CancelSignIn: {},

  // Sent by serve.ts, for what this tab asks.
  /** A sign-in asks who. */
  SignInAsked: { id: Schema.String, adding: Schema.Boolean },
  /** The sign-in asking was given up before it was answered. */
  SignInWithdrawn: { id: Schema.String },
  /** This tab switches to an Account. */
  SwitchedHere: { userId: Schema.String },
  /** This tab signs an Account out. */
  SignedOutHere: { userId: Schema.String },
  /** This tab signs every Account out. */
  SignedOutAllHere: {},
});
export type SignInMessage = typeof Message.Type;

/** The Sign-in fake's Controls. */
export const SIGN_IN_CONTROLS = [
  'SignInAs',
  'CancelSignIn',
] as const satisfies ReadonlyArray<SignInMessage['_tag']>;

/** Blank: nobody signed in. */
export const blank = (): SignInModel => ({
  accounts: [],
  active: null,
  asking: null,
  answers: [],
});

/** The fake User an email and name stand for: a bare name is one at kestack.test, blank is `SIGNED_IN_AS`. Null for an email elsewhere. */
const userOf = (email: string, name: string): User | null => {
  const given = email.trim() || SIGNED_IN_AS;
  return fakeUser({
    email: given.includes('@') ? given : `${given}@${FAKE_DOMAIN}`,
    name,
  });
};

const refused = (email: string) =>
  `Only an email at @${FAKE_DOMAIN} signs in here, not ${email.trim()}.`;

/** The Model with `user` signed in and active, last in sign-in order. */
const signedIn = (model: SignInModel, user: User) => ({
  accounts: [...model.accounts.filter(({ id }) => id !== user.id), user],
  active: user.id,
});

/** The Model with one Account signed out: the next one active, if the Active Account went. */
const signedOut = (model: SignInModel, userId: string) => {
  const accounts = model.accounts.filter(({ id }) => id !== userId);
  return {
    accounts,
    active: accounts.some(({ id }) => id === model.active)
      ? model.active
      : (accounts[0]?.id ?? null),
  };
};

/** `answers` with one more, the oldest let go past `ANSWERS_KEPT`. */
const withAnswer = (
  answers: SignInModel['answers'],
  id: string,
  answer: SignInAnswer,
) => [...answers, { id, answer }].slice(-ANSWERS_KEPT);

/** The sign-in waiting answered, and nothing waiting. */
const answered = (model: SignInModel, answer: SignInAnswer) =>
  model.asking === null
    ? {}
    : {
        asking: null,
        answers: withAnswer(model.answers, model.asking.id, answer),
      };

export const SignInFake = Actor.define('Sign-in', {
  model: Model,
  message: Message,
}).build({
  init: () => ({ model: blank() }),
  on: {
    SignInAs: ({ email, name }, { model }) => {
      if (model.asking === null) return {};
      const user = userOf(email, name);
      return {
        model:
          user === null
            ? answered(model, { _tag: 'Failed', reason: refused(email) })
            : {
                ...signedIn(model, user),
                ...answered(model, { _tag: 'SignedIn', userId: user.id }),
              },
      };
    },
    CancelSignIn: (_, { model }) => ({
      model: answered(model, { _tag: 'Nobody' }),
    }),

    SignInAsked: ({ id, adding }, { model }) => {
      // A newer sign-in ends the one waiting, with nobody.
      const answers =
        model.asking === null
          ? model.answers
          : withAnswer(model.answers, model.asking.id, { _tag: 'Nobody' });
      return { model: { answers, asking: { id, adding } } };
    },
    SignInWithdrawn: ({ id }, { model }) =>
      model.asking?.id === id ? { model: { asking: null } } : {},
    SwitchedHere: ({ userId }, { model }) =>
      model.accounts.some(({ id }) => id === userId)
        ? { model: { active: userId } }
        : {},
    SignedOutHere: ({ userId }, { model }) => ({
      model: signedOut(model, userId),
    }),
    SignedOutAllHere: () => ({ model: { accounts: [], active: null } }),
  },
});
