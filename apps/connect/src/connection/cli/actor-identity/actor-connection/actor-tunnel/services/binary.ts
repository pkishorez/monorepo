import { statSync } from 'node:fs';
import { Duration, Effect } from 'effect';
import { install } from 'cloudflared';
import { Downloads } from '@kestack/cli-platform/files';

/*
 * The cloudflared binary, kept once per computer in the shared kestack
 * cache, so every Connection and every reinstall of Connect uses the same
 * copy. Its npm package would download it on install, but that step is off
 * in this workspace, so it is downloaded here the first time a tunnel is
 * opened. Downloads makes it whole or not at all, and once when two
 * Connections start together. Its npm package downloads `latest` unless
 * told a version, so the version is pinned here, and names its cache entry:
 * a new pin is a new entry, and the old one is pruned once unused. While it
 * downloads, the size of what has arrived is read every five seconds.
 */

/** The cloudflared release Connect runs. */
const VERSION = '2026.10.3';

/** Its entry in the shared cache. */
export const CLOUDFLARED_KEY = `cloudflared-${VERSION}`;

/** The longest a download may take: 20 MB at a slow 40 KB/s. */
const DOWNLOAD = Duration.minutes(10);

/** How often the size of a download is read. */
export const DOWNLOAD_EVERY = Duration.seconds(5);

const NAME = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';

/** The size of the file at `path` now; 0 while it is not there. */
const sizeOf = (path: string) => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

/** How much has arrived at `file`: `install` writes there on Linux and Windows, and to `<file>.tgz` on a Mac. */
const receivedAt = (file: string) =>
  Math.max(sizeOf(file), sizeOf(`${file}.tgz`));

/**
 * The cloudflared binary's path, downloaded first when it is missing, telling
 * `received` the bytes so far every `every` while it downloads here; fails if
 * it cannot be, or takes longer than ten minutes.
 */
export const cloudflared = (
  received: (bytes: number) => Effect.Effect<void>,
  every: Duration.Input = DOWNLOAD_EVERY,
) =>
  Effect.flatMap(Downloads, (downloads) =>
    downloads.ensure({
      key: CLOUDFLARED_KEY,
      name: NAME,
      produce: (file) =>
        Effect.raceFirst(
          Effect.tryPromise({
            try: () => install(file, VERSION),
            catch: (cause) =>
              new Error(
                `Could not download cloudflared: ${cause instanceof Error ? cause.message : String(cause)}`,
                { cause },
              ),
          }).pipe(
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
          Effect.suspend(() => received(receivedAt(file))).pipe(
            Effect.andThen(Effect.sleep(every)),
            Effect.forever,
          ),
        ),
    }),
  );
