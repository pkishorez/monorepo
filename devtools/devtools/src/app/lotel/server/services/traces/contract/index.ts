import { Context } from 'effect';
import type { Effect } from 'effect';
import type {
  TraceDetailsSchema,
  TraceNotFound,
  TraceSummaryListSchema,
} from '../../../rpc/telemetry/contract/index.js';
import type { TelemetryStoreError } from '../../telemetry-store/contract/index.js';

export type TraceDetails = typeof TraceDetailsSchema.Type;
export type TraceSummaryList = typeof TraceSummaryListSchema.Type;

export interface TracesCalls {
  readonly list: (
    limit?: number,
  ) => Effect.Effect<TraceSummaryList, TelemetryStoreError>;
  readonly get: (
    traceId: string,
  ) => Effect.Effect<TraceDetails, TraceNotFound | TelemetryStoreError>;
}

export class Traces extends Context.Service<Traces, TracesCalls>()(
  'Lotel/server/Traces',
) {}
