import { Effect, Stream } from 'effect';
import { CodeRpcs } from '../../contract/index.js';
import {
  interruptRun,
  startRun,
  startThread,
} from '../../orchestrators/index.js';
import { toRpcError } from './rpc-error.js';

export const CodeHandlersLive = CodeRpcs.toLayer({
  startThread: (payload) =>
    startThread(payload).pipe(Stream.mapError(toRpcError)),
  startRun: (payload) => startRun(payload).pipe(Stream.mapError(toRpcError)),
  interruptRun: (payload) =>
    interruptRun(payload).pipe(Effect.mapError(toRpcError)),
});
