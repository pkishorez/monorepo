import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page, Router } from '@kestack/kabuki/routing';
import { Api, HomeData } from '../../api/index.ts';
import { titled } from '../metadata.ts';
import { followPageAccounts, readyData } from '../shown.ts';
import { Toasts } from '../toasts.ts';

/*
 * The Home Page: where the Active Account is signed in, and which apps
 * have access, loaded with the page; a signed-out visitor's Loader sends
 * them to the Login Screen. Each removal is immediate, says so in a toast,
 * and reloads the lists behind what is shown; signing out everywhere else
 * is the one action that asks first. Ending this browser's own Sign-in
 * changes the Active Account, so the page is loaded anew.
 */

// An Account another tab switched away from is no longer the one shown:
// the page is loaded anew for the Account active now. Each answer names the
// Account it was for, so one that lands after an Account Switch touches
// nothing of the Account shown now.
const failedAs =
  (id: string, userId: string) =>
  <A, R>(effect: Effect.Effect<A, { code: string; message: string }, R>) =>
    effect.pipe(
      Effect.catch((error) =>
        Effect.gen(function* () {
          yield* (yield* Toasts).show(error.message);
          return {
            _tag: 'ActionFailed' as const,
            id,
            userId,
            changed: error.code === 'account_changed',
          };
        }),
      ),
    );

/** The pending entry of signing an Account out everywhere else. */
export const othersOf = (userId: string | null | undefined) =>
  `others:${userId ?? ''}`;

const revokeSignIn = Command.make('revokeSignIn', {
  args: Schema.Struct({
    id: Schema.String,
    userId: Schema.String,
    name: Schema.String,
    current: Schema.Boolean,
  }),
  run: ({ id, userId, name, current }) =>
    Effect.gen(function* () {
      yield* (yield* Api).revokeSignIn(id, userId);
      yield* (yield* Toasts).show(
        current ? 'Signed out of this browser' : `Signed out of ${name}`,
      );
      return { _tag: 'SignInRevoked' as const, id, userId, current };
    }).pipe(failedAs(id, userId)),
});

const revokeOthers = Command.make('revokeOthers', {
  args: Schema.Struct({
    userId: Schema.String,
    /** The other Sign-ins shown when it was asked: hidden once it lands. */
    ids: Schema.Array(Schema.String),
  }),
  run: ({ userId, ids }) =>
    Effect.gen(function* () {
      const revoked = yield* (yield* Api).revokeOtherSignIns(userId);
      yield* (yield* Toasts).show(
        revoked === 0
          ? 'You were only signed in here'
          : `Signed out of ${revoked} other ${revoked === 1 ? 'place' : 'places'}`,
      );
      return { _tag: 'OthersRevoked' as const, userId, ids };
    }).pipe(failedAs(othersOf(userId), userId)),
});

const revokeGrant = Command.make('revokeGrant', {
  args: Schema.Struct({
    id: Schema.String,
    userId: Schema.String,
    app: Schema.String,
  }),
  run: ({ id, userId, app }) =>
    Effect.gen(function* () {
      yield* (yield* Api).revokeGrant(id, userId);
      yield* (yield* Toasts).show(`Removed access for ${app}`);
      return { _tag: 'GrantRevoked' as const, id, userId };
    }).pipe(failedAs(id, userId)),
});

export const Home = Page.define({
  path: '/',
  render: 'dynamic',
  data: HomeData,
  metadata: (_, data) => titled('Your account')(data),
  requires: [Api, Toasts],
  model: Schema.Struct({
    /** Rows being removed, by id; `others:{userId}` for everywhere else. */
    pending: Schema.Array(Schema.String),
    /** Rows removed here, hidden until the reload behind them lands. */
    removed: Schema.Array(Schema.String),
    confirming: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    SignInRevokeChosen: { id: Schema.String },
    SignInRevoked: {
      id: Schema.String,
      userId: Schema.String,
      current: Schema.Boolean,
    },
    GrantRevokeChosen: { id: Schema.String },
    GrantRevoked: { id: Schema.String, userId: Schema.String },
    ActionFailed: {
      id: Schema.String,
      userId: Schema.String,
      changed: Schema.Boolean,
    },
    ConfirmOpened: {},
    ConfirmClosed: {},
    OthersRevokeConfirmed: {},
    OthersRevoked: {
      userId: Schema.String,
      ids: Schema.Array(Schema.String),
    },
  }),
});

const without = (list: ReadonlyArray<string>, id: string) =>
  list.filter((each) => each !== id);

type Status = {
  readonly _tag: string;
  readonly data?: typeof HomeData.Type;
};

/** Whether the page still shows the Account an answer was for. */
const showing = (status: Status, userId: string) =>
  readyData(status)?.accounts.active === userId;

export const HomeLive = Home.build({
  init: () => ({ model: { pending: [], removed: [], confirming: false } }),
  workers: {
    // Another tab changed who is signed in: loaded anew once shown again.
    accounts: {
      run: (self) => followPageAccounts(self),
    },
  },
  on: {
    SignInRevokeChosen: ({ id }, { model, props }) => {
      const data = readyData(props.status);
      const signIn = data?.signIns.find((each) => each.id === id);
      const userId = data?.accounts.active;
      if (!signIn || !userId || model.pending.includes(id)) return {};
      return {
        model: { ...model, pending: [...model.pending, id] },
        command: revokeSignIn({
          id,
          userId,
          name: signIn.name,
          current: signIn.current,
        }),
      };
    },
    SignInRevoked: ({ id, userId, current }, { model, props }) =>
      showing(props.status, userId)
        ? {
            model: {
              ...model,
              pending: without(model.pending, id),
              removed: [...model.removed, id],
            },
            command: Router.reload(current ? { anew: true } : {}),
          }
        : { model: { ...model, pending: without(model.pending, id) } },
    GrantRevokeChosen: ({ id }, { model, props }) => {
      const data = readyData(props.status);
      const grant = data?.grants.find((each) => each.id === id);
      const userId = data?.accounts.active;
      if (!grant || !userId || model.pending.includes(id)) return {};
      return {
        model: { ...model, pending: [...model.pending, id] },
        command: revokeGrant({ id, userId, app: grant.client.name }),
      };
    },
    GrantRevoked: ({ id, userId }, { model, props }) =>
      showing(props.status, userId)
        ? {
            model: {
              ...model,
              pending: without(model.pending, id),
              removed: [...model.removed, id],
            },
            command: Router.reload(),
          }
        : { model: { ...model, pending: without(model.pending, id) } },
    ActionFailed: ({ id, userId, changed }, { model, props }) =>
      showing(props.status, userId)
        ? {
            model: {
              ...model,
              confirming: false,
              pending: without(model.pending, id),
            },
            ...(changed ? { command: Router.reload({ anew: true }) } : {}),
          }
        : { model: { ...model, pending: without(model.pending, id) } },
    ConfirmOpened: (_, { model }) => ({
      model: { ...model, confirming: true },
    }),
    ConfirmClosed: (_, { model, props }) =>
      model.pending.includes(othersOf(readyData(props.status)?.accounts.active))
        ? {}
        : { model: { ...model, confirming: false } },
    OthersRevokeConfirmed: (_, { model, props }) => {
      const data = readyData(props.status);
      const userId = data?.accounts.active;
      return !userId || model.pending.includes(othersOf(userId))
        ? {}
        : {
            model: { ...model, pending: [...model.pending, othersOf(userId)] },
            command: revokeOthers({
              userId,
              ids: data.signIns
                .filter((each) => !each.current)
                .map((each) => each.id),
            }),
          };
    },
    OthersRevoked: ({ userId, ids }, { model, props }) =>
      showing(props.status, userId)
        ? {
            model: {
              ...model,
              confirming: false,
              pending: without(model.pending, othersOf(userId)),
              removed: [...model.removed, ...ids],
            },
            command: Router.reload(),
          }
        : {
            model: {
              ...model,
              pending: without(model.pending, othersOf(userId)),
            },
          },
  },
});
