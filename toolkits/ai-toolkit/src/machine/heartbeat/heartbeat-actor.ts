import { Duration, Effect, Schedule, Schema } from 'effect';
import { Actor, type Self } from '@kestack/kabuki';
import { TunnelCheck } from '../../machines/contract/index.js';
import { HeartbeatHost } from './host.js';

/*
 * The Heartbeat as an Actor. While Online, one Worker keeps a tunnel open,
 * keyed by its generation, so a new generation is a restarted tunnel; another
 * beats on a fixed interval: it checks the tunnel, then Reports to the
 * Backend. Three failed checks in a row start a new generation. A revoked
 * Sign-in takes it to SigningIn, which closes the tunnel until signed in
 * again; a forgotten or refused Machine ends it.
 */

/** Failed Tunnel Checks in a row before the tunnel is restarted. */
export const FAILURES_BEFORE_RESTART = 3;

/** How long to wait before opening a tunnel again after one failed to open. */
const REOPEN_AFTER = Duration.seconds(5);

const Model = Schema.Struct({
  /** Which tunnel this is; a new one is a restart. */
  generation: Schema.Number,
  url: Schema.NullOr(Schema.String),
  /** Failed Tunnel Checks in a row. */
  failures: Schema.Number,
  tunnel: Schema.NullOr(TunnelCheck),
});
type Model = typeof Model.Type;

const State = Schema.TaggedUnion({
  Online: {},
  SigningIn: {},
  Forgotten: {},
  Stopped: { reason: Schema.String },
});
type State = typeof State.Type;

const Message = Schema.TaggedUnion({
  TunnelUp: { generation: Schema.Number, url: Schema.String },
  TunnelLost: { generation: Schema.Number },
  Checked: { generation: Schema.Number, check: TunnelCheck },
  SignedOut: {},
  SignedIn: {},
  Forgotten: {},
  Stop: { reason: Schema.String },
});

type HeartbeatSelf = Self<Model, State, typeof Message.Type>;

/** A new tunnel generation, with no address yet. */
const restarted = (model: Model): Model => ({
  generation: model.generation + 1,
  url: null,
  failures: 0,
  tunnel: null,
});

/** Sends a Report of how things stand now, and acts on the answer. */
const report = (self: HeartbeatSelf) =>
  Effect.gen(function* () {
    const host = yield* HeartbeatHost;
    const { model } = yield* self.get;
    const answer = yield* host.report({ url: model.url, tunnel: model.tunnel });
    switch (answer._tag) {
      case 'Reported':
        return;
      case 'Unsent':
        return yield* Effect.logWarning(
          `Heartbeat not sent: ${answer.problem}`,
        );
      case 'Forgotten':
        return yield* self.send({ _tag: 'Forgotten' });
      case 'SignedOut':
        return yield* self.send({ _tag: 'SignedOut' });
      case 'Refused':
        return yield* self.send({ _tag: 'Stop', reason: answer.reason });
    }
  });

/** One beat: check the tunnel if there is one, then Report. */
const beat = (self: HeartbeatSelf) =>
  Effect.gen(function* () {
    const host = yield* HeartbeatHost;
    const { model } = yield* self.get;
    if (model.url !== null) {
      const check = yield* host.check(model.url);
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

/** Keeps the tunnel of one generation open, and Reports its new address at once. */
const keepTunnel = (self: HeartbeatSelf, generation: number) =>
  Effect.gen(function* () {
    const host = yield* HeartbeatHost;
    const opened = yield* Effect.result(host.open);
    if (opened._tag === 'Failure') {
      yield* Effect.logWarning('Could not open a tunnel', opened.failure);
      yield* Effect.sleep(REOPEN_AFTER);
      return yield* self.send({ _tag: 'TunnelLost', generation });
    }
    const { url, closed } = opened.success;
    yield* Effect.log(`Tunnel at ${url}`);
    yield* self.send({ _tag: 'TunnelUp', generation, url });
    yield* report(self);
    yield* closed;
    yield* Effect.logWarning('cloudflared stopped; restarting it');
    yield* self.send({ _tag: 'TunnelLost', generation });
  }).pipe(Effect.scoped);

export const Heartbeat = Actor.build(
  Actor.define('Heartbeat', {
    requires: [HeartbeatHost],
    model: Model,
    state: State,
    message: Message,
  }),
  {
    init: () => ({
      model: { generation: 0, url: null, failures: 0, tunnel: null },
      state: { _tag: 'Online' },
    }),
    on: {
      Forgotten: () => ({ state: { _tag: 'Forgotten' } }),
      Stop: ({ reason }) => ({ state: { _tag: 'Stopped', reason } }),
    },
    state: {
      Online: {
        on: {
          TunnelUp: ({ generation, url }, { model }) =>
            generation === model.generation
              ? { model: { ...model, url, failures: 0, tunnel: null } }
              : {},
          TunnelLost: ({ generation }, { model }) =>
            generation === model.generation ? { model: restarted(model) } : {},
          Checked: ({ generation, check }, { model }) => {
            if (generation !== model.generation) return {};
            const failures = check.ok ? 0 : model.failures + 1;
            return {
              model:
                failures >= FAILURES_BEFORE_RESTART
                  ? restarted(model)
                  : { ...model, failures, tunnel: check },
            };
          },
          SignedOut: (_, { model }) => ({
            model: restarted(model),
            state: { _tag: 'SigningIn' },
          }),
        },
        workers: {
          tunnel: {
            each: ({ model }) => [String(model.generation)],
            run: (self, key) => keepTunnel(self, Number(key)),
          },
          beat: {
            run: (self) =>
              Effect.flatMap(HeartbeatHost, ({ every }) =>
                Effect.repeat(beat(self), Schedule.spaced(every)),
              ),
          },
        },
      },
      SigningIn: {
        on: {
          SignedIn: () => ({ state: { _tag: 'Online' } }),
        },
        workers: {
          signIn: {
            run: (self) =>
              Effect.gen(function* () {
                const host = yield* HeartbeatHost;
                yield* Effect.logWarning(
                  'The Sign-in was revoked: the tunnel is closed until you sign in again.',
                );
                yield* host.signInAgain.pipe(
                  Effect.andThen(self.send({ _tag: 'SignedIn' })),
                  Effect.catch((reason) => self.send({ _tag: 'Stop', reason })),
                );
              }),
          },
        },
      },
      Forgotten: {},
      Stopped: {},
    },
  },
);
