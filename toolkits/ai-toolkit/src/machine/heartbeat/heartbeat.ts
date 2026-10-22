import { Effect, Layer, Option, Stream } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { Heartbeat } from './heartbeat-actor.js';
import { HeartbeatHost } from './host.js';

/*
 * A Machine's Heartbeat: the Actor run against what `host` gives it, until
 * it ends.
 */

/**
 * Runs the Heartbeat on `host` until the Machine is forgotten or must stop,
 * and answers which; for as long as the Scope otherwise.
 */
export const heartbeat = (host: HeartbeatHost['Service']) =>
  Effect.gen(function* () {
    const running = yield* Runtime.start(
      Heartbeat,
      Layer.succeed(HeartbeatHost, host),
    );
    const ended = yield* running.changes.pipe(
      Stream.map(() => running.instance({ from: 'serve' }).state),
      Stream.filter(
        (state) => state._tag === 'Forgotten' || state._tag === 'Stopped',
      ),
      Stream.runHead,
    );
    return Option.getOrThrow(ended);
  });
