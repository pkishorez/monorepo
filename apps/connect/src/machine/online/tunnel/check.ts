import { Duration, Effect } from 'effect';

/*
 * Whether a Machine can reach itself at its public address: a GET of
 * `<url>/health` through the tunnel, as the Heartbeat reports it.
 */

const TIMEOUT = Duration.seconds(10);

/** The Tunnel Check of the server at `url`, now. Never fails: a failure is a check that is not ok. */
export const checkTunnel = (url: string) =>
  Effect.gen(function* () {
    const at = Date.now();
    const problem = yield* Effect.tryPromise({
      try: async (signal) => {
        const response = await fetch(`${url.replace(/\/+$/, '')}/health`, {
          signal,
        });
        await response.body?.cancel();
        return response.ok ? null : `${url}/health answered ${response.status}`;
      },
      catch: (cause) =>
        `${url}/health could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`,
    }).pipe(
      Effect.timeoutOrElse({
        duration: TIMEOUT,
        orElse: () => Effect.succeed(`${url}/health did not answer in time`),
      }),
      Effect.catch((problem) => Effect.succeed(problem)),
    );
    return { ok: problem === null, at, problem };
  });
