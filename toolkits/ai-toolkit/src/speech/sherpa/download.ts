import { open, stat } from 'node:fs/promises';
import { Effect, Stream } from 'effect';
import { SpeechToTextError, type Fetched } from '../contract/index.js';

/*
 * One file fetched over HTTP into `file`, carrying on from the bytes an
 * earlier fetch left there: it asks for the rest with a Range, appends
 * when the server sends only that, and starts over when it sends the
 * whole file. A server that has nothing past those bytes (416) means the
 * file is already whole.
 */

const failed = (message: string) => (cause?: unknown) =>
  new SpeechToTextError({ message, cause });

/** The size of `file`; 0 when there is none. */
const sizeOf = (file: string) =>
  Effect.promise(() =>
    stat(file).then(
      (found) => found.size,
      () => 0,
    ),
  );

export const download = (
  url: string,
  file: string,
  progress: (fetched: Fetched) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const have = yield* sizeOf(file);
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch(url, {
          signal,
          headers: have > 0 ? { range: `bytes=${have}-` } : {},
        }),
      catch: failed(`Could not reach ${url}`),
    });
    if (response.status === 416) {
      yield* Effect.promise(() => response.body?.cancel() ?? Promise.resolve());
      return yield* progress({ done: have, total: have });
    }
    const body = response.body;
    if (!response.ok || body === null)
      return yield* failed(`${url} answered ${response.status}`)();
    const resumed = response.status === 206;
    const start = resumed ? have : 0;
    const length = Number(response.headers.get('content-length'));
    const total = length > 0 ? start + length : null;
    const handle = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => open(file, resumed ? 'a' : 'w'),
        catch: failed(`Could not write ${file}`),
      }),
      (handle) => Effect.promise(() => handle.close()),
    );
    let done = start;
    yield* progress({ done, total });
    yield* Stream.fromReadableStream({
      evaluate: () => body,
      onError: failed(`The download from ${url} broke off`),
    }).pipe(
      Stream.runForEach((chunk) =>
        Effect.tryPromise({
          try: () => handle.write(chunk),
          catch: failed(`Could not write ${file}`),
        }).pipe(
          Effect.andThen(() => {
            done += chunk.byteLength;
            return progress({ done, total });
          }),
        ),
      ),
    );
    if (total !== null && done !== total)
      return yield* failed(
        `The download from ${url} ended at ${done} of ${total} bytes`,
      )();
  }).pipe(Effect.scoped);
