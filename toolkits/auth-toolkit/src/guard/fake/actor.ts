import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';
import { FAKE_DOMAIN, fakeUser } from './token.js';

/*
 * The Sign-in fake: the Auth Worker and the identity provider behind it,
 * as one browser sees them, in a Kabuki Actor that Requires nothing and
 * starts blank, nobody signed in. Its Model is who is signed in on this
 * browser, the sign-in waiting to be told who, and how the Auth Worker
 * answers; serve.ts runs the real Accounts client over it.
 *
 * - Asking   a sign-in the app starts is a `SignInAsked`, waiting in
 *            `asking` until a Control answers it: `SignInAs` someone, or
 *            `CancelSignIn`. Its answer lands in `answers`, for the
 *            sign-in to read. A new sign-in ends the one waiting, with
 *            nobody, as a page leaving for the provider ends the last.
 * - Here     what this tab asks (switch, sign out) is a Message Sent by
 *            serve.ts, not a Control.
 * - Elsewhere  a Control from another tab changes who is signed in and
 *            counts in `elsewhere`, which serve.ts tells this tab of, as
 *            another tab's BroadcastChannel would.
 * - Reach    the Auth Worker answering, slow (every call waits until it
 *            answers again), or out of reach (every call fails).
 *
 * A fake User's id and token come from the email alone (token.ts): the
 * same email is always the same User. Only an email at `kestack.test`
 * signs in; a bare name is taken as one there.
 */

/** Who blank `SignInAs` and `AddAccountElsewhere` sign in. */
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
  /** Failed, saying why. */
  Failed: { reason: Schema.String },
});
export type SignInAnswer = typeof Answer.Type;

/** How the Auth Worker answers. */
const Reach = Schema.Literals(['Answering', 'Slow', 'OutOfReach']);
export type Reach = typeof Reach.Type;

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
  /** Why the next sign-in fails; null when it does not. */
  failNext: Schema.NullOr(Schema.String),
  /** How the Auth Worker answers. */
  authWorker: Reach,
  /** How many changes came from another tab. */
  elsewhere: Schema.Int,
});
export type SignInModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls.
  /** Answers the sign-in waiting: signs in as this email (at kestack.test; blank for you@kestack.test) and name (blank for the email's first part). */
  SignInAs: { email: Schema.String, name: Schema.String },
  /** Answers the sign-in waiting with nobody, as closing the provider's page. */
  CancelSignIn: {},
  /** The next sign-in fails at once, saying this (blank for a plain reason). */
  FailNextSignIn: { reason: Schema.String },
  /** Another tab signs this Account out (blank for the Active Account). */
  SignOutElsewhere: { email: Schema.String },
  /** Another tab switches to this Account, signed in here already. */
  SwitchAccountElsewhere: { email: Schema.String },
  /** Another tab signs one more Account in, and makes it active. */
  AddAccountElsewhere: { email: Schema.String, name: Schema.String },
  /** The Auth Worker answers slowly: every call waits until it answers again. */
  MakeAuthWorkerSlow: {},
  /** The Auth Worker cannot be reached: every call fails. */
  PutAuthWorkerOutOfReach: {},
  /** The Auth Worker answers again, at once. */
  BringAuthWorkerBack: {},

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
  'FailNextSignIn',
  'SignOutElsewhere',
  'SwitchAccountElsewhere',
  'AddAccountElsewhere',
  'MakeAuthWorkerSlow',
  'PutAuthWorkerOutOfReach',
  'BringAuthWorkerBack',
] as const satisfies ReadonlyArray<SignInMessage['_tag']>;

/** Blank: nobody signed in, the Auth Worker answering. */
export const blank = (): SignInModel => ({
  accounts: [],
  active: null,
  asking: null,
  answers: [],
  failNext: null,
  authWorker: 'Answering',
  elsewhere: 0,
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

const byEmail = (model: SignInModel, email: string) => {
  const given = email.trim().toLowerCase();
  return given === ''
    ? model.accounts.find(({ id }) => id === model.active)
    : model.accounts.find(
        (account) =>
          account.email === given ||
          account.email === `${given}@${FAKE_DOMAIN}`,
      );
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
    FailNextSignIn: ({ reason }) => ({
      model: {
        failNext: reason.trim() || 'The sign-in failed. Try again in a moment.',
      },
    }),
    SignOutElsewhere: ({ email }, { model }) => {
      const account = byEmail(model, email);
      return account === undefined
        ? {}
        : {
            model: {
              ...signedOut(model, account.id),
              elsewhere: model.elsewhere + 1,
            },
          };
    },
    SwitchAccountElsewhere: ({ email }, { model }) => {
      const account = byEmail(model, email);
      return account === undefined || account.id === model.active
        ? {}
        : { model: { active: account.id, elsewhere: model.elsewhere + 1 } };
    },
    AddAccountElsewhere: ({ email, name }, { model }) => {
      const user = userOf(email, name);
      return user === null
        ? {}
        : {
            model: {
              ...signedIn(model, user),
              elsewhere: model.elsewhere + 1,
            },
          };
    },
    MakeAuthWorkerSlow: () => ({ model: { authWorker: 'Slow' as const } }),
    PutAuthWorkerOutOfReach: () => ({
      model: { authWorker: 'OutOfReach' as const },
    }),
    BringAuthWorkerBack: () => ({
      model: { authWorker: 'Answering' as const },
    }),

    SignInAsked: ({ id, adding }, { model }) => {
      // A newer sign-in ends the one waiting, with nobody.
      const answers =
        model.asking === null
          ? model.answers
          : withAnswer(model.answers, model.asking.id, { _tag: 'Nobody' });
      return model.failNext === null
        ? { model: { answers, asking: { id, adding } } }
        : {
            model: {
              asking: null,
              failNext: null,
              answers: withAnswer(answers, id, {
                _tag: 'Failed',
                reason: model.failNext,
              }),
            },
          };
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
