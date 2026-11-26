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
import type { Progress } from '../contract/index.js';

export interface Failure {
  readonly message: string;
  readonly missing: boolean;
}

const failure = (message: string, missing = false): Failure => ({
  message,
  missing,
});

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
