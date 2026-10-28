import { createHash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  openSync,
  statSync,
  writeSync,
} from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { Effect, Stream } from 'effect';

/*
 * One download into a file, with its sha256 worked out as it arrives, so
 * the file is read once. An `http:` or `https:` URL is fetched; a `file:`
 * URL is copied from this computer, the same way. Progress is told after
 * every chunk.
 */

/** How far a download is: bytes received, of the total when the server said it. */
export interface Progress {
  readonly received: number;
  readonly total: number | null;
}

/** Why a download failed; `missing` when its `file:` URL names no file. */
export interface Failure {
  readonly message: string;
  readonly missing: boolean;
}

const failure = (message: string, missing = false): Failure => ({
  message,
  missing,
});

/** The bytes at `url`, and how many there are when known. */
const source = (url: string) =>
  url.startsWith('file:')
    ? Effect.try({
        try: () => {
          const path = fileURLToPath(url);
          const { size } = statSync(path);
          return {
            body: Readable.toWeb(
              createReadStream(path),
            ) as ReadableStream<Uint8Array>,
            total: size > 0 ? size : null,
          };
        },
        catch: (cause) =>
          (cause as { readonly code?: string }).code === 'ENOENT'
            ? failure('there is no such file', true)
            : failure(`could not read it: ${messageOf(cause)}`),
      })
    : Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: (signal) => fetch(url, { signal }),
          catch: (cause) => failure(`could not reach it: ${messageOf(cause)}`),
        });
        if (!response.ok || response.body === null)
          return yield* Effect.fail(
            failure(`the server answered ${response.status}`),
          );
        const length = Number(response.headers.get('content-length'));
        return {
          body: response.body,
          total: Number.isFinite(length) && length > 0 ? length : null,
        };
      });

/** Downloads `url` into `file` and answers its sha256 in hex; fails with why it could not. */
export const transfer = (
  url: string,
  file: string,
  onProgress: (progress: Progress) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const { body, total } = yield* source(url);
    const hash = createHash('sha256');
    let received = 0;
    const fd = yield* Effect.acquireRelease(
      Effect.try({
        try: () => openSync(file, 'w', 0o700),
        catch: (cause) =>
          failure(`could not write ${file}: ${messageOf(cause)}`),
      }),
      (fd) => Effect.sync(() => closeSync(fd)),
    );
    yield* Stream.fromReadableStream({
      evaluate: () => body,
      onError: (cause) =>
        failure(`the download broke off: ${messageOf(cause)}`),
    }).pipe(
      Stream.runForEach((chunk) =>
        Effect.gen(function* () {
          hash.update(chunk);
          yield* Effect.try({
            try: () => writeSync(fd, chunk),
            catch: (cause) =>
              failure(`could not write ${file}: ${messageOf(cause)}`),
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
