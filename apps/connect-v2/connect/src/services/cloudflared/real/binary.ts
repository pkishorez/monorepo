import { Duration, Effect } from 'effect';
import { install } from 'cloudflared';
import { Downloads } from '../../downloads/contract/index.js';

const VERSION = '2026.10.3';

export const CLOUDFLARED_KEY = `cloudflared-${VERSION}`;

const DOWNLOAD = Duration.minutes(10);

const NAME = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';

export const binary = Effect.flatMap(Downloads, (downloads) =>
  downloads.ensure({
    key: CLOUDFLARED_KEY,
    name: NAME,
    produce: (file) =>
      Effect.tryPromise({
        try: () => install(file, VERSION),
        catch: (cause) =>
          new Error(
            `Could not download cloudflared: ${cause instanceof Error ? cause.message : String(cause)}`,
            { cause },
          ),
      }).pipe(
        Effect.tap(() => Effect.log('Downloaded cloudflared')),
        Effect.timeoutOrElse({
          duration: DOWNLOAD,
          orElse: () =>
            Effect.fail(
              new Error(
                `cloudflared did not download within ${Duration.format(DOWNLOAD)}; the network may be slow`,
              ),
            ),
        }),
        Effect.asVoid,
      ),
  }),
);
