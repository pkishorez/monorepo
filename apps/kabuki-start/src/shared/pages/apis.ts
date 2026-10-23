import { Clock, Effect, Schema, Stream } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page } from '@kestack/kabuki/routing';
import { CurrentAccount } from '@kestack/web-platform/account-switcher';
import { LEVELS } from '../../apis/access/index.ts';
import { HelloHttp } from '../../apis/hello-http/index.ts';
import { HelloRpc } from '../../apis/hello-rpc/index.ts';
import { about } from './metadata/index.ts';

/*
 * The APIs page: who the calls go as, and one panel per API Worker, with
 * one call per level of access (public, authenticated, authorized) and
 * what each came back with. It has no data: an Account is the browser's,
 * so the server draws it checking and the browser carries on. Who is
 * signed in comes from `CurrentAccount`, which the root page Provides; the
 * header's Account Switcher signs in, switches and signs out.
 *
 * While an Account Switch shows, the panels are dimmed and still, since
 * their answers are the Account before's. Once the Account changes, they
 * start over.
 */

const Api = Schema.Literals(['http', 'rpc']);
const Level = Schema.Literals(LEVELS);

/** Who the calls go as. */
const Caller = Schema.TaggedUnion({
  Checking: {},
  SignedOut: {},
  SignedIn: { id: Schema.String, email: Schema.String },
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

const ApisModel = Schema.Struct({
  caller: Caller,
  /** Whether an Account Switch shows: the answers are the Account before's. */
  switching: Schema.Boolean,
  http: Calls,
  rpc: Calls,
});

type Caller = typeof Caller.Type;

export const Apis = Page.define({
  path: '/apis',
  requires: [CurrentAccount, HelloHttp, HelloRpc],
  metadata: about(
    '/apis',
    'APIs',
    'Two API Workers at two URLs: a public call, an authenticated one and an authorized one on each.',
  ),
  model: ApisModel,
  message: Schema.TaggedUnion({
    Changed: { caller: Caller, switching: Schema.Boolean },
    Send: { api: Api, level: Level },
    Answered: { api: Api, level: Level, answer: Answer },
  }),
});

/** Who a caller is, as one key: a tag, or the Account's id. */
const keyOf = (caller: Caller) =>
  caller._tag === 'SignedIn' ? caller.id : caller._tag;

export const ApisLive = Page.build(Apis, {
  init: () => ({
    model: {
      caller: { _tag: 'Checking' },
      switching: false,
      http: idle,
      rpc: idle,
    },
  }),
  workers: {
    account: {
      run: (self) =>
        Effect.flatMap(CurrentAccount, ({ state }) =>
          Stream.runForEach(state, ({ account, switching }) =>
            self.send({
              _tag: 'Changed',
              caller:
                account._tag === 'SignedIn'
                  ? {
                      _tag: 'SignedIn',
                      id: account.active.id,
                      email: account.active.email,
                    }
                  : { _tag: account._tag },
              switching: switching !== null,
            }),
          ),
        ),
    },
  },
  on: {
    // A new Account: the answers were someone else's.
    Changed: ({ caller, switching }, { model }) => ({
      model: {
        ...model,
        caller,
        switching,
        ...(keyOf(caller) === keyOf(model.caller)
          ? {}
          : { http: idle, rpc: idle }),
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
        signedIn: model.caller._tag === 'SignedIn',
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
