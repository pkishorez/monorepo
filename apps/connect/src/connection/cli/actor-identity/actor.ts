import { Duration, Effect, Layer, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki/core/actor';
import { Release } from '../../../contract/index.js';
import { ActorConnection, remembered } from './actor-connection/index.js';
import { Cloud, CloudAccount, Identity } from './capabilities/index.js';

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
 * Outdated Connection ends the program, and so does a Sign-in that fails.
 *
 * A Connect Cloud that refuses Sign-in after Sign-in would have it sign in
 * over and over: from the second refusal in a row it waits before signing in
 * again, twice as long each time, up to a minute. A Report taken ends the run.
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

/** Why an Outdated Connection stops, and what to do. */
const outdatedReason = (version: string, minConnect: string) =>
  `ke-connect ${version} is older than Connect Cloud accepts (${minConnect}): run \`npm i -g @kestack/connect@latest\`, then serve again.`;

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
});
type Input = typeof Input.Type;

/** Where the tree runs, as `serve` gives it. */
export type IdentityInput = Input;

const Who = Schema.Struct({ id: Schema.String, key: Schema.String });

const Model = Schema.Struct({
  ...Input.fields,
  /** Who the Connection is; null until first signed in. */
  who: Schema.NullOr(Who),
  /** The Release of each Plugin it last wanted, read as it signs in. */
  lastWanted: Schema.Record(Schema.String, Release),
  /** Sign-ins Connect Cloud refused in a row, since a Report was last taken. */
  refusals: Schema.Number,
});
type Model = typeof Model.Type;

const State = Schema.TaggedUnion({
  SigningIn: {},
  SignedIn: {},
  Forgotten: {},
  /** It must stop: why, or null when it was asked to. */
  Stopped: { reason: Schema.NullOr(Schema.String) },
});
type State = typeof State.Type;

const Message = Schema.TaggedUnion({
  SignedIn: {
    who: Who,
    lastWanted: Schema.Record(Schema.String, Release),
  },
  Reported: {},
  SignedOut: {},
  Forgotten: {},
  Stop: { reason: Schema.NullOr(Schema.String) },
});
type Message = typeof Message.Type;

type IdentitySelf = Self<Model, State, Message>;

/** Signs in, first or again, and tells it; a Sign-in that fails stops everything. */
const signIn = (self: IdentitySelf) =>
  Effect.gen(function* () {
    const account = yield* CloudAccount;
    const { model } = yield* self.get;
    const first = model.who === null;
    if (!first) {
      const wait = backoffAfter(model.refusals, account.backoff);
      yield* Effect.logWarning(
        Duration.isZero(wait)
          ? 'The Sign-in was revoked: the Connection and its Plugins are stopped until you sign in again.'
          : `Connect Cloud refused the Sign-in again: signing in again in ${Duration.format(wait)}.`,
      );
      yield* Effect.sleep(wait);
    }
    const who = yield* first
      ? account.identify
      : Effect.as(account.signInAgain, model.who!);
    yield* self.send({
      _tag: 'SignedIn',
      who,
      lastWanted: yield* remembered(model.folders.data),
    });
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
  (status: Parameters<CloudAccount['Service']['report']>[0]) =>
    Effect.flatMap(account.report(status), (answer) => {
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
            self.send({
              _tag: 'Stop',
              reason: outdatedReason(answer.version, answer.minConnect),
            }),
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
    });

export const ActorIdentity = Actor.define('Identity', {
  requires: [CloudAccount],
  input: Input,
  model: Model,
  state: State,
  message: Message,
}).build({
  init: (input: Input) => ({
    model: { ...input, who: null, lastWanted: {}, refusals: 0 },
    state: { _tag: 'SigningIn' },
  }),
  provides: (self) =>
    Layer.mergeAll(
      Layer.succeed(
        Identity,
        Identity.of({ stop: (reason) => self.send({ _tag: 'Stop', reason }) }),
      ),
      Layer.effect(
        Cloud,
        Effect.map(CloudAccount, (account) =>
          Cloud.of({
            every: account.every,
            report: reportFor(self, account),
          }),
        ),
      ),
    ),
  on: {
    Forgotten: () => ({ state: { _tag: 'Forgotten' } }),
    Stop: ({ reason }) => ({ state: { _tag: 'Stopped', reason } }),
  },
  states: {
    SigningIn: {
      on: {
        SignedIn: ({ who, lastWanted }, { model }) => ({
          model: { ...model, who, lastWanted },
          state: { _tag: 'SignedIn' },
        }),
      },
      workers: {
        signIn: { run: signIn },
      },
    },
    SignedIn: {
      on: {
        Reported: (_, { model }) =>
          model.refusals === 0 ? {} : { model: { ...model, refusals: 0 } },
        SignedOut: (_, { model }) => ({
          model: { ...model, refusals: model.refusals + 1 },
          state: { _tag: 'SigningIn' },
        }),
      },
      children: {
        connection: Actor.child(ActorConnection, {
          input: ({ model }) => ({
            id: model.who!.id,
            key: model.who!.key,
            name: model.name,
            folders: model.folders,
            socketId: model.socketId,
            control: model.control,
            port: model.port,
            origins: model.origins,
            lastWanted: model.lastWanted,
          }),
        }),
      },
    },
    Forgotten: {},
    Stopped: {},
  },
});
