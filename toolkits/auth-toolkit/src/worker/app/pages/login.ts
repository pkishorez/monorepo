import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page } from '@kestack/kabuki/routing';
import {
  Api,
  LoginData,
  returnDestination,
  signedOAuthQuery,
} from '../api/index.ts';
import { titled } from './metadata.ts';
import { followPageAccounts, readyData } from './shown.ts';

/*
 * The Login Screen: sign in plainly, to continue an authorization, or to
 * add another Account. One Google button, and Test Sign-In beside it when
 * the Auth Worker has it on. Its Loader names the app a
 * sign-in continues to, and sends a visitor already signed in, with
 * nothing to continue or add, back where `return_to` says.
 */

const query = {
  /** The whole query: an authorization's signed one, carried as it came. */
  search: Page.wholeQuery,
  return_to: Schema.optionalKey(Schema.String),
  add_account: Schema.optionalKey(Schema.String),
  client_id: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
  error_description: Schema.optionalKey(Schema.String),
};

const google = Command.make('google', {
  args: Schema.Struct({ returnTo: Schema.String }),
  run: ({ returnTo }) =>
    Effect.gen(function* () {
      const api = yield* Api;
      const here = yield* api.location;
      const oauthQuery = signedOAuthQuery(here.search);
      // A failure comes back here, without the last one's words.
      const errorTo = new URL(here.pathname + here.search, here.origin);
      errorTo.searchParams.delete('error');
      errorTo.searchParams.delete('error_description');
      const url = yield* api.google({
        errorTo: errorTo.href,
        oauthQuery,
        returnTo: oauthQuery ? undefined : new URL(returnTo, here.origin).href,
      });
      yield* api.leave(url);
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'GoogleFailed' as const,
          message: error.message,
        }),
      ),
    ),
});

// Lands where a finished Google sign-in would: the authorization it
// continues, or `returnTo`.
const test = Command.make('test', {
  args: Schema.Struct({
    email: Schema.String,
    key: Schema.optionalKey(Schema.String),
    returnTo: Schema.String,
  }),
  run: ({ email, key, returnTo }) =>
    Effect.gen(function* () {
      const api = yield* Api;
      const here = yield* api.location;
      const oauthQuery = signedOAuthQuery(here.search);
      const next = yield* api.testSignIn({ email, key, oauthQuery });
      yield* api.leave(next ?? new URL(returnTo, here.origin).href);
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'TestFailed' as const,
          message: error.message,
        }),
      ),
    ),
});

export const Login = Page.define({
  path: '/login',
  query,
  render: 'dynamic',
  // Who is signed in decides whether it shows at all: read on every visit.
  staleTime: 0,
  data: LoginData,
  metadata: (_, data) => titled('Sign in')(data),
  requires: [Api],
  model: Schema.Struct({
    /** Leaving for Google. */
    leaving: Schema.Boolean,
    /** Signing in as a Test User. */
    testing: Schema.Boolean,
    failure: Schema.NullOr(Schema.String),
    /** Why the last Test Sign-In was refused. */
    testFailure: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    GoogleChosen: {},
    GoogleFailed: { message: Schema.String },
    TestChosen: {
      email: Schema.String,
      key: Schema.optionalKey(Schema.String),
    },
    TestFailed: { message: Schema.String },
  }),
});

export const LoginLive = Page.build(Login, {
  init: () => ({
    model: { leaving: false, testing: false, failure: null, testFailure: null },
  }),
  workers: {
    // Another tab changed who is signed in: loaded anew once shown again.
    accounts: {
      run: (self) => followPageAccounts(self),
    },
  },
  on: {
    GoogleChosen: (_, { model, props }) =>
      model.leaving || model.testing
        ? {}
        : {
            model: { ...model, leaving: true, failure: null },
            command: google({
              returnTo: returnDestination(
                props.query.return_to,
                readyData(props.status),
              ),
            }),
          },
    GoogleFailed: ({ message }, { model }) => ({
      model: { ...model, leaving: false, failure: message },
    }),
    TestChosen: ({ email, key }, { model, props }) =>
      model.leaving || model.testing
        ? {}
        : {
            model: { ...model, testing: true, testFailure: null },
            command: test({
              email,
              ...(key !== undefined ? { key } : {}),
              returnTo: returnDestination(
                props.query.return_to,
                readyData(props.status),
              ),
            }),
          },
    TestFailed: ({ message }, { model }) => ({
      model: { ...model, testing: false, testFailure: message },
    }),
  },
});
