import { Duration, Effect, Layer, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki/core/actor';
import { addressOf } from '../../../heartbeat/index.js';
import { ActorConnection, ROTATE_EVERY } from './actor-connection/index.js';
import { Cloud, CloudAccount, Control } from './capabilities/index.js';

/*
 * The root: Connect is tied to the User's login. While SigningIn nothing
 * runs. Once SignedIn the Connection runs, and everything it runs lives and
 * dies with it. Identity Provides Cloud, so what runs below reports without
 * knowing about the login: an answer that means anything for it stops here.
 *
 * Only Connect Cloud saying the Sign-in is gone logs the User out, which
 * removes the Connection, its tunnel and its Plugins, until signed in again.
 * A Report that could not be sent says nothing of the login, so everything
 * goes on running, and the next Heartbeat asks again. A forgotten, refused or
 * Outdated Connection ends the program, and so does a Sign-in that fails, or a
 * port that cannot be opened: each is Ended, saying why. Outdated is Connect
 * Cloud refusing this `ke-connect` 426, below its Minimum Connect, with one
 * line to show, which is the why: the program ends with an exit code of its
 * own, so a service starts it again at the newest version.
 *
 * A Connect Cloud that refuses Sign-in after Sign-in would have it sign in
 * over and over: from the second refusal in a row it waits before signing in
 * again, twice as long each time, up to a minute. A Report taken ends the run.
 *
 * The answerLocal Worker answers `status` and `stop` on the control socket
 * `serve` holds, for as long as the tree runs, signed in or not. Each Report
 * says the address it carries, which is how Identity knows what to answer.
 */

/** The longest wait before signing in again. */
const MOST_BACKOFF = Duration.minutes(1);

/**
 * How long to wait before signing in again after `refusals` Sign-ins in a
 * row were refused: none after the first, then `first`, doubling, up to a
 * minute.
 */
const backoffAfter = (refusals: number, first: Duration.Input) =>
  refusals <= 1
    ? Duration.zero
    : Duration.min(
        Duration.times(Duration.fromInputUnsafe(first), 2 ** (refusals - 2)),
        MOST_BACKOFF,
      );

const Input = Schema.Struct({
  /** The Connection's name on this computer. */
  name: Schema.String,
  folders: Schema.Struct({
    data: Schema.String,
    state: Schema.String,
    cache: Schema.String,
    shared: Schema.String,
    runtime: Schema.String,
  }),
  /** What names its Plugins' sockets: their paths take its first 8 characters. */
  socketId: Schema.String,
  /** Its control socket, the lock that makes it the one process of its name. */
  control: Schema.String,
  /** The public port to listen on; 0 for any free one. */
  port: Schema.Finite,
  /** The origins a browser page may call from. */
  origins: Schema.Array(Schema.String),
  /** How long a Connection Key lasts, in ms; an hour unless given. */
  rotateEvery: Schema.optional(Schema.Finite),
});
type Input = typeof Input.Type;

/** Where the tree runs, as `serve` gives it. */
export type IdentityInput = Input;

const Who = Schema.Struct({ id: Schema.String });

const Model = Schema.Struct({
  ...Input.fields,
  rotateEvery: Schema.Finite,
  /** The tunnel's address, as the last Report said it; null while there is none. */
  url: Schema.NullOr(Schema.String),
  /** Sign-ins Connect Cloud refused in a row, since a Report was last taken. */
  refusals: Schema.Number,
});
type Model = typeof Model.Type;

const State = Schema.TaggedUnion({
  /** Signing in: `who` it was when signed in before, or null the first time. */
  SigningIn: { who: Schema.NullOr(Who) },
  SignedIn: { who: Who },
  /** It must stop, and why: forgotten, Outdated as Connect Cloud's `line` says, or stopped for a reason, null when it was asked to. */
  Ended: {
    why: Schema.TaggedUnion({
      Forgotten: {},
      Outdated: { line: Schema.String },
      Stopped: { reason: Schema.NullOr(Schema.String) },
    }),
  },
});
type State = typeof State.Type;

const Message = Schema.TaggedUnion({
  SignedIn: { who: Who },
  Addressed: { url: Schema.NullOr(Schema.String) },
  Reported: {},
  SignedOut: {},
  Forgotten: {},
  Outdated: { line: Schema.String },
  Stop: { reason: Schema.NullOr(Schema.String) },
});
type Message = typeof Message.Type;

type IdentitySelf = Self<Model, State, Message>;
type SigningInSelf = Self<
  Model,
  Extract<State, { readonly _tag: 'SigningIn' }>,
  Message
>;

/** Signs in, first or again, and tells it; a Sign-in that fails stops everything. */
const signIn = (self: SigningInSelf) =>
  Effect.gen(function* () {
    const account = yield* CloudAccount;
    const { model, state } = yield* self.get;
    if (state.who === null) {
      const who = yield* account.identify;
      return yield* self.send({ _tag: 'SignedIn', who: { id: who.id } });
    }
    const wait = backoffAfter(model.refusals, account.backoff);
    yield* Effect.logWarning(
      Duration.isZero(wait)
        ? 'The Sign-in was revoked: the Connection and its Plugins are stopped until you sign in again.'
        : `Connect Cloud refused the Sign-in again: signing in again in ${Duration.format(wait)}.`,
    );
    yield* Effect.sleep(wait);
    yield* account.signInAgain;
    yield* self.send({ _tag: 'SignedIn', who: state.who });
  }).pipe(
    Effect.catch((reason) => self.send({ _tag: 'Stop', reason })),
    // A Worker that dies only logs it: without this, `serve` would hang here,
    // holding its name, with nothing running.
    Effect.catchDefect((defect) =>
      self.send({
        _tag: 'Stop',
        reason: defect instanceof Error ? defect.message : String(defect),
      }),
    ),
  );

/** Reports for what runs below, keeping what the answer means for the login here. */
const reportFor =
  (self: IdentitySelf, account: CloudAccount['Service']) =>
  (...[status, key]: Parameters<CloudAccount['Service']['report']>) =>
    Effect.andThen(
      self.send({ _tag: 'Addressed', url: addressOf(status) }),
      Effect.flatMap(account.report(status, key), (answer) => {
        switch (answer._tag) {
          case 'Reported':
            return Effect.as(self.send({ _tag: 'Reported' }), answer.wanted);
          case 'Unsent':
            return Effect.as(
              Effect.logWarning(`Heartbeat not sent: ${answer.problem}`),
              null,
            );
          case 'Outdated':
            return Effect.as(
              self.send({ _tag: 'Outdated', line: answer.line }),
              null,
            );
          case 'Forgotten':
            return Effect.as(self.send({ _tag: 'Forgotten' }), null);
          case 'SignedOut':
            return Effect.as(self.send({ _tag: 'SignedOut' }), null);
          case 'Refused':
            return Effect.as(
              self.send({ _tag: 'Stop', reason: answer.reason }),
              null,
            );
        }
      }),
    );

/** Answers `status` and `stop` on the control socket `serve` holds, until the Worker stops. */
const answerLocal = (self: IdentitySelf) =>
  Effect.gen(function* () {
    const held = yield* Control;
    yield* held.answer({
      status: Effect.map(self.get, ({ model, state }) => ({
        name: model.name,
        id: state._tag === 'SignedIn' ? state.who.id : '',
        url: model.url,
      })),
      stop: self.send({ _tag: 'Stop', reason: null }),
    });
    return yield* Effect.never;
  }).pipe(Effect.scoped);

export const ActorIdentity = Actor.define('Identity', {
  requires: [CloudAccount, Control],
  input: Input,
  model: Model,
  state: State,
  message: Message,
}).build({
  init: (input: Input) => ({
    model: {
      ...input,
      rotateEvery: input.rotateEvery ?? ROTATE_EVERY,
      url: null,
      refusals: 0,
    },
    state: { _tag: 'SigningIn', who: null },
  }),
  provides: (self) =>
    Layer.effect(
      Cloud,
      Effect.map(CloudAccount, (account) =>
        Cloud.of({
          every: account.every,
          report: reportFor(self, account),
        }),
      ),
    ),
  on: {
    Forgotten: () => ({
      state: { _tag: 'Ended', why: { _tag: 'Forgotten' } },
    }),
    Outdated: ({ line }) => ({
      state: { _tag: 'Ended', why: { _tag: 'Outdated', line } },
    }),
    Stop: ({ reason }) => ({
      state: { _tag: 'Ended', why: { _tag: 'Stopped', reason } },
    }),
  },
  workers: {
    answerLocal: { run: answerLocal },
  },
  states: {
    SigningIn: {
      on: {
        SignedIn: ({ who }) => ({ state: { _tag: 'SignedIn', who } }),
      },
      workers: {
        signIn: { run: signIn },
      },
    },
    SignedIn: {
      on: {
        Addressed: ({ url }, { model }) =>
          url === model.url ? {} : { model: { ...model, url } },
        Reported: (_, { model }) =>
          model.refusals === 0 ? {} : { model: { ...model, refusals: 0 } },
        SignedOut: (_, { model, state }) => ({
          model: { ...model, url: null, refusals: model.refusals + 1 },
          state: { _tag: 'SigningIn', who: state.who },
        }),
      },
      children: {
        connection: Actor.child(ActorConnection, {
          input: ({ model }) => ({
            folders: model.folders,
            socketId: model.socketId,
            control: model.control,
            port: model.port,
            origins: model.origins,
            rotateEvery: model.rotateEvery,
          }),
          emits: {
            ServerFailed: ({ reason }) => ({ _tag: 'Stop', reason }),
          },
        }),
      },
    },
    Ended: {},
  },
});
