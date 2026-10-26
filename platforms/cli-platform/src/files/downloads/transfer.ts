import { createHash } from 'node:crypto';
import { closeSync, openSync, writeSync } from 'node:fs';
import { Effect, Stream } from 'effect';

/*
 * One HTTP download into a file, with its sha256 worked out as it arrives,
 * so the file is read once. Progress is told after every chunk.
 */

/** How far a download is: bytes received, of the total when the server said it. */
export interface Progress {
  readonly received: number;
  readonly total: number | null;
}

/** Downloads `url` into `file` and answers its sha256 in hex; fails with why it could not. */
export const transfer = (
  url: string,
  file: string,
  onProgress: (progress: Progress) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) => fetch(url, { signal }),
      catch: (cause) => `could not reach it: ${messageOf(cause)}`,
    });
    if (!response.ok || response.body === null)
      return yield* Effect.fail(`the server answered ${response.status}`);
    const length = Number(response.headers.get('content-length'));
    const total = Number.isFinite(length) && length > 0 ? length : null;
    const hash = createHash('sha256');
    let received = 0;
    const fd = yield* Effect.acquireRelease(
      Effect.try({
        try: () => openSync(file, 'w', 0o700),
        catch: (cause) => `could not write ${file}: ${messageOf(cause)}`,
      }),
      (fd) => Effect.sync(() => closeSync(fd)),
    );
    const body = response.body;
    yield* Stream.fromReadableStream({
      evaluate: () => body,
      onError: (cause) => `the download broke off: ${messageOf(cause)}`,
    }).pipe(
      Stream.runForEach((chunk) =>
        Effect.gen(function* () {
          hash.update(chunk);
          yield* Effect.try({
            try: () => writeSync(fd, chunk),
            catch: (cause) => `could not write ${file}: ${messageOf(cause)}`,
          });
          received += chunk.byteLength;
          yield* onProgress({ received, total });
        }),
      ),
    );
    return hash.digest('hex');
  }).pipe(Effect.scoped);

export const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
