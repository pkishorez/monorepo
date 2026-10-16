import { Effect, Layer, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Session } from './capabilities.ts';
import { DownloadsLive } from './downloads.ts';
import { HomeLive } from './home.ts';

/** What Booting loads, in order. */
export const ASSETS = ['fonts', 'images', 'sounds'];
/** How long each asset takes, in milliseconds. */
export const LOAD = 1600;

const signIn = Command.make('sign in', {
  run: () =>
    Effect.sleep('1200 millis').pipe(
      Effect.as({ _tag: 'SignedIn' as const, name: 'Ada' }),
    ),
});

/**
 * The app being opened. Booting loads its assets until the user says how it
 * went, Signed out waits for a sign-in, and Inside Invokes everything else.
 */
export const App = Actor.define('App', {
  model: Schema.Struct({ attempts: Schema.Number }),
  state: Schema.TaggedUnion({
    Booting: { loaded: Schema.Array(Schema.String) },
    Failed: {},
    SignedOut: { signingIn: Schema.Boolean },
    Inside: { name: Schema.String },
  }),
  message: Schema.TaggedUnion({
    AssetLoaded: { asset: Schema.String },
    Succeed: {},
    Fail: {},
    Retry: {},
    SignIn: {},
    SignedIn: { name: Schema.String },
    SignedOut: {},
  }),
});

export const AppLive = Actor.build(App, {
  init: () => ({
    model: { attempts: 1 },
    state: { _tag: 'Booting', loaded: [] },
  }),
  state: {
    Booting: {
      workers: {
        'load assets': {
          run: (self) =>
            Effect.gen(function* () {
              const { state } = yield* self.get;
              for (const asset of ASSETS.filter(
                (asset) => !state.loaded.includes(asset),
              )) {
                yield* Effect.sleep(LOAD);
                yield* self.send({ _tag: 'AssetLoaded', asset });
              }
            }),
        },
      },
      on: {
        AssetLoaded: ({ asset }, { state }) => {
          const loaded = [...state.loaded, asset];
          return {
            state:
              loaded.length === ASSETS.length
                ? { _tag: 'SignedOut', signingIn: false }
                : { _tag: 'Booting', loaded },
          };
        },
        Succeed: () => ({ state: { _tag: 'SignedOut', signingIn: false } }),
        Fail: () => ({ state: { _tag: 'Failed' } }),
      },
    },
    Failed: {
      on: {
        Retry: (_, { model }) => ({
          model: { attempts: model.attempts + 1 },
          state: { _tag: 'Booting', loaded: [] },
        }),
      },
    },
    SignedOut: {
      on: {
        SignIn: (_, { state }) =>
          state.signingIn
            ? {}
            : {
                state: { _tag: 'SignedOut', signingIn: true },
                command: signIn(),
              },
        SignedIn: ({ name }) => ({ state: { _tag: 'Inside', name } }),
      },
    },
    Inside: {
      children: {
        home: { actor: HomeLive, props: ({ state }) => ({ name: state.name }) },
        downloads: { actor: DownloadsLive },
      },
      provides: (self) =>
        Layer.succeed(Session, { signOut: self.send({ _tag: 'SignedOut' }) }),
      on: {
        SignedOut: () => ({ state: { _tag: 'SignedOut', signingIn: false } }),
      },
    },
  },
});
