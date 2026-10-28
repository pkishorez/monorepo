import { Duration, Effect, Layer, Schedule, Schema, Stream } from 'effect';
import { Actor, type Self } from '@kestack/kabuki';
import { PluginState } from '@kestack/cli-platform/plugins';
import {
  addressOf,
  ConnectionStatus,
  TunnelCheck,
} from '../../../cloud/contract/index.js';
import { Connection } from '../capabilities/index.js';
import { ActorTunnel, Tunnels } from './actor-tunnel/index.js';
import { Cloud, TunnelStatus } from './capabilities/index.js';

/*
 * The Connection as Cloud Connect knows it. While SignedIn, a tunnel Child
 * points at the router's port once it listens, keyed by its generation, so
 * a new generation is a restarted tunnel; the beat Worker, on a fixed
 * interval, checks the tunnel, then Reports to Cloud Connect how the tunnel
 * and each Plugin stand. Each Report carries the Connection Status: the
 * tunnel Installing cloudflared, Opening, failed to open, or up and how its
 * last check went. A change the app waits on, a download begun or a tunnel
 * up or failed, is Reported at once, as the tunnel tells it. Three failed
 * checks in a row start a new generation.
 *
 * Cloud Connect answers a Report with the version of each Plugin to run,
 * which goes up to the Connection. A forgotten or refused Connection is told
 * up too, and ends it. A revoked Sign-in takes it to SigningIn, which
 * closes the tunnel until signed in again.
 *
 * A Cloud Connect that refuses Sign-in after Sign-in would have it sign in
 * and open a tunnel over and over: from the second refusal in a row it
 * waits before signing in again, twice as long each time, up to a minute.
 * A Report taken ends the run.
 */

/** Failed Tunnel Checks in a row before the tunnel is restarted. */
const FAILURES_BEFORE_RESTART = 3;

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

const Props = Schema.Struct({
  /** The router's port; null until it listens. */
  port: Schema.NullOr(Schema.Finite),
  /** Where each Plugin stands, as it last reported. */
  plugins: Schema.Record(Schema.String, PluginState.schema),
});

const Model = Schema.Struct({
  /** Which tunnel this is; a new one is a restart. */
  generation: Schema.Number,
  status: ConnectionStatus.schema,
  /** Failed Tunnel Checks in a row. */
  failures: Schema.Number,
  /** Sign-ins Cloud Connect refused in a row, since a Report was last taken. */
  refusals: Schema.Number,
});
type Model = typeof Model.Type;

const State = Schema.TaggedUnion({
  SignedIn: {},
  SigningIn: {},
});
type State = typeof State.Type;

const Message = Schema.TaggedUnion({
  Installing: { generation: Schema.Number },
  Opening: { generation: Schema.Number },
  OpenFailed: {
    generation: Schema.Number,
    at: Schema.Number,
    problem: Schema.String,
  },
  TunnelUp: { generation: Schema.Number, url: Schema.String },
  TunnelLost: { generation: Schema.Number },
  Checked: { generation: Schema.Number, check: TunnelCheck.schema },
  Reported: {},
  SignedOut: {},
  SignedIn: {},
});
type Message = typeof Message.Type;

type OnlineSelf = Self<Model, State, Message, typeof Props.Type>;

/** A new tunnel generation, with no address yet. */
const restarted = (model: Model): Model => ({
  ...model,
  generation: model.generation + 1,
  status: { _tag: 'Opening' },
  failures: 0,
});

/** The status of a tunnel at `url` that `check` found reachable or not. */
const checked = (url: string, check: TunnelCheck): ConnectionStatus =>
  check.ok
    ? { _tag: 'Reachable', url, at: check.at }
    : {
        _tag: 'Unreachable',
        url,
        at: check.at,
        problem: check.problem ?? 'Unknown',
      };

/** Sends a Report of how things stand now, and acts on the answer. */
const report = (self: OnlineSelf) =>
  Effect.gen(function* () {
    const cloud = yield* Cloud;
    const connection = yield* Connection;
    const { model, props } = yield* self.get;
    const answer = yield* cloud.report({
      status: model.status,
      plugins: props.plugins,
    });
    switch (answer._tag) {
      case 'Reported':
        yield* self.send({ _tag: 'Reported' });
        return yield* connection.wanted(answer.wanted);
      case 'Unsent':
        return yield* Effect.logWarning(
          `Heartbeat not sent: ${answer.problem}`,
        );
      case 'Forgotten':
        return yield* connection.forgotten;
      case 'SignedOut':
        return yield* self.send({ _tag: 'SignedOut' });
      case 'Refused':
        return yield* connection.stop(answer.reason);
    }
  });

/** One beat: check the tunnel if there is one, then Report. */
const beat = (self: OnlineSelf) =>
  Effect.gen(function* () {
    const tunnels = yield* Tunnels;
    const { model } = yield* self.get;
    const url = addressOf(model.status);
    if (url !== null) {
      const check = yield* tunnels.check(url);
      if (!check.ok)
        yield* Effect.logWarning(
          `Tunnel check ${model.failures + 1}/${FAILURES_BEFORE_RESTART} failed: ${check.problem}`,
        );
      yield* self.send({
        _tag: 'Checked',
        generation: model.generation,
        check,
      });
      const after = yield* self.get;
      if (after.model.generation !== model.generation)
        yield* Effect.logWarning(
          'The tunnel is broken; restarting cloudflared',
        );
    }
    yield* report(self);
  });

/** Tells the Connection the tunnel's address each time it changes. */
const address = (self: OnlineSelf) =>
  Effect.flatMap(Connection, (connection) =>
    self.changes.pipe(
      Stream.map(({ model }) => addressOf(model.status)),
      Stream.changes,
      Stream.runForEach(connection.address),
    ),
  );

/** The model with `generation`'s tunnel at `status`; unchanged for a tunnel already replaced. */
const ofTunnel = (
  model: Model,
  generation: number,
  status: ConnectionStatus,
  failures = model.failures,
) =>
  generation === model.generation
    ? { model: { ...model, status, failures } }
    : {};

export const ActorOnline = Actor.build(
  Actor.define('Online', {
    requires: [Cloud, Tunnels, Connection],
    props: Props,
    model: Model,
    state: State,
    message: Message,
  }),
  {
    init: () => ({
      model: {
        generation: 0,
        status: { _tag: 'Opening' },
        failures: 0,
        refusals: 0,
      },
      state: { _tag: 'SignedIn' },
    }),
    // The tunnel's word is Reported at once, but for losing it, which the
    // next beat Reports with the new tunnel Opening.
    provides: (self) =>
      Layer.effect(
        TunnelStatus,
        Effect.map(Effect.context<Cloud | Connection>(), (context) => {
          const told = (message: Message) =>
            self
              .send(message)
              .pipe(
                Effect.andThen(report(self)),
                Effect.provideContext(context),
              );
          return TunnelStatus.of({
            installing: (generation) =>
              told({ _tag: 'Installing', generation }),
            opening: (generation) => told({ _tag: 'Opening', generation }),
            openFailed: (generation, at, problem) =>
              told({ _tag: 'OpenFailed', generation, at, problem }),
            up: (generation, url) =>
              told({ _tag: 'TunnelUp', generation, url }),
            lost: (generation) => self.send({ _tag: 'TunnelLost', generation }),
          });
        }),
      ),
    workers: {
      address: { run: address },
    },
    state: {
      SignedIn: {
        children: {
          tunnel: {
            actor: ActorTunnel,
            while: ({ props }) => props.port !== null,
            key: ({ model }) => String(model.generation),
            input: ({ model }) => ({ generation: model.generation }),
            props: ({ props }) => ({ port: props.port ?? 0 }),
          },
        },
        on: {
          Installing: ({ generation }, { model }) =>
            ofTunnel(model, generation, { _tag: 'Installing' }),
          Opening: ({ generation }, { model }) =>
            ofTunnel(model, generation, { _tag: 'Opening' }),
          OpenFailed: ({ generation, at, problem }, { model }) =>
            ofTunnel(model, generation, { _tag: 'OpenFailed', at, problem }),
          TunnelUp: ({ generation, url }, { model }) =>
            ofTunnel(model, generation, { _tag: 'Unchecked', url }, 0),
          TunnelLost: ({ generation }, { model }) =>
            generation === model.generation ? { model: restarted(model) } : {},
          Checked: ({ generation, check }, { model }) => {
            const url = addressOf(model.status);
            if (generation !== model.generation || url === null) return {};
            const failures = check.ok ? 0 : model.failures + 1;
            return {
              model:
                failures >= FAILURES_BEFORE_RESTART
                  ? restarted(model)
                  : { ...model, failures, status: checked(url, check) },
            };
          },
          Reported: (_, { model }) => ({ model: { ...model, refusals: 0 } }),
          SignedOut: (_, { model }) => ({
            model: { ...restarted(model), refusals: model.refusals + 1 },
            state: { _tag: 'SigningIn' },
          }),
        },
        workers: {
          beat: {
            run: (self) =>
              Effect.flatMap(Cloud, ({ every }) =>
                Effect.repeat(beat(self), Schedule.spaced(every)),
              ),
          },
        },
      },
      SigningIn: {
        on: {
          SignedIn: () => ({ state: { _tag: 'SignedIn' } }),
        },
        workers: {
          signIn: {
            run: (self) =>
              Effect.gen(function* () {
                const cloud = yield* Cloud;
                const connection = yield* Connection;
                const { model } = yield* self.get;
                const wait = backoffAfter(model.refusals, cloud.backoff);
                yield* Effect.logWarning(
                  Duration.isZero(wait)
                    ? 'The Sign-in was revoked: the tunnel is closed until you sign in again.'
                    : `Cloud Connect refused the Sign-in again: signing in again in ${Duration.format(wait)}.`,
                );
                yield* Effect.sleep(wait);
                yield* cloud.signInAgain.pipe(
                  Effect.andThen(self.send({ _tag: 'SignedIn' })),
                  Effect.catch(connection.stop),
                );
              }),
          },
        },
      },
    },
  },
);
