import { Effect } from 'effect';
import SignalingWorker from './signaling-worker.ts';

export const DurableWebRtc = Effect.gen(function* () {
  const signaling = yield* SignalingWorker;

  return { signaling };
});
