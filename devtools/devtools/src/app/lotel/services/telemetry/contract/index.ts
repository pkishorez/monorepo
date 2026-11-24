import { Context } from 'effect';
import type { Effect, Stream } from 'effect';
import type { RpcClientError } from 'effect/rpc';
import type { LotelRpcError } from '../../../server/rpc/telemetry/contract/index.js';

/*
 * The telemetry the Lotel Tool shows, from the DevTools Server it talks to:
 * every Span the server keeps, each with the Log Records that name it, live;
 * and clearing all of it.
 */

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

/**
 * Structurally compatible with `CapturedSpan` from
 * `@kestack/effect-tracer/recorder`, so spans recorded from a live Effect
 * program render without translation.
 */
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

/** The Spans known now, and whether the first page has arrived yet. */
export interface Live {
  readonly ready: boolean;
  readonly spans: ReadonlyArray<OtelSpan>;
}

export type TelemetryError = LotelRpcError | RpcClientError.RpcClientError;

export interface TelemetryService {
  /** Every known Span, joined with its Log Records: now, then after every change. */
  readonly live: Stream.Stream<Live>;
  /** Deletes all telemetry on the server, and answers how many records went. */
  readonly clear: Effect.Effect<number, TelemetryError>;
}

export class Telemetry extends Context.Service<Telemetry, TelemetryService>()(
  'Lotel/service/Telemetry',
) {}
