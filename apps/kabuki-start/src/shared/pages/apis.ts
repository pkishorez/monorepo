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
 *
 * An Account Switch is timed as the Router times a move: under way past
 * `SWITCH_DELAY`, it shows (its button spinning, the panels dimmed, since
 * their answers are the Account before's); once shown it stays at least
 * `SWITCH_MINIMUM`. Then the new Account takes the old's place and the
 * panels start over, in one step. One that fails says why.
 */

/** How long a switch is under way before it shows, as the Router's `delay`. */
const SWITCH_DELAY = 150;
/** How long a switch, once shown, stays shown at least, as the Router's `minimum`. */
const SWITCH_MINIMUM = 300;

const Api = Schema.Literals(['http', 'rpc']);
const Level = Schema.Literals(LEVELS);

const Account = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
});

/** Who is signed in, as the page shows it. */
const Shown = Schema.TaggedUnion({
  Checking: {},
  SignedOut: {},
  SignedIn: { active: Account, others: Schema.Array(Account) },
});

/** The Account Switch under way: to whom, since when, when it showed, and,
 * once answered while it must stay shown, who is signed in then. */
const Switching = Schema.Struct({
  id: Schema.String,
  since: Schema.Number,
  shownAt: Schema.NullOr(Schema.Number),
  next: Schema.NullOr(Shown),
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
    Effect.flatMap(Accounts, (a) => a.switchTo(id)).pipe(
      Effect.as(undefined),
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'SwitchFailed' as const,
          message: error.message,
        }),
      ),
    ),
});

const ApisModel = Schema.Struct({
  account: Shown,
  switching: Schema.NullOr(Switching),
  /** Why the last switch failed, until the next. */
  switchFailed: Schema.NullOr(Schema.String),
  http: Calls,
  rpc: Calls,
});

type Model = typeof ApisModel.Type;

export const Apis = Page.define({
  path: '/apis',
  requires: [Accounts, HelloHttp, HelloRpc],
  metadata: about(
    '/apis',
    'APIs',
    'Two API Workers at two URLs: a public call, an authenticated one and an authorized one on each.',
  ),
  model: ApisModel,
  message: Schema.TaggedUnion({
    SignIn: {},
    SignOut: {},
    SwitchTo: { id: Schema.String },
    SwitchShown: {},
    SwitchDone: {},
    SwitchFailed: { message: Schema.String },
    Changed: {
      account: Shown,
      /** The Account a switch under way makes active. */
      switchingTo: Schema.NullOr(Schema.String),
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

const activeOf = (account: typeof Shown.Type) =>
  account._tag === 'SignedIn' ? account.active.id : account._tag;

/** The switch is over: who is signed in now is shown, and the panels start
 * over if their Account is gone. */
const switched = (model: Model, account: typeof Shown.Type): Model => ({
  ...model,
  account,
  switching: null,
  ...(activeOf(account) === activeOf(model.account)
    ? {}
    : { http: idle, rpc: idle }),
});

export const ApisLive = Page.build(Apis, {
  init: () => ({
    model: {
      account: { _tag: 'Checking' },
      switching: null,
      switchFailed: null,
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
              switchingTo:
                now._tag === 'SignedIn' ? (now.switchingTo?.id ?? null) : null,
            }),
          ),
        ),
    },
    // A switch still under way after the delay shows.
    showSwitch: {
      while: ({ model }) =>
        model.switching !== null &&
        model.switching.shownAt === null &&
        model.switching.next === null,
      run: (self) =>
        Effect.gen(function* () {
          const since = (yield* self.get).model.switching?.since ?? 0;
          yield* Effect.sleep(
            Math.max(0, since + SWITCH_DELAY - (yield* self.now)),
          );
          yield* self.send({ _tag: 'SwitchShown' });
        }),
    },
    // One answered soon after it showed stays shown the minimum.
    endSwitch: {
      while: ({ model }) => model.switching?.next != null,
      run: (self) =>
        Effect.gen(function* () {
          const shownAt = (yield* self.get).model.switching?.shownAt ?? 0;
          yield* Effect.sleep(
            Math.max(0, shownAt + SWITCH_MINIMUM - (yield* self.now)),
          );
          yield* self.send({ _tag: 'SwitchDone' });
        }),
    },
  },
  on: {
    SignIn: (_, { model }) => (model.switching ? {} : { command: signIn() }),
    SignOut: (_, { model }) => (model.switching ? {} : { command: signOut() }),
    SwitchTo: ({ id }, { model }) =>
      model.switching
        ? {}
        : {
            model: { ...model, switchFailed: null },
            command: switchTo({ id }),
          },
    Changed: ({ account, switchingTo }, { model, at }) => {
      const { switching } = model;
      // Under way: who was active stays shown, and so do the panels.
      if (switchingTo !== null)
        return {
          model: {
            ...model,
            switching:
              switching?.id === switchingTo
                ? { ...switching, next: null }
                : { id: switchingTo, since: at, shownAt: null, next: null },
          },
        };
      if (switching === null)
        return { model: { ...model, account, http: idle, rpc: idle } };
      // Answered: shown a moment ago, it waits out the minimum first.
      return switching.shownAt !== null &&
        at < switching.shownAt + SWITCH_MINIMUM
        ? { model: { ...model, switching: { ...switching, next: account } } }
        : { model: switched(model, account) };
    },
    SwitchShown: (_, { model, at }) =>
      model.switching
        ? {
            model: { ...model, switching: { ...model.switching, shownAt: at } },
          }
        : {},
    SwitchDone: (_, { model }) =>
      model.switching?.next
        ? { model: switched(model, model.switching.next) }
        : {},
    SwitchFailed: ({ message }, { model }) => ({
      model: { ...model, switchFailed: message },
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
