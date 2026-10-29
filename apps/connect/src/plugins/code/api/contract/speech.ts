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
);
