import { Effect, Layer, Option, Stream } from 'effect';
import { History, Runtime } from '@kestack/kabuki';
import { Downloads } from '@kestack/cli-platform/files';
import { ActorConnection, type ConnectionInput } from './actor.js';
import { Control } from './control.js';
import { remembered } from './remember.js';
import {
  Cloud,
  cloud,
  type CloudOptions,
  CLOUDFLARED_KEY,
  Tunnels,
  tunnels,
} from './actor-online/index.js';

/*
 * Running a signed-in Connection: its Actor tree, standing on Cloud, built
 * from Cloud Connect's client, and Tunnels, from cloudflared, until it
 * ends, Forgotten or Stopped. First, the shared cache drops each download
 * no Connection has used for 30 days, keeping cloudflared, which the
 * tunnel runs at once; a running Plugin marks its file used every day, so
 * no file in use goes. Then it reads the Releases the Connection last
 * wanted, so its Plugins start at them while Cloud Connect cannot be
 * reached.
 */

/** A download unused for this long is deleted when a Connection starts. */
const UNUSED = '30 days';

/** Deletes the downloads no Connection used for 30 days, keeping cloudflared; a failure is only logged. */
const prune = (downloads: Layer.Layer<Downloads>) =>
  Effect.flatMap(Downloads, (each) =>
    each.prune({ olderThan: UNUSED, keep: [CLOUDFLARED_KEY] }),
  ).pipe(
    Effect.flatMap((removed) =>
      removed.length === 0
        ? Effect.void
        : Effect.log(
            `Deleted downloads unused for ${UNUSED}: ${removed.join(', ')}`,
          ),
    ),
    Effect.catch((error) =>
      Effect.logWarning('Could not prune the downloads', error),
    ),
    Effect.provide(downloads),
  );

export interface RunOptions {
  /** Who the Connection is: the root's Input, but for what it last wanted, which is read here. */
  readonly input: Omit<ConnectionInput, 'lastWanted'>;
  /** Cloud Connect, signed in as the Connection's User. */
  readonly cloud: CloudOptions;
  /** The control socket `serve` holds, for the Connection to answer on. */
  readonly control: Control['Service'];
}

/** Runs the Connection until it ends, for as long as the Scope: how it ended. */
export const run = (options: RunOptions) =>
  Effect.gen(function* () {
    const downloads = Downloads.layer(options.input.folders.cache);
    yield* prune(downloads);
    const input: ConnectionInput = {
      ...options.input,
      lastWanted: yield* remembered(options.input.folders.data),
    };
    const running = yield* Runtime.start(
      History.make(ActorConnection, { window: 0, input }),
      Layer.mergeAll(
        Layer.succeed(Cloud, Cloud.of(cloud(options.cloud))),
        Layer.succeed(Tunnels, Tunnels.of(tunnels(downloads))),
        Layer.succeed(Control, options.control),
        downloads,
      ),
    );
    const root = () => running.instance({ from: 'serve' });
    const states = running.changes.pipe(
      Stream.map(() => root()),
      Stream.merge(Stream.sync(root)),
    );
    yield* states.pipe(
      Stream.map(({ model }) => model.listening),
      Stream.filter((port): port is number => port !== null),
      Stream.runHead,
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.void,
          onSome: (port) => Effect.log(`listening on 127.0.0.1:${port}`),
        }),
      ),
      Effect.forkScoped,
    );
    return yield* states.pipe(
      Stream.map(({ state }) => state),
      Stream.filter(
        (state) => state._tag === 'Forgotten' || state._tag === 'Stopped',
      ),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
    );
  });
