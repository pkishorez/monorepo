import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Telemetry } from '../../../../../services/telemetry/contract/index.js';
import {
  SpansSchema,
  TraceLayoutSchema,
} from '../../../../logic/shared/index.js';

export const TraceShape = Actor.define('Trace', {
  requires: [Telemetry],
  input: { traceId: Schema.String },
  props: { layout: TraceLayoutSchema },
  model: {
    traceId: Schema.String,
    spans: SpansSchema,
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
