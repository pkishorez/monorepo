import {
  Clock,
  Duration,
  Effect,
  Fiber,
  Option,
  Schema,
  Semaphore,
  Stream,
} from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki/core/actor';
import {
  CheckResult,
  type ConnectionStatus,
  Release,
  SetupStep,
  TunnelCheck,
} from '../../../../../contract/index.js';
import { Cloud } from '../../capabilities/index.js';
import { Tunnels } from './capabilities/index.js';

/*
 * The door to the street, and how Connect Cloud knows where it stands. Its
 * State is the Connection Status, the very value a Report carries: SettingUp,
 * at a step, or Ready, at an address, with how its last check went.
 *
 * The tunnel Worker holds one tunnel, of one generation: it gets cloudflared,
 * opens the tunnel, and holds it until cloudflared stops or it could not open.
 * Either way it asks for a new generation, which closes the old one and opens
 * another, as three failed checks in a row do too. It belongs to no State, as
 * it holds what it opened across both. A word from a tunnel already replaced
 * is dropped by its generation.
 *
 * Connect Cloud hears from it two ways, one for each State, so each can do its
 * own: reportSetup at once, on each change of step or key, and every
 * `Cloud.every` since the last; heartbeat at once, on each change of key, and
 * every `Cloud.every` after checking the tunnel. A Worker of a State lives as
 * long as that State's tag, so neither starts over on a step, a check or a key.
 *
 * What Connect Cloud answers, when it does, is Emitted as Wanted.
 */

/** Failed Tunnel Checks in a row before the tunnel is restarted. */
const FAILURES_BEFORE_RESTART = 3;

/** How long to wait before opening a tunnel again after one failed to open. */
const REOPEN_AFTER = Duration.seconds(5);

/** How long getting cloudflared may take before the tunnel says it is Downloading, so a cached one never does. */
const DOWNLOADING_AFTER = Duration.millis(500);

const Input = Schema.Struct({
  /** The server's port, which the tunnel points at. */
  port: Schema.Finite,
});

const Props = Schema.Struct({
  /** The Connection Key now, which every Report carries. */
  key: Schema.String,
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
  /** On its way, or failed to open and about to try again. */
  SettingUp: { step: SetupStep },
  /** Up at `url`. */
  Ready: { url: Schema.String, check: CheckResult },
});
type State = ConnectionStatus;

const Message = Schema.TaggedUnion({
  Downloading: {
    generation: Schema.Number,
    elapsed: Schema.Finite,
    received: Schema.Finite,
  },
  Opening: { generation: Schema.Number },
  Failed: {
    generation: Schema.Number,
    at: Schema.Finite,
    problem: Schema.String,
  },
  Up: { generation: Schema.Number, url: Schema.String },
  Lost: { generation: Schema.Number },
  Checked: { generation: Schema.Number, check: TunnelCheck.schema },
  /** Connect Cloud took a Report, and wants these Releases run. */
  Answered: { releases: Schema.Record(Schema.String, Release) },
});

type TunnelSelf = Self<Model, State, typeof Message.Type, typeof Props.Type>;
type ReadySelf = Self<
  Model,
  Extract<State, { readonly _tag: 'Ready' }>,
  typeof Message.Type,
  typeof Props.Type
>;

/** `bytes` and `ms` as a person reads them: `12.4 MB, 40s`. */
const progressOf = (bytes: number, ms: number) =>
  `${(bytes / 1_000_000).toFixed(1)} MB, ${Math.round(ms / 1_000)}s`;

/**
 * cloudflared. One that takes a while is Downloading: every `downloadEvery`,
 * for how long and how much has arrived. One waiting on another Connection's
 * download hears of no bytes, so only its time rises.
 */
const getCloudflared = (self: TunnelSelf, generation: number) =>
  Effect.gen(function* () {
    const tunnels = yield* Tunnels;
    const startedAt = yield* Clock.currentTimeMillis;
    let received = 0;
    const getting = yield* Effect.forkScoped(
      tunnels.cloudflared((bytes) =>
        Effect.sync(() => {
          received = bytes;
        }),
      ),
    );
    const quick = yield* Fiber.await(getting).pipe(
      Effect.timeoutOption(DOWNLOADING_AFTER),
    );
    if (Option.isSome(quick)) return yield* quick.value;
    const telling = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const elapsed = now - startedAt;
      yield* Effect.log(
        `Downloading cloudflared: ${progressOf(received, elapsed)}`,
      );
      yield* self.send({ _tag: 'Downloading', generation, elapsed, received });
    }).pipe(
      Effect.andThen(Effect.sleep(tunnels.downloadEvery)),
      Effect.forever,
    );
    // The race stops the telling first, so no word of it follows the outcome.
    const binary = yield* Effect.raceFirst(Fiber.join(getting), telling);
    yield* self.send({ _tag: 'Opening', generation });
    return binary;
  });

/** Holds the tunnel of `generation` until it closes or could not open, then asks for the next. */
const tunnel = (self: TunnelSelf, generation: number) =>
  Effect.gen(function* () {
    const tunnels = yield* Tunnels;
    const { model } = yield* self.get;
    const opened = yield* Effect.result(
      Effect.flatMap(getCloudflared(self, generation), (binary) =>
        tunnels.open(model.port, binary),
      ),
    );
    if (opened._tag === 'Failure') {
      yield* Effect.logWarning('Could not open a tunnel', opened.failure);
      const { failure } = opened;
      yield* self.send({
        _tag: 'Failed',
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

/** Tells Connect Cloud where the tunnel stands now, with the key, and Sends what it answers, if it took the Report. */
const report = (self: TunnelSelf) =>
  Effect.gen(function* () {
    const cloud = yield* Cloud;
    const { state, props } = yield* self.get;
    const releases = yield* cloud.report(state, props.key);
    if (releases !== null) yield* self.send({ _tag: 'Answered', releases });
  });

/**
 * Reports while SettingUp: at once, on each change of step or key, and every
 * `Cloud.every` since the last. Reports go one at a time, each saying how it
 * stands as it goes, so a slow Connect Cloud sees at most the one waiting.
 */
const reportSetup = (self: TunnelSelf) =>
  Effect.flatMap(Cloud, ({ every }) =>
    self.changes.pipe(
      Stream.map(({ state, props }) => JSON.stringify([state, props.key])),
      Stream.changes,
      Stream.switchMap(() => Stream.tick(every)),
      Stream.buffer({ capacity: 1, strategy: 'sliding' }),
      Stream.runForEach(() => report(self)),
    ),
  );

/**
 * Reports while Ready: at once with the address, on each change of key so
 * Connect Cloud learns it without waiting, and every `Cloud.every` after
 * checking the tunnel. A check may take seconds, so it never holds up a new
 * key; the Reports themselves go one at a time, so an older one cannot arrive
 * after a newer one.
 */
const heartbeat = (self: ReadySelf) =>
  Effect.gen(function* () {
    const { every } = yield* Cloud;
    const tunnels = yield* Tunnels;
    const oneAtATime = yield* Semaphore.make(1);
    const reported = oneAtATime.withPermit(report(self));
    const beat = Effect.gen(function* () {
      const { model, state } = yield* self.get;
      const check = yield* tunnels.check(state.url);
      if (!check.ok)
        yield* Effect.logWarning(
          `Tunnel check ${model.failures + 1}/${FAILURES_BEFORE_RESTART} failed: ${check.problem}`,
        );
      if (!check.ok && model.failures + 1 >= FAILURES_BEFORE_RESTART)
        yield* Effect.logWarning(
          'The tunnel is broken; restarting cloudflared',
        );
      yield* self.send({
        _tag: 'Checked',
        generation: model.generation,
        check,
      });
      yield* reported;
    });
    yield* Effect.all(
      [
        self.changes.pipe(
          Stream.map(({ props }) => props.key),
          Stream.changes,
          Stream.runForEach(() => reported),
        ),
        Effect.sleep(every).pipe(Effect.andThen(beat), Effect.forever),
      ],
      { concurrency: 'unbounded', discard: true },
    );
  });

/** The next generation: the last tunnel closes, and another opens. */
const restarted = (model: Model) => ({
  model: { ...model, generation: model.generation + 1, failures: 0 },
  state: { _tag: 'SettingUp', step: { _tag: 'Opening' } } as const,
});

/** `then`, for a word from the tunnel that is current; a word from one already replaced changes nothing. */
const ofTunnel = <A>(model: Model, generation: number, then: () => A) =>
  generation === model.generation ? then() : {};

/** Which step SettingUp is at, for a word from the tunnel that is current. */
const atStep = (model: Model, generation: number, step: SetupStep) =>
  ofTunnel(model, generation, () => ({
    state: { _tag: 'SettingUp', step } as const,
  }));

export const ActorTunnel = Actor.define('Tunnel', {
  requires: [Cloud, Tunnels],
  input: Input,
  props: Props,
  model: Model,
  state: State,
  message: Message,
  emits: {
    /** Connect Cloud wants these Releases run. */
    Wanted: { releases: Schema.Record(Schema.String, Release) },
  },
}).build({
  init: ({ port }) => ({
    model: { port, generation: 0, failures: 0 },
    state: { _tag: 'SettingUp', step: { _tag: 'Opening' } },
  }),
  on: {
    Lost: ({ generation }, { model }) =>
      ofTunnel(model, generation, () => restarted(model)),
    Answered: ({ releases }) => ({ emit: { _tag: 'Wanted', releases } }),
  },
  workers: {
    tunnel: {
      each: ({ model }) => [String(model.generation)],
      run: (self, generation) => tunnel(self, Number(generation)),
    },
  },
  states: {
    SettingUp: {
      on: {
        Downloading: ({ generation, elapsed, received }, { model }) =>
          atStep(model, generation, {
            _tag: 'Downloading',
            elapsed,
            received,
          }),
        Opening: ({ generation }, { model }) =>
          atStep(model, generation, { _tag: 'Opening' }),
        Failed: ({ generation, at, problem }, { model }) =>
          atStep(model, generation, { _tag: 'Failed', at, problem }),
        Up: ({ generation, url }, { model }) =>
          ofTunnel(model, generation, () => ({
            model: { ...model, failures: 0 },
            state: {
              _tag: 'Ready',
              url,
              check: { _tag: 'Unchecked' },
            } as const,
          })),
      },
      workers: { reportSetup: { run: reportSetup } },
    },
    Ready: {
      on: {
        Checked: ({ generation, check }, { model, state }) => {
          if (generation !== model.generation) return {};
          const failures = check.ok ? 0 : model.failures + 1;
          if (failures >= FAILURES_BEFORE_RESTART) return restarted(model);
          return {
            model: { ...model, failures },
            state: {
              ...state,
              check: check.ok
                ? ({ _tag: 'Reachable', at: check.at } as const)
                : ({
                    _tag: 'Unreachable',
                    at: check.at,
                    problem: check.problem ?? 'Unknown',
                  } as const),
            },
          };
        },
      },
      workers: { heartbeat: { run: heartbeat } },
    },
  },
});
