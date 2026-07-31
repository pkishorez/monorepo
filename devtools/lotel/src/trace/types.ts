/**
 * Trace shapes captured from a running Effect program.
 *
 * These mirror the OTel span model closely enough that a `CapturedSpan` can be
 * handed straight to a viewer that speaks OTel, while staying independent of
 * the OTLP wire format in `../domain/otel-proto`.
 */

export type TraceValue =
  | string
  | number
  | boolean
  | null
  | readonly TraceValue[]
  | { readonly [key: string]: TraceValue };

export type TraceLogLevel =
  | 'Fatal'
  | 'Error'
  | 'Warn'
  | 'Info'
  | 'Debug'
  | 'Trace';

/** A span status. `running` means the span never ended - see {@link CapturedSpan.endTime}. */
export type CapturedSpanStatus = 'success' | 'error' | 'running' | 'unset';

export interface CapturedEvent {
  readonly name: string;
  readonly timestamp: number;
  readonly attributes: Readonly<Record<string, TraceValue>>;
}

export interface CapturedLog {
  readonly spanId: string | null;
  readonly timestamp: number;
  readonly level: TraceLogLevel;
  readonly message: TraceValue;
  readonly annotations: Readonly<Record<string, TraceValue>>;
}

export interface CapturedSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  /** Milliseconds since the epoch. */
  readonly startTime: number;
  /** Milliseconds since the epoch, or `null` while the span is still running. */
  readonly endTime: number | null;
  readonly status: CapturedSpanStatus;
  readonly attributes: Readonly<Record<string, TraceValue>>;
  readonly events: readonly CapturedEvent[];
}

export interface CapturedTrace {
  readonly spans: readonly CapturedSpan[];
  readonly logs: readonly CapturedLog[];
  /** `true` when the span limit was reached and later spans were dropped. */
  readonly truncated: boolean;
}
