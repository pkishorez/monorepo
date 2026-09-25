/**
 * The contract between the page and the speech worker: load one model, then
 * transcribe audio windows into words with timestamps.
 */
import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Transferable } from 'effect/unstable/workers';
import { Word } from '../transcript/index.ts';

export class SpeechError extends Schema.TaggedError<SpeechError>()(
  'SpeechError',
  {
    reason: Schema.Literals(['load-failed', 'not-loaded', 'transcribe-failed']),
    message: Schema.String,
  },
) {}

/** Download progress across every file of the model, then ready. */
export const LoadProgress = Schema.Struct({
  loaded: Schema.Number,
  total: Schema.Number,
  status: Schema.Literals(['download', 'ready']),
  /** Bytes that came over the network in this load; `loaded` also counts kept ones. */
  fetched: Schema.Number,
});
export type LoadProgress = typeof LoadProgress.Type;

/** 16 kHz mono samples; the buffer moves to the worker instead of copying. */
const Samples = Transferable.schema(Schema.instanceOf(Float32Array), (a) => [
  a.buffer,
]);

export class SpeechRpcs extends RpcGroup.make(
  Rpc.make('LoadModel', {
    /** A model id from engine/models. */
    payload: { model: Schema.String },
    success: LoadProgress,
    error: SpeechError,
    stream: true,
  }),
  Rpc.make('Transcribe', {
    payload: {
      samples: Samples,
      /** Audio-clock time of the first sample, so the worker returns absolute times. */
      offset: Schema.Number,
    },
    success: Schema.Array(Word),
    error: SpeechError,
  }),
) {}
