/**
 * The contract between the page and the synthesis worker: load Kokoro, then
 * speak sentences one at a time in a chosen voice.
 */
import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Transferable } from 'effect/unstable/workers';
import { voices } from './voices.ts';

export class SynthesisError extends Schema.TaggedError<SynthesisError>()(
  'SynthesisError',
  {
    reason: Schema.Literals(['load-failed', 'not-loaded', 'speak-failed']),
    message: Schema.String,
  },
) {}

/** Download progress across Kokoro's files, then ready. */
export const VoiceModelProgress = Schema.Struct({
  loaded: Schema.Number,
  total: Schema.Number,
  status: Schema.Literals(['download', 'ready']),
});
export type VoiceModelProgress = typeof VoiceModelProgress.Type;

/** Mono samples; the buffer moves to the page instead of copying. */
const Samples = Transferable.schema(Schema.instanceOf(Float32Array), (a) => [
  a.buffer,
]);

/** One sentence, spoken. */
export const SpokenSentence = Schema.Struct({
  /** Its position in the sentences asked for. */
  index: Schema.Number,
  samples: Samples,
  sampleRate: Schema.Number,
});
export type SpokenSentence = typeof SpokenSentence.Type;

export class SynthesisRpcs extends RpcGroup.make(
  Rpc.make('LoadVoiceModel', {
    success: VoiceModelProgress,
    error: SynthesisError,
    stream: true,
  }),
  Rpc.make('Speak', {
    payload: {
      sentences: Schema.Array(Schema.String),
      voice: Schema.Literals(voices.map((voice) => voice.id)),
    },
    success: SpokenSentence,
    error: SynthesisError,
    stream: true,
  }),
) {}
