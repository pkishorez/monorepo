import { Context, Data, Effect, Layer, Schema, Stream } from 'effect';
import {
  Cuts,
  Event,
  type Strength,
  Summary,
  Transcript,
  Video,
} from '../../../video/library/schema.ts';

/*
 * The web app's `/api` as the browser calls it: every Video, one Video,
 * its log as it grows, the JSON files of a finished one, and the commands.
 * A refusal is the CLI's own line, as `ApiError`'s message.
 */

export class ApiError extends Data.TaggedError('ApiError')<{
  readonly message: string;
}> {}

/** What a finished Video shows beside its player. */
export const Outputs = Schema.Struct({
  transcript: Transcript,
  summary: Summary,
  cuts: Cuts,
});
export type Outputs = typeof Outputs.Type;

const unreachable = () =>
  new ApiError({ message: 'The web app’s server did not answer.' });

const decode =
  <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
  (body: unknown) =>
    Schema.decodeUnknownEffect(schema)(body).pipe(
      Effect.mapError(
        (error) =>
          new ApiError({ message: `Unexpected answer: ${error.message}` }),
      ),
    );

const send = (path: string, init: RequestInit, signal?: AbortSignal) =>
  Effect.tryPromise({
    try: (interrupted) =>
      fetch(path, { ...init, signal: signal ?? interrupted }),
    catch: unreachable,
  });

const refusal = (response: Response) =>
  Effect.tryPromise({ try: () => response.json(), catch: unreachable }).pipe(
    Effect.orElseSucceed(() => null),
    Effect.flatMap(
      (body) =>
        new ApiError({
          message:
            (body as { error?: string } | null)?.error ??
            `${response.status} ${response.statusText}`,
        }),
    ),
  );

/** One call: its decoded JSON, or the `{ error }` it was refused with. */
const call = <S extends Schema.Codec<unknown, unknown>>(
  schema: S,
  path: string,
  init: RequestInit = {},
): Effect.Effect<S['Type'], ApiError> =>
  Effect.gen(function* () {
    const response = yield* send(path, init);
    if (!response.ok) return yield* refusal(response);
    const body: unknown = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: unreachable,
    });
    return yield* decode(schema)(body);
  });

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? '' : JSON.stringify(body),
});

const at = (id: string) => `/api/videos/${encodeURIComponent(id)}`;

const parseLine = decode(Schema.fromJsonString(Event));

const make = {
  list: call(Schema.Array(Video), '/api/videos'),
  status: (id: string) => call(Video, at(id)),
  /** Every Event so far, then each as it comes, until the Video stops working. */
  logs: (id: string): Stream.Stream<Event, ApiError> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const controller = yield* Effect.acquireRelease(
          Effect.sync(() => new AbortController()),
          (controller) => Effect.sync(() => controller.abort()),
        );
        const response = yield* send(`${at(id)}/logs`, {}, controller.signal);
        const body = response.body;
        if (!response.ok || body === null) return yield* refusal(response);
        return Stream.fromReadableStream({
          evaluate: () => body,
          onError: unreachable,
        }).pipe(
          Stream.decodeText,
          Stream.splitLines,
          Stream.filter((line) => line.trim() !== ''),
          Stream.mapEffect(parseLine),
        );
      }),
    ),
  /** A finished Video's transcript, summary and cuts. */
  outputs: (id: string) =>
    Effect.all(
      {
        transcript: call(Transcript, `${at(id)}/file/transcriptJson`),
        summary: call(Summary, `${at(id)}/file/summaryJson`),
        cuts: call(Cuts, `${at(id)}/file/cuts`),
      },
      { concurrency: 'unbounded' },
    ),
  create: (url: string, strength: Strength) =>
    call(Video, '/api/videos', post({ url, strength })),
  stop: (id: string) => call(Video, `${at(id)}/stop`, post(undefined)),
  resume: (id: string) => call(Video, `${at(id)}/resume`, post(undefined)),
  remove: (id: string) =>
    call(Schema.Struct({ id: Schema.String, freed: Schema.Number }), at(id), {
      method: 'DELETE',
    }),
};

/** Where a player reads a Video's mp4 from: the short video, or the original. */
export const mediaOf = (id: string, name: 'video' | 'original') =>
  `${at(id)}/file/${name}`;

export class Api extends Context.Service<Api, typeof make>()('ke-video/Api') {
  static readonly layer = Layer.succeed(Api, make);
}
