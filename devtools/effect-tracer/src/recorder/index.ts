export { makeTraceRecorder } from './recorder.js';
export {
  readSequence,
  sequenceAttribute,
  sequenceOrder,
  tracerAttributePrefix,
} from '../sequence/index.js';

export type {
  CapturedEvent,
  CapturedLog,
  CapturedSpan,
  CapturedSpanStatus,
  CapturedTrace,
  TraceLogLevel,
  TraceRecorder,
  TraceRecorderOptions,
  TraceValue,
} from './recorder.js';
