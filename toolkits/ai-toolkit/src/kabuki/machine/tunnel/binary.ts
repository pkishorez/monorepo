import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { Duration, Effect } from 'effect';
import { install, use } from 'cloudflared';

/*
 * The cloudflared binary, kept in ~/.ai-toolkit/bin so reinstalling
 * packages never loses it. Its npm package would download it on install,
 * but that step is off in this workspace, so it is downloaded here, once,
 * the first time a tunnel is opened: into a folder of its own, then moved
 * into place whole, so a download cut short leaves nothing half-written.
 */

/** The longest a download may take: 20 MB at a slow 40 KB/s. */
const DOWNLOAD = Duration.minutes(10);

/** Where the binary lives. */
export const cloudflaredBin = join(
  homedir(),
  '.ai-toolkit',
  'bin',
  process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared',
);

/** Whether the binary is on this computer; tunnels are opened with it from now on. */
export const cloudflaredInstalled = Effect.sync(() => {
  use(cloudflaredBin);
  return existsSync(cloudflaredBin);
});

/** Downloads the binary; fails if it cannot, or takes longer than ten minutes. */
export const installCloudflared = Effect.acquireUseRelease(
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
