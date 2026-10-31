import { Clock, Duration, Effect, Fiber, Option, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import type { Self } from '@kestack/kabuki/core/actor';
import { TunnelStatus } from '../capabilities/index.js';
import { Tunnels } from './capabilities/index.js';

/*
 * One tunnel to the router's port, of one generation: its parent starts a
 * new generation to restart it. It gets cloudflared, Installing when that
 * takes a while, opens the tunnel and holds it Up until cloudflared stops
 * on its own. Either way it ends Lost: at once when it closed, five seconds
 * after when it could not open. Each change is told up through
 * TunnelStatus as it happens.
 */

/** How long to wait before opening a tunnel again after one failed to open. */
const REOPEN_AFTER = Duration.seconds(5);

/** How long getting cloudflared may take before the tunnel says it is Installing. */
const INSTALLING_AFTER = Duration.millis(500);

const Model = Schema.Struct({
  /** Which tunnel this is; a new one is a restart. */
  generation: Schema.Number,
});
type Model = typeof Model.Type;

const Props = Schema.Struct({
  /** The router's port, which the tunnel points at. */
  port: Schema.Finite,
});

const State = Schema.TaggedUnion({
  Opening: {},
  Installing: {},
  Up: { url: Schema.String },
  /** Closed, or never opened: why not, or null when it closed on its own. */
  Lost: { problem: Schema.NullOr(Schema.String) },
});
type State = typeof State.Type;

const Message = Schema.TaggedUnion({
  Installing: {},
  Installed: {},
  Opened: { url: Schema.String },
  OpenFailed: { problem: Schema.String },
  Closed: {},
});

type TunnelSelf = Self<Model, State, typeof Message.Type, typeof Props.Type>;

/** cloudflared, Installing while it downloads, when that takes a while. */
const install = (self: TunnelSelf) =>
  Effect.gen(function* () {
    const tunnels = yield* Tunnels;
    const status = yield* TunnelStatus;
    const { model } = yield* self.get;
    const getting = yield* Effect.forkScoped(tunnels.cloudflared);
    const quick = yield* Fiber.await(getting).pipe(
      Effect.timeoutOption(INSTALLING_AFTER),
    );
    if (Option.isSome(quick)) return yield* quick.value;
    yield* Effect.log('Downloading cloudflared');
    yield* self.send({ _tag: 'Installing' });
    yield* status.installing(model.generation);
    const binary = yield* Fiber.join(getting);
    yield* self.send({ _tag: 'Installed' });
    yield* status.opening(model.generation);
    return binary;
  });

/** Opens the tunnel and keeps it open until cloudflared stops, telling each change up at once. */
const keep = (self: TunnelSelf) =>
  Effect.gen(function* () {
    const tunnels = yield* Tunnels;
    const status = yield* TunnelStatus;
    const { model, props } = yield* self.get;
    const opened = yield* Effect.result(
      Effect.flatMap(install(self), (binary) =>
        tunnels.open(props.port, binary),
      ),
    );
    if (opened._tag === 'Failure') {
      yield* Effect.logWarning('Could not open a tunnel', opened.failure);
      const { failure } = opened;
      const problem =
        failure instanceof Error ? failure.message : String(failure);
      yield* self.send({ _tag: 'OpenFailed', problem });
      return yield* status.openFailed(
        model.generation,
        yield* Clock.currentTimeMillis,
        problem,
      );
    }
    const { url, closed } = opened.success;
    yield* Effect.log(`Tunnel at ${url}`);
    yield* self.send({ _tag: 'Opened', url });
    yield* status.up(model.generation, url);
    yield* closed;
    yield* Effect.logWarning('cloudflared stopped; restarting it');
    yield* self.send({ _tag: 'Closed' });
  }).pipe(Effect.scoped);

export const ActorTunnel = Actor.build(
  Actor.define('Tunnel', {
    requires: [Tunnels, TunnelStatus],
    input: Model,
    props: Props,
    model: Model,
    state: State,
    message: Message,
  }),
  {
    init: ({ generation }) => ({
      model: { generation },
      state: { _tag: 'Opening' },
    }),
    on: {
      Installing: () => ({ state: { _tag: 'Installing' } }),
      Installed: () => ({ state: { _tag: 'Opening' } }),
      Opened: ({ url }) => ({ state: { _tag: 'Up', url } }),
      OpenFailed: ({ problem }) => ({ state: { _tag: 'Lost', problem } }),
      Closed: () => ({ state: { _tag: 'Lost', problem: null } }),
    },
    workers: {
      keep: { run: keep },
    },
    states: {
      Opening: {},
      Installing: {},
      Up: {},
      Lost: {
        workers: {
          lost: {
            run: (self) =>
              Effect.gen(function* () {
                const status = yield* TunnelStatus;
                const { model, state } = yield* self.get;
                if (state.problem !== null) yield* Effect.sleep(REOPEN_AFTER);
                yield* status.lost(model.generation);
              }),
          },
        },
      },
    },
  },
);
