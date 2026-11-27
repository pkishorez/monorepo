import { Context } from 'effect';
import type { Effect, Stream } from 'effect';
import type { RpcClientError } from 'effect/rpc';
import type { LotelRpcError } from '../../../server/rpc/telemetry/contract/index.js';

export type OtelStatus =
  | 'success'
  | 'error'
  | 'interrupted'
  | 'running'
  | 'unset';

export interface OtelEvent {
  readonly name: string;
  readonly timestamp: number;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface OtelSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  readonly startTime: number;
  readonly endTime: number | null;
  readonly status: OtelStatus;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly events: readonly OtelEvent[];
}

export interface Live {
  readonly ready: boolean;
  readonly spans: ReadonlyArray<OtelSpan>;
}

export type TelemetryError = LotelRpcError | RpcClientError.RpcClientError;

export interface TelemetryService {
  readonly live: Stream.Stream<Live>;
  readonly clear: Effect.Effect<number, TelemetryError>;
}

export class Telemetry extends Context.Service<Telemetry, TelemetryService>()(
  'Lotel/service/Telemetry',
) {}
