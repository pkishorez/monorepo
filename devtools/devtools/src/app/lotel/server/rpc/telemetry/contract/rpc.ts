import { Rpc, RpcGroup } from 'effect/rpc';
import {
  BatchWriteResultSchema,
  ClearTelemetryResultSchema,
  ListPayloadSchema,
  ListTracesPayloadSchema,
  LogListSchema,
  LotelRpcError,
  NewLogRecordSchema,
  NewSpanRecordSchema,
  SpanListSchema,
  TraceDetailsSchema,
  TraceNotFound,
  TraceSummaryListSchema,
} from './telemetry-schema.js';
import { Schema } from 'effect';

/*
 * What the Lotel Tool and the DevTools Server say to each other, served at
 * `/rpc/lotel`: write Span Records and Log Records, read them back page by
 * page after an Update Cursor, read Traces, and clear everything.
 */

const makeTelemetryRpc = () =>
  RpcGroup.make(
    Rpc.make('SaveSpans', {
      payload: {
        records: Schema.Array(NewSpanRecordSchema),
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
    Rpc.make('ListTraces', {
      payload: ListTracesPayloadSchema,
      success: TraceSummaryListSchema,
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

export const TelemetryRpc = makeTelemetryRpc();

/** Where the DevTools Server serves the Telemetry RPC. */
export const TELEMETRY_RPC_PATH = '/rpc/lotel';
