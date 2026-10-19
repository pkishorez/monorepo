import { Effect, Layer, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page, Router } from '@kestack/kabuki/routing';
import { Api } from '../api/index.ts';
import { Consent, ConsentLive } from './consent.ts';
import { Device, DeviceLive } from './device.ts';
import { ErrorPage, ErrorPageLive } from './error.ts';
import { Home, HomeLive } from './home.ts';
import { Login, LoginLive } from './login.ts';
import { Toasts } from './toasts.ts';

/*
 * The root page: the Account menu's Account Switch and sign-outs, and the
 * toasts. Every page arrives with this browser's Accounts in its data; once
 * they change here, the page's data is no one's any more and is loaded
 * anew. Each page notices another tab's change itself (`followAccounts`).
 */

const Toast = Schema.Struct({ id: Schema.Number, text: Schema.String });

const switchTo = Command.make('switchTo', {
  args: Schema.Struct({ userId: Schema.String, email: Schema.String }),
  run: ({ userId, email }) =>
    Effect.gen(function* () {
      yield* (yield* Api).switchTo(userId);
      return { _tag: 'Switched' as const, email };
    }).pipe(failedAs),
});

const signOut = Command.make('signOut', {
  args: Schema.Struct({ userId: Schema.String, email: Schema.String }),
  run: ({ userId, email }) =>
    Effect.gen(function* () {
      yield* (yield* Api).signOut(userId);
      return { _tag: 'SignedOutOne' as const, email };
    }).pipe(failedAs),
});

const signOutAll = Command.make('signOutAll', {
  args: Schema.Struct({}),
  run: () =>
    Effect.gen(function* () {
      yield* (yield* Api).signOutAll;
      return { _tag: 'SignedOutAll' as const };
    }).pipe(failedAs),
});

function failedAs<A, R>(effect: Effect.Effect<A, { message: string }, R>) {
  return effect.pipe(
    Effect.catch((error) =>
      Effect.succeed({ _tag: 'Failed' as const, message: error.message }),
    ),
  );
}

/** How long a toast stays: long enough to read it. */
const toastMillis = (text: string) =>
  Math.min(7000, 2500 + text.split(/\s+/).length * 250);

const AppModel = Schema.Struct({
  /** The Account an action is under way for, or `all`. */
  busy: Schema.NullOr(Schema.String),
  toasts: Schema.Array(Toast),
  nextToast: Schema.Number,
});

export const App = Page.define({
  pages: { Home, Login, Device, Consent, Error: ErrorPage },
  requires: [Api],
  model: AppModel,
  message: Schema.TaggedUnion({
    SwitchChosen: { userId: Schema.String, email: Schema.String },
    Switched: { email: Schema.String },
    SignOutChosen: { userId: Schema.String, email: Schema.String },
    SignedOutOne: { email: Schema.String },
    SignOutAllChosen: {},
    SignedOutAll: {},
    Failed: { message: Schema.String },
    Toasted: { text: Schema.String },
    ToastExpired: { id: Schema.Number },
  }),
});

type Model = typeof AppModel.Type;

const toasted = (model: Model, text: string): Model => ({
  ...model,
  toasts: [...model.toasts, { id: model.nextToast, text }].slice(-3),
  nextToast: model.nextToast + 1,
});

/** The Account the page's data belonged to changed: it is loaded anew. */
const anew = () => Router.reload({ anew: true });

export const AppLive = Page.build(App, {
  pages: {
    Home: HomeLive,
    Login: LoginLive,
    Device: DeviceLive,
    Consent: ConsentLive,
    Error: ErrorPageLive,
  },
  init: () => ({ model: { busy: null, toasts: [], nextToast: 0 } }),
  provides: (self) =>
    Layer.succeed(Toasts, {
      show: (text) => self.send({ _tag: 'Toasted', text }),
    }),
  workers: {
    toast: {
      each: ({ model }) => model.toasts.map((toast) => `${toast.id}`),
      run: (self, key) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const toast = model.toasts.find((each) => `${each.id}` === key);
          yield* Effect.sleep(toastMillis(toast?.text ?? ''));
          yield* self.send({ _tag: 'ToastExpired', id: Number(key) });
        }),
    },
  },
  on: {
    SwitchChosen: ({ userId, email }, { model }) =>
      model.busy !== null
        ? {}
        : {
            model: { ...model, busy: userId },
            command: switchTo({ userId, email }),
          },
    Switched: ({ email }, { model }) => ({
      model: toasted({ ...model, busy: null }, `Switched to ${email}`),
      command: anew(),
    }),
    SignOutChosen: ({ userId, email }, { model }) =>
      model.busy !== null
        ? {}
        : {
            model: { ...model, busy: userId },
            command: signOut({ userId, email }),
          },
    SignedOutOne: ({ email }, { model }) => ({
      model: toasted({ ...model, busy: null }, `Signed out of ${email}`),
      command: anew(),
    }),
    SignOutAllChosen: (_, { model }) =>
      model.busy !== null
        ? {}
        : { model: { ...model, busy: 'all' }, command: signOutAll({}) },
    SignedOutAll: (_, { model }) => ({
      model: toasted(
        { ...model, busy: null },
        'Signed out of every account on this browser',
      ),
      command: anew(),
    }),
    Failed: ({ message }, { model }) => ({
      model: toasted({ ...model, busy: null }, message),
    }),
    Toasted: ({ text }, { model }) => ({ model: toasted(model, text) }),
    ToastExpired: ({ id }, { model }) => ({
      model: {
        ...model,
        toasts: model.toasts.filter((toast) => toast.id !== id),
      },
    }),
  },
});
