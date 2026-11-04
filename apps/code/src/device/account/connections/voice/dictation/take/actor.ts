import { Effect, Schema, Stream } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { clipOf, Recorder } from '../../recorder/index.ts';
import { addAudio, endTake, watchTake } from './api.ts';

/*
 * A Take: one Dictation's audio, sent to its Connection while it is
 * recorded, and the text heard there coming back as it goes. A Child of
 * the Dictation for as long as it records and is written out.
 *
 * 1. Send    the Recorder's audio, as it comes, in stretches of about two
 *            seconds, each numbered; once the recording ends and the
 *            Dictation says it stopped, how many there were. One the
 *            socket drops is sent again.
 * 2. Watch   what the Connection has heard: while its model downloads, how
 *            far; then the text so far; then the whole text, once every
 *            stretch is in. Each is told to the Dictation.
 *
 * The Take's id names it on the Connection, so another device or a reload
 * never mixes its audio with another's.
 */

/** Recorder chunks per stretch: 16 of 2048 samples at 16 kHz, about 2 s. */
export const STRETCH = 16;

const Heard = {
  Downloading: { done: Schema.Number, total: Schema.NullOr(Schema.Number) },
  Heard: { text: Schema.String },
  Done: { text: Schema.String },
  Failed: { reason: Schema.String },
};

export const Take = Actor.define('Take', {
  requires: [CodeClients, Recorder],
  input: Schema.Struct({ id: Schema.String, connectionId: Schema.String }),
  props: Schema.Struct({
    /** The Dictation stopped, not cancelled: the Take may end. */
    stopped: Schema.Boolean,
  }),
  model: Schema.Struct({
    id: Schema.String,
    connectionId: Schema.String,
    /** How many stretches the Connection has taken. */
    sent: Schema.Finite,
    /** How many there are, once the recording has ended and all are sent. */
    count: Schema.NullOr(Schema.Finite),
  }),
  message: Schema.TaggedUnion({
    Sent: { sent: Schema.Finite },
    Ended: { count: Schema.Finite },
    ...Heard,
  }),
  emits: Schema.TaggedUnion(Heard),
});

export const TakeLive = Take.build({
  init: ({ id, connectionId }) => ({
    model: { id, connectionId, sent: 0, count: null },
  }),
  workers: {
    // 1. Send
    send: {
      run: (self) =>
        Effect.gen(function* () {
          const { id, connectionId } = (yield* self.get).model;
          let sent = 0;
          yield* (yield* Recorder).audio.pipe(
            Stream.grouped(STRETCH),
            Stream.runForEach((chunks) =>
              Effect.gen(function* () {
                yield* addAudio(connectionId, id, sent, clipOf(chunks));
                sent++;
                yield* self.send({ _tag: 'Sent', sent });
              }),
            ),
          );
          // Ended only once the Dictation stops: a cancel stops the Take first.
          yield* self.changes.pipe(
            Stream.filter(({ props }) => props.stopped),
            Stream.runHead,
          );
          yield* endTake(connectionId, id, sent);
          yield* self.send({ _tag: 'Ended', count: sent });
        }).pipe(
          Effect.catch((reason) => self.send({ _tag: 'Failed', reason })),
        ),
    },
    // 2. Watch
    watch: {
      run: (self) =>
        Effect.gen(function* () {
          const { id, connectionId } = (yield* self.get).model;
          yield* Stream.runForEach(watchTake(connectionId, id), self.send);
        }).pipe(
          Effect.catch((reason) => self.send({ _tag: 'Failed', reason })),
        ),
    },
  },
  on: {
    Sent: ({ sent }, { model }) => ({ model: { ...model, sent } }),
    Ended: ({ count }, { model }) => ({ model: { ...model, count } }),
    Downloading: (downloading) => ({ emit: downloading }),
    Heard: (heard) => ({ emit: heard }),
    Done: (done) => ({ emit: done }),
    Failed: (failed) => ({ emit: failed }),
  },
});
