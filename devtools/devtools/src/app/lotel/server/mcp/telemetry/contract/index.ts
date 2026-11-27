import { Schema } from 'effect';
import { Tool, Toolkit } from 'effect/ai';
import {
  LotelRpcError,
  TraceNotFound,
} from '../../../rpc/telemetry/contract/index.js';

const Limit = Schema.optionalKey(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 })),
);

const Result = Schema.Record(Schema.String, Schema.Unknown);

export const TelemetryTools = Toolkit.make(
  Tool.make('lotel_traces', {
    description:
      'The most recent Traces, newest first, each summed up; open one with lotel_trace.',
    parameters: Schema.Struct({ limit: Limit }),
    success: Result,
    failure: LotelRpcError,
  }),
  Tool.make('lotel_trace', {
    description:
      "One Trace's spans and logs in time order, their times in ms from the Trace's start.",
    parameters: Schema.Struct({ traceId: Schema.String }),
    success: Result,
    failure: Schema.Union([TraceNotFound, LotelRpcError]),
  }),
  Tool.make('lotel_logs', {
    description: 'The most recent logs from every process, newest first.',
    parameters: Schema.Struct({ limit: Limit }),
    success: Result,
    failure: LotelRpcError,
  }),
);
