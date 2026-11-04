import { Effect, Option, Schema, Stream } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Connections } from '../../../../../account.ts';
import { nameOf } from '../../../../../connection/link/index.ts';
import { clipOf, Recorder } from '../../recorder/index.ts';
import { addAudio, endTake, linked, sending, watchTake } from './api.ts';

/*
 * A Take: one Dictation's audio, sent to its Connection while it is
 * recorded, and the text heard there coming back as it goes. A Child of
 * the Dictation for as long as it records and is written out.
 *
 * 1. Send    the Recorder's audio, as it comes, in stretches of about two
 *            seconds, each numbered; once the recording ends and the
 *            Dictation says it stopped, how many there were. Each time
 *            the socket comes back, all of it again from the first: a
 *            Connection that restarted has lost the Take.
 * 2. Watch   what the Connection has heard: while its model downloads, how
 *            far; then the text so far; then the whole text, once every
 *            stretch is in. Each is told to the Dictation.
 * 3. Wait    once stopped, for so long at most with no word from the
 *            Connection, an answer or anything heard: REACH while its
 *            socket is not up, then it could not be reached; ANSWER while
 *            it is, DOWNLOAD while its model downloads, then voice stopped
 *            answering. Either fails the Take, and the Dictation offers a
 *            retry from the same clip.
 *
 * The Take's id names it on the Connection, so another device or a reload
 * never mixes its audio with another's.
 */

/** Recorder chunks per stretch: 16 of 2048 samples at 16 kHz, about 2 s. */
export const STRETCH = 16;

/** How long it waits for a word while its Connection's socket is not up, in ms. */
export const REACH = 30_000;

/** How long it waits for a word while the socket is up, in ms. */
export const ANSWER = 60_000;

/** How long it waits for a word while the model downloads, in ms. */
export const DOWNLOAD = 5 * 60_000;

export const STOPPED_ANSWERING = 'Voice stopped answering';

const Heard = {
  Downloading: { done: Schema.Number, total: Schema.NullOr(Schema.Number) },
  Heard: { text: Schema.String },
  Done: { text: Schema.String },
  Failed: { reason: Schema.String },
};

export const Take = Actor.define('Take', {
  requires: [CodeClients, Connections, Recorder],
  input: Schema.Struct({ id: Schema.String, connectionId: Schema.String }),
  props: Schema.Struct({
    /** The Dictation stopped, not cancelled: the Take may end. */
    stopped: Schema.Boolean,
  }),
  model: Schema.Struct({
    id: Schema.String,
    connectionId: Schema.String,
    /** How many stretches the Connection has taken since the socket last came up. */
    sent: Schema.Finite,
    /** How many there are, once the recording has ended and all are sent. */
    count: Schema.NullOr(Schema.Finite),
    /** The Time of the last word from the Connection: an answer, or anything heard. */
    word: Schema.Number,
    /** The Connection's socket is up, on the Release this Code dials. */
    linked: Schema.Boolean,
    /** What it last heard is how far its model has downloaded. */
    downloading: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    Sent: { sent: Schema.Finite },
    Ended: { count: Schema.Finite },
    Linked: { linked: Schema.Boolean },
    ...Heard,
  }),
  emits: Schema.TaggedUnion(Heard),
});

/** Why it could not reach Connection `id`, by its name. */
const unreached = (id: string) =>
  Effect.flatMap(Connections, ({ connection }) =>
    Stream.runHead(connection(id)),
  ).pipe(
    Effect.map((found) =>
      Option.match(Option.flatMap(found, Option.fromNullishOr), {
        onNone: () => "Couldn't reach its Connection",
        onSome: (connection) => `Couldn't reach ${nameOf(connection)}`,
      }),
    ),
  );

export const TakeLive = Take.build({
  init: ({ id, connectionId }) => ({
    model: {
      id,
      connectionId,
      sent: 0,
      count: null,
      word: 0,
      linked: false,
      downloading: false,
    },
  }),
  workers: {
    // 1. Send
    send: {
      run: (self) =>
        Effect.gen(function* () {
          const { id, connectionId } = (yield* self.get).model;
          const { audio } = yield* Recorder;
          yield* sending(
            connectionId,
            Effect.gen(function* () {
              let sent = 0;
              yield* audio.pipe(
                Stream.grouped(STRETCH),
                Stream.runForEach((chunks) =>
                  Effect.gen(function* () {
                    yield* addAudio(id, sent, clipOf(chunks));
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
              yield* endTake(id, sent);
              yield* self.send({ _tag: 'Ended', count: sent });
              // Kept, to send it all again if the socket comes back.
              return yield* Effect.never;
            }),
          );
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
    // 3. Wait: whether the socket is up, and how long since the last word.
    link: {
      run: (self) =>
        Effect.gen(function* () {
          const { connectionId } = (yield* self.get).model;
          yield* Stream.runForEach(linked(connectionId), (linked) =>
            self.send({ _tag: 'Linked', linked }),
          );
        }),
    },
    wait: {
      each: ({ props, model }) => (props.stopped ? [String(model.word)] : []),
      run: (self) =>
        Effect.gen(function* () {
          yield* Effect.sleep(REACH);
          const { model } = yield* self.get;
          if (model.linked)
            yield* Effect.sleep(
              (model.downloading ? DOWNLOAD : ANSWER) - REACH,
            );
          const { model: now } = yield* self.get;
          yield* self.send({
            _tag: 'Failed',
            reason: now.linked
              ? STOPPED_ANSWERING
              : yield* unreached(now.connectionId),
          });
        }),
    },
  },
  on: {
    Sent: ({ sent }, { model, at }) => ({
      model: { ...model, sent, word: at },
    }),
    Ended: ({ count }, { model, at }) => ({
      model: { ...model, count, word: at },
    }),
    Linked: ({ linked }, { model }) => ({ model: { ...model, linked } }),
    Downloading: (downloading, { model, at }) => ({
      model: { ...model, word: at, downloading: true },
      emit: downloading,
    }),
    Heard: (heard, { model, at }) => ({
      model: { ...model, word: at, downloading: false },
      emit: heard,
    }),
    Done: (done) => ({ emit: done }),
    Failed: (failed) => ({ emit: failed }),
  },
});
