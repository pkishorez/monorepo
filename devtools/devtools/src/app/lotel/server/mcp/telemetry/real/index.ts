import { Effect, Layer } from 'effect';
import { McpServer } from 'effect/ai';
import { LotelRpcError } from '../../../rpc/telemetry/contract/index.js';
import { TelemetryStore } from '../../../services/telemetry-store/contract/index.js';
import type { TelemetryStoreError } from '../../../services/telemetry-store/contract/index.js';
import { Traces } from '../../../services/traces/contract/index.js';
import { TelemetryTools } from '../contract/index.js';
import { compactLog, compactSummary, compactTrace } from './compact.js';

const RECENT_LOGS = 50;

const toToolError = ({ operation, cause }: TelemetryStoreError) =>
  new LotelRpcError({ message: `${operation}: ${cause}` });

const handlers = TelemetryTools.toLayer(
  Effect.gen(function* () {
    const traces = yield* Traces;
    const store = yield* TelemetryStore;
    return {
      lotel_traces: ({ limit }) =>
        traces.list(limit).pipe(
          Effect.map(({ items }) => ({ traces: items.map(compactSummary) })),
          Effect.mapError(toToolError),
        ),
      lotel_trace: ({ traceId }) =>
        traces.get(traceId).pipe(
          Effect.map(({ spans, logs }) => compactTrace(traceId, spans, logs)),
          Effect.catchTag('TelemetryStoreError', (error) =>
            Effect.fail(toToolError(error)),
          ),
        ),
      lotel_logs: ({ limit }) =>
        store.listLogs({ '<': null }, limit ?? RECENT_LOGS).pipe(
          Effect.map(({ items }) => ({ logs: items.map(compactLog) })),
          Effect.mapError(toToolError),
        ),
    };
  }),
);

export const telemetryTools = McpServer.toolkit(TelemetryTools).pipe(
  Layer.provide(handlers),
);
