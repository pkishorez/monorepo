// Callers need the capability that records an Effect program's traces and logs.
export { makeTraceRecorder } from './recorder.js';
// Trace consumers need to describe events captured within spans.
export type { CapturedEvent } from './recorder.js';
// Trace consumers need to describe captured log records.
export type { CapturedLog } from './recorder.js';
// Trace consumers need to describe captured spans.
export type { CapturedSpan } from './recorder.js';
