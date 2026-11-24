import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Telemetry } from '../../../../../services/telemetry/contract/index.js';
import {
  SpansSchema,
  TraceLayoutSchema,
} from '../../../../logic/shared/index.js';

/*
 * One opened Trace: its Spans and Log Records, drawn as a Waterfall view
 * or a Narrative view, with one Span inspected beside it.
 *
 * 1. Watch    the Trace's own Spans, live, so a running Trace grows while
 *             it is open (`logic/workers.ts`).
 * 2. Inspect  the Span picked; none picked inspects the first.
 * 3. Lay out  which view, and how wide the Span column and the inspector
 *             are, belong to the parent, which keeps them from one Trace
 *             to the next: the Trace draws them and says when they change.
 */

export const TraceShape = Actor.define('Trace', {
  requires: [Telemetry],
  input: { traceId: Schema.String },
  props: { layout: TraceLayoutSchema },
  model: {
    traceId: Schema.String,
    spans: SpansSchema,
    /** Whether the first page of Spans has arrived. */
    ready: Schema.Boolean,
    selectedSpanId: Schema.NullOr(Schema.String),
  },
  message: {
    Received: { spans: SpansSchema, ready: Schema.Boolean },
    Inspected: { spanId: Schema.NullOr(Schema.String) },
    LaidOut: { layout: TraceLayoutSchema },
    Closed: {},
  },
  emits: {
    LaidOut: { layout: TraceLayoutSchema },
    Closed: {},
  },
});
