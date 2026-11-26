import { Deferred, Duration, Effect } from 'effect';
import { Tunnel } from 'cloudflared';

const STARTUP = Duration.seconds(60);

export const quickTunnel = (local: string) =>
  Effect.gen(function* () {
    const url = yield* Deferred.make<string, Error>();
    const connected = yield* Deferred.make<void, Error>();
    const exited = yield* Deferred.make<void>();
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const made = Tunnel.quick(local, {
          '--no-autoupdate': true,
          '--protocol': 'http2',
        });
        made.once('url', (at) => Deferred.doneUnsafe(url, Effect.succeed(at)));
        made.once('connected', () =>
          Deferred.doneUnsafe(connected, Effect.void),
        );
        made.once('error', (error) => {
          Deferred.doneUnsafe(url, Effect.fail(error));
          Deferred.doneUnsafe(connected, Effect.fail(error));
        });
        made.once('exit', (code) => {
          const exit = Effect.fail(
            new Error(`cloudflared exited with ${code}`),
          );
          Deferred.doneUnsafe(url, exit);
          Deferred.doneUnsafe(connected, exit);
          Deferred.doneUnsafe(exited, Effect.void);
        });
        return made;
      }),
      (made) => Effect.sync(() => made.stop()),
    );
    const at = yield* Deferred.await(url).pipe(
      Effect.tap(() => Deferred.await(connected)),
      Effect.timeoutOrElse({
        duration: STARTUP,
        orElse: () =>
          Effect.fail(
            new Error(
              'cloudflared did not connect within a minute; is outbound TCP port 7844 open?',
            ),
          ),
      }),
    );
    return { url: at, closed: Deferred.await(exited) };
  });
