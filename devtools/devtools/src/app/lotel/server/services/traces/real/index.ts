import { Effect, Layer } from 'effect';
import { TelemetryStore } from '../../telemetry-store/contract/index.js';
import { TraceNotFound } from '../../../rpc/telemetry/contract/index.js';
import { Traces } from '../contract/index.js';
import { makeTraceDetails, makeTraceSummary } from './traces.js';

const RECENT_TRACES = 20;

export const tracesLayer = Layer.effect(
  Traces,
  Effect.gen(function* () {
    const store = yield* TelemetryStore;
    return {
      list: (limit = RECENT_TRACES) =>
        Effect.gen(function* () {
          const traceIds = yield* store.listRecentTraceIds(limit);
          const items = yield* Effect.forEach(traceIds, (traceId) =>
            Effect.map(store.findSpansByTrace(traceId), (spans) =>
              makeTraceSummary(traceId, spans),
            ),
          );
          return { items };
        }),
      get: (traceId) =>
        Effect.gen(function* () {
          const spans = yield* store.findSpansByTrace(traceId);
          if (spans.length === 0) return yield* new TraceNotFound({ traceId });
          const logs = yield* store.findLogsByTrace(traceId);
          return makeTraceDetails(traceId, spans, logs);
        }),
    };
  }),
);
