import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  BatchWriteResultSchema,
  ClearTelemetryResultSchema,
  ListPayloadSchema,
  LogListSchema,
  LotelRpcError,
  NewLogRecordSchema,
  SpanEntitySchema,
  SpanListSchema,
  TraceDetailsSchema,
  TraceNotFound,
} from '../../domain/telemetry-schema/index.js';
import { Schema } from 'effect';

export const makeLotelRpc = () =>
  RpcGroup.make(
    Rpc.make('SaveSpans', {
      payload: {
        records: Schema.Array(SpanEntitySchema.schema),
      },
      success: BatchWriteResultSchema,
      error: LotelRpcError,
    }),
    Rpc.make('InsertLogs', {
      payload: {
        records: Schema.Array(NewLogRecordSchema),
      },
      success: BatchWriteResultSchema,
      error: LotelRpcError,
    }),
    Rpc.make('ListSpans', {
      payload: ListPayloadSchema,
      success: SpanListSchema,
      error: LotelRpcError,
    }),
    Rpc.make('ListLogs', {
      payload: ListPayloadSchema,
      success: LogListSchema,
      error: LotelRpcError,
    }),
    Rpc.make('GetTrace', {
      payload: { traceId: Schema.String },
      success: TraceDetailsSchema,
      error: Schema.Union([TraceNotFound, LotelRpcError]),
    }),
    Rpc.make('ClearTelemetry', {
      payload: {},
      success: ClearTelemetryResultSchema,
      error: LotelRpcError,
    }),
  );
