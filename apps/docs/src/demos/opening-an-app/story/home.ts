import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kstackz/kabuki';
import { Session } from './capabilities.ts';

/** How often the heartbeat beats, in milliseconds. */
export const HEARTBEAT = 5000;
/** How often a sync lands while sync is on, in milliseconds. */
export const SYNC = 2000;

const signOut = Command.make('sign out', {
  run: () =>
    Effect.gen(function* () {
      // Saving what is open takes a moment before the Session lets go.
      yield* Effect.sleep('2 seconds');
      const session = yield* Session;
      yield* session.signOut;
    }),
});

const every = (millis: number, effect: Effect.Effect<void>) =>
  Effect.forever(Effect.sleep(millis).pipe(Effect.andThen(effect)));

/** Where the user lands: the name App hands it, a heartbeat, and a sync they turn on and off. */
export const Home = Actor.make('Home', {
  requires: [Session],
  props: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({
    beats: Schema.Number,
    sync: Schema.Boolean,
    synced: Schema.Number,
    /** When the last sync landed. */
    last: Schema.NullOr(Schema.Number),
    /** Sign out is under way. */
    signingOut: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    Beat: {},
    ToggleSync: {},
    Synced: {},
    SignOut: {},
  }),
}).build({
  init: () => ({
    model: { beats: 0, sync: false, synced: 0, last: null, signingOut: false },
  }),
  workers: {
    heartbeat: {
      run: (self) => every(HEARTBEAT, self.send({ _tag: 'Beat' })),
    },
    sync: {
      while: ({ model }) => model.sync,
      run: (self) => every(SYNC, self.send({ _tag: 'Synced' })),
    },
  },
  on: {
    Beat: (_, { model }) => ({ model: { ...model, beats: model.beats + 1 } }),
    ToggleSync: (_, { model }) => ({ model: { ...model, sync: !model.sync } }),
    Synced: (_, { model, at }) => ({
      model: {
        ...model,
        synced: model.synced + 1,
        last: at,
      },
    }),
    SignOut: (_, { model }) =>
      model.signingOut
        ? {}
        : { model: { ...model, signingOut: true }, command: signOut() },
  },
});
