import { Effect, Layer, Option, Stream } from 'effect';
import { History, Runtime } from '@kestack/kabuki';
import { Downloads } from '@kestack/cli-platform/files';
import { CLOUDFLARED_KEY, Tunnels, tunnels } from './actor-connection/index.js';
import { ActorIdentity, type IdentityInput } from './actor.js';
import { CloudAccount, Control } from './capabilities/index.js';

/*
 * Running the tree, standing on the User's account on Connect Cloud and on
 * cloudflared, until it is Ended. First, the shared cache
 * drops each download no Connection has used for 30 days, keeping
 * cloudflared, which the tunnel runs at once; a running Plugin marks its file
 * used every day, so no file in use goes.
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
  /** The root's Input. */
  readonly input: IdentityInput;
  /** The User's account on Connect Cloud. */
  readonly account: CloudAccount['Service'];
  /** The control socket `serve` holds, for Identity to answer on. */
  readonly control: Control['Service'];
}

/** Runs the tree until it is Ended, for as long as the Scope: why, Forgotten or Stopped. */
export const run = (options: RunOptions) =>
  Effect.gen(function* () {
    const downloads = Downloads.layer(options.input.folders.cache);
    yield* prune(downloads);
    const running = yield* Runtime.start(
      History.make(ActorIdentity, { window: 0, input: options.input }),
      Layer.mergeAll(
        Layer.succeed(CloudAccount, options.account),
        Layer.succeed(Tunnels, Tunnels.of(tunnels(downloads))),
        Layer.succeed(Control, options.control),
        downloads,
      ),
    );
    const root = () => running.instance({ from: 'serve' });
    return yield* running.changes.pipe(
      Stream.map(() => root()),
      Stream.merge(Stream.sync(root)),
      Stream.map(({ state }) => state),
      Stream.filter((state) => state._tag === 'Ended'),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
      Effect.map(({ why }) => why),
    );
  });
