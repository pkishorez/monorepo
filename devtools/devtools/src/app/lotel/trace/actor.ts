import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Telemetry, type Live } from '../telemetry/index.js';
import { SpansSchema } from '../trace-model/index.js';

/*
 * One opened Trace: its Spans and Log Records, drawn as a Waterfall view
 * or a Narrative view, with one Span inspected beside it.
 *
 * 1. Watch    the Trace's own Spans, live, so a running Trace grows while
 *             it is open.
 * 2. Inspect  the Span picked; none picked inspects the first.
 * 3. Lay out  which view, and how wide the Span column and the inspector
 *             are, belong to the parent, which keeps them from one Trace
 *             to the next: the Trace draws them and says when they change.
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

export const DEFAULT_TRACE_LAYOUT: TraceLayout = {
  view: 'waterfall',
  sidebarWidth: 360,
  nameColWidth: 248,
  sidebarOpen: true,
};

export const Trace = Actor.define('Trace', {
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

// 1. Watch
/** The same Spans as before, each the very same, so nothing new is Sent. */
const sameLive = (left: Live, right: Live) =>
  left.ready === right.ready &&
  left.spans.length === right.spans.length &&
  left.spans.every((span, at) => span === right.spans[at]);

export const TraceLive = Trace.build({
  init: ({ traceId }) => ({
    model: { traceId, spans: [], ready: false, selectedSpanId: null },
  }),
  workers: {
    watch: {
      run: (self) =>
        Effect.gen(function* () {
          const telemetry = yield* Telemetry;
          const { model } = yield* self.get;
          yield* telemetry.live.pipe(
            Stream.map(({ ready, spans }) => ({
              ready,
              spans: spans.filter((span) => span.traceId === model.traceId),
            })),
            Stream.changesWith(sameLive),
            Stream.runForEach(({ ready, spans }) =>
              self.send({ _tag: 'Received', spans, ready }),
            ),
          );
        }),
    },
  },
  on: {
    Received: ({ spans, ready }) => ({ model: { spans, ready } }),
    // 2. Inspect
    Inspected: ({ spanId }) => ({ model: { selectedSpanId: spanId } }),
    // 3. Lay out
    LaidOut: ({ layout }) => ({ emit: { _tag: 'LaidOut', layout } }),
    Closed: () => ({ emit: { _tag: 'Closed' } }),
  },
});
