import { Effect, Schedule, Stream } from 'effect';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';

/*
 * What a Take asks of its Connection, over its own socket: its audio, a
 * stretch at a time, its end, and what it has heard. A call the socket
 * drops is made again until it is answered, which is harmless: the
 * Connection takes each stretch once. Only the Connection saying it cannot
 * hear the Take fails one, with why.
 */

/** How long it waits to try again while the socket is down. */
const AGAIN = Schedule.spaced('1 second');

/** Made again until answered; refused, it fails with why. */
const answered = <A, R>(
  call: Effect.Effect<
    A,
    | { readonly _tag: string }
    | { readonly _tag: 'TranscriptionFailed'; readonly message: string },
    R
  >,
) =>
  call.pipe(
    Effect.retry({
      schedule: AGAIN,
      while: (cause) => cause._tag !== 'TranscriptionFailed',
    }),
    Effect.mapError((cause) =>
      'message' in cause && typeof cause.message === 'string'
        ? cause.message
        : 'The Connection could not hear it',
    ),
  );

/** Stretch `at` of Take `id`. */
export const addAudio = (
  connectionId: string,
  id: string,
  at: number,
  audio: Uint8Array,
) =>
  answered(
    CodeClients.on(
      connectionId,
      CodeClient.use((api) => api.addTakeAudio({ id, at, audio })),
    ),
  );

/** Take `id` has `count` stretches. */
export const endTake = (connectionId: string, id: string, count: number) =>
  answered(
    CodeClients.on(
      connectionId,
      CodeClient.use((api) => api.endTake({ id, count })),
    ),
  );

/**
 * What Take `id` has heard, again from now after each reconnect, ending
 * with Done, or with Failed and why the Connection could not hear it.
 */
export const watchTake = (connectionId: string, id: string) =>
  CodeClients.stream(
    connectionId,
    keepSubscribed(() =>
      Stream.unwrap(
        Effect.map(CodeClient, (api) =>
          api
            .watchTake({ id })
            .pipe(
              Stream.catchTag('TranscriptionFailed', ({ message }) =>
                Stream.make({ _tag: 'Failed' as const, reason: message }),
              ),
            ),
        ),
      ),
    ),
  ).pipe(Stream.retry(AGAIN), Stream.orDie);
