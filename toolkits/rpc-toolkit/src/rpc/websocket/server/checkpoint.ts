import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

/**
 * The resumable state of a single streaming request.
 *
 * A streaming handler is re-run from the top every time the Durable Object
 * wakes, so it needs somewhere to record where it got to. That place is here.
 */
export interface StreamCheckpointService {
  readonly get: <S extends Schema.Top = typeof Schema.Unknown>(
    schema?: S,
  ) => Effect.Effect<
    Option.Option<S['Type']>,
    Schema.SchemaError,
    S['DecodingServices']
  >;
  readonly put: <S extends Schema.Top = typeof Schema.Unknown>(
    value: S['Type'],
    schema?: S,
  ) => Effect.Effect<void, Schema.SchemaError, S['EncodingServices']>;
  readonly clear: Effect.Effect<void>;
}

export const makeStreamCheckpoint = (options: {
  readonly get: Effect.Effect<Option.Option<unknown>>;
  readonly put: (value: unknown) => Effect.Effect<void>;
  readonly clear: Effect.Effect<void>;
}): StreamCheckpointService => ({
  get: <S extends Schema.Top = typeof Schema.Unknown>(schema?: S) =>
    Effect.flatMap(options.get, (value) =>
      Option.isNone(value)
        ? Effect.succeed(Option.none())
        : Schema.decodeUnknownEffect(schema ?? Schema.Unknown)(
            value.value,
          ).pipe(Effect.map(Option.some)),
    ),
  put: <S extends Schema.Top = typeof Schema.Unknown>(
    value: S['Type'],
    schema?: S,
  ) =>
    Schema.encodeUnknownEffect(schema ?? Schema.Unknown)(value).pipe(
      Effect.tap(options.put),
      Effect.asVoid,
    ),
  clear: options.clear,
});

/**
 * Outside a WebSocket-server stream nothing survives, so there is nothing to
 * resume from: reads find nothing and writes are dropped.
 */
export const forgetfulCheckpoint: StreamCheckpointService =
  makeStreamCheckpoint({
    get: Effect.succeedNone,
    put: () => Effect.void,
    clear: Effect.void,
  });
