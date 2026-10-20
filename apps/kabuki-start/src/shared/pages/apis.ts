import { Clock, Effect, Schema, Stream } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page } from '@kestack/kabuki/routing';
import { Accounts } from '@kestack/auth-toolkit/client';
import { LEVELS } from '../../apis/access/index.ts';
import { HelloHttp } from '../../apis/hello-http/index.ts';
import { HelloRpc } from '../../apis/hello-rpc/index.ts';
import { about } from './metadata.ts';

/*
 * The APIs page: who is signed in, and one panel per API Worker, with one
 * call per level of access (public, authenticated, authorized) and what
 * each came back with. It has no data: an Account is the
 * browser's, so the server draws it checking and the browser carries on.
 * Signing in leaves for the Auth Worker's Login Screen and comes back.
 */

const Api = Schema.Literals(['http', 'rpc']);
const Level = Schema.Literals(LEVELS);

const Account = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
});

/** What a call came to, as the panel shows it. */
const Answer = Schema.Struct({
  ok: Schema.Boolean,
  /** Whether it left the browser: signed out, the client refuses it itself. */
  sent: Schema.Boolean,
  /** `200 OK`, `401 Unauthenticated`, `Success`, `Failure: Unauthenticated`. */
  status: Schema.String,
  body: Schema.String,
  ms: Schema.Number,
});

const Call = Schema.TaggedUnion({
  Idle: {},
  Sending: {},
  Answered: { answer: Answer },
});

/** A Worker's three calls, one per level. */
const Calls = Schema.Struct({
  public: Call,
  authenticated: Call,
  authorized: Call,
});

const idle = {
  public: { _tag: 'Idle' },
  authenticated: { _tag: 'Idle' },
  authorized: { _tag: 'Idle' },
} as const;

/** The HTTP status auth-toolkit's errors are sent with. */
const STATUS: Readonly<Record<string, number>> = {
  Unauthenticated: 401,
  Forbidden: 403,
  AccountChanged: 409,
  Unavailable: 503,
};

/** A call's outcome as an Answer, timed: it never fails. */
const settle = <E extends { readonly _tag: string; readonly message: string }>(
  api: 'http' | 'rpc',
  sent: boolean,
  hello: Effect.Effect<string, E>,
) =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeMillis;
    const outcome = yield* Effect.result(hello);
    const ms = (yield* Clock.currentTimeMillis) - start;
    if (outcome._tag === 'Success')
      return {
        ok: true,
        sent: true,
        status: api === 'http' ? '200 OK' : 'Success',
        body: JSON.stringify(outcome.success),
        ms,
      };
    const error = outcome.failure;
    const known = STATUS[error._tag] !== undefined;
    return {
      ok: false,
      sent: sent || !known,
      status:
        api === 'http'
          ? `${STATUS[error._tag] ?? 'Network error'} ${error._tag}`
          : `Failure: ${error._tag}`,
      body:
        'reason' in error && typeof error.reason === 'string'
          ? `${error._tag}: ${error.reason}`
          : `${error._tag}: ${error.message}`,
      ms,
    };
  });

const send = Command.make('send', {
  args: Schema.Struct({ api: Api, level: Level, signedIn: Schema.Boolean }),
  run: ({ api, level, signedIn }) =>
    Effect.gen(function* () {
      // A public call is always sent: only a guarded one waits for an Account.
      const sent = signedIn || level === 'public';
      const answer =
        api === 'http'
          ? yield* settle(api, sent, (yield* HelloHttp)[level])
          : yield* settle(api, sent, (yield* HelloRpc)[level]);
      return { _tag: 'Answered' as const, api, level, answer };
    }),
});

const signIn = Command.make('signIn', {
  run: () => Effect.ignore(Effect.flatMap(Accounts, (a) => a.signIn())),
});

const signOut = Command.make('signOut', {
  run: () => Effect.ignore(Effect.flatMap(Accounts, (a) => a.signOut())),
});

const switchTo = Command.make('switchTo', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.ignore(Effect.flatMap(Accounts, (a) => a.switchTo(id))),
});

export const Apis = Page.define({
  path: '/apis',
  requires: [Accounts, HelloHttp, HelloRpc],
  metadata: about(
    '/apis',
    'APIs',
    'Two API Workers at two URLs: a public call, an authenticated one and an authorized one on each.',
  ),
  model: Schema.Struct({
    account: Schema.TaggedUnion({
      Checking: {},
      SignedOut: {},
      SignedIn: { active: Account, others: Schema.Array(Account) },
    }),
    http: Calls,
    rpc: Calls,
  }),
  message: Schema.TaggedUnion({
    SignIn: {},
    SignOut: {},
    SwitchTo: { id: Schema.String },
    Changed: {
      account: Schema.TaggedUnion({
        Checking: {},
        SignedOut: {},
        SignedIn: { active: Account, others: Schema.Array(Account) },
      }),
    },
    Send: { api: Api, level: Level },
    Answered: { api: Api, level: Level, answer: Answer },
  }),
});

const plain = ({ id, name, email, image }: typeof Account.Type) => ({
  id,
  name,
  email,
  image,
});

export const ApisLive = Page.build(Apis, {
  init: () => ({
    model: {
      account: { _tag: 'Checking' },
      http: idle,
      rpc: idle,
    },
  }),
  workers: {
    accounts: {
      run: (self) =>
        Effect.flatMap(Accounts, ({ state }) =>
          Stream.runForEach(state, (now) =>
            self.send({
              _tag: 'Changed',
              account:
                now._tag === 'SignedIn'
                  ? {
                      _tag: 'SignedIn',
                      active: plain(now.active),
                      others: now.accounts
                        .filter((each) => each.id !== now.active.id)
                        .map(plain),
                    }
                  : { _tag: now._tag },
            }),
          ),
        ),
    },
  },
  on: {
    SignIn: () => ({ command: signIn() }),
    SignOut: () => ({ command: signOut() }),
    SwitchTo: ({ id }) => ({ command: switchTo({ id }) }),
    Changed: ({ account }, { model }) => ({
      model: {
        ...model,
        account,
        http: idle,
        rpc: idle,
      },
    }),
    Send: ({ api, level }, { model }) => ({
      model: {
        ...model,
        [api]: { ...model[api], [level]: { _tag: 'Sending' } },
      },
      command: send({
        api,
        level,
        signedIn: model.account._tag === 'SignedIn',
      }),
    }),
    Answered: ({ api, level, answer }, { model }) => ({
      model: {
        ...model,
        [api]: { ...model[api], [level]: { _tag: 'Answered', answer } },
      },
    }),
  },
});
