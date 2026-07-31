export type OtelStatus = 'success' | 'error' | 'running' | 'unset';

export interface OtelEvent {
  readonly name: string;
  readonly timestamp: number;
  readonly attributes: Readonly<Record<string, unknown>>;
}

/**
 * Structurally compatible with `CapturedSpan` from `@pkishorez/lotel/trace`, so
 * spans recorded from a live Effect program render without translation.
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
