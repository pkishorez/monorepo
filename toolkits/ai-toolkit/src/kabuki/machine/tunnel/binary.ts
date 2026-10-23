import { existsSync } from 'node:fs';
import { Effect } from 'effect';
import { bin, install } from 'cloudflared';

/*
 * The cloudflared binary. Its npm package downloads it on install, but that
 * step is off in this workspace, so it is downloaded here, once, the first
 * time a tunnel is opened.
 */

/** The cloudflared binary's path, downloading it first when it is missing. */
export const cloudflaredBinary = Effect.suspend(() =>
  existsSync(bin)
    ? Effect.succeed(bin)
    : Effect.log(`Downloading cloudflared to ${bin}`).pipe(
        Effect.andThen(
          Effect.tryPromise({
            try: () => install(bin),
            catch: (cause) =>
              new Error(`Could not download cloudflared to ${bin}`, { cause }),
          }),
        ),
      ),
);
