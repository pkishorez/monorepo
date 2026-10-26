import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Duration, Effect } from 'effect';
import { install, use } from 'cloudflared';

/*
 * The cloudflared binary, kept at a path Connect gives (in its cache
 * folder) so reinstalling packages never loses it. Its npm package would download it on install,
 * but that step is off in this workspace, so it is downloaded here, once,
 * the first time a tunnel is opened: into a folder of its own, then moved
 * into place whole, so a download cut short leaves nothing half-written.
 */

/** The longest a download may take: 20 MB at a slow 40 KB/s. */
const DOWNLOAD = Duration.minutes(10);

/** Whether the binary is at `cloudflaredBin`; tunnels are opened with it from now on. */
export const cloudflaredInstalled = (cloudflaredBin: string) =>
  Effect.sync(() => {
    use(cloudflaredBin);
    return existsSync(cloudflaredBin);
  });

/** Downloads the binary to `cloudflaredBin`; fails if it cannot, or takes longer than ten minutes. */
export const installCloudflared = (cloudflaredBin: string) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      mkdirSync(dirname(cloudflaredBin), { recursive: true });
      return mkdtempSync(join(dirname(cloudflaredBin), 'download-'));
    }),
    (folder) =>
      Effect.tryPromise({
        try: () => install(join(folder, basename(cloudflaredBin))),
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
        Effect.andThen((file) =>
          Effect.sync(() => renameSync(file, cloudflaredBin)),
        ),
      ),
    (folder) =>
      Effect.sync(() => rmSync(folder, { recursive: true, force: true })),
  );
