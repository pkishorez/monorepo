import { Schema } from 'effect';
import type { OtelSpan } from '../../../services/telemetry/contract/index.js';

/**
 * A list of Spans as an Actor's Model or Message holds it. The Spans were
 * checked once, against the Telemetry RPC's Schemas, as they arrived from the
 * DevTools Server; checking every one again on each Update would make a
 * keystroke cost as much as the whole Trace list, so only the list is.
 * Each Span is plain JSON, so a saved History keeps it as it is.
 */
export const SpansSchema = Schema.declare(
  (input): input is ReadonlyArray<OtelSpan> => Array.isArray(input),
  { identifier: 'Spans' },
);

/**
 * How an opened Trace is laid out: kept by the Lotel Tool from one Trace
 * to the next, drawn by the Trace, which says when it changes.
 */
export const TraceLayoutSchema = Schema.Struct({
  view: Schema.Literals(['waterfall', 'narrative']),
  /** Width of the Span inspector, in pixels. */
  sidebarWidth: Schema.Number,
  /** Width of the Waterfall view's Span name column, in pixels. */
  nameColWidth: Schema.Number,
  sidebarOpen: Schema.Boolean,
});
export type TraceLayout = typeof TraceLayoutSchema.Type;
