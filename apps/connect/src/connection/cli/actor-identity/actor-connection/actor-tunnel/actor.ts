import {
  Clock,
  Duration,
  Effect,
  Fiber,
  Option,
  Schedule,
  Schema,
  Stream,
} from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki/core/actor';
import {
  addressOf,
  type ConnectionStatus,
  TunnelCheck,
} from '../../../../../contract/index.js';
import { Cloud } from '../../capabilities/index.js';
import { Connection } from '../capabilities/index.js';
import { Tunnels } from './capabilities/index.js';

/*
 * The door to the street, and how Connect Cloud knows where it stands. Its
 * State is the Connection Status, the very value a Report carries: getting
 * cloudflared (Installing), Opening, failed to open, or up at an address and
 * how its last check went.
 *
 * The keep Worker holds one tunnel, of one generation: it gets cloudflared,
 * opens the tunnel, and holds it until cloudflared stops or it could not open.
 * Either way it asks for a new generation, which closes the old one and opens
 * another, as three failed checks in a row do too. A word from a tunnel
 * already replaced is dropped by its generation.
 *
 * Connect Cloud hears from it two ways: the beat Worker, on a fixed interval,
 * checks the tunnel, then Reports; and a change the app waits on, a download
 * begun or a tunnel opening, up or failed, is Reported at once. What Connect
 * Cloud answers goes up to the Connection.
 */

/** Failed Tunnel Checks in a row before the tunnel is restarted. */
const FAILURES_BEFORE_RESTART = 3;

/** How long to wait before opening a tunnel again after one failed to open. */
const REOPEN_AFTER = Duration.seconds(5);

/** How long getting cloudflared may take before the tunnel says it is Installing. */
const INSTALLING_AFTER = Duration.millis(500);

const Input = Schema.Struct({
  /** The router's port, which the tunnel points at. */
  port: Schema.Finite,
});

const Model = Schema.Struct({
  ...Input.fields,
  /** Which tunnel this is; a new one closes the last. */
  generation: Schema.Number,
  /** Failed Tunnel Checks in a row. */
  failures: Schema.Number,
});
type Model = typeof Model.Type;

const State = Schema.TaggedUnion({
  /** Downloading cloudflared, once per computer. */
  Installing: {},
  /** cloudflared is starting and connecting to Cloudflare. */
  Opening: {},
  /** The tunnel could not open; another is tried shortly. */
  OpenFailed: { at: Schema.Finite, problem: Schema.String },
  /** Up at `url`, not checked yet. */
  Unchecked: { url: Schema.String },
  /** Up at `url`, and the last Tunnel Check reached it. */
  Reachable: { url: Schema.String, at: Schema.Finite },
  /** Up at `url`, but the last Tunnel Check did not reach it. */
  Unreachable: {
    url: Schema.String,
    at: Schema.Finite,
    problem: Schema.String,
  },
});
type State = ConnectionStatus;

const Message = Schema.TaggedUnion({
  Installing: { generation: Schema.Number },
  Opening: { generation: Schema.Number },
  OpenFailed: {
    generation: Schema.Number,
    at: Schema.Finite,
    problem: Schema.String,
  },
  Up: { generation: Schema.Number, url: Schema.String },
  Lost: { generation: Schema.Number },
  Checked: { generation: Schema.Number, check: TunnelCheck.schema },
});

type TunnelSelf = Self<Model, State, typeof Message.Type>;

/** cloudflared, Installing while it downloads, when that takes a while. */
const install = (self: TunnelSelf, generation: number) =>
  Effect.gen(function* () {
    const tunnels = yield* Tunnels;
    const getting = yield* Effect.forkScoped(tunnels.cloudflared);
    const quick = yield* Fiber.await(getting).pipe(
      Effect.timeoutOption(INSTALLING_AFTER),
    );
    if (Option.isSome(quick)) return yield* quick.value;
    yield* Effect.log('Downloading cloudflared');
    yield* self.send({ _tag: 'Installing', generation });
    const binary = yield* Fiber.join(getting);
    yield* self.send({ _tag: 'Opening', generation });
    return binary;
  });

/** Holds the tunnel of `generation` until it closes or could not open, then asks for the next. */
const keep = (self: TunnelSelf, generation: number) =>
  Effect.gen(function* () {
    const tunnels = yield* Tunnels;
    const { model } = yield* self.get;
    const opened = yield* Effect.result(
      Effect.flatMap(install(self, generation), (binary) =>
        tunnels.open(model.port, binary),
      ),
    );
    if (opened._tag === 'Failure') {
      yield* Effect.logWarning('Could not open a tunnel', opened.failure);
      const { failure } = opened;
      yield* self.send({
        _tag: 'OpenFailed',
        generation,
        at: yield* Clock.currentTimeMillis,
        problem: failure instanceof Error ? failure.message : String(failure),
      });
      yield* Effect.sleep(REOPEN_AFTER);
      return yield* self.send({ _tag: 'Lost', generation });
    }
    const { url, closed } = opened.success;
    yield* Effect.log(`Tunnel at ${url}`);
    yield* self.send({ _tag: 'Up', generation, url });
    yield* closed;
    yield* Effect.logWarning('cloudflared stopped; restarting it');
    yield* self.send({ _tag: 'Lost', generation });
  }).pipe(Effect.scoped);

/** Tells Connect Cloud where the tunnel stands now, and hands up what it answers. */
const report = (self: TunnelSelf) =>
  Effect.gen(function* () {
    const cloud = yield* Cloud;
    const connection = yield* Connection;
    const { state } = yield* self.get;
    const wanted = yield* cloud.report(state);
    if (wanted !== null) yield* connection.wanted(wanted);
  });

/** One beat: check the tunnel if there is one, then Report. */
const beat = (self: TunnelSelf) =>
  Effect.gen(function* () {
    const tunnels = yield* Tunnels;
    const { model, state } = yield* self.get;
    const url = addressOf(state);
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

/** Reports each change the app waits on as it happens; what a check found waits for its beat. */
const told = (self: TunnelSelf) =>
  self.changes.pipe(
    // `changes` starts with the state now, which the first beat Reports.
    Stream.drop(1),
    Stream.map(({ state }) => state),
    Stream.filter(({ _tag }) => _tag !== 'Reachable' && _tag !== 'Unreachable'),
    Stream.changesWith(
      (a, b) => a._tag === b._tag && addressOf(a) === addressOf(b),
    ),
    Stream.runForEach(() => report(self)),
  );

/** Tells the Connection the tunnel's address each time it changes. */
const address = (self: TunnelSelf) =>
  Effect.flatMap(Connection, (connection) =>
    self.changes.pipe(
      Stream.map(({ state }) => addressOf(state)),
      Stream.changes,
      Stream.runForEach(connection.address),
    ),
  );

/** The next generation: the last tunnel closes, and another opens. */
const restarted = (model: Model) => ({
  model: { ...model, generation: model.generation + 1, failures: 0 },
  state: { _tag: 'Opening' } as const,
});

/** `then`, for a word from the tunnel that is current; a word from one already replaced changes nothing. */
const ofTunnel = <A>(model: Model, generation: number, then: () => A) =>
  generation === model.generation ? then() : {};

export const ActorTunnel = Actor.define('Tunnel', {
  requires: [Cloud, Connection, Tunnels],
  input: Input,
  model: Model,
  state: State,
  message: Message,
}).build({
  init: ({ port }) => ({
    model: { port, generation: 0, failures: 0 },
    state: { _tag: 'Opening' },
  }),
  on: {
    Installing: ({ generation }, { model }) =>
      ofTunnel(model, generation, () => ({
        state: { _tag: 'Installing' } as const,
      })),
    Opening: ({ generation }, { model }) =>
      ofTunnel(model, generation, () => ({
        state: { _tag: 'Opening' } as const,
      })),
    OpenFailed: ({ generation, at, problem }, { model }) =>
      ofTunnel(model, generation, () => ({
        state: { _tag: 'OpenFailed', at, problem } as const,
      })),
    Up: ({ generation, url }, { model }) =>
      ofTunnel(model, generation, () => ({
        model: { ...model, failures: 0 },
        state: { _tag: 'Unchecked', url } as const,
      })),
    Lost: ({ generation }, { model }) =>
      ofTunnel(model, generation, () => restarted(model)),
    Checked: ({ generation, check }, { model, state }) => {
      const url = addressOf(state);
      if (generation !== model.generation || url === null) return {};
      const failures = check.ok ? 0 : model.failures + 1;
      if (failures >= FAILURES_BEFORE_RESTART) return restarted(model);
      return {
        model: { ...model, failures },
        state: check.ok
          ? ({ _tag: 'Reachable', url, at: check.at } as const)
          : ({
              _tag: 'Unreachable',
              url,
              at: check.at,
              problem: check.problem ?? 'Unknown',
            } as const),
      };
    },
  },
  workers: {
    keep: {
      each: ({ model }) => [String(model.generation)],
      run: (self, generation) => keep(self, Number(generation)),
    },
    beat: {
      run: (self) =>
        Effect.flatMap(Cloud, ({ every }) =>
          Effect.repeat(beat(self), Schedule.spaced(every)),
        ),
    },
    told: { run: told },
    address: { run: address },
  },
  states: {
    Installing: {},
    Opening: {},
    OpenFailed: {},
    Unchecked: {},
    Reachable: {},
    Unreachable: {},
  },
});
