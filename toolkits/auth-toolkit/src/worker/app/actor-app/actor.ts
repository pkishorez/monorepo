import { Effect, Layer, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import { Api } from '../api/index.ts';
import { Consent, ConsentLive } from './approving/page-consent/actor.ts';
import { Device, DeviceLive } from './approving/page-device/actor.ts';
import { ErrorPage, ErrorPageLive } from './page-error/actor.ts';
import { Home, HomeLive } from './page-home/actor.ts';
import { Login, LoginLive } from './page-login/actor.ts';
import { Toasts } from './toasts.ts';

/*
 * The root page: the Account menu's Account Switch and sign-outs, and the
 * toasts. Every page arrives with this browser's Accounts in its data; once
 * they change here, the page's data is no one's any more and is loaded
 * anew. Each page notices another tab's change itself (`followAccounts`).
 *
 * An Account Switch is one transition, timed as the Router times a move:
 *
 * 1. Chosen     the switch is asked of the Auth Worker; the page shown
 *               stays as it is.
 * 2. Shown      still under way after `SWITCH_DELAY`, the page is dimmed
 *               and still, the chosen Account spinning in the menu.
 * 3. Confirmed  the page's data is loaded anew for the new Account, held:
 *               what is shown stays until the new data takes its place.
 * 4. Landed     once shown, the switch stays shown `SWITCH_MINIMUM` at
 *               least, so it never flashes; then it is done, in a toast.
 *
 * A switch that fails changes nothing but the toast it says so in.
 */

const Toast = Schema.Struct({ id: Schema.Number, text: Schema.String });

/** How long a switch is under way before it shows, as the Router's `delay`. */
export const SWITCH_DELAY = 150;
/** How long a switch, once shown, stays shown at least, as the Router's `minimum`. */
export const SWITCH_MINIMUM = 300;

const switchTo = Command.make('switchTo', {
  args: Schema.Struct({ userId: Schema.String }),
  run: ({ userId }) =>
    Effect.gen(function* () {
      yield* (yield* Api).switchTo(userId);
      return { _tag: 'SwitchConfirmed' as const };
    }).pipe(failedAs),
});

/** Loads the page's data anew for the new Account, the data shown held until it lands. */
const loadSwitched = Command.make('loadSwitched', {
  run: () =>
    Navigation.use((navigation) =>
      navigation.reload({ anew: true, hold: true }),
    ).pipe(Effect.as({ _tag: 'SwitchLanded' as const })),
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
  /** The Account Switch under way: since when, when it showed, and how far it is. */
  switching: Schema.NullOr(
    Schema.Struct({
      userId: Schema.String,
      email: Schema.String,
      since: Schema.Number,
      shownAt: Schema.NullOr(Schema.Number),
      step: Schema.Literals(['chosen', 'confirmed', 'landed']),
    }),
  ),
  toasts: Schema.Array(Toast),
  nextToast: Schema.Number,
});

export const App = Page.define({
  pages: { Home, Login, Device, Consent, Error: ErrorPage },
  requires: [Api],
  model: AppModel,
  message: Schema.TaggedUnion({
    SwitchChosen: { userId: Schema.String, email: Schema.String },
    SwitchShown: {},
    SwitchConfirmed: {},
    SwitchLanded: {},
    SwitchDone: {},
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

/** The switch is over: the new Account is shown, and said so. */
const switched = (model: Model): Model =>
  model.switching
    ? toasted(
        { ...model, busy: null, switching: null },
        `Switched to ${model.switching.email}`,
      )
    : model;

export const AppLive = App.build({
  pages: {
    Home: HomeLive,
    Login: LoginLive,
    Device: DeviceLive,
    Consent: ConsentLive,
    Error: ErrorPageLive,
  },
  init: () => ({
    model: { busy: null, switching: null, toasts: [], nextToast: 0 },
  }),
  provides: (self) =>
    Layer.succeed(Toasts, {
      show: (text) => self.send({ _tag: 'Toasted', text }),
    }),
  workers: {
    // A switch still under way after the delay shows.
    showSwitch: {
      while: ({ model }) =>
        model.switching !== null &&
        model.switching.shownAt === null &&
        model.switching.step !== 'landed',
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const since = model.switching?.since ?? 0;
          yield* Effect.sleep(
            Math.max(0, since + SWITCH_DELAY - (yield* self.now)),
          );
          yield* self.send({ _tag: 'SwitchShown' });
        }),
    },
    // A switch that landed soon after it showed stays shown the minimum.
    endSwitch: {
      while: ({ model }) => model.switching?.step === 'landed',
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const shownAt = model.switching?.shownAt ?? 0;
          yield* Effect.sleep(
            Math.max(0, shownAt + SWITCH_MINIMUM - (yield* self.now)),
          );
          yield* self.send({ _tag: 'SwitchDone' });
        }),
    },
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
    SwitchChosen: ({ userId, email }, { model, at }) =>
      model.busy !== null
        ? {}
        : {
            model: {
              ...model,
              busy: userId,
              switching: {
                userId,
                email,
                since: at,
                shownAt: null,
                step: 'chosen',
              },
            },
            command: switchTo({ userId }),
          },
    SwitchShown: (_, { model, at }) =>
      model.switching
        ? {
            model: { ...model, switching: { ...model.switching, shownAt: at } },
          }
        : {},
    SwitchConfirmed: (_, { model }) =>
      model.switching
        ? {
            model: {
              ...model,
              switching: { ...model.switching, step: 'confirmed' },
            },
            command: loadSwitched(),
          }
        : {},
    SwitchLanded: (_, { model, at }) => {
      const shownAt = model.switching?.shownAt ?? null;
      if (!model.switching) return {};
      return shownAt !== null && at < shownAt + SWITCH_MINIMUM
        ? {
            model: {
              ...model,
              switching: { ...model.switching, step: 'landed' },
            },
          }
        : { model: switched(model) };
    },
    SwitchDone: (_, { model }) => ({ model: switched(model) }),
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
      model: toasted({ ...model, busy: null, switching: null }, message),
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
