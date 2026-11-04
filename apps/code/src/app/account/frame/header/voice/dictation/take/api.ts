import { Effect, Schedule, Stream } from 'effect';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';

/*
 * What a Take asks of its Connection, over its own socket: its audio, a
 * stretch at a time, its end, and what it has heard. Each time the socket
 * comes back, the audio and the end are sent again from the first stretch:
 * a Connection that restarted has lost the Take, and one that did not
 * takes each stretch once. A call the socket drops is made again until it
 * is answered. Only the Connection saying it cannot hear the Take fails
 * one, with why; how long to wait for an answer is the Take's to say.
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

/** Stretch `at` of Take `id`, over the socket `sending` holds. */
export const addAudio = (id: string, at: number, audio: Uint8Array) =>
  answered(CodeClient.use((api) => api.addTakeAudio({ id, at, audio })));

/** Take `id` has `count` stretches, over the socket `sending` holds. */
export const endTake = (id: string, count: number) =>
  answered(CodeClient.use((api) => api.endTake({ id, count })));

/**
 * `send` over the Connection's socket while it is up, from the start again
 * each time it comes back; `send` never ends but by failing, with why.
 */
export const sending = (
  connectionId: string,
  send: Effect.Effect<never, string, CodeClient>,
) =>
  Stream.runDrain(
    CodeClients.stream(
      connectionId,
      keepSubscribed(() => Stream.fromEffect(send)),
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

/**
 * Whether the Connection's socket is up, on the Release this Code dials,
 * now and on each change; nothing while the Connection does not run here.
 */
export const linked = (connectionId: string) =>
  CodeClients.link(connectionId).pipe(
    Stream.map((now) => now === 'linked'),
    Stream.changes,
  );
