import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { SpeechToTextNotReady, TranscriptionFailed } from './errors.js';

/*
 * Speech to Text, on this Connection (ADR 0017): switched on and off, how it
 * stands, and audio turned into text. Its progress is a stream, not
 * records: the written exception to the AI Table being the only channel.
 */

/** How Speech to Text stands on this Connection. */
export const SpeechToTextState = Schema.TaggedUnion({
  Off: {},
  /** Bytes of the model downloaded, of `total` once the server says it. */
  Downloading: { done: Schema.Number, total: Schema.NullOr(Schema.Number) },
  Ready: {},
  /** Enabling again tries again. */
  Failed: { reason: Schema.String },
});
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
  Rpc.make('watchSpeechToText', { success: SpeechToTextState, stream: true }),
  /**
   * The text spoken in one clip: 16 kHz mono PCM, each sample 16-bit
   * signed little-endian. The model loads on the first one and stays.
   */
  Rpc.make('transcribe', {
    payload: { audio: Schema.Uint8Array },
    success: Schema.String,
    error: Schema.Union([SpeechToTextNotReady, TranscriptionFailed]),
  }),
);
