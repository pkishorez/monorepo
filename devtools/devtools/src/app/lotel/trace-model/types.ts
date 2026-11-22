import { Schema } from 'effect';

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

/**
 * A list of Spans as an Actor's Model or Message holds it. The Spans were
 * checked once, against the Lotel RPC's Schemas, as they arrived from the
 * DevTools Server; checking every one again on each Update would make a
 * keystroke cost as much as the whole Trace list, so only the list is.
 * Each Span is plain JSON, so a saved History keeps it as it is.
 */
export const SpansSchema = Schema.declare(
  (input): input is ReadonlyArray<OtelSpan> => Array.isArray(input),
  { identifier: 'Spans' },
);
