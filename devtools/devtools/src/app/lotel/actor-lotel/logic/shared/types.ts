import { Schema } from 'effect';
import type { OtelSpan } from '../../../services/telemetry/contract/index.js';

export const SpansSchema = Schema.declare(
  (input): input is ReadonlyArray<OtelSpan> => Array.isArray(input),
  { identifier: 'Spans' },
);

export const TraceLayoutSchema = Schema.Struct({
  view: Schema.Literals(['waterfall', 'narrative']),
  sidebarWidth: Schema.Number,
  nameColWidth: Schema.Number,
  sidebarOpen: Schema.Boolean,
});
export type TraceLayout = typeof TraceLayoutSchema.Type;
