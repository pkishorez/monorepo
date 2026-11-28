export {
  BatchWriteResultSchema,
  ClearTelemetryResultSchema,
  ListPayloadSchema,
  ListTracesPayloadSchema,
  LogEntitySchema,
  LogListSchema,
  LotelRpcError,
  NewLogRecordSchema,
  NewSpanRecordSchema,
  SpanEntitySchema,
  SpanListSchema,
  TraceDetailsSchema,
  TraceNotFound,
  TraceSummaryListSchema,
  TraceSummarySchema,
  UpdateCursorSchema,
} from './telemetry-schema.js';
export { TELEMETRY_RPC_PATH, TelemetryRpc } from './rpc.js';

export type {
  LogRecord,
  NewLogRecord,
  NewSpanRecord,
  SpanRecord,
  TraceSummary,
  UpdateCursor,
} from './telemetry-schema.js';
