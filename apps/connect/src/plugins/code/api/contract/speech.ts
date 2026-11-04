import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/eschema';
import { SpeechToTextNotReady, TranscriptionFailed } from './errors.js';
import { tagged } from './wire.js';

/*
 * Speech to Text, on this Connection (ADR 0017): switched on and off, how it
 * stands, and audio turned into text. Its progress is a stream, not
 * records: the written exception to the AI Table being the only channel.
 * A start's steps are the other (see sessions.ts): progress, not records,
 * and the Session they end with is a record the feeds carry too.
 */

/** How Speech to Text stands on this Connection. */
export const SpeechToTextState = ValueESchema.make(
  'SpeechToTextState',
  Schema.Union([
    tagged('Off', {}),
    /** Bytes of the model downloaded, of `total` once the server says it. */
    tagged('Downloading', {
      done: Schema.Finite,
      total: Schema.NullOr(Schema.Finite),
    }),
    tagged('Ready', {}),
    /** Enabling again tries again. */
    tagged('Failed', { reason: Schema.String }),
  ]),
).build();
export type SpeechToTextState = typeof SpeechToTextState.Type;

/**
 * What a Take, a Dictation sent as it is recorded, has heard: the model's
 * download while it comes, the text so far, then the whole text.
 */
export const TakeHeard = ValueESchema.make(
  'TakeHeard',
  Schema.Union([
    tagged('Downloading', {
      done: Schema.Finite,
      total: Schema.NullOr(Schema.Finite),
    }),
    tagged('Heard', { text: Schema.String }),
    tagged('Done', { text: Schema.String }),
  ]),
).build();
export type TakeHeard = typeof TakeHeard.Type;

export const SpeechRpc = RpcGroup.make(
  /**
   * Switches it on and returns at once. The Connection keeps the wish, and
   * downloads the model into its data folder unless it is there, again
   * after a restart until it is whole. From Failed it tries again.
   */
  Rpc.make('enableSpeechToText'),
  /** Switches it off, deleting the model and the wish. */
  Rpc.make('disableSpeechToText'),
  /** How it stands now, then each change. */
  Rpc.make('watchSpeechToText', {
    success: SpeechToTextState.schema,
    stream: true,
  }),
  /**
   * The text spoken in one clip: 16 kHz mono PCM, each sample 16-bit
   * signed little-endian. The model loads on the first one and stays.
   */
  Rpc.make('transcribe', {
    payload: ESchema.make('TranscribePayload', {
      audio: Schema.Uint8ArrayFromBase64,
    }).build().schema,
    success: Schema.String,
    error: Schema.Union([SpeechToTextNotReady, TranscriptionFailed]),
  }),
  /**
   * What Take `id` has heard now, then each change, ending with Done. Any
   * of the three calls may come first. Speech to Text off, it is switched
   * on, and the download shows until the model is Ready; the audio waits.
   */
  Rpc.make('watchTake', {
    payload: ESchema.make('WatchTakePayload', { id: Schema.String }).build()
      .schema,
    success: TakeHeard.schema,
    error: TranscriptionFailed,
    stream: true,
  }),
  /**
   * Stretch `at`, from 0, of Take `id`'s audio, as `transcribe` takes it.
   * Sent again, it is ignored.
   */
  Rpc.make('addTakeAudio', {
    payload: ESchema.make('AddTakeAudioPayload', {
      id: Schema.String,
      at: Schema.Finite,
      audio: Schema.Uint8ArrayFromBase64,
    }).build().schema,
    error: TranscriptionFailed,
  }),
  /** Take `id` has `count` stretches: once all are in, it is Done. */
  Rpc.make('endTake', {
    payload: ESchema.make('EndTakePayload', {
      id: Schema.String,
      count: Schema.Finite,
    }).build().schema,
    error: TranscriptionFailed,
  }),
);
